import Foundation
@preconcurrency import Supabase

enum SignedMediaError: Error, LocalizedError {
    case invalidResponse
    case invalidLease
    case requestFailed(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The media server returned an invalid response."
        case .invalidLease:
            "The media server returned an unsafe or expired playback link."
        case let .requestFailed(statusCode, message):
            message.isEmpty
                ? "The media request failed (HTTP \(statusCode))."
                : message
        }
    }
}

struct SignedMediaLease: Sendable {
    let url: URL
    let expiresAt: Date

    func isUsable(
        at now: Date,
        safetyMargin: TimeInterval,
        maximumLifetime: TimeInterval
    ) -> Bool {
        url.scheme?.lowercased() == "https"
            && expiresAt > now.addingTimeInterval(safetyMargin)
            && expiresAt < now.addingTimeInterval(maximumLifetime)
    }
}

actor SignedMediaURLProvider {
    private struct InFlightRequest {
        let id: UUID
        let task: Task<SignedMediaLease, Error>
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
    private var cache: [String: SignedMediaLease] = [:]
    private var inFlightRequests: [String: InFlightRequest] = [:]

    private static let leaseSafetyMargin: TimeInterval = 5 * 60
    private static let maximumLeaseLifetime: TimeInterval = 7 * 24 * 60 * 60
    private static let maximumCacheEntries = 32

    init(
        client: SupabaseClient,
        apiBaseURL: URL,
        urlSession: URLSession? = nil
    ) {
        self.client = client
        endpointURL = apiBaseURL.appending(path: "api/blob/signed-url")
        self.urlSession = urlSession ?? Self.makeURLSession()
    }

    func signedURL(for audioFileID: String) async throws -> URL {
        try await signedLease(for: audioFileID).url
    }

    func signedLease(for audioFileID: String) async throws -> SignedMediaLease {
        if let cached = cache[audioFileID] {
            if cached.expiresAt > .now.addingTimeInterval(Self.leaseSafetyMargin) {
                return cached
            }
            cache.removeValue(forKey: audioFileID)
        }

        if let inFlightRequest = inFlightRequests[audioFileID] {
            return try await inFlightRequest.task.value
        }

        let requestID = UUID()
        let requestTask = Task { [weak self] in
            guard let self else { throw CancellationError() }
            return try await self.fetchLease(for: audioFileID)
        }
        inFlightRequests[audioFileID] = InFlightRequest(id: requestID, task: requestTask)

        do {
            let lease = try await requestTask.value
            if removeInFlightRequest(audioFileID: audioFileID, requestID: requestID) {
                cache[audioFileID] = lease
                trimCacheIfNeeded()
            }
            return lease
        } catch {
            removeInFlightRequest(audioFileID: audioFileID, requestID: requestID)
            throw error
        }
    }

    private func fetchLease(for audioFileID: String) async throws -> SignedMediaLease {
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

        let expiresAt = Date(timeIntervalSince1970: Double(response.expiresAt) / 1_000)
        let lease = SignedMediaLease(url: response.url, expiresAt: expiresAt)
        guard lease.isUsable(
            at: .now,
            safetyMargin: Self.leaseSafetyMargin,
            maximumLifetime: Self.maximumLeaseLifetime
        ) else {
            throw SignedMediaError.invalidLease
        }
        return lease
    }

    func invalidate(audioFileID: String) {
        cache.removeValue(forKey: audioFileID)
        inFlightRequests[audioFileID]?.task.cancel()
        inFlightRequests.removeValue(forKey: audioFileID)
    }

    func invalidateAll() {
        cache.removeAll()
        inFlightRequests.values.forEach { $0.task.cancel() }
        inFlightRequests.removeAll()
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

    private func trimCacheIfNeeded() {
        guard cache.count > Self.maximumCacheEntries else { return }
        let overflow = cache.count - Self.maximumCacheEntries
        for key in cache.sorted(by: { $0.value.expiresAt < $1.value.expiresAt }).prefix(overflow).map(\.key) {
            cache.removeValue(forKey: key)
        }
    }

    @discardableResult
    private func removeInFlightRequest(audioFileID: String, requestID: UUID) -> Bool {
        guard inFlightRequests[audioFileID]?.id == requestID else { return false }
        inFlightRequests.removeValue(forKey: audioFileID)
        return true
    }

    private static func makeURLSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }
}
