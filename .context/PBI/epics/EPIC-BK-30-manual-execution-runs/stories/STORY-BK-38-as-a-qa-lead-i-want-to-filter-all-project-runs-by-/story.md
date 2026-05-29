# TMS-Run Reporting | Filter project runs with pass/fail totals

**Jira Key:** [BK-38](https://upexgalaxy67.atlassian.net/browse/BK-38)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-023

## User story

***As a*** QA Lead
***I want to*** filter and review all Runs across the Project by date range, module, status, and executor type, with pass and fail totals
***So that*** I can answer "what did we execute and how did it go?" in under a minute

## Definition of done

- [ ] The Lead sees every Run across the Project in one filterable list
- [ ] Runs can be filtered by date range, module, status, and executor type, in combination
- [ ] Pass and fail totals reflect the currently applied filters
- [ ] A filter combination with no matching Runs shows an empty result with zeroed totals
- [ ] Each row shows the Test, module, environment, executor mode, outcome, and date
- [ ] Clearing all filters restores the full project-wide list and totals

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

### Story (1)

- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:51.468Z_
