import Foundation
@preconcurrency import Supabase

/// All credentials stay in the existing authenticated API. Blob PUTs use scoped,
/// short-lived upload URLs; no store token is shipped to the phone.
extension SignedMediaURLProvider {
    func galleryRequest(_ body: Data) async throws -> Data {
        let session = try await client.auth.session
        func send(_ accessToken: String) async throws -> (Data, HTTPURLResponse) {
            var request = URLRequest(url: endpointURL.deletingLastPathComponent().appending(path: "gallery"))
            request.httpMethod = "POST"
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw SignedMediaError.invalidResponse }
            return (data, http)
        }
        var result = try await send(session.accessToken)
        if result.1.statusCode == 401 {
            let refreshed = try await client.auth.refreshSession()
            result = try await send(refreshed.accessToken)
        }
        guard (200..<300).contains(result.1.statusCode) else {
            throw SignedMediaError.requestFailed(statusCode: result.1.statusCode, message: String(data: result.0, encoding: .utf8) ?? "")
        }
        return result.0
    }

    func galleryURL(scope: GalleryScope, imageID: String, thumbnail: Bool) async throws -> URL {
        struct Request: Encodable { let action = "url"; var songId: String; var audioFileId: String?; var imageId: String; var thumbnail: Bool }
        struct Response: Decodable { var url: URL; var expiresAt: Double }
        let data = try await galleryRequest(JSONEncoder().encode(Request(songId: scope.songId, audioFileId: scope.audioFileId, imageId: imageID, thumbnail: thumbnail)))
        let response = try JSONDecoder().decode(Response.self, from: data)
        let lease = SignedMediaLease(url: response.url, expiresAt: Date(timeIntervalSince1970: response.expiresAt / 1000))
        guard lease.isUsable(at: .now, safetyMargin: 0, maximumLifetime: 86400) else { throw SignedMediaError.invalidLease }
        return response.url
    }

    func uploadGallery(_ prepared: PreparedGalleryImage, scope: GalleryScope) async throws -> GalleryImage {
        struct Request: Encodable { let action = "prepare-upload"; var songId: String; var audioFileId: String?; var imageId: String; let contentType = "image/jpeg"; var thumbnail: Bool }
        struct Response: Decodable { var url: URL; var pathname: String }
        var image = prepared.image
        var uploaded: [String] = []
        do {
            for thumbnail in [false, true] {
                let response = try JSONDecoder().decode(Response.self, from: await galleryRequest(JSONEncoder().encode(Request(songId: scope.songId, audioFileId: scope.audioFileId, imageId: image.id, thumbnail: thumbnail))))
                guard response.url.scheme == "https" else { throw SignedMediaError.invalidLease }
                uploaded.append(response.pathname)
                var request = URLRequest(url: response.url)
                request.httpMethod = "PUT"
                request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
                request.setValue("image/jpeg", forHTTPHeaderField: "x-content-type")
                let bytes = thumbnail ? prepared.thumbnail : prepared.original
                let (data, result) = try await URLSession.shared.upload(for: request, from: bytes)
                guard let http = result as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                    throw SignedMediaError.requestFailed(statusCode: (result as? HTTPURLResponse)?.statusCode ?? 0, message: String(data: data, encoding: .utf8) ?? "Image upload failed.")
                }
                let media = GalleryImage.Media(pathname: response.pathname, contentType: "image/jpeg", size: bytes.count, originalName: thumbnail ? "thumbnail.jpg" : image.name)
                if thumbnail { image.thumbnailMedia = media } else { image.remoteMedia = media }
            }
            return image
        } catch {
            for pathname in uploaded { await cleanupGalleryPath(pathname) }
            throw error
        }
    }

    func cleanupGalleryPath(_ pathname: String) async {
        struct Request: Encodable { let action = "delete"; var pathname: String }
        _ = try? await galleryRequest(JSONEncoder().encode(Request(pathname: pathname)))
    }

    func mutateGallery(scope: GalleryScope, imageID: String, image: GalleryImage?) async throws -> [GalleryImage] {
        struct Request: Encodable { var action: String; var songId: String; var audioFileId: String?; var imageId: String; var image: GalleryImage? }
        struct Response: Decodable { var images: [GalleryImage] }
        let data = try await galleryRequest(JSONEncoder().encode(Request(action: image == nil ? "remove" : "attach", songId: scope.songId, audioFileId: scope.audioFileId, imageId: imageID, image: image)))
        return try JSONDecoder().decode(Response.self, from: data).images
    }
}
