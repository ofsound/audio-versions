import Foundation

enum PlaybackFileLoadingError: Error, LocalizedError {
    case invalidResponse
    case requestFailed(statusCode: Int)
    case incompleteDownload

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The audio server returned an invalid response."
        case let .requestFailed(statusCode):
            "The audio download failed (HTTP \(statusCode))."
        case .incompleteDownload:
            "The audio download was incomplete. Please try again."
        }
    }
}

actor PlaybackFileLoader {
    private let urlSession: URLSession
    private static let playbackDirectoryURL = FileManager.default.temporaryDirectory
        .appending(path: "AudioVersionsPlayback", directoryHint: .isDirectory)

    init(urlSession: URLSession? = nil) {
        self.urlSession = urlSession ?? Self.makeURLSession()
        try? FileManager.default.removeItem(at: Self.playbackDirectoryURL)
    }

    func download(from sourceURL: URL) async throws -> URL {
        var ownedFileURL: URL?

        do {
            let (temporaryURL, response) = try await urlSession.download(from: sourceURL)
            guard let response = response as? HTTPURLResponse else {
                throw PlaybackFileLoadingError.invalidResponse
            }
            guard response.statusCode == 200 else {
                throw PlaybackFileLoadingError.requestFailed(statusCode: response.statusCode)
            }
            let size = try temporaryURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0,
                  response.expectedContentLength < 0 || Int64(size) == response.expectedContentLength else {
                throw PlaybackFileLoadingError.incompleteDownload
            }
            try Task.checkCancellation()

            let fileManager = FileManager.default
            try fileManager.createDirectory(
                at: Self.playbackDirectoryURL,
                withIntermediateDirectories: true,
                attributes: [
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
                ]
            )

            let suggestedPathExtension = response.suggestedFilename.map {
                URL(fileURLWithPath: $0).pathExtension
            }?.nonEmpty
            let pathExtension = suggestedPathExtension ?? sourceURL.pathExtension.nonEmpty
            var destinationURL = Self.playbackDirectoryURL.appending(
                path: UUID().uuidString,
                directoryHint: .notDirectory
            )
            if let pathExtension {
                destinationURL.appendPathExtension(pathExtension)
            }

            try fileManager.moveItem(at: temporaryURL, to: destinationURL)
            ownedFileURL = destinationURL
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: destinationURL.path
            )
            try Task.checkCancellation()
            return destinationURL
        } catch {
            if let ownedFileURL {
                try? FileManager.default.removeItem(at: ownedFileURL)
            }
            throw error
        }
    }

    private static func makeURLSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
