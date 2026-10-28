import Foundation
import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers
@testable import AudioVersions

struct GalleryTests {
    @Test func decodesSharedGalleryMetadataAndKeepsOldCachesCompatible() throws {
        let json = #"{"id":"11111111-1111-4111-8111-111111111111","title":"Song","artist":"","general_notes":"","audio_file_order":[],"updated_at":"2026-10-28T12:00:00Z","gallery_images":[{"id":"22222222-2222-4222-8222-222222222222","name":"Photo.jpg","contentType":"image/jpeg","size":200,"width":20,"height":10,"createdAt":"2026-10-28T12:00:00Z","remoteMedia":{"pathname":"users/owner/images/22222222-2222-4222-8222-222222222222/photo.jpg","contentType":"image/jpeg","size":200,"originalName":"Photo.jpg"}}]}"#
        let row = try JSONDecoder().decode(SongRow.self, from: Data(json.utf8))
        let snapshot = try CloudLibraryService.mapSnapshot(songRows: [row], audioFileRows: [], annotationRows: [])
        #expect(snapshot.songs.first?.galleryImages?.first?.name == "Photo.jpg")
        let song = Song(id: "old", title: "Old", artist: "", updatedAt: .now, versions: [])
        let data = try JSONEncoder().encode(song)
        let decoded = try JSONDecoder().decode(Song.self, from: data)
        #expect(decoded.galleryImages == nil)
        #expect(try JSONDecoder().decode(CloudLibrarySnapshot.self, from: JSONEncoder().encode(snapshot)).songs.first?.galleryImages == snapshot.songs.first?.galleryImages)
    }

    @Test func convertsHEICAndOrientationToSharedJPEGWithThumbnail() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 40), format: format)
        let image = renderer.image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 80, height: 40))
        }
        let encoded = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(encoded, UTType.heic.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, try #require(image.cgImage), [kCGImagePropertyOrientation: 6] as CFDictionary)
        #expect(CGImageDestinationFinalize(destination))
        let prepared = try PreparedGalleryImage.prepare(encoded as Data, name: "Camera.HEIC")
        #expect(prepared.image.name == "Camera.jpg")
        #expect(prepared.image.contentType == "image/jpeg")
        #expect(prepared.image.width == 40)
        #expect(prepared.image.height == 80)
        #expect(prepared.image.size == prepared.original.count)
        let thumbnail = try #require(UIImage(data: prepared.thumbnail))
        #expect(max(thumbnail.size.width, thumbnail.size.height) <= 320)
    }

    @Test func rejectsInvalidAndOversizedImages() {
        #expect(throws: (any Error).self) { try PreparedGalleryImage.prepare(Data("bad image".utf8), name: "bad.png") }
        #expect(throws: (any Error).self) { try PreparedGalleryImage.prepare(Data(count: 25 * 1024 * 1024 + 1), name: "large.jpg") }
    }
}
