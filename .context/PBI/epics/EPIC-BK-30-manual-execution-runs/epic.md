# EPIC: Manual Execution & Runs

**Jira Key:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 38

---

## Description

Bunkai turns a Test — an ordered chain of Acceptance Test Cases — into something a person can actually work through, step by step, against a real environment. A QA Engineer opens a Test, picks the environment they want to exercise (for example "Staging" or "Production"), and starts a Run. Bunkai immediately lays out a fresh checklist where every step of every ATC begins in a pending state. As the engineer works, they mark each step passed, failed, or blocked, jotting an optional note and attaching an evidence link. Each result rolls up automatically: the parent ATC earns a verdict and the overall Run progress climbs, so the executor always knows how much is left and where the failures are clustering.

Runs are also a live, shared surface. A QA Lead watching the same Run sees the progress bar and step outcomes move in real time, without refreshing. When a Run is finished, Bunkai records a final verdict — passed or failed — and any steps the executor never reached are clearly marked skipped rather than left ambiguous. An engineer can also abort a Run mid-flight with a stated reason, closing it cleanly. Every Run is kept, so a Test accumulates a history the team can scroll newest-first, filter by outcome, and use to spot flaky areas. At the project level, a Lead can sweep across every Run by date range, module, status, and executor type, with pass and fail totals, to answer "what did we execute this sprint and how did it go?" in under a minute.

Crucially, the same Run produces the same data whether a human, an AI Test Agent, or a CI pipeline drove it. The executor mode is just an attribute on the Run, so dashboards, history, and coverage totals aggregate every execution together with no special-casing — the foundation for shifting routine regression execution onto agents over time.

***Business value:*** Gives QA a single, trustworthy execution record across humans, agents, and CI — turning scattered manual testing into a measurable, live coverage story that leads can report on in seconds.

***Related functional requirements:*** BK-019, BK-020, BK-021, BK-022, BK-023, BK-024.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-34](https://jira.upexgalaxy.com/browse/BK-34) | TMS-Run Execution | Start a manual run in a chosen environment | 8 | Medium | Ready For Release |
| [BK-35](https://jira.upexgalaxy.com/browse/BK-35) | TMS-Run Execution | Mark each step pass, fail, or block | 8 | Medium | QA Approved |
| [BK-36](https://jira.upexgalaxy.com/browse/BK-36) | TMS-Run Execution | Abort a run in progress with a reason | 8 | Medium | QA Approved |
| [BK-37](https://jira.upexgalaxy.com/browse/BK-37) | TMS-Run History | View a test's past runs, filterable by outcome | 5 | Medium | Ready For QA |
| [BK-38](https://jira.upexgalaxy.com/browse/BK-38) | TMS-Run Reporting | Filter project runs with pass/fail totals | 3 | Medium | QA Approved |
| [BK-39](https://jira.upexgalaxy.com/browse/BK-39) | TMS-Run Execution | Finish a run with a final verdict | 5 | Medium | Ready For Release |
| [BK-269](https://jira.upexgalaxy.com/browse/BK-269) | TMS-Run Execution | Automatically abort abandoned runs after inactivity | 1 | Medium | Estimation |
| [BK-442](https://jira.upexgalaxy.com/browse/BK-442) | TMS-Run History | Compare a run against the previous run of the same test | - | Medium | Backlog |

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
