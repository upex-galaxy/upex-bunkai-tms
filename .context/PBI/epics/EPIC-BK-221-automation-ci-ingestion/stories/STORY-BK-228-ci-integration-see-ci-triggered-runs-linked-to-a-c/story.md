# CI Integration | See CI-triggered runs linked to a commit and branch

**Jira Key:** [BK-228](https://jira.upexgalaxy.com/browse/BK-228)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Sara Iglesias, Full-Stack Developer***, I want CI-triggered runs to carry commit, branch, and pipeline metadata and to jump from a run to the commit it tested, so that I can answer "did my change break a test?" from the PR context without spelunking through CI logs.

## Context

Automated runs enter Bunkai through API submission, streaming, or CI file upload. When the trigger is a pipeline, the most valuable context is **which change was under test**: the commit reference, the branch, and the pipeline that ran. This story attaches that metadata to automated runs, shows it in the run detail and runs views, makes branch a searchable dimension, and links the commit reference out to the repository host. It is the bridge between Bunkai's run history and Sara's PR-centric world.

This story activates when its dependencies are live: the ingestion paths from the sibling stories (submission, streaming, upload) accept the optional CI metadata this story displays.

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

### Story (1)

- [BK-226](https://jira.upexgalaxy.com/browse/BK-226): CI Integration | Upload a CI results file to create a run _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
