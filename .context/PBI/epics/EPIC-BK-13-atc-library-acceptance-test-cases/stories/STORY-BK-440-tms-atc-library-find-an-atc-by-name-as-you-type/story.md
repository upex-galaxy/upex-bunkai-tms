# TMS-ATC Library | Find an ATC by name as you type

**Jira Key:** [BK-440](https://jira.upexgalaxy.com/browse/BK-440)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 3

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** narrow the ATC Library by typing an ATC's name, with "/" and Esc as keyboard shortcuts
***So that*** I can find a specific reusable ATC quickly inside a large workspace

## Definition of done

- [ ] Typing into the search field narrows the list to matching ATCs incrementally, by name only, with no submit step
- [ ] Pressing "/" from anywhere on the screen focuses the search field
- [ ] Pressing Esc while the search field is focused clears the term and returns to the full list
- [ ] The search term is carried in the URL and restored when the user returns via Back
- [ ] A search with no matches shows the same "nothing found" empty state, distinct from the empty-workspace state
- [ ] The Cmd+K / Ctrl+K binding is NOT wired to this screen (retired; reserved for BK-398's command palette)

## Context

Second of the three slices BK-267 was split into by the AI Product Owner ruling (comment 12315) and partitioned architecturally by the AI Tech Lead ruling (comment 12316) on BK-267. Covers BK-267's AC-03, the "/" and Esc scenarios of AC-04 only, and the no-match scenario of AC-08. Depends on the prior slice: without its route, list, and read, there is nothing to narrow.

***AC-04 amendment (binding, not an omission)******:*** the Cmd+K / Ctrl+K scenario in BK-267's AC-04 is retired and does not carry into this slice — see Out of Scope for the reasoning.

***Search-target amendment (binding, not an omission)******:**** this slice matches ATC ****name*** only, not ATC id, resolving a disagreement between BK-267's own design artifacts in the PO's favor.

## Provenance

Materialized from BK-267 (AI Product Owner ruling, comment 12315; AI Tech Lead ruling, comment 12316), 2026-08-13.

***Sizing — two independent estimates on record, both stated******:**** the AI Tech Lead ruling (comment 12316) sizes this slice at ****3 SP****; the AI Product Owner ruling (comment 12315) independently proposed ****2 SP***. Story Points recorded on this ticket follow the Tech Lead's estimate (sizing is the Tech Lead's remit, not the PO's), with the PO's dissenting estimate kept on record here rather than silently dropped.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Storys (3)

- [BK-439](https://jira.upexgalaxy.com/browse/BK-439): TMS-ATC Library | Browse every ATC in the workspace from one index _(Backlog)_
- [BK-441](https://jira.upexgalaxy.com/browse/BK-441): TMS-ATC Library | Narrow the index by Project, Module, layer and anchor _(Backlog)_
- [BK-267](https://jira.upexgalaxy.com/browse/BK-267): TMS-ATC Library | Browse, search, and filter ATCs across every project _(ABORTED)_

---

## Metadata

- **Created:** 8/13/2026
- **Updated:** 8/13/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
