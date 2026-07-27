import Foundation

enum FixtureLibrary {
    static let songs: [Song] = [
        Song(
            id: "song-afterglow",
            title: "Afterglow",
            artist: "Ben Montgomery",
            updatedAt: date(daysAgo: 0),
            versions: [
                AudioVersion(
                    id: "afterglow-v4",
                    name: "Mix 04 — vocal lift",
                    sessionDate: isoDate(daysAgo: 0),
                    createdAt: date(daysAgo: 0),
                    duration: 226,
                    waveformPeaks: peaks(seed: 0.42),
                    loudness: LoudnessMetrics(
                        integratedLufs: -14.6,
                        loudnessRangeLu: 6.2,
                        shortTermMaxLufs: -9.4,
                        samplePeakDb: -0.8,
                        truePeakDb: -0.3
                    ),
                    annotations: [
                        ReviewAnnotation(
                            id: "annotation-vocal",
                            kind: .range,
                            startTime: 47,
                            endTime: 56,
                            detail: "Vocal comes forward nicely. This balance feels right—keep the double tucked where it is.",
                            authorName: "Ben",
                            updatedAt: date(daysAgo: 0)
                        ),
                        ReviewAnnotation(
                            id: "annotation-snare",
                            kind: .point,
                            startTime: 103,
                            endTime: nil,
                            detail: "Check the snare hit—there may be a small transient click here on headphones.",
                            authorName: "Ben",
                            updatedAt: date(daysAgo: 0)
                        ),
                    ]
                ),
                AudioVersion(
                    id: "afterglow-v3",
                    name: "Mix 03",
                    sessionDate: isoDate(daysAgo: 3),
                    createdAt: date(daysAgo: 3),
                    duration: 226,
                    waveformPeaks: peaks(seed: 0.28),
                    annotations: []
                ),
            ]
        ),
        Song(
            id: "song-cedar-line",
            title: "Cedar Line",
            artist: "Ben Montgomery",
            updatedAt: date(daysAgo: 2),
            versions: [
                AudioVersion(
                    id: "cedar-v2",
                    name: "Master candidate 02",
                    sessionDate: isoDate(daysAgo: 2),
                    createdAt: date(daysAgo: 2),
                    duration: 194,
                    waveformPeaks: peaks(seed: 0.65),
                    annotations: [
                        ReviewAnnotation(
                            id: "annotation-bass",
                            kind: .range,
                            startTime: 72,
                            endTime: 80,
                            detail: "Recheck the bass translation in this passage on the small speakers.",
                            authorName: "Ben",
                            updatedAt: date(daysAgo: 1)
                        ),
                    ]
                ),
            ]
        ),
        Song(
            id: "song-borrowed-light",
            title: "Borrowed Light",
            artist: "Ben Montgomery",
            updatedAt: date(daysAgo: 8),
            versions: [
                AudioVersion(
                    id: "borrowed-v1",
                    name: "Rough mix 01",
                    sessionDate: isoDate(daysAgo: 8),
                    createdAt: date(daysAgo: 8),
                    duration: 251,
                    waveformPeaks: peaks(seed: 0.81),
                    annotations: []
                ),
            ]
        ),
    ]

    private static func date(daysAgo: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
    }

    private static func isoDate(daysAgo: Int) -> String {
        let day = date(daysAgo: daysAgo)
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: day)
        return String(
            format: "%04d-%02d-%02d",
            parts.year ?? 0,
            parts.month ?? 0,
            parts.day ?? 0
        )
    }

    private static func peaks(seed: Double) -> [Double] {
        (0..<180).map { index in
            let x = Double(index)
            let envelope = 0.52 + 0.34 * sin(x * 0.031 + seed)
            let detail = abs(sin(x * (0.39 + seed * 0.08)) * cos(x * 0.17 + seed))
            return min(1, max(0.08, 0.18 + detail * envelope))
        }
    }
}
