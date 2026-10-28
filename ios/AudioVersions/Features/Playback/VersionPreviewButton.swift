import SwiftUI

/// Index and version rows reflect the shared transport, including full-player playback.
struct VersionPreviewButton: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette

    let version: AudioVersion?
    let title: String
    var compact = false

    private var isPreviewing: Bool {
        version.map { store.isPreviewing($0) } ?? false
    }

    var body: some View {
        Button {
            if let version { store.togglePreview(for: version) }
        } label: {
            RoundedRectangle(cornerRadius: compact ? 8 : 12, style: .continuous)
                .fill(palette.brandTile)
                .frame(width: compact ? 36 : 54, height: compact ? 36 : 54)
                .overlay {
                    Image(systemName: isPreviewing ? "stop.fill" : "play.fill")
                        .font(compact ? .subheadline.weight(.semibold) : .title3.weight(.semibold))
                        .foregroundStyle(palette.onAccent)
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(version == nil)
        .accessibilityLabel("\(isPreviewing ? "Stop" : "Play") preview for \(title)")
        .accessibilityValue(version?.name ?? "No versions")
    }
}

/// Chooses which file the library index preview plays. Starring again clears it.
struct VersionPreviewStarButton: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette

    let songID: String
    let version: AudioVersion

    private var isStarred: Bool {
        store.songs.first { $0.id == songID }?.starredAudioFileID == version.id
    }

    var body: some View {
        Button {
            store.toggleStarredAudioFile(songID: songID, audioFileID: version.id)
        } label: {
            Image(systemName: isStarred ? "star.fill" : "star")
                .font(.body.weight(.semibold))
                .foregroundStyle(isStarred ? palette.accent : palette.textTertiary)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(isStarred ? "Unstar" : "Star") \(version.name)")
        .accessibilityHint(isStarred ? "Use newest file for index preview" : "Use this file for index preview")
        .accessibilityAddTraits(isStarred ? .isSelected : [])
    }
}
