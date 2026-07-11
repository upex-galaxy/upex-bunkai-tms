# BK-41 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

## Acceptance Test Plan (ATP) Draft - BK-41

> ***INFO:*** ATP DRAFT only. Formal test cases belong to `/test-documentation`; automation code belongs to `/test-automation`.

| ID | Scenario | Precondition | Expected result | Type | Priority | Automation hint |
| --- | --- | --- | --- | --- | --- | --- |
| ATP-1 | List defects for chosen module | Bug filed against module M in project P | 200, data + aggregates are correct | Positive | P0 | API `DefectApi.list` |
| ATP-2 | Module subtree nested depth 1-6 | M/M2/M3 with bugs across descendants | Includes descendants, excludes siblings | Positive | P0 | API parametrized |
| ATP-3 | Existing module with zero bugs | Module exists with no bugs | 200, empty data, zeroed aggregates | Boundary | P1 | API |
| ATP-4 | Filter by status only | Bugs exist across open, in_progress, resolved, closed | Data only has requested status | Positive | P0 | API |
| ATP-5 | Filter by severity only | Bugs exist across P1, P2, P3, P4 | Data only has requested severity | Positive | P0 | API |
| ATP-6 | Combined status + severity | Bugs exist across all statuses and severities | Data applies logical AND | Positive | P0 | API |
| ATP-7 | Aggregates over filtered set, not page | More matching bugs than the page limit | Aggregates count all filtered matches | Boundary | P1 | API |
| ATP-8 | Empty result state | Filter matches no bugs | 200 with empty data + zeroed aggregates; UI can show no-defects state | Boundary | P1 | API + UI |
| ATP-9 | Cross-project access forbidden | PAT is not a member of the target project | 403, not a fake empty result | Negative | P1 | API |
| ATP-10 | module*id belongs to another project | Query project P with module from project Q | 400 validation*failed / module*not*in_project | Negative | P1 | API |
| ATP-11 | Invalid severity | severity=P9 | 400 validation_failed | Negative | P2 | API |
| ATP-12 | Invalid status | status=in-progress | 400 validation*failed; wire value is in*progress | Negative | P2 | API |
| ATP-13 | Missing required project*id | No project*id query param | 400 validation_failed | Negative | P1 | API |
| ATP-14 | Limit/cursor boundary | limit > 100 or invalid before cursor | 400 or normalized max-limit behavior per API convention | Boundary | P2 | API |
| ATP-15 | Defect newly filed by BK-40 appears | BK-40 POST /bugs creates one defect | GET /bugs includes the defect immediately | Integration | P1 | API cross-story |
| ATP-16 | Archived module default | Bugs exist under archived/soft-deleted module | Hidden by default; future include_archived=true may opt in | Integration | P2 | API |

### Coverage Estimate

| Positive | Negative | Boundary | Integration | API | Total |
| --- | --- | --- | --- | --- | --- |
| 6 | 5 | 4 | 2 | 16 | 16 |

### Risk Coverage

| Risk | Severity | Coverage |
| --- | --- | --- |
| Subtree traversal correctness at depth 6 | :red_circle: High | AC-2, ATP-2 |
| Aggregates drift with pagination | :large*orange*circle: Medium | AC-6, ATP-7 |
| IDOR via cross-project aggregates | :large*orange*circle: Medium | ATP-9 |
| BK-40 schema dependency not shipped | :large*orange*circle: Medium | Readiness gate |
| Empty filters indistinguishable from forbidden data | :large*orange*circle: Medium | ATP-8, ATP-9 |

### Rationale

BK-41 is a read-only list/filter Story, but it carries real contract risk in subtree traversal, aggregates, and RLS/IDOR behavior. ATP remains outline-level and intentionally excludes test-data recipes, parametrization tables, implementation steps, and automation code.

---
_Synced from Jira by sync-jira-issues_
