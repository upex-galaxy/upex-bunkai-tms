# BK-202 — Spec Implementation Plan (Dev)

> **Provenance note.** `implementation-plan.md` is normally a `[SYNC]`-owned file materialized
> from the Jira `spec_implementation_plan` field. This run was explicitly instructed not to
> touch the Jira ticket (the orchestrator owns close-out), so the plan is authored locally and
> the Jira field is left for the orchestrator to fill. A `jira:sync-issues get BK-202` before
> that push will overwrite this file.

**Story:** TMS-Test Plan | Create a test plan grouping tests for a goal · 3 SP · Epic BK-201
**Branch:** `feature/BK-202-create-test-plan` (off `origin/staging` @ 67f76b3)

---

## 1. Goal

Ship the Test Plan **container**: a project-scoped, named, uniquely-titled record with an
optional description and an optional goal label, created and edited by members, readable by
every workspace member, listed per project and openable as a detail screen with an empty
test area. Membership curation (BK-203), progress (BK-206) and Close (BK-207) are out of scope.

## 2. Decisions already ratified — followed, not re-derived

Every open question on this ticket was answered in the 2026-08-14 PO + Tech Lead comment
(`comments.md`). This plan implements those rulings; it does not reopen them.

| Ref | Ruling | How it lands |
| --- | --- | --- |
| T3 | Build now, no dependency on BK-24 | No `tests` FK in this story at all |
| T4 | **No Delete, ever** — Close (BK-207) is the sole exit | No DELETE policy, no delete RPC, no UI affordance |
| T5 | Rename re-validates uniqueness, identical rule to create | Same `(project_id, lower(name))` unique index backs INSERT and UPDATE |
| — | Server-side role gate, live-checked, on every write | `bunkai_can_write_workspace(ws)` as step 2 of both RPCs, verbatim |
| — | Whitespace: collapse runs → then trim, enforced as a table CHECK | `name = btrim(regexp_replace(name,'\s+',' ','g'))` |
| — | DB-level unique index, not app-level | `test_plans_project_name_idx` — closes the concurrent-create race (AC 2.6) |
| — | Edit is not creator-restricted | `created_by` never read as an authorization input |
| — | description ≤ 500, goal ≤ 100 | Table CHECKs + Zod mirrors |
| — | No per-project plan cap | Plain composite index, unbounded list |
| — | Error copy: duplicate 409 / length 422 | `lib/test-plans/errors.ts`, milestones envelope shape verbatim |

**Copy (ratified verbatim):**
`A test plan with this name already exists.` (409, reason `test_plan_name_taken`)
`Name must be between 1 and 100 characters.` (422, reason `test_plan_name_length`)

## 3. Technical Decisions

### 3.1 RPC authorization — ADR-0012 six questions (mandatory gate)

1. **Does this need `SECURITY DEFINER` at all?** Yes for the two writes, and only for them.
   The write path must consult `workspace_members` and insert into `activity_log`, neither of
   which a plain INVOKER insert can do under the caller's own RLS. List and detail reads are
   **plain RLS-scoped PostgREST selects, no function** — ADR-0001 Path B, exactly as
   `0064_milestones.sql` §5 states for milestones.
2. **Can the identity parameter be deleted instead of guarded?** **Yes — and it is.** Neither
   `bunkai_create_test_plan` nor `bunkai_update_test_plan` takes any actor or workspace
   parameter. The actor is `auth.uid()`, read inside the function. ADR-0012 is satisfied by
   *parameter removal*, the reference's stated preferred outcome, not by a guard. There is no
   `p_actor_user_id` to spoof and no caller-supplied scope to widen.
3. **Where does the actor bind sit?** Not applicable by construction (no parameter). The
   equivalent step-0 property — the function cannot be told who is calling — holds absolutely.
4. **What scopes every returned row?** Both RPCs return exactly one row: the row they just
   wrote, whose `workspace_id` was resolved *server-side* from `p_project_id`/`p_test_plan_id`
   and then gated by `bunkai_can_write_workspace` on that resolved workspace. No set-returning
   path exists, so there is no result set to under-scope. `p_project_id` is a URL-known value,
   so a `42501` on it discloses nothing (0063 precedent).
5. **Failure-path error contract?** `P0002` project/plan-not-found (non-disclosure: a
   non-member editing a plan gets not-found, never forbidden), `42501` forbidden (member but
   viewer), `23505` duplicate, `456xx` validation.
6. **DB-integration test against the real database?** Yes —
   `lib/test-plans/test-plan-rpc-isolation.test.ts`, modelled on
   `milestone-rpc-isolation.test.ts`: a **real** `signInWithPassword` session as the declared
   `testing.automation_identity`, every assertion going through the production RPC path, with
   independent service-role read-back. No mocked `db.rpc` anywhere.

### 3.2 SQLSTATE allocation

New `456xx` block for the test-plans domain, per the allocation-comment convention in
`0064_milestones.sql`'s header (verified free: no `456xx` code exists anywhere in
`supabase/migrations/`).

| Code | Name | Meaning |
| --- | --- | --- |
| `45600` | `test_plan_name_length` | name empty or > 100 chars after normalize |
| `45601` | `test_plan_description_length` | description > 500 chars |
| `45602` | `test_plan_goal_length` | goal > 100 chars |
| `45603` | `test_plan_not_open` | edit attempted on a non-open plan |

Case-insensitive collisions reuse native `23505` from `test_plans_project_name_idx`.

### 3.3 `status` column — why it exists here and why its domain is two-valued

`scope.md` and AC 1.2 both require a status of `Open` on the list and detail. The column is
therefore in scope. Its CHECK admits `('open','closed')` while **nothing in this story ever
writes `'closed'`** — no RPC parameter, no route, no UI. Rationale: T4 ratifies Close (BK-207)
as the sole exit epic-wide, so the value domain is already decided; pinning the CHECK to
`= 'open'` would force BK-207 to *alter* a constraint rather than add a transition. This is a
value domain, not a capability — the "ship nothing unrequested" precedent applies to
capabilities (the missing DELETE path), and no capability to close a plan ships here.

### 3.4 No write policies — a deliberate departure from the milestones precedent

`0064_milestones.sql` ships member+ INSERT/UPDATE RLS policies and calls them
"defense in depth". Measured on this project (`information_schema.role_table_grants`,
2026-08-20), that framing is wrong: Supabase's default privileges grant INSERT, UPDATE
and DELETE on every `public` table to `authenticated`, so such a policy is not a lock
behind the RPC — it is a second, unaudited write path beside it. On this table that would
have meant a member+ could `PATCH /rest/v1/test_plans {"status":"closed"}` with no verdict
and no `activity_log` row, and could insert a row whose `project_id` belongs to a workspace
they cannot see, silently occupying a name in `test_plans_project_name_idx`.

`test_plans` therefore ships **SELECT-only RLS**: default-deny on every direct write, with
the two DEFINER RPCs as the sole write path. Costs nothing — a DEFINER function bypasses RLS
(`FORCE ROW LEVEL SECURITY` is set nowhere in this schema, per ADR-0012). This is the same
default-deny-on-writes posture `0031_runs.sql` set for `project_environments`. Proven by
case (l) of the isolation suite, which attempts all three direct writes as a real member+
session and asserts the stored row is unchanged.

The equivalent gap on `milestones` is **not** retrofitted here — that is an untested security
change smuggled into a diff nobody planned for it, exactly what ADR-0012's own "22 unbound
functions" note refuses. It is flagged for its own ticket.

### 3.5 Edit-while-open guard

`scope.md` says "Edit a plan's name, description, and goal **while the plan is open**".
`bunkai_update_test_plan` enforces it structurally (`45603`). It is unreachable through any
shipped write path today, but it is **provable**: the isolation test seeds a closed plan
through the service-role client and asserts the edit is rejected — the same technique
`milestone-rpc-isolation.test.ts` case (h) uses for a past-dated milestone.

### 3.6 List ordering / index

Default sort `created_at desc, id desc` (newest cycle first — a plan has no date axis the way
a milestone does). Index `test_plans_project_created_at_id_idx on (project_id, created_at, id)`
— the Dev ruling's own recommendation; a plain ascending btree serves the descending scan and
`id` is the stable tie-break / future keyset seek column.

### 3.7 No ADR needed

Nothing here is architectural-and-hard-to-reverse: every shape is a copy of a ratified
precedent (ADR-0012 by parameter removal, ADR-0001 Path B reads, the milestones table/index/
RLS/error grammar). The one genuinely new artefact is the `456xx` block allocation, which the
migration header documents in place, exactly as `0064` documented `455xx`.

## 4. Slices

| # | Slice | Files |
| --- | --- | --- |
| 1 | Migration + apply + type regen | `supabase/migrations/0073_test_plans.sql`, `lib/types/supabase.ts` |
| 2 | Domain lib | `lib/test-plans/validation.ts`, `errors.ts`, `validation.test.ts` |
| 3 | RPC wrappers | `lib/supabase/rpc.ts` (append `createTestPlan` / `updateTestPlan`) |
| 4 | API routes | `app/api/v1/projects/[id]/test-plans/{route.ts,route.openapi.ts}`, `app/api/v1/test-plans/[id]/{route.ts,route.openapi.ts}` |
| 5 | UI | `components/test-plans/*`, `app/(app)/projects/[projectSlug]/test-plans/**`, sub-nav entry |
| 6 | RPC isolation test | `lib/test-plans/test-plan-rpc-isolation.test.ts` |
| 7 | Verify + PR | tests → types → lint |

**Capability posture (mandatory, no default in `lib/api/handler.ts`):**
`GET` list → `{ auth: 'required', requires: ['atc:read'] }`;
`POST` create and `PATCH` edit → `{ auth: 'required', requires: ['atc:write'] }`.
`requires: []` is never used — it type-checks while checking nothing.

## 5. AC → implementation map

| AC scenario | Enforced by |
| --- | --- |
| 1.1 / 1.2 create full / name-only | RPC insert; `description`/`goal` default `''` |
| 1.3 / 1.4 name 100 vs 101 | table CHECK + `45600` + Zod mirror |
| 1.5 `" A "` → `"A"` | collapse-then-trim in RPC, CHECK pins it |
| 2.1 case-insensitive duplicate | `unique (project_id, lower(name))` → `23505` → 409 |
| 2.2 space-padded duplicate | same index, after normalize |
| 2.3 same name, other project | index is project-scoped |
| 2.4 tab / NBSP padded | `\s` covers tab (asserted); U+00A0 explicitly **not** covered — matches the milestones precedent the ruling told us to match |
| 2.5 rename collision | same index fires on UPDATE; self-exclusion automatic |
| 2.6 concurrent create race | DB unique index, no app-level TOCTOU window |
| 3.1 / 3.2 / 3.3 blank name | normalize → `char_length < 1` → `45600` |
| 4.1 viewer sees no create affordance | server-derived `canCreate`, control structurally absent |
| 4.2 viewer direct API call | `bunkai_can_write_workspace` in the RPC → `42501` → 403 |
| 4.3 member edits another's plan | `created_by` never consulted for authz |
| 4.4 viewer inline edit | server-derived `canEdit`, control absent + RPC gate |
| 4.5 stale client role | role read live inside the RPC on every write |

## 6. Review Workload Forecast

Estimated: ~1750 additions + ~10 deletions = ~1760 total lines
400-line budget risk: **High**
Chain strategy: **size-exception**
Decision trace: not produced by the git-flow-master chained-PR tree. The operator directive
for this run fixes the delivery shape up front — one branch `feature/BK-202-create-test-plan`,
one pull request against `staging` — which is the "operator explicitly reserved" case in the
decision protocol. Recorded as an operator decision, not as a planner-picked strategy.
Decided by: operator directive (run brief, steps 1 and 8)
Decision needed before apply: No
