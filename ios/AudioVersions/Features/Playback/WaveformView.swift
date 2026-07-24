import SwiftUI

struct WaveformView: View {
    @Environment(\.palette) private var palette
    @State private var scrubTime: TimeInterval?

    let peaks: [Double]
    let duration: TimeInterval
    let currentTime: TimeInterval
    let annotations: [ReviewAnnotation]
    let onSeek: (TimeInterval) -> Void

    private var displayedTime: TimeInterval {
        scrubTime ?? currentTime
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Canvas { context, size in
                    guard !peaks.isEmpty else { return }
                    let slotWidth = size.width / CGFloat(peaks.count)
                    let barWidth = max(1, slotWidth * 0.52)
                    let progress = duration > 0 ? displayedTime / duration : 0
                    let playedShading = GraphicsContext.Shading.linearGradient(
                        palette.waveformPlayedGradient,
                        startPoint: CGPoint(x: 0, y: 0),
                        endPoint: CGPoint(x: 0, y: size.height)
                    )
                    let baseShading = GraphicsContext.Shading.color(palette.waveformBase)

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
                            with: normalizedX <= progress ? playedShading : baseShading
                        )
                    }
                }

                ForEach(annotations) { annotation in
                    annotationMarker(annotation, width: geometry.size.width)
                }

                Rectangle()
                    .fill(palette.playhead)
                    .frame(width: 2)
                    .shadow(color: palette.playheadGlow, radius: 6)
                    .position(
                        x: geometry.size.width * CGFloat(duration > 0 ? displayedTime / duration : 0),
                        y: geometry.size.height / 2
                    )
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let fraction = min(max(0, value.location.x / geometry.size.width), 1)
                        scrubTime = duration * Double(fraction)
                    }
                    .onEnded { value in
                        let fraction = min(max(0, value.location.x / geometry.size.width), 1)
                        let target = duration * Double(fraction)
                        scrubTime = nil
                        onSeek(target)
                    }
            )
        }
        .frame(height: 132)
        .accessibilityElement()
        .accessibilityLabel("Waveform")
        .accessibilityValue("Playhead at \(displayedTime.playbackTimestamp) of \(duration.playbackTimestamp)")
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
                .fill(palette.accent)
                .frame(width: 9, height: 9)
            Rectangle()
                .fill(palette.accent.opacity(0.65))
                .frame(width: 1)
        }
        .frame(height: 118)
        .position(x: width * CGFloat(fraction), y: 66)
        .allowsHitTesting(false)
    }
}
