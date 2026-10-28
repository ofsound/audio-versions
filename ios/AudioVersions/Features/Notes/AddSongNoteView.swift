import SwiftUI

/// Keep the destination and draft stable while the library refreshes or the user
/// changes tabs. Appending uses the latest content of the chosen document.
struct AddSongNoteView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @EnvironmentObject private var appearance: AppearanceStore
    @State private var destination: SongNoteTab?
    let songID: String

    init(songID: String, initialTab: SongNoteTab?) {
        self.songID = songID
        _destination = State(initialValue: initialTab)
    }

    private var tabs: [SongNoteTab] {
        var tabs = store.songs.first { $0.id == songID }?.resolvedNoteTabs ?? []
        // A deleted destination must never silently redirect an existing draft.
        if let destination, !tabs.contains(where: { $0.id == destination.id }) {
            tabs.append(destination)
        }
        return tabs
    }

    var body: some View {
        PlainTextNoteEditorView(
            title: "Add to Song Notes",
            accessibilityLabel: "Add to song notes",
            text: "",
            requiresNonEmptyDraft: true,
            noteTabs: tabs,
            selectedNoteTabID: Binding(
                get: { destination?.id ?? "" },
                set: { id in
                    guard let tab = tabs.first(where: { $0.id == id }) else { return }
                    destination = tab
                    store.selectNoteTab(songID: songID, tabID: id)
                }
            ),
            songNotesFontSize: appearance.songNotesFontSize,
            onAdjustSongNotesFontSize: { appearance.adjustSongNotesFontSize(by: $0) }
        ) { entry in
            guard let destination,
                  store.appendSongJournalEntry(entry, songID: songID, tabID: destination.id, expected: destination)
            else { throw NoteTabError.notSaved }
            store.selectNoteTab(songID: songID, tabID: destination.id)
        }
    }
}
