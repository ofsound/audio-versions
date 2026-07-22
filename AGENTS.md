# Agent Execution Protocol: Audio Versions

## 1. Boot Sequence

- **Scan:** Read all `.cursor/rules/*.mdc` before first output.
- **Stack:** This repo is **React 19 + TanStack Router / TanStack Start** (no Svelte). Ignore Svelte-specific MCP tools and skills unless the codebase gains `.svelte` files.
- **Validation:** After substantive edits, run the full gate: `**npm run verify`** — Biome `**check**`, `**typecheck**` (`tsc --noEmit`), Vitest `**test**`, then **Knip**. Equivalent: `npm run check && npm run typecheck && npm test && npm run knip`. Do not block on tools that do not apply here (e.g. `svelte-autofixer`). **Knip** enforces lean `package.json` dependencies and reachable exports/files—fix unused dependency/export findings or justify with Knip config/JSDoc `@public` per [Knip docs](https://knip.dev).

---

After each code or UI change, rebuild the packaged macOS app with `npm run electron:pack` so `dist/electron/mac-arm64/Audio Versions.app` stays current.

## 2. Reasoning & Constraints

### A. Think Before Coding

- **Surface Tradeoffs:** State assumptions explicitly. If 2+ interpretations exist, **ask**; do not guess.
- **Halt on Ambiguity:** If a request is unclear, name the confusion and stop.
- **Senior Dev Filter:** If a solution is 200 lines and could be 50, **rewrite it.** No speculative abstractions.

### B. Surgical Implementation

- **Strict Scope:** Change only what is requested.
- **No Side Effects:** Do not "improve" or refactor adjacent code, comments, or formatting.
- **Style Match:** Mirror existing patterns, even if suboptimal.
- **No Eyebrows:** Never add or create eyebrow/kicker text (`eyebrow`, overline labels, tiny uppercase section headers above titles) unless the user explicitly asks for one.
- **Orphan Policy:** Remove imports/variables/functions rendered unused by *your* changes. Leave pre-existing dead code alone.

### C. Goal-Driven Loop

1. **Reproduce:** Write/run a test or define a specific failure state.
2. **Execute:** Implement the minimum code to solve the problem.
3. **Verify:** Confirm success criteria (e.g. tests pass, UI behavior matches the request).

---

## 3. Tech Stack Specifics

- **Package manager:** Use **npm** (see `package.json`).
- **React 19 + TypeScript:** Functional components and hooks; follow patterns in `src/components/` and `src/providers/`.
- **TanStack Router / Start:** File-based routes under `src/routes/`. Use `createFileRoute`, `Link`, `useNavigate`, and patterns in `src/routes/__root.tsx` and `src/router.tsx`. Treat `src/routeTree.gen.ts` as generated—do not hand-edit unless the tooling workflow requires it.
- **Imports:** Prefer `**#/...`** for app code (`#/lib/...`, `#/components/...`).
- **Styling:** Tailwind utility classes plus semantic tokens in `src/styles.css`. Follow the Tailwind Cursor rule (theme colors, `gap-`* not `space-*`, etc.).
- **Persistence:** Local **IndexedDB** via `idb` in `src/lib/audio-versions/db.ts`—not Supabase unless explicitly added to the project.
- **Rich text:** **TipTap** (`@tiptap/`*); extend in line with `src/components/audio-versions/rich-text-editor.tsx`.

---

**Status:** Protocol Active. Awaiting task.
