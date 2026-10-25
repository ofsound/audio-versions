import SwiftUI

struct PlainTextNoteEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette
    @FocusState private var isEditorFocused: Bool
    @State private var draft: String
    @State private var saveError: String?

    let title: String
    let accessibilityLabel: String
    let requiresNonEmptyDraft: Bool
    let onSave: (String) throws -> Void

    private var canSave: Bool {
        !requiresNonEmptyDraft
            || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init(
        title: String,
        accessibilityLabel: String,
        text: String,
        requiresNonEmptyDraft: Bool = false,
        onSave: @escaping (String) throws -> Void
    ) {
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        self.requiresNonEmptyDraft = requiresNonEmptyDraft
        _draft = State(initialValue: text)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            TextEditor(text: $draft)
                .focused($isEditorFocused)
                .font(.body)
                .foregroundStyle(palette.textPrimary)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .appCard()
                .padding(16)
                .appCanvas()
                .accessibilityLabel(accessibilityLabel)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .presentationBackground(palette.canvas)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            do { try onSave(draft); dismiss() }
                            catch { saveError = error.localizedDescription }
                        }
                        .disabled(!canSave)
                    }
                }
                .alert("Notes were not saved", isPresented: Binding(
                    get: { saveError != nil }, set: { if !$0 { saveError = nil } }
                )) { Button("Keep editing", role: .cancel) { saveError = nil } }
                message: { Text(saveError ?? "Try saving again.") }
                .onAppear {
                    isEditorFocused = true
                }
        }
    }
}
