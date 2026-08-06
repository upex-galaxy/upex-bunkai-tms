# TMS-Automation API | Submit an automated run with step results

**Jira Key:** [BK-222](https://jira.upexgalaxy.com/browse/BK-222)
**Epic:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221) (Automation & CI Ingestion)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As ***Karim, an Autonomous AI Test Agent*** acting on behalf of the QA team, I want to submit a completed automated execution of an existing Test in a single API call — per-step results, final verdict, duration, environment, and evidence references — so that the run appears in Bunkai exactly like a manual run, without a human re-typing automation results.

## Context

Bunkai already records manual Runs end to end: a Run executes a Test (an ordered chain of ATCs) against a Project Environment, each step is marked pass, fail, or block, and the run finishes with a passed or failed verdict (or is aborted). This story opens that same run record to machines: an agent or script that has already executed a Test elsewhere reports the outcome in one call, and the resulting Run is browsable in run history and the project runs view like any other. Retries must be safe — Karim's core pain is that resubmitting after a timeout doubles run state in most tools, so idempotent resubmission is part of the contract.

This story activates when its dependencies are live: it builds on the Run lifecycle shipped by the Manual Execution & Runs epic, the Tests library, and workspace Personal Access Tokens from Settings. Runs submitted this way feed the execution-mode reporting and CI stories of this epic.

---

## Traceability

### Storys (6)

- [BK-223](https://jira.upexgalaxy.com/browse/BK-223): TMS-Automation API | Stream step results during an automated run _(Backlog)_
- [BK-226](https://jira.upexgalaxy.com/browse/BK-226): CI Integration | Upload a CI results file to create a run _(Backlog)_
- [BK-225](https://jira.upexgalaxy.com/browse/BK-225): TMS-Run Reporting | Filter runs by manual or automated execution mode _(Backlog)_
- [BK-88](https://jira.upexgalaxy.com/browse/BK-88): Settings | Manage Personal Access Tokens _(Ready For QA)_
- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_
- [BK-39](https://jira.upexgalaxy.com/browse/BK-39): TMS-Run Execution | Finish a run with a final verdict _(Ready For Release)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
