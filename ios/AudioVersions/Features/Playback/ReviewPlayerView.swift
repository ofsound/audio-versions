import SwiftUI

struct ReviewPlayerView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @State private var editingAnnotation: ReviewAnnotation?
    @State private var isDownloaded = false

    let songID: String
    let versionID: String

    private var song: Song? {
        store.songs.first { $0.id == songID }
    }

    private var version: AudioVersion? {
        store.version(id: versionID)
    }

    var body: some View {
        Group {
            if let version {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        playerCard(version: version)
                        annotationActions(version: version)
                        AnnotationListView(
                            annotations: version.annotations,
                            activeTime: store.currentTime,
                            onSelect: { annotation in
                                store.seek(to: annotation.startTime, in: version)
                            },
                            onEdit: { editingAnnotation = $0 },
                            onDelete: { store.delete($0, from: version.id) }
                        )
                    }
                    .padding()
                }
                .background(Color(.systemGroupedBackground))
                .navigationTitle(version.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            isDownloaded.toggle()
                        } label: {
                            Image(systemName: isDownloaded ? "checkmark.circle.fill" : "arrow.down.circle")
                        }
                        .accessibilityLabel(isDownloaded ? "Remove download" : "Download version")
                        .accessibilityValue(isDownloaded ? "Downloaded" : "Not downloaded")
                    }
                }
                .sheet(item: $editingAnnotation) { annotation in
                    AnnotationEditorView(annotation: annotation, duration: version.duration) {
                        store.save($0, in: version.id)
                    }
                }
                .task {
                    store.activate(version: version)
                }
            } else {
                ContentUnavailableView(
                    "Version unavailable",
                    systemImage: "waveform.slash",
                    description: Text("This version is no longer in the library.")
                )
            }
        }
    }

    private func playerCard(version: AudioVersion) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text(song?.title ?? "Audio Versions")
                    .font(.title2.weight(.bold))
                Text(version.name)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            WaveformView(
                peaks: version.waveformPeaks,
                duration: version.duration,
                currentTime: store.currentTime,
                annotations: version.annotations,
                onSeek: { store.seek(to: $0, in: version) }
            )

            HStack {
                Text(store.currentTime.playbackTimestamp)
                Spacer()
                Text("−\((version.duration - store.currentTime).playbackTimestamp)")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)

            HStack(spacing: 26) {
                Button {
                    store.skip(by: -10, in: version)
                } label: {
                    Image(systemName: "gobackward.10")
                }
                .accessibilityLabel("Skip back 10 seconds")

                Button {
                    store.togglePlayback(for: version)
                } label: {
                    Group {
                        if store.isPreparingPlayback {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: store.isPlaying ? "pause.fill" : "play.fill")
                        }
                    }
                    .font(.title2)
                    .frame(width: 58, height: 58)
                    .foregroundStyle(.white)
                    .background(.orange, in: Circle())
                }
                .disabled(store.isPreparingPlayback)
                .accessibilityLabel(store.isPlaying ? "Pause" : "Play")

                Button {
                    store.skip(by: 10, in: version)
                } label: {
                    Image(systemName: "goforward.10")
                }
                .accessibilityLabel("Skip forward 10 seconds")
            }
            .font(.title3)
            .frame(maxWidth: .infinity)

            HStack {
                Image(systemName: "speaker.wave.2")
                    .foregroundStyle(.secondary)
                Spacer()
                Menu {
                    ForEach([0.75, 1, 1.25, 1.5], id: \.self) { rate in
                        Button {
                            store.playbackRate = rate
                        } label: {
                            if store.playbackRate == rate {
                                Label("\(rate.formatted())×", systemImage: "checkmark")
                            } else {
                                Text("\(rate.formatted())×")
                            }
                        }
                    }
                } label: {
                    Text("\(store.playbackRate.formatted())×")
                        .font(.subheadline.weight(.medium))
                        .monospacedDigit()
                }
                .accessibilityLabel("Playback speed")
            }
        }
        .padding(18)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func annotationActions(version: AudioVersion) -> some View {
        HStack(spacing: 12) {
            Button {
                editingAnnotation = newAnnotation(kind: .point, version: version)
            } label: {
                Label("Add point", systemImage: "mappin.and.ellipse")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button {
                editingAnnotation = newAnnotation(kind: .range, version: version)
            } label: {
                Label("Add range", systemImage: "selection.pin.in.out")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .controlSize(.large)
    }

    private func newAnnotation(kind: ReviewAnnotation.Kind, version: AudioVersion) -> ReviewAnnotation {
        let rangeStart = min(store.currentTime, max(0, version.duration - 0.5))
        return ReviewAnnotation(
            id: UUID().uuidString,
            kind: kind,
            startTime: kind == .range ? rangeStart : store.currentTime,
            endTime: kind == .range ? min(version.duration, rangeStart + 8) : nil,
            title: "",
            body: "",
            authorName: "Ben",
            updatedAt: .now
        )
    }
}
