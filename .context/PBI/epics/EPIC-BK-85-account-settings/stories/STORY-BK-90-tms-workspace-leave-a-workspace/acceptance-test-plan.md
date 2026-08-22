# BK-90 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

## ATP DRAFT — Test Outlines (Shift-Left)

> Outline names + one-line precondition/expected only — full parametrization deferred to in-sprint test planning (`/sprint-testing` Stage 1).

> ***INFO:*** Confirm-dialog mechanism (simple confirm/cancel vs. type-to-confirm) is still an open Design question — see the note at the end of this document. Outline 1 below is written mechanism-agnostic on purpose.

### Positive

1. ***Should show a confirmation naming the workspace, then remove membership and fall back to the user's other workspace as active*** — Pre: Mateo belongs to "Fintech Audit" (active) and "Acme QA". Expected: confirm dialog names "Fintech Audit"; on confirm, "Fintech Audit" disappears from list and "Acme QA" becomes active. (Scenario 1, refined)
2. ***Should allow a co-owner to leave a workspace that retains another owner*** — Pre: "Acme QA" has 2 members with role "owner" (Mateo + Lena). Expected: "Leave workspace" is available to Mateo; after leaving, "Acme QA" remains intact with Lena as owner. (New Scenario C — confirmed 2026-07-31, unaffected by mockup)
3. ***Should leave content authored in the left workspace fully intact and inaccessible to the leaving user, and auto-revoke the workspace-scoped PAT*** — Pre: Mateo authored ATCs/stories in "Fintech Audit" before leaving and holds a "Fintech Audit"-scoped PAT. Expected: ATC/story counts in "Fintech Audit" unchanged; Mateo can no longer view them; the PAT is auto-revoked as part of the same leave transaction. (New Scenario B — confirmed 2026-07-31, PAT clause added per Dev answer)

### Negative

1. ***Should block "Leave workspace" for the sole owner and show the reason*** — Pre: Mateo is the only `role = 'owner'` member of "Acme QA". Expected: action unavailable/disabled; explanatory sole-owner message shown. (Scenario 2, refined; confirmed by mockup's "sole owner" / "Can't leave" state)
2. ***Should block "Leave workspace" (not render it) for a user's only remaining workspace*** — Pre: Mateo belongs to exactly one workspace, "Fintech Audit" (not sole owner). Expected: "Leave workspace" does not render for this workspace — same treatment as the sole-owner block above; no confirmation dialog is reachable. (New Scenario A — CORRECTED 2026-08-05: mockup's "state:single-workspace" panel overrides the earlier "route to /onboarding" answer)

### Integration

1. ***Should re-resolve the active workspace immediately after leaving, consistent with BK-86's active-workspace resolution rule*** — Pre: Mateo's active workspace is the one being left. Expected: post-leave, `active*workspace*id` / `bk*active*ws` resolves to the remaining workspace per the same ordering rule used at sign-in (BR-1), and the global chrome reflects it immediately without a manual refresh.

### Coverage Estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 3 | Outlines 1, 2, 3 — confirmation + fallback flow, co-owner leave, non-cascade content check |
| Negative | 2 | Outlines 4, 5 — sole-owner block, single-workspace block |
| Integration | 1 | Outline 6 — active-workspace resolution re-run after leave |

***Total******:****** 6 outlines*** across 2 refined existing scenarios + 3 new inferred scenarios + 7 identified edge cases (folded into outlines above rather than each spawning a dedicated outline).

## Open question carried into /sprint-testing

> ***WARNING:*** Confirm-dialog mechanism for "Leave workspace" (simple confirm/cancel naming the workspace, vs. type-to-confirm) has no design-authoritative answer. Resolve with Design/Dev before parametrizing Outline 1 at the interaction level in Stage 1.

---
_Synced from Jira by sync-jira-issues_
