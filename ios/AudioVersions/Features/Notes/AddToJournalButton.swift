import SwiftUI
import UIKit

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
                    .ignoresSafeArea(edges: .bottom)
            }
    }
}

extension View {
    /// Pins Add to Journal to the same vertical placement as library `.searchable`:
    /// just above the home indicator, not parked on the safe-area floor.
    func addToJournalBottomBar(action: @escaping () -> Void) -> some View {
        let shift = AddToJournalBottomPlacement.shiftIntoHomeIndicatorInset
        return safeAreaInset(edge: .bottom, spacing: 0) {
            AddToJournalBottomBar(action: action)
                // `safeAreaInset` lays out on the safe-area floor; move down so the
                // control’s bottom matches search (~10pt above the screen bottom).
                .offset(y: shift)
                // Keep scroll clearance honest after the visual shift.
                .padding(.bottom, -shift)
        }
    }
}

private enum AddToJournalBottomPlacement {
    /// Gap under the control, matching `.searchable` above the home indicator.
    static let bottomGap: CGFloat = 10

    static var shiftIntoHomeIndicatorInset: CGFloat {
        max(0, windowBottomSafeInset - bottomGap)
    }

    private static var windowBottomSafeInset: CGFloat {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        return window?.safeAreaInsets.bottom ?? 0
    }
}
