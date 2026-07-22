import Foundation
@preconcurrency import Supabase

enum SignedMediaError: Error, LocalizedError {
    case invalidResponse
    case requestFailed(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The media server returned an invalid response."
        case let .requestFailed(statusCode, message):
            message.isEmpty
                ? "The media request failed (HTTP \(statusCode))."
                : message
        }
    }
}

actor SignedMediaURLProvider {
    private struct CacheEntry {
        let url: URL
        let expiresAt: Date
    }

    private struct RequestBody: Encodable {
        let audioFileId: String
    }

    private struct ResponseBody: Decodable {
        let expiresAt: Int64
        let url: URL
    }

    private let client: SupabaseClient
    private let endpointURL: URL
    private let urlSession: URLSession
    private var cache: [String: CacheEntry] = [:]

    init(
        client: SupabaseClient,
        apiBaseURL: URL,
        urlSession: URLSession = .shared
    ) {
        self.client = client
        endpointURL = apiBaseURL.appending(path: "api/blob/signed-url")
        self.urlSession = urlSession
    }

    func signedURL(for audioFileID: String) async throws -> URL {
        if let cached = cache[audioFileID], cached.expiresAt > .now.addingTimeInterval(60) {
            return cached.url
        }

        let session = try await client.auth.session
        let initialResponse = try await request(
            audioFileID: audioFileID,
            accessToken: session.accessToken
        )

        let response: ResponseBody
        if initialResponse.statusCode == 401 {
            let refreshedSession = try await client.auth.refreshSession()
            response = try decode(
                try await request(
                    audioFileID: audioFileID,
                    accessToken: refreshedSession.accessToken
                )
            )
        } else {
            response = try decode(initialResponse)
        }

        cache[audioFileID] = CacheEntry(
            url: response.url,
            expiresAt: Date(timeIntervalSince1970: Double(response.expiresAt) / 1_000)
        )
        return response.url
    }

    func invalidate(audioFileID: String) {
        cache.removeValue(forKey: audioFileID)
    }

    func invalidateAll() {
        cache.removeAll()
    }

    private func request(
        audioFileID: String,
        accessToken: String
    ) async throws -> (data: Data, statusCode: Int) {
        var request = URLRequest(url: endpointURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RequestBody(audioFileId: audioFileID))

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SignedMediaError.invalidResponse
        }
        return (data, httpResponse.statusCode)
    }

    private func decode(_ response: (data: Data, statusCode: Int)) throws -> ResponseBody {
        guard (200..<300).contains(response.statusCode) else {
            throw SignedMediaError.requestFailed(
                statusCode: response.statusCode,
                message: String(data: response.data, encoding: .utf8) ?? ""
            )
        }

        do {
            return try JSONDecoder().decode(ResponseBody.self, from: response.data)
        } catch {
            throw SignedMediaError.invalidResponse
        }
    }
}
