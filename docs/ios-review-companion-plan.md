# iOS Review Companion Plan (Historical)

Last updated: 2026-07-21

> This is an implementation snapshot, not current capability or validation
> documentation. Several deferred items were completed after this plan stopped
> being maintained. Use [`ios/README.md`](../ios/README.md) for the current iOS
> runbook and acceptance checks.

## Outcome

Deliver two successive builds without replacing the existing React, web, or
Electron clients:

1. **Today's device build:** a fixture-backed SwiftUI shell that installs from
   Xcode on a personal iPhone.
2. **Private daily-use build:** authenticated access to the real Audio Versions
   library, signed-media playback, and point/range annotation editing.

The shared boundary remains the Supabase schema, media API, rich-text JSON,
waveform JSON, and annotation semantics. The iOS UI and playback stack are
native SwiftUI and AVFoundation implementations.

## Guardrails

- Target iOS 17 and later.
- Use SwiftUI and Apple frameworks for UI, playback, and local storage.
- Use the official Supabase Swift package for authentication and metadata.
- Never embed a Supabase service-role key or Vercel Blob write token.
- Keep fixture mode functional when cloud configuration is absent.
- Treat desktop as the authoring/library-management client for this release.
- Do not add audio upload, song deletion, full rich-text editing, sharing, push
  notifications, or a native macOS target.

## Implementation checklist

### 1. Device shell

- [x] Add a tracked Xcode project under `ios/`.
- [x] Configure automatic signing and an overridable development bundle ID.
- [x] Add fixture domain models compatible with the cloud record shapes.
- [x] Build library, song detail, waveform, playback-control, and annotation
      surfaces.
- [x] Compile for a generic iOS device without code signing.
- [ ] Install on the owner's iPhone from Xcode using the Personal Team.

### 2. Real library

- [x] Add `supabase-swift` through Swift Package Manager.
- [x] Load publishable configuration from ignored `Secrets.xcconfig` values.
- [x] Add email/password sign-in and session restoration.
- [x] Load non-deleted songs, audio files, and annotations under existing RLS.
- [x] Preserve fixture mode for previews and unconfigured local builds.

### 3. Playback

- [x] Call the existing bearer-authenticated signed-URL endpoint.
- [x] Play remote media with `AVPlayer`.
- [x] Keep playhead, waveform selection, and playback controls synchronized.
- [x] Handle signed-URL refresh.
- [ ] Handle foreground audio interruptions.
- [ ] Defer downloads, background playback, and lock-screen controls until the
      core daily-use loop is stable.

### 4. Annotation writes

- [x] Create point annotations using client-generated UUIDs.
- [x] Create range annotations with validated start/end ordering.
- [x] Update annotation title, body, color, and timing.
- [x] Tombstone deletes to match the web client.
- [x] Encode the native plain-text editor as compatible TipTap paragraph JSON.
- [ ] Confirm phone-created annotations appear in the existing desktop app.

### 5. Verification

- [x] Unit-test rich-text conversion and fixture/domain behavior.
- [x] Unit-test playhead clamping and annotation store behavior.
- [x] Build the Debug iOS app with signing disabled.
- [x] Run the existing repository `npm run verify` gate.
- [x] Rebuild the packaged Electron macOS app with `npm run electron:pack`.

## Deliberate v1 deferrals

The initial daily-use checkpoint is online-first. Offline audio downloads,
queued offline annotation writes, background/lock-screen playback, Google OAuth,
full rich-text editing, and TestFlight are the next release slice. This is a
scope sequencing decision, not a removal from the broader review-companion
roadmap.

## Acceptance criteria

### Today's device build

- The app launches on a physical iPhone from Xcode.
- A fixture library opens a fixture song and version.
- The waveform responds to seeking.
- Point and range annotations can be created and edited in memory.
- No cloud secrets are required.

### Private daily-use build

- Email/password authentication restores a valid session.
- The phone shows the same active songs, files, waveforms, and annotations as
  the web/Electron client.
- A private audio file plays through an authenticated signed URL.
- Point and range annotations created or edited on iPhone round-trip to the
  existing database representation.
- Signing out clears the local session and returns to fixture/sign-in state.

## Progress log

- 2026-07-21: Plan created. Xcode 26.3 detected. Worktree was clean at start.
  Simulator services were unavailable to the sandbox, so generic-device builds
  are the automated validation target; physical-device launch remains the
  manual Xcode handoff.
- 2026-07-21: Added the shared Xcode project and SwiftPM lockfile; resolved
  `supabase-swift` 2.53.0; completed fixture, auth, cloud snapshot, signed-media,
  native playback, and conflict-aware annotation paths. The unsigned arm64 iOS
  build succeeds and six Swift tests pass on an iPhone SE (3rd generation),
  iOS 17.5 simulator. The fixture library was also installed, launched, and
  visually checked in that simulator.
- 2026-07-21: Physical iPhone SE (3rd generation), iOS 26.5, is paired and
  visible. Developer Mode is disabled, so the remaining physical install step
  requires the owner to enable it on-device and choose the Personal Team in
  Xcode. Xcode 26.3 currently bundles the iOS 26.2 SDK; update Xcode only if it
  cannot prepare the newer phone OS.
- 2026-07-21: Final verification passed: unsigned iOS device build, six Swift
  tests, the full npm verification gate (138 web tests plus Biome, TypeScript,
  and Knip), and `npm run electron:pack`. The current packaged desktop app is at
  `dist/electron/mac-arm64/Audio Versions.app`.
