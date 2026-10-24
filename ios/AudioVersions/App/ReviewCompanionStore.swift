import Combine
import Foundation

@MainActor
final class ReviewCompanionStore: ObservableObject {
    @Published private(set) var songs: [Song]
    @Published private(set) var trashedSongs: [Song]
    @Published private(set) var playlists: [Playlist]
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
    @Published var playlistLoopMode: PlaylistLoopMode = .off

    private var cloudLibrary: CloudLibraryService?
    private var signedMedia: SignedMediaURLProvider?
    private let audioEngine = NativeAudioEngine()
    private let playbackFileLoader = PlaybackFileLoader()
    private var cancellables: Set<AnyCancellable> = []
    private var playbackTask: Task<Void, Never>?
    private var playbackPreparationTask: Task<Void, Never>?
    private var playbackLoadGeneration = 0
    private var hasAttemptedPlaybackRecovery = false
    private var activePlaylistID: String?

    init(songs: [Song] = FixtureLibrary.songs, playlists: [Playlist]? = nil) {
        self.songs = songs
        trashedSongs = []
        if let playlists {
            self.playlists = playlists
        } else {
            let versionIDs = songs.flatMap(\.versions).prefix(4).map(\.id)
            self.playlists = versionIDs.isEmpty ? [] : [
                Playlist(
                    id: UUID().uuidString.lowercased(),
                    name: "Listening Queue",
                    audioFileIDs: Array(versionIDs),
                    sortOrder: 0,
                    createdAt: .now,
                    updatedAt: .now
                )
            ]
        }
        audioEngine.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
        audioEngine.onPlaybackFailure = { [weak self] context in
            self?.recoverPlayback(after: context)
        }
        audioEngine.onPlaybackEnded = { [weak self] track in
            guard self?.activeVersionID == track.id else { return }
            self?.handlePlaylistPlaybackEnded()
        }
        audioEngine.onNextTrack = { [weak self] in
            self?.playAdjacentPlaylistVersion(direction: 1)
        }
        audioEngine.onPreviousTrack = { [weak self] in
            self?.playPreviousPlaylistVersion()
        }
    }

    var currentTime: TimeInterval {
        signedMedia == nil ? fixtureCurrentTime : audioEngine.currentTime
    }

    var isPlaying: Bool {
        signedMedia == nil ? fixtureIsPlaying : audioEngine.state.hasPlaybackIntent
    }

    var isPlaybackLoading: Bool {
        signedMedia != nil && (isPreparingPlayback || audioEngine.state == .preparing)
    }

    var playbackStatusText: String? {
        guard isPlaybackLoading else { return nil }
        return "Loading audio…"
    }

    func isPlaybackReady(for version: AudioVersion) -> Bool {
        signedMedia == nil || (
            playbackErrorMessage == nil
                && !isPlaybackLoading
                && audioEngine.isReadyForControl(trackID: version.id)
        )
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
            replaceLibrary(with: [], playlists: [])
        }
    }

    func refreshCloudLibrary() async {
        guard let cloudLibrary else { return }
        isCloudLoading = true
        cloudErrorMessage = nil
        defer { isCloudLoading = false }

        do {
            let snapshot = try await cloudLibrary.fetchActiveSnapshot()
            replaceLibrary(
                with: snapshot.songs,
                trashedSongs: snapshot.trashedSongs,
                playlists: snapshot.playlists
            )
            let cutoff = Date.now.addingTimeInterval(-30 * 24 * 60 * 60)
            for song in snapshot.trashedSongs where (song.deletedAt ?? .distantFuture) <= cutoff {
                permanentlyDeleteSong(song)
            }
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
        let fixtureSongs = FixtureLibrary.songs
        let versionIDs = fixtureSongs.flatMap(\.versions).prefix(4).map(\.id)
        let fixturePlaylists = versionIDs.isEmpty ? [] : [
            Playlist(
                id: UUID().uuidString.lowercased(),
                name: "Listening Queue",
                audioFileIDs: Array(versionIDs),
                sortOrder: 0,
                createdAt: .now,
                updatedAt: .now
            )
        ]
        replaceLibrary(with: fixtureSongs, playlists: fixturePlaylists)
        navigationPath = []
    }

    func replaceLibrary(
        with songs: [Song],
        trashedSongs: [Song] = [],
        playlists: [Playlist] = []
    ) {
        stopPlayback()
        activeVersionID = nil
        fixtureCurrentTime = 0
        self.songs = songs
        self.trashedSongs = trashedSongs
        self.playlists = playlists
        activePlaylistID = nil
        audioEngine.setQueueControlsEnabled(false)
    }

    func trashSong(_ song: Song) {
        guard let index = songs.firstIndex(where: { $0.id == song.id }) else { return }
        var trashedSong = songs.remove(at: index)
        trashedSong.deletedAt = .now
        trashedSong.updatedAt = .now
        trashedSongs.insert(trashedSong, at: 0)
        if trashedSong.versions.contains(where: { $0.id == activeVersionID }) {
            stopPlayback()
            navigationPath = []
        }

        guard let cloudLibrary else { return }
        Task {
            do {
                try await cloudLibrary.trashSong(id: song.id)
            } catch {
                trashedSongs.removeAll { $0.id == song.id }
                songs.insert(song, at: min(index, songs.count))
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func restoreSong(_ song: Song) {
        guard let index = trashedSongs.firstIndex(where: { $0.id == song.id }) else { return }
        var restoredSong = trashedSongs.remove(at: index)
        restoredSong.deletedAt = nil
        restoredSong.updatedAt = .now
        songs.insert(restoredSong, at: 0)

        guard let cloudLibrary else { return }
        Task {
            do {
                try await cloudLibrary.restoreSong(id: song.id)
            } catch {
                songs.removeAll { $0.id == song.id }
                trashedSongs.insert(song, at: min(index, trashedSongs.count))
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func permanentlyDeleteSong(_ song: Song) {
        guard let index = trashedSongs.firstIndex(where: { $0.id == song.id }) else { return }
        trashedSongs.remove(at: index)

        guard let cloudLibrary else { return }
        Task {
            do {
                if let signedMedia {
                    for version in song.versions {
                        try await signedMedia.deleteMedia(audioFileID: version.id)
                    }
                }
                try await cloudLibrary.permanentlyDeleteSong(id: song.id)
            } catch {
                trashedSongs.insert(song, at: min(index, trashedSongs.count))
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func emptyTrash() {
        for song in trashedSongs {
            permanentlyDeleteSong(song)
        }
    }

    func version(id: String) -> AudioVersion? {
        songs.lazy.flatMap(\.versions).first { $0.id == id }
    }

    func activate(version: AudioVersion, preservePlaylistQueue: Bool = false) {
        if !preservePlaylistQueue {
            activePlaylistID = nil
            audioEngine.setQueueControlsEnabled(false)
        }
        guard activeVersionID != version.id else { return }
        stopPlayback()
        activeVersionID = version.id
        fixtureCurrentTime = 0
        playbackErrorMessage = nil
        hasAttemptedPlaybackRecovery = false
    }

    func togglePlayback(for version: AudioVersion, preservePlaylistQueue: Bool = false) {
        guard signedMedia != nil else {
            toggleFixturePlayback(for: version, preservePlaylistQueue: preservePlaylistQueue)
            return
        }

        Task {
            await toggleCloudPlayback(for: version, preservePlaylistQueue: preservePlaylistQueue)
        }
    }

    private func toggleFixturePlayback(
        for version: AudioVersion,
        preservePlaylistQueue: Bool
    ) {
        activate(version: version, preservePlaylistQueue: preservePlaylistQueue)
        fixtureIsPlaying.toggle()

        if fixtureIsPlaying {
            beginFixturePlayback(for: version.id)
        } else {
            playbackTask?.cancel()
        }
    }

    func seek(
        to time: TimeInterval,
        in version: AudioVersion,
        preservePlaylistQueue: Bool = false
    ) {
        activate(version: version, preservePlaylistQueue: preservePlaylistQueue)
        let clampedTime = PlaybackTimeline.clamp(time, duration: version.duration)
        if signedMedia == nil {
            fixtureCurrentTime = clampedTime
        } else {
            audioEngine.seek(to: clampedTime)
        }
    }

    func open(
        version: AudioVersion,
        at time: TimeInterval,
        autoplay: Bool,
        preservePlaylistQueue: Bool = false
    ) {
        activate(version: version, preservePlaylistQueue: preservePlaylistQueue)
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

    /// Downloads the complete track and prepares the local player when the
    /// player screen appears, without starting playback.
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

    @discardableResult
    func createPlaylist(named value: String, audioFileIDs: [String] = []) -> Playlist? {
        let name = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        let now = Date.now
        let playlist = Playlist(
            id: UUID().uuidString.lowercased(),
            name: name,
            audioFileIDs: audioFileIDs.reduce(into: []) { result, id in
                if !result.contains(id) {
                    result.append(id)
                }
            },
            sortOrder: (playlists.map(\.sortOrder).max() ?? -1) + 1,
            createdAt: now,
            updatedAt: now
        )
        playlists.append(playlist)
        guard let cloudLibrary else { return playlist }
        Task {
            do {
                try await cloudLibrary.insertPlaylist(playlist)
            } catch {
                playlists.removeAll { $0.id == playlist.id }
                cloudErrorMessage = error.localizedDescription
            }
        }
        return playlist
    }

    func renamePlaylist(id: String, name value: String) {
        let name = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        updatePlaylist(id: id) { $0.name = name }
    }

    func addVersion(_ versionID: String, toPlaylist playlistID: String) {
        updatePlaylist(id: playlistID) { playlist in
            guard !playlist.audioFileIDs.contains(versionID) else { return }
            playlist.audioFileIDs.append(versionID)
        }
    }

    func removeVersion(_ versionID: String, fromPlaylist playlistID: String) {
        updatePlaylist(id: playlistID) { playlist in
            playlist.audioFileIDs.removeAll { $0 == versionID }
        }
    }

    func setPlaylistVersionOrder(playlistID: String, audioFileIDs: [String]) {
        updatePlaylist(id: playlistID) { playlist in
            playlist.audioFileIDs = audioFileIDs.reduce(into: []) { result, id in
                if !result.contains(id) {
                    result.append(id)
                }
            }
        }
    }

    func reorderPlaylists(fromOffsets: IndexSet, toOffset: Int) {
        var reordered = playlists.sorted {
            $0.sortOrder == $1.sortOrder
                ? $0.createdAt < $1.createdAt
                : $0.sortOrder < $1.sortOrder
        }
        reordered.move(fromOffsets: fromOffsets, toOffset: toOffset)
        let previous = playlists
        let now = Date.now
        reordered = reordered.enumerated().map { index, playlist in
            var playlist = playlist
            playlist.sortOrder = index
            playlist.updatedAt = now
            return playlist
        }
        playlists = reordered
        guard let cloudLibrary else { return }
        Task {
            do {
                for playlist in reordered {
                    try await cloudLibrary.updatePlaylist(playlist)
                }
            } catch {
                playlists = previous
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func deletePlaylist(id: String) {
        guard let playlist = playlists.first(where: { $0.id == id }) else { return }
        playlists.removeAll { $0.id == id }
        if activePlaylistID == id {
            stopPlayback()
            activePlaylistID = nil
        }
        guard let cloudLibrary else { return }
        Task {
            do {
                try await cloudLibrary.tombstonePlaylist(id: id)
            } catch {
                playlists.append(playlist)
                playlists.sort { $0.sortOrder < $1.sortOrder }
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    func togglePlaylistPlayback(version: AudioVersion, playlist: Playlist) {
        if activePlaylistID == playlist.id, activeVersionID == version.id {
            togglePlayback(for: version, preservePlaylistQueue: true)
        } else {
            play(version: version, in: playlist)
        }
    }

    func play(version: AudioVersion, in playlist: Playlist) {
        activate(version: version)
        activePlaylistID = playlist.id
        audioEngine.setQueueControlsEnabled(true)
        open(
            version: version,
            at: 0,
            autoplay: true,
            preservePlaylistQueue: true
        )
    }

    func playNextPlaylistVersion() {
        playAdjacentPlaylistVersion(direction: 1)
    }

    func playPreviousPlaylistVersion() {
        guard currentTime <= 3 else {
            if let activeVersionID, let version = version(id: activeVersionID) {
                seek(to: 0, in: version, preservePlaylistQueue: true)
            }
            return
        }
        playAdjacentPlaylistVersion(direction: -1)
    }

    private func updatePlaylist(id: String, mutation: (inout Playlist) -> Void) {
        guard let index = playlists.firstIndex(where: { $0.id == id }) else { return }
        let previous = playlists[index]
        mutation(&playlists[index])
        guard playlists[index] != previous else { return }
        playlists[index].updatedAt = .now
        let updated = playlists[index]
        guard let cloudLibrary else { return }
        Task {
            do {
                try await cloudLibrary.updatePlaylist(updated)
            } catch {
                if let currentIndex = playlists.firstIndex(where: { $0.id == id }),
                   playlists[currentIndex].updatedAt == updated.updatedAt {
                    playlists[currentIndex] = previous
                }
                cloudErrorMessage = error.localizedDescription
            }
        }
    }

    private func handlePlaylistPlaybackEnded() {
        guard activePlaylistID != nil else { return }
        if playlistLoopMode == .one,
           let activeVersionID,
           let version = version(id: activeVersionID),
           let playlist = playlists.first(where: { $0.id == self.activePlaylistID }) {
            play(version: version, in: playlist)
        } else {
            playAdjacentPlaylistVersion(direction: 1, fromEndedTrack: true)
        }
    }

    private func playAdjacentPlaylistVersion(direction: Int, fromEndedTrack: Bool = false) {
        guard
            let activePlaylistID,
            let playlist = playlists.first(where: { $0.id == activePlaylistID })
        else { return }
        let availableIDs = playlist.audioFileIDs.filter { version(id: $0) != nil }
        guard !availableIDs.isEmpty else { return }
        let currentIndex = activeVersionID.flatMap { availableIDs.firstIndex(of: $0) } ?? 0
        var targetIndex = currentIndex + direction
        if !availableIDs.indices.contains(targetIndex) {
            guard playlistLoopMode == .all else {
                if fromEndedTrack {
                    stopPlayback()
                }
                return
            }
            targetIndex = targetIndex < 0 ? availableIDs.count - 1 : 0
        }
        guard let target = version(id: availableIDs[targetIndex]) else { return }
        play(version: target, in: playlist)
    }

    private func toggleCloudPlayback(
        for version: AudioVersion,
        preservePlaylistQueue: Bool
    ) async {
        activate(version: version, preservePlaylistQueue: preservePlaylistQueue)

        if audioEngine.isLoaded(trackID: version.id) {
            if isPlaying {
                audioEngine.pause()
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
            var downloadedFileURL: URL?
            do {
                if invalidateLease {
                    await signedMedia.invalidate(audioFileID: version.id)
                }
                let lease = try await signedMedia.signedLease(for: version.id)
                let fileURL = try await self?.playbackFileLoader.download(from: lease.url)
                downloadedFileURL = fileURL
                try Task.checkCancellation()
                guard
                    let self,
                    let fileURL,
                    generation == self.playbackLoadGeneration,
                    self.activeVersionID == version.id
                else {
                    if let downloadedFileURL {
                        try? FileManager.default.removeItem(at: downloadedFileURL)
                    }
                    return
                }

                self.audioEngine.load(
                    track: self.playbackTrack(for: version),
                    url: fileURL,
                    deleteFileWhenStopped: true,
                    autoplay: autoplay,
                    startTime: startTime
                )
                downloadedFileURL = nil
                self.isPreparingPlayback = false
            } catch is CancellationError {
                if let downloadedFileURL {
                    try? FileManager.default.removeItem(at: downloadedFileURL)
                }
                return
            } catch {
                if let downloadedFileURL {
                    try? FileManager.default.removeItem(at: downloadedFileURL)
                }
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
                    if self.activePlaylistID == nil {
                        self.stopPlayback()
                    } else {
                        self.fixtureIsPlaying = false
                        self.handlePlaylistPlaybackEnded()
                    }
                    return
                }
            }
        }
    }

    private func stopPlayback() {
        fixtureIsPlaying = false
        playbackPreparationTask?.cancel()
        playbackPreparationTask = nil
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
