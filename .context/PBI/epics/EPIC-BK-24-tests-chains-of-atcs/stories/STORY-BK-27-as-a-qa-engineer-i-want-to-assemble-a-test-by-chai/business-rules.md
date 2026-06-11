# BK-27 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

## Business rules

- A Test always belongs to exactly one workspace, the one its author was active in at the moment of creation. This binding is permanent.
- A Test must contain at least one ATC. There is no such thing as an empty Test.
- The ATCs inside a Test must all come from the same workspace as the Test itself. Cross-workspace ATC references are never allowed.
- The order in which Elena selects the ATCs is the order in which they will run inside the Test. The order is preserved verbatim.
- Two ATCs in the same Test can reference the same ATC twice — the chain is a sequence, not a set. (Useful for "open page → click → verify → click → verify" patterns.)
- Only workspace members with role `member`, `admin`, or `owner` can create Tests. Role `viewer` is read-only by design.
- A Test creation cannot be silently lost. Every successful creation produces an activity-log entry that the workspace owner can audit.
- Repeating the exact same creation request within a short window (because of a retry or a double-click) must produce one Test, not many. The system is responsible for recognizing the retry, not the user.
- The title of a Test is required and free-text, limited to 200 characters. Whitespace-only titles are rejected.

---
_Synced from Jira by sync-jira-issues_
