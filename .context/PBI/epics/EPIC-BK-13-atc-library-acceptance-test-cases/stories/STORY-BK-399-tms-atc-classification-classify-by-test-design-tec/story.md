# TMS-ATC Classification | Classify by test-design technique and priority

**Jira Key:** [BK-399](https://jira.upexgalaxy.com/browse/BK-399)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** classify each ATC by the test-design technique that produced it and by its priority
***So that*** I can assess how well my test suite's design techniques and priority levels actually cover the feature, not just how many ATCs exist

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

## Technical notes

### Current state (verified at `origin/staging@4924f48`)

`atcs` (`supabase/migrations/0004*atcs.sql:54-68`) carries exactly: `id, project*id, module*id, user*story*id, slug, title, layer, version, status, tags, tsv, created*at, updated*at`, plus `archived*at` (`0014*module*soft*delete.sql:31`) and two CHECK constraints added later — a title-length floor (`0058*atc*title*min*length.sql:50`) and a 10-tag cap (`0065*atc*tags*cap*guard.sql:26-27`). There is no `priority` and no `derivation*technique`/`technique` column anywhere in the schema; `git grep -i "derivation_technique"` returns zero hits repo-wide. This story specifies two new optional classification fields on that same header row, following the same shape as the existing `layer` enum.

### Why technique and priority ship together

Both attributes share the same edit surface (the ATC editor's attribute panel, `components/atcs/AtcEditor.tsx`, alongside the existing Layer segmented control and Tags chip input) and the same shape (a constrained, optional enum plus a matching list filter). Splitting them into two stories would touch the same files for roughly half a story point each.

### Scope boundary vs. EPIC BK-13's Phase-3 deferral

EPIC BK-13's Out of Scope section defers "ATC parameterization editors (equivalence partitions, boundary values, decision tables, state transitions)" to Phase 3. This story is not that: storing which test-design technique produced an ATC is a constrained enum column plus a list filter, not an authoring surface for technique-specific test data (equivalence-partition input tables, boundary-value data grids, decision-table matrices, state-transition diagrams). See the attributed decision comment on this issue for the full scoring of this boundary call.

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

- **Created:** 8/12/2026
- **Updated:** 8/12/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** atc-classification, atc-library, discovery-2026-08-12

---

_Synced from Jira by sync-jira-issues_
