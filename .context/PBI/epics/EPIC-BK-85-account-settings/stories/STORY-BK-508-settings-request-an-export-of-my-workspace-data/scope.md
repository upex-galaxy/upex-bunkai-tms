# BK-508 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-508)

- A ***Data export**** section in the Settings hub, reachable from the Settings navigation, visible only to a workspace ****Owner***
- Request an export of the active workspace's data. The request is acknowledged straight away rather than making the Owner wait on the screen while it is assembled
- The section shows the state of the current request — none yet, preparing, ready, failed — and when it was requested
- When the export is ready, a download of a ***single archive*** of the workspace's records in a structured, machine-readable form the recipient can process without Bunkai
- The download stops working after a stated window. The section names that window before the archive expires and says plainly that it has expired afterwards, with a way to request a fresh one
- One export request per workspace at a time: requesting again while one is preparing is refused and the reason is shown
- A failed export is reported as failed, with a retry — never left indefinitely "preparing"
- Screen states for the section: never requested, preparing, ready, expired, failed, loading, error

---
_Synced from Jira by sync-jira-issues_
