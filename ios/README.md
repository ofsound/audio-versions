# Audio Versions for iOS

The iOS app has two runtime modes:

- **Fixture mode** requires no configuration and is the fastest physical-device
  smoke test.
- **Cloud mode** uses the existing Supabase library and the production signed
  media endpoint. It activates when valid Supabase values are present in the
  generated app configuration.

## Run the fixture build on an iPhone

1. On the iPhone, enable **Settings → Privacy & Security → Developer Mode**,
   restart when prompted, and confirm Developer Mode after restart.
2. Open `AudioVersions.xcodeproj` in Xcode.
3. Select the **AudioVersions** target, then **Signing & Capabilities**.
4. Keep **Automatically manage signing** enabled and choose your Personal Team.
5. Select the connected iPhone as the run destination and press **Run**.

The committed development bundle ID is `com.benmontgomery.audioversions`. Change
it in `Config/Shared.xcconfig` if Xcode reports that it is unavailable.

Personal Team profiles expire after seven days. Rebuild from Xcode to provision
the app again. If Xcode cannot prepare a newer phone OS, update Xcode before
changing the project configuration.

## Connect the private library

1. Copy `Config/Secrets.xcconfig.example` to `Config/Secrets.xcconfig`.
2. Copy the publishable values corresponding to `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` from the local web environment into the iOS
   file.
3. Leave `AV_API_BASE_URL` pointed at the deployed Audio Versions web app.
4. Build and run again.
5. Sign in with the email/password identity that owns the existing Supabase
   library.

`Secrets.xcconfig` is gitignored. A Supabase service-role key and
`BLOB_READ_WRITE_TOKEN` must never be added to the iOS configuration.

If the existing library belongs to a Google-only Supabase identity, the current
email/password screen will not access it through a newly created account. Add
native Google OAuth/account linking as the next auth slice instead of creating
a second production identity.

## What the private build supports

- Restored email/password Supabase sessions
- Active songs, files, waveforms, and annotations under existing RLS policies
- Private playback through the bearer-authenticated signed-media endpoint
- Complete, temporary track preloading before native `AVPlayer` controls become
  available
- Playback audio session that remains audible through Silent mode and while the
  phone is locked or the app is backgrounded
- Lock Screen, Control Center, headset, Bluetooth, and AirPlay controls for
  play/pause, restart-to-start, ±10-second skips, seeking, and playback rate
- Now Playing song/version metadata and an in-app AirPlay route picker
- Safe interruption behavior for calls and Siri, including conditional resume
- Automatic pause when headphones or Bluetooth audio disconnect
- One bounded signed-link recovery that reloads the track and preserves the
  playhead
- Coalesced playback preparation, HTTPS/expiry validation, and in-memory link
  invalidation on sign-out
- Coalesced waveform scrubbing, skipping, and rate changes
- Point and range annotation insertion
- Conflict-aware annotation editing and tombstone deletion
- Plain-text song journal stored directly as shared text, plus plain-text editing
  for per-file notes stored in the shared rich-text field
- Pull-to-refresh and explicit refresh
- Light, Dark, or System appearance, chosen under **Account → Appearance** and
  remembered between launches. Light keeps the warm orange accent; Dark uses a
  mint accent on a near-black canvas with layered surfaces, hairline edges, and a
  mint waveform gradient.
- Fixture fallback whenever cloud values are absent

Persistent offline downloads, offline mutation queues, Google OAuth, full
rich-text editing, and TestFlight are deliberately deferred. The download
button is hidden until it can represent an encrypted-at-rest file that remains
available offline rather than the temporary playback preload.

## Physical-device audio acceptance

Run these checks after installing a new build from Xcode:

1. Start a version with the Ring/Silent switch set to silent. Audio should still
   use the selected output.
2. Lock the phone and confirm playback continues. Verify title, artist, version,
   duration, play/pause, ±10 seconds, seeking, and rate in Now Playing.
3. Background and foreground the app. The waveform, playhead, and button state
   should remain synchronized.
4. Disconnect wired headphones or Bluetooth audio during playback. Playback
   must pause rather than leak through the speaker.
5. Trigger Siri or a phone-call interruption. Playback must pause and may resume
   only when iOS permits it and it was not manually paused during interruption.
6. Select an AirPlay destination with the route button and confirm metadata,
   seeking, and remote controls remain synchronized.
7. Open a version on a slow connection. The transport must remain disabled with
   one **Loading audio…** state until the entire track is ready. After it is
   ready, disable networking and confirm playback and seeking still work without
   a buffering state.
8. Leave one version playing with the phone locked for at least 30 minutes, then
   seek and switch playback speed. No gap, duplicate audio, or playhead reset is
   acceptable.
9. Sign out while audio is playing. Playback and Now Playing must stop and the
   private signed-link cache must be cleared.

## Verification

Unsigned device build:

```sh
xcodebuild -project ios/AudioVersions.xcodeproj \
  -scheme AudioVersions \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/audio-versions-ios-derived \
  CODE_SIGNING_ALLOWED=NO build
```

List the available simulators, then run tests using any installed iOS 17 or
later destination:

```sh
xcrun simctl list devices available
```

```sh
xcodebuild test -quiet \
  -project ios/AudioVersions.xcodeproj \
  -scheme AudioVersions \
  -destination 'platform=iOS Simulator,name=<available simulator name>' \
  -derivedDataPath /tmp/audio-versions-ios-derived \
  CODE_SIGNING_ALLOWED=NO
```
