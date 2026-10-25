import SwiftUI

struct SongNoteTabBar: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    let song: Song
    @Binding var selectedID: String
    @Binding var closedIDs: Set<String>
    @State private var isCreating = false
    @State private var renaming: SongNoteTab?
    @State private var deleting: SongNoteTab?
    @State private var name = ""

    private var tabs: [SongNoteTab] { song.resolvedNoteTabs }
    private var openTabs: [SongNoteTab] { tabs.filter { !closedIDs.contains($0.id) } }
    private var activeID: String? { openTabs.first { $0.id == selectedID }?.id ?? openTabs.first?.id }

    var body: some View {
        HStack(spacing: 8) {
            ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: true) {
                HStack(spacing: 6) {
                    ForEach(openTabs) { tab in
                        Button { selectedID = tab.id } label: {
                            Text(tab.name)
                                .font(.subheadline.weight(activeID == tab.id ? .semibold : .regular))
                                .lineLimit(1)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(activeID == tab.id ? palette.accentSoft : palette.surface,
                                            in: RoundedRectangle(cornerRadius: 6))
                                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(
                                    activeID == tab.id ? palette.accent : palette.hairlineStrong, lineWidth: 1) }
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(palette.textPrimary)
                        .accessibilityAddTraits(activeID == tab.id ? .isSelected : [])
                        .contextMenu {
                            Button("Rename tab", systemImage: "pencil") { name = tab.name; renaming = tab }
                            Button("Close tab", systemImage: "xmark") { close(tab) }
                            Button("Delete notes…", systemImage: "trash", role: .destructive) { deleting = tab }
                                .disabled(tabs.count <= 1)
                        }
                    }
                }
            }
            .onAppear { if let id = activeID { proxy.scrollTo(id, anchor: .center) } }
            .onChange(of: activeID) { _, id in
                if let id { withAnimation { proxy.scrollTo(id, anchor: .center) } }
            }
            }
            Menu {
                Button("New named tab…", systemImage: "plus") { name = ""; isCreating = true }
                ForEach(["Mixing", "Recording", "Mastering"].filter { preset in
                    !tabs.contains { $0.name.localizedCaseInsensitiveCompare(preset) == .orderedSame }
                }, id: \.self) { preset in
                    Button(preset) { create(preset) }
                }
                if !closedIDs.isEmpty {
                    Section("Reopen") {
                        ForEach(tabs.filter { closedIDs.contains($0.id) }) { tab in
                            Button(tab.name) { closedIDs.remove(tab.id); selectedID = tab.id }
                        }
                    }
                }
            } label: { Image(systemName: "plus").frame(width: 36, height: 36) }
                .accessibilityLabel("New or reopen note tab")
        }
        .alert("New note tab", isPresented: $isCreating) {
            TextField("Tab name", text: $name)
            Button("Create") { create(name) }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Cancel", role: .cancel) {}
        }
        .alert("Rename note tab", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Tab name", text: $name)
            Button("Save") { if let tab = renaming { store.renameNoteTab(songID: song.id, tabID: tab.id, name: name) }; renaming = nil }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Delete this tab and all its notes? Closing a tab keeps its notes instead.",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete notes", role: .destructive) {
                if let tab = deleting { store.deleteNoteTab(songID: song.id, tabID: tab.id); closedIDs.remove(tab.id); selectedID = openTabs.first { $0.id != tab.id }?.id ?? "" }
                deleting = nil
            }
        }
    }
    private func close(_ tab: SongNoteTab) {
        closedIDs.insert(tab.id)
        if selectedID == tab.id { selectedID = openTabs.first?.id ?? "" }
    }
    private func create(_ name: String) {
        if let id = store.createNoteTab(songID: song.id, name: name) { selectedID = id; closedIDs.remove(id) }
    }
}
