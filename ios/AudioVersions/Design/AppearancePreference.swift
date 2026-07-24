import SwiftUI

enum AppearancePreference: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    static let storageKey = "appearance.preference"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var symbolName: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max.fill"
        case .dark: "moon.stars.fill"
        }
    }

    /// `nil` hands the appearance back to iOS.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    func resolvedScheme(systemScheme: ColorScheme) -> ColorScheme {
        colorScheme ?? systemScheme
    }

    static func stored(_ rawValue: String?) -> AppearancePreference {
        rawValue.flatMap(AppearancePreference.init(rawValue:)) ?? .system
    }
}
