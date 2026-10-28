import Foundation
import Testing

@testable import AudioVersions

@MainActor
struct OfflineLibraryTests {
    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
    }

    private func snapshot() -> CloudLibrarySnapshot {
        CloudLibrarySnapshot(songs: FixtureLibrary.songs, trashedSongs: [], playlists: [])
    }

    private func write(
        operation: PendingAnnotationWrite.Operation = .insert,
        annotation: ReviewAnnotation? = nil, token: String? = nil
    ) -> PendingAnnotationWrite {
        let song = FixtureLibrary.songs[0]
        return PendingAnnotationWrite(
            id: UUID(), operation: operation, songID: song.id, versionID: song.versions[0].id,
            annotation: annotation ?? ReviewAnnotation(
                id: UUID().uuidString.lowercased(), kind: .point, startTime: 10,
                detail: "Bring the vocal forward", authorName: "You", updatedAt: .now
            ), expectedUpdatedAtToken: token
        )
    }

    @Test
    func metadataRefreshDoesNotCancelCloudPlaybackPreparation() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let userID = UUID()
        let storage = try OfflineLibraryStorage(userID: userID, root: root)
        var state = storage.state
        state.snapshot = snapshot()
        try storage.save(state)
        let environment = ReviewCloudEnvironment(configuration: CloudConfiguration(
            supabaseURL: URL(string: "http://127.0.0.1:1")!,
            supabasePublishableKey: "offline-test-publishable-key",
            apiBaseURL: URL(string: "http://127.0.0.1:1")!
        ))
        let store = ReviewCompanionStore(songs: [])
        store.configureCloud(library: environment.library, signedMedia: environment.signedMedia,
                             userID: userID, storageRoot: root)
        let version = try #require(store.songs.first?.versions.first)
        store.preparePlayback(for: version)
        #expect(store.isPreparingPlayback)

        store.replaceLibrary(with: store.songs, playlists: store.playlists, preservingPlayback: true)
        #expect(store.activeVersionID == version.id)
        #expect(store.isPreparingPlayback)
        #expect(store.isPlaybackLoading)

        store.useFixtureLibrary()
        #expect(!store.isPreparingPlayback)
        #expect(store.activeVersionID == nil)
    }

    @Test
    func storeRestoresOfflineLibraryAndPersistsEditsBeforeNetworking() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = UUID()
        let storage = try OfflineLibraryStorage(userID: id, root: root)
        var initial = storage.state
        initial.snapshot = snapshot()
        try storage.save(initial)
        let environment = ReviewCloudEnvironment(configuration: CloudConfiguration(
            supabaseURL: URL(string: "http://127.0.0.1:1")!,
            supabasePublishableKey: "offline-test-publishable-key",
            apiBaseURL: URL(string: "http://127.0.0.1:1")!
        ))
        let store = ReviewCompanionStore(songs: [])
        store.configureCloud(library: environment.library, signedMedia: environment.signedMedia,
                             userID: id, storageRoot: root)
        #expect(store.songs == initial.snapshot.songs)
        #expect(store.isUsingCachedLibrary)
        let pending = write()
        store.save(pending.annotation, in: pending.versionID)
        var edited = pending.annotation
        edited.detail = "Edit before sync completes"
        store.save(edited, in: pending.versionID)
        let restored = try OfflineLibraryStorage(userID: id, root: root)
        #expect(restored.state.pendingWrites.count == 2)
        #expect(restored.state.pendingWrites[0].operation == .insert)
        #expect(restored.state.pendingWrites[1].operation == .update)
        #expect(restored.state.snapshot.songs[0].versions[0].annotations.first {
            $0.id == edited.id
        }?.detail == edited.detail)
        store.delete(edited, from: pending.versionID)
        let deleted = try OfflineLibraryStorage(userID: id, root: root)
        #expect(deleted.state.pendingWrites.last?.operation == .delete)
        #expect(store.version(id: pending.versionID)?.annotations.contains { $0.id == edited.id } == false)
        store.useFixtureLibrary()
        #expect(!FileManager.default.fileExists(atPath: storage.directory.path))
        #expect(store.pendingAnnotationWrites.isEmpty)
        #expect(!store.isCloudConfigured)
    }

    @Test
    func automaticallyQueuesMissingAudioWithoutPlayingAndPreservesExistingDownloads() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let userID = UUID()
        let storage = try OfflineLibraryStorage(userID: userID, root: root)
        var state = storage.state
        state.snapshot = snapshot()
        try storage.save(state)
        let cachedID = state.snapshot.songs[0].versions[0].id
        let source = root.appending(path: "cached.mp3")
        try Data(repeating: 42, count: 128).write(to: source)
        try storage.storeDownload(from: source, versionID: cachedID)
        let environment = ReviewCloudEnvironment(configuration: CloudConfiguration(
            supabaseURL: URL(string: "http://127.0.0.1:1")!,
            supabasePublishableKey: "offline-test-publishable-key",
            apiBaseURL: URL(string: "http://127.0.0.1:1")!
        ))
        let store = ReviewCompanionStore(songs: [])
        store.configureCloud(library: environment.library, signedMedia: environment.signedMedia,
                             userID: userID, storageRoot: root)
        store.synchronizeAnnotations()
        #expect(store.activeVersionID == nil)
        #expect(store.downloadingVersionIDs.count == 2)
        #expect(!store.downloadingVersionIDs.contains(cachedID))
        #expect(store.downloadedVersionIDs.contains(cachedID))
        // A user's explicit removal takes precedence over automatic caching this session.
        store.removeDownload(versionID: cachedID)
        store.synchronizeAnnotations()
        #expect(!store.downloadingVersionIDs.contains(cachedID))
        store.useFixtureLibrary()
        #expect(store.downloadingVersionIDs.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: storage.directory.path))
    }

    @Test
    func downloadedAudioAndMetadataSurviveRelaunchAndTemporaryFileDeletion() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let userID = UUID()
        let storage = try OfflineLibraryStorage(userID: userID, root: root)
        var state = storage.state
        state.snapshot = snapshot()
        try storage.save(state)
        let source = root.appending(path: "source.m4a")
        let audio = Data(repeating: 42, count: 4_096)
        try audio.write(to: source)
        let versionID = state.snapshot.songs[0].versions[0].id
        try storage.storeDownload(from: source, versionID: versionID)
        try FileManager.default.removeItem(at: source)

        let restored = try OfflineLibraryStorage(userID: userID, root: root)
        let url = try #require(restored.mediaURL(for: versionID))
        #expect(try Data(contentsOf: url) == audio)
        #expect(restored.state.snapshot.songs == state.snapshot.songs)
        #expect(restored.state.downloads[versionID]?.byteCount == 4_096)
        #expect(try restored.directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        // Simulator filesystems do not report hardware Data Protection attributes.
        #if !targetEnvironment(simulator)
        let protection = try FileManager.default.attributesOfItem(atPath: url.path)[.protectionKey] as? FileProtectionType
        #expect(protection == .completeUntilFirstUserAuthentication)
        #endif
    }

    @Test
    func accountsAreIsolatedAndSignOutErasesOnlyTheActiveAccount() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let firstID = UUID()
        let secondID = UUID()
        let first = try OfflineLibraryStorage(userID: firstID, root: root)
        let second = try OfflineLibraryStorage(userID: secondID, root: root)
        var next = first.state
        next.snapshot = snapshot()
        next.pendingWrites = [write()]
        try first.save(next)
        #expect(second.state.snapshot.songs.isEmpty)
        #expect(second.state.pendingWrites.isEmpty)
        try first.erase()
        #expect(!FileManager.default.fileExists(atPath: first.directory.path))
        #expect(FileManager.default.fileExists(atPath: second.directory.path))
        #expect(try OfflineLibraryStorage(userID: firstID, root: root).state.pendingWrites.isEmpty)
    }

    @Test
    func truncatedOrMissingDownloadsAreNeverShownAsAvailable() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let storage = try OfflineLibraryStorage(userID: UUID(), root: root)
        let source = root.appending(path: "source.wav")
        try Data([1, 2, 3]).write(to: source)
        try storage.storeDownload(from: source, versionID: "version")
        let saved = try #require(storage.mediaURL(for: "version"))
        try Data([1]).write(to: saved)
        #expect(storage.mediaURL(for: "version") == nil)
        try storage.removeDownload(versionID: "version")
        #expect(storage.state.downloads.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: saved.path))
    }

    @Test
    func damagedMetadataIsNotSilentlyReplaced() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = UUID()
        let storage = try OfflineLibraryStorage(userID: id, root: root)
        let url = storage.directory.appending(path: "library.json")
        let damaged = Data("damaged queued work".utf8)
        try damaged.write(to: url)
        #expect(throws: (any Error).self) { try OfflineLibraryStorage(userID: id, root: root) }
        #expect(try Data(contentsOf: url) == damaged)
    }

    @Test
    func queuedInsertEditAndDeletePersistAndOverlayRefreshInOrder() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let userID = UUID()
        let storage = try OfflineLibraryStorage(userID: userID, root: root)
        let insert = write()
        var edited = insert.annotation
        edited.detail = "Less reverb"
        let update = write(operation: .update, annotation: edited)
        var state = storage.state
        state.pendingWrites = [insert, update]
        state.merge(snapshot())
        try storage.save(state)
        let restored = try OfflineLibraryStorage(userID: userID, root: root)
        var merged = restored.state
        merged.merge(snapshot())
        #expect(merged.snapshot.songs[0].versions[0].annotations.first { $0.id == edited.id }?.detail == "Less reverb")
        let deletion = write(operation: .delete, annotation: edited)
        merged.pendingWrites.append(deletion)
        merged.merge(snapshot())
        #expect(!merged.snapshot.songs[0].versions[0].annotations.contains { $0.id == edited.id })
        #expect(merged.pendingWrites.count == 3)
    }

    @Test
    func acknowledgmentsChainTokensWithoutLosingEditsMadeDuringRequest() {
        let insert = write()
        var annotation = insert.annotation
        annotation.detail = "Updated while inserting"
        let edit = write(operation: .update, annotation: annotation)
        let deletion = write(operation: .delete, annotation: annotation)
        var state = OfflineLibraryState()
        state.pendingWrites = [insert, edit, deletion]
        state.merge(snapshot())
        state.acknowledge(insert, token: "server-token-1")
        #expect(state.pendingWrites.count == 2)
        #expect(state.pendingWrites[0].expectedUpdatedAtToken == "server-token-1")
        #expect(state.pendingWrites[0].annotation.detail == annotation.detail)
        state.acknowledge(state.pendingWrites[0], token: "server-token-2")
        #expect(state.pendingWrites[0].expectedUpdatedAtToken == "server-token-2")
        #expect(state.pendingWrites[0].operation == .delete)
        #expect(!state.snapshot.songs[0].versions[0].annotations.contains { $0.id == annotation.id })
    }

    @Test
    func replayRecognizesAlreadyAppliedWriteButRejectsConcurrentCloudEdit() throws {
        let versionID = UUID().uuidString.lowercased()
        let annotation = ReviewAnnotation(
            id: UUID().uuidString.lowercased(), kind: .range, startTime: 2, endTime: 8,
            detail: "Check this transition", authorName: "You", updatedAt: .now
        )
        let pending = PendingAnnotationWrite(
            id: UUID(), operation: .insert, songID: UUID().uuidString, versionID: versionID,
            annotation: annotation
        )
        var json: [String: Any] = [
            "id": annotation.id, "audio_file_id": versionID, "type": "range",
            "start_ms": 2000, "end_ms": 8000,
            "detail": try JSONSerialization.jsonObject(with: JSONEncoder().encode(RichTextDocument.plainText(annotation.detail))),
            "color": "var(--color-marker-range)", "updated_at": CloudTimestamp.format(annotation.updatedAt)
        ]
        func decode() throws -> AnnotationSyncRow {
            try JSONDecoder().decode(AnnotationSyncRow.self, from: JSONSerialization.data(withJSONObject: json))
        }
        #expect(try decode().matches(pending))
        json["start_ms"] = 3000
        #expect(try !decode().matches(pending))
        json["start_ms"] = 2000
        json["deleted_at"] = CloudTimestamp.format(.now)
        #expect(try !decode().matches(pending))
    }
}
