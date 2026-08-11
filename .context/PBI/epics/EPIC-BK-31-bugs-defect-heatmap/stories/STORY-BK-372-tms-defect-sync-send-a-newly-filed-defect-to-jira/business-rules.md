# BK-372 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

- A defect is sent at the moment it is filed, and only then. No status change, no edit, no schedule and no user gesture starts a send.
- Filing is never blocked by, delayed by, or failed by the send. A defect that cannot reach Jira is still a fully usable defect in Bunkai.
- A defect that carries an external reference is never sent again. One Bunkai defect maps to at most one Jira issue, forever — the presence of the stored reference is the whole test, not any similarity between defects.
- Every Jira issue Bunkai creates carries a link back to the originating defect. This is mandatory, not best-effort.
- Severity maps to priority on this ladder: P1 to Highest, P2 to High, P3 to Medium, P4 to Low. When the destination has no priority by that name, fall back to Medium rather than failing the send — a defect that lands with an approximate priority beats a defect that never lands.
- The Module travels as its full path text inside the issue body, not as a Jira component.
- Evidence attachments do not leave Bunkai in this version.
- A defect filed while its Project's sync is off is never sent and carries no sync state at all.
- Sync is one-way. Nothing in Jira ever changes anything in Bunkai.
- Post-creation edits of a sent defect do not travel to Jira, and deleting a defect never deletes the Jira issue.
- A failure reason stored against a defect is shown to users verbatim, so it stays short and carries nothing sensitive.

---
_Synced from Jira by sync-jira-issues_
