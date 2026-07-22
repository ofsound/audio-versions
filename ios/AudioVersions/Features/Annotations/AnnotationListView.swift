import SwiftUI

struct AnnotationListView: View {
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
                Spacer()
                Text(annotations.count, format: .number)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
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
                    .foregroundStyle(.orange)
                    .frame(width: 22, height: 22)
                    .background(.orange.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(annotation.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        Text(annotation.timeLabel)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(isActive ? .orange : .secondary)
                    }

                    if !annotation.body.isEmpty {
                        Text(annotation.body)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                    }
                }
            }
            .padding(13)
            .background(isActive ? Color.orange.opacity(0.1) : Color.secondary.opacity(0.07))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isActive ? Color.orange.opacity(0.5) : .clear, lineWidth: 1)
            }
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
            .tint(.orange)
        }
    }
}
