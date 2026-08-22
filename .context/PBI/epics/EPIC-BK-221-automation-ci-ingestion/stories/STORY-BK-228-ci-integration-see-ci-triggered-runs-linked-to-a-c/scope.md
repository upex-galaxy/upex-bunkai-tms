# BK-228 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-228)

- Optional CI metadata on automated run ingestion: commit reference, branch name, pipeline name, pipeline URL
- Metadata displayed in the run detail (CI context row) and as secondary information on run rows in the runs views
- Commit reference links out to the repository host; pipeline name links to the pipeline URL when provided
- Branch as a filter/search dimension in the project runs view and run history
- Graceful degradation for runs without metadata and for projects without a configured repository URL

---
_Synced from Jira by sync-jira-issues_
