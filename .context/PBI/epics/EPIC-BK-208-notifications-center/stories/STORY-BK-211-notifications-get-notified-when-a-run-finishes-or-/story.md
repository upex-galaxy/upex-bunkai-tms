# Notifications | Get notified when a run finishes or is aborted

**Jira Key:** [BK-211](https://jira.upexgalaxy.com/browse/BK-211)
**Epic:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208) (Notifications Center)
**Type:** Story
**Status:** In Review
**Priority:** Medium
**Story Points:** 5

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to be notified when a run I started reaches a final verdict or is aborted, so that I learn the outcome the moment it lands instead of keeping the run open or revisiting run history.

## Context

Runs already end in exactly two final verdicts — passed or failed — or get aborted with a reason. When someone else finishes the work (a teammate picking up her run, an AI agent, or CI acting as executor), Elena currently finds out only by checking. This story subscribes the run starter to those terminal events and delivers them into the notification inbox. It activates once the inbox (sibling story) is live; the run lifecycle it listens to already ships with epic [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) Manual Execution & Runs.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Implementation Plan (Dev)](./implementation-plan.md)

---

## Traceability

### Storys (3)

- [BK-39](https://jira.upexgalaxy.com/browse/BK-39): TMS-Run Execution | Finish a run with a final verdict _(Ready For Release)_
- [BK-209](https://jira.upexgalaxy.com/browse/BK-209): Notifications | View an inbox of workspace events _(Ready For QA)_
- [BK-36](https://jira.upexgalaxy.com/browse/BK-36): TMS-Run Execution | Abort a run in progress with a reason _(QA Approved)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/6/2026
- **Reporter:** Ely
- **Assignee:** Carlos Alberto Chiavassa
- **Labels:** new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
