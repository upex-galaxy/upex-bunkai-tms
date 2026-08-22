# BK-35 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-35)

# Implementation Plan: STORY-BK-35 - TMS-Run Execution | Mark each step pass, fail, or block

## Overview

Add the write path: an engineer marks any step `passed`/`failed`/`blocked` (optional note + evidence link), the parent ATC verdict derives from its steps, run progress advances, and a second viewer on the same Run sees both live via Supabase Realtime (ADR-0010). Guards a closed Run (finished/aborted) against new results; re-marking a step is last-write-wins. Out of scope: start/abort/finish a Run ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/36/39), file/list defects (BK-40+).

## Open Questions Reconciliation (Q1-Q8 + ATP gaps)

| ***#**** | ****Question**** | ****Status**** | ****Resolution*** |
| --- | --- | --- | --- |
| Q1 | ATC verdict while steps pending | Already resolved | Benjamin, 2026-07-13 08:54: verdict stays "unrun" until every step in the ATC resolves; computed once the last pending step is marked. `acceptance-criteria.md`'s "Open Gaps"/AC2 warning are stale (never updated to reflect this) — noted, not treated as still-open. |
| Q2 | Guard error copy | New decision | `workflow.md`: "rejected with a message that the run is closed." Mirrors `errors.ts`'s frozen `abort`/`finish` template: ***"This run is already closed and cannot accept new step results."*** |
| Q3 | 100% auto-triggers finish? | Resolved as scope boundary | Benjamin: "not blocking, flagging for [https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39](https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39)." `out-of-scope.md`: finishing is BK-024/[https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39](https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39). [https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) advances progress only, never calls finish. |
| Q4 | Authorization | New decision, grounded in precedent | Verified live: `run*steps*insert*workspace*role*member*plus`/`run*atcs*insert*workspace*role*member*plus` (0031) gate on `bunkai*can*write*workspace` = `role in (member,admin,owner)` (0005*rls_helpers.sql:48) — same gate [https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36](https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36)/39 use (`run:execute` scope, `lib/api/principal.ts:31`) and the same list `runs/[runId]/page.tsx:61` already derives `canAbort`/`canFinish` from. Reused as-is. |
| Q5 | Realtime transport | Already resolved | ADR-0010 — Supabase Realtime, Proposed, non-blocking. |
| Q6 | Endpoint shape | This plan's job | `POST /api/v1/runs/{runId}/steps/{stepId}/mark`. |
| Q7 | UPDATE vs append-only | New decision | `run*steps` (0031) columns `status`/`note`/`evidence*url`/`executed_at` are commented `-- BK-35 will write`, single row per step, no history table. Business rule: "most recent result stands." UPDATE-in-place. |
| Q8 | Evidence: URL vs upload | Already resolved | `out-of-scope.md`: "a link is attached, not a file upload." `evidence_url` text column exists. |
| ATP | Reject non-member | Covered by Q4 | Same gate, no extra logic. |
| ATP | Reject invalid URL | New decision | Zod `.url()`, 422. Standard validation, not a product ambiguity. |
| ATP | Empty-string evidence link | New decision | Normalize to `null` (not reject) — matches AC1 Scenario 1.2 ("null/empty"); the outline's own title reads self-contradictory, AC1.2 is the tie-break. |
| ATP | Reject re-mark to pending | New decision | Trivially satisfied: only `passed`/`failed`/`blocked` are ever accepted values; `pending` is never an option. |
| ATP | Max note length | New decision, default not researched | No existing length-CHECK precedent in the Runs domain (`content`/`expected`/`test_title` all uncapped). Generic ***2000 chars***, Zod-only, called out as a default. |
| ATP | [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) data contract | Out of scope | `out-of-scope.md`: filing a bug is [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40). [https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) exposes step data in the existing `bunkai*run*json` shape; [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) designs its own consumption. |

No item reached genuine irreducible ambiguity — each resolved via an existing comment, an ADR, a scope field, or a verified precedent. Confirms the orchestrator's prior assessment.

## Schema audit findings

Read `0031*runs.sql`, `0036*run*abort.sql`, `0037*run*finish.sql`, `0040*run*module*snapshot.sql`, `RunnerView.tsx`, `runs/[runId]/page.tsx` in full.

1. `run*steps` ***already has every column needed*** (`status`, `note`, `evidence*url`, `executed_at`, each commented `-- BK-35 will write`). No column migration.
2. ***No**** `runs.progress` ****column, none needed.**** `RunnerView.tsx:143-150` (already shipped, [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)) computes `pct = done/total**100` client-side, `done` = any non-`pending` step. Generic enough already — zero changes required; satisfies AC3 verbatim.
3. `run*steps` ***has no**** `run*id` ****column*** — only `run*atc*id` (FK to `run*atcs`, which has `run*id`). ADR-0010's illustrative filter `run*id=eq.<id>` on `run*steps` cannot work as written — Realtime `postgres_changes` filters are single-column predicates on the SUBSCRIBED table. See D8/R-2 for the corrected shape.

Already available: `runs.status` for the closed-run guard, `run_atcs.status` enum for the verdict column (no enum change, D1), `run:execute` scope, and the abort/finish RPCs' lock+audit pattern to mirror.

## Technical Approach

One new SECURITY DEFINER RPC, `bunkai*mark*run*step`, mirrors `bunkai*abort*run`/`bunkai*finish*run` in shape (explicit-actor contract, `FOR UPDATE` on `runs`, member+ gate, status-driven guard, `activity*log` audit, `bunkai*run*json` return — unchanged, finding 1) but scoped to one `run*steps` row + a conditional `run*atcs.status` recompute, not a whole-run sweep.

***Verdict derivation*** (AC2's 8 combinations) is computed in SQL, not duplicated as TS — same reasoning BK-38's plan gave for its totals computation ("this repo's established convention for RPC business logic is a DB-integration guard against the live RPC ... not a mocked unit test"). No RPC-owned business logic anywhere in this codebase has a shadow TS re-implementation. See D9 — the Stage 1 briefing suggested mirroring `duration.ts` for this; not followed, reasoning stated.

***Realtime*** (AC4/ADR-0010) subscribes on one channel to `run*atcs` (`run*id=eq.<runId>`, a real column) and `run*steps` (`run*atc*id=in.(<this run's atc ids>)`, since `run*id` doesn't exist there). Any matching event triggers a full reconciliation refetch of `GET /api/v1/runs/{id`} rather than merging partial payloads. Supabase's realtime-js re-fires `SUBSCRIBED` on every reconnect, so binding refetch to that status serves BOTH live-update and ADR-0010's reconnect-reconciliation ask with one code path.

***Alternatives considered***: a maintained `runs.progress` column — rejected, finding 2 shows it's already solved client-side. Realtime payload merging — rejected, two tables' partial payloads would need merging per mark; a refetch is simpler and can't drift. Unfiltered `run_steps` subscription with client-side discard — kept as documented fallback (R-2) if `in.()` filter support proves unavailable.

## DB Tasks

### DB-1 — Migration `0042*run*step_mark.sql`

New RPC `bunkai*mark*run*step(p*actor*user*id, p*run*id, p*run*step*id, p*status, p*note, p*evidence*url) returns jsonb`. Order (mirrors `bunkai*abort_run`):

1. Resolve step → `run*atc*id` → `run*atcs.run*id` → `runs.workspace*id`/`status` under `FOR UPDATE` on `runs` (serializes concurrent marks + the abort/finish race the ATP names). Missing step, or its `run*atcs.run*id <> p*run*id` → `run*step*not*found` (`P0002`, non-disclosure, matches `run*not*found` convention).
2. AuthZ: `bunkai*assert*actor*can*write_workspace` → `42501` (Q4).
3. `v*run*status <> 'running'` → new SQLSTATE `45212` `run*step*marking_closed` (Q2). Precedes the value backstop, mirrors abort/finish ordering.
4. `p*status not in ('passed','failed','blocked')` → new SQLSTATE `45213` `step*status_invalid` (422). `pending` never accepted.
5. Normalize: `nullif(btrim(coalesce(p*note,'')),'')` / same for evidence*url (Q8/empty-to-null).
6. `update run*steps set status=p*status, note=v*note, evidence*url=v*evidence*url, executed*at=now() where id=p*run*step*id`.
7. Recompute parent `run_atcs.status` (D1): any sibling step still `pending` → stays `pending`. Else: `failed` if any failed, else `blocked` if any blocked, else `passed` (AC2's table).
8. Audit: `activity*log`, `entity*type='run*step'`, `action='run*step.marked'`, payload `{run*atc*id, status, previous_status`}.
9. Return `bunkai*run*json(v*run*id)` — unchanged (finding 1).

No `bunkai*run*json` or RLS change. `revoke...grant` per established pattern.

### DB-2 — Migration `0043*run*realtime_replication.sql`

```sql
alter publication supabase*realtime add table public.run*atcs;
alter publication supabase*realtime add table public.run*steps;
```

`runs` deliberately excluded — [https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) never mutates a `runs` row. Default `REPLICA IDENTITY` (PK) suffices; NEW row values are always included regardless. Split from DB-1 for independent review, mirrors BK-38's DB-1/DB-2 split.

## API Tasks

***API-1*** `lib/runs/validation.ts` (modify): add `RUN*STEP*STATUSES = ['passed','failed','blocked']`, `RUN*STEP*NOTE*MAX = 2000`, `RUN*STEP*EVIDENCE*URL*MAX = 2000`, `RunStepMarkBodySchema` (status enum + optional note/evidence*url, empty-string→null preprocess, `.url()` on evidence). No AC freezes copy for malformed bodies here (unlike Q2) — generic ZodError envelope is fine.

***API-2*** `lib/runs/errors.ts` (modify): add `'45212'` → 409 `conflict`, Q2's frozen copy; `'45213'` → 422 `validation*failed`, "Status must be one of passed, failed, or blocked."; reuse the existing `'P0002'` case for `run*step*not*found` (same 404 shape).

***API-3*** `lib/supabase/rpc.ts` (modify): add `markRunStep(supabase, {actorUserId, runId, stepId, status, note, evidenceUrl})` wrapping `bunkai*mark*run_step`, mirrors `abortRun`/`finishRun`.

***API-4*** `app/api/v1/runs/[id]/steps/[stepId]/mark/route.ts` + `.openapi.ts` (new): `POST .../mark` (Q6). Mirrors `abort/route.ts` exactly: extract both ids (`segments.at(-4)`=runId, `segments.at(-2)`=stepId), UUID validation, `getAuth`, `safeParse`, `markRunStep` via admin client, `mapRunRpcError`, `jsonResponse({run: data}, {status:200})`. Auth: `{auth:'required', requires:['run:execute']`}. openapi sibling mirrors `abort/route.openapi.ts` with two path params.

## Realtime Tasks

***RT-1*** `lib/runs/realtime-run-channel.ts` (new): pure logic, mirrors `duration.ts`'s co-located-test shape (the seam ADR-0010 asks for). `buildRunChannelConfig(run)` → pure function returning the two-binding config (D8) — testable, including the single-ATC edge case. `createRefetchScheduler(refetch, debounceMs=250)` → coalesces near-simultaneous trigger calls (one mark can touch both tables in one transaction, firing two events within ms) into one refetch; pure state machine, testable with fake timers.

***RT-2*** `RunnerView.tsx` (modify — wiring): `useEffect` on `[view.id]` (atc-id list is fixed for a Run's lifetime — `run_atcs` rows are only ever created once) builds the config, opens `supabase.channel(...)` on the BROWSER client (`lib/supabase/client.ts`, RLS-scoped — never admin, mirrors `principal.db`'s contract), binds both listeners to the scheduler's `trigger()`, ALSO triggers once on the channel's `SUBSCRIBED` status (serves both initial reconciliation and ADR-0010's reconnect requirement — one path, two jobs), refetch does `fetch('/api/v1/runs/{id}')` → `setView(...)`, cleans up on unmount. Only subscribes while `view.status === 'running'`.

## UI Tasks

***UI-1*** Per-step mark controls, `RunnerView.tsx` (modify): per Critical Rule #14, extends the LIVE flat checklist (lines 425-482, [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)) rather than the mockup's single-active-step wizard (see D-UI-1). Each step `<li>` gains three toggle buttons (Pass/Fail/Block, mirrors the Finish modal's `aria-pressed` pattern already in this file), always enabled regardless of current status (AC6/Q7; "reject re-mark to pending" is structural, not an extra guard). Clicking opens an inline note/evidence form (mirrors the abort textarea styling) with Confirm/Cancel. On submit: `POST .../mark`, `setView(body.run)` on success (mirrors `handleAbort`/`handleFinish`) — this covers the acting user's own tab instantly; the realtime refetch (RT-2) is what updates a SECOND viewer's tab (AC4). Rendered only when `canMark` (Q4 role) AND `view.status === 'running'`; otherwise unchanged read-only rendering.

***UI-2*** `runs/[runId]/page.tsx` (modify): add `canMark={canManageRun`} alongside existing `canAbort`/`canFinish` — reuses the same `memberRow` role query already on the page (line 61). Only change to this file.

## Unit Test Authoring Gate

| ***Unit**** | ****Lives in**** | ****Test file**** | ****Notes*** |
| --- | --- | --- | --- |
| Verdict derivation (8 combos), Q1 pending-state, last-write-wins (AC6), closed-run guard (AC5), authz (Q4) | SQL, `bunkai*mark*run_step` | `lib/runs/mark-step.test.ts` (new, DB-integration, `describe.skip` when env absent, mirrors `start-run.test.ts`) | Not TS — see D9. Matches BK-38's own stated precedent for RPC business logic. |
| Realtime channel config + refetch coalescing | TS, `realtime-run-channel.ts` | `realtime-run-channel.test.ts` (new) | New pure-function unit, mirrors `duration.ts` exactly — the seam ADR-0010 asks for. |
| Progress % (AC3) | TS, `RunnerView.tsx` ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34), unchanged) | none added | Not new logic (finding 2) — pre-existing, generic, needs no modification. |
| Mark-body validation | TS, `validation.ts` | existing `validation.test.ts` (modify, add cases) | Genuine pure-function unit, same file [https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36](https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36)/39's schemas live in. |

***Reconciliation with the briefing***: it suggested mirroring `duration.ts` for BOTH verdict-derivation and progress-calc. Progress needed zero new code (finding 2). Verdict-derivation stays SQL + DB-integration test per this repo's own stated precedent ([https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38)) — a considered departure, not a silent override.

## Technical Decisions

- ***D1***: `run_atcs.status='pending'` IS the PO's "unrun" state — no new enum value, no schema change.
- ***D2***: Q2 frozen copy — "This run is already closed and cannot accept new step results." (follows the abort/finish template).
- ***D3***: Q4 — reuse `run:execute`/member+ verbatim, no new tier or scope.
- ***D4***: Q6 — `POST /api/v1/runs/{runId}/steps/{stepId}/mark`, verb-suffix naming matches abort/finish taste.
- ***D5***: Q7 — UPDATE-in-place, no history table (schema + business rule both point here).
- ***D6***: Progress is 100% client-derived, pre-existing [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) code — no server storage/computation.
- ***D7***: Note/evidence*url validated ONLY at Zod — unlike `abort*reason`, these columns carry no state-machine invariant to protect at the DB level (precedent: `content`/`expected`/`test_title` also uncapped).
- ***D8***: Realtime filter corrects ADR-0010's illustrative example — `run*atcs` on `run*id`, `run*steps` on `run*atc_id=in.(...)` (finding 3). Both trigger the same refetch handler, which doubles as reconnect-reconciliation.
- ***D9***: Verdict derivation stays SQL, not TS — sole consumer is the RPC itself (no client-side optimistic compute — the mark response already returns the server-computed verdict), matches BK-38's stated precedent, and a duplicated TS copy would be an unwatched second source of truth.

## Divergence candidates (flag, do not resolve here)

- ***D-UI-1***: `master-design-plan.md` §4.5 (`run.jsx`) describes a single-active-step wizard with a left Test Outline sidebar; the LIVE `RunnerView.tsx` renders the full checklist flat. Per Rule #14, UI-1 extends the live pattern instead of rebuilding as a wizard — a presentational, non-architectural divergence, ratified here per Rule #15. Mockup's keyboard shortcuts (P/F/B, cmd+enter, cmd+B) have no AC/DoD backing — not planned, fair game as a follow-up.
- ***D-UI-2***: §4.5's tracked status ("0%, build from scratch... Impl: none") is stale — contradicted by the already-substantial live `RunnerView.tsx` ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/36/39). Flagged for a future `/design-system` or `/sync-ai-memory` pass; non-blocking.
- ***D-UI-3***: Report-bug drawer (mockup) is [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) territory, not touched here.

## Dependencies

- [x] [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) — `runs`/`run*atcs`/`run*steps` schema, `bunkai*create*run`, base `RunnerView.tsx` confirmed present by direct read.
- [x] [https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36](https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36)/[https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39](https://jira.upexgalaxy.com/browse/BK-39#icft=BK-39) — `bunkai*abort*run`/`bunkai*finish*run`, their routes and modal UI confirmed present by direct read — the patterns this plan mirrors throughout.
- [x] ADR-0010 — Proposed, non-blocking per its own text and the 2026-07-31 comment.
- [~] Mockup `run.jsx` — exists, tracked status stale (D-UI-2), adapted per Rule #14 (D-UI-1).
- [ ] None blocking.

## Risks & Mitigations

- ***R-1*** First-ever Realtime usage, no existing test/mocking pattern. Impact: Medium (a live-push bug only shows with two sessions). Mitigation: RT-1's pure config/scheduler give the first testable seam; actual live push verified only at Stage 3's two-session live-UI pass.
- ***R-2*** `run*steps` has no `run*id` — a naive ADR-literal filter silently matches nothing. Impact: Medium (fails silent, confusing to diagnose). Mitigation: D8's corrected two-binding shape specified explicitly here. Fallback if `in.()` unsupported: unfiltered `run_steps` subscription + client-side discard.
- ***R-3*** Concurrent marks on two different steps of the same ATC could race the verdict recompute. Impact: Low-Medium. Mitigation: `FOR UPDATE` on `runs` serializes all marks against the same run (same strategy as abort/finish).
- ***R-4*** `RunnerView.tsx` is already 694 lines; this adds a sizeable increment. Impact: Low (maintainability only). Mitigation: none imposed — Stage 2 may extract `StepMarkControls.tsx` if warranted, a judgment call.
- ***R-5*** Realtime's RLS-scoping is asserted by ADR-0010 but empirically unverified (first use). Impact: Medium (a scoping miss is a data-exposure risk, not just a bug). Mitigation: Stage 2's live-UI pass MUST verify a non-member session receives zero events for a workspace it can't see, before AC4 is called done.

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| DB-1 (`0042` RPC) | 3h |
| DB-2 (`0043` Realtime publication) | 0.5h |
| API-1..4 | 2.5h |
| RT-1 (pure logic + tests) | 2h |
| RT-2 (wiring) | 2h |
| UI-1 (mark controls) | 4h |
| UI-2 (page prop) | 0.25h |
| `mark-step.test.ts` | 2.5h |
| Live-UI pass (incl. two-session realtime check) | 2h |
| ***Total**** | ****~19h*** |

***Story points***: 8 (matches `story.md`'s current provisional estimate; the 8→13 SP question is explicitly non-blocking per the 2026-07-31 comment, left for whoever owns estimation).

## Definition of Done Checklist

- [ ] Migrations `0042` + `0043` applied
- [ ] All DoD items pass: mark any step, optional note+evidence, ATC verdict rollup, progress advance, live update for a second viewer, closed-run guard, last-write-wins
- [ ] `mark-step.test.ts` green (8 verdict combos, Q1 pending-state, AC6 re-mark, AC5 guard, Q4 authz, not-found)
- [ ] `realtime-run-channel.test.ts` green
- [ ] `validation.test.ts` green (new mark-body cases)
- [ ] Lint + typecheck + existing suite green (verification cap=3)
- [ ] Live-UI pass: mark pass/fail/block, re-mark, closed-run guard copy, TWO browser sessions to verify AC4's live push (R-1/R-5)
- [ ] Divergences D-UI-1/2/3 carried into the PR description
- [ ] Code review approved
- [ ] Deployed to staging; smoke test confirms a second session sees a live update

---

## Review Workload Forecast

Estimated: 1667 additions + 124 deletions = 1791 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace: (empty — risk is High; per workload-forecast.md the planner does not pick a strategy or write a trace. Hand off to /git-flow-master §Chained-PR decision tree.)
Decided by: n/a (unresolved)
Decision needed before apply: Yes

Notes: two new migrations (`0042` ~180 lines incl. full RPC body, `0043` ~30 lines), a new route pair (~135 lines, two path params vs abort/finish's one), two new `lib/runs/**` files (`realtime-run-channel.ts` ~90 + test ~100), one new DB-integration test (`mark-step.test.ts` ~230, broader than `start-run.test.ts` given 8 verdict combos), three modified files (`validation.ts` +25, `errors.ts` +20, `rpc.ts` +20), and one substantially-modified component (`RunnerView.tsx`, already 694 lines, +~280 for mark controls + realtime wiring). `RunnerView.tsx`'s increment is the dominant cost driver, not the DB layer — mirrors BK-38's own note about `ProjectRunsReportView.tsx`.

---
_Synced from Jira by sync-jira-issues_
