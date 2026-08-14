# BK-264 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

## BK-264 TEST RESULTS

***Tested******:*** 2026-08-14
***Environment******:*** Staging
***Tester******:*** floresv.luis@gmail.com
***Result******:*** PASSED (19/19 executed, 1 deferred)

### Summary

Tested the full defect-assignment and status-lifecycle feature on `BugsListView.tsx` plus the two new API routes (`/bugs/{id}/assign`, `/bugs/{id}/status`) and their backing `SECURITY DEFINER` RPCs. Coverage ran across UI, API, and DB layers per the 20-outline ATP (10 mapped 1:1 to the AC floor, 10 risk-beyond-AC). All 10 original ACs verify cleanly: assignment eligibility (member/owner eligible, non-member and Viewer-role rejected), the full open → in progress → resolved → closed chain, skip-stage and backward-move rejection with a DB-level backstop, reassignment, and unassignment. Actor-side authorization (Viewer attempting a write), non-spoofable attribution, assign/status independence, and the `notifications` row written on assignment (the event BK-212 will subscribe to) were all confirmed. One outline — assigning to a former/inactive member — could not be executed this session; see Deferred below. Zero defects found.

### Test Cases

| # | Outline | Status |
| --- | --- | --- |
| 1 | Assign open defect to eligible member/owner | PASSED |
| 2 | Reject assign to non-member email | PASSED |
| 3 | Reject assign to inactive/former member | DEFERRED — see below |
| 4 | Reject assign to Viewer-role member | PASSED |
| 5 | Reassign to a different eligible member | PASSED |
| 6 | No-op on reassign to current assignee | PASSED |
| 7 | Unassign | PASSED |
| 8 | Reject assign/reassign/unassign by Viewer-role actor | PASSED |
| 9 | Non-disclosing not-found on cross-workspace bug id | PASSED |
| 10 | open -> in progress | PASSED |
| 11 | in progress -> resolved | PASSED |
| 12 | resolved -> closed, by non-assignee Member+ actor | PASSED |
| 13 | Reject skip-stage transitions (3 param rows) | PASSED |
| 14 | Reject backward transitions (3 param rows) | PASSED |
| 15 | Same-status re-entrancy probe | PASSED — resolved, folds into backward-rejection bucket (see Observations) |
| 16 | Reject status change on closed (terminal) defect | PASSED |
| 17 | Reject status change by Viewer-role actor | PASSED |
| 18 | Assignment and status are mutually independent | PASSED |
| 19 | Attribution is non-spoofable across distinct actors | PASSED |
| 20 | `notifications` row written on assignment (DB) | PASSED |

***Pass rate (executed items)******:****** 19/19 = 100%.*** Outline #3 is not counted against the pass rate — it did not run (see Deferred).

### Probe Outcomes

- ***Same-status re-entrancy (outline #15)******:*** requesting a bug's current status again returns 422, `status*transition*backward`, message "A bug's status cannot move backward." Same-status is deliberately folded into the backward-rejection bucket rather than given a distinct code. Functionally safe (no unintended state change) — documented behavior, not a defect. The message text is slightly imprecise for a same-status request specifically; noted under Observations, non-blocking.
- ***Inactive-member assignment (outline #3) — DEFERRED, not executed******:*** there is no API endpoint to move a `workspace_members` row out of `status='active'` in the current 82-endpoint catalog, and direct DB writes were unavailable to this session (read-only DB role; the harness's safety classifier blocked a direct RW fallback). This is a test-environment limitation, not a failed AC and not a product defect. Follow-up options: add a test-only "suspend member" endpoint, or accept this as a permanently DB-fixture-gated manual/deferred TC in Stage 4.

### Test Data

- Workspace: BK-264 QA Sandbox (`6646f244-a28c-441e-8486-9af33bdb5c11`)
- Project: BK264 Defect Triage / Module: Defect Triage Module
- Identities: 1 Member-role invitee, 1 Viewer-role invitee, 1 throwaway (inactive-member probe, could not be set inactive), staging owner reused as reassignment target
- 17 fresh bugs filed for isolated fixtures

### Bugs Found

None.

### Observations

1. Assignee-picker labeling is inconsistent (cosmetic): the owner option shows the full email, the member option shows a truncated user id instead of an email. Non-blocking UI polish item.
2. The 403 `reason` slug (`not*a*member`) is imprecise for a genuine Viewer actor, who IS an active member, just without write access. The 403 outcome itself is correct per AC; only the reason text is misleading. Non-blocking.
3. Domain glossary has no "assignee" / "defect assignment" entry yet — documentation gap, non-blocking, flagged for a future glossary refresh.
4. `business-data-map.md` anticipates a broader `closed -> open` reopen path than this story's ratified scope. Confirmed out of scope for this pass per `out-of-scope.md` — no action needed.
5. Outline #3 (inactive-member assignment) is deferred pending a test-environment capability that does not exist today (no "suspend member" endpoint, no RW DB fallback available to this session). Recommend either a test-only endpoint or accepting this as a manual/deferred TC in Stage 4.
6. BK-264's payload dependency for BK-212 (Notifications) was cross-validated this session: a concrete `notifications` row was captured on assignment and shared with BK-212 as informational context (see cross-ticket comment on BK-212).

### Recommendations

- Story is a strong automation candidate: the state-transition matrix (skip/backward/valid hops) and the eligibility decision table (role x membership) are both stable, deterministic, and high-value regression coverage.
- Outline #3 should be revisited once a "suspend member" test path exists, either via a dedicated test-only endpoint or an approved DB seed script with elevated privileges.

---
_Synced from Jira by sync-jira-issues_
