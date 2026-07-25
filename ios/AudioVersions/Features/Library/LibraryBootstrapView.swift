import SwiftUI

/// Quiet full-screen placeholder shown while a signed-in session restores or the
/// cloud library loads for the first time.
struct LibraryBootstrapView: View {
    @Environment(\.palette) private var palette

    var showsTitle: Bool = false

    var body: some View {
        VStack(spacing: 18) {
            if showsTitle {
                Text("Audio Versions")
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(palette.textPrimary)
            }

            ProgressView()
                .controlSize(.regular)
                .tint(palette.accent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .appCanvas()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loading library")
    }
}
