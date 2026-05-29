# BK-34 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-34)

- The chosen environment must be one already configured for the Project; others are rejected
- The Test must contain at least one ATC before a run can start
- Re-starting the same Test with the same start token within 24 hours returns the already-started run instead of creating a duplicate
- A start token is scoped to a single Test — the same token on a different Test starts a new run
- Every run is attributed to an executor mode of human, agent, or CI, and to an executor identity
- A freshly started run begins in the running state with all steps pending and 0% progress

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:52.239Z_
