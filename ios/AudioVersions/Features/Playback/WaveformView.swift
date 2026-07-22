import SwiftUI

struct WaveformView: View {
    let peaks: [Double]
    let duration: TimeInterval
    let currentTime: TimeInterval
    let annotations: [ReviewAnnotation]
    let onSeek: (TimeInterval) -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Canvas { context, size in
                    guard !peaks.isEmpty else { return }
                    let slotWidth = size.width / CGFloat(peaks.count)
                    let barWidth = max(1, slotWidth * 0.52)
                    let progress = duration > 0 ? currentTime / duration : 0

                    for (index, peak) in peaks.enumerated() {
                        let x = CGFloat(index) * slotWidth + slotWidth / 2
                        let height = max(3, size.height * CGFloat(peak))
                        let rect = CGRect(
                            x: x - barWidth / 2,
                            y: (size.height - height) / 2,
                            width: barWidth,
                            height: height
                        )
                        let normalizedX = Double(index) / Double(max(1, peaks.count - 1))
                        context.fill(
                            Path(roundedRect: rect, cornerRadius: barWidth / 2),
                            with: .color(normalizedX <= progress ? .orange : .secondary.opacity(0.3))
                        )
                    }
                }

                ForEach(annotations) { annotation in
                    annotationMarker(annotation, width: geometry.size.width)
                }

                Rectangle()
                    .fill(.primary.opacity(0.75))
                    .frame(width: 2)
                    .position(
                        x: geometry.size.width * CGFloat(duration > 0 ? currentTime / duration : 0),
                        y: geometry.size.height / 2
                    )
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let fraction = min(max(0, value.location.x / geometry.size.width), 1)
                        onSeek(duration * Double(fraction))
                    }
            )
        }
        .frame(height: 132)
        .accessibilityElement()
        .accessibilityLabel("Waveform")
        .accessibilityValue("Playhead at \(currentTime.playbackTimestamp) of \(duration.playbackTimestamp)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                onSeek(min(duration, currentTime + 5))
            case .decrement:
                onSeek(max(0, currentTime - 5))
            @unknown default:
                break
            }
        }
    }

    private func annotationMarker(_ annotation: ReviewAnnotation, width: CGFloat) -> some View {
        let fraction = duration > 0 ? annotation.startTime / duration : 0
        return VStack(spacing: 0) {
            Circle()
                .fill(.orange)
                .frame(width: 9, height: 9)
            Rectangle()
                .fill(.orange.opacity(0.75))
                .frame(width: 1)
        }
        .frame(height: 118)
        .position(x: width * CGFloat(fraction), y: 66)
        .allowsHitTesting(false)
    }
}
