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
    /// Plain-text source restored when editing: either `label\nurl` or `url`.
    let source: String

    var id: String {
        "\(source)|\(url.absoluteString)"
    }

    static func extract(from journal: String) -> [SongJournalLink] {
        var links: [SongJournalLink] = []
        var seenURLs = Set<String>()

        for line in renderedLines(from: journal) {
            for segment in line.segments {
                guard case let .link(link) = segment else { continue }
                let key = link.url.absoluteString
                guard !seenURLs.contains(key) else { continue }
                seenURLs.insert(key)
                links.append(link)
            }
        }

        return links
    }

    /// Mirrors desktop `renderJournal`: standalone `label\nurl` becomes one chip
    /// and the label line is omitted from rendered text.
    static func renderedLines(from journal: String) -> [JournalRenderedLine] {
        let lines = journal.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var rendered: [JournalRenderedLine] = []

        for (lineIndex, line) in lines.enumerated() {
            let matches = JournalURLMatch.findAll(in: line)
            let standaloneLink = matches.count == 1
                ? journalLink(lines: lines, lineIndex: lineIndex, match: matches[0])
                : nil

            if let standaloneLink, standaloneLink.source.contains("\n"), !rendered.isEmpty {
                rendered.removeLast()
            }

            var segments: [JournalInlineSegment] = []
            var offset = line.startIndex

            for match in matches {
                guard let link = journalLink(lines: lines, lineIndex: lineIndex, match: match) else {
                    continue
                }

                if match.range.lowerBound > offset {
                    segments.append(.text(String(line[offset..<match.range.lowerBound])))
                }
                segments.append(.link(link))
                offset = match.range.upperBound
            }

            if offset < line.endIndex {
                segments.append(.text(String(line[offset...])))
            }

            rendered.append(JournalRenderedLine(segments: segments))
        }

        return rendered
    }
}

struct JournalRenderedLine: Hashable {
    let segments: [JournalInlineSegment]
}

enum JournalInlineSegment: Hashable {
    case text(String)
    case link(SongJournalLink)
}

enum LibraryDestination: Hashable {
    case song(id: String)
    case version(songID: String, versionID: String, target: SongLinkTarget?)
}

private struct JournalURLMatch {
    let raw: String
    let range: Range<String.Index>

    static func findAll(in line: String) -> [JournalURLMatch] {
        var matches: [JournalURLMatch] = []
        var searchStart = line.startIndex

        while searchStart < line.endIndex {
            guard let matchStart = line[searchStart...].firstIndex(where: { !$0.isWhitespace }) else {
                break
            }

            let rest = line[matchStart...]
            let tokenEnd = rest.firstIndex(where: \.isWhitespace) ?? line.endIndex
            let rawToken = String(line[matchStart..<tokenEnd])
            let trimmed = rawToken.trimmingCharacters(in: CharacterSet(charactersIn: "(),.;!?"))

            if isJournalURLCandidate(trimmed),
               let url = URL(string: trimmed),
               SongLinkTarget(url: url) != nil,
               let trimmedRange = line[matchStart..<tokenEnd].range(of: trimmed)
            {
                matches.append(JournalURLMatch(raw: trimmed, range: trimmedRange))
            }

            searchStart = tokenEnd
        }

        return matches
    }
}

private func isJournalURLCandidate(_ value: String) -> Bool {
    value.hasPrefix("http://")
        || value.hasPrefix("https://")
        || value.hasPrefix("/songs/")
}

private func lineContainsJournalURL(_ line: String) -> Bool {
    line.split(whereSeparator: \.isWhitespace).contains {
        isJournalURLCandidate(
            String($0).trimmingCharacters(in: CharacterSet(charactersIn: "(),.;!?"))
        )
    }
}

private func journalLink(
    lines: [String],
    lineIndex: Int,
    match: JournalURLMatch
) -> SongJournalLink? {
    guard
        let url = URL(string: match.raw),
        let target = SongLinkTarget(url: url)
    else { return nil }

    let trimmedLine = lines[lineIndex].trimmingCharacters(in: .whitespacesAndNewlines)
    let previousLine = lineIndex > 0
        ? lines[lineIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines)
        : ""
    let isStandaloneURL = trimmedLine == match.raw
    let hasStandaloneLabel = isStandaloneURL
        && !previousLine.isEmpty
        && !lineContainsJournalURL(previousLine)

    let label = hasStandaloneLabel
        ? previousLine
        : target.annotationID == nil ? "Song link" : "Marker link"
    let source = hasStandaloneLabel ? "\(lines[lineIndex - 1])\n\(match.raw)" : match.raw

    return SongJournalLink(
        url: url,
        label: label,
        target: target,
        source: source
    )
}
