import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @EnvironmentObject private var appearance: AppearanceStore
    @Environment(\.palette) private var palette
    @State private var searchText = ""
    @State private var downloadedOnly = false
    @State private var confirmsOfflineSignOut = false
    @State private var isShowingAppearanceSettings = false
    @State private var songPendingTrash: Song?

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
        let songs = downloadedOnly ? store.songs.filter { song in
            song.versions.contains { store.downloadedVersionIDs.contains($0.id) }
        } : store.songs
        guard !searchText.isEmpty else { return songs }
        return songs.filter {
            $0.title.localizedStandardContains(searchText)
                || $0.artist.localizedStandardContains(searchText)
        }
    }

    private var isBootstrappingLibrary: Bool {
        store.isCloudLoading && store.songs.isEmpty
    }

    private var showsLibraryLoadError: Bool {
        store.songs.isEmpty && store.cloudErrorMessage != nil && !store.isCloudLoading
    }

    var body: some View {
        TabView(selection: $store.selectedLibraryTab) {
            NavigationStack(path: $store.navigationPath) {
                Group {
                if isBootstrappingLibrary {
                    LibraryBootstrapView()
                } else if showsLibraryLoadError {
                    ContentUnavailableView {
                        Label("Couldn’t load your library", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text("Check your connection and try again.")
                    } actions: {
                        Button("Retry", systemImage: "arrow.clockwise") {
                            Task { await store.refreshCloudLibrary() }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                } else if filteredSongs.isEmpty {
                    if searchText.isEmpty {
                        ContentUnavailableView(
                            downloadedOnly ? "No downloads yet" : "No songs yet",
                            systemImage: "music.note.list",
                            description: Text(downloadedOnly
                                ? "Download a version from its song or player to listen offline."
                                : "Songs from your library will show up here.")
                        )
                    } else {
                        ContentUnavailableView.search(text: searchText)
                    }
                } else {
                    List(filteredSongs) { song in
                        LibrarySongRow(song: song)
                        .listRowBackground(palette.canvas)
                        .listRowSeparatorTint(palette.hairline)
                        .swipeActions(edge: .trailing) {
                            Button("Move to Trash", systemImage: "trash", role: .destructive) {
                                songPendingTrash = song
                            }
                        }
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
                .bottomScreenChrome {
                if !isBootstrappingLibrary {
                    LibrarySearchField(text: $searchText)
                }
            }
                .persistentMiniPlayer()
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
                                Toggle("Downloaded songs only", isOn: $downloadedOnly)
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
                                    if store.pendingAnnotationWrites.isEmpty {
                                        onSignOut()
                                    } else {
                                        confirmsOfflineSignOut = true
                                    }
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
            .tabItem {
                Label("Songs", systemImage: "music.note.house")
            }
            .tag(LibraryTab.songs)

            PlaylistLibraryView()
                .tabItem {
                    Label("Playlists", systemImage: "music.note.list")
                }
                .tag(LibraryTab.playlists)

            TrashLibraryView()
                .tabItem {
                    Label("Trash", systemImage: "trash")
                }
                .tag(LibraryTab.trash)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            OfflineSyncStatusView()
        }
        .sheet(isPresented: $isShowingAppearanceSettings) {
            AppearanceSettingsView(appearance: appearance)
        }
        .confirmationDialog("Sign out and remove unsynced changes?", isPresented: $confirmsOfflineSignOut,
                            titleVisibility: .visible) {
            Button("Sign out and remove local data", role: .destructive) { onSignOut?() }
        } message: {
            Text("Some marker or range changes are only saved on this iPhone. Sync them before signing out to keep them. Downloads will also be removed.")
        }
        .confirmationDialog(
            "Move this song to Trash?",
            isPresented: Binding(
                get: { songPendingTrash != nil },
                set: { if !$0 { songPendingTrash = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Move to Trash", role: .destructive) {
                if let songPendingTrash {
                    store.trashSong(songPendingTrash)
                }
                songPendingTrash = nil
            }
            Button("Cancel", role: .cancel) {
                songPendingTrash = nil
            }
        } message: {
            Text("You can restore it for 30 days. Its audio files will be kept until then.")
        }
        .alert(
            "Audio Versions couldn’t complete that request",
            isPresented: Binding(
                get: { store.cloudErrorMessage != nil && !showsLibraryLoadError },
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

private struct TrashLibraryView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @State private var songPendingPermanentDeletion: Song?
    @State private var isConfirmingEmptyTrash = false

    var body: some View {
        NavigationStack {
            Group {
                if store.trashedSongs.isEmpty {
                    ContentUnavailableView(
                        "Trash is empty",
                        systemImage: "trash",
                        description: Text("Deleted songs remain recoverable for 30 days.")
                    )
                } else {
                    List(store.trashedSongs) { song in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(song.title)
                                .font(.headline)
                                .foregroundStyle(palette.textPrimary)
                            if let deletionDate = song.deletedAt?.addingTimeInterval(30 * 24 * 60 * 60) {
                                Text("Permanently deletes \(deletionDate.formatted(date: .abbreviated, time: .omitted))")
                                    .font(.caption)
                                    .foregroundStyle(palette.textTertiary)
                            }
                        }
                        .swipeActions(edge: .leading) {
                            Button("Restore", systemImage: "arrow.uturn.backward") {
                                store.restoreSong(song)
                            }
                            .tint(.green)
                        }
                        .swipeActions(edge: .trailing) {
                            Button("Delete permanently", systemImage: "trash.slash", role: .destructive) {
                                songPendingPermanentDeletion = song
                            }
                        }
                        .listRowBackground(palette.canvas)
                        .listRowSeparatorTint(palette.hairline)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .appCanvas()
            .persistentMiniPlayer()
            .navigationTitle("Trash")
            .toolbar {
                if !store.trashedSongs.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Empty", role: .destructive) {
                            isConfirmingEmptyTrash = true
                        }
                    }
                }
            }
        }
        .confirmationDialog(
            "Permanently delete this song?",
            isPresented: Binding(
                get: { songPendingPermanentDeletion != nil },
                set: { if !$0 { songPendingPermanentDeletion = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete permanently", role: .destructive) {
                if let songPendingPermanentDeletion {
                    store.permanentlyDeleteSong(songPendingPermanentDeletion)
                }
                songPendingPermanentDeletion = nil
            }
            Button("Cancel", role: .cancel) {
                songPendingPermanentDeletion = nil
            }
        } message: {
            Text("The song and all of its audio files will be deleted. This cannot be undone.")
        }
        .confirmationDialog(
            "Empty Trash?",
            isPresented: $isConfirmingEmptyTrash,
            titleVisibility: .visible
        ) {
            Button("Delete everything permanently", role: .destructive) {
                store.emptyTrash()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every trashed song and audio file will be permanently deleted. This cannot be undone.")
        }
    }
}

private struct LibrarySearchField: View {
    @Environment(\.palette) private var palette
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(palette.textTertiary)
            TextField("Search songs", text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(palette.textPrimary)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(palette.textTertiary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Clear search")
            }
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 14)
        .background(palette.surfaceInset, in: Capsule())
        .accessibilityElement(children: .contain)
    }
}

private struct LibrarySongRow: View {
    @Environment(\.palette) private var palette
    let song: Song

    var body: some View {
        HStack(spacing: 14) {
            VersionPreviewButton(version: song.previewVersion, title: song.title)

            NavigationLink(value: LibraryDestination.song(id: song.id)) {
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
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .contain)
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
