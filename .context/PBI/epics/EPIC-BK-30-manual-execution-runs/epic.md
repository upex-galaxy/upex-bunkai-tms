# EPIC: Manual Execution & Runs

**Jira Key:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 6

---

## Description

Bunkai turns a Test — an ordered chain of Atomic Test Components — into something a person can actually work through, step by step, against a real environment. A QA Engineer opens a Test, picks the environment they want to exercise (for example "Staging" or "Production"), and starts a Run. Bunkai immediately lays out a fresh checklist where every step of every ATC begins in a pending state. As the engineer works, they mark each step passed, failed, or blocked, jotting an optional note and attaching an evidence link. Each result rolls up automatically: the parent ATC earns a verdict and the overall Run progress climbs, so the executor always knows how much is left and where the failures are clustering.

Runs are also a live, shared surface. A QA Lead watching the same Run sees the progress bar and step outcomes move in real time, without refreshing. When a Run is finished, Bunkai records a final verdict — passed or failed — and any steps the executor never reached are clearly marked skipped rather than left ambiguous. An engineer can also abort a Run mid-flight with a stated reason, closing it cleanly. Every Run is kept, so a Test accumulates a history the team can scroll newest-first, filter by outcome, and use to spot flaky areas. At the project level, a Lead can sweep across every Run by date range, module, status, and executor type, with pass and fail totals, to answer "what did we execute this sprint and how did it go?" in under a minute.

Crucially, the same Run produces the same data whether a human, an AI Test Agent, or a CI pipeline drove it. The executor mode is just an attribute on the Run, so dashboards, history, and coverage totals aggregate every execution together with no special-casing — the foundation for shifting routine regression execution onto agents over time.

***Business value:*** Gives QA a single, trustworthy execution record across humans, agents, and CI — turning scattered manual testing into a measurable, live coverage story that leads can report on in seconds.

***Related functional requirements:*** BK-019, BK-020, BK-021, BK-022, BK-023, BK-024.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34) | As a QA Engineer, I want to start a manual run of a Test in a chosen environment so that I get a fresh step-by-step checklist to execute. | 1 | Medium | Shift-Left QA |
| [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35) | As a QA Engineer, I want to mark each step pass, fail, or block with notes and evidence so that ATC verdicts and run progress update as I execute. | 1 | Medium | Shift-Left QA |
| [BK-36](https://upexgalaxy67.atlassian.net/browse/BK-36) | As a QA Engineer, I want to abort a run in progress with a reason so that remaining steps are skipped and the run is closed as aborted. | 1 | Medium | Shift-Left QA |
| [BK-37](https://upexgalaxy67.atlassian.net/browse/BK-37) | As a QA Engineer, I want to see a Test's past runs newest first, filterable by outcome so that I can compare results and spot flaky areas. | 1 | Medium | Shift-Left QA |
| [BK-38](https://upexgalaxy67.atlassian.net/browse/BK-38) | As a QA Lead, I want to filter all project runs by date, module, status, and executor type with pass/fail totals so that I can report what we executed quickly. | 1 | Medium | Shift-Left QA |
| [BK-39](https://upexgalaxy67.atlassian.net/browse/BK-39) | As a QA Engineer, I want to finish a run with a final passed or failed verdict so that any still-pending steps are clearly marked skipped. | 1 | Medium | Shift-Left QA |

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:52.238Z_
