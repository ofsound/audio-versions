import Foundation
import ImageIO
import UniformTypeIdentifiers
import UIKit

struct PreparedGalleryImage: Sendable {
    var image: GalleryImage
    var original: Data
    var thumbnail: Data

    // Decode/downsample away from the main actor. Normalize HEIC, orientation and
    // camera metadata to JPEG so every existing client can display phone images.
    static func prepare(_ data: Data, name: String) throws -> Self {
        guard !data.isEmpty, data.count <= 25 * 1024 * 1024 else { throw GalleryError.tooLarge }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int else { throw GalleryError.invalidImage }
        guard width > 0, height > 0, Double(width) * Double(height) <= 50_000_000 else { throw GalleryError.tooLarge }
        func render(maximum: Int) throws -> (Data, Int, Int) {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maximum,
                kCGImageSourceShouldCacheImmediately: true
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw GalleryError.invalidImage }
            let result = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(result, UTType.jpeg.identifier as CFString, 1, nil) else { throw GalleryError.invalidImage }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw GalleryError.invalidImage }
            return (result as Data, image.width, image.height)
        }
        let original = try render(maximum: max(width, height))
        let preview = try render(maximum: 320)
        guard original.0.count <= 25 * 1024 * 1024 else { throw GalleryError.tooLarge }
        let filename = (name as NSString).deletingPathExtension + ".jpg"
        return Self(image: GalleryImage(id: UUID().uuidString.lowercased(), name: filename,
                                       contentType: "image/jpeg", size: original.0.count,
                                       width: original.1, height: original.2,
                                       createdAt: ISO8601DateFormatter().string(from: .now)),
                    original: original.0, thumbnail: preview.0)
    }
}
