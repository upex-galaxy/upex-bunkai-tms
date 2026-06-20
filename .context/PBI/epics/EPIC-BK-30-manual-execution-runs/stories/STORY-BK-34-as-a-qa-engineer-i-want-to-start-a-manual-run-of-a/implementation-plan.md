# BK-34 — Spec Implementation Plan (Dev)

> TMS-Run Execution | Start a manual run of a Test in a chosen environment
> Epic BK-30 (Manual Execution & Runs) · Story Points 8 · the **foundation** of the Runs tail (BK-35/36/37/38/39).

## Goal

A workspace member opens a Test, picks a configured Project environment, and starts a manual Run. The Run is created atomically as an immutable **snapshot** of the Test's ATC chain (every executable `atc_step` copied into `run_steps` in chain order, each `pending`), and the runner surface opens as a workbench tab showing the fresh checklist at 0% complete. This is the **first** Runs story, so it must lay the `runs` / `run_atcs` / `run_steps` schema the entire tail extends — without building any of the tail's behaviors (mark pass/fail, abort, history, filter, verdict).

This plan is **live-UI-first** (Critical Rule #15, live-first variant): the current app shell, route-driven workbench tabs (BK-147), `TestDetailView`, and `getTestExpanded` are the source of truth and get REUSED. The `run.jsx` mockup (master-design-plan §4.5, 0% built) is INSPIRATION only.

---

## 1. Established conventions this plan mirrors (no new patterns invented)

| Concern | Precedent | Applied to BK-34 |
| --- | --- | --- |
| Atomic create RPC | `bunkai_create_test` (0024) | `bunkai_create_run` — SECURITY DEFINER, explicit `p_actor_user_id`, one transaction |
| Workspace write gate | `bunkai_assert_actor_can_write_project` (0021, returns `workspace_id`) | gate run creation on the Test's project/workspace |
| Optimistic lock seed | `version int not null default 1` (atcs 0004, tests 0026) | `runs.version` for the tail (BK-35 step writes / BK-39 verdict) |
| Audit row | DEFINER-emitted `activity_log` INSERT (0024) | emit `run.started` inside the RPC |
| RLS read | `bunkai_is_workspace_member(workspace_id)` (0005) | run + run_atcs + run_steps SELECT for project members |
| Idempotency (HTTP) | `Idempotency-Key` header + `beginIdempotentRequest` (BK-27 routes) | request-level replay safety on `POST /api/v1/runs` |
| Idempotency (domain) | none yet | NEW `start_token` per-Test 24h window — distinct concern from HTTP key (see §4 Q5) |
| API handler | `withApiHandler(fn, { auth, requires })` + `getAuth(ctx)` | `requires: ['run:execute']` (capability **already exists**, `lib/api/principal.ts:31`, scope in 0008) |
| RPC wrapper | `lib/supabase/rpc.ts` thin typed fns | add `createRun(...)` |
| Validation / errors | `lib/tests/validation.ts` + `lib/tests/errors.ts` | add `lib/runs/validation.ts` + `lib/runs/errors.ts` (fresh `452xx` block) |
| Read-fetch for UI | `getTestExpanded` (0025, used by `tests/[testId]/page.tsx`) | runner reads the created Run via a new `bunkai_get_run_expanded` |

---

## 2. Run data model (the foundation — designed for BK-35→39)

**Three new tables + two RPCs, in one new migration `0031_runs.sql`.** Tables mirror the glossary's canonical names (`runs`, `run_atcs`, `run_steps`) and the snapshot mandate ("Run snapshots step content so editing an ATC later never corrupts history").

```
projects ──(NEW)── project_environments        runs ──< run_atcs ──< run_steps
                          │                       │ (snapshot of the Test's chain at start instant)
   tests ──< test_steps ──> atcs ──< atc_steps    │
        (live chain — referenced, never mutated)  └─ environment_id ─> project_environments
```

### 2a. `project_environments` (NEW — greenfield; no env schema exists today)

A Run must select a configured Project environment. There is **no environments schema anywhere** (confirmed: zero matches in migrations, `projects` has no env column). Minimal table:

```
project_environments(
  id           uuid PK default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  created_at   timestamptz not null default now(),
  unique (project_id, lower(name))            -- one "Staging" per project, case-insensitive
)
```

- RLS: SELECT for project's workspace members; **no client write policy** for MVP (seeded by migration / future BK-X env-management story). Default-deny keeps it closed until an env-CRUD story ships.
- Migration seeds a default `Staging` + `Production` per existing project so the Start-run flow has something to pick. (PO-pending — see §4 Q-env.)

### 2b. `runs` (header — the row the whole tail extends)

```
runs(
  id             uuid PK default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,   -- denormalized for RLS + activity_log
  project_id     uuid not null references projects(id)   on delete cascade,   -- for BK-38 project-level filter
  test_id        uuid not null references tests(id)      on delete restrict,  -- RESTRICT: a Test with runs can't vanish
  environment_id uuid not null references project_environments(id) on delete restrict,
  status         text not null default 'running'
                   check (status in ('running','passed','failed','aborted')), -- 'running' now; rest are BK-39/36 targets
  executor_mode  text not null check (executor_mode in ('human','agent','ci')),
  executor_user_id uuid references auth.users(id) on delete set null,         -- the human/PAT identity
  start_token    text not null check (char_length(start_token) between 1 and 200),
  test_title     text not null,                                               -- snapshot of Test title at start
  version        int  not null default 1,                                     -- optimistic lock for BK-35/39
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,                                                 -- BK-39 sets this
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
)
```

**Idempotency constraint (domain-level, the high-value behavior):** the 24h-window same-token rule is enforced in the RPC by a transaction-backed lookup (`select ... where test_id = p_test_id and start_token = p_start_token and started_at > now() - interval '24 hours'` under the project write-lock), NOT a partial unique index — a `now()`-relative predicate isn't index-able as a constraint, and the lookup-before-insert is the documented fallback in the story's Dev clarification. A non-windowed `unique (test_id, start_token, <truncated-day>)` is rejected as awkward. (See §4 Q5.)

Indexes: `runs_test_id_started_at_idx (test_id, started_at desc)` (run history, BK-37), `runs_project_id_idx` (BK-38), `runs_workspace_id_idx`.

### 2c. `run_atcs` (snapshot of each chain position) + `run_steps` (snapshot of each executable step)

```
run_atcs(
  id           uuid PK default gen_random_uuid(),
  run_id       uuid not null references runs(id) on delete cascade,
  atc_id       uuid references atcs(id) on delete set null,   -- provenance link; SET NULL so deleting source ATC keeps the snapshot
  position     int  not null check (position >= 1),           -- chain order, copied from test_steps.position
  atc_title    text not null,                                 -- snapshot
  status       text not null default 'pending'
                 check (status in ('pending','passed','failed','blocked','skipped')),  -- rollup target for BK-35
  unique (run_id, position)
)

run_steps(
  id            uuid PK default gen_random_uuid(),
  run_atc_id    uuid not null references run_atcs(id) on delete cascade,
  atc_step_id   uuid references atc_steps(id) on delete set null,   -- provenance only
  position      int  not null check (position >= 1),
  content       text not null,                                      -- SNAPSHOT of atc_steps.content
  input_data    text,                                               -- SNAPSHOT
  expected      text,                                               -- SNAPSHOT
  status        text not null default 'pending'
                  check (status in ('pending','passed','failed','blocked','skipped')),
  note          text,            -- BK-35 will write
  evidence_url  text,            -- BK-35 will write
  executed_at   timestamptz,     -- BK-35 will write
  unique (run_atc_id, position)
)
```

### 2d. `bunkai_create_run` RPC (SECURITY DEFINER, one transaction)

Signature: `bunkai_create_run(p_actor_user_id uuid, p_test_id uuid, p_environment_id uuid, p_executor_mode text, p_start_token text) returns jsonb`. Validation order is **load-bearing** (observable behavior, mirrors `bunkai_create_test`):

1. Resolve Test → `workspace_id`; authZ gate via membership (`forbidden` 42501, no existence disclosure). → **AC: authorization**
2. `p_executor_mode in ('human','agent','ci')` else `executor_mode_invalid` (45200).
3. **Environment belongs to the Test's Project**: `p_environment_id` resolves to a `project_environments` row whose `project_id` = the project of the Test's ATCs / project context. Else `environment_invalid` (45201). → **AC: invalid environment blocked**
4. **Test has ≥1 executable step**: count `atc_steps` reachable via `test_steps → atcs` for this Test. If 0 → `no_executable_steps` (45202). → **AC: no executable steps blocked** (gate is *executable steps*, not ATC count — §4 Q2).
5. **Idempotency lookup** (under project write-lock): existing `running` Run with same `(test_id, start_token)` within 24h → return THAT run's composed json, no insert. → **AC: same-token retry returns existing run**
6. Insert `runs` header; then walk `test_steps` in `position` order → for each ATC insert a `run_atcs` row (snapshot title/position) → for each `atc_step` of that ATC insert a `run_steps` row (snapshot content/input/expected, `pending`). Order preserved verbatim. → **AC: pending checklist in chain order**
7. Emit `activity_log` `run.started` (DEFINER-only). Return composed json (header + ordered run_atcs + run_steps).

### 2e. `bunkai_get_run_expanded` RPC (read)

Membership-gated read returning the Run + ordered run_atcs + run_steps, used by the runner page (mirrors `bunkai_get_test_expanded` 0025). Powers the runner checklist + 0% progress + run-history visibility.

### How this anticipates BK-35→39 (without building them)

| Tail story | Already provisioned by BK-34 schema |
| --- | --- |
| BK-35 mark pass/fail/block | `run_steps.status/note/evidence_url/executed_at` columns + `runs.version` lock + per-status CHECK already include `passed/failed/blocked` |
| BK-36 abort | `runs.status='aborted'` already in CHECK; `finished_at` exists |
| BK-37 run history | `runs_test_id_started_at_idx` + snapshot `test_title`/`atc_title` survive source edits |
| BK-38 project filter w/ totals | `runs.project_id` + `executor_mode` + `status` indexable; rollup reads run_steps |
| BK-39 final verdict | `runs.status passed/failed` + `finished_at` + `version` lock ready |

**ADR**: introducing a snapshot-vs-reference execution model + a project-environments entity is **architectural and hard to reverse** → draft `ADR-0004-run-snapshot-and-environments.md` (`Proposed`, human accepts) before coding, backlinked from this plan.

---

## 3. AC → files map

| AC scenario | Files | Approach |
| --- | --- | --- |
| Start run → pending checklist in chain order, 0% | `supabase/migrations/0031_runs.sql` (RPC step 6); `lib/supabase/rpc.ts` (`createRun`); `app/api/v1/runs/route.ts`; runner page + checklist UI | RPC snapshots chain → run_steps `pending`; runner renders ordered checklist + progress bar at 0% |
| Block: Test has no executable steps | `0031_runs.sql` (step 4, 45202); `lib/runs/errors.ts`; Start-run client island | RPC raises; route maps to 422; UI shows frozen message "Add at least one ATC to this Test before starting a run" verbatim |
| Block: environment not configured for Project | `0031_runs.sql` (step 3, 45201); `lib/runs/errors.ts`; env-select UI | env dropdown only lists `project_environments`; RPC re-validates; message "<Env> is not a configured environment for this Project" |
| Same token within 24h → existing run | `0031_runs.sql` (step 5 lookup); `app/api/v1/runs/route.ts` | RPC returns existing run json; route returns 200 (replay) and client routes to that run |
| Different token → separate run | `0031_runs.sql` (step 5 predicate keyed on token) | token-scoped lookup misses → fresh insert |
| Executor mode human/agent/ci stored | `0031_runs.sql` (step 2 + insert); `lib/runs/validation.ts`; `app/api/v1/runs/route.ts` | mode derived from `principal.via` (cookie→human, PAT→agent/ci per token metadata) and/or explicit body; default `human` for cookie sessions |
| New run appears in Test run history | `bunkai_get_run_expanded` / a list read; `TestDetailView` history slot (or runner-side) | history rows read `runs` by `test_id` desc; entry shows environment, executor_mode, started_at, status — **note: a full history *list* surface is BK-37; BK-34 only proves the row is queryable/visible** (see §5 risk) |
| (design-fidelity AC) ATC rows expose run affordances in Projects screen | DEFERRED | This AC references the Projects-screen runner integration (run-selection checkboxes, last-run banner). The **mockup gem** — not the BK-34 start-run path. Logged as future tech-story (§5); BK-34 ships the Start-run trigger from `TestDetailView`, not the ATC-checkbox surface. |

---

## 4. Open questions (the ~7 PO/Design/Dev clarifications) — plan's working answer

| # | Question | Plan's working answer | PO-pending? |
| --- | --- | --- | --- |
| Q1 | After 24h, does the same token create a new Run or get rejected as expired? | **Working: create a new Run.** The 24h lookup predicate simply misses an expired token, so a same-token retry after the window behaves like a fresh start (simplest, no expired-token error path to build now). Expert rec was "reject + ask for new token"; deferring the explicit reject keeps BK-34 lean. | **YES — PO confirms expired-token copy.** If PO wants reject, add a `token_expired` (45203) branch — 1-line change, flagged. |
| Q2 | Is a Test with manual steps but no ATCs executable? | **Gate is *executable steps*, not ATC count.** RPC step 4 counts `atc_steps`. (Note: per BK-27, a Test currently *requires* ≥1 ATC to exist, and ATCs without steps are possible — so "executable steps" = the reachable `atc_steps` count.) | Partially — aligns with expert rec; PO confirms wording of the gate. Assumed: executable-steps gate. |
| Q3 | What success state after starting a Run? | **Redirect to the runner workbench tab** (`router.push(.../runs/{runId})`) with pending checklist visible + sonner success toast. Matches live route-driven tab model + expert rec. | **YES — Design confirms transition + toast/empty/error copy.** Assumed: redirect + toast. |
| Q4 | Snapshot step content at creation, or reference live? | **Snapshot** (`run_atcs`/`run_steps` copy title/content/input/expected at start). Matches glossary ("Run snapshots step content") + expert rec; later Test edits never rewrite history. | Resolved by glossary + ADR-0004; Architect/Dev confirm exact snapshot field set (plan copies content/input_data/expected/title — open to adding more). |
| Q5 | What stores the start token + uniqueness rule? | **`runs.start_token text`** + transaction-backed lookup within the active 24h window under the project write-lock (no partial unique index — `now()`-relative predicate isn't constraint-able). HTTP `Idempotency-Key` is a *separate* request-replay guard. | Assumed (Dev decision): transaction lookup, not DB constraint. Documented in ADR-0004. |
| Q6 | Minimum QA coverage gate? | Cover all 7 ATP scenarios (BK-34-ATC-01..07): start, no-steps, invalid-env, same-token retry, different-token, executor-mode, history-visibility + authorization. Drives §6 test plan. | No — QA-Lead-owned; plan adopts the ATP matrix as-is. |
| Q7 | Can BK-34 proceed while BK-70 (Test Repository) is ignored? | **Proceed.** dev-roadmap ES2 marks BK-34 the highest-leverage pick now; BK-27 (the hard blocker) is ✅ done. BK-70 risk accepted per story note — if the Test Repository contract changes, refresh. | Accepted dependency risk (Delivery/PO already greenlit to Ready For Dev). |
| Q-env | (derived) No `project_environments` schema exists — how does a Project get environments to pick? | **Seed `Staging` + `Production` per project in `0031_runs.sql`**; env CRUD is a future story. Gives the Start-run flow real data without scope-creeping an env-management UI. | **YES — PO confirms default seed names** (or whether env management is a separate ticket). |

---

## 5. Risks / unknowns

- **Schema size (L driver):** 3 new tables + 1 new env table + 2 RPCs + RLS for all four + seed = the single largest migration since 0024. The RPC body (snapshot walk) is non-trivial plpgsql. Mitigation: mirror `bunkai_create_test` structure line-for-line; keep BK-35→39 columns present-but-unwritten.
- **Snapshot-at-start semantics (Test changes after run starts):** by design, once a Run starts its `run_steps` are frozen — editing/reordering the Test (BK-28) or its ATCs afterward does NOT alter the in-flight Run. This is the correct historical-evidence behavior (glossary-mandated) but must be called out so QA doesn't file it as a "stale checklist" bug. `atc_id`/`atc_step_id` are `ON DELETE SET NULL` provenance links, never read for content.
- **Run-history *list* is BK-37, not BK-34:** AC-07 ("appears in run history") is satisfiable at BK-34 by proving the row is queryable + a minimal history entry renders, but the **filterable history surface** is explicitly BK-37 (🔒 Test Runs mockup pending). Working scope: BK-34 renders a lightweight "Runs" list on the Test detail (or a stub), full filtering deferred. Surface as a §4 Q to confirm how much history UI lands now vs BK-37.
- **Executor-mode derivation for agent/ci:** cookie sessions are unambiguously `human`. Distinguishing `agent` vs `ci` for PAT callers needs a signal (token metadata or explicit body field). Working answer: accept explicit `executor_mode` in the request body for PAT callers, default `human` for cookie. Confirm with the PAT-token shape.
- **Mockup-vs-live divergence:** `run.jsx` (§4.5) is 0% built — full greenfield, so there is no live runner to diverge *from*. The runner is built fresh REUSING the workbench-tab mechanism + `ChainedAtcCard` checklist anatomy + `signal.*` tokens. No mockup blind-copy; the runner's chrome follows the improved live shell, with `run.jsx` as inspiration for the checklist/progress layout only. New `'run'` workbench tab kind + route is a real shell change (§ UI plan) — ratify as a §5 design derivation if it departs from the mockup's full-screen runner.
- **Mockup gem → future tech-story:** the design-fidelity AC (ATC rows with run-selection checkboxes + last-run-result banner + Run action in the **Projects/ATC** detail pane, per master-design-plan §4.3 / `project.jsx`) is richer than BK-34's Test-level Start-run trigger. It's valuable but out of this story's scope. **Recommend a future tech-story: "Surface run affordances on the Projects/ATC explorer (run-selection checkboxes + last-run banner)"** — depends on the Runs domain (this story) + the Test Runs mockup.
- **UI primitive gaps:** no live progress-bar, env-select, or dialog primitive (radix-select/progress not installed). Build minimal in-house using existing `signal.*` tokens + native `<select>` fallback (precedent `NewAtcEditor.tsx:316`). Avoid pulling new radix deps for MVP unless review prefers it.

---

## 6. UI plan (live-first)

```
[Test detail tab]  TestDetailView header (client island "Start run" button + env <select>)
        │  click → POST /api/v1/runs {test_id, environment_id, executor_mode, start_token}
        ▼
   201 → router.push(/projects/{slug}/runs/{runId})  +  toast.success("Run started")
        │  workbench effect registers a NEW 'run' tab (route-driven, BK-147 mechanism)
        ▼
[Runner tab]  runs/[runId]/page.tsx  →  bunkai_get_run_expanded
   ├─ progress bar (0% complete)        [BUILD — uses signal.* tokens]
   └─ checklist: run_atcs → run_steps   [BUILD — models ChainedAtcCard <ol>, pending status dot]
```

- **Where Start-run lives:** the `TestDetailView` header right-rail (`components/tests/TestDetailView.tsx:96-103`), as a small **client island** (server component, so mirror `TestTagEditor`/`TestReorderClient` island pattern). The explorer Test row was considered + rejected (compact route-links, no action affordances).
- **How the runner opens:** add `'run'` to `WorkbenchTabKind` (`workbench-context.tsx:20`), create route `app/(app)/projects/[projectSlug]/runs/[runId]/page.tsx`, extend `findTab` + param-derivation effect + `closeTab` for `run`, add a run-icon branch in `project-shell.tsx:158-169`. The Start-run button just `router.push(...)`; the existing effect registers the tab automatically (no imperative `openTab` exists — tabs are route-driven, BK-147).
- **Reused live components:** `getTestExpanded`/new `getRunExpanded` (RSC fetch), `Button` (`components/ui/button.tsx`), sonner `toast` (mounted `app/layout.tsx:45`), `ChainedAtcCard` checklist anatomy, `signal.pass/fail/blocked/skipped/running` + `.dot[data-status]` + `.status-chip[data-status]` tokens (`app/globals.css:35-44,165,309`).
- **Build (UI):** progress bar, env-select dropdown (native `<select>` MVP), runner checklist component. No new design tokens needed.
- **Navigation / discoverability (golden rule):** the run is triggered from the Test the user is already looking at (Test detail tab) → runner opens as a sibling workbench tab in the same project shell, keeping the user in-context. Discoverable, route-addressable (shareable run URL), and consistent with how ATCs/Tests already open.

---

## 7. Test plan (real setup)

Verification scripts (from `package.json`): `bun run types:check`, `bun run lint:check`. No production build (Rule #14). DB changes applied via migration `0031_runs.sql`; type regen via `bun run types:gen` after migration.

- **RPC-level (SQL, the enforcement-of-record):** seed a workspace + project + test (≥1 ATC w/ ≥1 step) + an environment, then assert `bunkai_create_run`:
  - ATC-01: returns run with run_steps in chain order, all `pending`, status `running`.
  - ATC-02: Test with 0 executable steps → raises `no_executable_steps` (45202), no `runs` row.
  - ATC-03: environment not in Project → raises `environment_invalid` (45201), no row.
  - ATC-04: same `(test_id, start_token)` within 24h → returns the SAME run id, no duplicate.
  - ATC-05: different token → new run id, original unchanged.
  - ATC-06: `executor_mode='agent'`/`'ci'` stored verbatim; invalid mode → 45200.
  - Authorization: non-member actor → `forbidden` (42501), no existence disclosure.
- **Route-level:** `POST /api/v1/runs` — happy 201; replay (same Idempotency-Key) returns snapshot; same start_token returns 200 + existing run; error codes map (45202→422, 45201→422, 42501→403). Cookie session → `human`; PAT path → explicit mode.
- **UI smoke (live, `bun run dev` only):** Start-run from Test detail → runner tab opens → checklist renders pending at 0% → run visible when re-querying the Test's runs. (No E2E automation — out of sprint-dev scope.)
- **ATP traceability:** BK-34-ATC-01..07 each map to an RPC/route test above (compliance matrix at Stage 3).

---

## Review Workload Forecast

Estimated: ~620 additions + ~10 deletions = ~630 total lines
(migration ~280 · rpc wrapper + validation + errors ~120 · route ~70 · runner page + checklist + progress + env-select + start-run island ~140 · ADR + type regen ~20)
400-line budget risk: **High**
Chain strategy: **pending** — recommend `feature-branch-chain` (split: PR1 = schema + RPCs + API route + wrappers; PR2 = runner UI + Start-run island) OR a size-exception. Resolve at Stage 1→2 boundary via `/git-flow-master`.
Decision needed before apply: **Yes**

## Technical Decisions

- **TD-1 (ADR-0004):** Run execution is a **snapshot** model (`run_atcs`/`run_steps` copy content at start) — architectural + hard to reverse → ADR.
- **TD-2 (ADR-0004):** `project_environments` is a new first-class entity (no env schema existed) → ADR.
- **TD-3:** Domain idempotency = transaction-backed 24h lookup on `runs.start_token`, NOT a DB partial-unique index (now()-relative predicate). Story-local.
- **TD-4:** New `'run'` workbench tab kind + route, opened by `router.push` (route-driven per BK-147), not an imperative tab API. Story-local.

## Est. complexity

**L** — it is a new epic's data-model foundation: three+one new tables, two SECURITY DEFINER RPCs with a non-trivial snapshot walk, a greenfield environments entity, RLS for all four tables, a new workbench tab kind + route, and four net-new UI primitives — all of which the entire Runs tail (BK-35→39) will build on.
