# TMS-ATC Builder | Build an ATC with ordered steps and assertions

**Jira Key:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## QA Refinements (Shift-Left Analysis)

### Edge Cases Identified

- ***Empty step/assertion validation***: Exact min/max length for step description and assertion text unclear. Zod schema enforces constraint, but values not specified.
- ***Tag chip cap UX behavior***: When user attempts to add 11th tag, behavior not specified (disabled button vs. toast vs. silent rejection).
- ***Minimum required fields***: Can you submit with 0 steps? 0 assertions? Can you submit without assertions (steps only)?
- ***Error message wording***: Four API error codes listed (`ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid`, `title*too*short`), but user-facing wording not specified.
- ***Max ATC title length***: No maximum length specified.
- ***Edit variant scope (BK-21)***: Deferred; may require refactoring of step/assertion builders.
- ***Accessibility MVP scope***: DoD includes tab order + screen reader announcements — is this mandatory for MVP or backlog-deferred?
- ***Unit tests mandatory gate***: DoD lists unit tests for step reorder, AC cascade, tag cap — should these block PR merge or just be coverage goal?

### Clarified Business Rules

- Create-only form (no edit in MVP; BK-21 handles edit variant).
- No optimistic UI — form state is lossy on error; server is source of truth.
- Reorder buttons (up/down) in MVP; DnD deferred.
- Single source of truth: Zod schema mirrors `@schemas/atc.types`.
- Cascading US → AC selection: two API endpoints (GET /user-stories, GET /acceptance-criteria).
- Error mapping utility maps 4 error codes to RHF field-level errors.

### Open Questions for PO / Dev

1. What is the exact min/max length for step description? For assertion text?
2. What is the UX when user tries to add the 11th tag (disabled button, toast, silent)?
3. Can you submit with 0 steps? 0 assertions? Without assertions?
4. What are the user-facing error messages for each error code?
5. Is there a max ATC title length?
6. Is the edit variant (BK-21) scope acceptable (MVP create-only, refactoring later)?
7. Is accessibility (tab order + screen reader) mandatory for MVP or backlog-deferred?
8. Are unit tests a mandatory PR gate or just a coverage goal?
9. Is the error mapping utility (`mapApiError`) available? Who owns it?
10. Will the API contract (BK-18) be finalized before dev starts? (This is a BLOCKER.)

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Defects (3)

- [BK-144](https://jira.upexgalaxy.com/browse/BK-144): ATC builder — tag input remains enabled at 10-tag maximum instead of being disabled _(Open)_
- [BK-145](https://jira.upexgalaxy.com/browse/BK-145): ATC builder — mapApiError does not handle validation_failed + too_small shows generic error instead of field-level message for short title _(Open)_
- [BK-146](https://jira.upexgalaxy.com/browse/BK-146): ATC builder — module outside project subtree returns 404 not_found instead of 422 module_outside_project_subtree _(Closed)_

### Story (1)

- [BK-18](https://jira.upexgalaxy.com/browse/BK-18): TMS-ATC API | Create and edit ATCs with steps and assertions _(Ready For Release)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** maibeth vega
- **Labels:** atc, frontend, mvp, shift-left-2026-06-05, shift-left-2026-06-18, shift-left-reviewed, ui, wave-2

---

_Synced from Jira by sync-jira-issues_
