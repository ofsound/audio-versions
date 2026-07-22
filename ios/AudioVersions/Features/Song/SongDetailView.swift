import SwiftUI

struct SongDetailView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    let songID: String

    private var song: Song? {
        store.songs.first { $0.id == songID }
    }

    var body: some View {
        Group {
            if let song {
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(song.artist)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text("Choose a version to listen, scrub the waveform, and leave time-based feedback.")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 5)
                    }

                    Section("Versions") {
                        ForEach(song.versions.sorted(by: { $0.createdAt > $1.createdAt })) { version in
                            NavigationLink {
                                ReviewPlayerView(songID: song.id, versionID: version.id)
                            } label: {
                                VersionRow(version: version)
                            }
                        }
                    }
                }
                .navigationTitle(song.title)
                .navigationBarTitleDisplayMode(.large)
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
