import Foundation

extension ReviewAnnotation.Kind: Codable {}

enum CloudDataError: Error, LocalizedError {
    case conflict
    case invalidIdentifier(String)
    case invalidTimestamp(String)
    case invalidAnnotation(String)

    var errorDescription: String? {
        switch self {
        case .conflict:
            "This annotation changed on another device. Refresh before saving again."
        case let .invalidIdentifier(identifier):
            "The cloud record has an invalid identifier: \(identifier)."
        case let .invalidTimestamp(timestamp):
            "The cloud record has an invalid timestamp: \(timestamp)."
        case let .invalidAnnotation(message):
            message
        }
    }
}

enum CloudTimestamp {
    static func parse(_ value: String) throws -> Date {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]

        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: value) else {
            throw CloudDataError.invalidTimestamp(value)
        }
        return date
    }

    static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter.string(from: date)
    }
}

struct RichTextDocument: Codable, Equatable, Sendable {
    let type: String
    let content: [RichTextNode]?

    static func plainText(_ value: String) -> RichTextDocument {
        let paragraphs = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: "\n\n")
            .filter { !$0.isEmpty }
            .map { paragraph in
                RichTextNode(
                    type: "paragraph",
                    text: nil,
                    content: paragraph
                        .components(separatedBy: "\n")
                        .enumerated()
                        .flatMap { index, line in
                            var nodes = [
                                RichTextNode(type: "text", text: line, content: nil),
                            ]
                            if index < paragraph.components(separatedBy: "\n").count - 1 {
                                nodes.append(
                                    RichTextNode(type: "hardBreak", text: nil, content: nil)
                                )
                            }
                            return nodes
                        }
                )
            }

        return RichTextDocument(
            type: "doc",
            content: paragraphs.isEmpty
                ? [RichTextNode(type: "paragraph", text: nil, content: [])]
                : paragraphs
        )
    }

    var plainText: String {
        (content ?? [])
            .map(\.multilineText)
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct RichTextNode: Codable, Equatable, Sendable {
    let type: String?
    let text: String?
    let content: [RichTextNode]?

    var multilineText: String {
        if type == "hardBreak" {
            return "\n"
        }
        if let text {
            return text
        }
        return (content ?? []).map(\.multilineText).joined()
    }
}

struct SongRow: Decodable, Sendable {
    let id: UUID
    let title: String
    let artist: String
    let generalNotes: RichTextDocument
    let audioFileOrder: [UUID]
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case artist
        case generalNotes = "general_notes"
        case audioFileOrder = "audio_file_order"
        case updatedAt = "updated_at"
    }
}

struct AudioFileRow: Decodable, Sendable {
    let id: UUID
    let songID: UUID
    let title: String
    let notes: RichTextDocument
    let durationMilliseconds: Double
    let waveform: WaveformRow
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case songID = "song_id"
        case title
        case notes
        case durationMilliseconds = "duration_ms"
        case waveform
        case createdAt = "created_at"
    }
}

struct WaveformRow: Decodable, Sendable {
    let peaks: [Double]
}

struct AnnotationRow: Decodable, Sendable {
    let id: UUID
    let audioFileID: UUID
    let type: ReviewAnnotation.Kind
    let startMilliseconds: Double
    let endMilliseconds: Double?
    let title: String
    let body: RichTextDocument
    let color: String?
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case audioFileID = "audio_file_id"
        case type
        case startMilliseconds = "start_ms"
        case endMilliseconds = "end_ms"
        case title
        case body
        case color
        case updatedAt = "updated_at"
    }
}

struct MutationResultRow: Decodable, Sendable {
    let id: UUID
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case updatedAt = "updated_at"
    }
}

struct SongJournalUpdate: Encodable, Sendable {
    let generalNotes: RichTextDocument
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case generalNotes = "general_notes"
        case updatedAt = "updated_at"
    }
}

struct AudioFileNotesUpdate: Encodable, Sendable {
    let notes: RichTextDocument
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case notes
        case updatedAt = "updated_at"
    }
}

struct AnnotationInsert: Encodable, Sendable {
    let id: UUID
    let userID: UUID
    let songID: UUID
    let audioFileID: UUID
    let type: ReviewAnnotation.Kind
    let startMilliseconds: Double
    let endMilliseconds: Double?
    let title: String
    let body: RichTextDocument
    let color: String
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case songID = "song_id"
        case audioFileID = "audio_file_id"
        case type
        case startMilliseconds = "start_ms"
        case endMilliseconds = "end_ms"
        case title
        case body
        case color
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userID, forKey: .userID)
        try container.encode(songID, forKey: .songID)
        try container.encode(audioFileID, forKey: .audioFileID)
        try container.encode(type, forKey: .type)
        try container.encode(startMilliseconds, forKey: .startMilliseconds)
        if let endMilliseconds {
            try container.encode(endMilliseconds, forKey: .endMilliseconds)
        } else {
            try container.encodeNil(forKey: .endMilliseconds)
        }
        try container.encode(title, forKey: .title)
        try container.encode(body, forKey: .body)
        try container.encode(color, forKey: .color)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
}

struct AnnotationUpdate: Encodable, Sendable {
    let type: ReviewAnnotation.Kind
    let startMilliseconds: Double
    let endMilliseconds: Double?
    let title: String
    let body: RichTextDocument
    let color: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case type
        case startMilliseconds = "start_ms"
        case endMilliseconds = "end_ms"
        case title
        case body
        case color
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(startMilliseconds, forKey: .startMilliseconds)
        if let endMilliseconds {
            try container.encode(endMilliseconds, forKey: .endMilliseconds)
        } else {
            try container.encodeNil(forKey: .endMilliseconds)
        }
        try container.encode(title, forKey: .title)
        try container.encode(body, forKey: .body)
        try container.encode(color, forKey: .color)
        try container.encode(updatedAt, forKey: .updatedAt)
        if let deletedAt {
            try container.encode(deletedAt, forKey: .deletedAt)
        } else {
            try container.encodeNil(forKey: .deletedAt)
        }
    }
}

struct AnnotationTombstone: Encodable, Sendable {
    let deletedAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case deletedAt = "deleted_at"
        case updatedAt = "updated_at"
    }
}
