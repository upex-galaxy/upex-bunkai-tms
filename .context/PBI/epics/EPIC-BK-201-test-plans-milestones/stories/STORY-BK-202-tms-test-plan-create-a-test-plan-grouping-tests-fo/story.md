# TMS-Test Plan | Create a test plan grouping tests for a goal

**Jira Key:** [BK-202](https://jira.upexgalaxy.com/browse/BK-202)
**Epic:** [BK-201](https://jira.upexgalaxy.com/browse/BK-201) (Test Plans & Milestones)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 3

---

## Overview

## User story

As Mateo Silva, QA Lead, I want to create a named test plan (name, description, optional target goal or release) inside a project, so that my team executes against an agreed scope instead of purely ad-hoc runs.

## Context

Bunkai teams already assemble Tests and execute them through manual Runs. A Test Plan is the missing container that declares, up front, which Tests a cycle is expected to cover — for example a "Release 2.4 regression" plan. This story delivers the plan container itself; curating its membership and tracking its progress arrive in the sibling stories of this epic. The story activates once its dependency epics (Tests, Manual Execution & Runs) are live in the product.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-14

> Refined Acceptance Criteria live in the Acceptance Criteria field.

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Concurrent duplicate-name creation race | No | High | Add to AC (PO confirm) |
| 2 | Double-click / double-submit on create dialog (idempotency) | No | Medium | Test only |
| 3 | Name padded with tabs or non-breaking space | No | Medium | Add to AC (PO confirm trim scope) |
| 4 | Name at exactly 100 vs. 101 characters | Implied by the business rule's stated range, not by an AC | High | Test only — rule is already explicit |
| 5 | Description/goal with no stated max length | No | Medium | Add to AC (PO confirm max length) |
| 6 | Renaming a plan into collision with an existing name | No | High | Add to AC (PO confirm) |
| 7 | Viewer hitting the create/edit API directly, bypassing the UI | No | Critical | Add to AC (PO/security confirm) |
| 8 | Stale client-cached role after a mid-session demotion | No | High | Add to AC (PO/security confirm) |
| 9 | Unicode/emoji/RTL characters in the plan name | No | Low | Test only |
| 10 | Whether Delete is planned anywhere for a Test Plan | No | Medium | Ask PO — scope question, not a test outline |
| 11 | Maximum plan count per project (unlimited vs. capped) | No | Low | Ask PO |

### Clarified Business Rules

- ***Edit is not creator-restricted***: business rule "member role or higher" carries no owner qualifier — any project member with role ≥ member may edit any plan, not only its own creator (ties to Scenario 4.3; still flagged as Ambiguity #1 for explicit PO confirmation).
- ***"Creating and editing plans requires the member role or higher" is already PO-ratified****: comment T2 (Ely, 2026-07-11) confirms — **"T2 confirmed***:**** creating and editing plans stays member role and above."** No open question on this specific point.
- ***Name length bounds are inclusive***: the stated "1 to 100 characters" range includes both the 1-character (post-trim) and the 100-character boundary as valid.
- ***Uniqueness is scoped per project, not global***: the same plan name may be reused across different projects.
- ***Trim applies before the uniqueness check***: "compared after trimming spaces" affects both the minimum-length check and the duplicate-name check, not only the minimum-length check in isolation.

### Open Questions for PO / Dev

#### Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***Should BK-202 stay in Estimation until epic BK-24 (Tests) ships, or is the plan container decoupled enough to build and estimate now against a stub?***

1. ***Is Delete ever planned for a Test Plan, or is Close (sibling story BK-207) the only way a plan leaves the "Open" state, making Delete permanently out of scope for the whole epic?***

1. ***Is the "member role or higher" gate on create/edit enforced server-side, independent of the UI hiding the affordance, and does it re-check the live role at submit time rather than trusting a client-cached role?***

1. ***Does renaming an existing plan re-trigger the same case-insensitive, trimmed uniqueness check as creation?***

#### Technical Questions for Dev

> These do not block PO but block implementation.

1. ***What is the exact, verbatim error-message copy for the duplicate-name rejection (AC3) and the blank-name rejection (AC4)?*** — the Story paraphrases both ("a message that a plan with that name already exists," "a validation message asking for a name") without literal UI strings; needed to write precise assertions.
2. ***Does "compared after trimming spaces" mean ASCII space (0x20) only, or all whitespace (tabs, newlines, non-breaking space U+00A0)?*** — affects the expected outcome of both the uniqueness check and the blank-name check on whitespace-class test data.
3. ***Is plan edit restricted to the plan's original creator, or can any project member with role ≥ member edit any plan?*** — the business rule states "member role or higher" without an owner qualifier, implying any member; please confirm this reading is correct before it's built either way.
4. ***What is the intended max length for description and goal?*** — name has an explicit 1–100 char rule; description/goal have none stated.
5. ***Is per-project name uniqueness backed by a DB-level unique constraint, or an app-level check only?*** — determines whether the concurrent-duplicate-creation race (Edge Case #1) is actually closed.
6. ***Is there an intended maximum number of Test Plans per project, or is the list unbounded by design?*** — affects whether list/pagination behavior needs its own test coverage.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field and the canonical comment below.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (2)

- [BK-203](https://jira.upexgalaxy.com/browse/BK-203): TMS-Test Plan | Add and remove tests from a plan _(Backlog)_
- [BK-207](https://jira.upexgalaxy.com/browse/BK-207): TMS-Test Plan | Close a plan with an outcome summary _(Backlog)_

### Epic (1)

- [BK-24](https://jira.upexgalaxy.com/browse/BK-24): Tests (chains of ATCs) _(Planning)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/19/2026
- **Reporter:** Ely
- **Assignee:** Alfonso Hernandez
- **Labels:** new-feature, post-mvp, shift-left-2026-08-14, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
