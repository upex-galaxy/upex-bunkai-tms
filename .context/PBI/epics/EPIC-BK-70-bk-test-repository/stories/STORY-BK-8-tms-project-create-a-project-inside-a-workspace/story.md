# TMS-Project | Create a project inside a workspace

**Jira Key:** [BK-8](https://jira.upexgalaxy.com/browse/BK-8)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** In Test
**Priority:** Medium
**Story Points:** 8
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec:*** FR-005

## User Story

As a Workspace member, I want to create a Project inside a Workspace so that I can organize different applications / products under their own roof. Implements FR-005.

---

## QA Refinements (Shift-Left Analysis)

***Date:**** 2026-05-28 | ****Risk Level:*** HIGH (9/10)

### Ambiguities Found

- ***A1 — Error code separator***: ACs write NAME*TOO*SHORT but codebase standard is NAME*TOO*SHORT (underscore). Likely typo.
- ***A2 — Workspace param***: URL says /workspaces/W/projects but Workflow step 9 uses ws-slug. UUID or slug?
- ***A3 — Auth mechanism***: Cookie session or PAT bearer? If PAT, what scope? No existing scope covers project creation.
- ***A4 — Slug derivation***: Accent handling, max length, consecutive hyphens, and collision behavior (409 vs auto-suffix) unspecified.

### Gaps (ACs missing for defined Business Rules)

- G1: Viewer role not tested (Business Rule: role >= member)
- G2: Name with only special chars not tested (Business Rule: >=1 alphanumeric)
- G3: Name > 80 chars not tested (Scope: 3-80 chars)
- G4: Description > 5KB not tested (Business Rule defined)
- G5: Unknown workspace UUID behavior undefined (404 vs 403)
- G6: UI form scope unclear — BK-8 or Phase E?

### Open Questions

- Q1 (BLOCKER): Error code separator _ or *?
- Q2 (BLOCKER): Workspace path param UUID or slug?
- Q3 (BLOCKER): Auth mechanism + PAT scope?
- Q4: Slug collision — 409 immediate or auto-suffix (-2, -3)?
- Q5: Unknown workspace — 404 or 403?
- Q6: UI form in BK-8 scope or Phase E?
- Q7: Max slug length (DNS label = 63 chars)?

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Bugs (3)

- [BK-54](https://jira.upexgalaxy.com/browse/BK-54): BK-8: Reserved project slugs are not rejected (AC-11) — created with HTTP 201 _(Duplicated)_
- [BK-55](https://jira.upexgalaxy.com/browse/BK-55): BK-8: Project detail route /projects/{slug} is not workspace-scoped _(Duplicated)_
- [BK-56](https://jira.upexgalaxy.com/browse/BK-56): BK-8: Non-Latin (CJK/Cyrillic) project names rejected as name_no_alphanumeric _(Duplicated)_

### Storys (2)

- [BK-4](https://jira.upexgalaxy.com/browse/BK-4): TMS-Workspace | Create a workspace _(Ready For Release)_
- [BK-9](https://jira.upexgalaxy.com/browse/BK-9): TMS-Module | Create modules with nested sub-modules _(In Test)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** hierarchy, mvp, shift-left-2026-05-28, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
