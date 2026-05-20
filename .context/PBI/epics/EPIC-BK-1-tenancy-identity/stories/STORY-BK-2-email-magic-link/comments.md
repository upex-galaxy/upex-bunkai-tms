# Comments for BK-2

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-2)

---

### Ely - 5/19/2026, 9:05:40 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Page: `app/(auth)/login/page.tsx` (already exists in scaffold).
- Component: `<MagicLinkForm />` — input + submit + post-submit state ("Check your email").
- Callback page: `app/auth/callback/route.ts` (route handler).

### Backend

- Wraps Supabase Auth `signInWithOtp({ email })`.
- Token validation on callback via `supabase.auth.exchangeCodeForSession()`.

### Database

- `auth.users` (Supabase managed).
- `workspaces`, `workspace_members` (on first sign-in path).

### External Services

- Supabase Auth managed email dispatcher.

## Dependencies
### Blocked By

- Phase C plumbing done already (see prior session: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `middleware.ts`, `AuthContext`).

### Blocks

- BK-4 (workspace create) is unblocked once any sign-in story ships.
- BK-5 (invite teammate) needs a signed-in owner.

### Related

- BK-3 (OAuth sign-in) — same FR-001 with different provider surface.

## Definition of Done
- [ ] Magic-link sign-up + sign-in working end-to-end on staging.
- [ ] Unit tests for token-expiry + replay rejection paths.
- [ ] Integration test for default-workspace auto-create on first verified login.
- [ ] E2E Playwright happy-path test (uses Supabase test inbox).
- [ ] Code review approved.
- [ ] Documentation: README "Getting Started" mentions magic-link as default.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:01.723Z_
