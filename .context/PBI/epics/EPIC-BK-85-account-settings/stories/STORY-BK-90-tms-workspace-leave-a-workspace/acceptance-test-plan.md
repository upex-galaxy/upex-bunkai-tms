# BK-90 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

# BK-90 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

## ATP DRAFT — Test Outlines (Shift-Left)

> Outline names + one-line precondition/expected only — full parametrization deferred to in-sprint test planning (`/sprint-testing` Stage 1).

### Positive

1. ***Should show a confirmation naming the workspace, then remove membership and fall back to the user's other workspace as active*** — Pre: Mateo belongs to "Fintech Audit" (active) and "Acme QA". Expected: confirm dialog names "Fintech Audit"; on confirm, "Fintech Audit" disappears from list and "Acme QA" becomes active. (Scenario 1, refined)
2. ***Should allow a co-owner to leave a workspace that retains another owner*** — Pre: "Acme QA" has 2 members with role "owner" (Mateo + Lena). Expected: "Leave workspace" is available to Mateo; after leaving, "Acme QA" remains intact with Lena as owner. (New Scenario C — NEEDS PO/DEV CONFIRMATION)
3. ***Should leave content authored in the left workspace fully intact and inaccessible to the leaving user*** — Pre: Mateo authored ATCs/stories in "Fintech Audit" before leaving. Expected: ATC/story counts in "Fintech Audit" unchanged; Mateo can no longer view them. (New Scenario B — NEEDS PO/DEV CONFIRMATION)

### Negative

1. ***Should block "Leave workspace" for the sole owner and show the reason*** — Pre: Mateo is the only `role = 'owner'` member of "Acme QA". Expected: action unavailable/disabled; explanatory sole-owner message shown. (Scenario 2, refined)

### Boundary

1. ***Should handle leaving the user's only remaining workspace*** — Pre: Mateo belongs to exactly one workspace, "Fintech Audit" (not sole owner). Expected: per PO answer — either routed to onboarding with zero memberships, or "Leave workspace" blocked as a last-membership guard. (New Scenario A — NEEDS PO/DEV CONFIRMATION)

### Integration

1. ***Should re-resolve the active workspace immediately after leaving, consistent with BK-86's active-workspace resolution rule*** — Pre: Mateo's active workspace is the one being left. Expected: post-leave, `active*workspace*id` / `bk*active*ws` resolves to the remaining workspace per the same ordering rule used at sign-in (BR-1), and the global chrome reflects it immediately without a manual refresh.

### Coverage Estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 3 | Outlines 1, 2, 3 — confirmation + fallback flow, co-owner leave, non-cascade content check |
| Negative | 1 | Outline 4 — sole-owner block with reason |
| Boundary | 1 | Outline 5 — leaving the only workspace |
| Integration | 1 | Outline 6 — active-workspace resolution re-run after leave |

********Total******:****** 6 outlines**** across 2 refined existing scenarios + 3 new inferred scenarios + 7 identified edge cases (folded into outlines above rather than each spawning a dedicated outline).

---
_Synced from Jira by sync-jira-issues_
