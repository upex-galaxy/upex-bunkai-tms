# BK-467 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-467)

- Export all ATCs in one Project's library as a single CSV file, triggered from the ATC library view
- CSV includes one row per ATC: ATC ID, slug, title, Module, layer, tags, and status
- CSV values are correctly escaped for commas, double quotes, and line breaks inside titles or tags
- Export includes every ATC the requester can see in that Project's library, regardless of library size
- Export is limited to a single Project the requester can access (active workspace member, role >= viewer)
- An empty ATC library exports a CSV containing only the header row

---
_Synced from Jira by sync-jira-issues_
