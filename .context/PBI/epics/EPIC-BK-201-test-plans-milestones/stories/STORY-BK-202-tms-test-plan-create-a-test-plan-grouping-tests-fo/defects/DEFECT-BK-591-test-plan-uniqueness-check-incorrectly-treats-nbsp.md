# DEFECT: Test Plan uniqueness check incorrectly treats NBSP-padded names as duplicates (violates AC 2.4 / ratified whitespace rule)

**Jira Key:** [BK-591](https://jira.upexgalaxy.com/browse/BK-591)
**Related Story:** [BK-202](https://jira.upexgalaxy.com/browse/BK-202) - TMS-Test Plan | Create a test plan grouping tests for a goal
**Priority:** Medium
**Status:** Ready For QA
**Components:** None
**Severity:** Moderada
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

A Test Plan name padded with a trailing ***U+00A0**** (non-breaking space) is wrongly rejected as a duplicate (`409`) when the ratified whitespace rule says NBSP must ****NOT*** be trimmed/collapsed — the name should be created as distinct (expected `201`).

## Steps to reproduce (Given/When/Then)

- ***Given*** an existing Test Plan named `"BK-202 NBSP Test"` in a project
- ***When*** a user creates a new Test Plan named `"BK-202 NBSP Test "` (identical text plus one trailing U+00A0)
- ***Then*** the API should return `201 Created` (a distinct name, since U+00A0 is not part of the trimmed/collapsed whitespace class)
- ***But instead*** the API returns `409 Conflict` — treating the NBSP-padded name as a duplicate of the existing one

## Root cause

`supabase/migrations/0073*test*plans.sql` (lines 210 and 305), inside both `bunkai*create*test*plan` and `bunkai*update*test*plan`:

```sql
btrim(regexp_replace(name, '\s+', ' ', 'g'))
```

Postgres's `\s` character class in `regexp_replace` matches Unicode whitespace ***including U+00A0**** — contradicting the migration's own code comment (line 24: **"Note **`\s`** covers tab/newline but NOT U+00A0"**) and diverging from `lib/test-plans/validation.ts`, whose Zod schema deliberately spells out `[\t\n\v\f\r ]+` specifically to ****exclude*** U+00A0.

The two "mirrored" validation layers disagree in practice: Zod (client-facing, fast-fail) would accept the NBSP-padded name as distinct, but the RPC (the actual DB authority) collapses it into a duplicate.

## Expected result

`201 Created` — the NBSP-padded name is distinct from the base name and should be created as a new Test Plan.

## Actual result

`409 Conflict` — the API rejects the NBSP-padded name as a duplicate of the existing Test Plan.

## Evidence

- `evidence/BK-202-ac2.4-nbsp-padded-FAIL-409-expected-201.json` — the failing case (byte-verified real `U+00A0`/`c2 a0` bytes sent)
- `evidence/BK-202-ac2.4-tab-padded-409.json` — control case: tab-padded name correctly rejected as `409` (tab IS part of the trimmed class), included for contrast

## Traceability

- Story: BK-202
- Xray Test: BK-580 (Scenario 2.4)
- ATP: BK-573 · ATR: BK-590

> ***Note******:*** Components left unset — no Jira Component exists yet for the Test Plans product area, and this session lacked project-admin permission to create one. User explicitly approved filing without it rather than blocking on an out-of-band admin action. Follow-up: a project admin should create a "Bunkai Test Plans" component and this field should be backfilled.

---

## 🐞 Actual Result

API returns HTTP 409 Conflict ("A test plan with this name already exists.") when creating a Test Plan whose name is padded with a trailing U+00A0 (non-breaking space) against an existing plan of the base name.

---

## ✅ Expected Result

API should return HTTP 201 Created -- the NBSP-padded name is distinct from the base name per the ratified whitespace rule (U+00A0 is not part of the trimmed/collapsed whitespace class) and should be created as a new, separate Test Plan.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🧫 Evidence

evidence/BK-202-ac2.4-nbsp-padded-FAIL-409-expected-201.json (failing case, byte-verified real U+00A0); evidence/BK-202-ac2.4-tab-padded-409.json (control case, correct 409 for comparison)

---

## Related Issues

- blocks: [BK-202](https://jira.upexgalaxy.com/browse/BK-202) - TMS-Test Plan | Create a test plan grouping tests for a goal
- created by: [BK-590](https://jira.upexgalaxy.com/browse/BK-590) - ATR: BK-202: Story Testing
- created by: [BK-580](https://jira.upexgalaxy.com/browse/BK-580) - Should apply the tab-vs-non-breaking-space distinction to duplicate detection

---

## Metadata

- **Created:** 8/21/2026
- **Updated:** 8/21/2026
- **Reporter:** Alfonso Hernandez
- **Assignee:** Alfonso Hernandez
- **Labels:** bk-202, nbsp, test-plans, uniqueness

---

_Synced from Jira by sync-jira-issues_
