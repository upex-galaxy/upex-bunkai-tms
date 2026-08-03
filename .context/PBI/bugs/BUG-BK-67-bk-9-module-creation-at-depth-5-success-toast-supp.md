# BUG: [BK-9] Module creation at depth ≥5: success toast suppressed — only deep-nesting warning shown

**Jira Key:** [BK-67](https://jira.upexgalaxy.com/browse/BK-67)
**Priority:** Low
**Status:** Closed
**Components:** Project & Module Hierarchy

---

## Description

ACTUAL: When a module is successfully created at depth 5 or 6, only toast.warning('This module is nested deeply — consider keeping the tree shallow.') fires. No 'Module created' success confirmation is shown to the user. CODE: create-module-form.tsx lines 116-121 uses if/else: warning branch suppresses success branch. USER IMPACT: User is left uncertain whether the module was created — they see only an advisory, not a confirmation. MODULE IS actually created (HTTP 201), but the user receives no positive feedback. EXPECTED: Both a success toast ('Module created') AND the deep-nesting advisory should fire. REPRO: API POST /api/v1/projects/{id}/modules with parent at depth 4 → 201 + warning. Observe UI shows only warning toast. ENVIRONMENT: staging | RELATED: BK-9

---

## Related Issues

- created: [BK-9](https://jira.upexgalaxy.com/browse/BK-9) - TMS-Module | Create modules with nested sub-modules

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/26/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** bk-9, depth-warning, toast, ux

---

_Synced from Jira by sync-jira-issues_
