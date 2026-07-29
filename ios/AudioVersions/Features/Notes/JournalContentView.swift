import SwiftUI

/// Read-only journal body that rewrites song/marker URLs and timestamps into inline chips,
/// matching the desktop journal editor’s link-to-icon strategy.
struct JournalContentView: View {
    @Environment(\.palette) private var palette

    let text: String
    let placeholder: String
    let onOpenLink: (SongLinkTarget) -> Void

    private var lines: [JournalRenderedLine] {
        SongJournalLink.renderedLines(from: text)
    }

    var body: some View {
        Group {
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(placeholder)
                    .foregroundStyle(palette.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        JournalContentLineView(line: line, onOpenLink: onOpenLink)
                            .padding(
                                .bottom,
                                line.hasTimestamp && index < lines.count - 1 ? 8 : 0
                            )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private extension JournalRenderedLine {
    var hasTimestamp: Bool {
        segments.contains {
            if case .timestamp = $0 {
                return true
            }
            return false
        }
    }
}

private struct JournalContentLineView: View {
    @Environment(\.palette) private var palette

    let line: JournalRenderedLine
    let onOpenLink: (SongLinkTarget) -> Void

    private var hasInlineChip: Bool {
        line.segments.contains {
            switch $0 {
            case .link, .timestamp:
                true
            case .text:
                false
            }
        }
    }

    var body: some View {
        if line.segments.isEmpty {
            Text(" ")
                .font(.body)
                .foregroundStyle(palette.textPrimary)
                .accessibilityHidden(true)
        } else if !hasInlineChip,
                  case let .text(value)? = line.segments.first,
                  line.segments.count == 1
        {
            Text(value.isEmpty ? " " : value)
                .font(.body)
                .foregroundStyle(palette.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            JournalFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Array(line.segments.enumerated()), id: \.offset) { _, segment in
                    switch segment {
                    case let .text(value):
                        if !value.isEmpty {
                            Text(value)
                                .font(.body)
                                .foregroundStyle(palette.textPrimary)
                        }
                    case let .link(link):
                        JournalLinkChip(link: link, action: { onOpenLink(link.target) })
                    case let .timestamp(timestamp):
                        JournalTimestampChip(timestamp: timestamp)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct JournalLinkChip: View {
    @Environment(\.palette) private var palette

    let link: SongJournalLink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.accentText)

                Text(link.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.textPrimary)
                    .lineLimit(1)

                if let time = link.target.time {
                    Text(time.playbackTimestamp)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.textSecondary)
                        .padding(.leading, 6)
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(palette.hairlineStrong)
                                .frame(width: 1)
                        }
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(palette.accent.opacity(0.42), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Jump to \(link.label)")
        .accessibilityHint("Opens the linked version and marker position")
    }
}

private struct JournalTimestampChip: View {
    @Environment(\.palette) private var palette

    let timestamp: SongJournalTimestamp

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "clock")
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.accentText)

            Text(timestamp.label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(palette.accent.opacity(0.42), lineWidth: 1)
        }
        .accessibilityLabel("Timestamp \(timestamp.label)")
    }
}

/// Simple wrapping layout for mixed journal text and link chips.
private struct JournalFlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 6

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let rows = arrange(proposal: proposal, subviews: subviews)
        let width = proposal.width ?? rows.map(\.width).max() ?? 0
        let height = rows.reduce(CGFloat(0)) { partial, row in
            partial + row.height + (partial > 0 ? lineSpacing : 0)
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let rows = arrange(proposal: ProposedViewSize(width: bounds.width, height: nil), subviews: subviews)
        var y = bounds.minY

        for row in rows {
            var x = bounds.minX
            for item in row.items {
                subviews[item.index].place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(item.size)
                )
                x += item.size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct ArrangedItem {
        let index: Int
        let size: CGSize
    }

    private struct ArrangedRow {
        var items: [ArrangedItem] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> [ArrangedRow] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [ArrangedRow] = []
        var current = ArrangedRow()

        for (index, subview) in subviews.enumerated() {
            let remaining = current.items.isEmpty
                ? maxWidth
                : max(maxWidth - current.width - spacing, 0)
            let size = subview.sizeThatFits(
                ProposedViewSize(width: remaining.isFinite ? remaining : nil, height: nil)
            )
            let nextWidth = current.items.isEmpty
                ? size.width
                : current.width + spacing + size.width

            if !current.items.isEmpty, nextWidth > maxWidth {
                rows.append(current)
                current = ArrangedRow()
                let fullSize = subview.sizeThatFits(
                    ProposedViewSize(width: maxWidth.isFinite ? maxWidth : nil, height: nil)
                )
                current.items.append(ArrangedItem(index: index, size: fullSize))
                current.width = fullSize.width
                current.height = fullSize.height
                continue
            }

            current.items.append(ArrangedItem(index: index, size: size))
            current.width = current.items.count == 1
                ? size.width
                : current.width + spacing + size.width
            current.height = max(current.height, size.height)
        }

        if !current.items.isEmpty {
            rows.append(current)
        }

        return rows
    }
}
