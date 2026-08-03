# BUG: [BK-9] Create Module form allows submitting 1-char names — no client-side min-length validation

**Jira Key:** [BK-68](https://jira.upexgalaxy.com/browse/BK-68)
**Priority:** Low
**Status:** Closed
**Components:** Project & Module Hierarchy

---

## Description

ACTUAL: The Create Module submit button is enabled when the module name is exactly 1 character. The form submits and the server returns HTTP 422 with reason=name*too*short. isValid check in create-module-form.tsx line 90: `name.trim().length > 0` — only checks non-empty, not >= 2. EXPECTED: Submit should be disabled (or inline error shown) when name.trim().length < 2, matching the API MIN*NAME*LENGTH = 2 constraint. IMPACT: Extra server round-trip; bad UX — user has to wait for server error instead of seeing inline feedback. REPRO: Open New Module form → type 1 character → Submit button is enabled → click → receives 422 error from server. ENVIRONMENT: staging | RELATED: BK-9

---

## Related Issues

- created: [BK-9](https://jira.upexgalaxy.com/browse/BK-9) - TMS-Module | Create modules with nested sub-modules

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/26/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** bk-9, client-side, ux, validation

---

_Synced from Jira by sync-jira-issues_
