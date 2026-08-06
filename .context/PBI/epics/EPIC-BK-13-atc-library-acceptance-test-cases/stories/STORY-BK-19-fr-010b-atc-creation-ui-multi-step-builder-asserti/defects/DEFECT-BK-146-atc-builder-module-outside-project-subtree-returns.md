# DEFECT: ATC builder — module outside project subtree returns 404 not_found instead of 422 module_outside_project_subtree

**Jira Key:** [BK-146](https://jira.upexgalaxy.com/browse/BK-146)
**Related Story:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions
**Priority:** Medium
**Status:** Closed
**Components:** ATC Library (Acceptance Test Cases)

---

## Description

## Bug Description

When POST /api/v1/atcs is called with a module*id that belongs to a different project subtree, the server returns 404 not*found. The `mapApiError` utility and the ATP expected 422 with code `module*outside*project_subtree`. The distinction matters: 404 conflates "module doesn't exist" with "module exists but belongs to another project" — both return the same status, making it impossible to show a specific error message for the cross-project scenario.

## Steps to Reproduce

1. POST /api/v1/atcs with a valid module_id from a different project.
2. Observe the HTTP response status and error code.

## Expected Result

422 with code `module*outside*project_subtree`.

## Observed Result

404 not_found.

## Test Environment

staging (https://staging-upexbunkai.vercel.app)

## Related Story

BK-19 — TMS-ATC Builder

---

## Related Issues

- created: [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions

---

## Metadata

- **Created:** 6/18/2026
- **Updated:** 7/5/2026
- **Reporter:** maibeth vega
- **Assignee:** maibeth vega
- **Labels:** bk-19, sprint-testing

---

_Synced from Jira by sync-jira-issues_
