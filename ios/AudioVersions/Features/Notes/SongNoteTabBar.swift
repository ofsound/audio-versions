import SwiftUI
import UIKit

struct SongNoteTabBar: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @Environment(\.colorScheme) private var colorScheme
    let song: Song
    @Binding var selectedID: String

    private var tabs: [SongNoteTab] { song.resolvedNoteTabs }
    private var activeID: String? { tabs.first { $0.id == selectedID }?.id ?? tabs.first?.id }

    var body: some View {
        HStack(spacing: 8) {
            SongNoteTabStrip(
                tabs: tabs,
                activeID: activeID,
                appearance: appearance,
                onSelect: { selectedID = $0.id },
                onRename: { tabID, name in
                    store.renameNoteTab(songID: song.id, tabID: tabID, name: name)
                },
                onDelete: remove
            )
            .frame(maxWidth: .infinity, minHeight: 36, maxHeight: 36, alignment: .leading)
            Button { create() } label: { Image(systemName: "plus").frame(width: 36, height: 36) }
                .buttonStyle(.borderless)
                .accessibilityLabel("New note tab")
        }
        .onChange(of: activeID) { _, id in
            if let id { store.selectNoteTab(songID: song.id, tabID: id) }
        }
    }

    private var appearance: SongNoteTabAppearance {
        SongNoteTabAppearance(
            text: UIColor(palette.textPrimary),
            activeFill: UIColor(palette.accentSoft),
            idleFill: UIColor(palette.surface),
            activeStroke: UIColor(palette.accent),
            idleStroke: UIColor(palette.hairlineStrong),
            dialogTint: UIColor(palette.accent),
            scheme: colorScheme
        )
    }

    private func create() {
        var number = 1
        while tabs.contains(where: { $0.name.localizedCaseInsensitiveCompare("Untitled \(number)") == .orderedSame }) { number += 1 }
        let name = "Untitled \(number)"
        if let id = store.createNoteTab(songID: song.id, name: name) { selectedID = id }
    }

    private func remove(_ tab: SongNoteTab) {
        let tabs = store.songs.first { $0.id == song.id }?.resolvedNoteTabs ?? []
        let index = tabs.firstIndex { $0.id == tab.id } ?? 0
        guard store.deleteNoteTab(songID: song.id, tabID: tab.id) else { return }
        guard selectedID == tab.id else { return }
        let remaining = tabs.filter { $0.id != tab.id }
        let nextIndex = max(0, index - 1)
        if remaining.indices.contains(nextIndex) { selectedID = remaining[nextIndex].id }
    }
}

struct SongNoteTabAppearance {
    let text: UIColor
    let activeFill: UIColor
    let idleFill: UIColor
    let activeStroke: UIColor
    let idleStroke: UIColor
    let dialogTint: UIColor
    let scheme: ColorScheme
}

/// Builds a new alert for one tab. A shared SwiftUI alert kept the first name it showed.
@MainActor
enum NoteTabDialogs {
    static func renameAlert(
        for tab: SongNoteTab,
        onSave: @escaping (_ tabID: String, _ name: String) -> Void
    ) -> UIAlertController {
        let alert = UIAlertController(title: "Rename note tab", message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.text = tab.name
            field.placeholder = "Tab name"
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Save", style: .default) { _ in
            onSave(tab.id, alert.textFields?.first?.text ?? "")
        })
        return alert
    }

    static func deleteAlert(for tab: SongNoteTab, onConfirm: @escaping () -> Void) -> UIAlertController {
        let alert = UIAlertController(
            title: "Delete “\(tab.name)” and all of its notes? This cannot be undone.",
            message: nil,
            preferredStyle: .actionSheet
        )
        alert.addAction(UIAlertAction(title: "Delete tab and notes", style: .destructive) { _ in onConfirm() })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        return alert
    }
}

/// A list row keeps only the first SwiftUI context menu, so every long-press renamed
/// Song Notes. These buttons own their menus and build the alert from the pressed tab.
private struct SongNoteTabStrip: UIViewRepresentable {
    let tabs: [SongNoteTab]
    let activeID: String?
    let appearance: SongNoteTabAppearance
    let onSelect: (SongNoteTab) -> Void
    let onRename: (_ tabID: String, _ name: String) -> Void
    let onDelete: (SongNoteTab) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> NoteTabStripView {
        let strip = NoteTabStripView()
        context.coordinator.strip = strip
        return strip
    }

    func updateUIView(_ strip: NoteTabStripView, context: Context) {
        context.coordinator.strip = strip
        context.coordinator.sync(
            tabs: tabs,
            activeID: activeID,
            appearance: appearance,
            onSelect: onSelect,
            onRename: onRename,
            onDelete: onDelete
        )
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: NoteTabStripView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? uiView.bounds.width, height: 36)
    }

    @MainActor
    final class Coordinator {
        weak var strip: NoteTabStripView?
        private var buttons: [String: NoteTabButton] = [:]
        private var scrolledID: String?

        func sync(
            tabs: [SongNoteTab],
            activeID: String?,
            appearance: SongNoteTabAppearance,
            onSelect: @escaping (SongNoteTab) -> Void,
            onRename: @escaping (_ tabID: String, _ name: String) -> Void,
            onDelete: @escaping (SongNoteTab) -> Void
        ) {
            guard let strip else { return }
            let ids = Set(tabs.map(\.id))
            for id in buttons.keys where !ids.contains(id) {
                buttons[id]?.removeFromSuperview()
                buttons[id] = nil
            }
            let canDelete = tabs.count > 1
            for (index, tab) in tabs.enumerated() {
                let button = buttons[tab.id] ?? NoteTabButton()
                buttons[tab.id] = button
                button.apply(
                    tab: tab,
                    isActive: tab.id == activeID,
                    canDelete: canDelete,
                    appearance: appearance,
                    onSelect: onSelect,
                    onRename: onRename,
                    onDelete: onDelete
                )
                strip.stack.insertArrangedSubview(button, at: index)
            }
            guard scrolledID != activeID else { return }
            let animate = scrolledID != nil
            scrolledID = activeID
            Task { @MainActor [weak strip] in
                guard let strip, let activeID, let button = strip.stack.arrangedSubviews.first(where: {
                    ($0 as? NoteTabButton)?.tab.id == activeID
                }) else { return }
                strip.center(button, animated: animate)
            }
        }
    }
}

private final class NoteTabStripView: UIScrollView {
    let stack = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        showsHorizontalScrollIndicator = true
        alwaysBounceHorizontal = true
        delaysContentTouches = false
        contentInsetAdjustmentBehavior = .never
        backgroundColor = .clear
        stack.axis = .horizontal
        stack.spacing = 6
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = true
        addSubview(stack)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        let fitted = stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        let size = CGSize(width: max(fitted.width, 1), height: bounds.height > 0 ? bounds.height : 36)
        if stack.frame.size != size { stack.frame = CGRect(origin: .zero, size: size) }
        if contentSize != size { contentSize = size }
    }

    func center(_ view: UIView, animated: Bool) {
        layoutIfNeeded()
        let frame = view.convert(view.bounds, to: self)
        guard bounds.width > 0 else { return }
        let maxOffset = max(0, contentSize.width - bounds.width)
        let x = min(max(0, frame.midX - bounds.width / 2), maxOffset)
        setContentOffset(CGPoint(x: x, y: 0), animated: animated)
    }
}

private final class NoteTabButton: UIButton {
    private(set) var tab = SongNoteTab(id: "", name: "", content: "")
    private var canDelete = false
    private var onSelect: (SongNoteTab) -> Void = { _ in }
    private var onRename: (String, String) -> Void = { _, _ in }
    private var onDelete: (SongNoteTab) -> Void = { _ in }
    private var dialogTint: UIColor = .label
    private var visualKey = ""
    private var menuShowsDelete = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        showsMenuAsPrimaryAction = false
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    func apply(
        tab: SongNoteTab,
        isActive: Bool,
        canDelete: Bool,
        appearance: SongNoteTabAppearance,
        onSelect: @escaping (SongNoteTab) -> Void,
        onRename: @escaping (String, String) -> Void,
        onDelete: @escaping (SongNoteTab) -> Void
    ) {
        self.tab = tab
        self.canDelete = canDelete
        self.onSelect = onSelect
        self.onRename = onRename
        self.onDelete = onDelete
        dialogTint = appearance.dialogTint
        accessibilityLabel = tab.name
        accessibilityIdentifier = "note-tab.\(tab.id)"
        if isActive {
            accessibilityTraits.insert(.selected)
        } else {
            accessibilityTraits.remove(.selected)
        }
        let visual = "\(tab.name)|\(isActive)|\(appearance.scheme)"
        if visualKey != visual {
            visualKey = visual
            var config = UIButton.Configuration.plain()
            config.title = tab.name
            config.baseForegroundColor = appearance.text
            config.baseBackgroundColor = isActive ? appearance.activeFill : appearance.idleFill
            config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
            config.background.backgroundColor = isActive ? appearance.activeFill : appearance.idleFill
            config.background.cornerRadius = 6
            config.background.strokeColor = isActive ? appearance.activeStroke : appearance.idleStroke
            config.background.strokeWidth = 1
            config.titleLineBreakMode = .byTruncatingTail
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var outgoing = incoming
                let base = UIFont.systemFont(ofSize: 15, weight: isActive ? .semibold : .regular)
                outgoing.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: base)
                return outgoing
            }
            configuration = config
            tintColor = appearance.text
        }
        if menu == nil || menuShowsDelete != canDelete {
            menuShowsDelete = canDelete
            rebuildMenu()
        }
    }

    private func rebuildMenu() {
        var actions = [
            UIAction(title: "Rename tab", image: UIImage(systemName: "pencil")) { [weak self] _ in
                self?.presentRename()
            }
        ]
        if canDelete {
            actions.append(UIAction(title: "Delete tab and notes", image: UIImage(systemName: "trash"), attributes: .destructive) { [weak self] _ in
                self?.presentDelete()
            })
        }
        menu = UIMenu(children: actions)
    }

    @objc private func tapped() {
        guard !tab.id.isEmpty else { return }
        onSelect(tab)
    }

    private func presentRename() {
        let tab = tab
        guard !tab.id.isEmpty else { return }
        let onRename = onRename
        let alert = NoteTabDialogs.renameAlert(for: tab) { tabID, name in onRename(tabID, name) }
        NoteTabPresenter.present(alert, from: self, tint: dialogTint)
    }

    private func presentDelete() {
        let tab = tab
        guard canDelete, !tab.id.isEmpty else { return }
        let onDelete = onDelete
        let alert = NoteTabDialogs.deleteAlert(for: tab) { onDelete(tab) }
        NoteTabPresenter.present(alert, from: self, tint: dialogTint)
    }
}

@MainActor
private enum NoteTabPresenter {
    static func present(_ alert: UIAlertController, from view: UIView, tint: UIColor) {
        alert.view.tintColor = tint
        if let popover = alert.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = view.bounds
        }
        attempt(alert, from: view, remaining: 12)
    }

    private static func attempt(_ alert: UIAlertController, from view: UIView, remaining: Int) {
        guard let presenter = presenter(from: view) else { return }
        if let presented = presenter.presentedViewController, !presented.isBeingDismissed, remaining > 0 {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(50))
                attempt(alert, from: view, remaining: remaining - 1)
            }
            return
        }
        presenter.present(alert, animated: true)
    }

    private static func presenter(from view: UIView) -> UIViewController? {
        var responder: UIResponder? = view
        var found: UIViewController?
        while let current = responder {
            if let controller = current as? UIViewController {
                found = controller
                break
            }
            responder = current.next
        }
        guard var top = found ?? view.window?.rootViewController else { return nil }
        while let presented = top.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
