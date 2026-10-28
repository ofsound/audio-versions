import Foundation

struct SongNoteTab: Identifiable, Hashable, Codable, Sendable {
    let id: String
    var name: String
    var content: String
    static let legacyID = "song-notes"
}

extension Song {
    var resolvedNoteTabs: [SongNoteTab] {
        var tabs = noteTabs?.isEmpty == false ? noteTabs! : [
            SongNoteTab(id: SongNoteTab.legacyID, name: "Song Notes", content: generalNotes)
        ]
        // Legacy clients still edit this column, so it is authoritative for tab one.
        tabs[0].content = generalNotes
        return tabs
    }

    mutating func replaceNoteTabs(_ tabs: [SongNoteTab]) {
        noteTabs = tabs
        generalNotes = tabs.first?.content ?? ""
        updatedAt = .now
    }
}

enum NoteTabError: Error, LocalizedError {
    case conflict
    case invalidName
    case lastTab
    case notSaved
    var errorDescription: String? {
        switch self {
        case .conflict: "This note changed on another device. Your local changes are kept on this iPhone for review."
        case .invalidName: "Use a tab name between 1 and 80 characters."
        case .lastTab: "Keep at least one note tab. Clear its text instead."
        case .notSaved: "Your notes could not be saved on this iPhone. Your draft is still in the editor; try saving again."
        }
    }
}

struct PendingNoteWrite: Identifiable, Codable {
    enum Operation: String, Codable { case create, update, delete }
    let id: UUID
    let songID: String
    let operation: Operation
    let tab: SongNoteTab
    let expected: SongNoteTab?
    var conflictMessage: String?

    var key: String { "\(songID):\(tab.id)" }

    /// Merge only the edited fields. A rename on another device must not be
    /// overwritten by an offline content edit, nor edits to other note tabs.
    func applying(to song: Song, checkingConflicts: Bool) throws -> Song {
        var song = song
        var tabs = song.resolvedNoteTabs
        let index = tabs.firstIndex { $0.id == tab.id }
        switch operation {
        case .create:
            if let index {
                if checkingConflicts && tabs[index] != tab { throw NoteTabError.conflict }
            } else { tabs.append(tab) }
        case .update:
            guard let index else {
                if checkingConflicts { throw NoteTabError.conflict }
                tabs.append(tab)
                song.replaceNoteTabs(tabs)
                return song
            }
            guard let expected else { throw NoteTabError.conflict }
            if tab.name != expected.name {
                if checkingConflicts && tabs[index].name != expected.name && tabs[index].name != tab.name { throw NoteTabError.conflict }
                tabs[index].name = tab.name
            }
            if tab.content != expected.content {
                if checkingConflicts && tabs[index].content != expected.content && tabs[index].content != tab.content { throw NoteTabError.conflict }
                tabs[index].content = tab.content
            }
        case .delete:
            if let index {
                if checkingConflicts && tabs[index] != expected { throw NoteTabError.conflict }
                guard tabs.count > 1 else { throw NoteTabError.lastTab }
                tabs.remove(at: index)
            }
        }
        song.replaceNoteTabs(tabs)
        return song
    }
}
