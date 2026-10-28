import Foundation
@preconcurrency import Supabase

struct CloudLibrarySnapshot: Codable {
    var songs: [Song]
    var trashedSongs: [Song]
    var playlists: [Playlist]
}

final class ReviewCloudEnvironment: @unchecked Sendable {
    let client: SupabaseClient
    let library: CloudLibraryService
    let signedMedia: SignedMediaURLProvider

    init(configuration: CloudConfiguration) {
        let client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabasePublishableKey,
            options: .init(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
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
            .select("*")
            .execute()
            .value

        let audioFileRows: [AudioFileRow] = try await client
            .from("audio_files")
            .select("id,song_id,title,notes,duration_ms,waveform,session_date,loudness,gallery_images,created_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        let annotationRows: [AnnotationRow] = try await client
            .from("annotations")
            .select("id,audio_file_id,type,start_ms,end_ms,detail,color,updated_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        let playlistRows: [PlaylistRow] = try await client
            .from("playlists")
            .select("id,name,audio_file_ids,sort_order,created_at,updated_at")
            .is("deleted_at", value: nil)
            .execute()
            .value

        return try Self.mapSnapshot(
            songRows: songRows,
            audioFileRows: audioFileRows,
            annotationRows: annotationRows,
            playlistRows: playlistRows
        )
    }

    func trashSong(id value: String) async throws {
        try await setSongDeletedAt(id: value, deletedAt: .now)
    }

    func restoreSong(id value: String) async throws {
        try await setSongDeletedAt(id: value, deletedAt: nil)
    }

    func permanentlyDeleteSong(id value: String) async throws {
        guard let id = UUID(uuidString: value) else {
            throw CloudDataError.invalidIdentifier(value)
        }
        try await client
            .from("songs")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    private func setSongDeletedAt(id value: String, deletedAt: Date?) async throws {
        guard let id = UUID(uuidString: value) else {
            throw CloudDataError.invalidIdentifier(value)
        }
        let now = CloudTimestamp.format(.now)
        try await client
            .from("songs")
            .update(
                SongTrashUpdate(
                    deletedAt: deletedAt.map(CloudTimestamp.format),
                    updatedAt: now
                )
            )
            .eq("id", value: id)
            .execute()
    }

    func insertPlaylist(_ playlist: Playlist) async throws {
        let session = try await client.auth.session
        guard let id = UUID(uuidString: playlist.id) else {
            throw CloudDataError.invalidIdentifier(playlist.id)
        }
        let audioFileIDs = try playlist.audioFileIDs.map { value in
            guard let id = UUID(uuidString: value) else {
                throw CloudDataError.invalidIdentifier(value)
            }
            return id
        }
        try await client
            .from("playlists")
            .insert(
                PlaylistInsert(
                    id: id,
                    userID: session.user.id,
                    name: playlist.name,
                    audioFileIDs: audioFileIDs,
                    sortOrder: playlist.sortOrder,
                    createdAt: CloudTimestamp.format(playlist.createdAt),
                    updatedAt: CloudTimestamp.format(playlist.updatedAt)
                )
            )
            .execute()
    }

    func updatePlaylist(_ playlist: Playlist) async throws {
        guard let id = UUID(uuidString: playlist.id) else {
            throw CloudDataError.invalidIdentifier(playlist.id)
        }
        let audioFileIDs = try playlist.audioFileIDs.map { value in
            guard let id = UUID(uuidString: value) else {
                throw CloudDataError.invalidIdentifier(value)
            }
            return id
        }
        try await client
            .from("playlists")
            .update(
                PlaylistUpdate(
                    name: playlist.name,
                    audioFileIDs: audioFileIDs,
                    sortOrder: playlist.sortOrder,
                    updatedAt: CloudTimestamp.format(playlist.updatedAt),
                    deletedAt: nil
                )
            )
            .eq("id", value: id)
            .is("deleted_at", value: nil)
            .execute()
    }

    func tombstonePlaylist(id value: String) async throws {
        guard let id = UUID(uuidString: value) else {
            throw CloudDataError.invalidIdentifier(value)
        }
        let timestamp = CloudTimestamp.format(.now)
        try await client
            .from("playlists")
            .update(PlaylistTombstone(deletedAt: timestamp, updatedAt: timestamp))
            .eq("id", value: id)
            .is("deleted_at", value: nil)
            .execute()
    }

    @discardableResult
    func updateSongJournal(_ journal: String, songID: String) async throws -> String {
        guard let songID = UUID(uuidString: songID) else {
            throw CloudDataError.invalidIdentifier(songID)
        }

        let update = SongJournalUpdate(
            generalNotes: journal,
            updatedAt: CloudTimestamp.format(.now)
        )
        let rows: [MutationResultRow] = try await client
            .from("songs")
            .update(update, returning: .representation)
            .eq("id", value: songID)
            .is("deleted_at", value: nil)
            .execute()
            .value

        guard let row = rows.first else {
            throw CloudDataError.invalidIdentifier(songID.uuidString)
        }
        return row.updatedAt
    }

    /// Sets or clears `songs.starred_audio_file_id` without writing other song columns.
    func updateStarredAudioFileID(_ audioFileID: String?, songID: String) async throws {
        guard let songUUID = UUID(uuidString: songID) else {
            throw CloudDataError.invalidIdentifier(songID)
        }
        let starredID: String?
        if let audioFileID {
            guard let fileUUID = UUID(uuidString: audioFileID) else {
                throw CloudDataError.invalidIdentifier(audioFileID)
            }
            starredID = fileUUID.uuidString.lowercased()
        } else {
            starredID = nil
        }
        try await client
            .from("songs")
            .update(
                SongStarUpdate(
                    starredAudioFileID: starredID,
                    updatedAt: CloudTimestamp.format(.now)
                )
            )
            .eq("id", value: songUUID)
            .is("deleted_at", value: nil)
            .execute()
    }

    @discardableResult
    func updateAudioFileNotes(_ notes: String, audioFileID: String) async throws -> String {
        guard let audioFileID = UUID(uuidString: audioFileID) else {
            throw CloudDataError.invalidIdentifier(audioFileID)
        }

        let update = AudioFileNotesUpdate(
            notes: .plainText(notes),
            updatedAt: CloudTimestamp.format(.now)
        )
        let rows: [MutationResultRow] = try await client
            .from("audio_files")
            .update(update, returning: .representation)
            .eq("id", value: audioFileID)
            .is("deleted_at", value: nil)
            .execute()
            .value

        guard let row = rows.first else {
            throw CloudDataError.invalidIdentifier(audioFileID.uuidString)
        }
        return row.updatedAt
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
            detail: .plainText(annotation.detail),
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
                "The server did not return the new marker or range."
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
            detail: .plainText(annotation.detail),
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
        expectedUpdatedAtToken: String,
        updatedAt: Date = .now
    ) async throws -> String {
        guard let annotationID = UUID(uuidString: id) else {
            throw CloudDataError.invalidIdentifier(id)
        }

        let timestamp = CloudTimestamp.format(updatedAt)
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

    /// Read before replay: a lost HTTP response may mean this exact write already
    /// succeeded. Preserve other-device changes instead of blindly upserting.
    func synchronize(_ write: PendingAnnotationWrite) async throws -> String {
        let rows: [AnnotationSyncRow] = try await client
            .from("annotations")
            .select("id,audio_file_id,type,start_ms,end_ms,detail,color,updated_at,deleted_at")
            .eq("id", value: write.annotation.id)
            .execute().value
        if let remote = rows.first, try remote.matches(write) {
            return remote.annotation.updatedAt
        }
        switch write.operation {
        case .insert:
            guard rows.isEmpty else { throw CloudDataError.conflict }
            return try await insertAnnotation(
                write.annotation, songID: write.songID,
                audioFileID: write.versionID, createdAt: write.annotation.updatedAt
            )
        case .update:
            guard let token = write.expectedUpdatedAtToken else { throw CloudDataError.conflict }
            return try await updateAnnotation(write.annotation, expectedUpdatedAtToken: token)
        case .delete:
            // Deletion is already satisfied if the record was deleted elsewhere.
            if rows.isEmpty || rows.first?.deletedAt != nil {
                return rows.first?.annotation.updatedAt ?? CloudTimestamp.format(write.annotation.updatedAt)
            }
            guard let token = write.expectedUpdatedAtToken else { throw CloudDataError.conflict }
            return try await tombstoneAnnotation(
                id: write.annotation.id, expectedUpdatedAtToken: token,
                updatedAt: write.annotation.updatedAt
            )
        }
    }

    func synchronize(_ write: PendingNoteWrite) async throws {
        for _ in 0..<3 {
            let rows: [SongRow] = try await client.from("songs").select("*")
                .eq("id", value: write.songID).is("deleted_at", value: nil).execute().value
            guard let row = rows.first else { throw NoteTabError.conflict }
            let current = Song(id: row.id.uuidString.lowercased(), title: row.title, artist: row.artist,
                               generalNotes: row.generalNotes, noteTabs: row.noteTabs,
                               updatedAt: try CloudTimestamp.parse(row.updatedAt), versions: [])
            let next = try write.applying(to: current, checkingConflicts: true)
            // Idempotent replay after a successful request whose response was lost.
            if next.resolvedNoteTabs == current.resolvedNoteTabs { return }
            let updated: [MutationResultRow] = try await client.from("songs")
                .update(SongNoteTabsUpdate(generalNotes: next.generalNotes,
                                          noteTabs: next.resolvedNoteTabs,
                                          updatedAt: CloudTimestamp.format(.now)), returning: .representation)
                .eq("id", value: write.songID).eq("updated_at", value: row.updatedAt)
                .is("deleted_at", value: nil).execute().value
            if !updated.isEmpty { return }
            // Another field changed while reading. Re-read and merge, never
            // overwrite the entire stale song or another tab's contents.
        }
        throw NoteTabError.conflict
    }

    static func mapSnapshot(
        songRows: [SongRow],
        audioFileRows: [AudioFileRow],
        annotationRows: [AnnotationRow],
        playlistRows: [PlaylistRow] = []
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
                        detail: row.detail.plainText,
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
                        notes: audioRow.notes.plainText,
                        sessionDate: audioRow.sessionDate,
                        createdAt: try CloudTimestamp.parse(audioRow.createdAt),
                        duration: max(0, audioRow.durationMilliseconds / 1_000),
                        waveformPeaks: audioRow.waveform.peaks.map {
                            min(1, max(0, $0))
                        },
                        loudness: audioRow.loudness?.normalized,
                        annotations: annotationsByAudioFileID[audioRow.id] ?? [],
                        galleryImages: audioRow.galleryImages
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
                generalNotes: row.generalNotes,
                noteTabs: row.noteTabs,
                galleryImages: row.galleryImages,
                starredAudioFileID: row.starredAudioFileID?.uuidString.lowercased(),
                updatedAt: try CloudTimestamp.parse(row.updatedAt),
                deletedAt: try row.deletedAt.map(CloudTimestamp.parse),
                versions: versions
            )
        }

        let activeAudioFileIDs = Set(audioFileRows.map(\.id))
        var playlists: [Playlist] = []
        for row in playlistRows {
            let audioFileIDs = row.audioFileIDs
                .filter { activeAudioFileIDs.contains($0) }
                .map { $0.uuidString.lowercased() }
            let createdAt = try CloudTimestamp.parse(row.createdAt)
            let updatedAt = try CloudTimestamp.parse(row.updatedAt)
            playlists.append(
                Playlist(
                id: row.id.uuidString.lowercased(),
                name: row.name,
                audioFileIDs: audioFileIDs,
                sortOrder: row.sortOrder,
                createdAt: createdAt,
                updatedAt: updatedAt
                )
            )
        }
        playlists.sort {
            $0.sortOrder == $1.sortOrder
                ? $0.createdAt < $1.createdAt
                : $0.sortOrder < $1.sortOrder
        }

        return CloudLibrarySnapshot(
            songs: songs.filter { $0.deletedAt == nil }.sorted { $0.updatedAt > $1.updatedAt },
            trashedSongs: songs.filter { $0.deletedAt != nil }.sorted {
                ($0.deletedAt ?? .distantPast) > ($1.deletedAt ?? .distantPast)
            },
            playlists: playlists
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
                "A marker or range must start at or after the beginning of the file."
            )
        }

        switch annotation.kind {
        case .point:
            guard annotation.endTime == nil else {
                throw CloudDataError.invalidAnnotation(
                    "A marker cannot have an end time."
                )
            }
        case .range:
            guard
                let endTime = annotation.endTime,
                endTime.isFinite,
                endTime > annotation.startTime
            else {
                throw CloudDataError.invalidAnnotation(
                    "A range must end after its start time."
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
