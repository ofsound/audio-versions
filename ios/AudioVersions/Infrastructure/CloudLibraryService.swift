import Foundation
@preconcurrency import Supabase

struct CloudLibrarySnapshot {
    let songs: [Song]
}

final class ReviewCloudEnvironment: @unchecked Sendable {
    let client: SupabaseClient
    let library: CloudLibraryService
    let signedMedia: SignedMediaURLProvider

    init(configuration: CloudConfiguration) {
        let client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabasePublishableKey
        )
        self.client = client
        library = CloudLibraryService(client: client)
        signedMedia = SignedMediaURLProvider(
            client: client,
            apiBaseURL: configuration.apiBaseURL
        )
    }
}

final class CloudLibraryService: @unchecked Sendable {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func fetchActiveSnapshot() async throws -> CloudLibrarySnapshot {
        let songRows: [SongRow] = try await client
            .from("songs")
            .select("id,title,artist,audio_file_order,updated_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        let audioFileRows: [AudioFileRow] = try await client
            .from("audio_files")
            .select("id,song_id,title,duration_ms,waveform,created_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        let annotationRows: [AnnotationRow] = try await client
            .from("annotations")
            .select("id,audio_file_id,type,start_ms,end_ms,title,body,color,updated_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        return try Self.mapSnapshot(
            songRows: songRows,
            audioFileRows: audioFileRows,
            annotationRows: annotationRows
        )
    }

    func insertAnnotation(
        _ annotation: ReviewAnnotation,
        songID: String,
        audioFileID: String,
        createdAt: Date = .now
    ) async throws -> String {
        let ids = try await identifiers(
            annotationID: annotation.id,
            songID: songID,
            audioFileID: audioFileID
        )
        try validate(annotation)

        let insert = AnnotationInsert(
            id: ids.annotationID,
            userID: ids.userID,
            songID: ids.songID,
            audioFileID: ids.audioFileID,
            type: annotation.kind,
            startMilliseconds: annotation.startTime * 1_000,
            endMilliseconds: annotation.endTime.map { $0 * 1_000 },
            title: annotation.title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: .plainText(annotation.body),
            color: annotation.color ?? defaultColor(for: annotation.kind),
            createdAt: CloudTimestamp.format(createdAt),
            updatedAt: CloudTimestamp.format(annotation.updatedAt)
        )

        let rows: [MutationResultRow] = try await client
            .from("annotations")
            .insert(insert, returning: .representation)
            .execute()
            .value

        guard let row = rows.first else {
            throw CloudDataError.invalidAnnotation(
                "The server did not return the new annotation."
            )
        }
        return row.updatedAt
    }

    @discardableResult
    func updateAnnotation(
        _ annotation: ReviewAnnotation,
        expectedUpdatedAtToken: String
    ) async throws -> String {
        guard let annotationID = UUID(uuidString: annotation.id) else {
            throw CloudDataError.invalidIdentifier(annotation.id)
        }
        try validate(annotation)

        let update = AnnotationUpdate(
            type: annotation.kind,
            startMilliseconds: annotation.startTime * 1_000,
            endMilliseconds: annotation.endTime.map { $0 * 1_000 },
            title: annotation.title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: .plainText(annotation.body),
            color: annotation.color ?? defaultColor(for: annotation.kind),
            updatedAt: CloudTimestamp.format(annotation.updatedAt),
            deletedAt: nil
        )

        let rows: [MutationResultRow] = try await client
            .from("annotations")
            .update(update, returning: .representation)
            .eq("id", value: annotationID)
            .eq("updated_at", value: expectedUpdatedAtToken)
            .is("deleted_at", value: nil)
            .execute()
            .value

        guard let row = rows.first else {
            throw CloudDataError.conflict
        }
        return row.updatedAt
    }

    @discardableResult
    func tombstoneAnnotation(
        id: String,
        expectedUpdatedAtToken: String
    ) async throws -> String {
        guard let annotationID = UUID(uuidString: id) else {
            throw CloudDataError.invalidIdentifier(id)
        }

        let now = Date.now
        let timestamp = CloudTimestamp.format(now)
        let rows: [MutationResultRow] = try await client
            .from("annotations")
            .update(
                AnnotationTombstone(deletedAt: timestamp, updatedAt: timestamp),
                returning: .representation
            )
            .eq("id", value: annotationID)
            .eq("updated_at", value: expectedUpdatedAtToken)
            .is("deleted_at", value: nil)
            .execute()
            .value

        guard let row = rows.first else {
            throw CloudDataError.conflict
        }
        return row.updatedAt
    }

    static func mapSnapshot(
        songRows: [SongRow],
        audioFileRows: [AudioFileRow],
        annotationRows: [AnnotationRow]
    ) throws -> CloudLibrarySnapshot {
        let annotationsByAudioFileID = try Dictionary(
            grouping: annotationRows,
            by: \.audioFileID
        ).mapValues { rows in
            try rows
                .map { row in
                    ReviewAnnotation(
                        id: row.id.uuidString.lowercased(),
                        kind: row.type,
                        startTime: max(0, row.startMilliseconds / 1_000),
                        endTime: row.endMilliseconds.map { max(0, $0 / 1_000) },
                        title: row.title,
                        body: row.body.plainText,
                        authorName: "You",
                        updatedAt: try CloudTimestamp.parse(row.updatedAt),
                        color: row.color,
                        cloudUpdatedAtToken: row.updatedAt
                    )
                }
                .sorted { $0.startTime < $1.startTime }
        }

        let audioFilesBySongID = Dictionary(grouping: audioFileRows, by: \.songID)
        let songs = try songRows.map { row in
            let order = Dictionary(
                uniqueKeysWithValues: row.audioFileOrder.enumerated().map { ($0.element, $0.offset) }
            )
            let versions = try (audioFilesBySongID[row.id] ?? [])
                .map { audioRow in
                    AudioVersion(
                        id: audioRow.id.uuidString.lowercased(),
                        name: audioRow.title,
                        createdAt: try CloudTimestamp.parse(audioRow.createdAt),
                        duration: max(0, audioRow.durationMilliseconds / 1_000),
                        waveformPeaks: audioRow.waveform.peaks.map {
                            min(1, max(0, $0))
                        },
                        annotations: annotationsByAudioFileID[audioRow.id] ?? []
                    )
                }
                .sorted { left, right in
                    let leftID = UUID(uuidString: left.id)
                    let rightID = UUID(uuidString: right.id)
                    let leftOrder = leftID.flatMap { order[$0] }
                    let rightOrder = rightID.flatMap { order[$0] }

                    switch (leftOrder, rightOrder) {
                    case let (.some(leftIndex), .some(rightIndex)):
                        return leftIndex < rightIndex
                    case (.some, .none):
                        return true
                    case (.none, .some):
                        return false
                    case (.none, .none):
                        return left.createdAt < right.createdAt
                    }
                }

            return Song(
                id: row.id.uuidString.lowercased(),
                title: row.title,
                artist: row.artist,
                updatedAt: try CloudTimestamp.parse(row.updatedAt),
                versions: versions
            )
        }

        return CloudLibrarySnapshot(
            songs: songs.sorted { $0.updatedAt > $1.updatedAt }
        )
    }

    private func identifiers(
        annotationID: String,
        songID: String,
        audioFileID: String
    ) async throws -> (
        annotationID: UUID,
        userID: UUID,
        songID: UUID,
        audioFileID: UUID
    ) {
        guard let annotationUUID = UUID(uuidString: annotationID) else {
            throw CloudDataError.invalidIdentifier(annotationID)
        }
        guard let songUUID = UUID(uuidString: songID) else {
            throw CloudDataError.invalidIdentifier(songID)
        }
        guard let audioFileUUID = UUID(uuidString: audioFileID) else {
            throw CloudDataError.invalidIdentifier(audioFileID)
        }

        let session = try await client.auth.session
        return (annotationUUID, session.user.id, songUUID, audioFileUUID)
    }

    private func validate(_ annotation: ReviewAnnotation) throws {
        guard annotation.startTime.isFinite, annotation.startTime >= 0 else {
            throw CloudDataError.invalidAnnotation(
                "An annotation must start at or after the beginning of the file."
            )
        }

        switch annotation.kind {
        case .point:
            guard annotation.endTime == nil else {
                throw CloudDataError.invalidAnnotation(
                    "A point annotation cannot have an end time."
                )
            }
        case .range:
            guard
                let endTime = annotation.endTime,
                endTime.isFinite,
                endTime > annotation.startTime
            else {
                throw CloudDataError.invalidAnnotation(
                    "A range annotation must end after its start time."
                )
            }
        }
    }

    private func defaultColor(for kind: ReviewAnnotation.Kind) -> String {
        kind == .point
            ? "var(--color-marker-point)"
            : "var(--color-marker-range)"
    }
}
