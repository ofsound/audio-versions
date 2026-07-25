import SwiftUI

/// Created date, duration, and optional integrated LUFS on one baseline-aligned row.
struct VersionMetadataLine: View {
    @Environment(\.palette) private var palette

    let version: AudioVersion

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            Text(version.createdAt, style: .date)
            Text("•")
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "clock")
                Text(version.duration.playbackTimestamp)
            }
            if let loudness = version.loudness {
                Text("•")
                Text(loudness.integratedLufsLabel)
            }
        }
        .font(.caption)
        .foregroundStyle(palette.textSecondary)
    }
}
