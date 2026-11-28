# ADR-0029 — Bug bulk edit: one batch function, one field per request, the single-Bug rules per Bug

- **Status:** Proposed
- **Date:** 2026-11-28
- **Deciders:** AI Product Owner (P1 to P10) and AI Tech Lead (T1 to T6) on BK-2098, Bunkai rule AI-LED-DECISIONS
- **Tags:** api, bugs, bulk-edit, concurrency, authorization, data-model
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** —

---

## Context

BK-2098 lets a writer select Bugs on a Project's Bug Reports list and change their status or their severity in one confirmed action. The single-Bug paths already exist and stay as they are: `bunkai_transition_bug_status` (0054) moves one Bug one stage forward and writes `bug.status_changed`, which the notification trigger turns into notices; `bunkai_correct_bug` (0129) corrects content, bumps `content_version` and writes `bug.corrected`, which notifies nobody. Both read `auth.uid()` and are granted to `authenticated`, so a PAT caller of a batch route could not reach them with an explicit actor. Migration 0145 left Bug writes to database functions only. The database is shared with production (MVP-ONE-DATABASE), so no existing function may change shape.

## Decision

We will add ONE new SECURITY DEFINER function, `bunkai_bulk_edit_bugs` (migration 0146), behind `POST /api/v1/bugs/bulk-edit`, mirroring ADR-0027's batch contract.

1. **One field per request: `status` or `severity`.** The change object carries exactly that one key; a second key or an unknown one is a request-level error, at the route (strict Zod) and in the function.
2. **Status follows the single-Bug lifecycle per Bug.** The stage already held is `unchanged`; the next stage changes; further ahead is refused `status_transition_skipped`; behind is refused `status_transition_backward`. `open` is a valid target for the API and never changes anything (P10). The rule lives in the function; the consistency trigger stays the backstop.
3. **Severity: no-op before stale.** An equal value is `unchanged` whatever version is sent. Otherwise an item `version` that differs from `content_version` refuses that Bug `stale_version`; no version skips the check (P5). An effective change bumps `content_version`.
4. **Events are the single-Bug events plus `bulk: true`.** Status writes `bug.status_changed` with `previous_status`, `status` and the assignee at that moment, so the existing trigger notifies the reporter and the assignee exactly as a single change does (P4). Severity writes `bug.corrected` with `title` and `changes.severity` (T3). No new event type.
5. **Per-Bug subtransaction, partial success is normal.** One Bug failing is refused `write_failed` and rolls back only its write and event. `42501` (the write gate, re-checked after each lock) and `45701` (the read-only lock) are re-raised and abort the whole call (T2).
6. **Locks.** Bugs are locked `FOR NO KEY UPDATE` one at a time in id order; no member row is locked, so a concurrent member removal can at worst refuse one Bug as `write_failed`.
7. **Gate order (T4).** Route: body, Project visible to the caller (404), a workspace-scoped token bound to the Project's workspace (403 `token_workspace_mismatch`). Function: actor bind at step 0, unknown Project, deleted workspace or no active membership (P0002, 404), viewer (42501, 403 `insufficient_role`), read-only Project (45701, 422, dry run included), then per Bug.
8. **Non-disclosure.** Every Bug read or written is constrained to `p_project_id`; a Bug of another Project or workspace and an unknown id are the same `not_found` with null fields (P6).
9. **Preview then write.** `dry_run` runs the same evaluation with no lock, write, event or notification, and reports the would-be values.
10. **Ceiling and duplicates.** At most 200 items; a repeated id is evaluated once with the lowest version sent.
11. **Authorization (ADR-0012).** Execute is granted to `service_role` only and revoked from `public`, `anon`, `authenticated`, `qa_inspector_ro` and `qa_inspector_rw`; the route calls it through the admin client with the principal as the actor.
12. **Read model.** `bunkai_list_bugs` returns `content_version` on every row (T6), so the list can send the version the user saw. Its body is otherwise copied forward unchanged.

## Consequences

- **Positive:** one triage action with an honest per-Bug report; the single-Bug routes, functions and their grants are untouched; notifications and the activity feed need no change.
- **Negative / trade-offs:** each changed Bug is its own subtransaction with its own transaction id, so a call over more than 64 Bugs overflows the per-backend subtransaction cache for its duration, and a lock held by a long transaction stalls the call with no `lock_timeout`; both are shared with the ATC bulk edit (0124) and accepted for a 200-Bug ceiling. A second function writes `bugs.status` and `bugs.severity`, so a future change to either rule touches two places. A 200-Bug status change can create up to 400 notifications, the same volume 200 single changes would. The preview is advisory.
- **Neutral / follow-ups:** `bunkai_transition_bug_status` reads the status without a lock, so a bulk change landing between its read and its update can produce a second `bug.status_changed` with a stale `previous_status`; bulk itself locks before it reads. Bulk owner reassignment and selection on the workspace `/bugs` index are separate stories. The single-Bug routes do not bind a workspace-scoped token to the Bug's workspace; that is recorded as a follow-up, not changed here.

## Alternatives considered

- **Loop the single-Bug functions from the route:** rejected (T1, 3). They read `auth.uid()`, so a PAT caller cannot use them, and the per-Bug report would become a client concern.
- **An `auth.uid()` function granted to `authenticated`:** rejected (7 against 8). The route serves cookie and PAT callers through one admin path, as the ATC and Test bulk edits do.
- **All-or-nothing:** rejected (T2, 4). One stale Bug would discard every valid change.
- **A new `bug.severity_changed` event:** rejected (T3, 4). The feed would not show it and it would duplicate `bug.corrected`.
- **Leave the token workspace unbound, as the ATC bulk route does:** rejected (T4, 4).

## References

- ADR-0012 (RPC authorization invariant), ADR-0027 (ATC bulk edit), ADR-0028 (over-limit projects read-only)
- `0054_bug_assignment_status.sql`, `0129_bug_content_correction.sql`, `0140_billing_downgrade_cancel.sql`, `0146_bug_bulk_edit.sql`
- `.context/design/master-design-plan.md` §5 D86, §4.32
