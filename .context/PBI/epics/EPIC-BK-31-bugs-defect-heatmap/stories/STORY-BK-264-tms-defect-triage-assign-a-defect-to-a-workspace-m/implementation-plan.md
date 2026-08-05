# BK-264 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

# Implementation Plan: STORY-BK-264 - TMS-Defect Triage | Assign a defect to a workspace member and update its status

## Overview

Bugs already have a `status` column (`open`/`in_progress`/`resolved`/`closed`) but nothing writes to it, and no column attaches an owner. This story adds both: assign/reassign/unassign a Bug to a workspace member, and move a Bug forward one status stage at a time. It is the direct prerequisite for BK-212 (Notifications), which has no event to subscribe to until this ships.

***Acceptance Criteria -> implementation*** (10 Gherkin scenarios, `acceptance-criteria.md`):

| # | Scenario | Step |
| --- | --- | --- |
| 1 | Assign an open defect | Slice 1 `bunkai*assign*bug` + Slice 2 `POST /bugs/{id}/assign` + Slice 3 control + Slice 4 `bug.assigned` label |
| 2 | open -> in*progress | Slice 1 `bunkai*transition*bug*status` + Slice 2 `POST /bugs/{id}/status` + Slice 3 control |
| 3 | in_progress -> resolved | Same RPC |
| 4 | resolved -> closed | Same RPC |
| 5 | Skip a stage rejected | `bug*status*transition_skipped` (45310) |
| 6 | Backward move rejected | `bug*status*transition_backward` (45311) |
| 7 | Assign non-member rejected | `bug*assignee*not*workspace*member` (45312) |
| 8 | Assign Viewer rejected | `bug*assignee*view_only` (45313) |
| 9 | Reassign | `bunkai*assign*bug` reassign path, `bug.reassigned` |
| 10 | Unassign | `bunkai*assign*bug` unassign path, `bug.unassigned` |

No new screen: two small controls (assignee picker, "move to next stage" action) on the existing `/projects/[projectSlug]/bugs` list (`BugsListView.tsx`, BK-41) — the only live surface a Bug is shown on today.

---

## Technical Approach

***Chosen******:**** Two `SECURITY DEFINER` RPCs, `bunkai*assign*bug` and `bunkai*transition*bug*status`, ****neither taking an explicit actor parameter*** — both read `auth.uid()` directly, mirroring `bunkai*update*module`/`bunkai*move*module`/`bunkai*archive*module*subtree` (`0023*module*activity_log.sql`), the exact pattern ADR-0011 flags for reuse and ADR-0012 cites as its "worked example" of deleting the identity parameter instead of guarding it. Called via `principal.db.rpc(...)` (the caller's own RLS-scoped client, ADR-0001 Path B) — never `createAdminClient()`, since there is no parameter for an admin client to hand an identity through.

***Rejected alternatives******:***

- Plain `SECURITY INVOKER` + a raw client `UPDATE` on `bugs` gated by a new blanket UPDATE RLS policy + trigger (the `bunkai*list*bugs`/0051 default). The assignee-eligibility check needs to read another user's `workspace_members` row, which that table's own SELECT policy (`0001`/`0005`) hides from a non-admin caller — RLS alone cannot do this check. A blanket UPDATE policy would also let any write-role member PATCH `title`/`severity` directly, out of scope and a data-integrity regression against `bugs`' current insert-only-via-RPC posture (`0046`).
- `SECURITY DEFINER` with an explicit `p*actor*user*id` (the shape `bunkai*create_bug` shipped and had to retrofit a guard for, pre-merge). Rejected: exactly the class ADR-0012 exists to close.

***Trade-off******:*** with no actor parameter, both RPCs are callable only through a real user session — a `service*role` caller's `auth.uid()` is `NULL`, which always fails `bunkai*can*write*workspace`. Intentional (matches `0023`); `grant execute` goes to `authenticated` only, not `service_role`.

---

## Schema design

***New column******:*** `bugs.assignee*user*id uuid references auth.users(id) on delete set null` — nullable, no default. Same FK shape as `runs.executor*user*id` (`0031:82`) and `bugs.created_by` (`0046`).

***New index******:*** `bugs*assignee*user*id*idx on public.bugs (assignee*user*id)` — mirrors the table's existing per-FK index convention (`bugs*module*id_idx`), sets up future "my bugs" filtering (not built here).

`status`*** + its CHECK constraint unchanged.*** A CHECK constraint cannot see the previous row, so "advance exactly one stage" is enforced procedurally, not as a constraint:

1. ***Primary*** (friendly, AC-specific messages): inside `bunkai*transition*bug_status`, which holds OLD status in the same call.
2. ***Backstop****: extend the **existing* `bunkai*bugs*check_consistency` `BEFORE INSERT OR UPDATE` trigger (`0046`) via `create or replace function` in this migration (append-only — `0046` untouched, mirrors `0039`'s precedent of amending `0038`'s function later) with the same status-adjacency + assignee-eligibility checks, same SQLSTATEs. `security definer` added explicitly this time (0046's original omitted it, relying on its only caller's context).

***Assignee eligibility*** (`bunkai*assign*bug` only): one inline query against `workspace*members` scoped to `(workspace*id = <bug's own, already-authorized workspace>, user*id = p*assignee*user*id, status = 'active')` — no separate helper (single call site; CLAUDE.md §2 no-abstraction-for-single-use). Two distinct SQLSTATEs per the AC's two distinct messages: no active row -> `bug*assignee*not*workspace*member` (45312); active row with `role = 'viewer'` -> `bug*assignee*view_only` (45313).

---

## Types & Type Safety

- `lib/types/supabase.ts` regenerated (generated, not counted toward the review budget).
- New Zod in `lib/bugs/validation.ts`: `BugAssignBodySchema` (`{ assignee*user*id: uuid().nullable() }`), `BugStatusBodySchema` (`{ status: enum(['in_progress','resolved','closed']) }` — `'open'` is never a valid target).
- New wrappers in `lib/supabase/rpc.ts`: `assignBug`, `transitionBugStatus`, mirroring `createBug`'s shape.

## Content Writing

Error copy is the AC's own quoted wording, verbatim, in `lib/bugs/errors.ts`. Four new activity labels (`lib/activity/labels.ts`): `'assigned a defect'`, `'reassigned a defect'`, `'unassigned a defect'`, `'changed a defect status'` — same terse register as existing `module.*` labels, not the fuller narrative the Gherkin quotes (Decision 6).

---

## UI/UX Design

Per CLAUDE.md Rule #14 (Live-UI-First), `BugsListView.tsx` (BK-41) is the surface, not a new screen. Its row already renders id/title/modulePath/severity/status/runLink (lines ~604-655).

***Delta******:***

- ***Assignee cell***: assignee's email (Decision 5) or "Unassigned". Write-role members (existing `canCreateBug` gate) get a member picker calling `POST /bugs/{id}/assign`; Viewers see it read-only (structurally, matching the existing "New bug" button pattern).
- ***Status cell***: existing chip stays; write-role members get one action button labeled with the ONE valid next stage (never a dropdown), so skip/backward is structurally unreachable from the UI. No button when `closed`.

Both call their route, refresh the page, and surface the server error message verbatim (mirrors `fetchBugsPage`'s existing behavior) — satisfies ACs 5-8. No new empty/loading states or breakpoints.

---

## Implementation Steps

### Slice 1: Schema + RPCs + DB-integration tests (1.5 days)

`supabase/migrations/0054*bug*assignment*status.sql` (new): (1) alter `bugs` add `assignee*user*id`; (2) new index; (3) `create or replace` `bunkai*bugs*check*consistency` with the backstop checks; (4-6) `create or replace` `bunkai*bug*json` / `bunkai*list*project*bugs` / `bunkai*list*bugs` (0051) to add `assignee*user*id` to their composed JSON; (7) `bunkai*assign*bug(p*bug*id, p*assignee*user*id default null)` (Decision 1); (8) `bunkai*transition*bug*status(p*bug*id, p*new_status)` (Decision 2); (9) revoke/grant, `authenticated` only.

Edge cases: repeated identical assign/unassign is a silent no-op (no duplicate `activity_log` row, mirrors `0023`'s no-op convention); `closed` has no forward target, naturally caught by the backward/no-path bucket; active-but-non-write caller gets `forbidden` (42501) distinct from a foreign-workspace bug's `P0002` (mirrors `mapBugRpcError`'s existing split).

Testing: `lib/bugs/assign-bug-isolation.test.ts`, `lib/bugs/transition-bug-status-isolation.test.ts` (new, DB-integration per ADR-0012 §5) — legitimate paths, foreign-workspace/Viewer/non-member rejections, skip/backward rejections, all against the real database.

### Slice 2: API routes + error mapping (1 day)

New `app/api/v1/bugs/[id]/assign/route.ts` and `.../status/route.ts` (`POST`, mirrors `runs/[id]/abort`/`finish`'s verb-subpath convention), validated by the Slice-1 Zod schemas, calling `principal.db.rpc(...)`. `lib/bugs/errors.ts` gains cases `45310`-`45313` (verbatim AC wording). `lib/supabase/rpc.ts` gains the two wrappers. `app/api/v1/bugs/list-response.ts` adds `assignee*user*id` to the row shape and batch-resolves distinct assignee ids via `bunkai*resolve*activity_actors` (Decision 5).

Testing: new route tests (happy path + each error mapping + auth boundary); `errors.test.ts`/`list-response.test.ts` updated.

### Slice 3: UI (1 day)

`components/bugs/BugsListView.tsx` (modify) gains the two cells; new small `components/bugs/BugAssignControl.tsx` (member picker); `lib/bugs/list-view.ts` gains `assigneeUserId`/`assigneeEmail`/`nextStatus`.

Testing: `list-view.test.ts` updated; component tests for both controls' happy/error paths.

### Slice 4: Activity feed wiring (0.5 day)

`lib/activity/constants.ts` adds the 4 new actions to `ACTIVITY*ALLOWED*ACTIONS`; `lib/activity/labels.ts` adds their labels; `app/api/v1/activity/response.ts` adds a `deriveItemLabel` case for `bug.status_changed` (`payload.status`) — assignment events fall to the existing generic `"a bug"` fallback (Decision 6). Tests updated for drift coverage.

Note: `bug.filed` (written since `0046`/BK-40) is ***also*** not in `ACTIVITY*ALLOWED*ACTIONS` today — a pre-existing gap, not retrofit here (see Risks).

---

## Technical Decisions

### Decision 1: `bunkai*assign*bug` — six-question checklist (ADR-0012 / rpc-authorization.md §4)

1. ***DEFINER or INVOKER?*** DEFINER — validating the assignee's membership+role needs to read a `workspace_members` row for a user OTHER than the caller, hidden from a non-admin caller by that table's own SELECT policy (`0001`/`0005`). Matches §2's sanctioned reason: "reading a table the caller's role legitimately cannot see."
2. ***Can the identity parameter be removed?*** Yes, and it already is — no `p*actor*user*id`; `auth.uid()` is read directly everywhere an actor is needed. Mirrors `0023` and `0045`'s `bunkai*list_activity` redesign.
3. ***Actor bind at step 0?*** N/A — no caller-supplied identity exists to bind. `auth.uid()` is the only identity, non-spoofable.
4. ***Cross-tenant rows?*** None. Resolves/returns exactly one bug, pre-scoped via `bunkai*is*workspace*member`/`bunkai*can*write*workspace` (both keyed to `auth.uid()`). The one cross-user read (assignee's membership row) is constrained to the bug's own already-authorized `workspace_id`.
5. ***Same error as not-found?*** Boundary failures (foreign/nonexistent bug) collapse into the same `P0002` used everywhere in this codebase (non-disclosure). Business-rule rejections (ineligible assignee, `forbidden` for a non-write caller) are deliberately distinct and human-readable — not a leak, since the caller can already SELECT this bug (`bugs*select*workspace_member` admits any active member), and the ACs require these as visible messages.
6. ***Test?*** `lib/bugs/assign-bug-isolation.test.ts`.

### Decision 2: `bunkai*transition*bug_status` — same six questions

1. DEFINER for the same structural reason (keeps `bugs` mutation uniformly RPC-gated, not half-RPC/half-RLS-policy).
2. Identity parameter removed entirely, same as Decision 1.
3. N/A — none exists.
4. No cross-tenant rows; one already-authorized bug.
5. Boundary -> `P0002`; the two status-rejection messages are deliberately distinct and AC-mandated, same non-leak reasoning as Decision 1.
6. `lib/bugs/transition-bug-status-isolation.test.ts`.

### Decision 3: Migration numbering — 0054, not 0053

`0053*notifications.sql` already exists on this branch (BK-209, `feat/BK-209-notifications-inbox`, off `origin/staging` at `0052`). ***BK-264 is numbered ***`0054*bug*assignment*status.sql` — the next free number — to avoid a merge collision.

### Decision 4: No reusable helper for assignee-role lookup

Inlined in `bunkai*assign*bug` (one call site); a helper would be a single-use abstraction (CLAUDE.md §2).

### Decision 5: Reuse `bunkai*resolve*activity_actors` (ADR-0011) for assignee display

`auth.users` isn't PostgREST-exposed, and no name/email exists anywhere on `workspace*members` today (confirmed: the Members page, `members-client.tsx`, renders the raw `user*id` as a `<code>` string). ADR-0011 explicitly flagged its function for reuse by "any future feature that needs peer-visible identity resolution" (naming BK-208/BK-210). This story reuses it as-is for the distinct `assignee*user*id` values on a bugs page — no new DB function, no new disclosure surface.

### Decision 6: Activity Stream wiring is generic-label, not narrative-sentence

The AC's quoted activity text ("Sara Iglesias moved this defect to in progress") reads as one interpolated sentence, but the live Activity Stream (`ActivityRow`, `components/activity/ActivityView.tsx`) renders three independent cells: actor, a flat non-interpolated `action*label`, and a separate `item.label` (`deriveItemLabel`, per-action payload field, generic `"a <entity>"` fallback). Per Rule #14 (live UI over literal AC narrative), this plan keeps that architecture: a flat label plus, for status changes only, an item label from `payload.status` (mirrors `module.moved` surfacing `payload.new*path`). Read across the row this carries the same information without a broader rendering-architecture change. Assignment events fall to the generic `"a bug"` item label rather than also resolving the assignee's name in this second surface — the AC-mandated, primary assignee display is the bug list's own cell (Decision 5); echoing it here would widen `bunkai*resolve*activity_actors`'s call site to a payload-embedded id, flagged as a boundary, not fixed silently (Open Questions).

### Decision 7: BK-212 handoff payload shape

| Field | Assign/Reassign/Unassign | Status change |
| --- | --- | --- |
| `entity*type` / `entity*id` | `'bug'` / the bug id | same |
| `action` | `bug.assigned` | `bug.reassigned` | `bug.unassigned` | `bug.status_changed` |
| `actor*user*id` | `auth.uid()` of the performer | same |
| `payload` | `{ previous*assignee*user*id, assignee*user*id }` | `{ previous*status, status, assignee*user*id }` |

`status*changed` snapshots the bug's CURRENT `assignee*user_id` too, so BK-212's future producer knows WHO to notify without a live join — mirrors `0053`'s own reason for snapshotting payload at write time.

### Decision 8: Domain glossary gap (flagged, not fixed here)

No "assignee"/"defect assignment" entry in `domain-glossary.md` §3/§4. Not a new entity, just a nullable `Bug` attribute. Flagged for a glossary/`/business-data-map` refresh, not authored inline here.

### Decision 9: `business-data-map.md` §4.4 divergence (flagged, not reconciled here)

That diagram depicts `closed -> open` reopen and an "any -> closed (won't fix)" override, broader than this story's ratified scope (`out-of-scope.md` explicitly excludes reopen: "no current source defines this behavior; flagged separately for the PM to decide"). This plan implements the narrower, Jira-ratified lifecycle only and does not edit that document (owned by `/business-data-map`).

---

## Dependencies

- [x] `bugs` + RLS + `bunkai*bug*json`/`bunkai*list*project_bugs` (0046) — exists.
- [x] `bunkai*list*bugs` (0051) — exists.
- [x] `bunkai*resolve*activity_actors` (0047, ADR-0011) — exists, reused unchanged.
- [x] `workspace_members` role/status model (0001/0005) — exists, unchanged.
- [ ] BLOCKER if violated: `0054` must remain free at merge time — re-verify against `origin/staging` before Stage 2.

## Risks & Mitigations

1. ***Migration-number collision with BK-209 at merge time*** — Medium. Re-check `ls supabase/migrations/` immediately before Stage 2.
2. `activity_log`*** disclosure surface (Decision 1.4/1.5)*** — Low. No new disclosure beyond what the caller can already see; isolation tests assert this.
3. ***Pre-existing ****`bug.filed`**** activity-feed gap left unfixed*** — Low. Deliberately out of scope (ADR-0012's "don't retrofit unrelated things"); tracked in Open Questions.
4. ***Assignee-display asymmetry, bug list vs. Activity Stream (Decision 6)*** — Low. Primary AC-mandated display (bug list cell) is fully resolved; only the secondary echo is generic.

## Estimated Effort

| Step | Time |
| --- | --- |
| Slice 1: Schema + RPCs + tests | 1.5 days |
| Slice 2: API + error mapping | 1 day |
| Slice 3: UI | 1 day |
| Slice 4: Activity feed wiring | 0.5 day |
| ***Total**** | ****4 days*** |

***Story points******:*** unset in Jira (`story.md`: `Story Points: -`) — sized here at ~4 days/~5 SP as a dev-side estimate, not a PO planning-poker result (Open Questions).

## Definition of Done Checklist

- [ ] Code implemented per this plan (4 slices)
- [ ] All 10 AC scenarios passing
- [ ] Every assign/status change attributed to the performing member (`activity*log.actor*user_id = auth.uid()`, non-spoofable)
- [ ] Skip/backward moves rejected with the AC's exact wording
- [ ] Non-member/Viewer assignment rejected with the AC's exact wording
- [ ] Reassign/unassign independent of status; status change independent of assignee
- [ ] DB-integration tests pass against the real database (ADR-0012 §5)
- [ ] `bun run types:check` clean; linting passes
- [ ] Migration applied as `0054*bug*assignment_status.sql` (re-verified free at Stage 2 start)
- [ ] Code review approved with explicit actor-bind/result-scoping sign-off (ADR-0012 Stage 3)
- [ ] Deployed to staging; no critical/high bugs open
- [ ] Manual smoke test: assign/reassign/unassign, all 4 transitions, both rejection paths

## Open Questions

- No "assignee"/"defect assignment" glossary entry (Decision 8) — flag for glossary/`/business-data-map` refresh.
- `business-data-map.md` §4.4 broader than ratified scope (Decision 9) — flag for reconciliation post-ship.
- BK-212's own Stage 1 plan predates this story and may need revisiting against Decision 7's exact handoff shape.
- `bug.filed` not in `ACTIVITY*ALLOWED*ACTIONS` — pre-existing gap, not fixed here.
- Story Points unset in Jira; this plan's 4-day/~5SP is a dev-side placeholder only.

---

## Review Workload Forecast

Estimated: 1974 additions + 144 deletions = 2118 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace:
Decided by: n/a
Decision needed before apply: Yes

Notes: `lib/types/supabase.ts` (typegen output) excluded per the generated-code override. The 4 slices decompose naturally into a `stacked-to-main` layout, but that choice and its trace are `/git-flow-master`'s to make (Stage 1 does not resolve High-risk chain decisions).

---
_Synced from Jira by sync-jira-issues_
