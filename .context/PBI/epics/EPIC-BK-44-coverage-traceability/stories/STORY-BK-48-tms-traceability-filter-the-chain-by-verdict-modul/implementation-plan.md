# BK-48 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

# BK-48 — Implementation Plan

***Goal***: add combinable filters (result, module, date range) to the traceability chain screen (`/projects/[projectSlug]/traceability`, shipped by BK-45/BK-50), with an active-filter summary, a distinct zero-match empty state, and URL-persisted filter state.

## Reused live surface (Rule #14 — live UI is the fidelity source)

- `components/traceability/TraceabilityChainView.tsx` / `lib/traceability/chain-view.ts` (BK-45/BK-50) — the chain render this story adds a filter bar on top of. No re-architecture of the AC/ATC card layout.
- Result-toggle button pattern reused verbatim from `components/runs/ProjectRunsReportView.tsx`'s status filter group (`aria-pressed` toggle buttons, `bg-surface-5` active state).
- Module `<select>` pattern reused verbatim from the same component's module filter.
- `.dot[data-status]` / `.status-chip[data-status]` (`app/globals.css`) already define all six values (`pass/fail/blocked/skipped/aborted/running`) — no new tokens.
- Card/empty-panel treatment reused from the existing zero-ac / zero-coverage empty states already in `TraceabilityChainView.tsx`.

## Gap found: module identity is not in the chain payload

`bunkai*report*story*traceability` (0068) returns `id/slug/title/layer/test/latest*run/defects` per ATC — no module. The mockup's `data-module="MOD-001"` is fixture-only; the real schema (`public.modules`) has no `MOD-XXX` code, only `id`/`name`/`path`. A migration is required (Critical Rule: this story was scoped as no-migration; recording the deviation here per the operator's instruction).

***Migration 0069*** (next after live high-water 0068): `bunkai*report*story*traceability` gains `module: {id, name}` per ATC, sourced from the `live*atc` CTE's existing `modules` join (already selects `m.archived*at` implicitly via the WHERE; now also selects `m.id`, `m.name`). Purely additive (new jsonb key), same CTE shape, same actor-bind/scoping — no new authorization surface, no new table read outside the already-scoped `live*atc`/`pair` chain. `CREATE OR REPLACE FUNCTION`, idempotent.

### AI Tech Lead decision — module filter value (published to ticket)

Candidates scored (product value / precedent consistency / implementation cost / reversibility):

1. Invent a synthetic "MOD-XXX" code matching the mockup fixture — rejected: no such column exists, would require a new unique-code column + backfill (schema change, out of scope, not reversible cheaply).
2. Filter/display by `module.path` (already unique per project) — rejected: paths are deep/verbose for a chip label, no existing precedent renders raw path to users.
3. ***Filter by ****`module.id`**** (UUID), display ***`module.name` — chosen. Matches the established precedent in `0048*project*coverage*report.sql`/`ProjectRunsReportView.tsx` (`module*id`/`module_name` pair, `<select value={m.id}>{m.name}</select>`). Reversible, zero schema change, one migration.

Winner: option 3. Recorded as master-design-plan.md §5 divergence D30 (UI/data-shape departure, not architectural — no ADR).

## Client-side design (no new fetch on filter change)

All filtering is over the ALREADY-FETCHED `payload` (matches the mockup's own client-side `applyFilters()` — the RPC already returns the whole bounded per-story chain, BK-45's own no-pagination decision). New pure, framework-agnostic functions in `lib/traceability/chain-view.ts` (bun:test-covered, mirrors the file's existing style):

- `RESULT*FILTER*VALUES` (six-value order matching D27: pass/fail/blocked/skipped/aborted/running) + `RESULT*FILTER*LABELS`.
- `rowFilterStatus(atc)` → `RunChipTone | null` (row's `data-status` source — `null` when no run yet, AC1.4/AC6.1).
- `rowFilterDate(atc)` → `string | null` (YYYY-MM-DD slice of `latest*run.started*at`; `null` when no run, AC2.7/AC6.1).
- `TraceabilityFilterState` `{ results, moduleId, from, to }`.
- `isDateRangeInverted(from, to)` (AC2.5).
- `atcMatchesFilters(atc, state)` — AND across result/module/date, ignoring an inverted date range (still applies result+module).
- `distinctModules(payload)` — dedupe `{id,name}` from ATC rows actually present in the chain (naturally excludes archived modules, since `live_atc` already excludes them server-side — AC2.2's second clause falls out for free).
- `filterCriteria(payload, state)` → per-AC visible-row lists + totals, feeding the "n of m shown" note and AC-card hide rule (AC1.1/2.6).
- `rowCountLabel`, `activeFilterChips`, `isFilteringActive` — pure string/array builders for the summary bar + `aria-live` count text.
- URL <-> state: `parseFilterStateFromParams(URLSearchParams)` (silently drops unknown `result` values and malformed dates — AC5.4) / `filterStateToParams(state)` (only present axes are written — AC5.5/5.6).

## Component wiring (`TraceabilityChainView.tsx`)

- Filter bar rendered above the AC cards (mirrors mockup position), inside the existing scroll container, always visible once `payload` is loaded (not shown on zero-ac/zero-coverage/loading/error states — no data to filter yet).
- Filter state: local `useState`, initialized empty on first render (SSR-safe), hydrated from `window.location.search` in a mount-only `useEffect` (avoids a hydration mismatch from reading `window` during render). A `popstate` listener re-syncs on browser back/forward.
- URL sync via `window.history.replaceState` on every filter change (never `pushState` per keystroke — AC5.3's "navigate away, then Back" is satisfied by the real navigation's own history entry; replacing in place matches common filter-bar UX and avoids a `history` entry per toggle). `next/navigation`'s router is deliberately NOT used for this write path — it would re-invoke the page's Server Component (a live DB re-fetch) on every filter click, which contradicts "filtering is client-side over the already-fetched chain".
- Each `AtcRow`'s root `<div>` gains `data-status`, `data-module`, `data-date` attributes (mirrors the mockup's `.chain-row` exactly) plus a `hidden` when filtered out.
- Per-AC "n of m shown ·" note + AC-card hide-when-zero-visible (AC1.1/2.6).
- Zero-match panel (`data-testid="traceability-filtered-empty"`) — distinct component/copy from the existing zero-coverage banner and zero-ac panel (AC3.1), shown when filtering is active, the story HAS chain rows, and zero are visible.
- Active-filter summary bar + chips + Clear-all (AC4), row-count `aria-live="polite"` region (AC4.4).
- Keyboard: native `<button aria-pressed>` / `<select>` / `<input type="date">` already satisfy Tab/Space/Enter/Arrow semantics (AC1.5/2.8/2.9) with no extra JS; an `onKeyDown` on the result-toggle group blurs on `Escape` (AC1.5's "Escape exits the group").
- AC6 (missing `data-date`) and AC1.4/2.7 (missing `data-status`/`data-module`) are the SAME `rowFilterStatus`/`rowFilterDate`/`atcMatchesFilters` null-handling — no separate code path, covered by the same unit tests.

## Files touched

- `supabase/migrations/0069*story*traceability_module.sql` (new)
- `app/api/v1/projects/[id]/traceability/route.openapi.ts` (add `module` to `TraceabilityAtcSchema`)
- `public/openapi.json` (regenerated via `bun run api:sync`)
- `lib/traceability/chain-view.ts` (module field + filter pure functions)
- `lib/traceability/chain-view.test.ts` (extend)
- `components/traceability/TraceabilityChainView.tsx` (filter bar + wiring)
- `.context/design/master-design-plan.md` (§5 divergence D30)

## Out of scope (per Jira `out-of-scope` field)

Saving filter presets; building the underlying chain (BK-45, shipped); bulk actions on filtered results.

## Review Workload Forecast

Estimated: ~420 additions + ~40 deletions ≈ 460 total lines (1 migration ~60 lines, 1 openapi schema tweak ~5 lines, chain-view.ts +~150 lines incl. jsdoc, component +~180 lines, tests +~100 lines).
400-line budget risk: Medium
Chain strategy: n/a (risk not High)
Decision trace: n/a (risk not High)
Decided by: n/a
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
