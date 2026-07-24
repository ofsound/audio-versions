import SwiftUI

/// Semantic colors for one appearance. Light keeps the warm orange identity of
/// the app; dark uses a cool mint accent on a near-black studio canvas.
struct AppPalette: Sendable, Equatable {
    let canvas: Color
    let surface: Color
    let surfaceInset: Color
    let cardSheen: Color
    let hairline: Color
    let hairlineStrong: Color
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color
    let accent: Color
    let accentText: Color
    let accentSoft: Color
    let onAccent: Color
    let accentGlow: Color
    let waveformBase: Color
    let waveformPlayedTop: Color
    let waveformPlayedBottom: Color
    let playhead: Color
    let playheadGlow: Color
    let brandTileTop: Color
    let brandTileBottom: Color
    let danger: Color

    static func forScheme(_ scheme: ColorScheme) -> AppPalette {
        scheme == .dark ? .dark : .light
    }

    static let light = AppPalette(
        canvas: Color(hex: 0xF1F2F6),
        surface: Color(hex: 0xFFFFFF),
        surfaceInset: Color(hex: 0xF5F6F9),
        cardSheen: Color(hex: 0xFFFFFF, opacity: 0),
        hairline: Color(hex: 0x000000, opacity: 0.07),
        hairlineStrong: Color(hex: 0x000000, opacity: 0.14),
        textPrimary: Color(hex: 0x18181B),
        textSecondary: Color(hex: 0x52525B),
        textTertiary: Color(hex: 0x7C7C86),
        accent: Color(hex: 0xEA580C),
        accentText: Color(hex: 0xC2410C),
        accentSoft: Color(hex: 0xEA580C, opacity: 0.12),
        onAccent: Color(hex: 0xFFFFFF),
        accentGlow: Color(hex: 0xEA580C, opacity: 0.22),
        waveformBase: Color(hex: 0x94A3B8, opacity: 0.45),
        waveformPlayedTop: Color(hex: 0xFB923C),
        waveformPlayedBottom: Color(hex: 0xEA580C),
        playhead: Color(hex: 0x18181B, opacity: 0.78),
        playheadGlow: Color(hex: 0x18181B, opacity: 0),
        brandTileTop: Color(hex: 0xFB923C),
        brandTileBottom: Color(hex: 0xEA580C),
        danger: Color(hex: 0xB91C1C)
    )

    static let dark = AppPalette(
        canvas: Color(hex: 0x07070C),
        surface: Color(hex: 0x10141F),
        surfaceInset: Color(hex: 0x1A2130),
        cardSheen: Color(hex: 0xFFFFFF, opacity: 0.06),
        hairline: Color(hex: 0xFFFFFF, opacity: 0.10),
        hairlineStrong: Color(hex: 0xFFFFFF, opacity: 0.18),
        textPrimary: Color(hex: 0xF4F4F5),
        textSecondary: Color(hex: 0xA9B1BF),
        textTertiary: Color(hex: 0x717A8A),
        accent: Color(hex: 0x6EE7B7),
        accentText: Color(hex: 0x6EE7B7),
        accentSoft: Color(hex: 0x6EE7B7, opacity: 0.14),
        onAccent: Color(hex: 0x04140E),
        accentGlow: Color(hex: 0x6EE7B7, opacity: 0.28),
        waveformBase: Color(hex: 0xCBD5E1, opacity: 0.26),
        waveformPlayedTop: Color(hex: 0x7BF2CE),
        waveformPlayedBottom: Color(hex: 0x2DD4BF),
        playhead: Color(hex: 0xFFFFFF, opacity: 0.88),
        playheadGlow: Color(hex: 0xFFFFFF, opacity: 0.35),
        brandTileTop: Color(hex: 0x7BF2CE),
        brandTileBottom: Color(hex: 0x2DD4BF),
        danger: Color(hex: 0xFCA5A5)
    )
}

extension AppPalette {
    var waveformPlayed: LinearGradient {
        LinearGradient(
            colors: [waveformPlayedTop, waveformPlayedBottom],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    var waveformPlayedGradient: Gradient {
        Gradient(colors: [waveformPlayedTop, waveformPlayedBottom])
    }

    var brandTile: LinearGradient {
        LinearGradient(
            colors: [brandTileTop, brandTileBottom],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Top-lit sheen that gives dark cards depth without a visible border.
    var sheen: LinearGradient {
        LinearGradient(
            colors: [cardSheen, .clear],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct AppPaletteKey: EnvironmentKey {
    static let defaultValue = AppPalette.light
}

extension EnvironmentValues {
    var palette: AppPalette {
        get { self[AppPaletteKey.self] }
        set { self[AppPaletteKey.self] = newValue }
    }
}

extension Color {
    fileprivate init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
