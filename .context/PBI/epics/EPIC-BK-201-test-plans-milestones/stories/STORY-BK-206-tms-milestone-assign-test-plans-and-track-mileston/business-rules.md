# BK-206 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-206)

- Attaching references the plan; detaching never deletes or alters the plan or its progress.
- A milestone aggregates only plans from its own project; a plan may serve several milestones.
- Readiness is fully derived: milestone readiness comes from plan progress, which comes from run outcomes — no manual override at any level.
- Overdue means the target date is in the past while readiness is below 100 percent; the signal clears if the date is replanned forward.
- Attaching and detaching plans requires the member role or higher; viewers see readiness read-only.

## Design intent

- Milestone detail tab: readiness summary strip under the header (overall percentage bar plus per-outcome counts), followed by the attached-plans table where each row carries the plan's own mini progress bar.
- "Attach plans" button opens a picker dialog listing the project's open plans with an already-attached marker.
- Overdue state renders as a prominent badge on the detail header and a matching marker on the milestones list row, alongside the days-overdue count.
- Clicking a plan row opens that plan's detail tab, following the app shell tab pattern.

---
_Synced from Jira by sync-jira-issues_
