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

    @Test
    func playbackTimelineRejectsInvalidTimesAndClampsBounds() {
        #expect(PlaybackTimeline.clamp(-1, duration: 30) == 0)
        #expect(PlaybackTimeline.clamp(12, duration: 30) == 12)
        #expect(PlaybackTimeline.clamp(31, duration: 30) == 30)
        #expect(PlaybackTimeline.clamp(.infinity, duration: 30) == 0)
        #expect(PlaybackTimeline.clamp(10, duration: .nan) == 0)
        #expect(PlaybackTimeline.clamp(10, duration: 0) == 0)
    }

    @Test
    func playbackStateDistinguishesAudibleIntentFromStaticStates() {
        #expect(PlaybackState.playing.isPlayingOrWaiting)
        #expect(PlaybackState.buffering.isPlayingOrWaiting)
        #expect(!PlaybackState.preparing.isPlayingOrWaiting)
        #expect(!PlaybackState.paused.isPlayingOrWaiting)
        #expect(PlaybackState.buffering.statusText == "Buffering…")
        #expect(PlaybackState.failed("Unavailable").statusText == "Unavailable")
    }

    @Test
    func signedMediaLeaseRequiresHTTPSAndSafeExpiryWindow() throws {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let validURL = try #require(URL(string: "https://example.com/audio.wav"))
        let insecureURL = try #require(URL(string: "http://example.com/audio.wav"))

        #expect(
            SignedMediaLease(
                url: validURL,
                expiresAt: now.addingTimeInterval(3_600)
            ).isUsable(at: now, safetyMargin: 300, maximumLifetime: 7_200)
        )
        #expect(
            !SignedMediaLease(
                url: insecureURL,
                expiresAt: now.addingTimeInterval(3_600)
            ).isUsable(at: now, safetyMargin: 300, maximumLifetime: 7_200)
        )
        #expect(
            !SignedMediaLease(
                url: validURL,
                expiresAt: now.addingTimeInterval(299)
            ).isUsable(at: now, safetyMargin: 300, maximumLifetime: 7_200)
        )
        #expect(
            !SignedMediaLease(
                url: validURL,
                expiresAt: now.addingTimeInterval(7_201)
            ).isUsable(at: now, safetyMargin: 300, maximumLifetime: 7_200)
        )
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

    @MainActor
    @Test
    func journalAndFileNotesUpdateTheFixtureLibrary() throws {
        let store = ReviewCompanionStore()
        let song = try #require(store.songs.first)
        let version = try #require(song.versions.first)

        store.saveSongJournal("Finish the bridge arrangement.", songID: song.id)
        store.saveAudioFileNotes("Vocal-up reference mix.", audioFileID: version.id)

        #expect(
            store.songs.first(where: { $0.id == song.id })?.generalNotes
                == "Finish the bridge arrangement."
        )
        #expect(store.version(id: version.id)?.notes == "Vocal-up reference mix.")
    }

    @Test
    func missingCloudConfigurationFallsBackToFixtures() {
        #expect(AppConfiguration.resolve(infoDictionary: [:]) == .fixture)
    }

    @Test
    func insecureMediaEndpointFallsBackToFixtures() {
        #expect(
            AppConfiguration.resolve(
                infoDictionary: [
                    AppConfiguration.supabaseURLKey: "https://project.supabase.co",
                    AppConfiguration.supabasePublishableKeyKey: "sb_publishable_example",
                    AppConfiguration.apiBaseURLKey: "http://example.com"
                ]
            ) == .fixture
        )
    }

    @Test
    func richTextPlainTextRoundTrips() {
        let original = "First paragraph\nwith a break\n\nSecond paragraph"
        #expect(RichTextDocument.plainText(original).plainText == original)
    }

    @Test
    func songJournalUsesTheSharedPlainTextColumn() throws {
        let songID = UUID()
        let payload = """
        {
          "id": "\(songID.uuidString)",
          "title": "Song",
          "artist": "Artist",
          "general_notes": "First line\\n\\nSecond line",
          "audio_file_order": [],
          "updated_at": "2026-07-23T02:00:00.000Z"
        }
        """
        let row = try JSONDecoder().decode(SongRow.self, from: Data(payload.utf8))
        #expect(row.generalNotes == "First line\n\nSecond line")

        let update = SongJournalUpdate(
            generalNotes: row.generalNotes,
            updatedAt: row.updatedAt
        )
        let encoded = try JSONEncoder().encode(update)
        let object = try #require(
            JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        #expect(object["general_notes"] as? String == row.generalNotes)
    }

    @Test
    func songLinksParseSharedWebTargetsAndJournalLabels() throws {
        let url = try #require(
            URL(
                string: "https://audio.example/songs/song-1?fileId=file-2&annotationId=marker-7&timeMs=54000&autoplay=1"
            )
        )
        let target = try #require(SongLinkTarget(url: url))

        #expect(target.songID == "song-1")
        #expect(target.fileID == "file-2")
        #expect(target.annotationID == "marker-7")
        #expect(target.time == 54)
        #expect(target.autoplay)

        let references = SongJournalLink.extract(
            from: "Mix B - Marker 0:54\n\(url.absoluteString)"
        )
        let reference = try #require(references.first)
        #expect(reference.label == "Mix B - Marker 0:54")
        #expect(reference.target == target)
    }

    @MainActor
    @Test
    func songLinksRouteAndSeekTheLinkedVersion() throws {
        let store = ReviewCompanionStore()
        let song = try #require(store.songs.first)
        let version = try #require(song.versions.first)
        let target = SongLinkTarget(
            songID: song.id,
            fileID: version.id,
            annotationID: version.annotations.first?.id,
            time: 12,
            autoplay: false
        )

        store.openSongLink(target)
        #expect(
            store.navigationPath == [
                .song(id: song.id),
                .version(
                    songID: song.id,
                    versionID: version.id,
                    target: target
                )
            ]
        )

        store.open(version: version, at: 12, autoplay: false)
        #expect(store.activeVersionID == version.id)
        #expect(store.currentTime == min(12, version.duration))
        #expect(!store.isPlaying)
    }
}
