# Comments for BK-5

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-5)

---

### Ely - 5/19/2026, 9:05:44 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Settings page: `<MembersTab />` with invite form + pending-invites list.
- Page: `app/accept-invite/page.tsx`.

### Backend

- Routes:
  - `POST app/api/v1/workspaces/[id]/invites/route.ts`
  - `POST app/api/v1/invites/[token]/accept/route.ts`
  - `GET  app/api/v1/workspaces/[id]/invites/route.ts`
- Token signing: HMAC-SHA256 with secret from env.
- Email dispatch: Supabase Auth's `inviteUserByEmail` OR custom Resend integration.

### Database

- Tables: `workspace_invites`, `workspace_members`.
- Index: `(workspace_id, lower(email))` unique pending.

## Dependencies
### Blocked By

- BK-4 (workspace creation).

### Related

- BK-2 / BK-3 (sign-in flows — invitee must be able to sign in).

## Definition of Done
- [ ] All 7 AC scenarios pass on staging.
- [ ] HMAC token-signing unit tests.
- [ ] Email actually arrives in invitee's inbox (smoke test on staging).
- [ ] Role-hierarchy enforced server-side (NOT only client-side filter).
- [ ] RLS policy verifies caller membership before listing pending invites.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:00.428Z_
