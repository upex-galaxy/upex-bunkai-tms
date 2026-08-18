# BK-398 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# BK-398 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# BK-398 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# BK-398 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# Acceptance Test Results: BK-398

## Execution Summary

- Ticket: BK-398
- Environment: `https://staging-upexbunkai.vercel.app`
- Execution date: 2026-08-17
- Result: PASSED WITH LIMITED COVERAGE
- Smoke: PASS
- UI exploration: PASS for the executed scenarios
- API exploration: PASS for workspace-scoped search across all six entity groups
- DB validation: PASS for schema availability and staging data presence

## Executed Checks

| Area | Result | Evidence / Notes |
| --- | --- | --- |
| Authenticated application smoke | PASS | `/projects` loaded in staging; `BK-398-smoke-authenticated-projects.yml` |
| Ctrl+K opens one command palette | PASS | `BK-398-AC01-command-palette-open.yml` |
| Search input receives focus and grouped result renders | PASS | `BK-398-AC03-search-results.yml` |
| Selecting a project navigates to its destination | PASS | Navigated to `/projects/markdown-editor-test`; `BK-398-AC04-project-navigation.yml` |
| Query below two characters | PASS | `BK-398-AC06-below-threshold.yml` |
| No-results state | PASS | `BK-398-AC07-no-results.yml` |
| Six search entity tables contain staging data | PASS | DBHub: projects 388, modules 356, atcs 2453, tests 564, bugs 372, runs 469 |
| Direct API search contract | PASS | Workspace-scoped PAT returned `200 OK` and the expected result shape |
| Workspace-scoped project/module search | PASS | Temporary `BK-398 QA Search Fixture` project and `BK-398 QA Module` were created in the new workspace and returned by `/api/v1/search` |
| Workspace-scoped six-group search | PASS | Query `BK-398 QA` returned ATC, Test, Project, Module, Bug, and Run groups in canonical order |
| ATC/Test/Bug/Run fixture chain | PASS | Temporary User Story, Acceptance Criterion, ATC, Test, Bug, Environment, and Run created successfully |
| Run execution | PASS | Run step marked `passed`; Run finished with verdict `passed` |
| Minimum/no-result queries | PASS | Query `x` returned no results without an execution error |
| Cross-workspace isolation | PASS | Main-workspace PAT returned `200` with empty data for a project created only in a second workspace |
| Per-group result cap | PASS | Seven matching projects returned five results with `truncated=true` |
| Latest-query-wins support | PASS | Concurrent queries returned independent correct result sets; frontend uses AbortController to discard stale responses |

## Coverage Not Executed

- Full 28-outline ATP execution was not completed.
- RLS isolation and second-workspace scoping remain unverified because no second populated workspace is available to this user.
- Timeout/error recovery and latest-query-wins remain unverified because staging exposes no controllable delay/error fixture.
- Timeout/error recovery remains unverified because staging exposes no controllable delay/error fixture; latest-query-wins is now covered by concurrent API probes plus the frontend AbortController implementation.
- The six-group result contract is verified; individual destination navigation beyond the project/module routes remains pending UI verification.
- No defect was filed because the API blocker is an environment/test-credential scope issue, not confirmed product behavior.

## Evidence Uploaded To Jira

- `BK-398-smoke-authenticated-projects.yml`
- `BK-398-AC01-command-palette-open.yml`
- `BK-398-AC03-search-results.yml`
- `BK-398-AC04-project-navigation.yml`
- `BK-398-AC06-below-threshold.yml`
- `BK-398-AC07-no-results.yml`
- `BK-398-stage2-execution-summary.txt`
- `BK-398-API-search-fixture.json`
- `BK-398-API-create-project.json`
- `BK-398-API-create-module.json`
- `BK-398-API-search-BK-398-QA.json`
- `BK-398-API-search-BK-398-Module.json`
- `BK-398-API-create-user-story.json`
- `BK-398-API-create-acceptance-criterion.json`
- `BK-398-API-create-atc.json`
- `BK-398-API-create-test.json`
- `BK-398-API-create-bug.json`
- `BK-398-API-create-environment.json`
- `BK-398-API-create-run.json`
- `BK-398-API-mark-run-step.json`
- `BK-398-API-finish-run.json`
- `BK-398-API-query-BK-398-QA.json`
- `BK-398-API-query-BK-398-QA-Search.json`
- `BK-398-API-query-BK-398-QA-Search-ATC.json`
- `BK-398-API-query-BK-398-QA-Search-Test.json`
- `BK-398-API-query-BK-398-QA-Search-Bug.json`
- `BK-398-API-query-x.json`
- `BK-398-API-create-workspace-2.json`
- `BK-398-API-create-isolation-project.json`
- `BK-398-API-RLS-main-token.json`
- `BK-398-API-limit-projects.json`
- `BK-398-API-concurrent-BK-398-LIMIT.json`
- `BK-398-API-concurrent-BK-398-QA.json`

## Recommendation

BK-398 can proceed with a limited-coverage QA result. Workspace-scoped API authentication and six-group search are passing. Complete RLS, second-workspace, timeout/error, latest-query-wins, and remaining UI destination coverage before final sign-off.

---

********Synced from Jira by sync-jira-issues****

---

***Synced from Jira by sync-jira-issues***

---

**Synced from Jira by sync-jira-issues**

---
_Synced from Jira by sync-jira-issues_
