import Foundation

struct GalleryImage: Identifiable, Hashable, Codable, Sendable {
    struct Media: Hashable, Codable, Sendable {
        var pathname: String
        var contentType: String
        var size: Int
        var originalName: String
    }
    var id: String
    var name: String
    var contentType: String
    var size: Int
    var width: Int
    var height: Int
    var createdAt: String
    var remoteMedia: Media?
    var thumbnailMedia: Media?
}

struct GalleryScope: Hashable, Encodable, Sendable {
    var songId: String
    var audioFileId: String? = nil
}

enum GalleryError: LocalizedError {
    case invalidImage, tooLarge, unavailable, accountChanged
    var errorDescription: String? {
        switch self {
        case .invalidImage: "This image could not be read. Choose another image."
        case .tooLarge: "Images must be at most 25 MB and 50 megapixels."
        case .unavailable: "Connect to your cloud library to add or remove images."
        case .accountChanged: "The signed-in account changed. Please try again."
        }
    }
}
