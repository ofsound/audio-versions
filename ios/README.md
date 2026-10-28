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
- Automatic persistent audio downloads for the active library, newest first,
  with at most two simultaneous downloads; local playback before networking
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
- Cloud-synced playlists with creation, renaming, deletion, manual ordering,
  cross-song file search, per-file add/remove menus, and ordered file editing
- Native playlist playback with play/pause, previous/next, off/all/one looping,
  background audio, and Lock Screen next/previous controls
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

## Offline listening and annotation sync

Audio downloads automatically while the app is running, starting with the newest
versions and fetching at most two files at once. Completed files are retained
between launches and used immediately for playback. The app resumes missing
files after reconnecting, on foreground, and on periodic retries; an in-progress
download is shared with playback rather than fetched twice. Ordinary playback
also retains its downloaded audio. Audio IDs identify immutable media, so note
and metadata changes do not invalidate a completed audio download.

A checkmark appears after the complete file and metadata are saved. Use the
download control to request a file immediately, cancel a transfer, or remove a
local copy without deleting cloud audio. Explicit cancellation or removal keeps
that file out of automatic downloads for the rest of the app session; a manual
download enables it again. In **Account**, enable **Downloaded songs only** to
find saved versions. Keep the app running for downloads to finish: iOS can suspend
transfers when the app is backgrounded, and background transfer scheduling is not
implemented. Storage availability limits how much of the library can be retained.

The library, playlists, waveforms, notes, and downloaded audio survive relaunch.
The app restores the last saved library for the signed-in account before trying
the cloud. Playback checks local media before requesting any signed URL, so
expired media links do not prevent downloaded tracks from playing. Refresh the
library online to pick up changes made on other devices.

Audio and metadata live in account-specific Application Support directories,
excluded from backups. iOS Data Protection encrypts them on disk using
`completeUntilFirstUserAuthentication`, allowing background and Lock Screen
playback after the first device unlock following a restart. This uses native
iOS encryption, not an application-managed encryption key. Signed media links
and authentication tokens are never stored in this library cache.

Marker and range creates, edits, and deletions are durably queued before they
appear as saved. They survive relaunch and sync serially on reconnect, app
foreground, or **Sync now**, with periodic retries while the app is running.
Retries recognize already-applied writes and retain optimistic-concurrency
checks. Refresh overlays pending edits rather than replacing them. Queues do not
run while iOS suspends the app; they resume when it runs again. Song journals,
file notes, playlist edits, and trash actions still require an online connection.

Tap the status strip above the library to inspect pending changes or retry sync.
Changes that conflict with another device remain on this iPhone and block later
writes to that annotation while unrelated annotations can sync. The details
screen lets you select/copy the local text before choosing **Use cloud version**,
which explicitly discards that annotation's queued edits only after a successful
cloud refresh. Signing out stops playback and removes local downloads, the cached
library, and queued changes; unsynced changes require confirmation before sign-out.

Google OAuth, full rich-text editing, and TestFlight remain deferred.

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
10. Play a multi-file playlist through a track boundary. Verify automatic next,
    previous/next from Lock Screen and a headset, repeat-all wrapping, repeat-one,
    interruption behavior, and that Now Playing metadata changes to the new file.

11. While a version plays, navigate back through song notes and the library, then
    switch to Playlists and Trash. The mini player should stay above the tab bar,
    keep showing the active song/version, and pause/resume that same track. Tap
    its title to return to the full file player without rewinding or interrupting
    playback. The full player page should have no duplicate mini player. Repeat
    with a playlist and verify the queue still advances in order.

## Physical-device offline acceptance

These checks require a signed build on an iPhone; simulator tests cannot verify
hardware encryption, Bluetooth routing, or locked-device audio behavior.

1. Open the library online and confirm audio downloads without pressing play,
   with at most two transfers at once. Let two versions and a playlist's tracks
   finish. Cancel another download and confirm it is not marked downloaded. Remove a local copy and confirm the cloud
   file remains available.
2. Enable Airplane Mode, force-quit, and relaunch. Open a downloaded song, play,
   seek, change speed, lock the phone, and cross a downloaded playlist boundary.
   Confirm undownloaded versions fail without losing downloaded audio.
3. Restart the phone, unlock it once, then repeat locked-screen playback. Verify
   earbuds, Bluetooth disconnect, Siri interruption, and Lock Screen next/previous.
4. Offline, create/edit/delete point and range annotations, including editing a
   newly created marker. Force-quit and relaunch; confirm every local edit remains.
5. Restore connectivity. Confirm the queue drains and desktop shows each edit
   once. Interrupt connectivity during sync and retry to check duplicate prevention.
6. Edit the same marker on desktop before reconnecting the phone. Confirm the
   phone retains the local text, shows a conflict, and syncs unrelated markers.
   Copy the local text and use the cloud version; confirm only those local edits
   are discarded.
7. Sign out with a pending edit and verify the explicit warning. After sign-out,
   confirm playback stops and another account cannot see the previous account's
   downloads or queued edits.

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

### Named Song Notes tabs

Song detail shows all named note documents from `songs.note_tabs`. Tap a tab to
switch, tap + to create an Untitled tab immediately, and long-press for rename, close, and delete.
Closed tabs can be reopened from the adjacent menu.
Closing a tab keeps its text; deletion asks for confirmation and cannot remove the
last document. Edit targets the selected tab. The bottom Add action, both on the song screen and
in the player, opens a sheet with an “Append to” tab picker. It defaults to the
last tab selected for that song during the current app session. Changing the
destination keeps the draft; saving appends to the end of that tab.

Tab content and management changes are persisted before networking, replayed in
order, and merged over refreshed cloud snapshots. Replays compare the edited
fields with their original values, preserve edits to other tabs and fields, and
use the song's exact `updated_at` token for the final conditional write. Conflicts
remain local and can be reviewed/copied in Offline & Sync. Using the cloud version
fetches successfully before discarding any queued local changes for that tab.
The first tab mirrors `general_notes` so older clients remain compatible. Deploy
the shared `20261024010000_song_note_tabs.sql` migration before using cloud tabs.
