# BK-508 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-508)

- ***Owner-initiated deletion of the workspace or the account.*** This is the other half of the SRS sentence this story comes from, and leaving it out is deliberate, not an oversight. Three reasons: export-before-delete is the correct sequence, so export has to exist first regardless; deletion is irreversible and cascades across essentially every table in the product; and it raises questions this story has no business answering — what happens to the remaining members, whether a sole Owner may delete at all, and whether there is a grace period during which the workspace can be recovered. Deletion needs its own story, authored after this one ships
- Exporting one individual member's personal data on its own — this story exports the ***workspace***, not a single person's record
- Choosing which entity types the archive includes, or restricting it to a date range
- Scheduled, recurring, or automatically-triggered exports
- Importing a previously exported archive back into Bunkai
- A Project's ATCs to CSV (BK-467) and the User Story evidence-chain snapshot — both already ship, both are narrower, and neither is replaced or changed by this story
- Non-Owner roles requesting or downloading an export
- Deleting a ready archive before its window lapses
- Exporting every workspace an Owner belongs to in one request

---
_Synced from Jira by sync-jira-issues_
