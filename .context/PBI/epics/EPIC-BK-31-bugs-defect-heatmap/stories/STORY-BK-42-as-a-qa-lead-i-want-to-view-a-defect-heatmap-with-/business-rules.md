# BK-42 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-42)

- The heatmap rolls defects up by module, which is the single axis for the count
- The defect count for a cell covers only the chosen window
- The trend compares the most recent week against the prior week within the window
- A newly filed defect must be reflected in the heatmap promptly, not on a long delay
- A module with zero defects in the window is shown as clean, distinct from a hotspot
- Modules are identified by their full path so identically named nested modules stay distinguishable

---
_Synced from Jira by sync-jira-issues_
