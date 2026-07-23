# Audio Versions Repository Instructions

## Repository Map

- `src/`: React 19, TanStack Router/Start, TypeScript, Tailwind CSS, and the Nitro server routes.
- `electron/`: Electron wrapper for the web application.
- `ios/`: Native SwiftUI companion app. Follow `ios/AGENTS.md` for changes in this directory.
- `supabase/`: Shared Postgres schema and migrations.

Use **npm** for the JavaScript workspace. This repository does not use Svelte.

## Working Rules

- Make the smallest change that fully satisfies the request. Do not refactor adjacent code without a concrete need.
- Match existing patterns and remove imports, variables, or helpers made unused by your change.
- When materially different interpretations would produce different results, state the ambiguity and ask before implementing.
- Prefer a focused implementation over speculative abstractions.
- Do not add eyebrow, kicker, overline, or tiny uppercase labels unless explicitly requested.
- Treat `src/routeTree.gen.ts` as generated. Add routes under `src/routes/` and let TanStack tooling update the route tree.
- Never commit credentials. Browser Supabase keys are publishable; service-role keys and Vercel Blob write tokens are secrets.

## Web and Electron Conventions

- Prefer `#/*` imports for application code.
- `AudioVersionsProvider` owns the optimistic snapshot and serialized persistence queue. Route snapshot mutations through `commitSnapshot` or existing mutation helpers.
- Persistence is hybrid: Supabase stores authenticated cloud records, Vercel Blob stores private media, and IndexedDB provides the local cache and local-only mode.
- IndexedDB schema changes belong in `src/lib/audio-versions/db.ts` migrations with a version bump. Supabase schema changes belong in `supabase/migrations/`.
- Use Tailwind utilities and the semantic tokens in `src/styles/tokens.css`. Use flex/grid `gap-*` utilities instead of `space-x-*` or `space-y-*`.
- Reuse the application chrome and header portal contexts instead of duplicating route-level header UI.
- Extend TipTap behavior in line with `src/components/audio-versions/rich-text-editor.tsx` and the shared rich-text record shapes.

## Validation Matrix

Run the gate that matches the files changed:

- Documentation or instructions only: review the rendered Markdown, paths, and commands. No application build is required.
- Web, server, shared TypeScript, CSS, dependency, or Electron changes: run `npm run verify`.
- Web UI or Electron runtime changes: after `npm run verify`, run `npm run electron:pack` once the change is final so `dist/electron/mac-arm64/Audio Versions.app` is current.
- iOS-only changes: follow `ios/AGENTS.md`; do not package Electron unless shared web/Electron code also changed.
- Shared Supabase schema, media API, or cross-client data-contract changes: run `npm run verify` and the relevant iOS build/tests from `ios/AGENTS.md`.

Always report which validation commands ran and any checks that could not be completed.
