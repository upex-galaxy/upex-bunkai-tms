# DEFECT: ATC builder — tag input remains enabled at 10-tag maximum instead of being disabled

**Jira Key:** [BK-144](https://jira.upexgalaxy.com/browse/BK-144)
**Related Story:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions
**Priority:** Low
**Status:** Open
**Components:** ATC Library (Acceptance Test Cases)
**Severity:** Menor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

### Bug Description (Updated 2026-07-06 — Scope Expanded)

Original scope: tag input stays enabled at 10-tag cap; adding an 11th tag was silently blocked with a paragraph message below the input.

REGRESSION FOUND (2026-07-06 verification): The addTag() function does not check tags.length >= 10. The input has no disabled prop. saveAtcAction has no tags-length validation. The bunkai*save*atc RPC has no array-length check. The atcs.tags column has no DB constraint. Result: unlimited tags can be added to state AND saved to the database.

### Steps to Reproduce

1. Open ATC builder with an ATC that already has 10 tags.
2. Type an 11th tag and press Enter.
3. Observe: 11th tag is added to the tag list. Input remains enabled.
4. Click Save ATC.
5. Observe: ATC saves successfully with 11+ tags persisted in the database.

### Expected Result

Input disabled (or visually locked) when tags === 10. Attempting to add an 11th tag shows an inline error. ATC cannot be saved with more than 10 tags.

### Observed Result

Input stays enabled. 11th tag is added to state. ATC saves successfully with unlimited tags.

### Root Cause — Validation Absent at All Layers

- AtcEditor.tsx addTag(): no if (tags.length >= 10) return guard.
- AtcEditor.tsx <input>: no disabled={tags.length >= 10} prop.
- saveAtcAction: no if (input.tags.length > 10) guard.
- bunkai*save*atc RPC: no array*length(p*tags, 1) <= 10 check.
- DB: atcs.tags text[] — no array length constraint.

### Fix Required

1. AtcEditor.tsx addTag(): add if (tags.length >= 10) return guard (or show inline message).
2. AtcEditor.tsx <input>: add disabled={tags.length >= 10} prop.
3. saveAtcAction: add if (input.tags.length > 10) return { ok: false, error: "An ATC can have at most 10 tags." }

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- created: [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions

---

## Metadata

- **Created:** 6/18/2026
- **Updated:** 7/10/2026
- **Reporter:** maibeth vega
- **Assignee:** Ely
- **Labels:** bk-19, sprint-testing

---

_Synced from Jira by sync-jira-issues_
