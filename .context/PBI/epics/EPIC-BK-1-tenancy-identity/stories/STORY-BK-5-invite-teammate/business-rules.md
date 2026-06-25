# BK-5 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

- Caller's role MUST be ≥ admin to create an invite.

- Invited role MUST be ≤ caller's role (admin cannot invite an owner).

- email MUST be unique among active workspace members.

- Invite token: HMAC-signed, includes workspace_id + email + role + expiry, single-use.

- Acceptance idempotent: re-clicking accepted invite returns 200 with current membership, not a new row.

---
_Synced from Jira by sync-jira-issues_
