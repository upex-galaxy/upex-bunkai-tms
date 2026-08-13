# TMS-ATC Library | Narrow the index by Project, Module, layer and anchor

**Jira Key:** [BK-441](https://jira.upexgalaxy.com/browse/BK-441)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 3

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** narrow the ATC Library by Project, Module, layer, and its anchored User Story / Acceptance Criterion together, and clear them all in one gesture
***So that*** I can zero in on the ATCs relevant to what I'm building without retyping a search

## Definition of done

- [ ] Project, Module, and layer filters can be set together and narrow the list with AND semantics
- [ ] Module filter options cascade from the selected Project
- [ ] An active search term and active filters combine and narrow the list together
- [ ] "Clear all" clears the search term and every active filter in one gesture, restoring the full list
- [ ] Every active filter is carried in the URL under the same replace semantics as the search term

## Context

Third and last of the three slices BK-267 was split into by the AI Product Owner ruling (comment 12315) and partitioned architecturally by the AI Tech Lead ruling (comment 12316) on BK-267. Covers BK-267's AC-05, AC-06, AC-07. Depends on both prior slices: the browse surface to filter, and the search field's URL-state machinery that this slice's "Clear all" extends.

## Provenance

Materialized from BK-267 (AI Product Owner ruling, comment 12315; AI Tech Lead ruling, comment 12316), 2026-08-13.

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

### Storys (2)

- [BK-440](https://jira.upexgalaxy.com/browse/BK-440): TMS-ATC Library | Find an ATC by name as you type _(Backlog)_
- [BK-267](https://jira.upexgalaxy.com/browse/BK-267): TMS-ATC Library | Browse, search, and filter ATCs across every project _(ABORTED)_

---

## Metadata

- **Created:** 8/13/2026
- **Updated:** 8/13/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
