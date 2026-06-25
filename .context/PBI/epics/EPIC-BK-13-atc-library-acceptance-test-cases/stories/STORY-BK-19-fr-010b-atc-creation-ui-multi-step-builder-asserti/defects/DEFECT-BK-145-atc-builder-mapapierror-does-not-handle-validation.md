# DEFECT: ATC builder — mapApiError does not handle validation_failed + too_small shows generic error instead of field-level message for short title

**Jira Key:** [BK-145](https://jira.upexgalaxy.com/browse/BK-145)
**Related Story:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions
**Priority:** Medium
**Status:** Open
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Bug Description

When the server returns 422 with `code: "validation*failed"` and `details[0].code: "too*small"` at `path:["title"]`, the `mapApiError` utility does not recognize this pattern. It only handles the `code: "title*too*short"` variant. As a result, a generic "Request body failed validation." message is displayed at the form level instead of a field-level "Title must be at least 3 characters" message. Client-side Zod validation correctly blocks the short-title case before submit, so this only manifests if the validation_failed response is triggered directly.

## Steps to Reproduce

1. Send POST /api/v1/atcs with title shorter than 3 chars bypassing client validation.
2. Observe the form error display.

## Expected Result

Field-level error "Title must be at least 3 characters" at the title input.

## Observed Result

Generic form-level "Request body failed validation."

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
- **Updated:** 6/19/2026
- **Reporter:** maibeth vega
- **Assignee:** maibeth vega
- **Labels:** bk-19, sprint-testing

---

_Synced from Jira by sync-jira-issues_
