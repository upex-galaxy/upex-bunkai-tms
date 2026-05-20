# Comments for BK-3

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-3)

---

### Ely - 5/19/2026, 9:05:41 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Buttons on `/login` page: `<OAuthButton provider="github" />`, `<OAuthButton provider="google" />`.
- Callback: `app/auth/callback/route.ts` (shared with magic-link callback).

### Backend

- `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })`.
- Validate `state` query param.

### External Services

- GitHub OAuth app (client_id, client_secret in env).
- Google OAuth client (client_id, client_secret in env).

## Dependencies
### Blocked By

- Supabase OAuth providers configured (GitHub + Google apps registered in Supabase dashboard).

### Related

- BK-2 (email magic-link) — same FR-001.

## Definition of Done
- [ ] Both providers (GitHub + Google) tested in staging.
- [ ] CSRF state-mismatch path tested.
- [ ] Magic-link fallback surfaced when OAuth blocked.
- [ ] E2E Playwright test for at least one provider happy-path.
- [ ] Documentation: README "Getting Started" mentions OAuth.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:02.000Z_
