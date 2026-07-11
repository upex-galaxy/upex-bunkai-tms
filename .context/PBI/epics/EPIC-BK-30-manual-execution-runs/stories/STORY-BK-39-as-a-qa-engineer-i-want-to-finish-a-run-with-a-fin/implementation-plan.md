# BK-39 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-39)

# BK-39 — Finish a run with a final verdict — Implementation Plan

***Epic****: BK-30 Manual Execution & Runs · ****Points****: 5 · ****Status***: Ready For Dev → In Progress
***Branch***: `feature/BK-39-finish-verdict` off `staging` (BK-36 already merged → staging current)
***Pattern***: mirror of BK-36 abort (migration 0036 → 0037; abort route → finish route). Run-terminal-action sibling.

## Story (plain terms)

A QA Engineer (or AI agent / CI) executing a run clicks ***Finish run****, picks a final verdict ****passed**** or ****failed****. Bunkai closes the run with that verdict, stamps `finished_at`, marks any still-pending steps ****skipped****, preserves already-executed results. Finish is ****terminal*** — an already-closed run (passed/failed/aborted) is rejected with "This run is already closed and cannot be finished." Human / AI / CI all handled identically.

## Contract decisions (resolved as PO/tech-lead — all scope-aligned with abort precedent)

1. ***Verdict values*** = `passed | failed` only (abort is its own action, out of scope).
2. ***Atomicity*** = single SECURITY DEFINER RPC, FOR UPDATE row lock (mirror abort).
3. ***Concurrency*** = first terminal action wins; loser re-reads non-running status → 409.
4. ***AI/CI authz*** = same write gate as abort (`bunkai*assert*actor*can*write*workspace`); NO bypass. Traceable via existing `executor*mode` / `executor*user*id`.
5. ***Failed verdict*** does NOT require a linked defect (filing bugs out of scope).
6. ***UX*** = confirmation modal; when pending steps exist, show "N pending step(s) will be marked skipped." Verdict selection required before Confirm enables.

## AC contract

Build to satisfy BOTH the canonical 4-scenario AC field (acceptance gate) AND the 8-scenario body set (coverage target) — the 8 are a superset, same implementation covers all: happy-path passed, pending→skipped, executed-preserved, missing-verdict blocked, terminal-state blocked, concurrency-consistent, human/AI/CI parity.

## Design (Rule #15 + #14 LIVE-UI-FIRST)

Mockup `run.jsx` shows per-step P/F/B buttons but NO run-level finish affordance (same as abort — BK-36 built abort button+modal not drawn in mockup). ***Follow BK-36 live precedent****: build a run-level ****Finish run*** affordance mirroring the live abort button+modal, using frozen verdict tokens (pass `#2fb673`, fail `#e5484d`). Documented as spec-only (mockup doesn't depict run-level terminal actions); no new §5/ADR (precedent set by BK-36). Renders into existing Test Runner screen (run detail page).

---

## Files (mirror BK-36 set)

### DB — `supabase/migrations/0037*run*finish.sql` (NEW, RPC only)

`bunkai*finish*run(p*actor*user*id uuid, p*run*id uuid, p*verdict text) returns jsonb` SECURITY DEFINER, `search_path=''`. Validation order (load-bearing):

1. Resolve+lock run header FOR UPDATE → null → `P0002` not_found.
2. AuthZ: `bunkai*assert*actor*can*write_workspace` → `42501`.
3. Status gate: `status <> 'running'` → `45206` run*not*finishable.
4. Verdict backstop: `p*verdict not in ('passed','failed')` → `45207` finish*verdict_invalid.
5. Mutate: `status = p*verdict, finished*at = now(), version+1` (abort*reason stays NULL → satisfies `runs*abort*reason*chk` non-aborted branch). Skip pending run*steps → skipped (capture row*count). Skip pending run_atcs → skipped. Executed results untouched.
6. Audit `run.finished` payload `{verdict, skipped*steps}`. Return `bunkai*run*json(p*run_id)`.
7. revoke from public/anon; grant to authenticated, service_role.

No column change; do NOT re-create `bunkai*run*json` (verdict = status, already surfaced).
Apply to Supabase project (same method as 0036 — verify via list_migrations) + local dev.

### Schema/validation — `lib/runs/validation.ts` (EDIT, additive)

```ts
export const RUN*FINISH*VERDICTS = ['passed', 'failed'] as const;
export const RUN*FINISH*VERDICT*REQUIRED*MESSAGE = 'Select a final verdict of passed or failed to finish the run.';
export const RunFinishBodySchema = z.object({ verdict: z.enum(RUN*FINISH*VERDICTS) });
export type RunFinishBody = z.infer<typeof RunFinishBodySchema>;
```

### Errors — `lib/runs/errors.ts` (EDIT, additive cases)

```
45206 → ApiError('conflict', 'This run is already closed and cannot be finished.', { reason: 'run*not*finishable' })   // AC3-exact
45207 → ApiError('validation*failed', 'A final verdict of passed or failed is required.', { reason: 'finish*verdict_invalid' })
```

### RPC wrapper — `lib/supabase/rpc.ts` (EDIT, additive)

`finishRun(supabase, { actorUserId, runId, verdict })` → `supabase.rpc('bunkai*finish*run', { p*actor*user*id, p*run*id, p*verdict })`. Add `FinishRunArgs` interface.

### API route — `app/api/v1/runs/[id]/finish/route.ts` (NEW, mirror abort/route.ts)

`POST`, `{ auth: 'required', requires: ['run:execute'] }`. Extract+validate runId UUID. safeParse `RunFinishBodySchema`; on fail → AC-exact `RUN*FINISH*VERDICT*REQUIRED*MESSAGE` (422). Call `finishRun`, `mapRunRpcError` on error. Return `{ run: data }` 200.

### OpenAPI — `app/api/v1/runs/[id]/finish/route.openapi.ts` (NEW, mirror abort openapi) + run `bun run api:sync` to regen `public/openapi.json`.

### Types — `lib/types/supabase.ts` — run `bun run types:gen` after migration applied (new RPC in Functions block if present).

### UI — `components/runs/RunnerView.tsx` (EDIT)

- `canFinish` prop (page derives, same role gate as canAbort).
- "Finish run" button (primary/accent variant), shown when `view.status==='running' && canFinish`. Sits beside Abort.
- Finish modal mirroring abort modal: title "Finish run", verdict selector = Pass (green) / Fail (red) toggle (required), pending-count note "N pending step(s) will be marked skipped." when >0, Confirm (disabled until verdict picked) + Cancel.
- `handleFinish()`: POST `/api/v1/runs/{id}/finish` `{verdict}`. Success → optimistic `view.status=verdict, finished_at`, toast, router.refresh. Terminal-state error → render server message verbatim.
- Final-state display: when terminal, show verdict badge + finish time (mirror abort*reason block, but verdict+finished*at).

### Page — `app/(app)/projects/[projectSlug]/runs/[runId]/page.tsx` (EDIT)

Derive `canFinish` (reuse canAbort role check — rename to `canManageRun` or add canFinish alongside). Pass to RunnerView.

---

## Stages

- ***S1 Plan***: push this to Jira `spec*implementation*plan`, sync, transition Ready For Dev → In Progress.
- ***S2 Impl***: migration → apply to DB → types:gen → validation/errors/rpc → route+openapi → api:sync → UI → page. Verify cap=3: types:check + lint:check (+ format:check json). Live-UI on dev server.
- ***S3 Review***: adversarial reviewer subagent → adjudicate → Spec Compliance Matrix → PR to staging via git-flow-master.
- ***S4 Staging***: merge (saiotest gh acct) → verify staging deploy + migration on staging DB → Jira → Ready For QA → reassign shift-left QA owner / unassign → QA comment.
- ***S5 Prod***: GATED, skip (prod not authorized).

## Verification (no test runner)

`bun run types:check` · `bun run lint:check` · `bun run api:sync` (no unexpected diff) · `bun run types:gen` · Playwright CLI live-UI on `bun run dev`.

## Review Workload Forecast

Estimated: ~220 additions + ~10 deletions ≈ 230 lines (1 migration ~70, route ~55, openapi ~35, validation +12, errors +10, rpc +18, RunnerView +90, page +5, generated openapi.json/types excluded from review budget).
400-line budget risk: ***Low–Medium****. Chain strategy: ****single feature branch**** (one cohesive slice, mirrors BK-36 which shipped as one PR). Decision needed before apply: ****No***.

---
_Synced from Jira by sync-jira-issues_
