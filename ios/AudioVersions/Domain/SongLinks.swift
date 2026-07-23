import Foundation

struct SongLinkTarget: Hashable {
    let songID: String
    let fileID: String?
    let annotationID: String?
    let time: TimeInterval?
    let autoplay: Bool

    init(
        songID: String,
        fileID: String?,
        annotationID: String?,
        time: TimeInterval?,
        autoplay: Bool
    ) {
        self.songID = songID
        self.fileID = fileID
        self.annotationID = annotationID
        self.time = time
        self.autoplay = autoplay
    }

    init?(url: URL) {
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }

        let pathParts = components.path.split(separator: "/", omittingEmptySubsequences: true)
        guard
            pathParts.count == 2,
            pathParts[0] == "songs",
            let decodedSongID = String(pathParts[1]).removingPercentEncoding,
            !decodedSongID.isEmpty
        else { return nil }

        func queryValue(_ name: String) -> String? {
            components.queryItems?.first { $0.name == name }?.value
        }

        let timeMilliseconds = queryValue("timeMs").flatMap(Double.init)
        let autoplayValue = queryValue("autoplay")

        songID = decodedSongID
        fileID = queryValue("fileId")
        annotationID = queryValue("annotationId")
        time = timeMilliseconds.map { max(0, $0 / 1_000) }
        autoplay = autoplayValue == "1" || autoplayValue == "true"
    }
}

struct SongJournalLink: Identifiable, Hashable {
    let url: URL
    let label: String
    let target: SongLinkTarget

    var id: String {
        url.absoluteString
    }

    static func extract(from journal: String) -> [SongJournalLink] {
        let lines = journal.components(separatedBy: .newlines)
        var links: [SongJournalLink] = []
        var seenURLs = Set<String>()

        for (lineIndex, line) in lines.enumerated() {
            let trimmedLine = line.trimmingCharacters(in: .whitespacesAndNewlines)
            for token in trimmedLine.split(whereSeparator: \.isWhitespace) {
                let rawURL = String(token).trimmingCharacters(
                    in: CharacterSet(charactersIn: "(),.;!?")
                )
                guard
                    !seenURLs.contains(rawURL),
                    let url = URL(string: rawURL),
                    let target = SongLinkTarget(url: url)
                else { continue }

                let previousLine = lineIndex > 0
                    ? lines[lineIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines)
                    : ""
                let label = trimmedLine == String(token) && !previousLine.isEmpty
                    ? previousLine
                    : target.annotationID == nil ? "Song link" : "Marker link"

                seenURLs.insert(rawURL)
                links.append(
                    SongJournalLink(
                        url: url,
                        label: label,
                        target: target
                    )
                )
            }
        }

        return links
    }
}

enum LibraryDestination: Hashable {
    case song(id: String)
    case version(songID: String, versionID: String, target: SongLinkTarget?)
}
