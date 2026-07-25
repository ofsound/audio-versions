import SwiftUI

struct SongDetailView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @State private var isEditingJournal = false
    @State private var isAddingToJournal = false
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
                    Section {
                        ScrollableVersionList(songID: song.id, versions: sortedVersions(for: song))
                    } header: {
                        DetailSectionHeader("Versions")
                    }
                    .headerProminence(.increased)
                    .listRowInsets(Self.groupedSectionInsets)
                    .listRowBackground(palette.surface)

                    Section {
                        Text(
                            song.generalNotes.isEmpty
                                ? "Add notes about this song"
                                : song.generalNotes
                        )
                        .foregroundStyle(
                            song.generalNotes.isEmpty ? palette.textSecondary : palette.textPrimary
                        )
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)

                        ForEach(journalLinks) { link in
                            Button {
                                store.openSongLink(link.target)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "link")
                                        .foregroundStyle(palette.accentText)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(link.label)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(palette.textPrimary)
                                            .lineLimit(1)
                                        if let time = link.target.time {
                                            Text("Jump to \(time.playbackTimestamp)")
                                                .font(.caption.monospacedDigit())
                                                .foregroundStyle(palette.textSecondary)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(palette.textTertiary)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 13)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens the linked version and marker position")
                        }
                    } header: {
                        DetailSectionHeader("Journal")
                    }
                    .headerProminence(.increased)
                    .listRowInsets(Self.groupedSectionInsets)
                    .listRowBackground(palette.surface)

                    Section {
                        Button {
                            isEditingJournal = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "square.and.pencil")
                                Text(song.generalNotes.isEmpty ? "Add journal" : "Edit journal")
                            }
                            .foregroundStyle(palette.accentText)
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(palette.accent)
                        .controlSize(.large)
                        .accessibilityLabel(
                            song.generalNotes.isEmpty ? "Add journal" : "Edit journal"
                        )
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 2, trailing: 0))
                }
                .scrollContentBackground(.hidden)
                .appCanvas()
                .navigationTitle(song.title)
                .navigationBarTitleDisplayMode(.inline)
                .addToJournalBottomBar {
                    isAddingToJournal = true
                }
                .sheet(isPresented: $isEditingJournal) {
                    PlainTextNoteEditorView(
                        title: "Song Journal",
                        accessibilityLabel: "Song journal",
                        text: song.generalNotes
                    ) { journal in
                        store.saveSongJournal(journal, songID: song.id)
                    }
                }
                .sheet(isPresented: $isAddingToJournal) {
                    PlainTextNoteEditorView(
                        title: "Add to Journal",
                        accessibilityLabel: "Add to song journal",
                        text: "",
                        requiresNonEmptyDraft: true
                    ) { entry in
                        store.appendSongJournalEntry(entry, songID: song.id)
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

    private func sortedVersions(for song: Song) -> [AudioVersion] {
        song.versions.sorted(by: { $0.createdAt > $1.createdAt })
    }

    /// Shared by Versions and Journal so section-header spacing matches.
    private static let groupedSectionInsets = EdgeInsets()
}

/// Title-case section label using Apple’s increased-prominence list header pattern
/// (HIG typography: Dynamic Type text style + emphasized weight, not Settings caps).
private struct DetailSectionHeader: View {
    @Environment(\.palette) private var palette

    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.title3.weight(.semibold))
            .foregroundStyle(palette.textPrimary)
            .textCase(.none)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Shows up to three version rows at a time; additional versions scroll in place.
private struct ScrollableVersionList: View {
    @Environment(\.palette) private var palette

    private static let visibleCount = 3
    private static let estimatedRowHeight: CGFloat = 78

    let songID: String
    let versions: [AudioVersion]

    @State private var rowHeights: [String: CGFloat] = [:]

    private var visibleHeight: CGFloat {
        let visible = Array(versions.prefix(Self.visibleCount))
        guard !visible.isEmpty else { return 0 }

        let measured = visible.compactMap { rowHeights[$0.id] }
        let rowsHeight: CGFloat
        if measured.count == visible.count {
            rowsHeight = measured.reduce(0, +)
        } else {
            rowsHeight = Self.estimatedRowHeight * CGFloat(visible.count)
        }
        // Include the hairlines that sit between the visible rows.
        return rowsHeight + CGFloat(max(0, visible.count - 1))
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(versions.enumerated()), id: \.element.id) { index, version in
                    NavigationLink(
                        value: LibraryDestination.version(
                            songID: songID,
                            versionID: version.id,
                            target: nil
                        )
                    ) {
                        HStack(spacing: 10) {
                            VersionRow(version: version)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(palette.textTertiary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(
                        GeometryReader { proxy in
                            Color.clear.preference(
                                key: VersionRowHeightKey.self,
                                value: [version.id: proxy.size.height]
                            )
                        }
                    )

                    if index < versions.count - 1 {
                        Divider()
                            .padding(.leading, 16)
                    }
                }
            }
        }
        .frame(height: visibleHeight)
        .scrollDisabled(versions.count <= Self.visibleCount)
        .scrollIndicators(versions.count > Self.visibleCount ? .visible : .hidden)
        .onPreferenceChange(VersionRowHeightKey.self) { heights in
            rowHeights.merge(heights, uniquingKeysWith: { _, new in new })
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Versions")
        .accessibilityHint(
            versions.count > Self.visibleCount
                ? "Shows three versions. Scroll for more."
                : ""
        )
    }
}

private struct VersionRowHeightKey: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct VersionRow: View {
    @Environment(\.palette) private var palette
    let version: AudioVersion

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(version.name)
                .font(.headline)
                .foregroundStyle(palette.textPrimary)

            HStack(spacing: 7) {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                    Text(version.duration.playbackTimestamp)
                }
                Text("•")
                Text(version.createdAt, style: .date)
            }
            .font(.caption)
            .foregroundStyle(palette.textSecondary)

            if version.annotationCount > 0 {
                Label(
                    version.annotationCount == 1 ? "1 annotation" : "\(version.annotationCount) annotations",
                    systemImage: "text.bubble"
                )
                .font(.caption)
                .foregroundStyle(palette.accentText)
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }
}
