# BK-202 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-202)

# Acceptance Test Plan (ATP) — Shift-Left DRAFT

> Condensed for the Jira ATP field's content limit. Full analysis (Critical Analysis, Story Quality Analysis detail, per-outline preconditions) lives in the local working file: `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-202-tms-test-plan-create-a-test-plan-grouping-tests-fo/shift-left-refinement.md`.

## Refined Acceptance Criteria (19 scenarios)

1. Create a test plan with name, description, and goal (explicit)
2. Create a minimal test plan with name only (explicit)
3. Accept a test plan name at exactly the 100-character boundary (explicit)
4. Reject a test plan name exceeding the 100-character boundary (explicit)
5. Accept a test plan name that trims to exactly 1 character (explicit)
6. Reject a duplicate plan name differing only by case (explicit)
7. Reject a duplicate name padded with leading/trailing spaces (explicit)
8. Allow the same plan name to be reused in a different project (explicit)
9. Reject a duplicate name padded with a tab or non-breaking space — NEEDS PO/DEV CONFIRMATION
10. Reject a plan rename that collides with another existing plan's name — NEEDS PO/DEV CONFIRMATION
11. Reject one of two concurrent create requests for the same plan name (race condition) — NEEDS PO/DEV CONFIRMATION
12. Reject a whitespace-only plan name (explicit)
13. Reject an empty-string plan name (explicit)
14. Reject a name made only of tab/newline whitespace — NEEDS PO/DEV CONFIRMATION
15. Hide the create-plan option from a viewer-role user (explicit)
16. Reject a direct API create-plan request from a viewer-role user — NEEDS PO/DEV CONFIRMATION
17. Allow a member-role user to edit an existing plan they did not create (explicit)
18. Reject a viewer's inline-edit attempt on an existing plan (explicit)
19. Re-verify role server-side even with a stale client-cached role — NEEDS PO/DEV CONFIRMATION

## Outline Coverage Estimate

- Positive: 6
- Negative: 6
- Boundary: 3
- Integration: 4
- ***Total******:****** 19*** (13 explicit, 6 NEEDS PO/DEV CONFIRMATION)

## Open Questions for PO / Dev

### Critical (block sprint planning)

1. Should BK-202 stay in Estimation until epic BK-24 (Tests) ships, or is the plan container decoupled enough to build and estimate now against a stub? BK-202's own AC set never reads/writes ATC/Test data — it is a pure container (name/description/goal). "Test Plan" has zero footprint across the current data/API/feature maps.
2. Is Delete ever planned for a Test Plan, or is Close (sibling story BK-207) the only way a plan leaves the "Open" state, making Delete permanently out of scope for the whole epic?
3. Is the "member role or higher" gate on create/edit enforced server-side, independent of the UI hiding the affordance, and does it re-check the live role at submit time rather than trusting a client-cached role?
4. Does renaming an existing plan re-trigger the same case-insensitive, trimmed uniqueness check as creation?

### Technical (block implementation)

1. What is the exact, verbatim error-message copy for the duplicate-name rejection (AC3) and the blank-name rejection (AC4)?
2. Does "compared after trimming spaces" mean ASCII space (0x20) only, or all whitespace (tabs, newlines, non-breaking space U+00A0)?
3. Is plan edit restricted to the plan's original creator, or can any project member with role ≥ member edit any plan?
4. What is the intended max length for description and goal? (name has an explicit 1–100 char rule; description/goal have none stated)
5. Is per-project name uniqueness backed by a DB-level unique constraint, or an app-level check only?
6. Is there an intended maximum number of Test Plans per project, or is the list unbounded by design?

---
_Synced from Jira by sync-jira-issues_
