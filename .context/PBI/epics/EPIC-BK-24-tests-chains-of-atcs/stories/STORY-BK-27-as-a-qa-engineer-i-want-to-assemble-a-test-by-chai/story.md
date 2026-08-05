# TMS-Test Builder | Assemble a test by chaining ATCs

**Jira Key:** [BK-27](https://jira.upexgalaxy.com/browse/BK-27)
**Epic:** [BK-24](https://jira.upexgalaxy.com/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** -

---

## Overview

Source spec: BK-015

## User story

***As a*** QA Engineer (Elena persona)
***I want to*** assemble a Test by chaining a sequence of ATCs from my workspace's library
***So that*** I can execute those chained validations together in one Run when verifying a User Story

## Definition of done

- [ ] Functionality available behind the workspace's role permissions (member and above can create; viewer cannot)
- [ ] New Test appears in the Test list immediately after saving
- [ ] Activity log records who created the Test and when
- [ ] Operation works whether triggered from the UI or from an AI agent / CI client using the same Bunkai surface
- [ ] Acceptance criteria validated end-to-end against staging
- [ ] No P0 / P1 bugs open against this story

## QA Refinements (Shift-Left Analysis)

***Date:**** 2026-06-06 | ****Phase:**** 2 — Story Quality Analysis | ****Status:*** 25 ATP outlines drafted + 8 edge cases mapped

### Summary

Shift-Left QA reviewed this Story. The full ATP DRAFT (25 scenarios across Positive, Negative, Boundary, Integration) lives in the 🧪 Acceptance Test Plan (ATP) field. Refined ACs remain valid; no gaps identified. Risk profile: 🟡 YELLOW (infrastructure novel, but requirements clear).

### Edge Cases Identified

- ***Concurrency:*** User A + B with same Idempotency-Key → no collision (scoped to user_id, endpoint, key)
- ***Data Limits:*** Title 200-char max, whitespace-only rejected; chain length soft-limit (100) for UX
- ***Permission Boundary:*** RLS validates ATC in same workspace as Test (two-gate validation)
- ***Idempotency:*** 24h TTL on idempotency_keys; same key from same user → returns existing Test
- ***Orphaned State:*** Soft-deleted ATCs filtered from picker; graceful error if user selects archived ATC
- ***Audit Trail:*** Activity log triggered on INSERT via service*role function; immutable user*id reference
- ***Duplicate ATCs in chain:*** Allowed (sequence, not set); both positions persist in order
- ***Workspace switching mid-form:*** Binding instant (form-open vs Save) is ambiguous — needs clarification

### Clarified Business Rules

- Title required, max 200 chars, whitespace-only rejected
- A Test must include at least one ATC; chain is an ordered sequence (duplicates allowed)
- A Test binds to the workspace active at creation; binding is immutable
- Cross-workspace ATC references rejected without disclosing existence (INV-3 non-disclosure)
- `viewer` is read-only; create requires `member` or above

### Open Questions for PO / Dev (8 items)

***PO Scope Clarifications (3):***

1. Idempotency window — suggest 24h (matches idempotency_keys TTL)
2. Max chain length — suggest no hard limit in MVP; soft UI limit (e.g., 100)
3. Test description field — confirm scope (title only vs. title+description)

***Dev Technical Clarifications (5):***

1. Idempotency-Key scope — recommend (user_id, endpoint, key) for race-condition safety
2. ATC validation timing — recommend validate ALL ATCs before insert (atomic failure)
3. RLS policy for foreign ATC — explicit check: ATC.workspace*id = Test.workspace*id
4. Error message for foreign ATC — generic "You do not have permission to use this ATC" (no leakage)
5. Activity log actor field — recommend store user_id (immutable FK reference)

***None of these questions block estimation.*** Proceed to sprint planning; resolve during dev kick-off.

---

**Refined by: Shift-Left Testing (Phase 2) | 2026-06-06**

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (8)

- [BK-33](https://jira.upexgalaxy.com/browse/BK-33): TMS-Test Tags | Assign reserved and custom tags to a test _(Ready For Release)_
- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_
- [BK-32](https://jira.upexgalaxy.com/browse/BK-32): TMS-Test View | View a test with all chained ATCs expanded _(Ready For Release)_
- [BK-28](https://jira.upexgalaxy.com/browse/BK-28): TMS-Test Builder | Reorder ATCs inside a test _(Ready For Release)_
- [BK-18](https://jira.upexgalaxy.com/browse/BK-18): TMS-ATC API | Create and edit ATCs with steps and assertions _(Ready For Release)_
- [BK-21](https://jira.upexgalaxy.com/browse/BK-21): TMS-ATC Propagation | Cascade ATC edits to all tests _(QA Approved)_
- [BK-22](https://jira.upexgalaxy.com/browse/BK-22): TMS-ATC Usage | See a "Used in N tests" report _(QA Approved)_
- [BK-227](https://jira.upexgalaxy.com/browse/BK-227): TMS-Test | Track the automation status of a test _(Backlog)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 7/23/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** master-sprint-4, mvp, shift-left-2026-06-06, shift-left-reviewed, tests-epic

---

_Synced from Jira by sync-jira-issues_
