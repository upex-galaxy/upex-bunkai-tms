# BK-34 — Workflow

> Jira field: `customfield_10161` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-34)

1. Elena opens the Test she wants to execute and clicks "Start Run".
2. She picks an environment from the Project's configured list.
3. Bunkai opens a new run and lays out every ATC step as a pending checklist in chain order, showing 0% progress.
4. If the Test has no ATCs, or the chosen environment is not configured for the Project, Elena instead sees a clear message and no run is created.
5. If she re-issues the same start within 24 hours with the same token, Bunkai takes her back into the run she already started rather than opening a new one.
6. Teammates viewing the Test see the new run appear in its history, tagged with its executor mode.

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:52.240Z_
