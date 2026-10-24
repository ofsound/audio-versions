import SwiftUI

struct PlaylistLibraryView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @State private var isCreatingPlaylist = false

    private var orderedPlaylists: [Playlist] {
        store.playlists.sorted {
            $0.sortOrder == $1.sortOrder
                ? $0.createdAt < $1.createdAt
                : $0.sortOrder < $1.sortOrder
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if orderedPlaylists.isEmpty {
                    ContentUnavailableView(
                        "No playlists",
                        systemImage: "music.note.list",
                        description: Text("Create a playlist to build a listening sequence across songs.")
                    )
                } else {
                    List {
                        ForEach(orderedPlaylists) { playlist in
                            NavigationLink {
                                PlaylistDetailView(playlistID: playlist.id)
                            } label: {
                                HStack(spacing: 14) {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(palette.brandTile)
                                        .frame(width: 48, height: 48)
                                        .overlay {
                                            Image(systemName: "music.note.list")
                                                .foregroundStyle(palette.onAccent)
                                        }
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(playlist.name)
                                            .font(.headline)
                                        Text(
                                            playlist.audioFileIDs.count == 1
                                                ? "1 file"
                                                : "\(playlist.audioFileIDs.count) files"
                                        )
                                        .font(.caption)
                                        .foregroundStyle(palette.textSecondary)
                                    }
                                }
                            }
                            .listRowBackground(palette.canvas)
                        }
                        .onMove(perform: store.reorderPlaylists)
                        .onDelete { offsets in
                            let ids = offsets.compactMap { orderedPlaylists[safe: $0]?.id }
                            ids.forEach(store.deletePlaylist)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .appCanvas()
            .navigationTitle("Playlists")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    EditButton()
                        .disabled(orderedPlaylists.isEmpty)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New playlist", systemImage: "plus") {
                        isCreatingPlaylist = true
                    }
                }
            }
            .sheet(isPresented: $isCreatingPlaylist) {
                CreatePlaylistSheet()
            }
        }
    }
}

private struct PlaylistDetailView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @Environment(\.editMode) private var editMode
    @State private var nameDraft = ""
    @State private var isAddingFiles = false

    let playlistID: String

    private var playlist: Playlist? {
        store.playlists.first { $0.id == playlistID }
    }

    private var versions: [AudioVersion] {
        guard let playlist else { return [] }
        return playlist.audioFileIDs.compactMap(store.version)
    }

    private var activeVersion: AudioVersion? {
        guard let activeVersionID = store.activeVersionID else { return nil }
        return versions.first { $0.id == activeVersionID }
    }

    var body: some View {
        Group {
            if let playlist {
                List {
                    Section {
                        PlaylistPlayerControls(
                            playlist: playlist,
                            activeVersion: activeVersion,
                            firstVersion: versions.first
                        )
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(palette.canvas)
                    }

                    Section("Files") {
                        if versions.isEmpty {
                            Text("Add files from any song to start this playlist.")
                                .foregroundStyle(palette.textSecondary)
                        } else {
                            ForEach(Array(versions.enumerated()), id: \.element.id) { index, version in
                                PlaylistVersionRow(
                                    index: index + 1,
                                    version: version,
                                    isActive: activeVersion?.id == version.id,
                                    isPlaying: activeVersion?.id == version.id && store.isPlaying
                                ) {
                                    store.togglePlaylistPlayback(version: version, playlist: playlist)
                                }
                                .swipeActions(edge: .trailing) {
                                    Button("Remove", systemImage: "minus.circle", role: .destructive) {
                                        store.removeVersion(version.id, fromPlaylist: playlist.id)
                                    }
                                }
                            }
                            .onMove { offsets, destination in
                                var ids = playlist.audioFileIDs
                                ids.move(fromOffsets: offsets, toOffset: destination)
                                store.setPlaylistVersionOrder(
                                    playlistID: playlist.id,
                                    audioFileIDs: ids
                                )
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .appCanvas()
                .navigationTitle(playlist.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button("Add files", systemImage: "plus") {
                            isAddingFiles = true
                        }
                        EditButton()
                    }
                    ToolbarItem(placement: .principal) {
                        TextField("Playlist name", text: $nameDraft)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .onSubmit(saveName)
                            .accessibilityLabel("Playlist name")
                    }
                }
                .onAppear { nameDraft = playlist.name }
                .onChange(of: playlist.name) { _, name in
                    if editMode?.wrappedValue != .active {
                        nameDraft = name
                    }
                }
                .onDisappear(perform: saveName)
                .sheet(isPresented: $isAddingFiles) {
                    PlaylistFileSearchView(playlistID: playlist.id)
                }
            } else {
                ContentUnavailableView(
                    "Playlist unavailable",
                    systemImage: "music.note.list",
                    description: Text("This playlist may have been deleted on another device.")
                )
            }
        }
    }

    private func saveName() {
        guard let playlist else { return }
        let name = nameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            nameDraft = playlist.name
        } else if name != playlist.name {
            store.renamePlaylist(id: playlist.id, name: name)
        }
    }
}

private struct PlaylistPlayerControls: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette

    let playlist: Playlist
    let activeVersion: AudioVersion?
    let firstVersion: AudioVersion?

    private var displayedVersion: AudioVersion? {
        activeVersion ?? firstVersion
    }

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 4) {
                Text(displayedVersion?.name ?? "Nothing queued")
                    .font(.headline)
                    .lineLimit(1)
                if let version = displayedVersion,
                   let song = store.songs.first(where: { song in
                       song.versions.contains { $0.id == version.id }
                   }) {
                    Text(song.title)
                        .font(.subheadline)
                        .foregroundStyle(palette.textSecondary)
                }
            }

            HStack(spacing: 10) {
                Text(store.currentTime.playbackTimestamp)
                    .frame(width: 42, alignment: .trailing)
                Slider(
                    value: Binding(
                        get: { min(store.currentTime, displayedVersion?.duration ?? 0) },
                        set: { value in
                            guard let activeVersion else { return }
                            store.seek(
                                to: value,
                                in: activeVersion,
                                preservePlaylistQueue: true
                            )
                        }
                    ),
                    in: 0 ... max(0.01, displayedVersion?.duration ?? 0.01)
                )
                .disabled(activeVersion == nil)
                Text((displayedVersion?.duration ?? 0).playbackTimestamp)
                    .frame(width: 42, alignment: .leading)
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(palette.textSecondary)

            HStack(spacing: 28) {
                Button("Previous", systemImage: "backward.fill") {
                    store.playPreviousPlaylistVersion()
                }
                .labelStyle(.iconOnly)
                .disabled(activeVersion == nil)

                Button {
                    guard let version = activeVersion ?? firstVersion else { return }
                    store.togglePlaylistPlayback(version: version, playlist: playlist)
                } label: {
                    Image(systemName: store.isPlaying && activeVersion != nil ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .frame(width: 58, height: 58)
                        .foregroundStyle(palette.onAccent)
                        .background(palette.accent, in: Circle())
                }
                .disabled(displayedVersion == nil)
                .accessibilityLabel(store.isPlaying ? "Pause" : "Play")

                Button("Next", systemImage: "forward.fill") {
                    store.playNextPlaylistVersion()
                }
                .labelStyle(.iconOnly)
                .disabled(activeVersion == nil)

                Button {
                    let modes = PlaylistLoopMode.allCases
                    let index = modes.firstIndex(of: store.playlistLoopMode) ?? 0
                    store.playlistLoopMode = modes[(index + 1) % modes.count]
                } label: {
                    Image(systemName: store.playlistLoopMode.symbolName)
                        .foregroundStyle(
                            store.playlistLoopMode == .off
                                ? palette.textSecondary
                                : palette.accentText
                        )
                }
                .accessibilityLabel("Loop \(store.playlistLoopMode.rawValue)")
            }
            .buttonStyle(.plain)
            .font(.title3)

            if let status = store.playbackStatusText {
                Label(status, systemImage: "arrow.down.circle")
                    .font(.caption)
                    .foregroundStyle(palette.textSecondary)
            }
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
    }
}

private struct PlaylistVersionRow: View {
    @Environment(\.palette) private var palette
    let index: Int
    let version: AudioVersion
    let isActive: Bool
    let isPlaying: Bool
    let onTogglePlayback: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text("\(index)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(palette.textTertiary)
                .frame(width: 22, alignment: .trailing)
            Button(action: onTogglePlayback) {
                Image(systemName: isActive && isPlaying ? "pause.fill" : "play.fill")
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 3) {
                Text(version.name)
                    .font(.body.weight(isActive ? .semibold : .regular))
                Text(version.duration.playbackTimestamp)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(palette.textSecondary)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(palette.textTertiary)
        }
    }
}

private struct PlaylistFileSearchView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    let playlistID: String

    private var existingIDs: Set<String> {
        Set(store.playlists.first { $0.id == playlistID }?.audioFileIDs ?? [])
    }

    private var results: [(song: Song, version: AudioVersion)] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        return store.songs.flatMap { song in
            song.versions.compactMap { version in
                guard !existingIDs.contains(version.id) else { return nil }
                let matches = version.name.localizedStandardContains(query)
                    || song.title.localizedStandardContains(query)
                    || song.artist.localizedStandardContains(query)
                return matches ? (song, version) : nil
            }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if searchText.isEmpty {
                    ContentUnavailableView(
                        "Search the library",
                        systemImage: "magnifyingglass",
                        description: Text("Find files by file name, song, or artist.")
                    )
                } else if results.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    List(results, id: \.version.id) { result in
                        Button {
                            store.addVersion(result.version.id, toPlaylist: playlistID)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(result.version.name)
                                    Text("\(result.song.title) · \(result.song.artist)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "plus.circle.fill")
                            }
                        }
                    }
                }
            }
            .navigationTitle("Add Files")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Files, songs, artists")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

private struct CreatePlaylistSheet: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Playlist name", text: $name)
                    .submitLabel(.done)
                    .onSubmit(create)
            }
            .navigationTitle("New Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create", action: create)
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func create() {
        guard store.createPlaylist(named: name) != nil else { return }
        dismiss()
    }
}

struct AddVersionToPlaylistMenu: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @State private var isCreatingPlaylist = false
    let version: AudioVersion

    var body: some View {
        Menu {
            ForEach(store.playlists.sorted { $0.sortOrder < $1.sortOrder }) { playlist in
                let included = playlist.audioFileIDs.contains(version.id)
                Button {
                    if included {
                        store.removeVersion(version.id, fromPlaylist: playlist.id)
                    } else {
                        store.addVersion(version.id, toPlaylist: playlist.id)
                    }
                } label: {
                    Label(playlist.name, systemImage: included ? "checkmark" : "music.note.list")
                }
            }
            Divider()
            Button("New Playlist", systemImage: "plus") {
                isCreatingPlaylist = true
            }
        } label: {
            Image(systemName: "text.badge.plus")
        }
        .accessibilityLabel("Add \(version.name) to playlist")
        .sheet(isPresented: $isCreatingPlaylist) {
            CreatePlaylistWithVersionSheet(versionID: version.id)
        }
    }
}

private struct CreatePlaylistWithVersionSheet: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    let versionID: String

    var body: some View {
        NavigationStack {
            Form { TextField("Playlist name", text: $name) }
                .navigationTitle("New Playlist")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            if store.createPlaylist(named: name, audioFileIDs: [versionID]) != nil {
                                dismiss()
                            }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
