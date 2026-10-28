import Foundation

struct Song: Identifiable, Hashable, Codable {
    let id: String
    var title: String
    var artist: String
    var generalNotes: String = ""
    var noteTabs: [SongNoteTab]? = nil
    var galleryImages: [GalleryImage]? = nil
    var updatedAt: Date
    var deletedAt: Date? = nil
    var versions: [AudioVersion]

    var latestVersion: AudioVersion? {
        versions.max { $0.createdAt < $1.createdAt }
    }
}

struct AudioVersion: Identifiable, Hashable, Codable {
    let id: String
    var name: String
    var notes: String = ""
    /// Local calendar session date as `YYYY-MM-DD`, matching the web `sessionDate`.
    var sessionDate: String = ""
    var createdAt: Date
    var duration: TimeInterval
    var waveformPeaks: [Double]
    /// Whole-file loudness from the shared `loudness` JSON column, when measured.
    var loudness: LoudnessMetrics? = nil
    var annotations: [ReviewAnnotation]
    var galleryImages: [GalleryImage]? = nil

    var annotationCount: Int {
        annotations.count
    }
}

struct Playlist: Identifiable, Hashable, Codable {
    let id: String
    var name: String
    var audioFileIDs: [String]
    var sortOrder: Int
    var createdAt: Date
    var updatedAt: Date
}

enum PlaylistLoopMode: String, CaseIterable, Identifiable {
    case off
    case all
    case one

    var id: String { rawValue }

    var symbolName: String {
        self == .one ? "repeat.1" : "repeat"
    }
}

/// Whole-file loudness measurements (ITU-R BS.1770-4 / EBU Tech 3342).
struct LoudnessMetrics: Hashable, Sendable, Codable {
    var integratedLufs: Double
    var loudnessRangeLu: Double
    var shortTermMaxLufs: Double
    var samplePeakDb: Double
    var truePeakDb: Double

    /// Matches the web integrated-loudness readout, e.g. `-14.6 LUFS`.
    var integratedLufsLabel: String {
        String(format: "%.1f LUFS", integratedLufs)
    }
}

struct ReviewAnnotation: Identifiable, Hashable, Codable {
    enum Kind: String, CaseIterable, Hashable {
        case point
        case range
    }

    let id: String
    var kind: Kind
    var startTime: TimeInterval
    var endTime: TimeInterval?
    var detail: String
    var authorName: String
    var updatedAt: Date
    var color: String? = nil
    var cloudUpdatedAtToken: String? = nil

    var timeLabel: String {
        guard let endTime, kind == .range else {
            return startTime.playbackTimestamp
        }
        return "\(startTime.playbackTimestamp)–\(endTime.playbackTimestamp)"
    }
}

extension TimeInterval {
    var playbackTimestamp: String {
        guard isFinite, self >= 0 else { return "0:00" }
        let totalSeconds = Int(self.rounded(.down))
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }
}
