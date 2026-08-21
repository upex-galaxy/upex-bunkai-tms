# TMS-ATC Library | Bulk-edit tags, Module and layer on selected ATCs

**Jira Key:** [BK-507](https://jira.upexgalaxy.com/browse/BK-507)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

********As a**** Senior QA Engineer
********I want to******** select several ATCs in a Project's ATC list and change their tags, Module, or layer in a single action
****So that******** I can reorganize a Project's ATC set after a refactor without opening each ATC one at a time

## Definition of done

- [ ] ATC rows in a Project's ATC list can be selected individually and all-at-once, with a live count of the selection
- [ ] A bulk-edit action, available only while something is selected, changes tags, Module, or layer across the whole selection
- [ ] A confirmation step names the exact change and the exact number of ATCs before anything is written
- [ ] A partial failure reports how many ATCs changed, how many did not, and why, without discarding the changes that succeeded
- [ ] A bulk edit propagates to the Tests that chain the changed ATCs exactly as a single-ATC edit does
- [ ] Each changed ATC produces its own entry in the workspace Activity Stream

## Context

The PRD commits to bulk-edit as MVP scope (`.context/PRD/mvp-scope.md` US 8.2: "a table view of any entity type ... with column-level filters, sort, and bulk-edit (status, tags, module) so I work densely"), and `.context/master-implementation-plan.md` gap G9 records the batching capability as declared but never specified. Neither has been built: the Project ATC list has no selection affordance today, and the only bulk action anywhere in the product is marking every notification read.

This story is deliberately scoped to the ATC list that already exists inside a Project, ***not*** to the workspace-wide ATC index (BK-439), which is still unbuilt. See the AI Tech Lead decision comment on this story for the alternatives scored. The field set delivered here is tags, Module and layer rather than the PRD's literal "status, tags, module" — see the AI Product Owner decision comment for why an ATC's status is not an authored field.

## Provenance

Authored 2026-08-18 by the autonomous discovery routine, from `.context/PRD/mvp-scope.md` US 8.2 and `.context/master-implementation-plan.md` gap G9.

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

- **Created:** 8/18/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
