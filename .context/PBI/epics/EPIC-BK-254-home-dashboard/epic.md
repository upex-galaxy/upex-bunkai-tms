# EPIC: Home Dashboard

**Jira Key:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 0

---

## Description

## Epic description

Home is the workspace-level landing screen every member sees the moment they sign in. It gives a Senior QA Engineer or a QA Lead an immediate, at-a-glance read of what needs attention across every project in the workspace, without opening each project individually. It renders into the `home.jsx` mockup screen (master-design-plan.md §4.2), and has been the last unbuilt screen in the App Shell rollout.

***Business Value******:*** A QA Lead's first goal is answering "what does the current state of quality actually look like?" in under a minute, with real data, when a product or engineering manager asks. A Senior QA Engineer's day starts by re-orienting to what changed since she last signed off. Home is the single screen that serves both needs without forcing either persona to visit five different screens first.

## Sequencing note

This epic was previously blocked end-to-end because it depends on data domains that did not exist. As of this run:

- The Runs domain (BK-30, Manual Execution & Runs) has shipped functional read/write paths for run creation, step marking, abort, finish, per-project reporting, and per-test history.
- The Bugs domain (BK-31, Bugs & Defect Heatmap) has no shipped read surface yet — BK-40 (file a defect) is in progress and BK-41/42/43 have not started.
- The Coverage domain (BK-44, Coverage & Traceability) has one shipped building block (BK-49, the activity stream) but the coverage-percentage surfaces (BK-46, BK-47) have not started.

So this epic is buildable now, but 2 of its 6 child stories are genuinely blocked on sibling epics rather than artificially gated. See each story's dependency links for the specific gating tickets.

## Notes

The mockup's greeting eyebrow line ("SPRINT 24-Q2 · DAY 7/10") implies a Sprint/iteration entity. No such entity exists in the product's schema or in business-data-map.md — it appears to be mockup flavor text, not a modeled concept. The welcome-banner story (below) does not build this element; see that story's Out of Scope field and its comment for the open design question.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-255](https://jira.upexgalaxy.com/browse/BK-255) | TMS-Home | Show a personalized welcome banner | - | Medium | Backlog |
| [BK-256](https://jira.upexgalaxy.com/browse/BK-256) | TMS-Home | Show active test runs summary and table | - | Medium | Backlog |
| [BK-257](https://jira.upexgalaxy.com/browse/BK-257) | TMS-Home | Show recent projects with activity and stats | - | Medium | Backlog |
| [BK-258](https://jira.upexgalaxy.com/browse/BK-258) | TMS-Home | Show open bug count and severity breakdown | - | Medium | Backlog |
| [BK-259](https://jira.upexgalaxy.com/browse/BK-259) | TMS-Home | Show workspace test coverage summary | - | Medium | Backlog |
| [BK-260](https://jira.upexgalaxy.com/browse/BK-260) | TMS-Home | Show a condensed recent activity feed | - | Medium | Backlog |

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** p2, post-mvp-followup

---

_Synced from Jira by sync-jira-issues_
