# BK-371 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

- Bunkai syncs to Jira Cloud only. The destination is fixed for v1 and is never presented as a choice of tracker.
- What is configurable per Project is the destination Jira project key, the issue type, and an on/off switch. Nothing else.
- Credentials are deployment-level and are never stored per workspace or per Project. No setting in this story holds a secret, or a pointer to one.
- The sync is off until an administrator turns it on. A Project with no configuration is a Project with no sync.
- Redirecting where a Project's defects flow externally is an administrator act. Reading the setting is open to anyone who can see the Project.
- Switching the sync on, or changing the destination, re-queues that Project's defects that carry no external reference yet — this is what makes the promise "sync retries automatically once the connection is fixed in Settings" literally true.
- One Project points at exactly one destination Jira project at a time.

---
_Synced from Jira by sync-jira-issues_
