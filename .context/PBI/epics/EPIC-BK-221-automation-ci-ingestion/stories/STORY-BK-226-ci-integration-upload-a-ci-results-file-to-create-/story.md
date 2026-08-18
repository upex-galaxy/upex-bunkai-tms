# CI Integration | Upload a CI results file to create a run

**Jira Key:** [BK-226](https://jira.upexgalaxy.com/browse/BK-226)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Sara Iglesias, Full-Stack Developer***, I want to upload a standard CI results report (e.g. JUnit XML) and have it mapped onto an existing Test, so that pipeline results become a Bunkai run without me writing an API client.

## Context

Not every team scripts against an API — but nearly every CI tool emits a standard results file, with JUnit XML as the de facto interchange format. This story opens a file-shaped door into run ingestion: pick a Test and an environment, upload the report, review a mapping preview showing how report entries line up with the Test's steps, confirm, and a finished automated run is created. Unmapped entries are clearly surfaced and acknowledged, never silently dropped — silent data loss is exactly what makes teams distrust QA tooling.

This story activates when its dependencies are live: it builds on the run ingestion contract from the sibling submission story, the Tests library, and Personal Access Tokens for the scripted (non-interactive) upload path.

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
- [BK-88](https://jira.upexgalaxy.com/browse/BK-88): Settings | Manage Personal Access Tokens _(Ready For QA)_
- [BK-228](https://jira.upexgalaxy.com/browse/BK-228): CI Integration | See CI-triggered runs linked to a commit and branch _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
