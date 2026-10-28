import SwiftUI

struct SongNoteTabBar: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    let song: Song
    @Binding var selectedID: String
    let onRename: (SongNoteTab) -> Void
    let onDelete: (SongNoteTab) -> Void

    private var tabs: [SongNoteTab] { song.resolvedNoteTabs }
    private var activeID: String? { tabs.first { $0.id == selectedID }?.id ?? tabs.first?.id }

    var body: some View {
        HStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: true) {
                    HStack(spacing: 6) {
                        ForEach(tabs, id: \.id) { tab in
                            SongNoteTabChip(
                                tab: tab,
                                isActive: activeID == tab.id,
                                canDelete: tabs.count > 1,
                                onSelect: { selectedID = $0.id },
                                onRename: onRename,
                                onDelete: onDelete
                            )
                        }
                    }
                }
                .onAppear { if let id = activeID { proxy.scrollTo(id, anchor: .center) } }
                .onChange(of: activeID) { _, id in
                    if let id { store.selectNoteTab(songID: song.id, tabID: id); withAnimation { proxy.scrollTo(id, anchor: .center) } }
                }
            }
            Button { create() } label: { Image(systemName: "plus").frame(width: 36, height: 36) }
                .buttonStyle(.borderless)
                .accessibilityLabel("New note tab")
        }
    }

    private func create() {
        var number = 1
        while tabs.contains(where: { $0.name.localizedCaseInsensitiveCompare("Untitled \(number)") == .orderedSame }) { number += 1 }
        let name = "Untitled \(number)"
        if let id = store.createNoteTab(songID: song.id, name: name) { selectedID = id }
    }
}

/// One tab's menu must close over that chip. A shared dialog inside the list row
/// was reusing the previous tab, so Save renamed a different document.
private struct SongNoteTabChip: View {
    @Environment(\.palette) private var palette
    let tab: SongNoteTab
    let isActive: Bool
    let canDelete: Bool
    let onSelect: (SongNoteTab) -> Void
    let onRename: (SongNoteTab) -> Void
    let onDelete: (SongNoteTab) -> Void

    var body: some View {
        Button { onSelect(tab) } label: {
            Text(tab.name)
                .font(.subheadline.weight(isActive ? .semibold : .regular))
                .lineLimit(1)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(isActive ? palette.accentSoft : palette.surface,
                            in: RoundedRectangle(cornerRadius: 6))
                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(
                    isActive ? palette.accent : palette.hairlineStrong, lineWidth: 1) }
                .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .foregroundStyle(palette.textPrimary)
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .contextMenu {
            Button("Rename tab", systemImage: "pencil") { onRename(tab) }
            if canDelete {
                Button("Delete tab and notes", systemImage: "trash", role: .destructive) {
                    onDelete(tab)
                }
                .accessibilityLabel("Delete \(tab.name) tab")
            }
        }
        .id(tab.id)
    }
}
