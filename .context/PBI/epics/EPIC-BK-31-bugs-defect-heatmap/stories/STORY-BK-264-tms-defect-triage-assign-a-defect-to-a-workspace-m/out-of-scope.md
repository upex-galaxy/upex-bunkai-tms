# BK-264 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

- Sending a notification when a defect is assigned or changes status — that is the sibling notifications story, which subscribes to the events this story produces
- Any change to the one-way sync from Bunkai to the external tracker (Jira) — the external sync direction and its own retry/failure handling are untouched
- Reopening a defect that is already resolved or closed (moving backward in the lifecycle) — no current source defines this behavior; flagged separately for the PM to decide
- Assigning a defect to more than one workspace member at the same time
- Bulk assignment or bulk status changes across multiple defects at once
- Filtering or searching the defect list by assignee — that is the existing defect list story's surface, extendable later if needed
- Automatic or suggested assignment based on module ownership or workload

---
_Synced from Jira by sync-jira-issues_
