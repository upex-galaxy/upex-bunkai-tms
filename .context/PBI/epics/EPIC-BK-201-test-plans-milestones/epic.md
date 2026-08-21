# EPIC: Test Plans & Milestones

**Jira Key:** [BK-201](https://jira.upexgalaxy.com/browse/BK-201)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 11

---

## Description

Bunkai already lets teams execute Tests through ad-hoc manual Runs. What QA Leads like Mateo Silva still cannot do is answer "what does this sprint actually cover?" without assembling the picture by hand. This epic adds ***planned, organized execution**** on top of the existing run machinery: ****Test Plans**** group existing Tests around a goal or release, and ****Milestones*** group plans under a target date, with progress computed automatically from run outcomes.

***Scope boundary.*** A Test Plan is a curated set of references to existing Tests — it introduces no new authoring or execution surface. A Milestone is a named delivery goal with a target date that aggregates the readiness of its attached plans. All progress derives from the outcomes of Runs that already exist; nothing in this epic is manually editable progress. Scheduled plan runs and automation-sourced outcomes are explicitly outside this epic.

## User Stories

| ***#**** | ****Story**** | ****Persona*** |
| --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-202#icft=BK-202](https://jira.upexgalaxy.com/browse/BK-202#icft=BK-202) | TMS-Test Plan  | Create a test plan grouping tests for a goal | Mateo Silva, QA Lead |
| [https://jira.upexgalaxy.com/browse/BK-203#icft=BK-203](https://jira.upexgalaxy.com/browse/BK-203#icft=BK-203) | TMS-Test Plan  | Add and remove tests from a plan | Elena Vargas, Senior QA Engineer |
| [https://jira.upexgalaxy.com/browse/BK-204#icft=BK-204](https://jira.upexgalaxy.com/browse/BK-204#icft=BK-204) | TMS-Test Plan  | Track plan progress from run outcomes | Mateo Silva, QA Lead |
| [https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205](https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205) | TMS-Milestone  | Create a milestone with a target date | Mateo Silva, QA Lead |
| [https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206) | TMS-Milestone  | Assign test plans and track milestone readiness | Mateo Silva, QA Lead |
| [https://jira.upexgalaxy.com/browse/BK-207#icft=BK-207](https://jira.upexgalaxy.com/browse/BK-207#icft=BK-207) | TMS-Test Plan  | Close a plan with an outcome summary | Mateo Silva, QA Lead |

## Traceability

- Builds directly on epic ***BK-24 Tests (chains of ATCs)**** — plans group the Tests that epic delivers — and on epic ****BK-30 Manual Execution & Runs*** — plan progress and milestone readiness read the run outcomes that epic records.
- Post-MVP roadmap feature: the PRD Phase 2 scope lists Test Plans (saved subsets of tests). Milestones extend that same planning capability to release goals.
- Closed plans become read-only history, feeding the audit-evidence narrative of epic [https://jira.upexgalaxy.com/browse/BK-44#icft=BK-44](https://jira.upexgalaxy.com/browse/BK-44#icft=BK-44) Coverage & Traceability.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-202](https://jira.upexgalaxy.com/browse/BK-202) | TMS-Test Plan | Create a test plan grouping tests for a goal | 3 | Medium | BLOCKED |
| [BK-203](https://jira.upexgalaxy.com/browse/BK-203) | TMS-Test Plan | Add and remove tests from a plan | - | Medium | Backlog |
| [BK-204](https://jira.upexgalaxy.com/browse/BK-204) | TMS-Test Plan | Track plan progress from run outcomes | - | Medium | Backlog |
| [BK-205](https://jira.upexgalaxy.com/browse/BK-205) | TMS-Milestone | Create a milestone with a target date | 8 | Medium | Ready For QA |
| [BK-206](https://jira.upexgalaxy.com/browse/BK-206) | TMS-Milestone | Assign test plans and track milestone readiness | - | Medium | Backlog |
| [BK-207](https://jira.upexgalaxy.com/browse/BK-207) | TMS-Test Plan | Close a plan with an outcome summary | - | Medium | Backlog |

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/16/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
