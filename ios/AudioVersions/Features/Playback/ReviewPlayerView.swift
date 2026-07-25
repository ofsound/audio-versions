import SwiftUI

struct ReviewPlayerView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @State private var editingAnnotation: ReviewAnnotation?
    @State private var isEditingFileNotes = false
    @State private var isAddingToJournal = false

    let songID: String
    let versionID: String
    let linkTarget: SongLinkTarget?

    init(
        songID: String,
        versionID: String,
        linkTarget: SongLinkTarget? = nil
    ) {
        self.songID = songID
        self.versionID = versionID
        self.linkTarget = linkTarget
    }

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
                        audioRouteControls
                        fileNotesCard(version: version)
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
                .appCanvas()
                .navigationTitle(song?.title ?? "Audio Versions")
                .navigationBarTitleDisplayMode(.inline)
                .addToJournalBottomBar {
                    isAddingToJournal = true
                }
                .sheet(item: $editingAnnotation) { annotation in
                    AnnotationEditorView(annotation: annotation, duration: version.duration) {
                        store.save($0, in: version.id)
                    }
                }
                .sheet(isPresented: $isEditingFileNotes) {
                    PlainTextNoteEditorView(
                        title: "File Notes",
                        accessibilityLabel: "Notes for \(version.name)",
                        text: version.notes
                    ) { notes in
                        store.saveAudioFileNotes(notes, audioFileID: version.id)
                    }
                }
                .sheet(isPresented: $isAddingToJournal) {
                    PlainTextNoteEditorView(
                        title: "Add to Journal",
                        accessibilityLabel: "Add to song journal",
                        text: "",
                        requiresNonEmptyDraft: true
                    ) { entry in
                        store.appendSongJournalEntry(entry, songID: songID)
                    }
                }
                .task(id: versionID) {
                    if let linkTarget {
                        let annotationTime = linkTarget.annotationID.flatMap { annotationID in
                            version.annotations.first { $0.id == annotationID }?.startTime
                        }
                        store.open(
                            version: version,
                            at: annotationTime ?? linkTarget.time ?? 0,
                            autoplay: linkTarget.autoplay
                        )
                    } else {
                        store.preparePlayback(for: version)
                    }
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

    private func fileNotesCard(version: AudioVersion) -> some View {
        Button {
            isEditingFileNotes = true
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("File Notes", systemImage: "note.text")
                        .font(.headline)
                        .foregroundStyle(palette.textPrimary)
                    Spacer()
                    Text(version.notes.isEmpty ? "Add" : "Edit")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(palette.accentText)
                }

                Text(version.notes.isEmpty ? "Add context for this audio file." : version.notes)
                    .font(.subheadline)
                    .foregroundStyle(version.notes.isEmpty ? palette.textSecondary : palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(18)
            .appCard()
        }
        .buttonStyle(.plain)
    }

    private func playerCard(version: AudioVersion) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                Text(version.name)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(palette.textPrimary)

                VersionMetadataLine(version: version)

                if version.annotationCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "text.bubble")
                        Text(
                            version.annotationCount == 1
                                ? "1 annotation"
                                : "\(version.annotationCount) annotations"
                        )
                    }
                    .font(.caption)
                    .foregroundStyle(palette.accentText)
                }
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
            .foregroundStyle(palette.textSecondary)

            if let status = store.playbackStatusText, store.playbackErrorMessage == nil {
                HStack(spacing: 8) {
                    if store.isPreparingPlayback || status == "Buffering…" {
                        ProgressView()
                            .controlSize(.small)
                            .tint(palette.accent)
                    }
                    Text(status)
                }
                .font(.footnote)
                .foregroundStyle(palette.textSecondary)
                .frame(maxWidth: .infinity, alignment: .center)
            }

            if let error = store.playbackErrorMessage {
                VStack(alignment: .leading, spacing: 10) {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(palette.danger)
                    Button("Retry playback") {
                        store.retryPlayback(for: version)
                    }
                    .buttonStyle(.bordered)
                    .tint(palette.accent)
                }
            }

            HStack(spacing: 0) {
                Button {
                    store.seek(to: 0, in: version)
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(palette.accentText)
                        .background(palette.accentSoft, in: Circle())
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Reset playhead")

                Button {
                    store.skip(by: -10, in: version)
                } label: {
                    Image(systemName: "gobackward.10")
                        .foregroundStyle(palette.accentText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Skip back 10 seconds")

                Button {
                    store.togglePlayback(for: version)
                } label: {
                    Group {
                        if store.isPreparingPlayback {
                            ProgressView()
                                .tint(palette.onAccent)
                        } else {
                            Image(systemName: store.isPlaying ? "pause.fill" : "play.fill")
                        }
                    }
                    .font(.title2)
                    .frame(width: 58, height: 58)
                    .foregroundStyle(palette.onAccent)
                    .background(palette.accent, in: Circle())
                    .shadow(color: palette.accentGlow, radius: 14, y: 4)
                }
                .frame(maxWidth: .infinity)
                .disabled(store.isPreparingPlayback)
                .accessibilityLabel(store.isPlaying ? "Pause" : "Play")

                Button {
                    store.skip(by: 10, in: version)
                } label: {
                    Image(systemName: "goforward.10")
                        .foregroundStyle(palette.accentText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Skip forward 10 seconds")

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
                        .foregroundStyle(palette.accentText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Playback speed")
            }
            .font(.title3)
        }
        .padding(18)
        .appCard()
    }

    private var audioRouteControls: some View {
        HStack(spacing: 16) {
            Image(systemName: "speaker.wave.2")
                .font(.body)
                .foregroundStyle(palette.textSecondary)
                .accessibilityLabel(store.outputRouteName)

            AudioRoutePicker()
                .frame(width: 28, height: 28)
                .accessibilityLabel("Choose audio output")
        }
        .frame(maxWidth: .infinity)
    }

    private func annotationActions(version: AudioVersion) -> some View {
        HStack(spacing: 12) {
            Button {
                editingAnnotation = newAnnotation(kind: .point, version: version)
            } label: {
                Label("Add point", systemImage: "mappin.and.ellipse")
                    .foregroundStyle(palette.onAccent)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(palette.accent)

            Button {
                editingAnnotation = newAnnotation(kind: .range, version: version)
            } label: {
                Label("Add range", systemImage: "selection.pin.in.out")
                    .foregroundStyle(palette.accentText)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(palette.accent)
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
