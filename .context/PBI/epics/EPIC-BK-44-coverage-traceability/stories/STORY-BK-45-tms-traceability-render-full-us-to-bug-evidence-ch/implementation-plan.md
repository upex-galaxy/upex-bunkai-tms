# BK-45 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

## Stage 1 — Implementation Plan (BK-45)

This plan does not re-derive the technical decisions already ratified on the
ticket (comments 12171 AI Product Owner, 12176 AI Tech Lead, both 2026-08-05).
It maps those rulings into concrete slices and files.

### ADR-0012 six-question gate (answered here, before any SQL)

1. ***Does this need ****`SECURITY DEFINER`****?*** Yes. `atc*acceptance*criteria` has no

   `project*id`/`workspace*id` column and no RLS-reachable scope path (verified
   by the AI Tech Lead against the live schema), so `SECURITY INVOKER` cannot
   scope the AC-to-ATC join. DEFINER is not a convenience here, it is required.

1. ***Can the identity parameter be deleted instead of guarded?*** No — every

   sibling report RPC (0048/0049/0052) takes an explicit `p*actor*user_id`
   because routes call through `createAdminClient()`, where `auth.uid()` is
   NULL. Deleting the parameter would remove the only actor signal on that
   call path.

1. ***Where does the actor bind sit?*** Step 0, before any table read, raising

   `P0002` on both NULL-mismatch spoof and non-membership (non-disclosure).
   ***Binding project note***: this bind is INERT when the caller uses
   `createAdminClient()` (`auth.uid()` NULL) — the real protection is (4).

1. ***What scopes each returned row?*** Enumerated per row source (story header,

   `crit`, `live*atc`, `pair`, `latest*run`, `chain_bug`) — see the compliance
   table in comment 12176. The `pair` CTE (crit × live_atc) is the load-bearing
   one: it is the only guard against a cross-project ATC entering the chain
   through the unscoped `atc*acceptance*criteria` join table.

1. ***Precedent to copy***: `0048*project*coverage_report.sql`,

   `0049*recovery*cycle*report.sql`, `0052*defect*heatmap*report.sql` — same
   actor-bind shape, same grant/revoke convention, same non-disclosure P0002.

1. ***Known-debt, not fixed here***: the module-cascade archive-orphan hole in

   `bunkai*archive*module_subtree` (0014) and the identical own-state-only
   archived filtering in 0048/0050/0052. Recorded as a follow-up tech story,
   not touched in this slice (0 orphans measured live today).

### Slices (single PR, sequential commits, mirrors BK-46/BK-49 shipping shape)

1. ***DB*** — `supabase/migrations/00NN*story*traceability_report.sql`:

   `bunkai*report*story*traceability(p*actor*user*id, p*user*story_id)
   returns jsonb`, level-wise CTEs (`archived*anc`, `live*atc`, `crit`, `pair`,
   `latest*run`, `chain*bug`), single `select ... into v_result` (EC12 —
   tearing-free by construction under READ COMMITTED; the step-1 scope
   resolution SELECT reads only `user_stories`/`modules`/`projects` for auth,
   never chain data). Plus `bugs*atc*id_idx` partial index. Grants:
   `revoke ... from public, anon; grant ... to authenticated, service_role`.

1. ***Logic*** — `lib/traceability/rpc.ts` (RPC wrapper, mirrors

   `reportProjectCoverage`), `lib/traceability/errors.ts` (P0002 -> 404
   not_found, matching the coverage/recovery-cycle/defect-heatmap precedent —
   AC-05's "403 or equivalent access-denied" is satisfied by the same
   non-disclosure 404 shape already established for every sibling report RPC;
   documented here as the one autonomous UI-shape call this run made), and
   `lib/traceability/chain-view.ts` (pure view-state: derive the `state`
   discriminator is done in SQL per D15, so this file only holds the 6 render
   states' pure classification — empty-state resolution, per-AC uncovered
   check, chip copy lookup by state).

1. ***API*** — `app/api/v1/projects/[id]/traceability/route.ts`, `?story=`

   query param, same `withApiHandler`/`createAdminClient` shape as the
   coverage route.

1. ***UI*** — `app/(app)/projects/[projectSlug]/traceability/page.tsx` (server

   component, session client, mirrors `metrics/page.tsx`'s
   `ProjectCoverageSection` shape) + `components/traceability/TraceabilityChainView.tsx`
   (client component rendering the mockup's AC-card/chain-row grammar) +
   sub-nav entry in `project-sub-nav.tsx` ("Traceability", `BarChart3`-sibling
   icon, `branch`-style icon per the mockup's `i-branch`).

### Scope boundary honored

Filter bar (result/module/date-range), active-filter-summary, and Export
snapshot button are explicitly BK-48/BK-50 and are NOT built. The 6 in-scope
render states: full chain (covered story), partial/mixed (some AC uncovered,
some ATC with no test/run yet), zero-coverage banner (ACs exist, 0 ATCs
anywhere), zero-AC empty state, loading skeleton, error+retry.

***One deliberate, autonomous UI-scope call*** (Rule #18, documented since no PO
ruling covers it): the mockup's story-picker segmented control (4 hardcoded
demo stories) is NOT built. No AC in this story describes browsing/switching
stories from inside the view — every AC scenario begins "the member navigates
to the traceability view for ***that*** user story", i.e. arrival is via deep
link (nav item, or a link from Metrics per the PO's "two entry points"
ruling). Building a live story-search/switcher is unbounded added scope with
no AC coverage. If `?story=` is absent or does not resolve, the page renders
a minimal "select a user story" prompt (not one of the 8 mockup states) with a
link back to the project's Explorer. This can be promoted to a real picker in
a follow-up if product wants in-view switching.

### Test contract (same slice as the migration, DB-integration, real DB)

`lib/traceability/story-traceability-isolation.test.ts`, mirroring
`coverage-isolation.test.ts`'s two-tier env gate:

1. legitimate member reads their own story's chain
2. spoofed `p*actor*user*id` -> P0002 (real login via QA*E2E fixture)
3. story in a foreign workspace -> P0002, zero rows disclosed
4. a ***foreign PROJECT in the same workspace*** — an ATC from a sibling

   project, hand-linked via `atc*acceptance*criteria` to this story's AC —
   never appears (proves the `pair` CTE's scoping independent of the actor
   bind; this is the BK-49-shaped leak the AI Tech Lead named explicitly)

1. archived ATC + ATC under an archived ancestor module, both absent
2. a standalone bug (`atc_id is null`) neither vanishes from nor leaks into

   the chain (it simply never matches `pair`)

1. an ATC bound to 2 ACs on the same story appears under both (no dedupe)
2. in-flight run renders `state: 'in_flight'`, never a stale verdict

### Production-write-path assertion (Gate 3)

`run*atcs` is written by `bunkai*create_run`/finish/abort RPCs (0031/0037/
0036) on every real run — confirmed live path, not just a fixture. `atcs.status`
is confirmed dead (0050 header + grep: no `update public.atcs set status`
outside test fixtures) — the migration's own header records this and the
chain query never reads it.

## Review Workload Forecast

Estimated: ~350 additions (migration ~180, lib ~80, route ~40, page+view
~250, sub-nav +15, tests ~220) = approx 2200 total lines across 9-11 files.
400-line budget risk: Medium
Chain strategy: feature-branch-chain (single PR, sequential slice commits —
matches BK-46/BK-49 shipping shape, not stacked-to-main)
Decision trace: risk assessed Medium (not High) at ~2200 lines across a
bounded, well-precedented file set (1 migration + 2 lib files + 1 route + 1
page + 1 component + 1 sub-nav edit + 1 test file); git-flow-master chained-PR
tree not invoked since risk != High.
Decided by: n/a (risk not High)
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
