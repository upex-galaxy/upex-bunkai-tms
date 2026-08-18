# TMS-Activity | Surface ATC edits with the Tests they affect

**Jira Key:** [BK-268](https://jira.upexgalaxy.com/browse/BK-268)
**Epic:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44) (Coverage & Traceability)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** see an ATC edit in the workspace activity feed no matter where the edit was made, including which Tests it affects
***So that*** I know a Test I depend on was rewritten under me instead of finding out the hard way during my next run

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

## Dependency note

`ADR-0009` (ATC edit propagation contract) recorded a follow-up: unify the in-app ATC editor onto the same write path the API uses, so both surfaces emit the same edit event. As of this story's creation, `ADR-0009` is still status ***Proposed***, not accepted. This story does not ratify or modify that ADR — it only requires that both editing surfaces produce a visible activity entry. Whether that is achieved by adopting the ADR's proposed unification or by another route is an implementation decision for `/sprint-development`, not decided here.

## Open questions for the PO

- [ ] Should an ATC edit also generate a notification (not just a feed entry) to watchers of the Tests it affects, or is a feed entry sufficient for this story?
- [ ] How should the activity entry render when the number of affected Tests is large (e.g. dozens), and how should it render when the edit affects zero Tests?

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)

---

## Metadata

- **Created:** 8/5/2026
- **Updated:** 8/12/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
