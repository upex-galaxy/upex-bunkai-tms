# BK-205 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-205)

- A Milestone belongs to exactly one project and is visible to every workspace member of that project.
- Milestone names are unique per project, case-insensitive, compared after trimming spaces.
- Name is required, 1 to 100 characters after trim; target date is required and must be today or later at creation time.
- The target date of an existing milestone may be moved forward or backward while the milestone is active — replanning is allowed and visible.
- Creating and editing milestones requires the member role or higher; viewers are read-only.

## Design intent

- Milestones becomes a section in the project explorer rail next to Test Plans.
- The list view favors scannability of dates: rows show name, a date badge, and a days-remaining counter that changes tone as the date approaches.
- Creation via a compact dialog: name, date picker, description.
- Milestone detail opens as a tab per the app shell pattern: header with name, date badge, countdown; body reserved for attached plans (empty state pointing to the sibling story's capability).

---
_Synced from Jira by sync-jira-issues_
