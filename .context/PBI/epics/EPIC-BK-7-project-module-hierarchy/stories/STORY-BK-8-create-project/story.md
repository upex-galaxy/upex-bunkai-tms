# Create a Project inside a Workspace

**Jira Key:** [BK-8](https://upexgalaxy67.atlassian.net/browse/BK-8)
**Epic:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5

---

## Overview

***Source spec:*** FR-005

## User Story

As a Workspace member, I want to create a Project inside a Workspace so that I can organize different applications / products under their own roof. Implements FR-005.

---

## QA Refinements (Shift-Left Analysis)

***Date:**** 2026-05-28 | ****Risk Level:*** HIGH (9/10)

### Ambiguities Found

- ***A1 — Error code separator****: ACs write NAME**TOO*SHORT but codebase standard is NAME*TOO*SHORT (underscore). Likely typo.
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
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** hierarchy, mvp, shift-left-2026-05-28, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:47.772Z_
