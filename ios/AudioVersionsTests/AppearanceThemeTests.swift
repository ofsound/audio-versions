import Foundation
import SwiftUI
import Testing
import UIKit

@testable import AudioVersions

@MainActor
struct AppearanceThemeTests {
    @Test
    func systemPreferenceDefersToTheDeviceScheme() {
        #expect(AppearancePreference.system.colorScheme == nil)
        #expect(AppearancePreference.system.resolvedScheme(systemScheme: .dark) == .dark)
        #expect(AppearancePreference.system.resolvedScheme(systemScheme: .light) == .light)
    }

    @Test
    func explicitPreferencesIgnoreTheDeviceScheme() {
        #expect(AppearancePreference.dark.colorScheme == .dark)
        #expect(AppearancePreference.dark.resolvedScheme(systemScheme: .light) == .dark)
        #expect(AppearancePreference.light.colorScheme == .light)
        #expect(AppearancePreference.light.resolvedScheme(systemScheme: .dark) == .light)
    }

    @Test
    func unknownStoredValuesFallBackToSystem() {
        #expect(AppearancePreference.stored(nil) == .system)
        #expect(AppearancePreference.stored("sepia") == .system)
        #expect(AppearancePreference.stored("dark") == .dark)
    }

    @Test
    func appearanceStoreKeepsTheSelectionAcrossLaunches() throws {
        let defaults = try #require(
            UserDefaults(suiteName: "com.benmontgomery.audioversions.tests.appearance")
        )
        defaults.removeObject(forKey: AppearancePreference.storageKey)
        defer { defaults.removeObject(forKey: AppearancePreference.storageKey) }

        let store = AppearanceStore(defaults: defaults)
        #expect(store.preference == .system)

        store.preference = .dark
        #expect(AppearanceStore(defaults: defaults).preference == .dark)

        store.preference = .system
        #expect(AppearanceStore(defaults: defaults).preference == .system)
    }

    @Test
    func paletteMatchesTheResolvedScheme() {
        #expect(AppPalette.forScheme(.dark) == .dark)
        #expect(AppPalette.forScheme(.light) == .light)
        #expect(AppPalette.dark != AppPalette.light)
    }

    @Test
    func darkSurfacesLiftAwayFromTheCanvasAndLightSurfacesSitAboveIt() {
        let dark = AppPalette.dark
        #expect(luminance(dark.canvas) < luminance(dark.surface))
        #expect(luminance(dark.surface) < luminance(dark.surfaceInset))

        let light = AppPalette.light
        #expect(luminance(light.canvas) < luminance(light.surfaceInset))
        #expect(luminance(light.surfaceInset) < luminance(light.surface))
    }

    @Test
    func accentStaysWarmInLightAndCoolInDark() {
        let light = components(AppPalette.light.accent)
        #expect(light.red > light.blue)

        let dark = components(AppPalette.dark.accent)
        #expect(dark.green > dark.red)
        #expect(dark.blue > dark.red)
    }

    @Test
    func glyphsOnAccentFillsMeetTheGraphicalContrastMinimum() {
        for palette in [AppPalette.light, AppPalette.dark] {
            #expect(contrastRatio(palette.onAccent, palette.accent) >= 3)
        }
    }

    @Test
    func bodyTextMeetsWCAGAAOnEverySurface() {
        for palette in [AppPalette.light, AppPalette.dark] {
            for background in [palette.canvas, palette.surface, palette.surfaceInset] {
                #expect(contrastRatio(palette.textPrimary, background) >= 4.5)
                #expect(contrastRatio(palette.textSecondary, background) >= 4.5)
                #expect(contrastRatio(palette.textTertiary, background) >= 3)
                #expect(contrastRatio(palette.accentText, background) >= 3)
            }
        }
    }
}

private func components(_ color: Color) -> (red: Double, green: Double, blue: Double) {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    return (Double(red), Double(green), Double(blue))
}

private func luminance(_ color: Color) -> Double {
    let rgb = components(color)
    func linear(_ value: Double) -> Double {
        value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue)
}

private func contrastRatio(_ first: Color, _ second: Color) -> Double {
    let lighter = max(luminance(first), luminance(second))
    let darker = min(luminance(first), luminance(second))
    return (lighter + 0.05) / (darker + 0.05)
}
