import Foundation
import Testing
@testable import AudioVersions

@MainActor
struct SongPreviewTests {
    @Test func previewSelectsStarredVersionThenNewest() throws {
        var song = try #require(FixtureLibrary.songs.first { $0.versions.count > 1 })
        let oldest = try #require(song.versions.min { $0.createdAt < $1.createdAt })
        #expect(song.previewVersion == song.latestVersion)
        song.starredAudioFileID = oldest.id
        #expect(song.previewVersion == oldest)
        song.starredAudioFileID = "removed-file"
        #expect(song.previewVersion == song.latestVersion)
        song.versions = []
        #expect(song.previewVersion == nil)
    }

    @Test func versionRowsFollowPlaybackAcrossScreensAndPreviewControls() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let song = try #require(store.songs.first { $0.versions.count > 1 })
        let preview = try #require(song.previewVersion)
        let other = try #require(song.versions.first { $0.id != preview.id })

        store.toggleSongPreview(for: song)
        store.seek(to: 12, in: preview)
        store.navigationPath = [.song(id: song.id)]
        #expect(store.isPreviewing(preview))
        #expect(!store.isPreviewing(other))
        #expect(store.currentTime == 12)

        store.togglePreview(for: preview)
        #expect(!store.isPreviewing(preview))
        #expect(!store.isPlaying)
        #expect(store.activeVersionID == nil)
        #expect(store.navigationPath == [.song(id: song.id)])

        store.togglePreview(for: other)
        #expect(store.isPreviewing(other))
        #expect(!store.isPreviewing(preview))
        #expect(store.currentTime == 0)
        store.showCurrentPlayer()
        store.togglePlayback(for: other)
        #expect(!store.isPreviewing(other))
        store.togglePlayback(for: other)
        #expect(store.isPreviewing(other))
        store.navigationPath = []
        #expect(store.isPreviewing(other))

        store.toggleSongPreview(for: song)
        #expect(store.isPreviewing(preview))
        #expect(!store.isPreviewing(other))
        store.replaceLibrary(with: [])
    }

    @Test func cloudStarSurvivesMappingAndCacheRoundTrip() throws {
        let json = #"{"id":"11111111-1111-4111-8111-111111111111","title":"Song","artist":"","general_notes":"","audio_file_order":[],"starred_audio_file_id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA","updated_at":"2026-10-28T12:00:00Z"}"#
        let row = try JSONDecoder().decode(SongRow.self, from: Data(json.utf8))
        let snapshot = try CloudLibraryService.mapSnapshot(songRows: [row], audioFileRows: [], annotationRows: [])
        let song = try #require(snapshot.songs.first)
        #expect(song.starredAudioFileID == "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        let cached = try JSONDecoder().decode(Song.self, from: JSONEncoder().encode(song))
        #expect(cached.starredAudioFileID == song.starredAudioFileID)
        var legacy = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(song)) as? [String: Any])
        legacy.removeValue(forKey: "starredAudioFileID")
        #expect(try JSONDecoder().decode(Song.self, from: JSONSerialization.data(withJSONObject: legacy)).starredAudioFileID == nil)
    }

    @Test func previewStartsStopsAndSwitchesWithoutNavigatingOrKeepingPlaylistQueue() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let song = try #require(store.songs.first)
        let version = try #require(song.previewVersion)
        let otherSong = try #require(store.songs.dropFirst().first)
        let playlist = try #require(store.createPlaylist(named: "Queue", audioFileIDs: [version.id]))
        store.play(version: version, in: playlist)
        store.togglePlayback(for: version, preservePlaylistQueue: true)
        store.seek(to: 12, in: version, preservePlaylistQueue: true)

        store.toggleSongPreview(for: song)
        #expect(store.activeVersionID == version.id)
        #expect(store.isPlaying)
        #expect(store.currentTime == 0)
        #expect(!store.isPlaylistActive(playlist.id))
        #expect(store.navigationPath.isEmpty)

        store.toggleSongPreview(for: song)
        #expect(!store.isPlaying)
        #expect(store.activeVersionID == nil)
        store.toggleSongPreview(for: song)
        store.toggleSongPreview(for: otherSong)
        #expect(store.activeVersionID == otherSong.previewVersion?.id)
        #expect(store.isPlaying)
        #expect(store.navigationPath.isEmpty)
        store.replaceLibrary(with: [])
    }

    @Test func toggleStarredAudioFileChoosesTheIndexPreview() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs)
        let song = try #require(store.songs.first { $0.versions.count > 1 })
        let oldest = try #require(song.versions.min { $0.createdAt < $1.createdAt })
        let newest = try #require(song.latestVersion)
        #expect(oldest.id != newest.id)

        store.toggleStarredAudioFile(songID: song.id, audioFileID: oldest.id)
        #expect(store.songs.first { $0.id == song.id }?.starredAudioFileID == oldest.id)
        #expect(store.songs.first { $0.id == song.id }?.previewVersion?.id == oldest.id)

        store.toggleStarredAudioFile(songID: song.id, audioFileID: newest.id)
        #expect(store.songs.first { $0.id == song.id }?.starredAudioFileID == newest.id)
        store.toggleStarredAudioFile(songID: song.id, audioFileID: newest.id)
        #expect(store.songs.first { $0.id == song.id }?.starredAudioFileID == nil)
        #expect(store.songs.first { $0.id == song.id }?.previewVersion?.id == newest.id)

        store.toggleStarredAudioFile(songID: song.id, audioFileID: "missing")
        #expect(store.songs.first { $0.id == song.id }?.starredAudioFileID == nil)
    }

    @Test func starredPreviewStaysLocalUntilTheCloudWriteFinishes() throws {
        var song = try #require(FixtureLibrary.songs.first { $0.versions.count > 1 })
        let oldest = try #require(song.versions.min { $0.createdAt < $1.createdAt })
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID()
        let storage = try OfflineLibraryStorage(userID: account, root: root)
        var state = storage.state
        state.snapshot = CloudLibrarySnapshot(songs: [song], trashedSongs: [], playlists: [])
        try storage.save(state)
        let environment = ReviewCloudEnvironment(configuration: CloudConfiguration(
            supabaseURL: URL(string: "http://127.0.0.1:1")!,
            supabasePublishableKey: "offline-test-publishable-key",
            apiBaseURL: URL(string: "http://127.0.0.1:1")!
        ))
        let store = ReviewCompanionStore(songs: [])
        store.configureCloud(
            library: environment.library,
            signedMedia: environment.signedMedia,
            userID: account,
            storageRoot: root
        )
        store.toggleStarredAudioFile(songID: song.id, audioFileID: oldest.id)
        let restored = try OfflineLibraryStorage(userID: account, root: root)
        #expect(restored.state.snapshot.songs[0].starredAudioFileID == oldest.id)
        #expect(restored.state.pendingSongStars?.count == 1)
        #expect(restored.state.pendingSongStars?.first?.starredAudioFileID == oldest.id)
        var refreshed = restored.state
        song.starredAudioFileID = nil
        refreshed.merge(CloudLibrarySnapshot(songs: [song], trashedSongs: [], playlists: []))
        #expect(refreshed.snapshot.songs[0].starredAudioFileID == oldest.id)
        store.useFixtureLibrary()
    }

    @Test func starUpdateWritesTheSharedColumnAndClearsIt() throws {
        let id = try #require(UUID(uuidString: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))
        let starred = SongStarUpdate(
            starredAudioFileID: id.uuidString.lowercased(),
            updatedAt: "2026-10-28T12:00:00.000Z"
        )
        let starredJSON = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(starred)) as? [String: Any]
        )
        #expect(starredJSON["starred_audio_file_id"] as? String == id.uuidString.lowercased())
        #expect(starredJSON["updated_at"] as? String == "2026-10-28T12:00:00.000Z")

        let cleared = SongStarUpdate(starredAudioFileID: nil, updatedAt: "2026-10-28T12:00:00.000Z")
        let clearedJSON = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(cleared)) as? [String: Any]
        )
        #expect(clearedJSON["starred_audio_file_id"] is NSNull)
        #expect(clearedJSON["updated_at"] as? String == "2026-10-28T12:00:00.000Z")
    }
}
