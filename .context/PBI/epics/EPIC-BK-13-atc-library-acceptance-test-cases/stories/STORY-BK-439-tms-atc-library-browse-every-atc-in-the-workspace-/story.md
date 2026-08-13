# TMS-ATC Library | Browse every ATC in the workspace from one index

**Jira Key:** [BK-439](https://jira.upexgalaxy.com/browse/BK-439)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 5

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** browse every ATC in the workspace from a single cross-project index, and open any row into its owning Project
***So that*** I can confirm whether a reusable ATC already exists before writing a duplicate

## Definition of done

- [ ] The sidebar's "ATC Library" entry is live and reachable, no longer a disabled "Coming soon" placeholder
- [ ] The entry carries an unfiltered count badge of every ATC the caller can read in the active Workspace
- [ ] Opening the ATC Library shows a single dense list combining ATCs from every Project the caller can access, with no artificial cap
- [ ] Each row shows ATC id, name, owning Project, Module, layer (text label + color), anchored User Story / Acceptance Criterion, and "used in N tests"
- [ ] Opening a row navigates into the ATC's owning Project, with a toast naming the destination; no in-place editor opens
- [ ] The screen has default, loading, empty (including empty-workspace), and named-error-with-retry states
- [ ] An ATC in a Project the caller cannot access never appears in the list or in the badge count
- [ ] A workspace with a single Project renders the list correctly
- [ ] "Test Runs", "Bug Reports", and "Metrics" remain disabled "Coming soon" items, unaffected
- [ ] No search field and no filter controls ship in this slice

## Context

First of the three slices BK-267 was split into by the AI Product Owner ruling (comment 12315) and partitioned architecturally by the AI Tech Lead ruling (comment 12316) on BK-267. Covers BK-267's AC-01, AC-02, AC-08 (empty-workspace scenario only), AC-09, AC-10, AC-11, AC-12, AC-13, AC-14. Delivers the structural cost of the whole feature: the `/atcs` route, the sidebar entry going live with its count badge, the cross-project read, and the dense row — nothing else. It is the independently shippable slice: a complete, dense, cross-project index a user can scan and launch from answers "does this ATC already exist" on day one.

## Provenance

Materialized from BK-267 (AI Product Owner ruling, comment 12315; AI Tech Lead ruling, comment 12316), 2026-08-13. BK-267 was found not implementable at its recorded 1 SP against 14 AC blocks / 19 scenarios, and was split three ways. This slice carries the largest share of the estimate because it pays the entire structural cost (route, cross-project read, endpoint, sidebar, badge) that the two following slices build on top of.

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
