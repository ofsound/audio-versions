import Foundation

struct AnnotationSyncRow: Decodable {
    let annotation: AnnotationRow
    let deletedAt: String?

    enum CodingKeys: String, CodingKey { case deletedAt = "deleted_at" }

    init(from decoder: Decoder) throws {
        annotation = try AnnotationRow(from: decoder)
        deletedAt = try decoder.container(keyedBy: CodingKeys.self)
            .decodeIfPresent(String.self, forKey: .deletedAt)
    }

    func matches(_ write: PendingAnnotationWrite) throws -> Bool {
        let desired = write.annotation
        let sameTimestamp = try CloudTimestamp.parse(annotation.updatedAt)
            == CloudTimestamp.parse(CloudTimestamp.format(desired.updatedAt))
        guard sameTimestamp else { return false }
        if write.operation == .delete { return deletedAt != nil }
        return deletedAt == nil
            && annotation.audioFileID.uuidString.lowercased() == write.versionID.lowercased()
            && annotation.type == desired.kind
            && annotation.startMilliseconds == desired.startTime * 1_000
            && annotation.endMilliseconds == desired.endTime.map { $0 * 1_000 }
            && annotation.detail == RichTextDocument.plainText(desired.detail)
            && annotation.color == (desired.color ?? (desired.kind == .point
                ? "var(--color-marker-point)" : "var(--color-marker-range)"))
    }
}
