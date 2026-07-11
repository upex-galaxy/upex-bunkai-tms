# TMS-Test Plan | Track plan progress from run outcomes

**Jira Key:** [BK-204](https://jira.upexgalaxy.com/browse/BK-204)
**Epic:** [BK-201](https://jira.upexgalaxy.com/browse/BK-201) (Test Plans & Milestones)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Mateo Silva, QA Lead, I want the plan view to show each member test's latest run outcome and an aggregate progress summary, so that I can answer "what does this cycle cover and where does it stand?" in under a minute.

## Context

Runs already record outcomes for every executed Test. This story surfaces those existing outcomes inside the plan: each member test shows the verdict of its most recent run, and the plan header aggregates them into a progress summary. Nothing here executes anything new — progress is a read-only projection of the run history the product already keeps. This story activates once its dependency epics (Tests, Manual Execution & Runs) and the plan membership story are live.

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

## Traceability

### Storys (3)

- [BK-203](https://jira.upexgalaxy.com/browse/BK-203): TMS-Test Plan | Add and remove tests from a plan _(Backlog)_
- [BK-207](https://jira.upexgalaxy.com/browse/BK-207): TMS-Test Plan | Close a plan with an outcome summary _(Backlog)_
- [BK-206](https://jira.upexgalaxy.com/browse/BK-206): TMS-Milestone | Assign test plans and track milestone readiness _(Backlog)_

### Epic (1)

- [BK-30](https://jira.upexgalaxy.com/browse/BK-30): Manual Execution & Runs _(Planning)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
