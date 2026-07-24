import SwiftUI

extension View {
    /// Primary card: surface fill, top-lit sheen, and a hairline that carries the
    /// edge in dark mode where shadows read poorly.
    func appCard(cornerRadius: CGFloat = 20) -> some View {
        modifier(AppCardBackground(cornerRadius: cornerRadius, isHighlighted: false, isInset: false))
    }

    /// Nested card used inside a primary card or a list row.
    func appInsetCard(cornerRadius: CGFloat = 14, isHighlighted: Bool = false) -> some View {
        modifier(
            AppCardBackground(
                cornerRadius: cornerRadius,
                isHighlighted: isHighlighted,
                isInset: true
            )
        )
    }

    func appCanvas() -> some View {
        modifier(AppCanvasBackground())
    }
}

private struct AppCardBackground: ViewModifier {
    @Environment(\.palette) private var palette

    let cornerRadius: CGFloat
    let isHighlighted: Bool
    let isInset: Bool

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    private var fill: Color {
        if isHighlighted {
            return palette.accentSoft
        }
        return isInset ? palette.surfaceInset : palette.surface
    }

    private var edge: Color {
        isHighlighted ? palette.accent.opacity(0.55) : palette.hairline
    }

    func body(content: Content) -> some View {
        content
            .background {
                shape
                    .fill(fill)
                    .overlay { shape.fill(palette.sheen) }
            }
            .clipShape(shape)
            .overlay {
                shape.stroke(edge, lineWidth: 1)
            }
    }
}

private struct AppCanvasBackground: ViewModifier {
    @Environment(\.palette) private var palette

    func body(content: Content) -> some View {
        content.background(palette.canvas.ignoresSafeArea())
    }
}
