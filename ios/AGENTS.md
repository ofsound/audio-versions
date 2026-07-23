# Audio Versions iOS Instructions

These instructions apply to files under `ios/` in addition to the repository-level `AGENTS.md`.

## Platform and Boundaries

- Target iOS 17 or later using SwiftUI and Apple media frameworks.
- Use the official Supabase Swift package for authentication and cloud metadata.
- Keep fixture mode functional when cloud configuration is absent.
- Preserve compatibility with the shared Supabase rows, plain-text song journals, rich-text JSON for file notes and annotations, waveform JSON, annotation semantics, and signed-media API.
- Never embed a Supabase service-role key or Vercel Blob write token. Only publishable Supabase credentials and the public API base URL belong in generated app configuration.
- Do not add upload, destructive library-management, offline-download, sharing, or authentication features unless the request includes them.

## Implementation

- Follow the existing feature grouping under `ios/AudioVersions/Features/` and keep shared domain and infrastructure code in their existing directories.
- Keep playback state coordinated through the existing native audio engine and store rather than introducing a second source of truth.
- Preserve sign-out cleanup, bounded signed-link recovery, interruption handling, route-change behavior, and Now Playing synchronization when changing playback.
- Store song journals directly as shared plain text. Encode edited file notes and annotations using the existing shared rich-text compatibility layer; do not invent a native-only storage format.

## Validation

- Documentation-only changes: review Markdown, paths, and commands; no Xcode build is required.
- Swift source, configuration, dependency, or Xcode project changes: run the unsigned generic-device build documented in `ios/README.md`.
- Logic or behavior changes: also run the `AudioVersions` scheme tests on an available iOS simulator as documented in `ios/README.md`.
- Playback, interruptions, background audio, routing, or device-integration changes: identify the relevant physical-device acceptance checks in `ios/README.md` and report which were performed. Do not claim device verification when only simulator or unsigned builds ran.
- iOS-only changes do not require `npm run electron:pack`.
