# BK-43 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

***AC-1******:****** Automatic sync on defect creation***
Given a defect is filed in Bunkai
When the integration is enabled
Then the defect is sent to the external tracker automatically

***AC-2******:****** Fire-and-forget sync***
Given the external tracker is unreachable
When a defect is filed
Then the defect is created in Bunkai successfully without waiting for sync
And the sync is retried later

***AC-3******:****** Sync-failed state***
Given a defect's sync fails persistently
Then it shows a sync-failed badge
And remains fully usable in Bunkai

***AC-4******:****** External link back to Bunkai***
Given a defect is synced successfully
Then the external tracker item contains a link back to Bunkai

***AC-5******:****** One-way sync only***
Given a defect is synced
Then no data flows from the external tracker back to Bunkai

***AC-6******:****** Integration not configured***
Given the workspace has no external tracker integration enabled
Then no sync is attempted
And no sync errors are shown

---
_Synced from Jira by sync-jira-issues_
