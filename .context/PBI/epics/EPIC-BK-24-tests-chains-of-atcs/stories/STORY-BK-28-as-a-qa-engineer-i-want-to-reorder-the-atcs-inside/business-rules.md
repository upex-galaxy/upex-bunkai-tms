# BK-28 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

## Business rules

- Reorder preserves the set of ATCs exactly. Adding or removing an ATC is a different operation and is out of scope of this story.
- The new chain order Elena defines is the order in which the ATCs will run during execution. The order is preserved verbatim.
- Two ATCs in the same Test can reference the same ATC; reordering moves the references, not the underlying ATC.
- Only workspace members with role `member`, `admin`, or `owner` can reorder a Test. Role `viewer` is read-only.
- A reorder that produces the same final order as before is not a "real" change — it must NOT pollute the activity log or bump the Test's last-modified timestamp. The user does not pay a cost for double-checking.
- A real reorder must produce exactly one activity-log entry, even if the user submits the same reorder twice in rapid succession (retry-safe).
- When two teammates reorder the same Test concurrently, the second save is blocked with a clear message — it never silently overwrites. The user always sees the current state before deciding.
- Reorder inherits the Test's workspace boundary — no cross-workspace reorder is possible because no cross-workspace Test is reachable in the first place.

---
_Synced from Jira by sync-jira-issues_
