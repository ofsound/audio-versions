import Combine
import Foundation

@MainActor
final class AppearanceStore: ObservableObject {
    @Published var preference: AppearancePreference {
        didSet {
            guard preference != oldValue else { return }
            defaults.set(preference.rawValue, forKey: AppearancePreference.storageKey)
        }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        preference = AppearancePreference.stored(
            defaults.string(forKey: AppearancePreference.storageKey)
        )
    }
}
