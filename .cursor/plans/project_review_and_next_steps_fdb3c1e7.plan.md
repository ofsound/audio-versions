---
name: Project review and next steps
overview: Full audit of Audio Versions covering agent scaffolding (AGENTS.md, cursor rules, tooling), code quality (architecture, dead code, complexity), and design-system hygiene, with a prioritized list of next tickets balanced across categories.
todos:
  - id: agent_unify_npm
    content: "Unify toolchain on npm: update AGENTS.md + 3 rule files, drop @/* alias in tsconfig.json"
    status: completed
  - id: kill_dead_code
    content: "Remove dead code: getAudioVersionsHeaderState, useWaveformCanvas theme param, two space-y-* violations, duplicate canvas tokens in styles.css"
    status: completed
  - id: add_state_rule
    content: Add .cursor/rules/audio-versions-state.mdc documenting snapshot + commitSnapshot + persistQueue + header-slot portals + routeTree.gen guardrail
    status: completed
  - id: split_provider
    content: "Refactor audio-versions-provider.tsx: extract CRUD hooks around shared commitSnapshot helper, aim for ~300 LOC core"
    status: completed
  - id: db_upgrade_callback
    content: Move masteringNote legacy merge into idb upgrade at DB_VERSION=2; drop LegacyAudioFileRecord path from hydration
    status: completed
  - id: url_source_of_truth
    content: Make SongRouteSearch the source of truth for transient selection; trim song-workspace.tsx by removing URL↔workspace reconciliation effect
    status: completed
isProject: false
---

## Overall verdict

The project is in good shape for a solo-dev MVP: `npm run verify` (Biome + tsc + Vitest + Knip) passes clean, 70 tests green, Knip reports nothing, types are strict, and the semantic-token design system in [src/styles.css](src/styles.css) is ambitious and coherent. The biggest risks are concentrated in three places: (1) a contradiction between the cursor rules and the actual toolchain, (2) a god-provider in [src/providers/audio-versions-provider.tsx](src/providers/audio-versions-provider.tsx), and (3) a bloated `SongWorkspace` / `WaveformCard` pair doing too many jobs.

---

## 1. Agent scaffolding

### Strengths
- Small, focused rule set in [.cursor/rules/](.cursor/rules) (`project-context`, `react-tanstack-patterns`, `tailwind`, `post-edit-verification`) — not over-written.
- [AGENTS.md](AGENTS.md) is opinionated and concise (boot sequence → constraints → stack specifics).
- `verify` script bundles Biome + typecheck + Vitest + Knip — excellent single gate.

### Problems

- **pnpm vs npm mismatch (highest priority).** Rules and [AGENTS.md](AGENTS.md) uniformly say `pnpm verify` / `pnpm check`, but:
  - `package.json` scripts chain with `npm run …` ([package.json](package.json) line 18)
  - There is a `package-lock.json`, no `pnpm-lock.yaml`
  - `.cta.json` declares `"packageManager": "npm"`
  - [README.md](README.md) says `npm install` / `npm run dev`
  Pick one. `npm` is the path of least resistance (lockfile + README + scaffold config already agree).

- **Relative imports in routes violate the import-alias rule.** [src/routes/__root.tsx](src/routes/__root.tsx) and [src/routes/songs.$songId.tsx](src/routes/songs.$songId.tsx) use `../components/...` / `../providers/...` instead of `#/…`, contradicting `.cursor/rules/project-context.mdc`. Either fix them or relax the rule.

- **Duplicate `@/*` path alias.** [tsconfig.json](tsconfig.json) defines both `#/*` and `@/*` → dead alias, just waiting to be used inconsistently. Remove `@/*`.

- **Rules have blind spots.** Agents will rediscover these the hard way:
  - No rule for the header-slot `createPortal` pattern in [src/components/audio-versions/app-chrome.tsx](src/components/audio-versions/app-chrome.tsx) (contexts `SongRouteHeaderSlotContext`, `LibraryHeaderActionSlotContext`).
  - No rule for the snapshot / `persistQueueRef` mutation pattern in [src/providers/audio-versions-provider.tsx](src/providers/audio-versions-provider.tsx).
  - No rule for IndexedDB schema versioning in [src/lib/audio-versions/db.ts](src/lib/audio-versions/db.ts) (`DB_VERSION = 1`, plus ad-hoc legacy migration in [src/providers/audio-versions-provider-hydration.ts](src/providers/audio-versions-provider-hydration.ts)).

- **`post-edit-verification.mdc` ≈ AGENTS.md §1.** Same list of checks restated. Consolidate to avoid drift.

- **Biome `vcs.enabled: false`.** Enabling it with `useIgnoreFile: true` lets Biome skip gitignored files automatically.

---

## 2. App-code review

### Strengths
- Clear domain types in [src/lib/audio-versions/types.ts](src/lib/audio-versions/types.ts); single source of truth for `Song`, `AudioFileRecord`, `Annotation`, `WorkspaceState`.
- Playback isolated into [src/providers/use-audio-versions-playback.ts](src/providers/use-audio-versions-playback.ts) and audio graph into [src/components/audio-versions/use-waveform-audio-graph.ts](src/components/audio-versions/use-waveform-audio-graph.ts) — good carve-outs.
- Strong test coverage (70 tests, component + lib).

### Problems

- **God-provider: [src/providers/audio-versions-provider.tsx](src/providers/audio-versions-provider.tsx) is 910 lines.** Every mutator, the search function, and playback orchestration share one context, so any mutation triggers a re-render across everything that reads the context.
  - Inconsistent stability: `getSongById` / `getAudioFileById` depend on `snapshot.songs` / `audioFiles`, while `getSongAudioFiles`, `getAnnotationsForFile`, `getWorkspaceState` read from `snapshotRef.current` with empty deps. Pick one convention.
  - `commitSnapshot`'s chained `persistQueueRef` is subtle and undocumented — worth a short JSDoc.
  - The CRUD mutators (`createSong`, `updateSong`, `addAudioFile`, …) all follow the same "update snapshot → find entity → persist" shape; an `upsert`/`patchEntity` helper could cut ~200 lines.

- **Megacomponent: [src/components/audio-versions/song-workspace.tsx](src/components/audio-versions/song-workspace.tsx) is 722 lines.** Mixes route-search↔workspace sync, annotation-crossing detection, upload dialog state, drag-and-drop reorder logic, and three-column layout. The explanatory comment above the "Sync route search → workspace" effect is a tell that URL and persisted state are fighting each other.
  - Suggested split: treat URL search params as source of truth for transient selection (`fileId`, `annotationId`, `timeMs`, `autoplay`); keep `WorkspaceState` for truly per-song-persistent data (`playheadMsByFileId`, `inspectorRatio`, `lastVisitedAt`). Right now both describe overlapping concepts.

- **Megacomponent: [src/components/audio-versions/waveform-card.tsx](src/components/audio-versions/waveform-card.tsx) is 870 lines.** The drop handler rebuilds full ordering; a `reorderAudioFiles(songId, fromId, toId)` signature would let the card stay dumb. The marker-drag pointer-capture logic parallels [marker-time-field.tsx](src/components/audio-versions/marker-time-field.tsx) — a shared `useScrubDrag` hook would remove duplication.

- **Dead / near-dead code:**
  - `getAudioVersionsHeaderState` in [src/components/audio-versions/app-chrome.tsx](src/components/audio-versions/app-chrome.tsx) returns `{ showLibraryLink: true }` in every branch where `songId` is truthy. Collapses to `{ showLibraryLink: Boolean(songId) }`. Classic vibe-coded helper.
  - `theme` parameter in `useWaveformCanvas` is explicitly discarded (`void theme;`) because colors come from computed CSS variables. Remove the parameter.
  - Legacy `masteringNote` merging in [audio-versions-provider-hydration.ts](src/providers/audio-versions-provider-hydration.ts) runs on every load forever. Belongs in an `idb.openDB` `upgrade` callback behind `DB_VERSION = 2`.

- **Tailwind rule violations already in tree.** Rule in [.cursor/rules/tailwind.mdc](.cursor/rules/tailwind.mdc) forbids `space-y-*`/`space-x-*`, yet:
  - [src/components/audio-versions/song-workspace.tsx:539](src/components/audio-versions/song-workspace.tsx) uses `space-y-4`
  - [src/components/audio-versions/global-search.tsx:91](src/components/audio-versions/global-search.tsx) uses `space-y-2`

- **Persistence granularity.** Deletes fan out N independent IndexedDB transactions via `Promise.all` (see `deleteSong` / `deleteAudioFile` in the provider). One multi-store write transaction per commit would be faster and atomic.

- **Router quirks.** [src/router.tsx](src/router.tsx) sets `defaultPreloadStaleTime: 0` — refetches every preload; fine but unnecessary for a local-first app, safer to omit.

---

## 3. Design-system & CSS

### Strengths
- [src/styles.css](src/styles.css) uses `light-dark()` + `color-mix()` in `@theme` — modern, token-driven.
- Semantic names (`--color-surface`, `--color-waveform-base`, `--color-annotation-*`) keep components from inventing ad-hoc colors.

### Problems
- **File is 1041 lines and ignored by Biome** (`biome.json` excludes `src/styles.css`). Agents will be reluctant to touch it. Consider splitting into `styles/theme.css` (tokens) + `styles/components.css` (component classes) to reduce fear of editing.
- **Duplicate canvas tokens.** `:root`, `.light`, and `.dark` each redefine `--canvas-waveform-*`; `:root` matches `.light` exactly. The `.light` block is redundant.

---

## 4. Dependency / tooling notes

- `nitro` pinned to `nitro-nightly@3.0.1-20260415-...` — fragile for future installs.
- `@tanstack/react-router` (1.168.22) and `@tanstack/react-start` (1.167.41) minor-drifted — worth syncing.
- `@tanstack/react-devtools` + `react-router-devtools` ship in `dependencies` rather than `devDependencies`. They are tree-shaken from production in TanStack Start, but semantically they belong under `devDependencies`.

---

## Recommended next work, balanced across categories

High leverage, small surface:

1. **Unify on npm and delete the pnpm references.** Update [AGENTS.md](AGENTS.md) §1 and the three rule files (`pnpm verify` → `npm run verify`, etc.). Delete the `@/*` alias from [tsconfig.json](tsconfig.json) while you're in there. (~15 min)

2. **Kill clear dead code.** Collapse `getAudioVersionsHeaderState`, drop the unused `theme` param of `useWaveformCanvas`, fix the two `space-y-*` violations, de-dup the `:root` / `.light` canvas tokens in [src/styles.css](src/styles.css). (~30 min)

3. **Add a rule for the state/persistence pattern.** One new rule (`audio-versions-state.mdc`) that documents: snapshot + `commitSnapshot` + `persistQueueRef`, the `createPortal` header-slot contexts, and the "don't hand-edit `routeTree.gen.ts`" reminder pulled up out of AGENTS.md prose. (~20 min)

Medium leverage, medium surface:

4. **Split the provider.** Extract CRUD (songs / audio files / annotations / workspace-state) into colocated hooks that share the `commitSnapshot` helper. Target: reduce [audio-versions-provider.tsx](src/providers/audio-versions-provider.tsx) to ~300 lines of composition + context wiring. Strong unit tests already exist for behavior.

5. **Move the legacy `masteringNote` merge into an `idb` `upgrade` callback.** Bump `DB_VERSION` to 2 in [src/lib/audio-versions/db.ts](src/lib/audio-versions/db.ts), delete the `LegacyAudioFileRecord` / `mergeAudioFileNotes` path from [audio-versions-provider-hydration.ts](src/providers/audio-versions-provider-hydration.ts). Cheaper hydration going forward.

Bigger bet, higher reward:

6. **Make URL search params the source of truth for transient selection.** Remove the "route-search ↔ workspace" reconciliation effect in [song-workspace.tsx](src/components/audio-versions/song-workspace.tsx); keep `WorkspaceState` only for persistent per-song data (`playheadMsByFileId`, `inspectorRatio`, `lastVisitedAt`). This should cut the file to ~400 lines and eliminate the subtle race the current comment has to explain.

I can execute any of (1)–(6) on your say-so; (1), (2), and (5) are small enough to batch into one PR. (4) and (6) are each their own session.