# Create a Workspace

**Jira Key:** [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## QA Refinements (Shift-Left Analysis) — BK-4

### Story Quality: Needs Improvement

- Original: single-sentence Story with business rules
- Missing: reserved slug list, error catalog, Unicode normalization rules

### Refined Acceptance Criteria (13 Given/When/Then scenarios, 4 ACs)

***AC-1 Positive***: POST /workspaces with name "Acme QA" → 201 workspace created, slug "acme-qa", caller is owner
***AC-2 Positive***: Slug is derived: lowercase, kebab-case, accents stripped, ≤60 chars
***AC-3 Positive***: Creator auto-enrolled as owner in workspace_members
***AC-4 Slug uniqueness***: Duplicate slug → 409 Conflict
***AC-5 Reserved slugs***: Reserved value → 422 Validation Failed
***AC-6 Name validation***: 0 chars, 61 chars, no alphanumeric → 422
***AC-7 Empty string name*** → 422

### Edge Cases (18 identified)

- Unicode name: "Bünkāï" → slug "bunkai" (NEEDS PO/DEV CONFIRMATION)
- Emoji-only name → 422
- Leading/trailing spaces → trimmed
- Concurrent slug race → 409 for loser
- Workspace creation event fired → activity log entry

### Critical PO Questions

1. SLUG_RESERVED list — what values are reserved? (suspect: admin, api, app, auth, ~20 others)
2. Unicode normalization algorithm (NFKD? ASCII-only?)
3. Error catalog — what status code per validation failure?
4. Response shape: Story says {workspace_id, slug}, API map says {id, slug, role, plan}

### Test Outlines (20 — names only)

***Positive (6)***: Workspace created with valid name, slug derived correctly, owner membership, event emission, activity log, GET returns workspace
***Negative (8)***: Name too short/long, duplicate slug, reserved slug, no alphanumeric, empty name, unauthenticated, emoji-only, Unicode boundary
***Boundary (4)***: Exact 3/60 char name, slug approaching 60 char limit, accented boundary
***API (2)***: GET /workspaces/{id} returns workspace, 404 for non-existent

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/27/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, shift-left-2026-05-27, shift-left-reviewed, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:46.121Z_
