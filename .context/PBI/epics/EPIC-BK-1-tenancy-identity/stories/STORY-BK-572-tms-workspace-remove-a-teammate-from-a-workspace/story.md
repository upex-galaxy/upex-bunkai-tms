# TMS-Workspace | Remove a teammate from a workspace

**Jira Key:** [BK-572](https://jira.upexgalaxy.com/browse/BK-572)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** QA Lead / Quality Engineering Manager who administers a Workspace

***I want to*** remove a teammate from that Workspace from the members screen

***So that*** access ends the day someone leaves the team, without asking anyone at Bunkai to do it and without deleting the whole Workspace to achieve it

## Definition of done

- [ ] A Remove action exists on the members screen, on the rows the caller is allowed to act on and on no others
- [ ] An Admin looking at an Owner's row sees no Remove affordance at all — absent, not present-and-refused
- [ ] Confirming names the person and states the two consequences before anything happens: their Personal Access Tokens for this Workspace stop working, and the Bugs assigned to them become unassigned
- [ ] Access ends at once, and it ends completely — no surviving credential reaches the Workspace afterwards
- [ ] Removing the last remaining Owner is refused, and removing yourself through this action is refused and points at Leave instead
- [ ] Everything the removed teammate authored stays attributed to them, and who used to hold each Bug stays answerable
- [ ] The removal is one all-or-nothing act — a failure leaves the membership, the Personal Access Tokens and the Bug assignments exactly as they were
- [ ] The same refusals hold when the data is reached directly through the API rather than through the screen
- [ ] The removal is recorded in the Workspace Activity Stream, and the freed Seat is reflected in the Workspace's Seat count

## Context

A Workspace can invite a teammate but can never remove one. `app/api/v1/workspaces/[id]/membership/route.ts` documents itself as removing ***the caller's own*** active membership row and calls `leaveWorkspace(db, { workspaceId })` with no target user at all. The members screen ships invite, revoke-invite and resend, and nothing else. So once an invite is accepted, nobody — not an Admin, not the Owner — can revoke that person's access. The only lever that exists today is deleting the entire Workspace (BK-512), which is not a proportionate answer to one person leaving the team.

This is not BK-90 and the two must never be read as duplicates. BK-90 ships ***leaving***: the caller ends their own membership and the Workspace carries on without them, with a sole-owner block that refuses the leave so a Workspace is never orphaned. This story is the administrative counterpart: someone else ends a teammate's membership. Leave is a first-person act; removal is a second-person act, and their guards are deliberately different — see the Technical decisions below.

***There is a live authorization gap this story must close, not just work around.**** The row-level security policy `workspace*members*delete*admin` (defined in `0001*tenancy.sql`, redefined at `0005*rls*helpers.sql:145-146`) is `for delete using (public.bunkai*is*workspace*admin(workspace*id))` — no rank check and no self-protection — and the `workspace_members` table is exposed through the data API. A Workspace Admin can therefore delete an Owner's membership row by hand ****today***, before this story ships anything. Adding a check in the route while that policy stays as it is would ship a bypass with a lock painted on it. Narrowing the policy is part of this story's scope, and the proof has to be a test that goes at the table directly rather than through the route.

## Technical decisions

Every semantic below was settled by the AI Tech Lead ruling posted as a comment on this story. It is the fixed contract for the implementing run; do not re-open it there.

- ***Who may remove.**** Owner and Admin — the `bunkai*is*workspace_admin` set. The rule is that ****a caller may remove a target whose role does not outrank the caller's***, on the ladder viewer < member < admin < owner. So an Admin removes viewer / member / admin, and only an Owner removes an Owner. Admin-removes-admin stays allowed because an Admin can invite an Admin, and the undo must match the create.
- ***The RLS policy is in scope.**** Narrow `workspace*members*delete_admin` to encode the same ladder plus self-protection. The acceptance test for this is a database-integration test that attempts the delete ****directly through the data API*** as an Admin targeting an Owner and asserts denial. A route test cannot prove this and must not be accepted as proof.
- ***Four refusal paths, with exact codes.**** A target who is not a member of the Workspace, and a Workspace the caller cannot see, must be indistinguishable: both raise `P0002` and surface as `404`. Removing the last remaining Owner raises the existing `45213` `sole*owner` and surfaces as `409`. Removing yourself raises a new `45215` `cannot*remove*self` and surfaces as `409`, pointing at the existing leave endpoint. An Admin targeting an Owner raises a new `45216` `cannot*remove_owner` and surfaces as `403`. ****Verified free at authoring time******:*** the `452xx` block at `origin/staging` runs to `45214`, so `45215` and `45216` are both unclaimed. Re-verify before writing the migration, since branches merge out of order.
- ***Both guards enforced twice.*** The route rejects early and the RPC re-checks, per migration `0044`'s stated posture that the RPC must not trust the client.
- ***One transaction.*** Deleting the membership row, soft-revoking the target's Workspace-scoped Personal Access Tokens, unassigning their Bugs and writing the removal Activity event all happen inside one `SECURITY DEFINER` RPC. A partial failure that ends access but leaves Personal Access Tokens live is the worst outcome available here, so it must not be reachable.
- ***Personal Access Token scope.**** Soft-revoke only the Personal Access Tokens scoped to this `workspace*id`. Global Personal Access Tokens (`workspace*id is null`) are ****not*** touched — they serve the holder's other Workspaces, and revoking them would let one tenant break access to unrelated tenants.
- ***Bug assignment.*** Reuse `bunkai*assign*bug(bug*id, null)`. It already emits a `bug.unassigned` Activity event carrying `previous*assignee*user*id`, and `0056` defines no recipient for that event, so the audit trail stays complete and no Notifications are sent.
- ***Concurrency.**** The new function takes `select ... for update` on the owner rows before counting. Migration `0044`'s own documented race is ****not*** retrofitted here — per ADR-0012 a story must not smuggle an unplanned security change into its diff. File it separately.
- ***Actor binding, for the reviewer.**** The actor is bound on the ****caller**** via `auth.uid()`. The target user id is a parameter, and it is authorized by the ladder — it is ****not*** an unbound actor parameter, and must not be read as one.
- ***ADR-0012 applies mechanically.*** This story touches `supabase/migrations/`, so the six authoring questions in `.claude/skills/sprint-development/references/rpc-authorization.md` are answered before any SQL is written, and the database-integration test ships in the same slice.
- ***Endpoint posture.**** Because self-targeting is rejected, the removal endpoint follows the ****invites*** precedent rather than the leave precedent: `requires: ['workspace:admin']` plus `assertWorkspaceContext` per ADR-0006, with Personal Access Token callers allowed. It is the self-rejection that makes that safe.
- ***New Activity event term.**** The removal writes a `member.removed` Activity event. That name is ****not yet in*** `.context/business/domain-glossary.md` §3 and must be added there under the Activity event vocabulary before or with implementation.
- ***ADR recommended.*** ADR-0014 — Workspace membership authorization ladder and member-removal semantics, `Status: Proposed`, scoped to the ladder, its RLS enforcement and the hard-delete posture. Not authored yet; authoring it is part of the implementing run.

## Design note — for the implementing run

No mockup draws member removal. Per Critical Rule #14 the current live UI is the source of truth: the Remove control belongs in the existing member row in `app/(app)/workspaces/[id]/members/members-client.tsx`, reusing the destructive-confirmation idiom the product already ships, and reusing the frozen tokens. Do not invent a new destructive pattern and do not re-pick colors, radii or spacing. Deriving from the existing idioms with no mockup of its own is a ***spec-only departure*** under Critical Rule #15 and must be ratified as a §5 row in `.context/design/master-design-plan.md`, together with this story's §8 US-to-Screen row, before implementation starts.

## Provenance

Authored 2026-08-21 against the AI Tech Lead ruling posted as a comment on this story, which settles the seven open semantics of member removal. All code findings in this description were measured against `origin/staging`. This story has ***not*** been through shift-left QA refinement — that pass is still owed and is tracked as a QA-authoring gap, not as a blocker on the semantics.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 8/21/2026
- **Updated:** 8/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
