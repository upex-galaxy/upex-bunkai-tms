# BK-38 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-38)

# Implementation Plan: STORY-BK-38 - TMS-Run Reporting | Filter project runs with pass/fail totals

## Overview

Build the project-wide Run Reporting view: a filterable list of every Run in a Project (date range, module, status, executor type, combinable), with pass/fail totals recomputed from the SAME filtered query, and project-scoped data isolation. Pure read/report feature — no Run lifecycle mutation (start/update/abort/finish stay out of scope, owned by [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/35/36/39).

***Acceptance Criteria to satisfy*** (reconciled from `story.md`'s embedded Gherkin, `acceptance-criteria.md`'s narrative Mateo/Checkout-v2 set, and the ATP Draft table BK-38-ATC-01..08 — see reconciliation table below):

- View all Project Runs with row detail + totals
- Combine date range + module + status + executor filters; totals recompute
- Date range is inclusive on both boundaries, filtered on `started_at`
- Empty filter match -> zero rows, zero totals, distinct "no-match" state
- Clear filters -> full Project list + totals restored
- Project with zero Runs -> distinct "no-runs" first-use state (also zeroed totals)
- Cross-project / cross-workspace Runs never leak into rows or totals
- Large Run sets stay paginated/performant

## AC Reconciliation

`acceptance-criteria.md` (customfield_10063) is a narrative worked-example subset using "Mateo"/"Checkout v2" — it covers ATC-01 through ATC-05 with concrete numbers. `story.md`'s embedded Gherkin `Background` + 7 `Scenario` blocks is the generic/canonical version and additionally covers ATC-06 (no-runs), ATC-07 (security/isolation), and ATC-08 is only in the ATP Draft table (no dedicated Gherkin scenario in either set — it's a non-functional requirement layered on top of the pagination mechanism). Both sets describe the SAME contract from two angles; neither is redundant with the other.

| ***ATC ID**** | ****Scenario**** | ****Priority**** | ****Covered by (this plan)*** |
| --- | --- | --- | --- |
| BK-38-ATC-01 | View all project Runs, row detail + totals | High | UI-3 (SSR first page), API-4, DB-2 baseline query; test: DB-2 integration guard |
| BK-38-ATC-02 | Combined filters narrow rows + recompute totals | High | DB-2 (AND-composed filter predicate, totals from same CTE), API-2 (multi-value parsing), UI-2 (filter controls); test: DB-2 integration guard (combined-filter case) |
| BK-38-ATC-03 | Empty filter result -> zero rows/totals | High | DB-2 (empty result is a natural query outcome), UI-2 no-match state, UI-1 `resolveReportViewState`; test: UI-1 unit test + DB-2 integration guard |
| BK-38-ATC-04 | `started_at` date range inclusive both ends | Medium | DB-2 date predicate (Technical Decision D3), API-2 date parsing; test: DB-2 integration guard (boundary case: before/on-start/inside/on-end/after) |
| BK-38-ATC-05 | Clear filters restores full list + totals | Medium | UI-2 (state reset + re-query with no filters); test: reuses ATC-01's DB-2 baseline + Stage-3 live-UI check (client-side reset is presentational, not new pure logic) |
| BK-38-ATC-06 | Project with zero Runs -> first-use empty state | Medium | UI-1 `resolveReportViewState` (no-runs branch, distinct from no-match), UI-2; test: UI-1 unit test + DB-2 integration guard (project with 0 runs) |
| BK-38-ATC-07 | Cross-project/workspace isolation | High | DB-2 `where r.project*id = p*project_id` + workspace membership re-check + actor-bind guard (SEC-1); test: dedicated `report-isolation.test.ts` (mirrors `lib/runs/history-isolation.test.ts`) |
| BK-38-ATC-08 | Large Run set stays paginated/performant | Low | DB-2 keyset pagination ([https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) pattern) + covering index; test: DB-2 integration guard proves pagination correctness (page 2 returns the next distinct slice). Load/latency numbers under real scale are environment-bound — ***exempt*** from the unit gate, flagged for Stage 3's Spec Compliance Matrix as `exempt: load-testing is environment-bound, out of scope for a unit test; pagination correctness is the testable proxy and IS covered` |

## Schema audit findings — read before Stage 2 starts

Read `supabase/migrations/0031*runs.sql` ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)), `0036*run*abort.sql`, `0037*run*finish.sql`, `0038*run*history.sql` + `0039*run*history*actor*guard.sql` ([https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)) and `0002*projects_modules.sql` in full. Three genuine gaps between the story's Key Contract Decisions table and the actual live schema:

1. `runs.module*id` ***does not exist.**** The Key Contract Decision table requires "each Run stores a `module*id` snapshot at creation time." The `runs` table (0031*runs.sql) has no such column — `run*atcs.atc*id` is nullable (`on delete set null`, provenance only) and carries no module reference either. This is a real migration, not a documentation gap: ****DB-1*** below adds the column, backfills existing rows, and amends `bunkai*create_run` to populate it going forward.
2. `runs.status` ***CHECK only allows**** `running / passed / failed / aborted`****.**** The Key Contract Decision table says "at least running, passed, failed, blocked, skipped, and aborted," but `blocked`/`skipped` are valid ONLY on `run*atcs` / `run*steps` (per-chain-position, per-step) — there is no code path today that ever sets a Run HEADER's own status to `blocked` or `skipped` ([https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) "mark step pass/fail," which would be the only place that could someday roll a per-step blocked/skipped result up to the run header, is still ⚪ Estimation, not built). The mockup's status filter (`Passed`/`Failed`/`Aborted`, `Running` excluded) matches the REAL 4-value enum exactly. ****Decision:**** ****implement the status filter against the actual 4-value**** `runs.status` ****enum. No migration needed on this axis.*** See Divergence D-1 below — the story's own contract table overstates the enum; the mockup is the accurate one.
3. ***No**** `projects.timezone` ****column exists anywhere in the schema*** (checked `0002*projects*modules.sql` in full). The Key Contract Decision table says "interpret date inputs in the Project timezone," but there is no per-project timezone setting to interpret against. See Technical Decision D3 / Divergence D-2 below.

Everything else the contract needs already exists: `runs.project*id` (project scope), `runs.executor*mode` enum (`human`/`agent`/`ci`, matches [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) verbatim), `runs.started*at`, the `runs*select*workspace*member` RLS policy, and BK-37's keyset-cursor plumbing (`lib/runs/history-validation.ts` cursor codec — reusable verbatim, see API-2).

## Technical Approach

***Chosen approach:**** One new SECURITY DEFINER RPC, `bunkai*report*project*runs`, mirrors `bunkai*list*test*runs` (0038/0039*run*history*.sql) for the keyset-pagination mechanics —* `(started*at desc, id desc)` **tuple predicate, base64url opaque cursor (reuse** `lib/runs/history-validation.ts`**'s** `encodeRunCursor`**/**`decodeRunCursor` **unchanged, do not fork a second cursor codec) — but DIFFERS in one load-bearing way:** *****_totals are computed from the SAME filtered CTE as the rows****, not all-time/filter-invariant like BK-37's Test-history totals. This is Business Rule #3 verbatim ("Pass and fail totals always reflect the currently applied filters, not the whole Project") and is the opposite convention from [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) — Stage 2 must not copy that part of the pattern by rote (Technical Decision D2).

The RPC bakes in the ***actor-bind guard from day one*** (`auth.uid() is not null and auth.uid() <> p*actor*user_id -> raise`) — this is the fix [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) had to retrofit in 0039 after a review finding (an unguarded explicit-actor SECURITY DEFINER RPC lets any signed-in user pass another user's uuid and read through their membership). [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) starts with the guard already in place; no follow-up migration needed.

***Alternatives considered:***

- Compute totals client-side from the fetched page: rejected — the AC requires totals over the WHOLE filtered set, not just the current page, and a large filtered set may span many pages. Must be a server-side aggregate.
- Reuse `bunkai*list*test_runs` with an added project-scope parameter instead of a new RPC: rejected — the totals semantics genuinely differ (filtered vs all-time) and the filter surface is much wider (date range + module + multi-status + multi-executor vs a single outcome value); forcing one function to serve both would make both harder to read and test.

***Why this approach:***

- Reuses a proven, already-reviewed pagination mechanism ([https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)) instead of inventing a second one.
- Keeps the totals semantics correct per Business Rule #3 by construction (same CTE, not a second query).
- Trade-off: two new migrations touching the Runs domain (0040, 0041) instead of one — necessary because DB-1 (schema + `bunkai*create*run` amendment) and DB-2 (the new report RPC) are independently reviewable/revertable units.

## DB Tasks

### DB-1 — Migration `0040*run*module_snapshot.sql`

- `alter table public.runs add column if not exists module_id uuid references public.modules(id) on delete set null;` (nullable — see Risk R-3 below for why NULL must be tolerated).
- Backfill existing rows: `module*id` = the `module*id` of the ATC at chain position 1 (`run*atcs.position = 1` joined to `atcs.module*id`); rows whose position-1 `run*atcs.atc*id` is already NULL (the source ATC was deleted after the Run started) backfill to NULL — documented, not silently dropped.
- `create or replace function public.bunkai*create*run(...)` — reproduce 0031's body verbatim, add: resolve `v*module*id` from the chain-position-1 ATC's `module_id` during the snapshot walk, insert it into the `runs` row. ***Technical Decision D1:**** ****when a Test's chain spans multiple ATC modules, the snapshot is the module of the FIRST chain position*** — this is the same ambiguity the Key Contract Decision table names as the reason the snapshot exists at all ("avoids ambiguous reports when a Test chain spans multiple ATC modules"); position-1 is the natural, deterministic tie-break and needs no new PO input.
- `create or replace function public.bunkai*run*json(...)` — reproduce 0036's body verbatim, add `module*id` and a joined `module*name` (mirrors the existing `environment_name` join pattern).
- No RLS change needed (`runs` RLS is already workspace-scoped and does not reference specific columns).

### DB-2 — Migration `0041*run*project_report.sql`

- Covering index: `create index if not exists runs*project*id*status*started*at*idx on public.runs (project*id, status, started*at desc, id desc);` — mirrors 0038's `runs*test*id*status*started*at*idx` exactly, swapped to `project_id`.
- `create or replace function public.bunkai*report*project*runs(p*actor*user*id uuid, p*project*id uuid, p*date*from date default null, p*date*to date default null, p*module*id uuid default null, p*status text[] default null, p*executor*mode text[] default null, p*limit int default 50, p*cursor*started*at timestamptz default null, p*cursor_id uuid default null) returns jsonb`:
- `revoke ... from public, anon; grant ... to authenticated, service_role;` per the 0031/0036/0037/0038/0039 pattern.

## API Tasks

### API-1 — `lib/runs/report-constants.ts` (new)

Zod-free constants module, mirrors `history-constants.ts`'s reasoning exactly (keep Zod off the client bundle boundary): `REPORT*PAGE*SIZE = 50` (re-export/alias `RUN*HISTORY*PAGE*SIZE` or duplicate the literal with a comment cross-referencing it — decide the smaller-diff option at implementation time), `REPORT*STATUS*VALUES = ['passed','failed','aborted'] as const` (note: `running` IS a valid `runs.status` value but is excluded from the FILTER per the mockup/Divergence D-1 — rows in `running` state can still exist in the table, just not selectable as a status filter chip), `REPORT*EXECUTOR_VALUES = ['human','agent','ci'] as const`.

### API-2 — `lib/runs/report-validation.ts` (new)

Zod query schema: `date*from`/`date*to` (`YYYY-MM-DD`, both optional, `date*to >= date*from` when both present else 422), `module*id` (uuid, optional), `status` (repeatable query param, each value in `REPORT*STATUS*VALUES`, optional), `executor` (repeatable, each value in `REPORT*EXECUTOR_VALUES`, optional), `limit`, `cursor`. ***Reuse**** `encodeRunCursor`****/****`decodeRunCursor` ****from**** `lib/runs/history-validation.ts` ****unchanged*** — same cursor shape, same wire format, no second codec.

### API-3 — `lib/supabase/rpc.ts` (modify)

Add `reportProjectRuns(supabase, args)` wrapper calling `bunkai*report*project_runs`, same shape as the existing `listTestRuns` wrapper (line ~343).

### API-4 — `app/api/v1/projects/[id]/runs/report/route.ts` + `route.openapi.ts` (new)

`GET /api/v1/projects/{projectId}/runs/report` — mirrors `app/api/v1/tests/[id]/runs/route.ts`'s shape (extract id from path, validate UUID, parse query, decode cursor, call the RPC via the admin client, map `P0002 -> not*found`, encode `next*cursor` on the way out). Auth required, no PAT scope requirement yet per the Key Contract Decision table ("Future PAT/API access requires `run:read` or equivalent — not this story").

## UI Tasks

### UI-1 — `lib/runs/report-view.ts` (new)

Pure, framework-agnostic view-state logic, mirrors `history-view.ts`'s `resolveRunHistoryViewState` pattern:

- `resolveReportViewState({ error, rowCount, hasActiveFilters }): 'error' | 'empty-no-runs' | 'empty-no-match' | 'rows'` — branches on `hasActiveFilters` (not "outcome !== null" like [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37), since [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) has 4 independent filter axes — `hasActiveFilters` is true if ANY of date/module/status/executor is set) to distinguish ATC-06 (no-runs, zero filters) from ATC-03 (no-match, filters applied).
- No-match vs no-runs empty-state copy resolvers (both PO-contracted distinct strings per the Key Contract Decision's "distinct empty states" line — author literal copy at implementation time against the mockup's `.state-empty .d` text, do not invent new copy).
- `activeFilterCount(state)` / scope-label formatting (`"N of M runs in current scope"`) — small pure helpers, same spirit as the mockup's inline `render()` but extracted and testable.

### UI-2 — `components/runs/ProjectRunsReportView.tsx` (new, `'use client'`)

Renders the mockup (`test-runs-index.html`) filter row + totals strip + table with the LIVE design system tokens/atoms (Critical Rule #14 — `.status-chip[data-status]`/`.dot[data-status]` from `app/globals.css`, NOT the mockup's own inline `.chip`/`.tot` CSS, same substitution BK-37's `RunHistoryView` already made). Filtering is server-side end-to-end (every filter change re-queries `GET /api/v1/projects/{id}/runs/report` through the API route — mirrors `RunHistoryView`'s reasoning: a client-side filter over an already-fetched page cannot satisfy "totals reflect the WHOLE filtered set," which may span pages).

Controls: date-range pair (native `<input type="date">`, mirrors mockup), module `<select>` (single-select, matches mockup and the AC's "filters to module 'Payment'" singular phrasing), status segmented multi-toggle (`Passed`/`Failed`/`Aborted`, `aria-pressed`, `Running` excluded per Divergence D-1), executor segmented multi-toggle (`Human`/`Agent`/`CI`). "Clear filters" button resets all four axes and re-queries with none applied (ATC-05).

Totals strip: Passed/Failed counts from the API's `totals` object (never computed client-side, per Technical Decision D2) plus the mockup's `N of M runs in current scope` scope line.

States: default / filtered-combined / empty-no-match / empty-no-runs / loading (skeleton rows, totals show `—` not stale numbers, mirrors mockup's `aria-busy` pattern) / error (mono error line + Retry, filters preserved — mirrors mockup's `.error-panel`).

***Pagination gap in the mockup, flagged for Stage 2:*** `test-runs-index.html` shows NO "load more" affordance (its static 15-row demo dataset fits on one page), but ATC-08 requires the API to paginate. UI-2 needs a "Load older runs" control appended below the table, reusing the exact affordance/copy BK-37's `RunHistoryView` already built for `test-run-history.html`'s pagination — this is a UI addition beyond the literal mockup, justified by the ATP row and [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) precedent, not invented from scratch.

### UI-3 — `app/(app)/projects/[projectSlug]/runs/page.tsx` (new, server)

First page read SERVER-side (same reasoning as BK-37's `runs/page.tsx`: paints complete, no client waterfall) via the SAME `reportProjectRuns` wrapper the API route uses (one read, one rulebook — do not fetch the app's own API route from a server component). Resolves `projectId` the SAME way `ProjectLayout` already does (`projects` table, `.eq('slug', projectSlug).eq('workspace_id', activeWorkspaceId)`) — this route sits INSIDE the existing `[projectSlug]` layout, so `ProjectShell` (sidebar/topbar/explorer) is already mounted; do NOT rebuild the mockup's own sidebar/topbar markup (Critical Rule #14 — Live-UI-First; the mockup's App Shell is reference-only, the real shell already exists and is reused). Also queries `modules` for the project (same query `ProjectLayout` already runs) to populate the filter `<select>` options — a small, cheap, redundant read is preferred here over threading a new prop through `ProjectLayout`/`ProjectShell` (surgical-change rule: do not touch an unrelated shared layout file for one new page's dropdown data).

## Security / Data Isolation (BK-38-ATC-07)

### SEC-1 — Isolation verification task

The `runs*select*workspace*member` RLS policy (0031*runs.sql) gates at the WORKSPACE boundary, not the project boundary — a member of the same workspace could, via direct table access, see Runs from ANOTHER project in that workspace. The actual project-scope enforcement for this report is the RPC's `where r.project*id = p*project*id` predicate (DB-2, step 7) — RLS is defense-in-depth on the raw table, the RPC does the primary project-boundary filtering. ***This must be stated explicitly in code comments on the RPC*** (mirrors how `bunkai*list*test*runs`'s comments explain its own non-disclosure reasoning) so a future reader does not assume RLS alone provides project isolation.

Dedicated test: `lib/runs/report-isolation.test.ts` (new), mirrors `lib/runs/history-isolation.test.ts`'s structure — seed/locate two projects in the SAME workspace, assert Project A's report never returns Project B's runs in rows OR totals; assert a foreign-workspace project resolves to the same not-found response as a nonexistent one (non-disclosure); assert the actor-bind guard rejects a spoofed `p*actor*user_id`.

## Unit Test Authoring Gate

| ***Unit**** | ****Where the logic actually lives**** | ****Test file**** | ****Notes*** |
| --- | --- | --- | --- |
| Totals computation (recompute from filtered set, count passed/failed only) | SQL, inside `bunkai*report*project_runs`'s single CTE (DB-2 step 9) | `lib/runs/report-rpc.test.ts` (new, DB-integration guard, mirrors `lib/runs/start-run.test.ts`'s pattern: live service-role client, `describe.skip` when Supabase env absent) | Not a TS pure function — this repo's established convention for RPC business logic is a `bun:test` integration guard against the live RPC (see `start-run.test.ts`, `history-isolation.test.ts`), not a mocked unit test. Honored here rather than forcing an artificial TS wrapper. |
| Date-range boundary (inclusive both ends, UTC calendar-day) | SQL, `::date` cast predicate (DB-2 step 7, Technical Decision D3) | `lib/runs/report-rpc.test.ts` (boundary case: rows before/on-start/inside/on-end/after) | Same rationale as above. |
| Query parsing (date format, status/executor enum values, limit clamp, cursor decode) | TS, `lib/runs/report-validation.ts` | `lib/runs/report-validation.test.ts` (new) | Genuine pure-function unit, mirrors `history-validation.test.ts`. |
| View-state resolution (no-runs vs no-match vs rows vs error) | TS, `lib/runs/report-view.ts` | `lib/runs/report-view.test.ts` (new) | Genuine pure-function unit, mirrors `history-view.test.ts`. |
| Cross-project/workspace isolation + actor-bind spoof guard | SQL, DB-2 steps 1-2 | `lib/runs/report-isolation.test.ts` (new) | See SEC-1. HIGH priority — this is BK-38-ATC-07. |
| Cursor encode/decode | TS, `lib/runs/history-validation.ts` | Already covered by the existing `history-validation.test.ts` ([https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)) | Reused verbatim, unmodified — no new test needed; note the reuse explicitly in the PR so reviewers don't ask for a duplicate. |

No presentational/JSX logic in `ProjectRunsReportView.tsx` needs a co-located unit test beyond what's listed above — visual states (skeleton, chip colors, empty-state copy rendering) are proven by the mandatory Stage 3 live-UI validation pass instead, per the skill's Unit Test Authoring Gate exemption for presentational code (exemption logged here, not silently skipped).

## Technical Decisions

### D1: Module snapshot ambiguity tie-break

***Chosen:*** when a Test's chain spans multiple ATC modules, `runs.module_id` snapshots the module of the ATC at chain position 1.

- Directly resolves the ambiguity the Key Contract Decision table itself names as the reason the column exists.
- Trade-off: a Run's reported module may not reflect every module actually exercised by a multi-module chain — acceptable, this is a reporting dimension, not an execution-correctness concern, and no PO input exists to pick a different rule.

### D2: Totals computed from the filtered set, not all-time

***Chosen:*** `bunkai*report*project_runs`'s totals come from the SAME filtered CTE as the rows (Business Rule #3), a deliberate divergence from BK-37's all-time/filter-invariant totals.

- Directly required by the story's own Business Rules ("totals always reflect the currently applied filters, not the whole Project").
- Trade-off: none functionally, but this is the single easiest place for Stage 2 to introduce a bug by pattern-matching [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) too literally — called out here and in the DB-2 task and the RPC's own code comments.

### D3: Date-range filter interpreted as UTC calendar day

***Chosen:*** `date*from`/`date*to` inputs are matched against `started_at::date` (UTC), not a per-project local timezone.

- No `projects.timezone` column exists anywhere in the schema (checked exhaustively) — "Project timezone" in the Key Contract Decision table has no data to resolve against today.
- Trade-off: a QA Lead in a non-UTC timezone may see a Run they'd expect on "yesterday" (their local date) show up under "today" near midnight UTC. Acceptable for MVP; flagged as Divergence D-2 for PO visibility, not silently absorbed.

### D4: Status filter matches the real 4-value enum

See Schema audit finding #2 above — `Passed`/`Failed`/`Aborted` only, `Running` excluded from the filter (rows can still show `Running`, just aren't filterable to it). Matches the mockup exactly.

## Divergence candidates (flag, do not resolve here)

- ***D-1 — Status filter enum:*** the mockup's status filter (`Passed`/`Failed`/`Aborted`, `Running` excluded) does not match the Key Contract Decision table's literal 6-value list (`running, passed, failed, blocked, skipped, aborted`). Resolution above (D4) is that the mockup is correct and the contract table overstates what the schema can actually produce at the run-header level — `blocked`/`skipped` are per-step states that never surface as `runs.status`. This reads as a low-risk documentation overstatement rather than a genuine design conflict, but it is a real mismatch between two of the story's own artifacts and should be ratified (or corrected in the source Jira fields) rather than left silently reconciled by this plan alone.
- ***D-2 — Project timezone:*** no infrastructure exists for it; UTC-day interpretation adopted (D3). Worth a follow-up tech-story if/when project-level settings ([https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90](https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90)/Settings epic territory) ship a timezone field.
- ***D-3 — Pagination affordance absent from the mockup:*** `test-runs-index.html` has no "load more" control; UI-2 adds one, borrowed from BK-37's `test-run-history.html` pattern, to satisfy ATC-08. Not a conflict, just something not literally drawn in this story's mockup file.

None of these block Stage 2 — all three have a documented, defensible default. Surfacing them here per Critical Rule #15 so a silent divergence doesn't slip through un-ratified.

## Dependencies

- [x] [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) (Start manual run) — Ready For Release. `runs` table, `bunkai*create*run`, `runs.executor_mode` all exist and are the foundation this story extends.
- [x] [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) (Run history) — Ready For QA, PRs #65 (API, migrations 0038/0039) + #66 (UI) merged to `staging`. Its keyset-pagination pattern and cursor codec (`lib/runs/history-validation.ts`) are reused verbatim by DB-2/API-2.
- [x] Mockup `test-runs-index.html` — available at `.context/designs/bunkai-test-management-tool/bk-30-test-runs-index/test-runs-index.html`, frozen §2 tokens.
- [ ] None blocking — no open dependency prevents starting Stage 2.

## Risks & Mitigations

***R-1:**** ****Migration touches an already-shipped, already-in-production-use RPC (****`bunkai*create*run`****).***

- Impact: Medium — a mistake in the `create or replace` body could break Run creation for every project, not just BK-38's read path.
- Mitigation: append-only migration file (0040 does NOT edit 0031), full function body reproduced verbatim with the minimal module-snapshot addition, and BK-34's existing `lib/runs/start-run.test.ts` DB-integration suite re-run against the amended function before merge (it already asserts ATC-01 "start -> run with run_steps in chain order" — a regression here would fail that suite, not just a new one).

***R-2:**** ****Totals-from-filtered-set vs BK-37's totals-are-all-time — easy to copy the wrong convention.***

- Impact: Medium — a totals bug is subtle (numbers look plausible, just wrong under specific filter combinations) and directly contradicts Business Rule #3.
- Mitigation: Technical Decision D2 stated explicitly in three places (this plan, the DB-2 task, and inline RPC comments) plus a dedicated `report-rpc.test.ts` case asserting totals change when a filter narrows the row set.

***R-3:**** ****Existing Runs can't always be backfilled a real**** `module_id`****.***

- Impact: Low — `run*atcs.atc*id` is nullable (`on delete set null`), so a Run whose chain-position-1 ATC was later deleted has no module to recover. Those rows backfill to `module_id = NULL`.
- Mitigation: `module*id uuid ... on delete set null` (nullable column, not `not null`); UI/API treat `module*id IS NULL` as "no module" rather than erroring — such a Run appears when "All modules" is selected and is excluded (correctly) when a specific module filter is applied.

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| DB-1 (migration 0040: schema + `bunkai*create*run`/`bunkai*run*json` amendment) | 3h |
| DB-2 (migration 0041: `bunkai*report*project_runs` RPC + index) | 4h |
| API-1..4 (constants, validation, rpc wrapper, route + openapi) | 3h |
| UI-1 (report-view.ts pure logic + tests) | 1.5h |
| UI-2 (ProjectRunsReportView.tsx — filters, totals, table, 5 states, pagination) | 5h |
| UI-3 (runs/page.tsx SSR entry) | 1h |
| SEC-1 (isolation test) | 1.5h |
| Unit tests (report-validation, report-view, report-rpc, report-isolation) | included above per-task |
| Live-UI validation pass (Stage 2 + Stage 3) | 1h |
| ***Total**** | ****~20h*** |

***Story points:*** 3 (matches `story.md` — a 3-point story sized against this team's existing Runs-domain velocity from [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/36/37/39, not against raw hours; the hour estimate above is planning detail, not a re-estimation of the point value).

## Definition of Done Checklist

- [ ] Migrations 0040 + 0041 applied; `bun run jira:sync-issues` not relevant here but `supabase db` migration checks green
- [ ] All 8 ATC rows resolve to `test:` / `manual:` / `exempt:` in Stage 3's Spec Compliance Matrix (see reconciliation table above for the intended mapping)
- [ ] `bunkai*create*run` regression suite (`lib/runs/start-run.test.ts`) still green after the DB-1 amendment
- [ ] `report-rpc.test.ts`, `report-isolation.test.ts`, `report-validation.test.ts`, `report-view.test.ts` all green
- [ ] Lint + typecheck + existing test suite green (verification cap=3)
- [ ] Live-UI pass against the running dev server: default / filtered-combined / empty-no-match / empty-no-runs / loading / error, using the LIVE `.status-chip`/`.dot` tokens from `app/globals.css`, not the mockup's inline CSS
- [ ] Divergences D-1/D-2/D-3 carried into the PR description for reviewer visibility
- [ ] Code review approved; Spec Compliance Matrix has zero `uncovered` rows
- [ ] Deployed to staging; manual smoke test confirms project-scoped isolation (SEC-1) on real data

---

## Review Workload Forecast

Estimated: 2700 additions + 100 deletions = 2800 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace:
Decided by:
Decision needed before apply: Yes

***Notes (per-file estimate basis):**** two new migrations (`0040*run*module*snapshot.sql` ~270 lines incl. two full `create or replace` function bodies reproduced from 0031/0036 with additions, `0041*run*project*report.sql` ~190 lines), five new `lib/runs/**` files (constants/validation/view + their three dedicated test files), a modified `lib/supabase/rpc.ts` (+~20 lines, one new wrapper), a new API route pair (`route.ts` + `route.openapi.ts`, ~160 lines), a new client component (`ProjectRunsReportView.tsx`, estimated ~400 lines given four independent filter axes + 5 states + pagination, vs BK-37's single-filter `RunHistoryView`), and a new SSR page (`runs/page.tsx`, ~90 lines). A meaningful fraction of the two migration files is boilerplate reproduced verbatim from 0031/0036 (low novel-logic density per line) rather than fresh logic — noted for reviewer context, not used to discount the line count itself. This total is naturally larger than BK-37's own 650-line forecast (which triggered its own 2-PR chain split) because [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) adds a schema change to an already-shipped RPC plus a materially wider filter surface (4 independent axes vs BK-37's 1) on top of the same pagination mechanism. A split mirroring BK-37's own API-PR / UI-PR boundary is a plausible candidate for `/git-flow-master` to evaluate at the gate, but that choice — and its `Decision trace` — belongs to that skill's Step 4, not to this plan.

---
_Synced from Jira by sync-jira-issues_
