# TMS-ATC Library | Export a Project's ATCs to CSV

**Jira Key:** [BK-315](https://jira.upexgalaxy.com/browse/BK-315)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Estimation
**Priority:** Medium
**Story Points:** 1

---

## Overview

## User story

********As a**** QA Lead
********I want to******** export a Project's ATC library as a CSV file
****So that******** I can hand auditors and stakeholders a reviewable snapshot of the project's test-case inventory without assembling it by hand

## Context

No export capability exists anywhere in the product today. The existing Jira import machinery (BK-17) only writes User Stories and Acceptance Criteria — it never touches ATCs. BK-50 exports a single User Story's evidence chain, a different entity boundary (see Out of Scope). This story is the first export capability at the ATC-library level.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-16

> Refined Acceptance Criteria live in the Acceptance Criteria (Gherkin) field.

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Double-click / repeated "Export as CSV" trigger | No | Medium | Add to AC (PO confirm) |
| 2 | Tag free-text containing comma/quote/line-break | No | High | Add to AC (PO confirm) |
| 3 | Completely unauthenticated request (no session, no PAT) | No | Medium | Add to AC (PO confirm) |
| 4 | Very large library (5,000+ ATCs) beyond "several hundred" | No | High | Add to AC (PO confirm) |
| 5 | Slow/failed generation producing a partial or corrupted file | No | High | Add to AC (PO confirm) |
| 6 | Title + Tags cell both needing escaping in the same row | No | Medium | Test only — inferred from RFC4180 composition, don't force a new AC |

### Clarified Business Rules

- Every sibling project-scoped reporting endpoint (coverage, runs/report, bugs/heatmap, traceability, metrics/recovery-cycles) already implements the same non-disclosure 404 convention for inaccessible/nonexistent Projects — recommend BK-315 reuse it.
- `atcs.module_id`, `atcs.layer`, `atcs.status` are all DB NOT NULL — no "unset field" scenario exists for the export.

### Critical Questions for PO

1. ***What delimiter joins multiple tags into the single Tags CSV cell?*** Suggested answer: `"; "` (semicolon-space) — avoids the delimiter itself ever triggering quoting.
2. ***Does free-text Tag content permit commas, double quotes, or line breaks — the same character set as Title?*** If tag free-text is already constrained (e.g. slug-like) at creation time, this narrows to "N/A."
3. ***Is there an upper bound on ATC library size for this export, or must it support unbounded growth (streaming)?*** No precedent in this codebase does a full, unbounded, single-request export today.

### Technical Questions for Dev

1. ***Reuse the established non-disclosure 404 convention?*** Every sibling project-scoped reporting endpoint already implements `P0002` → `404` + ````` via a per-domain error mapper (`lib/coverage/errors.ts`). Recommend BK-315's export endpoint follow the identical pattern.
2. ***Expected status for a fully unauthenticated request?*** Presumably standard `401`, distinct from the `404` non-disclosure path, but the Story only covers the authenticated-but-unauthorized case.
3. ***Client-side lock on the export trigger?*** Is "Export as CSV" disabled while a request is in flight, or can it be triggered repeatedly?
4. ***Performance/timeout budget for large exports?*** Even an informal "best-effort, no SLA" answer unblocks the slow-generation scenario's design.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the Acceptance Test Plan (ATP) field and the canonical comment below.

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

- **Created:** 8/6/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Alfonso Hernandez
- **Labels:** atc, csv-export, mvp, shift-left-2026-08-16, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
