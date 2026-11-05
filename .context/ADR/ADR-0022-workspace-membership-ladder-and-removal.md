# ADR-0022 — Workspace membership authorization ladder and member-removal semantics

- **Status:** Proposed
- **Date:** 2026-11-02
- **Deciders:** AI Tech Lead (Bunkai rule AI-LED-DECISIONS); ruling of 2026-08-21 and the 2026-10-26 PO / Dev answers on BK-572
- **Tags:** authorization, rls, tenancy, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Until BK-572 a Workspace could invite a teammate but never remove one, and the data layer was more permissive than any screen: the `workspace_members` DELETE, UPDATE and INSERT policies (`0005_rls_helpers.sql`) only asked `bunkai_is_workspace_admin(workspace_id)`. The table is exposed through PostgREST, so an Admin could delete an Owner's row, demote an Owner, or promote their own row to `owner` by hand. A rank check in a route over those policies would be decorative.

The schema already treats Owner as a tier the admin machinery does not reach: `workspace_invites.role` excludes `owner`, and ADR-0015 assumes one Owner per Workspace. No shipped flow writes `workspace_members` through a user session: the accept route uses the service role, and bootstrap (`0006`) and leave (`0044`) are SECURITY DEFINER.

## Decision

1. **The ladder.** Roles rank viewer 1 < member 2 < admin 3 < owner 4. A caller may delete, update or insert a membership only when the caller is an active Admin or Owner of a live Workspace, the row is not the caller's own, and the row's role (old and new, for an update) does not outrank the caller's. An Admin removes or edits a Viewer, a Member or another Admin; only an Owner reaches an Owner row. This is enforced in RLS (`0114_workspace_member_removal.sql`) through two helpers, `bunkai_workspace_role_rank(text)` and the SECURITY DEFINER `bunkai_caller_workspace_rank(uuid)` (a raw self-reference inside the table's own policy trips 42P17, `0084a`). Every future membership-mutating surface inherits this rule.
2. **Removal is one SECURITY DEFINER RPC**, `bunkai_remove_workspace_member(p_workspace_id, p_user_id)`. The actor is `auth.uid()`; the target is a parameter authorized by the ladder (ADR-0012). One transaction unassigns the target's Bugs through `bunkai_assign_bug`, soft-revokes the target's PATs scoped to this Workspace (never the global ones), revokes pending invites addressed to the target's email, deletes the row and writes `member.removed`. Refusals: `P0002` for a non-member target and for an invisible or deleted Workspace (indistinguishable), `42501` for a caller who is not Admin/Owner, `45220` `cannot_remove_self` (self-removal is Leave's job), `45221` `cannot_remove_owner`, `45213` `sole_owner` as a backstop that the ladder makes unreachable today. Caller, target and active Owner rows are locked `for update` in `user_id` order, and the caller is re-validated after the lock.
3. **Hard delete.** Removal deletes the row; it is not `status = 'suspended'`. Re-invitation is the only reversal; tenure is lost and revoked PATs stay revoked. This diverges from ADR-0013/ADR-0015's soft delete on purpose: removal destroys four scalars, not a cascade, and `0044` already hard-deletes for the sibling operation.
4. **Actor resolution widens by one rule.** `bunkai_resolve_activity_actors` (ADR-0011) also resolves an id that is the `entity_id` of a `member.removed` row in the same Workspace, so the entry names the removed teammate even if they never acted there. A current member could already see that teammate's email while they were a member.
5. **A test failpoint table exists in the production schema.** `bunkai_test_failpoints(name, workspace_id)` has RLS on, no policies, and no privilege for any user role or QA database role. The removal RPC raises `test_failpoint` when `member_remove.before_event` is armed for its own Workspace, after every other write, which is how the all-or-nothing property (AC-14) is proven against the real database. Only the service role can arm it, and only per Workspace.

## Addendum (2026-11-05, BK-1589)

Decided by the BK-1589 AI Product Owner ruling of 2026-11-05 and implemented in `0118_member_write_paths_locked.sql`. Decisions 2-5 above stand. Decision 1 and the follow-up on the co-owner leave race change as follows; the original text stays as the record of what BK-572 shipped.

1. **The ladder no longer lives in RLS policies, because no user session writes membership at all.** The INSERT, UPDATE and DELETE policies of `workspace_members` are gone and those table privileges are revoked from `anon` and `authenticated`. The 0114 policies still let an Admin add a lower-ranked row with no invite and delete one with none of the removal side effects. A trigger replaying those side effects was rejected, since two code paths to one operation drift. The rank rule itself stands, enforced inside the RPCs. A future membership-mutating surface is an RPC, and a role-change feature would add one.
2. **One global lock order for membership work:** member rows in `user_id` order, then the workspace, then the invite row, with Bugs after the member rows. `bunkai_assign_bug` locks the assignee's row before touching the Bug. `bunkai_leave_workspace` takes the removal lock, which closes the `0044` co-owner race this ADR had left as separate debt.
3. **Invite accept is one SECURITY DEFINER RPC,** `bunkai_accept_workspace_invite(p_invite_id, p_user_id)`, granted to `service_role` only because the route serves PAT callers through the admin client. Under lock it re-validates the inviter: a null, removed or inactive inviter, or one who is not an Admin or Owner or ranks below the invited role, gets 409 `inviter_not_authorized`. The invite stays listed so an Admin can revoke it. This tightens one line of the BK-572 PO-1 ruling ("invites the removed teammate issued are left alone"), security over onboarding convenience.
4. **Leave keeps its own side effects.** It deletes the row and revokes scoped PATs; it does not unassign Bugs or revoke invites, unlike removal. See the BK-1589 AI Tech Lead decision.

## Consequences

- **Positive:** the ladder holds whether a request comes through the screen, the API or PostgREST directly; a removed teammate keeps no credential that reaches the Workspace; authorship and the "who held this Bug" trail survive.
- **Negative / trade-offs:** an Admin can no longer edit their own membership row through the data API (no product flow did). Role change as a feature still needs its own story. The failpoint table is test machinery living in the production schema; the cost is one empty, unreachable table and one indexed `exists` per removal.
- **Neutral / follow-ups:** `0044`'s documented co-owner leave race is not retrofitted here (ADR-0012: no unplanned security change in a story diff); it stays separate debt. Ownership transfer would make `sole_owner` reachable, and the RPC already guards it.

## Alternatives considered

- **Route-only ladder check** — rejected: PostgREST reaches the table directly, so the check is bypassable in one request.
- **Narrow DELETE only** — rejected (PO-2): an Admin could promote their own row to `owner` first and then pass every delete check.
- **Inline subqueries in the policies** — rejected: 42P17 infinite recursion on the table's own policy.
- **Suspension instead of deletion** — rejected: a different, reversible product action with its own ticket.
- **Code review plus a mocked route test for AC-14** — rejected as the only proof: it says nothing about the database transaction.

## References

- BK-572 ruling (2026-08-21), PO / Dev / Designer answers (2026-10-26), AI Tech Lead decision (2026-11-02, comment 13350)
- `supabase/migrations/0114_workspace_member_removal.sql`, `lib/workspaces/member-removal-isolation.test.ts`
- ADR-0011 (activity actor resolution), ADR-0012 (RPC authorization invariant), ADR-0013 / ADR-0015 (workspace deletion)
