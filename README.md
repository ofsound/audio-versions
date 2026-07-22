# Version Compare

Version Compare is a private review workspace for song files. The same TanStack app runs on the web and in Electron, with Supabase authentication and realtime metadata sync, private media in Vercel Blob, and IndexedDB as the desktop/browser cache.

## What It Does

- Create song records with artist, project, and journal notes
- Import multiple audio files per song and cache generated waveform data locally
- Review waveforms, create point/range annotations, and deep-link back to exact moments
- Keep file-level notes alongside a persistent song journal
- Search across songs, journals, file notes, and annotations

## Development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:3000`.

Without cloud environment variables, development stays in local-only mode. Copy `.env.example` to `.env.local` after creating the cloud resources described below.

## Cloud Setup

1. Create a Supabase project through the Vercel Marketplace integration.
2. Run `supabase/migrations/20260715000000_version_compare_cloud.sql` in the Supabase SQL editor, or apply it with the Supabase CLI after linking the project.
3. Enable Email/Password and Google in Supabase Auth. Add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `version-compare://auth/callback`
   - `https://your-production-domain/auth/callback`
   - the equivalent `/auth/callback` URL for Vercel preview deployments you use for auth testing
4. Create a **private** Vercel Blob store and connect it to the Vercel project.
5. Set the variables from `.env.example` in local development and in Vercel. The `VITE_` values are intentionally publishable browser credentials; never expose a Supabase service-role key.

Import the GitHub repository into Vercel to deploy every push. Vercel uses `main` for production and creates preview deployments for other branches and pull requests. The existing Nitro build automatically emits the Vercel output when it runs in Vercel's build environment.

On the first cloud sign-in from an existing desktop installation, Version Compare merges the legacy IndexedDB library into that account and marks the local cache as owned by it. Switching accounts replaces the cache from the newly authenticated account instead of leaking the prior account's records.

## Electron Wrapper

For a desktop dev session that boots Electron against the local Vite server:

```bash
npm run electron:dev
```

For a standalone local desktop launch against the production Nitro build:

```bash
npm run electron:start
```

For a packaged macOS app bundle in `dist/electron/mac`:

```bash
npm run electron:pack
```

For a zipped macOS build artifact in `dist/electron`:

```bash
npm run electron:dist
```

The packaged app runs the local Nitro server on `http://127.0.0.1:31415` so the desktop build keeps a stable origin for IndexedDB. Google sign-in opens the system browser and returns through the registered `version-compare://auth/callback` protocol; email/password remains entirely inside the app.

## Quality Checks

```bash
npm run verify
```

## Architecture

- Routing: TanStack Router file-based routes in `src/routes`
- State: `VersionCompareProvider` owns the optimistic snapshot and serializes persistence writes
- Authentication and records: Supabase Auth, Postgres row-level security, and Realtime
- Media: private Vercel Blob uploads with authenticated, expiring playback URLs
- Local cache: IndexedDB via `idb` in `src/lib/version-compare/db.ts`
- Rich text: Tiptap-based editors for journals, file notes, and annotation notes
- Waveforms: browser-side decoding and peak generation in `src/lib/version-compare/waveform.ts`
- Server/runtime plugin: TanStack Start wired through `nitro/vite`; this repo pins the currently compatible Nitro beta line because the official TanStack Start hosting docs note that the `nitro/vite` integration is still under active development

## Keyboard Shortcuts

- `Space`: play/pause the selected file
- `Left` / `,`: seek backward 5 seconds (hold `Shift` to seek 1 second)
- `Right` / `.`: seek forward 5 seconds (hold `Shift` to seek 1 second)
- `Shift + Up`: jump to previous annotation
- `Shift + Down`: jump to next annotation
- `Shift + J`: focus the song journal
- `/` or `Cmd/Ctrl + K`: focus global search

## Data Model

Version Compare persists and syncs the following records:

- songs
- audio files
- annotation records
- Vercel Blob media metadata; locally imported raw audio remains cached in IndexedDB
- per-song workspace settings and recents

Every cloud row is scoped by `user_id` and protected by Supabase row-level security. Deletions use tombstones so another connected device receives them as realtime updates. The schema reserves a disabled, hashed song share token for a future secret-link sharing feature; there is currently no public read policy.
