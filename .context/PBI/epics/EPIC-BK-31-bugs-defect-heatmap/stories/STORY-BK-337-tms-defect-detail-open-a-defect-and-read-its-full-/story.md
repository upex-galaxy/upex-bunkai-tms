# TMS-Defect Detail | Open a defect and read its full record

**Jira Key:** [BK-337](https://jira.upexgalaxy.com/browse/BK-337)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to open a defect and read its full record, so that I can act on it or hand it off without piecing its context together from memory or the Test Runner history.

## Context

Filing a defect, listing defects, viewing the defect heatmap, assigning a defect, and syncing a defect to an external tracker all exist or are already queued for development, but none of them opens a single defect into a full read. Eight defect fields stored today — description, steps to reproduce, evidence, who filed it, when it was filed or last updated, and the originating ATC and run step — are reachable nowhere in the current UI. A QA engineer who wants to reread a filed defect's own record, or a developer who was just assigned one, has no route to it; the defects list itself renders the Run reference as plain text with no link.

Mockup: `bug-detail.html` in `.context/designs/bunkai-test-management-tool/bk-31-bug-reports/`, spec section §4.6 of `.context/design/master-design-plan.md`.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-11

> Refined Acceptance Criteria live in the Acceptance Criteria field. The full refinement — gap table with in-repo evidence, coverage estimate, risks and data feasibility — lives in the Acceptance Test Plan (ATP) field.

Verdict: SIGNIFICANT ISSUES · Testability: PARTIAL · Risk: HIGH (score 11 + authorization-perimeter veto) · 11 gaps, 2 blocking · 34 outlines estimated.

### Blocking findings

- ***G1 — Expected vs Actual has no storage.*** AC1 and Scope both require it; the `bugs` table has no such column and the filing dialog never captures it. This Story's own Context paragraph enumerates the eight stored fields and Expected/Actual is not among them.
- ***G2 — Layer and environment are not defect attributes.*** `layer` belongs to `atcs`, `environment` is reached only through a run. A standalone defect has neither, so AC2's "full record exactly as filed" and the Scope's Details panel cannot both hold.

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Run deleted after filing, provenance nulled, record then reads "filed manually" (false) | No | High | Add to AC (PO confirm) |
| 2 | Partial provenance — ATC nulled, run intact | No | High | Add to AC (PO confirm) |
| 3 | Evidence URL with a `javascript:` or `data:` scheme | No | High | Add to AC + Business Rule (PO confirm) |
| 4 | Cross-workspace identifier — must answer 404, not 403 | No | High | Add to AC (PO confirm) |
| 5 | Real identifier opened under the wrong project slug | No | High | Add to AC (PO confirm) |
| 6 | Failing step at position 0 — 0-based storage vs 1-based display | No | High | Test only |
| 7 | Defect in an archived module, reachable only by notification deep link | No | Medium | Add to AC (PO confirm) |
| 8 | Evidence at 0 and at the cap of 10 | Partly (AC3 covers 6) | Medium | Test only |
| 9 | Viewer-role member reads the record | No | Medium | Add to AC (PO confirm) |
| 10 | Empty steps to reproduce | No | Medium | Test only |
| 11 | Null description | No | Medium | Test only |
| 12 | Reporter's account deleted, `created_by` nulled | No | Low | Test only |
| 13 | Module path at depth 1 and at depth 6 | No | Low | Test only |

### Clarified Business Rules — proposed, not yet ratified

- The detail route answers 404, never 403, for any defect the reader may not see: unknown identifier, another workspace, or a real identifier under the wrong project slug. A 403 confirms the identifier exists and leaks cross-tenant existence. The convention already has an in-repo precedent.
- Evidence entries render as links only for the http and https schemes; any other scheme renders as inert text. Links carry `rel="noopener noreferrer"`.
- "Filed manually" and "the originating run is no longer available" are two distinct states. Provenance foreign keys null out on delete, so the first notice must not be shown for the second case.
- The Run cell on the defects list opens the defect record, not the run report. The Origin panel inside the record is the single route onward to the run.
- Whichever way the archived-module case is decided, the rule is stated here rather than left to the query.

### Critical Questions for PO — these block estimation

1. ***Expected vs Actual******:****** cut, capture, or derive?*** Recommendation: cut from this Story; open a separate one to capture at filing time.
2. ***What do layer and environment show for a standalone defect?*** Recommendation: drop both rows from the Details panel.
3. ***A defect in an archived module******:****** render it, or answer 404?*** Recommendation: render it, and write the rule down.
4. ***What identifier does the record show?*** Recommendation: keep the list's treatment (8-character prefix, full value on hover) and rewrite the criteria against it.

### Technical Questions for Dev

1. How is the steps blob split into numbered items, and is the displayed number 0-based or 1-based?
2. Which composer does the single-defect read RPC extend?
3. Does the route re-check the project against the resolved slug, or trust it?
4. What renders in an evidence row, given only a URL is stored, and what is the open target?
5. Should the filing-time evidence validation be tightened as well as the render path?

### Scope gap worth pricing before estimation

No single-defect read endpoint and no read RPC exist today. Scope names the page route only, so the Story presents as a UI ticket; the missing backend leg is roughly the same size as the visible half.

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

## Traceability

### Storys (2)

- [BK-43](https://jira.upexgalaxy.com/browse/BK-43): TMS-Defect Sync | Sync defects one-way to the external tracker _(ABORTED)_
- [BK-372](https://jira.upexgalaxy.com/browse/BK-372): TMS-Defect Sync | Send a newly filed defect to Jira _(Backlog)_

---

## Metadata

- **Created:** 8/10/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-08-11, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
