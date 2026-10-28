import Combine
import Foundation

@MainActor
final class AppearanceStore: ObservableObject {
    static let songNotesFontSizeStorageKey = "ui.songNotesFontSize"
    static let defaultSongNotesFontSize = 14

    @Published var preference: AppearancePreference {
        didSet {
            guard preference != oldValue else { return }
            defaults.set(preference.rawValue, forKey: AppearancePreference.storageKey)
        }
    }

    /// Local equivalent of desktop `settings.ui.songNotesFontSize` (10...28).
    @Published var songNotesFontSize: Int {
        didSet {
            let clamped = Self.clampedSongNotesFontSize(songNotesFontSize)
            if clamped != songNotesFontSize {
                songNotesFontSize = clamped
                return
            }
            guard songNotesFontSize != oldValue else { return }
            defaults.set(songNotesFontSize, forKey: Self.songNotesFontSizeStorageKey)
        }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        preference = AppearancePreference.stored(
            defaults.string(forKey: AppearancePreference.storageKey)
        )
        let stored = defaults.object(forKey: Self.songNotesFontSizeStorageKey) as? Int
        let resolved = Self.clampedSongNotesFontSize(stored ?? Self.defaultSongNotesFontSize)
        songNotesFontSize = resolved
        if let stored, stored != resolved {
            defaults.set(resolved, forKey: Self.songNotesFontSizeStorageKey)
        }
    }

    func adjustSongNotesFontSize(by delta: Int) {
        songNotesFontSize = Self.clampedSongNotesFontSize(songNotesFontSize + delta)
    }

    private static func clampedSongNotesFontSize(_ value: Int) -> Int {
        min(28, max(10, value))
    }
}
