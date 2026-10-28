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
    let noteTabs: [SongNoteTab]
    let selectedNoteTabID: Binding<String>?
    let songNotesFontSize: Int?
    let onAdjustSongNotesFontSize: ((Int) -> Void)?
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
        noteTabs: [SongNoteTab] = [],
        selectedNoteTabID: Binding<String>? = nil,
        songNotesFontSize: Int? = nil,
        onAdjustSongNotesFontSize: ((Int) -> Void)? = nil,
        onSave: @escaping (String) throws -> Void
    ) {
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        self.noteTabs = noteTabs
        self.selectedNoteTabID = selectedNoteTabID
        self.songNotesFontSize = songNotesFontSize
        self.onAdjustSongNotesFontSize = onAdjustSongNotesFontSize
        self.requiresNonEmptyDraft = requiresNonEmptyDraft
        _draft = State(initialValue: text)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let selectedNoteTabID {
                    Picker("Append to", selection: selectedNoteTabID) {
                        ForEach(noteTabs) { tab in Text(tab.name).tag(tab.id) }
                    }
                    .pickerStyle(.menu)
                    .tint(palette.accentText)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .accessibilityLabel("Destination note tab")
                }
                if let songNotesFontSize, let onAdjustSongNotesFontSize {
                    SongNoteTextSizeControls(fontSize: songNotesFontSize, onAdjust: onAdjustSongNotesFontSize)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, selectedNoteTabID == nil ? 8 : 0)
                }
                TextEditor(text: $draft)
                .focused($isEditorFocused)
                .font(songNotesFontSize.map { .system(size: CGFloat($0)) } ?? .body)
                .foregroundStyle(palette.textPrimary)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .appCard()
                .padding(16)
                .appCanvas()
                .accessibilityLabel(accessibilityLabel)
            }
                .appCanvas()
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
