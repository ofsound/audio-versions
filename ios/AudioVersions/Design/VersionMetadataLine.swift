import SwiftUI

/// Duration, session date, and optional integrated LUFS on one baseline-aligned row.
struct VersionMetadataLine: View {
    @Environment(\.palette) private var palette

    let version: AudioVersion

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "clock")
                Text(version.duration.playbackTimestamp)
            }
            Text("•")
            Text(version.createdAt, style: .date)
            if let loudness = version.loudness {
                Text("•")
                Text(loudness.integratedLufsLabel)
            }
        }
        .font(.caption)
        .foregroundStyle(palette.textSecondary)
    }
}
