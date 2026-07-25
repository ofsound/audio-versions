import Foundation

enum SongSessionDates {
    /// Inclusive session-date span for a song’s files, matching web
    /// `formatAudioFileSessionDateRange`. Returns `nil` when none are dated.
    static func formatRange(
        _ sessionDates: [String],
        locale: Locale = .autoupdatingCurrent,
        calendar: Calendar = .current
    ) -> String? {
        let dates = sessionDates
            .compactMap { normalizedISODate(from: $0) }
            .sorted()

        guard let earliest = dates.first, let latest = dates.last else {
            return nil
        }

        if earliest == latest {
            return formatForDisplay(earliest, locale: locale, calendar: calendar)
        }

        return "\(formatForDisplay(earliest, locale: locale, calendar: calendar)) – \(formatForDisplay(latest, locale: locale, calendar: calendar))"
    }

    static func normalizedISODate(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count == 10,
              trimmed[trimmed.index(trimmed.startIndex, offsetBy: 4)] == "-",
              trimmed[trimmed.index(trimmed.startIndex, offsetBy: 7)] == "-",
              trimmed.filter(\.isNumber).count == 8,
              date(fromISO: trimmed, calendar: .current) != nil
        else {
            return nil
        }
        return trimmed
    }

    static func formatForDisplay(
        _ isoDate: String,
        locale: Locale = .autoupdatingCurrent,
        calendar: Calendar = .current
    ) -> String {
        guard let date = date(fromISO: isoDate, calendar: calendar) else {
            return isoDate
        }

        return date.formatted(
            Date.FormatStyle(date: .abbreviated, time: .omitted)
                .locale(locale)
        )
    }

    private static func date(fromISO isoDate: String, calendar: Calendar) -> Date? {
        let parts = isoDate.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]),
              (1...12).contains(month),
              (1...31).contains(day)
        else {
            return nil
        }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        return calendar.date(from: components)
    }
}

extension Song {
    var sessionDateRangeLabel: String? {
        SongSessionDates.formatRange(versions.map(\.sessionDate))
    }
}
