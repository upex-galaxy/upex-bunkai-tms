# BK-372 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

- Retrying a failed send, on any schedule or by any trigger — slice c owns recovery entirely
- Any External tracker panel, badge, or sync state shown on the defect record — slice c owns the display
- A manual retry control; none exists anywhere in this feature
- Configuring the destination or the on/off switch — slice a owns that
- Propagating post-creation edits of a synced defect to Jira
- Propagating deletion; Bunkai never deletes the Jira issue
- Syncing defect status changes after the initial send
- Sending evidence attachments to Jira
- Two-way sync or pulling anything back from Jira
- Choosing or customizing which Jira fields the defect populates

---
_Synced from Jira by sync-jira-issues_
