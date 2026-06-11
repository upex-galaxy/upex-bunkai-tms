# BK-5 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

Inviter:

1. Owner / Admin clicks "Invite teammate".

2. UI shows email + role dropdown (filtered to ≤ caller's role).

3. POST /api/v1/workspaces/{id}/invites with { email, role }.

4. Server validates caller role + role-hierarchy + uniqueness.

5. Server generates signed token + inserts workspace_invites row.

6. Server dispatches email with link /accept-invite?token=...

7. Returns 201.

Invitee:

1. Receives email, clicks link.

2. If not signed in: lands on /login, then redirected back to /accept-invite?token=...

3. POST /api/v1/invites/{token}/accept.

4. Server validates token signature + expiry + email-match.

5. Inserts workspace_members row with role from token.

6. Marks invite accepted.

7. Redirects to /home.

---
_Synced from Jira by sync-jira-issues_
