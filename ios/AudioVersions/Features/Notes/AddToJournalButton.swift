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

/// Fixed bottom chrome shared by song detail and the player so the control
/// sits in the same place on both screens.
struct AddToJournalBottomBar<Accessory: View>: View {
    @Environment(\.palette) private var palette

    let action: () -> Void
    @ViewBuilder let accessory: () -> Accessory

    var body: some View {
        VStack(spacing: 10) {
            AddToJournalButton(action: action)

            accessory()
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background {
            palette.canvas
                .opacity(0.96)
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(palette.hairline)
                        .frame(height: 1)
                }
        }
    }
}

extension AddToJournalBottomBar where Accessory == EmptyView {
    init(action: @escaping () -> Void) {
        self.init(action: action, accessory: { EmptyView() })
    }
}
