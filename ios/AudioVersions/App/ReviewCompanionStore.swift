import AVFoundation
import Combine
import Foundation

@MainActor
final class ReviewCompanionStore: ObservableObject {
    @Published private(set) var songs: [Song]
    @Published var activeVersionID: String?
    @Published var currentTime: TimeInterval = 0
    @Published var isPlaying = false
    @Published var playbackRate: Double = 1 {
        didSet {
            guard isPlaying, let player else { return }
            player.rate = Float(playbackRate)
        }
    }
    @Published private(set) var isCloudLoading = false
    @Published private(set) var isPreparingPlayback = false
    @Published var cloudErrorMessage: String?

    private var cloudLibrary: CloudLibraryService?
    private var signedMedia: SignedMediaURLProvider?
    private var player: AVPlayer?
    private var playerTimeObserver: Any?
    private var playbackTask: Task<Void, Never>?

    init(songs: [Song] = FixtureLibrary.songs) {
        self.songs = songs
    }

    var isCloudConfigured: Bool {
        cloudLibrary != nil
    }

    func configureCloud(
        library: CloudLibraryService,
        signedMedia: SignedMediaURLProvider
    ) {
        cloudLibrary = library
        self.signedMedia = signedMedia
    }

    func refreshCloudLibrary() async {
        guard let cloudLibrary else { return }
        isCloudLoading = true
        cloudErrorMessage = nil
        defer { isCloudLoading = false }

        do {
            let snapshot = try await cloudLibrary.fetchActiveSnapshot()
            replaceLibrary(with: snapshot.songs)
        } catch {
            cloudErrorMessage = error.localizedDescription
        }
    }

    func useFixtureLibrary() {
        cloudLibrary = nil
        signedMedia = nil
        replaceLibrary(with: FixtureLibrary.songs)
    }

    func replaceLibrary(with songs: [Song]) {
        stopPlayback()
        removePlayer()
        activeVersionID = nil
        currentTime = 0
        self.songs = songs
    }

    func version(id: String) -> AudioVersion? {
        songs.lazy.flatMap(\.versions).first { $0.id == id }
    }

    func activate(version: AudioVersion) {
        guard activeVersionID != version.id else { return }
        stopPlayback()
        removePlayer()
        activeVersionID = version.id
        currentTime = 0
    }

    func togglePlayback(for version: AudioVersion) {
        guard signedMedia != nil else {
            toggleFixturePlayback(for: version)
            return
        }

        Task {
            await toggleCloudPlayback(for: version)
        }
    }

    private func toggleFixturePlayback(for version: AudioVersion) {
        activate(version: version)
        isPlaying.toggle()

        if isPlaying {
            beginFixturePlayback(for: version.id)
        } else {
            playbackTask?.cancel()
        }
    }

    func seek(to time: TimeInterval, in version: AudioVersion) {
        activate(version: version)
        currentTime = min(max(0, time), version.duration)
        player?.seek(
            to: CMTime(seconds: currentTime, preferredTimescale: 1_000),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
    }

    func skip(by delta: TimeInterval, in version: AudioVersion) {
        seek(to: currentTime + delta, in: version)
    }

    func save(_ annotation: ReviewAnnotation, in versionID: String) {
        let previous = version(id: versionID)?.annotations.first {
            $0.id == annotation.id
        }
        updateVersion(id: versionID) { version in
            if let index = version.annotations.firstIndex(where: { $0.id == annotation.id }) {
                version.annotations[index] = annotation
            } else {
                version.annotations.append(annotation)
            }
            version.annotations.sort { $0.startTime < $1.startTime }
        }

        guard
            let cloudLibrary,
            let songID = songID(containingVersion: versionID)
        else { return }

        Task {
            do {
                if let previous {
                    guard let expectedUpdatedAtToken = previous.cloudUpdatedAtToken else {
                        throw CloudDataError.conflict
                    }
                    let updatedAtToken = try await cloudLibrary.updateAnnotation(
                        annotation,
                        expectedUpdatedAtToken: expectedUpdatedAtToken
                    )
                    setCloudUpdatedAtToken(
                        updatedAtToken,
                        annotationID: annotation.id,
                        versionID: versionID
                    )
                } else {
                    let updatedAtToken = try await cloudLibrary.insertAnnotation(
                        annotation,
                        songID: songID,
                        audioFileID: versionID
                    )
                    setCloudUpdatedAtToken(
                        updatedAtToken,
                        annotationID: annotation.id,
                        versionID: versionID
                    )
                }
            } catch {
                if let previous {
                    updateVersion(id: versionID) { version in
                        if let index = version.annotations.firstIndex(where: {
                            $0.id == previous.id
                        }) {
                            version.annotations[index] = previous
                        }
                    }
                } else {
                    updateVersion(id: versionID) { version in
                        version.annotations.removeAll { $0.id == annotation.id }
                    }
                }
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func delete(_ annotation: ReviewAnnotation, from versionID: String) {
        updateVersion(id: versionID) { version in
            version.annotations.removeAll { $0.id == annotation.id }
        }

        guard let cloudLibrary else { return }
        Task {
            do {
                guard let expectedUpdatedAtToken = annotation.cloudUpdatedAtToken else {
                    throw CloudDataError.conflict
                }
                _ = try await cloudLibrary.tombstoneAnnotation(
                    id: annotation.id,
                    expectedUpdatedAtToken: expectedUpdatedAtToken
                )
            } catch {
                updateVersion(id: versionID) { version in
                    version.annotations.append(annotation)
                    version.annotations.sort { $0.startTime < $1.startTime }
                }
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func clearCloudError() {
        cloudErrorMessage = nil
    }

    private func toggleCloudPlayback(for version: AudioVersion) async {
        activate(version: version)

        if let player {
            if isPlaying {
                player.pause()
                isPlaying = false
            } else {
                player.playImmediately(atRate: Float(playbackRate))
                isPlaying = true
            }
            return
        }

        guard let signedMedia else { return }
        isPreparingPlayback = true
        cloudErrorMessage = nil
        defer { isPreparingPlayback = false }

        do {
            let url = try await signedMedia.signedURL(for: version.id)
            guard activeVersionID == version.id else { return }
            let player = AVPlayer(url: url)
            self.player = player
            installTimeObserver(on: player, duration: version.duration)
            player.playImmediately(atRate: Float(playbackRate))
            isPlaying = true
        } catch {
            cloudErrorMessage = error.localizedDescription
        }
    }

    private func installTimeObserver(on player: AVPlayer, duration: TimeInterval) {
        removeTimeObserver()
        playerTimeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 1_000),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let seconds = time.seconds
                guard seconds.isFinite else { return }
                currentTime = min(max(0, seconds), duration)
                if currentTime >= duration, isPlaying {
                    stopPlayback()
                }
            }
        }
    }

    private func removeTimeObserver() {
        guard let playerTimeObserver else { return }
        player?.removeTimeObserver(playerTimeObserver)
        self.playerTimeObserver = nil
    }

    private func removePlayer() {
        removeTimeObserver()
        player?.pause()
        player = nil
    }

    private func beginFixturePlayback(for versionID: String) {
        playbackTask?.cancel()
        playbackTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard
                    let self,
                    self.isPlaying,
                    self.activeVersionID == versionID,
                    let version = self.version(id: versionID)
                else { return }

                self.currentTime += 0.25 * self.playbackRate
                if self.currentTime >= version.duration {
                    self.currentTime = version.duration
                    self.stopPlayback()
                    return
                }
            }
        }
    }

    private func stopPlayback() {
        isPlaying = false
        player?.pause()
        playbackTask?.cancel()
        playbackTask = nil
    }

    private func songID(containingVersion versionID: String) -> String? {
        songs.first { song in
            song.versions.contains { $0.id == versionID }
        }?.id
    }

    private func setCloudUpdatedAtToken(
        _ token: String,
        annotationID: String,
        versionID: String
    ) {
        updateVersion(id: versionID) { version in
            guard let index = version.annotations.firstIndex(where: {
                $0.id == annotationID
            }) else { return }
            version.annotations[index].cloudUpdatedAtToken = token
        }
    }

    private func updateVersion(id: String, mutation: (inout AudioVersion) -> Void) {
        for songIndex in songs.indices {
            guard let versionIndex = songs[songIndex].versions.firstIndex(where: { $0.id == id }) else {
                continue
            }
            mutation(&songs[songIndex].versions[versionIndex])
            songs[songIndex].updatedAt = .now
            return
        }
    }
}
