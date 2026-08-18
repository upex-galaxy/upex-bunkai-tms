# BK-256 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-256)

# BK-256 — Implementation Plan (Dev)

## Goal

Home's "Active test runs" widget: a workspace-wide table of the runs currently in progress, a count of them, and a one-click resume for the most recently started one. Renders into `app/(app)/home/page.tsx` below the welcome banner (master-design-plan §4.2, `home.jsx`'s "Active runs" section).

## Technical Decisions

### D1 — "Active" means `runs.status = 'running'`, and that is the same set the banner counts

The Business Rule says a run is active while ***Running or Blocked****, and that Finished and Aborted are excluded. The schema (`0031*runs.sql`) constrains `runs.status` to `running | passed | failed | aborted` — there is ****no*** `blocked` run status. `blocked` exists one level down, on `run*steps.status` / `run_atcs.status`.

In this data model a blocked run has not terminated: it is still `status = 'running'`. So "Running or Blocked, excluding Finished and Aborted" resolves to exactly `status = 'running'` — the same predicate `WelcomeSummary` (BK-255) already counts. The banner's "N runs currently executing" and this widget's "· N" are therefore the same number by construction, not by coincidence. No divergence to ratify.

### D2 — "Blocked" is derived per row, from the run's steps

The BR's second half still has to mean something on screen, and the user story asks to "spot stalled or blocked runs". A displayed run whose steps include at least one `blocked` step renders a ***Blocked**** chip; otherwise ****Running***. This is a presentation sub-state of one and the same active set, so it changes no count.

Chip grammar is reused verbatim from the live app: `.status-chip[data-status]` + `.dot[data-status]` in `app/globals.css`, `blocked` and `running` tokens. Per §4.8, `blocked` is the amber signal family (`--blocked`), and status always carries its text label — never colour alone.

### D3 — A new workspace-level endpoint, `GET /api/v1/workspaces/{id}/active-runs`

Per the ratified data decision, workspace-wide aggregates get their own endpoint and enter the OpenAPI contract. Only project-scoped run reads exist today (`/api/v1/projects/{id}/runs/report`), and none of them span the workspace. The rollup lives in `lib/home/active-runs.ts` and is shared byte-for-byte by the endpoint and the Home server component, exactly as `lib/home/recent-projects.ts` (BK-257) is — so the widget and the API cannot drift.

Scope gate: `run:execute` is the only run-shaped PAT capability in `ALL_CAPABILITIES`, and it is a WRITE scope; gating a read behind it would be wrong. This endpoint carries project names, run ids and executor identities, so it is gated on `atc:read` — the same floor `/api/v1/workspaces/{id}/recent-projects` uses for the same class of workspace inventory data. Cookie sessions hold every capability, so this constrains PATs only.

### D4 — Executor identity reuses `bunkai*resolve*activity_actors`; no new RPC

`workspace*members` carries no email — identities live in `auth.users`, reachable only through a `SECURITY DEFINER` function. Rather than write a second one, the widget reuses the existing `bunkai*resolve*activity*actors` (0045, scoped correctly in 0047). Its provenance guarantee holds exactly here: `bunkai*create*run` writes `executor*user*id = p*actor*user*id` AND emits a `run.started` activity row with `actor*user*id = p*actor*user*id`, so every executor of a run in this workspace is by construction an actor on this workspace's `activity_log`. Unresolvable executors fall back through `resolveActorLabel` — the same neutral copy `/activity` uses. ***No migration in this story.***

### D5 — Progress is read from `run_steps`, not from a column

There is no progress column. `run*steps` hangs off `run*atcs`, which hangs off `runs`, so the rollup does two batched `.in()` reads (run*atcs by run id, run*steps by run_atc id) for the page's runs only. Cost is bounded by the widget's page size (5 runs), not by workspace size, and the id lists are batched at 100 for the same URL-length reason `recent-projects.ts` documents. Done = steps not `pending`; the segmented bar splits that into passed / failed / blocked.

### D6 — "Most recently active" is `started_at desc`

`runs.updated*at` does NOT advance when a step is marked (`bunkai*mark*run*step` writes `run*steps`/`run*atcs` and takes a lock on `runs` but never UPDATEs it — already documented in `lib/home/recent-projects.ts`). For an in-progress run `started_at` is therefore the only honest recency signal. Table order and the Resume target both use it.

### D7 — Divergences from the mockup, all deliberate

- The mockup's row overflow (`Icon.More`) is dropped: there is no per-run menu in the live app, and a menu with nothing in it is a dead affordance.
- The mockup lists a `fail`-status row in its active table. A failed run is finished, which the BR excludes — not reproduced.
- Run identifiers render as the first 8 characters of the uuid in mono, matching `ProjectRunsReportView`; this product has no `RUN-1839` display code.
- Started time renders as absolute UTC `YYYY-MM-DD HH:MM`, matching `/activity`, run history and BK-257 — not "24m ago".
- "All runs" has no workspace-wide runs index to point at, so the header keeps only the Resume action.

## Steps

1. `lib/home/constants.ts` — add `HOME*ACTIVE*RUNS*LIMIT`, `HOME*RUN*STEP*SCAN_LIMIT`.
2. `lib/home/active-runs.ts` — `listActiveRuns(db, { workspaceId, limit })`; returns `{ ok: true, runs, activeCount }` or `{ ok: false }`. A failed read is never an empty list.
3. `app/api/v1/workspaces/[id]/active-runs/route.ts` + `route.openapi.ts`; register in `scripts/openapi-gen.ts`; regenerate `public/openapi.json`.
4. `components/home/ActiveRuns.tsx` — card, table, empty state, error state, skeleton; reuses the live status-chip/dot grammar and the executor-mode icon set.
5. `app/(app)/home/page.tsx` — compose in its own `<Suspense>` boundary, above Recent projects.
6. Verify: `bun run types:check`, `bun run lint:check`, plus the existing `lib/home` and `lib/runs` tests.

## AC → step map

| AC | Where |
| --- | --- |
| Table of every in-progress run across projects, with run id / project / mode / status / progress / executor | steps 2, 4 |
| Empty state when nothing is running | step 4 (`ActiveRunsCard` empty branch) |
| Resume the most recently active run from Home | step 4 (header action → `/projects/{slug}/runs/{id}`) |

## Review Workload Forecast

Estimated: 620 additions + 5 deletions = 625 total lines (excluding the regenerated `public/openapi.json`)
400-line budget risk: High
Chain strategy: size-exception
Decision trace: Q1=No (new rollup logic, a new endpoint and a new component — not a rename, formatter run or vendor bump) · Q2=Yes (it would split cleanly at data/API vs UI, each slice under 400 lines and safe on `staging` alone) → stacked-to-main, OVERRIDDEN by the explicit operator directive for this wave ("open ONE pull request containing the whole story; do NOT split by layer"), which is the user override the tree requires for size-exception · Q3=n/a → size-exception
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md), with the recorded user override
Why size-exception: the only available split is the layer split the operator explicitly forbade for this wave; a half-story PR (endpoint with no widget) would ship a contract nothing consumes.
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
