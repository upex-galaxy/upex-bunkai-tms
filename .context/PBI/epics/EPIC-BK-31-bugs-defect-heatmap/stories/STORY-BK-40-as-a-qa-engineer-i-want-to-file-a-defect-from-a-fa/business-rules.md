# BK-40 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-40)

- Defect title must be between 5 and 200 characters
- A module is mandatory on every defect, and the chosen module must belong to the current project
- Severity must be one of the allowed set: P1, P2, P3 or P4
- When a defect is filed from inside a run, the failing test component is automatically linked without manual entry
- A defect may carry up to 10 evidence links; further attachments are refused
- A newly filed defect always starts in the open state
- A standalone defect filed outside a run is valid and carries no linked run or test component

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:52.059Z_
