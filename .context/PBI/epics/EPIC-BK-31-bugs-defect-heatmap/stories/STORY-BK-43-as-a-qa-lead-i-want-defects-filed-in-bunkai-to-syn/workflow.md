# BK-43 — Workflow

> Jira field: `customfield_10161` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-43)

1. Elena files a defect during or after a run while the external tracker integration is enabled.
2. Bunkai saves the defect immediately and shows it in the list — she keeps working without waiting on the sync.
3. In the background, Bunkai creates a matching item in the external tracker and links that item back to the Bunkai defect.
4. On success, the defect shows a "synced" state and Sara, the developer, picks it up in the external tracker, following the back-link for full context.
5. If the external tracker was unreachable, the defect is marked "sync-failed" but stays usable; Bunkai retries automatically later, and once it succeeds the state flips to "synced" and the back-link becomes available.

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:53.840Z_
