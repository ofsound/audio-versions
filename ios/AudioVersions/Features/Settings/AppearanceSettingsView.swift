import SwiftUI

struct AppearanceSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette
    @ObservedObject var appearance: AppearanceStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    optionTiles
                    livePreview
                }
                .padding(20)
            }
            .appCanvas()
            .navigationTitle("Appearance")
            .navigationBarTitleDisplayMode(.inline)
            .presentationBackground(palette.canvas)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var optionTiles: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(AppearancePreference.allCases) { preference in
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            appearance.preference = preference
                        }
                    } label: {
                        AppearanceOptionTile(
                            preference: preference,
                            isSelected: appearance.preference == preference
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(preference.label)
                    .accessibilityAddTraits(
                        appearance.preference == preference ? [.isButton, .isSelected] : .isButton
                    )
                }
            }

            Text("System follows Display & Brightness on this device. Light and Dark stay fixed no matter what iOS is doing.")
                .font(.footnote)
                .foregroundStyle(palette.textSecondary)
        }
    }

    private var livePreview: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Preview")
                .font(.headline)
                .foregroundStyle(palette.textPrimary)

            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(palette.brandTile)
                        .frame(width: 40, height: 40)
                        .overlay {
                            Image(systemName: "waveform")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(palette.onAccent)
                        }

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Afterglow")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(palette.textPrimary)
                        Text("Mix B — 3:24")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(palette.textSecondary)
                    }

                    Spacer()

                    Image(systemName: "play.fill")
                        .font(.subheadline)
                        .frame(width: 34, height: 34)
                        .foregroundStyle(palette.onAccent)
                        .background(palette.accent, in: Circle())
                        .shadow(color: palette.accentGlow, radius: 10, y: 3)
                }

                MiniWaveform(palette: palette, progress: 0.42, barCount: 34)
                    .frame(height: 46)

                HStack(spacing: 8) {
                    Label("Chorus lift", systemImage: "mappin")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(palette.accentText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(palette.accentSoft, in: Capsule())

                    Text("1:24")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.textTertiary)
                }
            }
            .padding(18)
            .appCard()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preview of the selected appearance")
    }
}

private struct AppearanceOptionTile: View {
    @Environment(\.palette) private var palette

    let preference: AppearancePreference
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 10) {
            miniature
                .frame(height: 138)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(
                            isSelected ? palette.accent : palette.hairlineStrong,
                            lineWidth: isSelected ? 2 : 1
                        )
                }

            HStack(spacing: 5) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : preference.symbolName)
                Text(preference.label)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(isSelected ? palette.accentText : palette.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var miniature: some View {
        switch preference {
        case .light:
            MiniatureScreen(palette: .light)
        case .dark:
            MiniatureScreen(palette: .dark)
        case .system:
            MiniatureScreen(palette: .light)
                .overlay {
                    MiniatureScreen(palette: .dark)
                        .mask {
                            GeometryReader { proxy in
                                Path { path in
                                    path.move(to: CGPoint(x: proxy.size.width, y: 0))
                                    path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height))
                                    path.addLine(to: CGPoint(x: 0, y: proxy.size.height))
                                    path.closeSubpath()
                                }
                            }
                        }
                }
        }
    }
}

/// A miniature of the player screen, drawn in an explicit palette so both
/// appearances can be shown side by side.
private struct MiniatureScreen: View {
    let palette: AppPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(palette.brandTile)
                    .frame(width: 14, height: 14)

                VStack(alignment: .leading, spacing: 3) {
                    Capsule().fill(palette.textPrimary.opacity(0.85))
                        .frame(width: 38, height: 4)
                    Capsule().fill(palette.textTertiary)
                        .frame(width: 24, height: 3)
                }
            }

            VStack(alignment: .leading, spacing: 7) {
                MiniWaveform(palette: palette, progress: 0.45, barCount: 18)
                    .frame(height: 26)

                HStack(spacing: 5) {
                    Circle()
                        .fill(palette.accent)
                        .frame(width: 14, height: 14)
                        .overlay {
                            Image(systemName: "play.fill")
                                .font(.system(size: 6, weight: .bold))
                                .foregroundStyle(palette.onAccent)
                        }
                    Capsule().fill(palette.textTertiary)
                        .frame(width: 20, height: 3)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(palette.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(palette.sheen)
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(palette.hairline, lineWidth: 1)
            }

            VStack(alignment: .leading, spacing: 4) {
                Capsule().fill(palette.accentText.opacity(0.9))
                    .frame(width: 30, height: 3)
                Capsule().fill(palette.textTertiary)
                    .frame(width: 46, height: 3)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(palette.surfaceInset)
            }

            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(palette.canvas)
    }
}

private struct MiniWaveform: View {
    private static let peaks: [Double] = [
        0.28, 0.52, 0.74, 0.46, 0.88, 0.62, 0.36, 0.71, 0.94, 0.58,
        0.33, 0.66, 0.85, 0.49, 0.27, 0.6, 0.79, 0.42, 0.9, 0.55,
        0.31, 0.68, 0.83, 0.47, 0.35, 0.73, 0.96, 0.51, 0.29, 0.64,
        0.81, 0.44, 0.87, 0.57
    ]

    let palette: AppPalette
    let progress: Double
    let barCount: Int

    var body: some View {
        GeometryReader { proxy in
            HStack(alignment: .center, spacing: max(1, proxy.size.width / CGFloat(barCount) * 0.4)) {
                ForEach(0..<barCount, id: \.self) { index in
                    let isPlayed = Double(index) / Double(max(1, barCount - 1)) <= progress
                    Capsule()
                        .fill(isPlayed ? AnyShapeStyle(palette.waveformPlayed) : AnyShapeStyle(palette.waveformBase))
                        .frame(
                            maxWidth: .infinity,
                            maxHeight: max(2, proxy.size.height * peak(at: index))
                        )
                }
            }
            .frame(height: proxy.size.height)
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(palette.playhead)
                    .frame(width: 1.5)
                    .shadow(color: palette.playheadGlow, radius: 4)
                    .offset(x: proxy.size.width * progress)
            }
        }
    }

    private func peak(at index: Int) -> Double {
        Self.peaks[index % Self.peaks.count]
    }
}

#Preview {
    AppearanceSettingsView(appearance: AppearanceStore())
        .environment(\.palette, .dark)
        .preferredColorScheme(.dark)
}
