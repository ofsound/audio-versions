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

/// Fixed bottom control aligned like the library `.searchable` field: low on the
/// screen with only a small gap above the home indicator.
struct AddToJournalBottomBar: View {
    @Environment(\.palette) private var palette

    let action: () -> Void

    var body: some View {
        AddToJournalButton(action: action)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
            .background {
                palette.canvas
                    .opacity(0.96)
                    .ignoresSafeArea(edges: .bottom)
            }
    }
}

extension View {
    /// Pins Add to Journal to the bottom edge of the screen (matching library
    /// search placement) while keeping scroll content clear of the control.
    func addToJournalBottomBar(action: @escaping () -> Void) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear
                .frame(height: 44)
                .accessibilityHidden(true)
        }
        .overlay(alignment: .bottom) {
            AddToJournalBottomBar(action: action)
                .ignoresSafeArea(edges: .bottom)
        }
    }
}
