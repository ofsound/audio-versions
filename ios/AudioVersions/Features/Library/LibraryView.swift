import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @State private var searchText = ""

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

    var body: some View {
        NavigationStack {
            Group {
                if filteredSongs.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    List(filteredSongs) { song in
                        NavigationLink {
                            SongDetailView(songID: song.id)
                        } label: {
                            LibrarySongRow(song: song)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await store.refreshCloudLibrary()
                    }
                }
            }
            .navigationTitle("Audio Versions")
            .searchable(text: $searchText, prompt: "Search songs")
            .toolbar {
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
        .overlay {
            if store.isCloudLoading, store.songs.isEmpty {
                ProgressView("Loading your library…")
            }
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

private struct LibrarySongRow: View {
    let song: Song

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.orange.gradient)
                .frame(width: 54, height: 54)
                .overlay {
                    Image(systemName: "waveform")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(song.title)
                    .font(.headline)
                Text(song.latestVersion?.name ?? "No versions")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 5) {
                    Text(song.versions.count == 1 ? "1 version" : "\(song.versions.count) versions")
                    Text("•")
                    Text(song.updatedAt, style: .relative)
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
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
    }
}
