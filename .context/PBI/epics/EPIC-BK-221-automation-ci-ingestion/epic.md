# EPIC: Automation & CI Ingestion

**Jira Key:** [BK-221](https://jira.upexgalaxy.com/browse/BK-221)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 0

---

## Description

## Goal

Close the loop between automated test execution and the TMS. Today every Run in Bunkai is born from a human clicking through steps; automation results live in CI logs and get copy-pasted into the tool — or lost. This epic makes ***Karim, the autonomous AI test agent, and CI pipelines first-class run reporters***: they submit and stream results into the same Runs views the team already uses. Elena stops copy-pasting automation results, and Mateo sees manual and automated coverage in one place.

## Scope boundary

***In scope***: ingesting and streaming automated run results through the API, uploading CI results files, execution-mode visibility across the runs views, and per-test automation status.

***Out of scope***: building or hosting a test runner, scheduling or orchestrating test execution, and outbound webhooks or notifications on run events (future Notifications / Integrations work). Bunkai ingests results; it never drives the runner.

## Stories

| Key | Story | Persona |
| --- | --- | --- |
| BK-222 | TMS-Automation API | Submit an automated run with step results | Karim (AI Test Agent) |
| BK-223 | TMS-Automation API | Stream step results during an automated run | Karim (AI Test Agent) |
| BK-225 | TMS-Run Reporting | Filter runs by manual or automated execution mode | Elena Vargas |
| BK-226 | CI Integration | Upload a CI results file to create a run | Sara Iglesias |
| BK-227 | TMS-Test | Track the automation status of a test | Elena Vargas |
| BK-228 | CI Integration | See CI-triggered runs linked to a commit and branch | Sara Iglesias |

## Traceability

Builds directly on ***BK-30 Manual Execution & Runs**** (run lifecycle: start, per-step pass/fail/block, finish with passed/failed verdict, abort), ****BK-24 Tests**** (the executable chains of ATCs that runs execute), and ****BK-85 Account & Settings / BK-88 Personal Access Tokens*** (the authentication surface for agents and pipelines). Execution-mode reporting extends the runs views established by BK-37/BK-38.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-222](https://jira.upexgalaxy.com/browse/BK-222) | TMS-Automation API | Submit an automated run with step results | - | Medium | Backlog |
| [BK-223](https://jira.upexgalaxy.com/browse/BK-223) | TMS-Automation API | Stream step results during an automated run | - | Medium | Backlog |
| [BK-225](https://jira.upexgalaxy.com/browse/BK-225) | TMS-Run Reporting | Filter runs by manual or automated execution mode | - | Medium | Backlog |
| [BK-226](https://jira.upexgalaxy.com/browse/BK-226) | CI Integration | Upload a CI results file to create a run | - | Medium | Backlog |
| [BK-227](https://jira.upexgalaxy.com/browse/BK-227) | TMS-Test | Track the automation status of a test | - | Medium | Backlog |
| [BK-228](https://jira.upexgalaxy.com/browse/BK-228) | CI Integration | See CI-triggered runs linked to a commit and branch | - | Medium | Backlog |

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
