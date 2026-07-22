import Foundation
import Testing

@testable import AudioVersions

struct ReviewCompanionTests {
    @Test
    func playbackTimestampFormatsMinutesAndSeconds() {
        #expect(TimeInterval(0).playbackTimestamp == "0:00")
        #expect(TimeInterval(65.9).playbackTimestamp == "1:05")
        #expect(TimeInterval.infinity.playbackTimestamp == "0:00")
    }

    @Test
    func latestVersionUsesCreationDate() throws {
        let song = try #require(FixtureLibrary.songs.first)
        #expect(song.latestVersion?.id == "afterglow-v4")
    }

    @MainActor
    @Test
    func seekClampsToVersionDuration() throws {
        let store = ReviewCompanionStore()
        let song = try #require(store.songs.first)
        let version = try #require(song.versions.first)

        store.seek(to: version.duration + 10, in: version)
        #expect(store.currentTime == version.duration)

        store.seek(to: -10, in: version)
        #expect(store.currentTime == 0)
    }

    @MainActor
    @Test
    func annotationsInsertSortUpdateAndDelete() throws {
        let store = ReviewCompanionStore()
        let version = try #require(store.songs.first?.versions.first)
        var annotation = ReviewAnnotation(
            id: "fixture-new",
            kind: .point,
            startTime: 3,
            endTime: nil,
            title: "First",
            body: "",
            authorName: "Ben",
            updatedAt: .now
        )

        store.save(annotation, in: version.id)
        #expect(store.version(id: version.id)?.annotations.first?.id == annotation.id)

        annotation.title = "Updated"
        store.save(annotation, in: version.id)
        #expect(
            store.version(id: version.id)?.annotations.first(where: {
                $0.id == annotation.id
            })?.title == "Updated"
        )

        store.delete(annotation, from: version.id)
        #expect(
            store.version(id: version.id)?.annotations.contains(where: {
                $0.id == annotation.id
            }) == false
        )
    }

    @Test
    func missingCloudConfigurationFallsBackToFixtures() {
        #expect(AppConfiguration.resolve(infoDictionary: [:]) == .fixture)
    }

    @Test
    func richTextPlainTextRoundTrips() {
        let original = "First paragraph\nwith a break\n\nSecond paragraph"
        #expect(RichTextDocument.plainText(original).plainText == original)
    }
}
