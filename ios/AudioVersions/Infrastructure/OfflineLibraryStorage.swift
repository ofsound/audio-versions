import Foundation

struct PendingAnnotationWrite: Identifiable, Codable {
    enum Operation: String, Codable { case insert, update, delete }

    let id: UUID
    let operation: Operation
    let songID: String
    let versionID: String
    let annotation: ReviewAnnotation
    var expectedUpdatedAtToken: String?
    var conflictMessage: String?
}

struct OfflineDownload: Codable {
    let filename: String
    let byteCount: Int64
}

struct OfflineLibraryState: Codable {
    var snapshot = CloudLibrarySnapshot(songs: [], trashedSongs: [], playlists: [])
    var downloads: [String: OfflineDownload] = [:]
    var pendingWrites: [PendingAnnotationWrite] = []
    var pendingNoteWrites: [PendingNoteWrite]? = nil

    /// A refreshed cloud snapshot must never replace unsynced phone edits.
    mutating func merge(_ remote: CloudLibrarySnapshot) {
        snapshot = remote
        for write in pendingWrites { apply(write) }
        for write in pendingNoteWrites ?? [] { apply(write) }
    }

    mutating func apply(_ write: PendingAnnotationWrite) {
        guard let songIndex = snapshot.songs.firstIndex(where: { $0.id == write.songID }),
              let versionIndex = snapshot.songs[songIndex].versions.firstIndex(where: {
                  $0.id == write.versionID
              }) else { return }
        var annotations = snapshot.songs[songIndex].versions[versionIndex].annotations
        annotations.removeAll { $0.id == write.annotation.id }
        if write.operation != .delete {
            annotations.append(write.annotation)
        }
        snapshot.songs[songIndex].versions[versionIndex].annotations = annotations.sorted {
            $0.startTime < $1.startTime
        }
    }

    mutating func apply(_ write: PendingNoteWrite) {
        guard let index = snapshot.songs.firstIndex(where: { $0.id == write.songID }),
              let song = try? write.applying(to: snapshot.songs[index], checkingConflicts: false)
        else { return }
        snapshot.songs[index] = song
    }

    mutating func acknowledge(_ write: PendingAnnotationWrite, token: String) {
        pendingWrites.removeAll { $0.id == write.id }
        // Chain optimistic concurrency tokens through edits made while a request was in flight.
        if let index = pendingWrites.firstIndex(where: { $0.annotation.id == write.annotation.id }) {
            pendingWrites[index].expectedUpdatedAtToken = token
        }
        for songIndex in snapshot.songs.indices {
            for versionIndex in snapshot.songs[songIndex].versions.indices {
                if let index = snapshot.songs[songIndex].versions[versionIndex].annotations
                    .firstIndex(where: { $0.id == write.annotation.id }) {
                    snapshot.songs[songIndex].versions[versionIndex].annotations[index]
                        .cloudUpdatedAtToken = token
                }
            }
        }
    }
}

/// iOS Data Protection encrypts both metadata and media on disk. This protection
/// class remains readable after first unlock, including during locked-screen playback.
/// Account directories are excluded from backups; no signed URLs or tokens are cached.
@MainActor
final class OfflineLibraryStorage {
    let directory: URL
    private(set) var state: OfflineLibraryState

    init(userID: UUID, root: URL? = nil) throws {
        let root = root ?? FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0].appending(path: "OfflineLibrary", directoryHint: .isDirectory)
        directory = root.appending(path: userID.uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        var directoryURL = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directoryURL.setResourceValues(values)
        let metadataURL = directory.appending(path: "library.json")
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            // Fail visibly on damaged/unreadable metadata, rather than overwriting queued work.
            state = try JSONDecoder().decode(OfflineLibraryState.self, from: Data(contentsOf: metadataURL))
        } else {
            state = OfflineLibraryState()
        }
    }

    func save(_ next: OfflineLibraryState) throws {
        let data = try JSONEncoder().encode(next)
        try data.write(
            to: directory.appending(path: "library.json"),
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        state = next
    }

    func mediaURL(for versionID: String) -> URL? {
        guard let download = state.downloads[versionID] else { return nil }
        let url = directory.appending(path: download.filename)
        guard FileManager.default.fileExists(atPath: url.path),
              let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              Int64(size) == download.byteCount else { return nil }
        return url
    }

    func storeDownload(from source: URL, versionID: String) throws {
        let ext = source.pathExtension
        let filename = UUID().uuidString + (ext.isEmpty ? "" : ".\(ext)")
        let destination = directory.appending(path: filename)
        try FileManager.default.copyItem(at: source, to: destination)
        do {
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: destination.path
            )
            let size = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 else { throw PlaybackFileLoadingError.invalidResponse }
            var next = state
            let previous = next.downloads[versionID]
            next.downloads[versionID] = OfflineDownload(filename: filename, byteCount: Int64(size))
            try save(next)
            if let previous {
                try? FileManager.default.removeItem(at: directory.appending(path: previous.filename))
            }
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    func removeDownload(versionID: String) throws {
        guard let download = state.downloads[versionID] else { return }
        let url = directory.appending(path: download.filename)
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        var next = state
        next.downloads.removeValue(forKey: versionID)
        try save(next)
    }

    func erase() throws {
        try FileManager.default.removeItem(at: directory)
        state = OfflineLibraryState()
    }
}
