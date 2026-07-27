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

    var body: some View {
        Group {
            if let song {
                List {
                    Section {
                        ScrollableVersionList(songID: song.id, versions: sortedVersions(for: song))
                    } header: {
                        DetailSectionHeader("Versions")
                    }
                    .listRowInsets(Self.groupedSectionInsets)
                    .listRowBackground(palette.surface)

                    Section {
                        JournalContentView(
                            text: song.generalNotes,
                            placeholder: "Add notes about this song",
                            onOpenLink: store.openSongLink
                        )
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)
                    } header: {
                        DetailSectionHeader("Song Notes")
                    }
                    .listRowInsets(Self.groupedSectionInsets)
                    .listRowBackground(palette.surface)

                    Section {
                        Button {
                            isEditingJournal = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "square.and.pencil")
                                Text(song.generalNotes.isEmpty ? "Add song notes" : "Edit song notes")
                            }
                            .foregroundStyle(palette.accentText)
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(palette.accent)
                        .controlSize(.large)
                        .accessibilityLabel(
                            song.generalNotes.isEmpty ? "Add song notes" : "Edit song notes"
                        )
                    }
                    // Keep a separate section so both the journal card and this
                    // control retain rounded corners, but sit tightly underneath.
                    .listSectionSpacing(8)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 2, trailing: 0))
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
                        title: "Song Notes",
                        accessibilityLabel: "Song notes",
                        text: song.generalNotes
                    ) { journal in
                        store.saveSongJournal(journal, songID: song.id)
                    }
                }
                .sheet(isPresented: $isAddingToJournal) {
                    PlainTextNoteEditorView(
                        title: "Add to Song Notes",
                        accessibilityLabel: "Add to song notes",
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

/// Quiet title-case section label: smaller than increased-prominence headers, with
/// breathing room before the grouped card (HIG text styles, not Settings caps).
private struct DetailSectionHeader: View {
    @Environment(\.palette) private var palette

    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(palette.textSecondary)
            .textCase(.none)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 6)
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

            VersionMetadataLine(version: version)

            if version.annotationCount > 0 {
                Label(
                    version.annotationCount == 1 ? "1 marker" : "\(version.annotationCount) markers",
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
