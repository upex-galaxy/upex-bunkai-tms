# TMS-Test | Track the automation status of a test

**Jira Key:** [BK-227](https://jira.upexgalaxy.com/browse/BK-227)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Elena Vargas, Senior QA Engineer***, I want to mark each Test as manual-only, automation candidate, or automated — and see and filter that status in the test library — so that the team always knows what is automated, what is next in line, and what will stay manual.

## Context

Tests in Bunkai already have tags and a library view. What they lack is an explicit automation lifecycle answer: "is this automated, should it be, or will it stay manual?" Today that answer lives in heads and spreadsheets. This story adds a first-class automation status to the Test — three values, a badge, a filter, per-status counts — with a preserved history of who changed it and when, so status changes are accountable, not folklore.

This story activates when its dependencies are live: it extends the test library from the Tests epic and complements the execution-mode reporting story — automation status describes the Test's intent, while execution mode describes how a given run actually happened.

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

### Storys (2)

- [BK-225](https://jira.upexgalaxy.com/browse/BK-225): TMS-Run Reporting | Filter runs by manual or automated execution mode _(Backlog)_
- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Release)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
