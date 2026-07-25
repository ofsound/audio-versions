import SwiftUI

struct AddToJournalButton: View {
    @Environment(\.palette) private var palette

    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Add to Journal", systemImage: "text.badge.plus")
                .foregroundStyle(palette.onAccent)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(palette.accent)
        .controlSize(.large)
        .accessibilityLabel("Add to Journal")
    }
}
