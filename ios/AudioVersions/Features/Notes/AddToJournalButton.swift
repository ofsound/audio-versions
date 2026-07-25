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

/// Fixed bottom control matched to the library `.searchable` field: nestled into
/// the bottom safe area with only a small gap above the home indicator.
struct AddToJournalBottomBar: View {
    @Environment(\.palette) private var palette

    let action: () -> Void

    var body: some View {
        AddToJournalButton(action: action)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            // Keep the control low like `.searchable`; the home-indicator inset
            // already clears the bottom edge once the bar ignores that safe area.
            .padding(.bottom, 4)
            .frame(maxWidth: .infinity)
            .background {
                palette.canvas
                    .opacity(0.96)
                    .ignoresSafeArea(edges: .bottom)
            }
    }
}

extension View {
    /// Pins Add to Journal into the bottom safe area (matching library search
    /// placement) while keeping scroll content clear of the control.
    func addToJournalBottomBar(action: @escaping () -> Void) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear
                .frame(height: 52)
                .accessibilityHidden(true)
        }
        .overlay {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                AddToJournalBottomBar(action: action)
            }
            .ignoresSafeArea(edges: .bottom)
        }
    }
}
