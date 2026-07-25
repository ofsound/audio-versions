import SwiftUI

/// Shared bottom chrome for library search and Add to Journal.
/// Same `safeAreaInset`, same padding — no per-screen offset guessing.
extension View {
    func bottomScreenChrome<Chrome: View>(
        @ViewBuilder chrome: () -> Chrome
    ) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            chrome()
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity)
                .background {
                    BottomScreenChromeBackground()
                }
        }
    }

    func addToJournalBottomBar(action: @escaping () -> Void) -> some View {
        bottomScreenChrome {
            AddToJournalButton(action: action)
        }
    }
}

/// Neutral elevated footer that sits apart from the canvas content above it.
private struct BottomScreenChromeBackground: View {
    @Environment(\.palette) private var palette

    var body: some View {
        palette.surface
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(palette.hairline)
                    .frame(height: 1)
                    .frame(maxWidth: .infinity)
            }
    }
}
