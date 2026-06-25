# DEFECT: AC Management: Description Validation: Byte cap enforces 50,000 bytes (decimal) instead of 51,200 bytes (binary KiB)

**Jira Key:** [BK-143](https://jira.upexgalaxy.com/browse/BK-143)
**Related Story:** [BK-15](https://jira.upexgalaxy.com/browse/BK-15) - TMS-AC | Manage criteria under a user story
**Priority:** Medium
**Status:** Open
**Components:** None
**Severity:** Moderada
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Steps to Reproduce

1. Authenticate as a workspace member in staging
2. Open any User Story in the AC management panel
3. POST /api/v1/user-stories/{id}/acceptance-criteria with a description body of exactly 51,200 bytes (50 x 1024 = binary KiB)
4. Observe: HTTP 422 description*too*long

## Actual Result

51,200 bytes (true binary KiB) is rejected with 422. Binary search confirms: max accepted = 50,000 bytes.

## Expected Result

51,200 bytes (50 x 1024) should be accepted per the documented "50 KB" cap.

## Workaround

Keep descriptions under 50,000 bytes.

## Evidence

TC-25 FAILED during BK-15 QA session (2026-06-18). Root cause: MAX*AC*DESCRIPTION_BYTES likely uses 50 ** 1000 (decimal KB) instead of 50 ** 1024 (binary KiB) in lib/acceptance-criteria/validation.ts.

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- created: [BK-15](https://jira.upexgalaxy.com/browse/BK-15) - TMS-AC | Manage criteria under a user story

---

## Metadata

- **Created:** 6/18/2026
- **Updated:** 6/19/2026
- **Reporter:** maibeth vega
- **Assignee:** maibeth vega
- **Labels:** acceptance-criteria, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
