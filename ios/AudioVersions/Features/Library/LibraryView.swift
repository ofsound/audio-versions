import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @EnvironmentObject private var appearance: AppearanceStore
    @Environment(\.palette) private var palette
    @State private var searchText = ""
    @State private var isShowingAppearanceSettings = false

    let accountEmail: String?
    let onSignOut: (() -> Void)?

    init(
        accountEmail: String? = nil,
        onSignOut: (() -> Void)? = nil
    ) {
        self.accountEmail = accountEmail
        self.onSignOut = onSignOut
    }

    private var filteredSongs: [Song] {
        guard !searchText.isEmpty else { return store.songs }
        return store.songs.filter {
            $0.title.localizedStandardContains(searchText)
                || $0.artist.localizedStandardContains(searchText)
        }
    }

    private var isBootstrappingLibrary: Bool {
        store.isCloudLoading && store.songs.isEmpty
    }

    var body: some View {
        NavigationStack(path: $store.navigationPath) {
            Group {
                if isBootstrappingLibrary {
                    LibraryBootstrapView()
                } else if filteredSongs.isEmpty {
                    if searchText.isEmpty {
                        ContentUnavailableView(
                            "No songs yet",
                            systemImage: "music.note.list",
                            description: Text("Songs from your library will show up here.")
                        )
                    } else {
                        ContentUnavailableView.search(text: searchText)
                    }
                } else {
                    List(filteredSongs) { song in
                        NavigationLink(value: LibraryDestination.song(id: song.id)) {
                            LibrarySongRow(song: song)
                        }
                        .listRowBackground(palette.canvas)
                        .listRowSeparatorTint(palette.hairline)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .refreshable {
                        await store.refreshCloudLibrary()
                    }
                }
            }
            .appCanvas()
            .navigationTitle("Audio Versions")
            .modifier(LibrarySearchModifier(text: $searchText, isEnabled: !isBootstrappingLibrary))
            .toolbar {
                if !isBootstrappingLibrary {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Label(
                                accountEmail ?? "Fixture library",
                                systemImage: accountEmail == nil ? "shippingbox" : "person.crop.circle"
                            )
                                .foregroundStyle(.secondary)
                            if store.isCloudConfigured {
                                Button("Refresh library", systemImage: "arrow.clockwise") {
                                    Task {
                                        await store.refreshCloudLibrary()
                                    }
                                }
                            }
                            Divider()
                            Button("Appearance", systemImage: appearance.preference.symbolName) {
                                isShowingAppearanceSettings = true
                            }
                            if let onSignOut {
                                Divider()
                                Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right") {
                                    onSignOut()
                                }
                            }
                        } label: {
                            Image(systemName: "person.crop.circle")
                        }
                        .accessibilityLabel("Account")
                    }
                }
            }
            .navigationDestination(for: LibraryDestination.self) { destination in
                switch destination {
                case let .song(id):
                    SongDetailView(songID: id)
                case let .version(songID, versionID, target):
                    ReviewPlayerView(
                        songID: songID,
                        versionID: versionID,
                        linkTarget: target
                    )
                }
            }
        }
        .sheet(isPresented: $isShowingAppearanceSettings) {
            AppearanceSettingsView(appearance: appearance)
        }
        .alert(
            "Audio Versions couldn’t complete that request",
            isPresented: Binding(
                get: { store.cloudErrorMessage != nil },
                set: { isPresented in
                    if !isPresented {
                        store.clearCloudError()
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                store.clearCloudError()
            }
        } message: {
            Text(store.cloudErrorMessage ?? "Please try again.")
        }
    }
}

private struct LibrarySearchModifier: ViewModifier {
    @Binding var text: String
    let isEnabled: Bool

    func body(content: Content) -> some View {
        if isEnabled {
            content.searchable(text: $text, prompt: "Search songs")
        } else {
            content
        }
    }
}

private struct LibrarySongRow: View {
    @Environment(\.palette) private var palette
    let song: Song

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(palette.brandTile)
                .frame(width: 54, height: 54)
                .overlay {
                    Image(systemName: "waveform")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(palette.onAccent)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(song.title)
                    .font(.headline)
                    .foregroundStyle(palette.textPrimary)
                Text(song.latestVersion?.name ?? "No versions")
                    .font(.subheadline)
                    .foregroundStyle(palette.textSecondary)
                    .lineLimit(1)

                HStack(spacing: 5) {
                    Text(song.versions.count == 1 ? "1 version" : "\(song.versions.count) versions")
                    if let sessionDateRange = song.sessionDateRangeLabel {
                        Text("•")
                        Text(sessionDateRange)
                    }
                }
                .font(.caption)
                .foregroundStyle(palette.textTertiary)
            }
            .padding(.vertical, 5)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LibraryViewPreviews: PreviewProvider {
    static var previews: some View {
        LibraryView()
            .environmentObject(ReviewCompanionStore())
            .environmentObject(AppearanceStore())
            .environment(\.palette, .dark)
            .preferredColorScheme(.dark)
    }
}
