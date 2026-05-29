# EPIC: Bugs & Defect Heatmap

**Jira Key:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 4

---

## Description

When a step fails mid-run, the moment to capture the defect is right then — with the context still fresh. This epic lets QA file a defect straight from a failing run step, with the failing component, the steps that were just executed, and the captured evidence already filled in, anchored to a Module and a severity (P1 to P4). No retyping, no losing the thread to go open a separate ticket. Defects can also be filed standalone when someone simply spots something off and wants it on record.

Once defects exist, teams need to make sense of them. QA can list and filter defects by Module (including everything nested beneath it), by status, and by severity, with live counts so they can zero in on one area. QA Leads get a per-Module defect heatmap over a chosen window (for example the last 30 days) that shows both the raw defect count and the week-over-week trend, so degrading quality lights up at a glance instead of hiding in a list. A freshly filed defect shows up on the heatmap promptly, keeping the picture current.

Because engineering already lives in their own tracker, every defect filed in Bunkai syncs automatically and one-way to the team's external tracker (Jira), so developers pick the work up where they already are — and the synced item links straight back to Bunkai for full context. Sync is best-effort: it never blocks filing, and if it can't reach the external tracker the defect stays fully usable in Bunkai, is flagged as sync-failed, and is retried later.

***Business value:*** Closes the loop between finding a defect and acting on it — defects are captured in context with zero re-entry, quality hotspots surface visually for leadership, and engineering works defects in their existing tool without anyone copying tickets by hand.

***Related functional requirements:*** BK-025, BK-026, BK-027, BK-028.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40) | As a QA Engineer, I want to file a defect from a failing run step with module, severity, steps and evidence pre-filled so that the defect is captured without retyping. | 1 | Medium | Shift-Left QA |
| [BK-41](https://upexgalaxy67.atlassian.net/browse/BK-41) | As a QA Engineer, I want to list and filter defects by module, status and severity with counts so that I can focus on a given area. | 1 | Medium | Shift-Left QA |
| [BK-42](https://upexgalaxy67.atlassian.net/browse/BK-42) | As a QA Lead, I want to view a defect heatmap with count and week-over-week trend per module so that I can see at a glance where quality is degrading. | 1 | Medium | Shift-Left QA |
| [BK-43](https://upexgalaxy67.atlassian.net/browse/BK-43) | As a QA Lead, I want defects filed in Bunkai to sync automatically and one-way to the external tracker so that engineering works them in their existing tool. | 1 | Medium | Shift-Left QA |

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:53.836Z_
