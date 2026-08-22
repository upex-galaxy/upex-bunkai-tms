# BK-37 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

# [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) — Spec Implementation Plan (Dev)

***Story:*** TMS-Run History | View a test's past runs, filterable by outcome
***Epic:**** [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) (Manual Execution & Runs) · ****Points:**** 5 · ****Hard blocker:*** [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) ✅ dev-done
***Mockup:*** `.context/designs/bunkai-test-management-tool/bk-30-test-runs-index/test-run-history.html` · spec master-design-plan §4.8
***Authored:*** 2026-07-30

---

## 1. Goal

Give a Test a URL-addressable Run History surface: past terminal Runs newest-first, single-select outcome filter, keyset "load older runs" pagination that stays scoped to the active filter, all-time outcome totals, and two distinct empty states.

## 2. What does not exist yet (the real cost driver)

- ***No GET endpoint lists a Test's Runs.*** `app/api/v1/runs/route.ts` is POST-only; `runs/[id]/route.ts` is single-Run GET-only.
- ***No pagination pattern exists repo-wide.*** Zero `cursor` / `offset` / `before` / `has_more` / `.range()` in `app/`, `lib/`, `components/`. [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) establishes it; [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) reuses it.
- `components/ui/tabs.tsx` exists with ***zero usages*** — this story is its first consumer.

## 3. Locked decisions

### 3.1 From PO (Jira comments, 2026-07-21)

| ***#**** | ****Decision*** |
| --- | --- |
| 1 | History = ***terminal Runs only*** (`passed` / `failed` / `aborted`). A `running` Run never appears. |
| 2 | Page size = ***50***. |
| 3 | Outcome filter ***stays applied across load-older*** — pagination scopes to the filtered set, server-side. |
| 4 | Tie-break for identical timestamps = `id` as secondary sort key. |
| 5 | 0-match filter copy = `No {Outcome} runs found for this Test` (outcome capitalized). |

> ***Copy reconciliation:**** AC scenario "Filter matches zero runs" quotes `"No aborted runs found"` inside the phrase "a distinct ... message is shown". The later PO comment prescribes the literal contract string with an explicit consistency rationale. ****The PO string wins*** → rendered as `No Aborted runs found for this Test`. Recorded here so the Spec Compliance Matrix and any test assertion use one string.

### 3.2 From this planning session (user-ratified, 2026-07-30)

| ***#**** | ****Decision**** | ****Rationale*** |
| --- | --- | --- |
| D-A | ***Sub-route + shared tab strip****: `/projects/{slug}/tests/{testId}/runs`, with a `layout.tsx` hosting the Test header + {{Steps  | Run History}} tabs. | Critical Rule #14 (LIVE-UI-FIRST). §4.8 prescribes "standalone route until a Test-detail screen exists" — that premise is ****stale***: D10 shipped `/projects/{slug}/tests/{testId`} for [https://jira.upexgalaxy.com/browse/BK-32#icft=BK-32](https://jira.upexgalaxy.com/browse/BK-32#icft=BK-32) on 2026-06-19. The live page is the real host. Sub-route (not client-side tabs) keeps the active tab and the outcome filter in the URL → deep-linkable, and directly testable by QA/E2E. |
| D-B | ***All-time totals header IS in scope**** (Passed / Failed / Aborted counts + 4px segmented bar). | Mockup §4.8 fidelity per Critical Rule #15. Costs one `count(**) … group by status` inside the same RPC — no schema change, no extra round-trip. Totals are ***all-time and filter-invariant*** (mockup behavior; BK-38's totals are filter-reactive — deliberate asymmetry, the two screens answer different questions). |
| D-C | ***2 chained PRs*** (backend → frontend). | Forecast is High risk vs the 400-line review budget. Same shape as BK-87's PR1/PR2. |
| D-D | ***Filtering + pagination are server-side.**** | The mockup's JS filters only already-loaded rows and says so in its copy (`3 of 8 loaded runs match`). AC "Filter stays applied across load-more" (60 failed runs → next 10 ****failed**** appended) is only satisfiable server-side. ****AC wins over mockup behavior.*** Empty-state copy therefore drops the mockup's "loaded" qualifier. |
| D-E | Auth = {{{ auth: 'required' }}}, ***no scope requirement*** — mirrors `GET /api/v1/runs/{id`}. | The PAT scope catalog (`lib/api/pat.ts`) is {{atc:read  | atc:write  | run:execute  | workspace:admin}}. There is no read scope for runs, and adding one touches the PAT catalog + BK-88's UI. Out of scope here; follow the sibling read route's precedent. |

### 3.3 Mockup divergences (UI-only, no backend refactor — Rule #15)

| ***Mockup element**** | ****Shipped as**** | ****Why*** |
| --- | --- | --- |
| Test id chip `ATC-118` | ***Omitted*** — render the Test title only | D9 already ratified: Test `code` generation is deferred, schema is title-only. Also `ATC-` is the wrong glossary prefix for a Test. |
| Environment `staging · chromium-126` | `project_environments.name` only (e.g. `staging`) | Schema has no runtime column. Adding one is a backend refactor. |
| `Export CSV` button | ***Omitted*** | `out-of-scope.md`: "Exporting the history". |
| `Overview` tab | ***Omitted*** — tabs are {{Steps  | Run History}} | The live page has no Overview content to route to. Inventing an empty tab is worse UX than two honest ones. |
| Sidebar `Test Runs` active + breadcrumb `… / Test Runs / {test`} | Sidebar stays on the project explorer; breadcrumb stays `Tests / {title`} | Follows from D-A: arrival is via the Test, not via a project-wide run index. |
| Nav badge `472` | live count / hidden | D5 already ratified: badges read live counts. |
| `.chip` / `.kbd` / running-dot pulse geometry | Reuse the ***live*** `.status-chip[data-status]` + `.dot[data-status]` in `app/globals.css` | Rule #14. The mockup and master-design-plan §2.2 disagree on these atoms; the live CSS is the tiebreak. Logged as a design-system question below, not resolved in this story. |

***No ADR required.*** Every decision above is either story-local, already covered by a ratified divergence (D5 / D9 / D10), or a straight application of Critical Rules #14/#15. No cross-cutting invariant is introduced — the RPC follows the established explicit-actor SECURITY DEFINER contract verbatim.

## 4. API contract

```
GET /api/v1/tests/{id}/runs?outcome=passed|failed|aborted&limit=50&cursor=<opaque>
```

Response `200`:

```
{
  "items": [
    {
      "id": "uuid",
      "status": "failed",                 // terminal only
      "environment_id": "uuid",
      "environment_name": "staging",
      "executor_mode": "ci",              // human | agent | ci
      "started_at": "2026-07-29T11:52:00Z",
      "finished_at": "2026-07-29T11:55:41Z"
    }
  ],
  "totals": { "passed": 8, "failed": 3, "aborted": 2 },  // all-time, filter-invariant
  "next_cursor": "…" | null
}
```

Errors use the existing {{{ error: { code, message, … } }}} envelope via `withApiHandler` + `mapRunRpcError`. A Test the caller cannot see collapses into the same non-disclosing `404` the sibling reads use (INV-3).

***Pagination = keyset on*** `(started*at desc, id desc)` — not offset. Rationale: runs are append-heavy, so offset paging would skip/duplicate rows when a new run lands mid-scroll; keyset is stable and matches the existing `runs*test*id*started*at*idx`. Cursor is an opaque base64 of `${started_at}|${id`}, decoded and validated server-side; a malformed cursor is a `400`, never a silent full-list.

***Duration*** is not returned — `started*at` + `finished*at` are, and a pure `formatRunDuration()` helper renders `3m 41s`. Keeps formatting unit-testable and out of SQL.

## 5. Task breakdown

### PR1 — Backend (`feat/BK-37-runs-history-api`, base `staging`)

| ***#**** | ****File**** | ****Work**** | ****Verify*** |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/0038*run*history.sql` | `bunkai*list*test*runs(p*actor*user*id, p*test*id, p*outcome, p*limit, p*cursor*started*at, p*cursor*id)` SECURITY DEFINER → jsonb `{items, totals, next*cursor`}. Gates active workspace membership (any role), excludes `status='running'`, clamps limit 1..50, fetches limit+1 to derive `next*cursor`, tuple keyset predicate, joins `project*environments.name`. Adds `runs*test*id*status*started*at*idx (test*id, status, started*at desc, id desc)` for the filtered path. | migration applies clean; RPC returns expected shape |
| 2 | `lib/runs/history-validation.ts` + `.test.ts` | Zod query schema + `parseRunHistoryParams(URLSearchParams)` mirroring `parseAtcSearchParams`; `encodeRunCursor` / `decodeRunCursor`. | `bun test` green |
| 3 | `lib/runs/duration.ts` + `.test.ts` | Pure `formatRunDuration(startedAt, finishedAt)` → `"3m 41s"` / `"12s"` / `null`. | `bun test` green |
| 4 | `lib/supabase/rpc.ts` | `listTestRuns()` wrapper, explicit-actor contract, doc comment in the house style. | types clean |
| 5 | `app/api/v1/tests/[id]/runs/route.ts` | `GET` via `withApiHandler(…, { auth: 'required' })`; uuid path guard; parse params; call RPC via admin client; `mapRunRpcError`. | manual curl |
| 6 | `app/api/v1/tests/[id]/runs/route.openapi.ts` + import line in `scripts/openapi-gen.ts` | Register the path; reuse `RunSchema` shape where it fits. | `bun run openapi:gen`, commit `public/openapi.json` |
| 7 | `lib/runs/history-isolation.test.ts` | Env-gated `describeOrSkip` integration suite (clone `lib/tests/read-isolation.test.ts`): workspace isolation, terminal-only exclusion, newest-first ordering, keyset continuity across pages, filter+pagination composition, totals correctness. Purges its rows in `afterAll`. | `bun test` green (or skipped without env) |

### PR2 — Frontend (`feat/BK-37-runs-history-ui`, base = PR1 branch)

| ***#**** | ****File**** | ****Work**** | ****Verify*** |
| --- | --- | --- | --- |
| 8 | `lib/tests/load-test-detail.ts` | React `cache()`-wrapped loader (auth + active workspace + `getTestExpanded` + role + project envs) so `layout.tsx` and `page.tsx` share ***one*** RPC call per request. | types clean; no duplicate RPC in logs |
| 9 | `app/(app)/projects/[projectSlug]/tests/[testId]/layout.tsx` | NEW. Header (back link, breadcrumb `Tests / {title`}, `StartRunButton`, ATC-count chip) moved here + `<TestDetailTabs>`. | live UI |
| 10 | `app/(app)/projects/[projectSlug]/tests/[testId]/page.tsx` | Header removed (now in layout); keeps tags row + ATC chain. ***Surgical*** — no behavior change to [https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27](https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27)/28/32/33. | live UI: Steps tab identical to today |
| 11 | `components/tests/TestDetailTabs.tsx` | `'use client'` tab strip, `Link` + `usePathname`, `aria-current="page"`, `data-testid="test-tabs"` / `test-tab-steps` / `test-tab-runs`. | keyboard nav + focus ring |
| 12 | `app/(app)/projects/[projectSlug]/tests/[testId]/runs/page.tsx` | Server page: auth + first page fetch (respects `?outcome=` search param) → `<RunHistoryView>`. | live UI |
| 13 | `lib/runs/history-view.ts` + `.test.ts` | Pure `resolveRunHistoryViewState({ error, rowCount, outcome })` → {{error  | empty-never-run  | empty-no-match  | rows}}, mirroring `resolveWorkspacesViewState`. Owns both empty-state strings. | `bun test` green |
| 14 | `components/runs/RunHistoryView.tsx` | `'use client'`. Totals header + segmented bar; segmented outcome filter (click-again clears, `aria-pressed`, `Clear filter`); 6-column table (Run · Environment · Executor · Outcome · Duration · Ran); `Load older runs`; foot count; three exclusive state blocks + skeleton. Outcome chips reuse live `.status-chip[data-status]` (`passed→pass`, `failed→fail`, `aborted→blocked` per §4.8). Filter/cursor changes drive `router.replace` on the URL, `fetch` with `AbortController`. | live UI + a11y |

`data-testid` ***convention*** — kebab-case `<feature>-<element>` on the root and every asserted child (shipped repo convention, which beats the skill doc's camelCase template):
`run-history-view`, `run-history-skeleton`, `run-history-error`, `run-history-empty`, `run-history-no-match`, `run-history-rows`, `run-history-row-${runId`}, `run-history-filter`, `run-history-filter-${outcome`}, `run-history-clear-filter`, `run-history-load-older`, `run-history-foot`, `run-history-total-${outcome`}.

## 6. AC → task mapping

| ***AC scenario**** | ****Tasks*** |
| --- | --- |
| View a Test's runs newest first | 1, 5, 12, 14 |
| Filter history to failed runs only | 1, 2, 5, 14 |
| Filter matches zero runs | 1, 13, 14 |
| A Test that has never been run | 1, 13, 14 |
| In-progress runs excluded from history | 1, 7 |
| Load older runs beyond the first page | 1, 2, 5, 14 |
| Filter stays applied across load-more | 1, 2, 5, 7, 14 |
| Clearing the filter restores the full list | 1, 14 |
| Boundary: exactly 50 runs → no load-more | 1, 7 |
| Boundary: 51 runs → load-more appends exactly 1 | 1, 7 |
| Tie-break: identical `started_at` | 1, 7 |

## 7. Live-UI validation (mandatory — UI story)

`[AUTOMATION_TOOL]` against the running dev server (`bun run dev`, never a production build), credentials from `.env`. Per-screen pass covering: default list, filtered, 0-match, never-run, load-older append, clear-filter, skeleton, responsive, `:focus-visible` on the segmented filter and tabs, and that the ***Steps tab is visually unchanged*** from today.

## 8. Risks

| ***#**** | ****Risk**** | ****Mitigation*** |
| --- | --- | --- |
| 1 | Moving the header into `layout.tsx` regresses [https://jira.upexgalaxy.com/browse/BK-32#icft=BK-32](https://jira.upexgalaxy.com/browse/BK-32#icft=BK-32)/33's Test detail | Task 8's cached loader keeps one RPC; live-UI pass explicitly diffs the Steps tab against current |
| 2 | Keyset cursor drifts if a new run lands mid-scroll | Tuple predicate on `(started_at, id)` is monotonic for terminal rows; new runs start `running` and are excluded |
| 3 | FE/BE page-size mismatch | Single constant exported from `lib/runs/history-validation.ts`, imported by both |
| 4 | [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) diverges from this pagination pattern | PO flagged the sync; PR1 lands the reusable pattern first, and its OpenAPI entry is the contract [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) reads |

## 9. Open design-system question (not blocking, for the PM/design track)

master-design-plan §2.2's canonical atoms (`.status-chip` 18px/10.5px/colored border, `.kbd`, running-dot ring pulse) disagree with this Open Design mockup's (`.chip` 11.5px/transparent border, opacity pulse). §2.2 itself carries an unresolved "port mockup atoms as literal CSS vs map to components" note that §5 never recorded. ***This story follows the live CSS per Rule #14*** and does not resolve the conflict. Worth a design tech-story.

## Review Workload Forecast

Estimated: 520 additions + 130 deletions = 650 total lines
400-line budget risk: High
Chain strategy: feature-branch-chain (PR1 backend ~320 · PR2 frontend ~330, PR2 based on PR1)
Decision needed before apply: No — ratified 2026-07-30 (decision D-C)

---
_Synced from Jira by sync-jira-issues_
