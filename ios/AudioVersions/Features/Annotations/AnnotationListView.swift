import SwiftUI

struct AnnotationListView: View {
    @Environment(\.palette) private var palette

    let annotations: [ReviewAnnotation]
    let activeTime: TimeInterval
    let onSelect: (ReviewAnnotation) -> Void
    let onEdit: (ReviewAnnotation) -> Void
    let onDelete: (ReviewAnnotation) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Annotations")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(palette.textPrimary)
                Spacer()
                Text(annotations.count, format: .number)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(palette.textSecondary)
            }

            if annotations.isEmpty {
                ContentUnavailableView(
                    "No annotations yet",
                    systemImage: "text.bubble",
                    description: Text("Move the playhead and add a point or range to start a review.")
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
            } else {
                ForEach(annotations) { annotation in
                    AnnotationCard(
                        annotation: annotation,
                        isActive: isActive(annotation),
                        onSelect: { onSelect(annotation) },
                        onEdit: { onEdit(annotation) },
                        onDelete: { onDelete(annotation) }
                    )
                }
            }
        }
    }

    private func isActive(_ annotation: ReviewAnnotation) -> Bool {
        if let endTime = annotation.endTime, annotation.kind == .range {
            return (annotation.startTime...endTime).contains(activeTime)
        }
        return abs(activeTime - annotation.startTime) < 1
    }
}

private struct AnnotationCard: View {
    @Environment(\.palette) private var palette

    let annotation: ReviewAnnotation
    let isActive: Bool
    let onSelect: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: annotation.kind == .range ? "selection.pin.in.out" : "mappin")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(palette.accentText)
                    .frame(width: 22, height: 22)
                    .background(palette.accentSoft, in: Circle())

                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(annotation.title)
                            .font(.headline)
                            .foregroundStyle(palette.textPrimary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        Text(annotation.timeLabel)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(isActive ? palette.accentText : palette.textSecondary)
                    }

                    if !annotation.body.isEmpty {
                        Text(annotation.body)
                            .font(.subheadline)
                            .foregroundStyle(palette.textSecondary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                    }
                }
            }
            .padding(13)
            .appInsetCard(isHighlighted: isActive)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Edit", systemImage: "pencil", action: onEdit)
            Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
        }
        .accessibilityHint("Moves the playhead to this annotation")
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            .tint(palette.accent)
        }
    }
}
