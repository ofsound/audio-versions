import Foundation

enum SongJournalEntry {
    /// Matches the web journal timestamp: locale medium date + short time.
    static func timestamp(
        at date: Date = .now,
        locale: Locale = .autoupdatingCurrent
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    /// Shared journal atom rendered as a read-only timestamp chip on iOS and web/Electron.
    static func timestampToken(
        at date: Date = .now,
        locale: Locale = .autoupdatingCurrent
    ) -> String {
        "{{timestamp:\(timestamp(at: date, locale: locale))}}"
    }

    /// Appends a stamped entry to the end of an existing plain-text journal.
    static func appending(
        _ entry: String,
        to journal: String,
        at date: Date = .now,
        locale: Locale = .autoupdatingCurrent
    ) -> String {
        let block = "\(timestampToken(at: date, locale: locale))\n\(entry)"
        if journal.isEmpty {
            return block
        }
        if journal.hasSuffix("\n\n") {
            return journal + block
        }
        if journal.hasSuffix("\n") {
            return journal + "\n" + block
        }
        return journal + "\n\n" + block
    }
}
