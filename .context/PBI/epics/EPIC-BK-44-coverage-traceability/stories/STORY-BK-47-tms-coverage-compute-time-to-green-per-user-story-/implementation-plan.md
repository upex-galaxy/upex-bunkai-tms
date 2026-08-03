# BK-47 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-47)

# Implementation Plan: STORY-BK-47 - TMS-Coverage | Compute time-to-green per user story from run and bug history

## Overview

Add a ***Recovery-cycle table per user story**** plus its ****Median recovery cycle*** KPI to the Metrics screen (`/projects/[projectSlug]/metrics`). For every user story with run history, compute elapsed time from the first failing terminal run to the first subsequent all-passing terminal run, entirely from `runs`/`run_atcs` — no Bugs-domain read (Decision 1).

***Scope resolution already ratified*** (Jira comment "Scope resolution — run-data only, before Stage 1", posted 2026-08-01): `business-rules.md` says "recovered" requires a resolved defect, but the Bugs table doesn't exist yet ([https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) in progress). Resolved with the repo owner: run-data only, computed entirely from run history. The "resolved defect" wording is narrative, not a literal dependency — noting this again so a future reader doesn't reintroduce a Bugs-domain read.

***Acceptance Criteria*** (3 Gherkin scenarios, `acceptance-criteria.md`):

- AC1 **Recovered**: failing run, later a fully-passing run → elapsed time from first fail to first all-pass.
- AC2 **Still failing**: latest run still failing → "not yet green" + elapsed so far.
- AC3 **Never failed**: always-passing runs → "no cycle to measure."

***Out of scope***: per-test/per-step flakiness scoring, configurable dashboards/charts, editing runs or defects.

---

## Technical Approach

***Chosen approach:*** One new `SECURITY DEFINER` RPC (`bunkai*report*project*recovery*cycles`), one unpaged API route, one React section component rendering into the (currently nonexistent) Metrics page — built as a minimal, additive shell so [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) (Coverage, same screen) can slot in later without a rewrite.

***Alternatives considered:***

- ***Client-side reconstruction from*** `GET /runs/report`: rejected — that endpoint is Test/module/date-scoped and paginated; rebuilding a project-wide per-story timeline client-side is the wrong layer for an aggregate.
- `SECURITY INVOKER` ***relying on RLS alone*** (`bunkai*list*activity` pattern): rejected for this RPC — see Decision 2.
- ***Fold into**** `bunkai*report*project_coverage` ****(BK-46's RPC)***: rejected — different table family, different owner, in flight on a separate branch; would force a merge conflict between two concurrent tickets on one file.

***Why this approach:***

- ✅ Mirrors the established pattern for this report family exactly: `bunkai*report*project*runs` ([https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38)) and `bunkai*report*project*coverage` ([https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46)) — same actor-bind guard, same `project*not*found`/P0002 non-disclosure, same admin-client calling convention, same unpaged full-payload shape for a small bounded dataset.
- ✅ RPC stays a "dumb" per-story projection (raw timestamps + state); median/formatting happen in TypeScript, trivially unit-testable (Decision 3).
- ❌ Trade-off: an explicit `p*project*id` predicate must be threaded through every CTE by hand, not "free" from RLS — accepted and specifically hardened against the [https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49) cross-tenant bug class (Decision 2).

---

## Database Design

***New migration:*** `0049*recovery*cycle_report.sql` — next-free number confirmed against `origin/staging`, `origin/feat/BK-40-bug-filing` (`0046`), `origin/feature/BK-46-coverage-view` (`0048`), and every other branch's migrations tree at planning time. ⚠️ Re-verify at Stage 2 start — a third concurrent worker could claim `0049` first (Risk 3).

***Adds:*** `bunkai*report*project*recovery*cycles(p*actor*user*id uuid, p*project*id uuid) returns jsonb` — membership-gated, whole-project, unpaged read (mirrors `bunkai*report*project*coverage`'s "small, bounded, one full-payload read" rationale — no params, no pagination, per `scope.md`). Existing indexes (`atcs*user*story*id*idx` from `0004`, the `runs (project*id, status, started*at)` coverage from `0041`) likely already support this scan — confirm with `EXPLAIN` in Stage 2 before adding a speculative new one.

***Algorithm*** (pins down the business-rule interpretation so Stage 2 doesn't have to invent it):

1. ***Actor bind + membership*** — identical guard shape to `bunkai*report*project*coverage`: `auth.uid()` NULL-or-matches `p*actor*user*id`, else `project*not*found`/P0002. Resolve `p*project*id → workspace*id` (missing → same P0002); `bunkai*assert*actor*can*read*workspace` (ANY active role — read-only report, same tier as the Runs/Coverage reports).
2. ***Candidate runs***: `runs.project*id = p*project_id AND status IN ('passed','failed')` — terminal only; `running`/`aborted` excluded from the timeline (Decision 4).
3. ***Per-(run, user*story) verdict***: for each candidate run, for each distinct `atcs.user*story*id` touched via `run*atcs.atc*id = atcs.id` (re-asserting `atcs.project*id = p*project*id` explicitly — Decision 2), fold that run's touching `run_atcs.status` values into one verdict: `green` (all `passed`), `red` (any `failed`/`blocked`), or excluded (all `pending`/`skipped` — not a valid data point either way).
4. ***Per-story rollup*** (one row per story with ≥1 qualifying data point — "stories with run history"; a story with zero candidate runs touching it is omitted entirely, not shown as "no cycle"):
5. ***Payload***: `{items: [{user*story*id, title, external*id, module*id, module*path, first*fail*at, first*green*at, state}], generated*at`}. No median, no formatted durations — TypeScript's job (Decision 3).

***Row projection:*** `module*path` via `user*stories.module*id → modules.path` — a direct FK chain (`0002`/`0003`), no need to traverse `acceptance*criteria`/`atc*acceptance*criteria` the way BK-46's coverage RPC does, since `atcs.user*story*id` is itself a direct, mandatory FK (`0004`).

***Custom SQLSTATE:*** none new — reuses `project*not*found`/P0002; no user-supplied filters to validate. Grant/revoke boilerplate identical to `0041`/`0048`.

---

## API Design

***New route:*** `GET /api/v1/projects/{id}/metrics/recovery-cycles` — read-only, `auth: 'required'`, no scope requirement (mirrors the Runs report route — no reporting PAT scope exists yet), no query params (`scope.md` rules out configurable views).

Handler: `createAdminClient()` + `reportProjectRecoveryCycles(supabase, {actorUserId, projectId})` — new wrapper in `lib/supabase/rpc.ts`, same shape as `reportProjectRuns`/`reportProjectCoverage`. Error mapping: new `lib/metrics/errors.ts` (check for a BK-46-landed shared `lib/metrics/` module first, don't duplicate) mapping P0002 → 404 `not_found`, mirroring `mapRunRpcError`. `route.openapi.ts` sibling registers the path (mirrors `runs/report/route.openapi.ts`).

The route (not the RPC) computes `median*recovery*seconds`, `resolved*cycle*count`, and each row's `cycle_seconds` from the raw `items` (Decision 3).

```
GET /api/v1/projects/{id}/metrics/recovery-cycles
200 {
  "items": [{ "user*story*id", "title", "external_id": "string|null",
    "module*id", "module*path", "state": "recovered|in*progress|no*cycle",
    "first*fail*at": "ISO8601|null", "first*green*at": "ISO8601|null",
    "cycle_seconds": "number|null" }],
  "median*recovery*seconds": "number|null",
  "resolved*cycle*count": "number", "story_count": "number"
}
404 { "error": "not_found", "message": "Project not found." }
```

---

## UI/UX Design

***Mockup:**** `.context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/metrics-dashboard.html` (`master-design-plan.md` §4.7). Frozen tokens (§2.1): `--pass #2fb673` / `--fail #e5484d` / `--running #4f8cf7` / `--skipped #8a91a0`, `.chip[data-status]`, `.dot[data-status="running"]` (pulsing — port the ****canonical*** §2.2 box-shadow-ring version for this new component, not the currently-drifted opacity-fade one), radii `3/5/7/10px`, `--font-mono` for durations/ids.

### ⚠️ Shared-screen coordination (Risk 1)

Checked live at planning time: the Metrics route ***does not exist yet****, locally or on any remote branch (`git branch -r | grep -i metrics` → no hits). [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) (`feature/BK-46-coverage-view`) has so far landed only its DB slice — no route, no UI. ****BK-47 is first to touch this route*** — build a minimal shell so BK-46's UI can be added later as an independent unit, not the full page:

- `app/(app)/projects/[projectSlug]/metrics/page.tsx` — shell only: `<Suspense>` + server-side first read of ***this story's own data only***, page head ("Coverage & Cycle Time" per mockup `<title>`), a KPI grid + content area. Render only BK-47's KPI card + `RecoveryCycleSection` — do not stub BK-46's 3 coverage KPIs or its module table.
- KPI row: lay out only the cards actually present (don't render a 4-up grid with 3 fake-empty cells) — comment pointing at this plan + BK-46's ticket.
- Component boundary: `components/metrics/RecoveryCycleSection.tsx` owns 100% of this story's section; [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) gets its own `components/coverage/...`. Neither story edits the other's component file. Shared touch points: `page.tsx` (assembling both sections) and `AppSidebar.tsx`'s `Metrics` nav `href` (currently `null`, `AppSidebar.tsx:100`) — ***whichever ticket merges first wires both***; the second must re-check for drift before writing, not assume this snapshot still holds.
- If [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) has landed a `page.tsx` shell by Stage 2, ***add to it*** — never recreate or overwrite.

### Recovery-cycle table (`components/metrics/RecoveryCycleSection.tsx`)

Reuses conventions from `RunHistoryView.tsx`/`ProjectRunsReportView.tsx`: `data-testid` per element, `.status-chip[data-status]`, `aria-busy`/`aria-live="polite"`, a `RecoveryCycleSkeleton` export not gated by the same Suspense boundary as the fetch, error+retry state, empty state. No filters, no pagination (matches `scope.md`).

Columns (mockup, 6): ***User story**** (title + `external*id` mono chip when present — Decision 5), ****Module**** (`module*path`), ****First fail****, ****First green****, ****Cycle****, ****State***.

By `state`:

- `recovered` → `.chip[data-status="pass"]` "Recovered", `.cy-dur` mono duration, both timestamps populated.
- `in_progress` → `.chip[data-status="running"]` + pulsing dot "Not yet green", `.cy-dur.ongoing` "`<duration> so far`" against render-time `Date.now()` (not live-ticking — Decision 6), First green shows `.cy-none` em-dash.
- `no*cycle` → `.chip[data-status="skipped"]` "No cycle · never failed" (distinct token from `in*progress`'s `running` — the exact distinction the brief calls out), First fail/Cycle show `.cy-none` em-dash.

Card foot: mockup's verbatim caption ("'So far' clocks measure from first fail to now…") + a `trace-link` to `/projects/[projectSlug]/traceability` ([https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45)/48, link only).

### KPI card (`kpi-median-cycle`)

`.kpi` card: "Median recovery cycle" / formatted `median*recovery*seconds`, with an explicit empty-state copy when `resolved*cycle*count = 0` (not in the mockup — needs a states-strip addition per Live-UI-First, don't silently render "0h 0m") / sub "`<resolved*cycle*count>` resolved cycles · first fail → first green".

### States strip

default · empty (zero stories with run history — distinct from "all no_cycle", which is a full table of skipped rows, not empty) · loading skeleton · error+retry · zero-resolved-cycles KPI (added per Live-UI-First).

---

## Types & Type Safety

No schema/generated-type change (no new tables/columns) unless Stage 2's `EXPLAIN` concludes a new index is needed (index-only changes don't touch generated types either). New `lib/metrics/recovery-cycle.ts` holds response types (`RecoveryCycleItem`, `RecoveryCycleReport`) plus the pure duration/median functions — all independently unit-testable without a DB connection. `RecoveryCycleSection.tsx` props typed against `RecoveryCycleItem[]`, no `any`.

## Content Writing

Copy lifted verbatim from the mockup where it already matches domain vocabulary ("Recovery cycle by user story", "Not yet green", "No cycle · never failed", the card-foot caption) — already correct per `domain-glossary.md` §3. The one net-new string is the empty-KPI case — keep it factual and terse, matching the mockup's tone.

---

## Implementation Steps

### Step 1: Migration `0049*recovery*cycle_report.sql`

***Task:*** Add the RPC per the Database Design algorithm above.
***Testing:*** Isolation/security test (`lib/metrics/recovery-cycle-isolation.test.ts`, mirrors BK-46's `coverage-isolation.test.ts` precedent) — a workspace-A member cannot read workspace-B's project via this RPC even with a real project id from B; the actor-bind spoof case collapses into the same `project*not*found`. This is the direct regression guard for the [https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49) vulnerability class (Decision 2) — not optional. Plus a fixture-driven correctness test for all 3 AC scenarios + the edge cases in Decision 4.
***Estimated time:*** 4h

### Step 2: RPC wrapper + error mapping

***Task:*** `reportProjectRecoveryCycles` in `lib/supabase/rpc.ts`; `lib/metrics/errors.ts` (check for [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) drift first).
***Testing:*** Unit test the error mapper against a mocked P0002.
***Estimated time:*** 1h

### Step 3: Pure TS layer — duration formatting + median

***Task:*** `lib/metrics/recovery-cycle.ts` — `formatCycleDuration(seconds)` (matches mockup's `3d 4h 51m`/`15h 35m` grammar), `computeMedianRecoverySeconds(items)`, `computeElapsedSoFar(firstFailAt, now)`.
***Testing:*** Table-driven — zero/one item, even/odd median, boundary durations, timezone-safe ISO parsing.
***Estimated time:*** 2h

### Step 4: API route

***Task:*** `app/api/v1/projects/[id]/metrics/recovery-cycles/route.ts` + `route.openapi.ts`.
***Testing:*** Route test mocking `db.rpc` for 200/404; confirm `median*recovery*seconds`/`resolved*cycle*count` are computed from a fixture, not passed through blindly.
***Estimated time:*** 2h

### Step 5: Page shell + section component

***Task:*** `page.tsx` (re-check live for [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) drift first) + `RecoveryCycleSection.tsx` (+ skeleton export) + wire `AppSidebar.tsx`'s Metrics `href` (re-check it's still `null` first).
***Edge cases:*** empty table, loading, error+retry, zero-resolved-cycles KPI, `in*progress` vs `no*cycle` chip distinction never conflated.
***Testing:**** Component test per state (recovered/in-progress/no-cycle row, empty, error+retry, KPI populated/empty). `data-testid` coverage per the `recovery-cycle-**` naming convention.
***Estimated time:*** 5h

### Step 6: Integration + manual smoke

***Task:*** Confirm the page composes against live data (mix of recovered/in-progress/never-failed stories).
***Flow:*** load the route → KPI + table render → chip tokens match exactly (not look-alikes) → "so far" duration recomputes from `first*fail*at` on reload, not frozen.
***Testing:*** E2E per the ATP once synced; manual staging check.
***Estimated time:*** 2h

---

## Technical Decisions (Story-specific)

### Decision 1: Run-data-only scope, no Bugs-domain read

***Chosen:*** Compute cycle time entirely from `runs`/`run*atcs`/`atcs`/`user*stories`/`modules`; never touch a `bugs` table (doesn't exist yet).
***Reasoning:*** ✅ Ratified with the repo owner (Jira comment, 2026-08-01) — recorded here so a future reader of `business-rules.md`'s "resolved defect" wording doesn't reintroduce the dependency. ✅ Matches `scope.md` and all 3 ACs literally. ❌ Trade-off: shipped behavior reads slightly more permissive than `business-rules.md`'s literal wording — accepted, the more literal/testable sources (AC, scope) already matched this reading.

### Decision 2: `SECURITY DEFINER` + explicit actor, project-scoped through every CTE (not `SECURITY INVOKER`)

***Chosen:*** Mirrors `bunkai*report*project*runs`/`bunkai*report*project*coverage` — admin client + explicit `p*actor*user*id` — not the `bunkai*list_activity` INVOKER pattern.
***Reasoning:**** The security note for this ticket flagged a real cross-tenant bug fixed this run on [https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49) (`bunkai*resolve*activity*actors`): a DEFINER RPC asserted the caller's own membership but never scoped the **returned** rows to it. General rule: disclosed rows must be scoped to the exact resource the assert checked, not just gated by a caller-membership check. This RPC does that — every CTE re-asserts `atcs.project*id = p*project*id` / joins through project-filtered modules, so disclosed rows can never span outside the checked project (same shape as `bunkai*report*project*coverage`'s `proj*modules` CTE). Why not INVOKER: `bunkai*list*activity` works under INVOKER because its RLS policy is already workspace-scoped-and-sufficient for a workspace-scoped list; this report needs **project**-level isolation, and RLS on `runs`/`atcs`/`user*stories` only gates at the **workspace* boundary (`0041`'s own comment) — an INVOKER version would need the identical explicit `project*id` predicates to be correct, so INVOKER buys no isolation benefit here, only inconsistency cost against this screen's two sibling RPCs (Runs, Coverage) which already use DEFINER. Per ADR-0001: "Path A stays valid where transactional integrity already demands an RPC" — this multi-table aggregation is exactly that shape, and this report family already chose Path A deliberately. ❌ Trade-off: correctness now depends on hand-written project-scope predicates, not "free" RLS — mitigated by copying `bunkai*report*project_coverage`'s CTE shape verbatim and the mandatory isolation test in Step 1.

### Decision 3: Median + duration formatting in TypeScript, not SQL

***Chosen:*** RPC returns raw per-story rows only (`first*fail*at`, `first*green*at`, `state`); `median*recovery*seconds`, `resolved*cycle*count`, `cycle_seconds`, and all duration strings computed in `lib/metrics/recovery-cycle.ts`.
***Reasoning:**** ✅ Postgres **can* do this (`percentile*cont`), but a flat RPC projection matches `bunkai*list_activity`'s "fold above the DB" ethos and is trivially unit-testable in TS for every edge case without a live Postgres connection. ❌ Trade-off: one extra computation pass over an already-small, bounded dataset — not a hot path per `scope.md`.

### Decision 4: Only terminal runs (`passed`/`failed`) count

***Chosen:*** `running`/`aborted` runs never contribute a `red`/`green` data point, even with interim `run_atcs` results.
***Reasoning:*** ✅ `running` isn't resolved yet; counting it risks a false regression signal. `aborted` has no defined cycle-time semantics in the AC/business rules. ❌ Trade-off: an aborted run mid-timeline is invisible on this table — acceptable per `out-of-scope.md`'s explicit exclusion of finer-grained flakiness nuance.

### Decision 5: `user*stories.external*id` replaces the mockup's fabricated `US-104` code

***Chosen:*** Render `external_id` (real, optional Jira-key column) as a mono chip when present; omit when null. Module renders `modules.path`, not a fabricated `MOD-NNN` code.
***Reasoning:*** ✅ Live-UI-First (Rule #14) — confirmed against `0002`/`0003` that neither table has a sequential short-code column; the mockup's codes are prototype aesthetic only. ❌ Trade-off: rows without a Jira key look slightly less uniform than the mockup — matches how `external_id` is already treated as optional everywhere else in this codebase.

### Decision 6: "So far" elapsed time computed once per render, not live-ticking

***Chosen:*** `in_progress` rows compute elapsed time at fetch/render time, not via Supabase Realtime.
***Reasoning:*** ✅ ADR-0010 scopes Realtime to run/step live-verdict progress (BK-35's use case); a reporting screen refreshed on navigation is a different shape, and `out-of-scope.md` rules out "configurable dashboards" — signals this isn't meant to be live-updating. ❌ Trade-off: elapsed time is stale until next refetch — matches `ProjectRunsReportView`'s own totals, which aren't live either.

---

## Dependencies

- [x] Runs domain ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/37/38) — dev-done, merged to `staging`. No blocker.
- [x] `atcs.user*story*id`/`atcs.module_id` direct FKs (`0004`) — already shipped.
- [ ] None blocking — every table this story reads is already live on `staging` (contrast [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46): also unblocked, but a coordination concern, not a technical dependency — Risk 1).

---

## Risks & Mitigations

***Risk 1 — Shared-screen collision with BK-46 (concurrent sibling, same file family).***

- ***Impact:*** Medium. Both stories may touch `metrics/page.tsx` and `AppSidebar.tsx`'s nav `href`. A Stage 2 that trusts this plan's "page doesn't exist yet" snapshot without re-checking could recreate or overwrite BK-46's work.
- ***Mitigation:**** UI/UX section mandates a live re-check (`ls`, `git branch -r | grep -i metrics`) at Stage 2 start, not just planning time. Component boundaries are explicit (`components/metrics/**` vs `components/coverage/*`) so the section components themselves never collide even if `page.tsx` does.

***Risk 2 — Business-rule interpretation gap:**** ****per-story-scoped verdict vs. whole-run status.***

- ***Impact:*** Medium. `business-rules.md` is ambiguous between "the run's own status" and "the story's own touched-ATC status within that run." This plan chose the story-scoped `run_atcs` rollup as more textually faithful and more correct (one run's Test chain can span multiple stories; the run's coarse status would misattribute an unrelated story's failure) — a genuine judgment call, not mechanical.
- ***Mitigation:*** Documented explicitly in the algorithm; Step 1's correctness test pins exact expected behavior with a fixture run touching 2 stories with different per-story outcomes. Flag for Stage 3 review against the synced ATP.

***Risk 3 — Migration number collision (****`0049`****).***

- ***Impact:*** Low, mechanical, fails loudly at apply time.
- ***Mitigation:*** Re-run the same cross-branch check at Stage 2 start — at least 2 other concurrent tickets ([https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40), [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46)) already claimed numbers in this range the same day.

***Risk 4 —**** `SECURITY DEFINER` ****project-scoping regression (the BK-49 bug class recurring a third time).***

- ***Impact:*** High if it recurs — a real, exploitable cross-tenant leak, already found twice this run ([https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49), [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) Slice 1).
- ***Mitigation:*** Decision 2 designs project-scoping into every CTE from the start, not as a follow-up patch. Step 1's isolation test is a hard DoD item. Stage 3 review must specifically verify every CTE touching `atcs`/`user*stories`/`modules` carries an explicit `project*id`-scoped predicate, not just a top-level membership assert.

---

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| 1. Migration + RPC + isolation/correctness tests | 4h |
| 2. RPC wrapper + error mapping | 1h |
| 3. Pure TS layer (duration/median) | 2h |
| 4. API route + openapi + tests | 2h |
| 5. Page shell + section component + tests | 5h |
| 6. Integration + manual smoke | 2h |
| ***Total**** | ****16h*** |

***Story points:*** not yet estimated in `story.md` (`Story Points: -`) — this 16h forecast is estimation input, not a substitute for planning-poker sizing.

---

## Definition of Done Checklist

- [ ] Code implemented per this plan
- [ ] All 3 ACs passing (recovered / still-failing / never-failed)
- [ ] `recovery-cycle-isolation.test.ts` passing — cross-tenant scoping proven, not assumed (Risk 4)
- [ ] Backend types used correctly — no `any` on the response shape or props
- [ ] Design fidelity: §2.1 tokens reused verbatim; canonical (not drifted) `.dot[data-status="running"]` pulse ported
- [ ] Content: no placeholder copy; the one net-new string (empty-KPI case) is factual
- [ ] Shared-screen coordination re-verified live at Stage 2 start (Risk 1)
- [ ] Unit tests: duration formatter, median function, error mapper (coverage > 80% on `lib/metrics/`)
- [ ] Integration tests: API route 200/404
- [ ] E2E/manual smoke per ATP once synced
- [ ] Code review approved — Risk 4's project-scoping check specifically verified
- [ ] Lint/TypeScript clean (`types:check`, lint) — no local `next build` per Critical Rule #17
- [ ] Deployed to staging; manual smoke (desktop + mobile) confirms mockup fidelity

---

## Review Workload Forecast

Estimated: 2213 additions + 28 deletions/modifications ≈ 2689 total lines (new files ×1.5: migration ~330, `lib/metrics/recovery-cycle.ts` ~135, `lib/metrics/errors.ts` ~60, API route ~165, `route.openapi.ts` ~83, `page.tsx` ~105, `RecoveryCycleSection.tsx` ~480, isolation test ~525, unit tests ~180, component tests ~150; modified ×1.0: `lib/supabase/rpc.ts` ~20, `AppSidebar.tsx` ~3, doc touch-ups ~5; sum ×1.2 buffer = 2689)
400-line budget risk: High
Chain strategy: pending
Decision trace: (empty — per `workload-forecast.md`, a High-risk Stage 1 plan must NOT self-assign a chain strategy or write a trace; stays `pending`/empty until `/git-flow-master`'s chained-PR decision tree resolves it at the Stage 1→2 boundary)
Decided by: n/a (pending — hand off to /git-flow-master §Chained-PR decision tree at Stage 2 start)
Decision needed before apply: Yes

***Context for whoever runs that tree (not a substitute for walking it):**** [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) — the sibling ticket sharing this exact screen — already resolved `feature-branch-chain` (4 slices: DB/RPC, pure view-logic, API route, UI) under the **standing rule* for `avalanche-2026-07` ("PR-per-slice against the integration branch, self-merged, final integration→staging PR through Agent 4" — `escalation-log.md`, [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) ruling, reaffirmed after a near-miss re-litigation on [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) itself). This plan's Steps 1–6 already decompose along the same DB → wrapper/pure-logic → API → UI seams. Whoever resolves this gate should re-derive the decision by reading `escalation-log.md` in full first, not assume the standing rule applies without checking — the [https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46](https://jira.upexgalaxy.com/browse/BK-46#icft=BK-46) near-miss entry is the explicit warning against skipping that check.

---
_Synced from Jira by sync-jira-issues_
