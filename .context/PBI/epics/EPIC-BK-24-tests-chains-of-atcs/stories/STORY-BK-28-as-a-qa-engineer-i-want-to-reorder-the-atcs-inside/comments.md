# Comments for BK-28

[View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

---

### jesusgpythondev - 6/9/2026, 7:25:05 PM

## Shift-Left Review Update Summary

BK-28 has been re-refined using the shift-left-workflow-pattern with expert-development-team-analysis. The previous v2 analysis (2026-06-04) was restructured into the canonical description format matching BK-34's structure.

### What changed

- ***Description rebuilt***: Full shift-left structure — User Story, Source, Shift-Left Review Status, Scope (In/Out), Acceptance Criteria (12 Gherkin scenarios), Business Rules, Open Clarifications With Expert Recommendations, Definition of Done, References.
- ***Previous comments removed***: Old ATP v2 (comment 11383) and Senior Decisions (comment 11384) were deleted to avoid duplication. All decisions and scenarios are now integrated into the description.
- ***Expert recommendations added***: 6 open clarifications with role-specific expert recommendations (PO, Architect, Developers, QA Lead, Delivery).
- ***BK-27 dependency documented***: Explicit dependency note in Shift-Left Review Status and Delivery clarification.

### Findings

| Category | Count |
| --- | --- |
| Gherkin scenarios | 12 (Happy 2, No-op 2, Negative 4, Boundary 2, Integration 2) |
| Business rules | 11 |
| Open clarifications | 6 (with expert recommendations) |
| Dependencies | 1 (blocked-by BK-27) |

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| BK-27 (Test assembly) not yet landed | HIGH | BK-28 stays in Estimation until BK-27 ships |
| tests table may lack version column | MEDIUM | BK-28 adds migration if BK-27 omits it |
| Concurrent reorder race condition | LOW | Optimistic locking + 409 conflict |

### Recommendations

- Schedule BK-27 before BK-28 if both are in the same sprint.
- PO to confirm lenient If-Match mode and full-chain activity log storage.
- Architect to confirm version field migration ownership.

### Open Clarifications With Expert Recommendations

6 open questions with expert recommendations documented in the description. All require PO/Architect/Design/QA Lead/Delivery confirmation before development starts.

---

### jesusgpythondev - 6/9/2026, 7:25:06 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT Summary

> This ATP Draft summary exists as a Jira comment. The full refined specification lives in the ticket description.

### Scenario Matrix

| # | Scenario | Type | AC Coverage |
| --- | --- | --- | --- |
| 1 | Successful reorder of ATC chain | Happy | AC-1 |
| 2 | Reorder persists across reads | Happy | AC-1 |
| 3 | No-op when same order submitted | No-op | AC-2 |
| 4 | Single-ATC Test reorder is no-op | No-op | AC-2 |
| 5 | Unauthenticated request rejected | Negative | AC-3 |
| 6 | Viewer role forbidden | Negative | AC-3 |
| 7 | Version conflict on concurrent reorder | Boundary | AC-4 |
| 8 | Chain mismatch validation error | Negative | — |
| 9 | Duplicate ATC ids rejected | Negative | — |
| 10 | Empty chain rejected | Negative | — |
| 11 | Activity log captures reorder event | Integration | — |
| 12 | Retry-safe double-click returns no-op | Integration | — |

### Coverage Summary

| Category | Count |
| --- | --- |
| Positive (Happy) | 2 |
| No-op | 2 |
| Negative | 4 |
| Boundary | 2 |
| Integration | 2 |
| ***Total**** | ****12*** |

### Risk Score: 12/125 (LOW)

- Complexity: 2 (single PATCH, array reorder, no-op detection)
- Uncertainty: 2 (pattern exists from BK-18; tests table pending from BK-27)
- Blast Radius: 3 (affects Run execution order, no data loss)

### Dependency

blocked-by BK-27 (Test assembly) — tests table does not exist yet.

---


_Synced from Jira by sync-jira-issues_
