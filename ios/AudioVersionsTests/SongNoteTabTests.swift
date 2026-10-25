import Foundation
import Testing
@testable import AudioVersions

@MainActor
struct SongNoteTabTests {
    private var song: Song {
        var song = FixtureLibrary.songs[0]
        song.generalNotes = "Current primary notes"
        song.noteTabs = [SongNoteTab(id: "song-notes", name: "Mixing", content: "Stale duplicate"),
                         SongNoteTab(id: "master", name: "Mastering", content: "Old limiter")]
        return song
    }
    private func edit(_ source: SongNoteTab, content: String) -> PendingNoteWrite {
        var next = source; next.content = content
        return PendingNoteWrite(id: UUID(), songID: song.id, operation: .update, tab: next, expected: source)
    }
    @Test func legacyPrimaryAndNamedTabsKeepTheSameTextContract() throws {
        var legacy = song; legacy.noteTabs = nil
        #expect(legacy.resolvedNoteTabs.count == 1)
        #expect(legacy.resolvedNoteTabs[0].id == SongNoteTab.legacyID)
        #expect(song.resolvedNoteTabs[0].content == "Current primary notes")
        let data = try JSONEncoder().encode(song)
        #expect(try JSONDecoder().decode(Song.self, from: data).resolvedNoteTabs == song.resolvedNoteTabs)
        let old = #"{"snapshot":{"songs":[],"trashedSongs":[],"playlists":[]},"downloads":{},"pendingWrites":[]}"#.data(using: .utf8)!
        #expect(try JSONDecoder().decode(OfflineLibraryState.self, from: old).pendingNoteWrites == nil)
    }
    @Test func offlineContentEditsPreserveRemoteRenamesAndOtherTabs() throws {
        let tab = song.resolvedNoteTabs[1]
        let write = edit(tab, content: "New limiter")
        var remote = song
        remote.noteTabs?[1].name = "Final master"
        remote.generalNotes = "New mix notes from desktop"
        let updated = try write.applying(to: remote, checkingConflicts: true)
        #expect(updated.resolvedNoteTabs[1].name == "Final master")
        #expect(updated.resolvedNoteTabs[1].content == "New limiter")
        #expect(updated.generalNotes == "New mix notes from desktop")
        #expect(try write.applying(to: updated, checkingConflicts: true).resolvedNoteTabs == updated.resolvedNoteTabs)
        remote.noteTabs?[1].content = "A competing change"
        #expect(throws: NoteTabError.self) { try write.applying(to: remote, checkingConflicts: true) }
    }
    @Test func createRenameAndDeleteAreReplayableAndProtectTheLastTab() throws {
        let tab = SongNoteTab(id: "record", name: "Recording", content: "")
        let create = PendingNoteWrite(id: UUID(), songID: song.id, operation: .create, tab: tab, expected: nil)
        let created = try create.applying(to: song, checkingConflicts: true)
        #expect(try create.applying(to: created, checkingConflicts: true).resolvedNoteTabs.count == 3)
        let deletion = PendingNoteWrite(id: UUID(), songID: song.id, operation: .delete, tab: tab, expected: tab)
        let deleted = try deletion.applying(to: created, checkingConflicts: true)
        #expect(try deletion.applying(to: deleted, checkingConflicts: true).resolvedNoteTabs == song.resolvedNoteTabs)
        var only = song; only.noteTabs = nil
        let primary = only.resolvedNoteTabs[0]
        let last = PendingNoteWrite(id: UUID(), songID: only.id, operation: .delete, tab: primary, expected: primary)
        #expect(throws: NoteTabError.self) { try last.applying(to: only, checkingConflicts: true) }
    }
    @Test func queuedTabsSurviveRelaunchAndOverlayCloudRefresh() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID(), storage = try OfflineLibraryStorage(userID: account, root: root)
        let write = edit(song.resolvedNoteTabs[1], content: "Keep this offline edit")
        var state = storage.state
        state.snapshot = CloudLibrarySnapshot(songs: [song], trashedSongs: [], playlists: [])
        state.pendingNoteWrites = [write]; state.apply(write)
        try storage.save(state)
        let restored = try OfflineLibraryStorage(userID: account, root: root)
        #expect(restored.state.pendingNoteWrites?.count == 1)
        var refreshed = restored.state
        refreshed.merge(CloudLibrarySnapshot(songs: [song], trashedSongs: [], playlists: []))
        #expect(refreshed.snapshot.songs[0].resolvedNoteTabs[1].content == "Keep this offline edit")
        #expect(refreshed.snapshot.songs[0].generalNotes == song.generalNotes)
    }
    @Test func storePersistsNamedTabEditsBeforeNetworking() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID(), storage = try OfflineLibraryStorage(userID: account, root: root)
        var state = storage.state
        state.snapshot = CloudLibrarySnapshot(songs: [song], trashedSongs: [], playlists: [])
        try storage.save(state)
        let environment = ReviewCloudEnvironment(configuration: CloudConfiguration(
            supabaseURL: URL(string: "http://127.0.0.1:1")!, supabasePublishableKey: "offline-test-publishable-key",
            apiBaseURL: URL(string: "http://127.0.0.1:1")!))
        let store = ReviewCompanionStore(songs: [])
        store.configureCloud(library: environment.library, signedMedia: environment.signedMedia, userID: account, storageRoot: root)
        store.saveSongJournal("Phone master notes", songID: song.id, tabID: "master")
        store.renameNoteTab(songID: song.id, tabID: "master", name: "Final")
        let id = try #require(store.createNoteTab(songID: song.id, name: "Recording"))
        #expect(store.appendSongJournalEntry("Offline car check", songID: song.id, tabID: "master"))
        let restored = try OfflineLibraryStorage(userID: account, root: root)
        #expect(restored.state.pendingNoteWrites?.count == 4)
        #expect(restored.state.snapshot.songs[0].resolvedNoteTabs.first { $0.id == "master" }?.content.hasSuffix("Offline car check") == true)
        #expect(restored.state.snapshot.songs[0].resolvedNoteTabs.first { $0.id == "master" }?.name == "Final")
        #expect(restored.state.snapshot.songs[0].resolvedNoteTabs.contains { $0.id == id } == true)
        store.useFixtureLibrary()
        #expect(store.pendingNoteWrites.isEmpty)
    }
    @Test func remembersEachSongsDestinationAndFallsBackWhenItIsRemoved() throws {
        let other = Song(id: "other-song", title: song.title, artist: song.artist, generalNotes: song.generalNotes, noteTabs: song.noteTabs, updatedAt: song.updatedAt, versions: [])
        let store = ReviewCompanionStore(songs: [song, other])
        #expect(store.preferredNoteTab(songID: song.id)?.id == "song-notes")
        store.selectNoteTab(songID: song.id, tabID: "master")
        #expect(store.preferredNoteTab(songID: song.id)?.id == "master")
        #expect(store.preferredNoteTab(songID: other.id)?.id == "song-notes")
        store.selectNoteTab(songID: song.id, tabID: "missing")
        #expect(store.preferredNoteTab(songID: song.id)?.id == "master")
        store.deleteNoteTab(songID: song.id, tabID: "master")
        #expect(store.preferredNoteTab(songID: song.id)?.id == "song-notes")
        store.useFixtureLibrary()
        #expect(store.selectedNoteTabs.isEmpty)
    }

    @Test func appendsOnlyToTheChosenTabUsingItsLatestContent() throws {
        let store = ReviewCompanionStore(songs: [song])
        let original = song.resolvedNoteTabs[1]
        #expect(store.saveSongJournal("Updated from another edit", songID: song.id, tabID: original.id))
        #expect(store.appendSongJournalEntry("Car check", songID: song.id, tabID: original.id, expected: original))
        let updated = try #require(store.songs.first)
        #expect(updated.generalNotes == song.generalNotes)
        let text = try #require(updated.resolvedNoteTabs.first { $0.id == original.id }?.content)
        #expect(text.hasPrefix("Updated from another edit"))
        #expect(text.hasSuffix("Car check"))
    }

    @Test func aDraftFromADeletedTabIsKeptForConflictReview() throws {
        let original = song.resolvedNoteTabs[1]
        let write = edit(original, content: "Unsaved sheet draft")
        var remote = song
        remote.noteTabs = [remote.resolvedNoteTabs[0]]
        let local = try write.applying(to: remote, checkingConflicts: false)
        #expect(local.resolvedNoteTabs.first { $0.id == original.id }?.content == "Unsaved sheet draft")
        #expect(throws: NoteTabError.self) { try write.applying(to: remote, checkingConflicts: true) }
        var state = OfflineLibraryState()
        state.pendingNoteWrites = [write]
        state.merge(CloudLibrarySnapshot(songs: [remote], trashedSongs: [], playlists: []))
        #expect(state.snapshot.songs[0].resolvedNoteTabs.last?.content == "Unsaved sheet draft")
    }

}
