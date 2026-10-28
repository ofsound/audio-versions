import Foundation
import Testing

@testable import AudioVersions

@MainActor
struct PersistentMiniPlayerTests {
    @Test
    func metadataRefreshPreservesPlayingAndPausedTracksAndPlaylistQueue() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let versions = store.songs.flatMap(\.versions)
        let first = try #require(versions.first)
        let second = try #require(versions.dropFirst().first)
        let playlist = try #require(store.createPlaylist(named: "Queue", audioFileIDs: [first.id, second.id]))
        store.play(version: first, in: playlist)
        store.seek(to: 12, in: first, preservePlaylistQueue: true)

        store.replaceLibrary(with: store.songs, playlists: store.playlists, preservingPlayback: true)
        #expect(store.activeVersionID == first.id)
        #expect(store.isPlaying)
        #expect(store.currentTime == 12)
        #expect(store.isPlaylistActive(playlist.id))

        store.togglePlayback(for: first, preservePlaylistQueue: true)
        store.replaceLibrary(with: store.songs, playlists: store.playlists, preservingPlayback: true)
        #expect(!store.isPlaying)
        #expect(store.currentTime == 12)
        store.playNextPlaylistVersion()
        #expect(store.activeVersionID == second.id)
        #expect(store.isPlaying)

        store.replaceLibrary(with: [])
        #expect(store.activeVersionID == nil)
        #expect(!store.isPlaying)
        #expect(!store.isPlaylistActive(playlist.id))
    }

    @Test
    func metadataRefreshDropsRemovedQueueWithoutStoppingItsTrack() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let version = try #require(store.songs.first?.versions.first)
        let playlist = try #require(store.createPlaylist(named: "Queue", audioFileIDs: [version.id]))
        store.play(version: version, in: playlist)
        store.replaceLibrary(with: store.songs, playlists: [], preservingPlayback: true)
        #expect(store.activeVersionID == version.id)
        #expect(store.isPlaying)
        #expect(!store.isPlaylistActive(playlist.id))
        store.replaceLibrary(with: [])
    }

    @Test
    func playlistControlsOnlyRepresentTheCurrentQueue() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let version = try #require(store.songs.first?.versions.first)
        let first = try #require(store.createPlaylist(named: "First", audioFileIDs: [version.id]))
        let second = try #require(store.createPlaylist(named: "Second", audioFileIDs: [version.id]))
        store.open(version: version, at: 12, autoplay: true)
        #expect(!store.isPlaylistActive(first.id))
        #expect(!store.isPlaylistActive(second.id))
        store.play(version: version, in: first)
        #expect(store.isPlaylistActive(first.id))
        #expect(!store.isPlaylistActive(second.id))
        store.play(version: version, in: second)
        #expect(!store.isPlaylistActive(first.id))
        #expect(store.isPlaylistActive(second.id))
    }

    @Test
    func navigationKeepsTheActiveTrackAndReturnsToItsFullPlayer() throws {
        let store = ReviewCompanionStore()
        let song = try #require(store.songs.first)
        let version = try #require(song.versions.first)
        #expect(store.activePlaybackVersion == nil)
        #expect(store.activePlaybackSong == nil)

        store.open(version: version, at: 12, autoplay: true)
        store.navigationPath = []
        store.selectedLibraryTab = .playlists
        #expect(store.activePlaybackSong?.id == song.id)
        #expect(store.activePlaybackVersion?.id == version.id)
        #expect(store.isPlaying)
        #expect(store.currentTime == 12)

        store.showCurrentPlayer()
        #expect(store.selectedLibraryTab == .songs)
        #expect(store.navigationPath == [
            .song(id: song.id),
            .version(songID: song.id, versionID: version.id, target: nil)
        ])
        #expect(store.isPlaying)
        #expect(store.currentTime == 12)

        store.replaceLibrary(with: [])
        #expect(store.activePlaybackVersion == nil)
        #expect(store.activePlaybackSong == nil)
    }

    @Test
    func miniPlayerControlsAndOpeningTheFullPlayerPreserveThePlaylistQueue() throws {
        let store = ReviewCompanionStore(songs: FixtureLibrary.songs, playlists: [])
        let versions = store.songs.flatMap(\.versions)
        let first = try #require(versions.first)
        let second = try #require(versions.dropFirst().first)
        let playlist = try #require(store.createPlaylist(named: "Queue", audioFileIDs: [first.id, second.id]))

        store.play(version: first, in: playlist)
        store.togglePlayback(for: first, preservePlaylistQueue: true)
        #expect(!store.isPlaying)
        store.togglePlayback(for: first, preservePlaylistQueue: true)
        #expect(store.isPlaying)
        store.selectedLibraryTab = .trash
        store.showCurrentPlayer()
        store.preparePlayback(for: first)
        #expect(store.isPlaying)
        store.seek(to: 20, in: first, preservePlaylistQueue: true)
        store.skip(by: 10, in: first, preservePlaylistQueue: true)
        #expect(store.currentTime == 30)
        store.togglePlayback(for: first, preservePlaylistQueue: true)
        #expect(!store.isPlaying)
        store.togglePlayback(for: first, preservePlaylistQueue: true)
        #expect(store.isPlaylistActive(playlist.id))
        store.playNextPlaylistVersion()
        #expect(store.activeVersionID == second.id)
        #expect(store.isPlaying)
    }
}
