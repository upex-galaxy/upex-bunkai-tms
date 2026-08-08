# BK-50 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

## Goal

Add a client-initiated "Export snapshot" download to the traceability chain screen. Clicking it re-fetches the story's evidence chain through the already-shipped, authenticated `GET /api/v1/projects/{id}/traceability?story={id}` route, renders the response into one self-contained HTML document (inline CSS, zero external references, zero network calls), and triggers a browser download named `trace-<story-slug>-YYYYMMDD-HHMM.html`. A confirmation toast fires on success. No migration, no new route, no new dependency, no storage, no anonymous access.

## Governing decisions

This plan implements Jira BK-50 comments ***12238**** (AI Tech Lead) and ****12239*** (AI Product Owner), dated 2026-08-08. Both supersede comments 11047 (Q1/Q3) and 11048 in full; 11047 Q2 (no snapshots table) is reaffirmed. Do not re-derive Option E — it is already decided (Option E scored 103 vs a runner-up of 67 on both panels).

## Technical Decisions

1. ***No new API route.*** The Export button calls the SAME `GET /api/v1/projects/{id}/traceability?story={id}` route the screen already uses for its initial load / retry, via a fresh client-side `fetch` at click time (not a re-use of the already-rendered React state) — this is what makes AC2.1 (point-in-time freeze) and E3 (chain-assembly failure surfaces cleanly) correct: a fresh fetch captures the true state at the moment of the click, and a fetch failure has a real error path to render into a toast instead of a corrupted download.
2. ***Rendering is pure and framework-agnostic.*** `lib/traceability/export-snapshot.ts` exports `renderTraceabilitySnapshotHtml`, `buildSnapshotFilename`, and `formatSnapshotTimestamp` — no React, no DOM, no Next — mirroring the existing split in `lib/traceability/chain-view.ts`. This keeps the new logic unit-testable with `bun:test` per this repo's convention (no `.test.tsx` component tests exist anywhere in the repo; testable logic always lives in a pure `lib/` module, components stay thin and are validated live). The renderer reuses `chain-view.ts`'s own state-resolution helpers (`resolveStoryChainViewState`, `isAcUncovered`, `resolveAtcRowState`, `storyRollupCounts`, the placeholder-copy helpers) so the exported document can never disagree with what the live screen renders for the same payload — one source of truth for chain-state logic, not two.
3. ***Empty-chain case renders prose, not an empty array (AC3.1).*** The `zero-ac` view state renders the story's existing `ZERO*AC*TITLE`/`ZERO*AC*BODY` copy plus an explicit "This story had no coverage as of `<timestamp>`" line, literal-matching AC3.1's Gherkin. The `zero-coverage` view state (ACs exist, 0 ATCs bound anywhere) keeps the existing on-screen banner + per-AC "Uncovered" strip copy, since it is a different, already-distinct on-screen state per BK-45 — the export mirrors the screen rather than collapsing the two.
4. ***The download is client-side, no new server code.*** `Blob` + `URL.createObjectURL` + a transient `<a download>` click, matching the Tech Lead ruling's "or an equivalent client-side Blob + object URL" clause. No `Content-Disposition` route is added — it would be a new server surface for zero benefit over the client path.
5. ***Filename and toast composition follow the mockup exactly, with one deliberate departure.*** Filename: `trace-<slugified-story-title>-YYYYMMDD-HHMM.html` (mockup pattern is `trace-<story>-YYYYMMDD-HHMM.json` — the `.html` swap is the one ratified departure, logged as `master-design-plan.md` §5 row D26 in this same change, per Critical Rule #15 and the PO ruling §4). Toast: `sonner`'s `toast.success('Snapshot exported', { description: ... })`, reusing the exact `toast.success(title, { description })` shape already used by `login-error-toast.tsx` — no new toast primitive.
6. ***Workspace/project identity for the document header.*** The PO ruling requires "the workspace / project / story identity" in the exported document. `app/(app)/projects/[projectSlug]/traceability/page.tsx` already resolves `activeWorkspaceId` and `project` server-side (mirroring `layout.tsx`'s own duplicate resolution, an existing pattern in this route, not introduced here); this plan widens the existing `project` select to include `name` and adds one more `.select('name')` read on `workspaces`, then threads `projectName`/`workspaceName` down as two new required string props on `TraceabilityChainView`. No new query shape, no new table read.
7. ***No RPC change, no widened exposure.*** `bunkai*report*story_traceability` and `mapTraceabilityRpcError`'s 404 non-disclosure contract are untouched. AC1.2 and E2 are satisfied by the ALREADY-SHIPPED behavior of the route this story reuses (foreign-workspace/non-member -> 404 via `mapTraceabilityRpcError`; unauthenticated API caller -> 401 via `withApiHandler`'s `auth: 'required'`; unauthenticated browser navigation to the traceability PAGE -> login redirect via `middleware.ts`'s existing `/projects` protected-prefix gate). This story adds no code to any of those three paths — it is proven by BK-45's existing test coverage (`lib/traceability/story-traceability-isolation.test.ts`), not re-tested here as new coverage, and the compliance matrix cites that file rather than duplicating the assertion.
8. ***RPC-authorization gate***: N/A. This story writes or modifies no Postgres function. `bunkai*report*story_traceability` (0068) is unchanged.
9. ***No ADR.*** No schema, auth model, or cross-cutting invariant is touched; the `.html` filename departure is fully reversible (fails ADR gate 1) and is recorded as a §5 divergence row instead, per the PO ruling's own instruction.

## Files touched

- `lib/traceability/export-snapshot.ts` (new) — pure render/format/filename functions.
- `lib/traceability/export-snapshot.test.ts` (new) — `bun:test` coverage for the pure functions (filename slugging, timestamp formatting, HTML escaping, zero-ac prose, zero-coverage banner, has-chain table rows, archived-story banner).
- `components/traceability/TraceabilityChainView.tsx` (edit) — add `projectName`/`workspaceName` props, the Export button inside `StoryHead`, the `handleExport` fetch->render->download->toast handler, an `exporting` state flag.
- `app/(app)/projects/[projectSlug]/traceability/page.tsx` (edit) — widen the `project` select to `id, name`; add a `workspaces.name` read; pass `projectName`/`workspaceName` to every `TraceabilityChainView` call site.
- `.context/design/master-design-plan.md` (edit) — add §5 divergence row D26 (filename `.html` vs mockup `.json`) and flip the BK-50 §8/§4.7 build-status note from "Estimation" to built, per this change landing.

## AC -> implementation mapping

| AC scenario | Implementation |
| --- | --- |
| 1.1 | `handleExport` fetch + `renderTraceabilitySnapshotHtml` + `triggerHtmlDownload` |
| 1.2 | Reused, unchanged: existing route's `mapTraceabilityRpcError` -> 404 |
| 2.1 | Fresh fetch at click time; downloaded file makes zero network calls after download (inert HTML) |
| 2.2 | Each click is an independent fetch/render/download cycle with its own timestamp |
| 3.1 | `renderNoCoverageSection` (zero-ac view state) |
| E1 | Static file, no dependency on the API after download (proven by construction, not a runtime check) |
| E2 | Reused, unchanged: `withApiHandler({ auth: 'required' })` -> 401; `middleware.ts` protected-prefix -> login redirect |
| E3 | `handleExport`'s catch/`!result.ok` branch -> `toast.error(...)`, no `triggerHtmlDownload` call on that path |

## Verification plan

1. `bun test lib/traceability/export-snapshot.test.ts` — new pure-function coverage.
2. `bun test lib/traceability` — full existing suite stays green (no regressions in `chain-view.test.ts` / `errors.test.ts` / `story-traceability-isolation.test.ts`).
3. `bun run types:check` — clean.
4. `bun run lint:check` — clean.
5. Live-UI pass (`bun run dev`, Playwright CLI) against the declared `testing.automation_identity`: open the traceability screen for a populated story, click Export, confirm a `.html` file downloads, open it, confirm it renders standalone (no console errors, no network tab activity) and matches on-screen content; repeat for a zero-AC story and confirm the "no coverage" prose; confirm the toast text and dismiss control.

## Review Workload Forecast

Estimated: ~260 additions + ~15 deletions = ~275 total lines
400-line budget risk: Low
Chain strategy: single-pr
Decision trace: n/a (risk not High)
Decided by: n/a
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
