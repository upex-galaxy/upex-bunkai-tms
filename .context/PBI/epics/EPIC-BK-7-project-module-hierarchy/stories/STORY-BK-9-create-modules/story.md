# TMS-Module | Create modules with nested sub-modules

**Jira Key:** [BK-9](https://jira.upexgalaxy.com/browse/BK-9)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** In Progress
**Priority:** Medium
**Story Points:** 13

---

## Overview

***Source spec:*** FR-006

## User story

***As a*** Senior QA Engineer
***I want to*** create Modules and nest sub-modules (up to 6 levels deep) inside a Project
***So that*** my test repository mirrors the product's real structure (Login, Payment, Dashboard, …) instead of a flat list I cannot navigate.

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

---

## QA Refinements (Shift-Left Analysis) — 2026-06-02

> Pre-sprint AC refinement by QA. Full ATP DRAFT in Acceptance Test Plan field.

### Refined Acceptance Criteria (key additions)

- Warning fires at resulting depth 5 AND depth 6 (parent at level 4+). No warning at depths 1–4.
- Description field: max 500 characters, Markdown rendered in tree view (3-line truncate + "more" expand).
- Depth enforcement: app layer (early return) + DB constraint (safety net).

### Edge Cases Identified

- Name at exact boundaries: 2 chars (min) and 80 chars (max) must be accepted.
- Name of 81 chars must be rejected.
- Whitespace-only name must be rejected (treated as empty).
- Special characters (emoji, RTL, HTML tags) must be sanitized / stored as literal text.
- Viewer-role user attempting module creation must receive 403 / button disabled in UI.
- Concurrent sibling creates: position ordering must be deterministic.
- Cross-workspace: user from WS-A cannot create modules in WS-B.
- Depth 6 creation: module IS created, warning IS shown.
- Description of 501+ chars: rejected with validation message.

### Clarified Business Rules

- Warning trigger: resulting depth >= 5 (parent depth >= 4). Fires at depth 5 and depth 6.
- Depth enforcement: both app layer (early return, no DB call) and DB constraint (hard guard).
- Description: optional, max 500 chars, Markdown stored, renders in tree view below module name (3-line preview + expand).

### Open Questions for Dev (non-blocking for PO)

1. Module creation pattern: REST endpoint (`POST /api/v1/modules`) or Server Action / Supabase RPC?
2. Position assignment strategy on concurrent sibling creates?
3. Does `POST /api/v1/modules` support `Idempotency-Key` header?
4. Does module creation write to `activity_log`?
5. Does Supabase Realtime broadcast on `modules` INSERT?
6. Exact error message text for AC3 (min name) and AC5 (depth exceeded)?

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

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 6/4/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** hierarchy, mvp, shift-left-2026-06-02, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
