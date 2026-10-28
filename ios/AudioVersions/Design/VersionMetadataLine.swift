import SwiftUI

/// Created date, duration, and optional integrated LUFS on one line.
struct VersionMetadataLine: View {
    @Environment(\.palette) private var palette

    let version: AudioVersion

    var body: some View {
        Text(label)
            .font(.caption)
            .foregroundStyle(palette.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .allowsTightening(true)
    }

    /// `Oct 28, 2026 • 1:13 • -11.0 LUFS` — short month so the row does not wrap.
    private var label: String {
        var parts = [
            version.createdAt.formatted(.dateTime.month(.abbreviated).day().year()),
            version.duration.playbackTimestamp,
        ]
        if let loudness = version.loudness {
            parts.append(loudness.integratedLufsLabel)
        }
        return parts.joined(separator: " • ")
    }
}
