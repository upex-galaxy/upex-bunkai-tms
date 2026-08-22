# DEFECT: Test Plan validation errors return raw Zod message instead of ratified user-facing copy (AC 1.4, 3.1-3.3)

**Jira Key:** [BK-592](https://jira.upexgalaxy.com/browse/BK-592)
**Related Story:** [BK-202](https://jira.upexgalaxy.com/browse/BK-202) - TMS-Test Plan | Create a test plan grouping tests for a goal
**Priority:** Low
**Status:** Ready For QA
**Components:** None
**Severity:** Menor
**Error Type:** Content
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

Test Plan validation errors (over-length name, blank name) return the raw Zod validation message instead of the ratified user-facing error copy. Status codes and rejection behavior are correct in every case — only the message text diverges from what is documented as the ratified copy.

## Ratified copy (expected)

> `"Name must be between 1 and 100 characters."`

## Actual copy returned (by scenario)

| AC scenario | Input | Actual message returned | HTTP |
| --- | --- | --- | --- |
| 1.4 | 101-character name | `"Name must be 100 characters or fewer"` | 422 |
| 3.1 | whitespace-only name | `"Name is required"` | 422 |
| 3.2 | empty-string name | `"Name is required"` | 422 |
| 3.3 | tab/newline-only name | `"Name is required"` | 422 |

## Root cause

`lib/test-plans/errors.ts`'s `mapTestPlanRpcError()` holds the ratified copy, but the API never reaches that mapper for these cases — `lib/test-plans/validation.ts`'s Zod schema fails fast before the RPC is ever called, so Zod's own default validation messages (`too*big` / `too*small`) surface directly in the API response instead of being remapped to the ratified copy. The error-mapping layer only covers RPC-originated errors (the 456xx SQLSTATE block), not the earlier Zod pre-check layer.

## Expected result

Every 422 for an invalid Test Plan name (over-length or blank) returns exactly `"Name must be between 1 and 100 characters."`

## Actual result

The raw Zod message surfaces instead (see table above) — correct status code, correct rejection, wrong copy.

## Evidence

- `evidence/BK-202-ac1.4-boundary-101char-422.json`
- `evidence/BK-202-ac3.1-whitespace-only-422.json`
- `evidence/BK-202-ac3.2-empty-string-422.json`
- `evidence/BK-202-ac3.3-tab-newline-only-422.json`

## Traceability

- Story: BK-202
- Xray Test: BK-575 (Scenarios 1.3, 1.4), BK-583 (Scenarios 3.1, 3.2, 3.3)
- ATP: BK-573 · ATR: BK-590

> ***Note******:*** Components left unset — no Jira Component exists yet for the Test Plans product area, and this session lacked project-admin permission to create one. User explicitly approved filing without it rather than blocking on an out-of-band admin action. Follow-up: a project admin should create a "Bunkai Test Plans" component and this field should be backfilled.

---

## 🐞 Actual Result

Raw Zod validation messages surface instead of the ratified copy: 101-char name -> "Name must be 100 characters or fewer" (422); whitespace-only, empty-string, and tab/newline-only names -> "Name is required" (422, all three). See table in description for the per-scenario mapping.

---

## ✅ Expected Result

Every 422 for an invalid Test Plan name (over-length or blank) returns exactly "Name must be between 1 and 100 characters." (from lib/test-plans/errors.ts mapTestPlanRpcError()). Status codes and rejection behavior are all correct; only the message text should match this copy.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🧫 Evidence

evidence/BK-202-ac1.4-boundary-101char-422.json; evidence/BK-202-ac3.1-whitespace-only-422.json; evidence/BK-202-ac3.2-empty-string-422.json; evidence/BK-202-ac3.3-tab-newline-only-422.json

---

## Related Issues

- blocks: [BK-202](https://jira.upexgalaxy.com/browse/BK-202) - TMS-Test Plan | Create a test plan grouping tests for a goal

---

## Metadata

- **Created:** 8/21/2026
- **Updated:** 8/21/2026
- **Reporter:** Alfonso Hernandez
- **Assignee:** Alfonso Hernandez
- **Labels:** bk-202, error-copy, test-plans

---

_Synced from Jira by sync-jira-issues_
