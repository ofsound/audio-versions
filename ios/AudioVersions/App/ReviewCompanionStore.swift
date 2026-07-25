import Combine
import Foundation

@MainActor
final class ReviewCompanionStore: ObservableObject {
    @Published private(set) var songs: [Song]
    @Published var navigationPath: [LibraryDestination] = []
    @Published var activeVersionID: String?
    @Published var playbackRate: Double = 1 {
        didSet {
            audioEngine.setPlaybackRate(playbackRate)
        }
    }
    @Published private(set) var isCloudLoading = false
    @Published private(set) var isPreparingPlayback = false
    @Published var cloudErrorMessage: String?
    @Published private(set) var playbackErrorMessage: String?
    @Published private var fixtureCurrentTime: TimeInterval = 0
    @Published private var fixtureIsPlaying = false

    private var cloudLibrary: CloudLibraryService?
    private var signedMedia: SignedMediaURLProvider?
    private let audioEngine = NativeAudioEngine()
    private var cancellables: Set<AnyCancellable> = []
    private var playbackTask: Task<Void, Never>?
    private var playbackPreparationTask: Task<Void, Never>?
    private var leaseRenewalTask: Task<Void, Never>?
    private var playbackLoadGeneration = 0
    private var hasAttemptedPlaybackRecovery = false
    private var playbackLeaseExpiresAt: Date?

    init(songs: [Song] = FixtureLibrary.songs) {
        self.songs = songs
        audioEngine.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
        audioEngine.onPlaybackFailure = { [weak self] context in
            self?.recoverPlayback(after: context)
        }
    }

    var currentTime: TimeInterval {
        signedMedia == nil ? fixtureCurrentTime : audioEngine.currentTime
    }

    var isPlaying: Bool {
        signedMedia == nil ? fixtureIsPlaying : audioEngine.state.isPlayingOrWaiting
    }

    var playbackStatusText: String? {
        if isPreparingPlayback {
            return hasAttemptedPlaybackRecovery ? "Reconnecting audio…" : "Loading audio…"
        }
        return signedMedia == nil ? nil : audioEngine.state.statusText
    }

    var outputRouteName: String {
        audioEngine.outputRouteName
    }

    var isCloudConfigured: Bool {
        cloudLibrary != nil
    }

    func configureCloud(
        library: CloudLibraryService,
        signedMedia: SignedMediaURLProvider
    ) {
        let isNewCloudSession = cloudLibrary !== library
        cloudLibrary = library
        self.signedMedia = signedMedia
        if isNewCloudSession {
            replaceLibrary(with: [])
        }
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
        let previousSignedMedia = signedMedia
        playbackPreparationTask?.cancel()
        Task { await previousSignedMedia?.invalidateAll() }
        cloudLibrary = nil
        signedMedia = nil
        replaceLibrary(with: FixtureLibrary.songs)
        navigationPath = []
    }

    func replaceLibrary(with songs: [Song]) {
        stopPlayback()
        activeVersionID = nil
        fixtureCurrentTime = 0
        self.songs = songs
    }

    func version(id: String) -> AudioVersion? {
        songs.lazy.flatMap(\.versions).first { $0.id == id }
    }

    func activate(version: AudioVersion) {
        guard activeVersionID != version.id else { return }
        stopPlayback()
        activeVersionID = version.id
        fixtureCurrentTime = 0
        playbackErrorMessage = nil
        hasAttemptedPlaybackRecovery = false
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
        fixtureIsPlaying.toggle()

        if fixtureIsPlaying {
            beginFixturePlayback(for: version.id)
        } else {
            playbackTask?.cancel()
        }
    }

    func seek(to time: TimeInterval, in version: AudioVersion) {
        activate(version: version)
        let clampedTime = PlaybackTimeline.clamp(time, duration: version.duration)
        if signedMedia == nil {
            fixtureCurrentTime = clampedTime
        } else {
            audioEngine.seek(to: clampedTime)
        }
    }

    func open(version: AudioVersion, at time: TimeInterval, autoplay: Bool) {
        activate(version: version)
        let clampedTime = PlaybackTimeline.clamp(time, duration: version.duration)

        guard signedMedia != nil else {
            fixtureCurrentTime = clampedTime
            if autoplay {
                fixtureIsPlaying = true
                beginFixturePlayback(for: version.id)
            }
            return
        }

        if audioEngine.isLoaded(trackID: version.id) {
            audioEngine.seek(to: clampedTime)
            if autoplay {
                audioEngine.play()
            }
            return
        }

        beginCloudPlaybackPreparation(
            for: version,
            startTime: clampedTime,
            invalidateLease: false,
            autoplay: autoplay
        )
    }

    /// Fetches the signed media lease and buffers the track when the player
    /// screen appears, without starting playback.
    func preparePlayback(for version: AudioVersion) {
        activate(version: version)

        guard signedMedia != nil else { return }

        if audioEngine.isLoaded(trackID: version.id) {
            return
        }

        if isPreparingPlayback, activeVersionID == version.id {
            return
        }

        beginCloudPlaybackPreparation(
            for: version,
            startTime: currentTime,
            invalidateLease: false,
            autoplay: false
        )
    }

    func openSongLink(_ target: SongLinkTarget) {
        var nextPath: [LibraryDestination] = [.song(id: target.songID)]
        let versionID = target.fileID ?? songs
            .first(where: { $0.id == target.songID })?
            .versions
            .first(where: { version in
                version.annotations.contains { $0.id == target.annotationID }
            })?
            .id

        if let versionID {
            nextPath.append(
                .version(
                    songID: target.songID,
                    versionID: versionID,
                    target: target
                )
            )
        }

        navigationPath = nextPath
    }

    func openSongLink(_ url: URL) {
        guard let target = SongLinkTarget(url: url) else { return }
        openSongLink(target)
    }

    func skip(by delta: TimeInterval, in version: AudioVersion) {
        seek(to: currentTime + delta, in: version)
    }

    func saveSongJournal(_ journal: String, songID: String) {
        guard let songIndex = songs.firstIndex(where: { $0.id == songID }) else { return }
        let previousJournal = songs[songIndex].generalNotes
        let previousUpdatedAt = songs[songIndex].updatedAt
        songs[songIndex].generalNotes = journal
        songs[songIndex].updatedAt = .now

        guard let cloudLibrary else { return }
        Task {
            do {
                _ = try await cloudLibrary.updateSongJournal(journal, songID: songID)
            } catch {
                if let currentIndex = songs.firstIndex(where: { $0.id == songID }),
                   songs[currentIndex].generalNotes == journal {
                    songs[currentIndex].generalNotes = previousJournal
                    songs[currentIndex].updatedAt = previousUpdatedAt
                }
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func appendSongJournalEntry(_ entry: String, songID: String, at date: Date = .now) {
        let trimmed = entry.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let song = songs.first(where: { $0.id == songID })
        else {
            return
        }

        saveSongJournal(
            SongJournalEntry.appending(trimmed, to: song.generalNotes, at: date),
            songID: songID
        )
    }

    func saveAudioFileNotes(_ notes: String, audioFileID: String) {
        guard let previousNotes = version(id: audioFileID)?.notes else { return }
        updateVersion(id: audioFileID) { version in
            version.notes = notes
        }

        guard let cloudLibrary else { return }
        Task {
            do {
                _ = try await cloudLibrary.updateAudioFileNotes(
                    notes,
                    audioFileID: audioFileID
                )
            } catch {
                if version(id: audioFileID)?.notes == notes {
                    updateVersion(id: audioFileID) { version in
                        version.notes = previousNotes
                    }
                }
                cloudErrorMessage = error.localizedDescription
            }
        }
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

        if audioEngine.isLoaded(trackID: version.id) {
            if isPlaying {
                audioEngine.pause()
                return
            }
            if (playbackLeaseExpiresAt ?? .distantPast) <= .now.addingTimeInterval(5 * 60) {
                beginCloudPlaybackPreparation(
                    for: version,
                    startTime: currentTime,
                    invalidateLease: true,
                    autoplay: true
                )
                return
            }
            audioEngine.togglePlayback()
            return
        }

        beginCloudPlaybackPreparation(
            for: version,
            startTime: 0,
            invalidateLease: false,
            autoplay: true
        )
    }

    func retryPlayback(for version: AudioVersion) {
        playbackErrorMessage = nil
        hasAttemptedPlaybackRecovery = false
        beginCloudPlaybackPreparation(
            for: version,
            startTime: currentTime,
            invalidateLease: true,
            autoplay: true
        )
    }

    private func beginCloudPlaybackPreparation(
        for version: AudioVersion,
        startTime: TimeInterval,
        invalidateLease: Bool,
        autoplay: Bool
    ) {
        guard let signedMedia else { return }
        playbackPreparationTask?.cancel()
        playbackLoadGeneration += 1
        let generation = playbackLoadGeneration
        isPreparingPlayback = true
        playbackErrorMessage = nil

        playbackPreparationTask = Task { [weak self] in
            do {
                if invalidateLease {
                    await signedMedia.invalidate(audioFileID: version.id)
                }
                let lease = try await signedMedia.signedLease(for: version.id)
                try Task.checkCancellation()
                guard
                    let self,
                    generation == self.playbackLoadGeneration,
                    self.activeVersionID == version.id
                else { return }

                self.audioEngine.load(
                    track: self.playbackTrack(for: version),
                    url: lease.url,
                    autoplay: autoplay,
                    startTime: startTime
                )
                self.playbackLeaseExpiresAt = lease.expiresAt
                self.scheduleLeaseRenewal(for: version, expiresAt: lease.expiresAt)
                self.isPreparingPlayback = false
            } catch is CancellationError {
                return
            } catch {
                guard let self, generation == self.playbackLoadGeneration else { return }
                self.isPreparingPlayback = false
                self.playbackErrorMessage = error.localizedDescription
            }
        }
    }

    private func recoverPlayback(after context: PlaybackFailureContext) {
        guard
            !hasAttemptedPlaybackRecovery,
            let version = version(id: context.track.id),
            activeVersionID == version.id
        else {
            playbackErrorMessage = context.message
            return
        }
        hasAttemptedPlaybackRecovery = true
        beginCloudPlaybackPreparation(
            for: version,
            startTime: context.resumeTime,
            invalidateLease: true,
            autoplay: context.shouldResume
        )
    }

    private func beginFixturePlayback(for versionID: String) {
        playbackTask?.cancel()
        playbackTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard
                    let self,
                    self.fixtureIsPlaying,
                    self.activeVersionID == versionID,
                    let version = self.version(id: versionID)
                else { return }

                self.fixtureCurrentTime += 0.25 * self.playbackRate
                if self.fixtureCurrentTime >= version.duration {
                    self.fixtureCurrentTime = version.duration
                    self.stopPlayback()
                    return
                }
            }
        }
    }

    private func stopPlayback() {
        fixtureIsPlaying = false
        playbackPreparationTask?.cancel()
        playbackPreparationTask = nil
        leaseRenewalTask?.cancel()
        leaseRenewalTask = nil
        playbackLeaseExpiresAt = nil
        playbackLoadGeneration += 1
        isPreparingPlayback = false
        audioEngine.stop()
        playbackTask?.cancel()
        playbackTask = nil
    }

    private func playbackTrack(for version: AudioVersion) -> PlaybackTrack {
        let song = songs.first { song in
            song.versions.contains { $0.id == version.id }
        }
        return PlaybackTrack(
            id: version.id,
            title: song?.title ?? version.name,
            artist: song?.artist ?? "Audio Versions",
            versionName: version.name,
            duration: version.duration
        )
    }

    private func scheduleLeaseRenewal(for version: AudioVersion, expiresAt: Date) {
        leaseRenewalTask?.cancel()
        let renewalDelay = max(0, expiresAt.timeIntervalSinceNow - (5 * 60))
        leaseRenewalTask = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(for: .seconds(renewalDelay))
            } catch {
                return
            }
            guard
                let self,
                self.activeVersionID == version.id,
                self.isPlaying
            else { return }
            self.beginCloudPlaybackPreparation(
                for: version,
                startTime: self.currentTime,
                invalidateLease: true,
                autoplay: true
            )
        }
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
