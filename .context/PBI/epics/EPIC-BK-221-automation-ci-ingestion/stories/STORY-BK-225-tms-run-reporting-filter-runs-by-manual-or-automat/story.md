# TMS-Run Reporting | Filter runs by manual or automated execution mode

**Jira Key:** [BK-225](https://jira.upexgalaxy.com/browse/BK-225)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Elena Vargas, Senior QA Engineer***, I want the runs views to distinguish manual from automated execution with a visible badge and a filter, so that I can tell at a glance what the team ran by hand versus what the automation reported — and answer coverage questions per mode.

## Context

The runs views already exist: each Test has a run history filterable by outcome, and the project runs view shows pass/fail totals with filters. Once agents and CI pipelines start reporting runs, those lists mix human and machine executions — and the mix is invisible. This story makes execution mode a first-class, visible, filterable dimension: a mode badge on every run row, an execution-mode filter that composes with the existing filters, and totals split per mode.

This story activates when its dependencies are live: it extends the project runs reporting view and the run history view from the Manual Execution & Runs epic, and it becomes genuinely useful once the sibling ingestion stories (API submission, streaming, CI upload) start producing automated runs.

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

- [BK-222](https://jira.upexgalaxy.com/browse/BK-222): TMS-Automation API | Submit an automated run with step results _(Backlog)_
- [BK-227](https://jira.upexgalaxy.com/browse/BK-227): TMS-Test | Track the automation status of a test _(Backlog)_
- [BK-38](https://jira.upexgalaxy.com/browse/BK-38): TMS-Run Reporting | Filter project runs with pass/fail totals _(QA Approved)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
