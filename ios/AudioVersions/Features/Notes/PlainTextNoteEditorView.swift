import SwiftUI

struct PlainTextNoteEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isEditorFocused: Bool
    @State private var draft: String

    let title: String
    let accessibilityLabel: String
    let onSave: (String) -> Void

    init(
        title: String,
        accessibilityLabel: String,
        text: String,
        onSave: @escaping (String) -> Void
    ) {
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        _draft = State(initialValue: text)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            TextEditor(text: $draft)
                .focused($isEditorFocused)
                .font(.body)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemGroupedBackground))
                .accessibilityLabel(accessibilityLabel)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            onSave(draft)
                            dismiss()
                        }
                    }
                }
                .onAppear {
                    isEditorFocused = true
                }
        }
    }
}
