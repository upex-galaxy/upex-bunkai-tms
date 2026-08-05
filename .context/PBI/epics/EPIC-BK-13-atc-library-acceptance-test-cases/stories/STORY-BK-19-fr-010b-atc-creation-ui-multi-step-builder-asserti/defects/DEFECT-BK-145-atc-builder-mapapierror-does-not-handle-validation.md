# DEFECT: ATC builder — mapApiError does not handle validation_failed + too_small shows generic error instead of field-level message for short title

**Jira Key:** [BK-145](https://jira.upexgalaxy.com/browse/BK-145)
**Related Story:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions
**Priority:** Low
**Status:** Open
**Components:** ATC Library (Acceptance Test Cases)

---

## Description

### Bug Description (Updated 2026-07-06 — Scope Expanded)

Original scope: when the server returns 422 with code: "validation*failed" and details[0].code: "too*small" at path:["title"], the mapApiError utility shows a generic error instead of a field-level message.

REGRESSION FOUND (2026-07-06 verification): The POST /api/v1/atcs endpoint referenced in the original filing does not exist. The ATC save path is a Supabase RPC (bunkai*save*atc). The mapApiError utility does not exist in the codebase. Title minimum-length validation is ABSENT at all layers — a 2-character title saves successfully with no error.

### Steps to Reproduce

1. Authenticate on staging and open any existing ATC in the editor.
2. Change the title to 2 characters (e.g. "ab").
3. Click Save ATC — button is enabled (canSave = title.length > 0).
4. Observe: ATC saves successfully. No error is shown.

### Expected Result

Title input shows a field-level error: "Title must be at least 3 characters." ATC is NOT saved.

### Observed Result

ATC saves successfully with a 2-character title. No error is displayed.

### Root Cause — Validation Absent at All Layers

- DB: atcs.title is `text not null` — no CHECK constraint for minimum length.
- RPC: bunkai*save*atc performs no title length validation.
- Server Action: saveAtcAction checks title.trim().length === 0 only (not < 3).
- UI: AtcEditor canSave = title.trim().length > 0 (not >= 3).

### Fix Required

1. DB migration: add CHECK (length(title) >= 3) to public.atcs OR enforce in RPC with RAISE EXCEPTION.
2. saveAtcAction: add guard if (input.title.trim().length < 3) return { ok: false, error: "Title must be at least 3 characters." }
3. AtcEditor.tsx: update canSave to title.trim().length >= 3 so Save button is disabled for short titles.

### Test Environment

staging (https://staging-upexbunkai.vercel.app) — verified by code analysis 2026-07-06

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
