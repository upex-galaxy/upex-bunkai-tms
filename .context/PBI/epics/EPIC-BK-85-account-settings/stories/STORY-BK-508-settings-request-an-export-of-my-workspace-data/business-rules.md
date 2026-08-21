# BK-508 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-508)

- Only a workspace ***Owner*** may request or download a workspace data export. Admin, Member and Viewer do not see the section at all — it is absent for them, not present-and-refused
- An export covers exactly ***one*** workspace: the one the requester currently has active. It never spans several workspaces, even when the Owner owns more than one
- The archive holds the workspace's own records only. It never contains another workspace's data
- The archive never contains a credential of any kind — no Personal Access Token secret, no magic-link token, no invite token
- The archive is a structured, machine-readable format, so the recipient can process it without Bunkai. That is what makes it usable as an answer to a data-portability request
- ***At most one export request per workspace is in flight at a time.*** A second request while one is preparing is refused with the reason, not silently queued and not silently replacing the first
- A ready archive is downloadable for a bounded window. Once that window lapses the link stops working, the section states that it has expired, and a fresh request produces a fresh archive
- Every export request and every download of a ready archive is recorded in the workspace Activity Stream — an export is itself an auditable event, and an Owner reaching for compliance evidence needs the export's own trail to exist
- An export never changes the workspace's data. It is a read of the workspace, and running one leaves every record exactly as it was

---
_Synced from Jira by sync-jira-issues_
