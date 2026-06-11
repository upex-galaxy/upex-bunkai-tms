# BK-11 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-11)

1. Elena selects a Module and chooses ***Move***.
2. She picks the new parent — another Module, or the Project root.
3. Bunkai checks the move is valid: same Project, no cycle, and within the 6-level depth limit.
4. If valid, the branch relocates and every breadcrumb under it updates.
5. If invalid (for example moving a Module onto its own descendant), she sees the reason and nothing changes.

---
_Synced from Jira by sync-jira-issues_
