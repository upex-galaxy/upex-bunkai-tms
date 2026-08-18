# TMS-Defect List | List and filter defects by module, status, severity

**Jira Key:** [BK-41](https://jira.upexgalaxy.com/browse/BK-41)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** In Test
**Priority:** Medium
**Story Points:** 2
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## Overview

***Source spec:*** BK-026

## User story

***As a*** QA Engineer  
***I want to*** list and filter defects by module (including its sub-modules), status and severity, with counts by severity and status  
***So that*** I can focus on the defects affecting a given area without wading through everything

## Definition of done

- [ ] Defects can be listed for a chosen module
- [ ] Selecting a module includes defects from all of its nested sub-modules
- [ ] The list can be filtered by status and by severity, alone or combined
- [ ] Counts by severity (P1 to P4) are shown for the current view
- [ ] Counts by status (open, in progress, resolved, closed) are shown for the current view
- [ ] An empty result shows a clear "no defects match" state rather than a blank screen
- [ ] Counts update to reflect whatever filters are currently applied

---

## QA Refinements (Shift-Left Analysis)

> ***INFO:*** Shift-left refinement completed on 2026-06-27 and post-publication audit completed on 2026-06-27. This section summarizes the QA contract delta; refined ACs and ATP Draft are stored in their canonical Jira fields.

| ***Area**** | ****Result*** |
| --- | --- |
| Refined ACs | 8 Gherkin scenarios covering happy path, filters, aggregates, subtree, pagination, empty state, and archived-module default |
| Contract decisions | 6 decisions: aggregates in response, recursive module subtree, live aggregation, bugs:read + RLS, empty-state 200, archived modules hidden by default |
| High risk | Subtree traversal correctness at depth 6; covered by AC-2 + ATP-2 |
| ATP Draft | 16 outline rows |
| QA Story Points | 2 SP advisory, confidence 0.70; Jira Story Points remain canonical |
| Dev gate | [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) should start after [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) ships the bugs schema and POST /bugs contract |
| Current status | Estimation |

### Expert Decision

Archived/soft-deleted module defects are hidden by default in [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41). A future `include_archived=true` query parameter can make this reversible if PO/Dev decide archived-module reporting is needed later.

### Out of Scope

- Defect filing: [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40)
- Defect heatmap: FR 7.4 / separate Story
- Jira sync: FR 7.5 / separate Story
- Defect lifecycle transitions: future Story

- 

> ***SUCCESS:*** [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) is refined and ready for estimation from QA perspective. Current Jira status is Estimation. PO/Dev still own estimation and Ready For Dev.

## QA Handoff Mirror - [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41)

***Executive summary:*** [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) was refined from 7 DoD bullets into 8 Gherkin ACs, 6 contract decisions, and a 16-row ATP outline. Main value: QA can focus on defects in an active module subtree without wading through unrelated defects.

| ***Refinement Delta**** | ****Result*** |
| --- | --- |
| Contract decisions | 6: aggregates in response, recursive module subtree, live aggregation, bugs:read + RLS, empty-state 200, archived modules hidden by default |
| AC reconciliation | 7 original DoD bullets + 1 expert decision mapped to 8 Gherkin scenarios |
| High risks | 1 High risk: subtree correctness; covered by AC-2 + ATP-2 |
| ATP rows | 16 outline rows: positive, negative, boundary, integration, API |
| Open confirmations | None. Senior PO expert resolved archived-module default as hide-by-default, reversible with future include_archived=true. |

## Key Contract Decisions

| ***Decision**** | ****Evidence*** |
| --- | --- |
| GET /api/v1/bugs must return data plus aggregates.by*severity and aggregates.by*status | Source FR BK-026 + [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) DoD |
| Aggregates count the full filtered set, not only the current page | Expert panel decision |
| Module subtree uses recursive traversal via parent*module*id, not prefix-match on slug path | Repo tree model warning |
| Auth uses PAT scope bugs:read and RLS via project_membership | Repo API pattern |
| Empty state is 200 + [] + zeroed aggregates | UX + QA decision |
| Archived module defects hidden by default | Senior PO expert decision; now mirrored in AC scenario |

## ATP Draft Summary

| ***Positive**** | ****Negative**** | ****Boundary**** | ****Integration**** | ****API**** | ****Total*** |
| --- | --- | --- | --- | --- | --- |
| 6 | 5 | 4 | 2 | 16 | 16 |

## Risk Summary

| ***Risk**** | ****Severity**** | ****Coverage*** |
| --- | --- | --- |
| Subtree traversal correctness at depth 6 | :red_circle: High | AC-2 + ATP-2 |
| Aggregates drift with pagination | :large*orange*circle: Medium | AC-6 + ATP-7 |
| Cross-project IDOR / aggregate leak | :large*orange*circle: Medium | ATP-9 |
| [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) schema dependency | :large*orange*circle: Medium | Dev readiness gate |

> ***WARNING:*** Dev readiness is conditional: [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) should start after [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) ships the bugs schema and POST /bugs contract. [https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41](https://jira.upexgalaxy.com/browse/BK-41#icft=BK-41) must not duplicate or own BK-40's migration.

## QA Story Points Recommendation

- Recommendation: 2 SP
- Confidence: 0.70
- Basis: effort=Med; complexity=Med; uncertainty=Low; risk=Low
- Rationale: read-only endpoint, but subtree CTE + aggregates + RLS/IDOR validation make Jira's current 1 SP optimistic.
- Re-estimation triggers: status transitions added to scope; [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40) schema slips; subtree helper must be built from scratch; aggregates/pagination contract changes.
- Boundary: QA recommendation only; Jira Story Points / Epic / User Story fields remain canonical unless explicitly updated.

## Out of Scope

- Defect filing: [https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40)
- Defect heatmap: FR 7.4 / separate Story
- Jira sync: FR 7.5 / separate Story
- Defect lifecycle transitions: future Story

## Publication Status

| ***Item**** | ****Status*** |
| --- | --- |
| Refined AC field | {status:green | PUBLISHED} |
| Archived-module AC patch | {status:green | PUBLISHED} |
| ATP Draft field | {status:green | PUBLISHED} |
| QA mirror comment | {status:green | UPDATED} |
| Labels | {status:green | APPLIED} |
| Story transition | {status:blue | CURRENTLY ESTIMATION} |

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

- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(QA Approved)_
- [BK-258](https://jira.upexgalaxy.com/browse/BK-258): TMS-Home | Show open bug count and severity breakdown _(Ready For QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 8/6/2026
- **Reporter:** Ely
- **Assignee:** micaelavirgagarcia
- **Labels:** shift-left-2026-06-27, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
