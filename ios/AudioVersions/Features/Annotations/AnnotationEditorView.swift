import SwiftUI

struct AnnotationEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette
    @FocusState private var focusedField: Field?
    @State private var annotation: ReviewAnnotation

    let duration: TimeInterval
    let onSave: (ReviewAnnotation) -> Void

    private enum Field {
        case title
        case body
    }

    init(
        annotation: ReviewAnnotation,
        duration: TimeInterval,
        onSave: @escaping (ReviewAnnotation) -> Void
    ) {
        _annotation = State(initialValue: annotation)
        self.duration = duration
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Annotation type", selection: $annotation.kind) {
                        Label("Marker", systemImage: "mappin").tag(ReviewAnnotation.Kind.point)
                        Label("Range", systemImage: "selection.pin.in.out").tag(ReviewAnnotation.Kind.range)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: annotation.kind) { _, newKind in
                        if newKind == .point {
                            annotation.endTime = nil
                        } else if annotation.endTime == nil {
                            annotation.startTime = min(annotation.startTime, max(0, duration - 0.5))
                            annotation.endTime = min(duration, annotation.startTime + 8)
                        }
                    }

                    TimeStepper(
                        title: "Starts",
                        value: $annotation.startTime,
                        range: 0...duration
                    )

                    if annotation.kind == .range {
                        TimeStepper(
                            title: "Ends",
                            value: Binding(
                                get: { annotation.endTime ?? annotation.startTime },
                                set: { annotation.endTime = max(annotation.startTime + 0.5, $0) }
                            ),
                            range: min(duration, annotation.startTime + 0.5)...duration
                        )
                    }
                }
                .listRowBackground(palette.surface)

                Section("Feedback") {
                    TextField("Title", text: $annotation.title)
                        .focused($focusedField, equals: .title)

                    TextField("Add detail", text: $annotation.body, axis: .vertical)
                        .lineLimit(4...9)
                        .focused($focusedField, equals: .body)
                }
                .listRowBackground(palette.surface)
            }
            .scrollContentBackground(.hidden)
            .appCanvas()
            .navigationTitle(annotation.title.isEmpty ? "New annotation" : "Edit annotation")
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
                        annotation.updatedAt = .now
                        onSave(annotation)
                        dismiss()
                    }
                    .disabled(annotation.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                if annotation.title.isEmpty {
                    focusedField = .title
                }
            }
        }
    }
}

private struct TimeStepper: View {
    let title: String
    @Binding var value: TimeInterval
    let range: ClosedRange<TimeInterval>

    var body: some View {
        Stepper(value: $value, in: range, step: 0.5) {
            LabeledContent(title, value: value.playbackTimestamp)
        }
        .accessibilityValue(value.playbackTimestamp)
    }
}
