import SwiftUI

struct AddToJournalButton: View {
    @Environment(\.palette) private var palette

    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Add to Journal", systemImage: "text.badge.plus")
                .foregroundStyle(palette.accentText)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(palette.accent)
        .controlSize(.large)
        .accessibilityLabel("Add to Journal")
    }
}

/// Fixed bottom control matched to the library `.searchable` field.
struct AddToJournalBottomBar: View {
    @Environment(\.palette) private var palette

    let action: () -> Void

    var body: some View {
        AddToJournalButton(action: action)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
            .background {
                palette.canvas
                    .opacity(0.96)
            }
    }
}

extension View {
    /// Pins Add to Journal to the same low placement as library search: from the
    /// physical bottom edge (into the home-indicator inset), not the safe-area floor.
    func addToJournalBottomBar(action: @escaping () -> Void) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear
                .frame(height: 56)
                .accessibilityHidden(true)
        }
        .overlay {
            GeometryReader { proxy in
                let bottomPadding: CGFloat = proxy.safeAreaInsets.bottom > 0 ? 10 : 8
                VStack(spacing: 0) {
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .allowsHitTesting(false)
                    AddToJournalBottomBar(action: action)
                        .padding(.bottom, bottomPadding)
                }
            }
            .ignoresSafeArea(edges: .bottom)
        }
    }
}
