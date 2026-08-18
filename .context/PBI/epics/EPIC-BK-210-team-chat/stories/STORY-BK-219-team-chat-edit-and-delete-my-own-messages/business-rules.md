# BK-219 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-219)

- ***Ownership***: a member can edit and delete only their own messages.
- ***Edit window***: editing is allowed for 15 minutes after sending; after that the message is immutable (deletion stays available). Every edited message carries a permanent edited indicator.
- ***Tombstones, not holes***: deletion never collapses the conversation — the message row remains as a tombstone ("message was deleted"), keeping reply context readable.
- ***Moderation = admin and above***: admins and owners can delete (not edit) any message; the resulting tombstone is identical to an author deletion — readers cannot tell whether the author or a moderator removed it. Viewers and members have no moderation powers.
- ***Mentions and cards die with the message***: deleting a message also withdraws its pending mention notifications and its rich cards.

### Design intent

- A hover/press action menu on own messages exposes Edit and Delete; on others' messages it appears only for admins (Delete only).
- Editing happens inline in the message bubble with save/cancel; Esc cancels.
- The edited indicator is a subtle suffix on the timestamp; tombstones are muted italic rows.
- Delete asks for a single lightweight confirmation; moderator deletion states the acting role in the confirmation.

---
_Synced from Jira by sync-jira-issues_
