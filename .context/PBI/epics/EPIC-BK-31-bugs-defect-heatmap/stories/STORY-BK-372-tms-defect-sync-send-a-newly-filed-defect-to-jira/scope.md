# BK-372 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

- Automatic, one-way send of a newly filed defect to its Project's Jira destination, at filing time and only then
- Sync state recorded against the defect: never attempted, in flight, sent, or failed with a displayable reason
- A mandatory link back to the Bunkai defect on every Jira issue created
- The never-send-twice guarantee, holding even when two send attempts race each other
- Severity carried across to the Jira issue's priority, with a safe fallback when the destination has no matching priority
- The Module's full path carried in the issue body
- Classification of a failed send into retryable and non-retryable, recorded against the defect
- Defects in different Projects landing in their own Project's destination and never another's

---
_Synced from Jira by sync-jira-issues_
