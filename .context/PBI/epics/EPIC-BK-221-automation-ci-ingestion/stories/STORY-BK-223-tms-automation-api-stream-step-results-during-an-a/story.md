# TMS-Automation API | Stream step results during an automated run

**Jira Key:** [BK-223](https://jira.upexgalaxy.com/browse/BK-223)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Karim, an Autonomous AI Test Agent***, I want to start a run, report step results one by one in near-real-time, and finish it with a verdict, so that humans watching the run view see progress live and an interrupted run leaves an honest partial record instead of silence.

## Context

The single-call submission story covers "the run already happened". Streaming covers "the run is happening now": Karim opens a Run against an existing Test, pushes each step result as he executes it, and closes the run with a verdict — mirroring the manual flow where a QA engineer marks steps one by one and finishes with a verdict. Anyone with the run detail open sees steps flip in near-real-time. This is the write-back primitive Karim never gets from other tools: read a test, execute it, stream state back.

This story activates when its dependencies are live: it builds on the run lifecycle from the Manual Execution & Runs epic (start, per-step statuses, finish verdict, abort with reason), workspace Personal Access Tokens from Settings, and the auth/idempotency contract established by the sibling single-call submission story.

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

### Storys (5)

- [BK-222](https://jira.upexgalaxy.com/browse/BK-222): TMS-Automation API | Submit an automated run with step results _(Backlog)_
- [BK-88](https://jira.upexgalaxy.com/browse/BK-88): Settings | Manage Personal Access Tokens _(Ready For Dev)_
- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_
- [BK-39](https://jira.upexgalaxy.com/browse/BK-39): TMS-Run Execution | Finish a run with a final verdict _(Ready For Release)_
- [BK-35](https://jira.upexgalaxy.com/browse/BK-35): TMS-Run Execution | Mark each step pass, fail, or block _(Estimation)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
