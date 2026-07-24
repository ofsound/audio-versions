import SwiftUI

struct SongDetailView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @State private var isEditingJournal = false
    let songID: String

    private var song: Song? {
        store.songs.first { $0.id == songID }
    }

    private var journalLinks: [SongJournalLink] {
        SongJournalLink.extract(from: song?.generalNotes ?? "")
    }

    var body: some View {
        Group {
            if let song {
                List {
                    Section("Journal") {
                        Button {
                            isEditingJournal = true
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(
                                    song.generalNotes.isEmpty
                                        ? "Add notes about this song"
                                        : song.generalNotes
                                )
                                .foregroundStyle(
                                    song.generalNotes.isEmpty ? .secondary : .primary
                                )
                                .lineLimit(6)

                                Label(
                                    song.generalNotes.isEmpty ? "Add journal" : "Edit journal",
                                    systemImage: "square.and.pencil"
                                )
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(.orange)
                            }
                            .padding(.vertical, 5)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)

                        ForEach(journalLinks) { link in
                            Button {
                                store.openSongLink(link.target)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "link")
                                        .foregroundStyle(.orange)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(link.label)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        if let time = link.target.time {
                                            Text("Jump to \(time.playbackTimestamp)")
                                                .font(.caption.monospacedDigit())
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.tertiary)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens the linked version and marker position")
                        }
                    }

                    Section("Versions") {
                        ForEach(song.versions.sorted(by: { $0.createdAt > $1.createdAt })) { version in
                            NavigationLink(
                                value: LibraryDestination.version(
                                    songID: song.id,
                                    versionID: version.id,
                                    target: nil
                                )
                            ) {
                                VersionRow(version: version)
                            }
                        }
                    }
                }
                .navigationTitle(song.title)
                .navigationBarTitleDisplayMode(.large)
                .sheet(isPresented: $isEditingJournal) {
                    PlainTextNoteEditorView(
                        title: "Song Journal",
                        accessibilityLabel: "Song journal",
                        text: song.generalNotes
                    ) { journal in
                        store.saveSongJournal(journal, songID: song.id)
                    }
                }
            } else {
                ContentUnavailableView(
                    "Song unavailable",
                    systemImage: "music.note",
                    description: Text("This song is no longer in the library.")
                )
            }
        }
    }
}

private struct VersionRow: View {
    let version: AudioVersion

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(version.name)
                .font(.headline)

            HStack(spacing: 7) {
                Label(version.duration.playbackTimestamp, systemImage: "clock")
                Text("•")
                Text(version.createdAt, style: .date)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if version.annotationCount > 0 {
                Label(
                    version.annotationCount == 1 ? "1 annotation" : "\(version.annotationCount) annotations",
                    systemImage: "text.bubble"
                )
                .font(.caption)
                .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }
}
