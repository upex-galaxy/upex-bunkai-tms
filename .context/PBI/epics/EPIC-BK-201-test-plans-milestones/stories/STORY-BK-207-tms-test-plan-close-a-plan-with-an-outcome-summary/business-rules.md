# BK-207 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-207)

- Closing is atomic: verdict, summary, closer identity, close time, and the progress snapshot are recorded together — never partially.
- The verdict vocabulary is passed or failed, mirroring the final verdicts of Runs.
- A closed plan is read-only: name, description, goal, membership, verdict, and summary cannot be changed while the plan remains closed.
- A closed plan can be reopened by the plan's creator or an admin or higher; reopening returns the plan to the Open state and every reopen is recorded in the plan's history.
- Closing requires being the plan's creator or holding the admin role or higher; viewers and other members are read-only for this action.
- Closed plans remain visible and countable in lists and milestone readiness, using their progress at close time.

## Design intent

- "Close plan" as the primary header action on an open plan's detail tab.
- The action opens a dialog: verdict picker (passed or failed), summary text area, and — when applicable — a warning block listing the not-run count.
- After closing, the detail header swaps to a locked presentation: status chip Closed, verdict chip, closed-by and closed-at line, summary shown as a quiet panel; editing affordances disappear.
- The plans list gains an Open / Closed filter, with closed rows visually muted and carrying their verdict chip.

---
_Synced from Jira by sync-jira-issues_
