import Foundation

struct Song: Identifiable, Hashable {
    let id: String
    var title: String
    var artist: String
    var generalNotes: String = ""
    var updatedAt: Date
    var versions: [AudioVersion]

    var latestVersion: AudioVersion? {
        versions.max { $0.createdAt < $1.createdAt }
    }
}

struct AudioVersion: Identifiable, Hashable {
    let id: String
    var name: String
    var notes: String = ""
    var createdAt: Date
    var duration: TimeInterval
    var waveformPeaks: [Double]
    var annotations: [ReviewAnnotation]

    var annotationCount: Int {
        annotations.count
    }
}

struct ReviewAnnotation: Identifiable, Hashable {
    enum Kind: String, CaseIterable, Hashable {
        case point
        case range
    }

    let id: String
    var kind: Kind
    var startTime: TimeInterval
    var endTime: TimeInterval?
    var title: String
    var body: String
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
