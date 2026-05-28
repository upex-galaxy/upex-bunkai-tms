# Testability-guide idempotency snapshot

> Read by future re-runs of `/testability-guide` to detect drift instead of regenerating.

## Latest run

- **Date**: 2026-05-27
- **Generator**: lean-mode (skill skipped, direct write)
- **Stack signature**: `next-supabase-scalar`
- **Epic key**: `BK-29`
- **Epic title**: Bunkai TMS — Credenciales de Acceso para Testing (DB / API / UI)
- **Epic URL**: https://jira-prod-us-77-3.prod.atl-paas.net/browse/BK-29

## Artefactos generados

- `app/qa/page.tsx` — public guide, snapshot comment at the top.
- Jira Epic BK-29 — full credentials artifact body (in Spanish, wiki markup).
- Local body source: `/tmp/bunkai-qa-epic-body.md` (transient — re-generate when re-running).

## Migrations snapshot at generation time

| # | Migration | Tables |
|---|---|---|
| 0001 | tenancy | workspaces, workspace_members |
| 0002 | projects_modules | projects, modules |
| 0003 | authoring | user_stories, acceptance_criteria |
| 0004 | atcs | atcs, atc_steps, atc_assertions, atc_acceptance_criteria |
| 0005 | rls_helpers | (functions only) |
| 0006 | bootstrap_workspace | (RPC) |
| 0007 | save_atc | (RPC) |
| 0008 | access_tokens | access_tokens |
| 0009 | cross_cutting | idempotency_keys, activity_log, feature_flags, user_view_state, magic_link_tokens |
| 0010 | workspace_invites | workspace_invites |

## API surface at generation time

- 14 paths / 19 operations (post signup + signin endpoints).
- Discovery: `/api/v1`. Spec: `/api/openapi`. Docs: `/api/docs`.

## DB roles (provisioned 2026-05-27)

| Role | BYPASSRLS | Login | Privileges |
|---|---|---|---|
| `qa_inspector_ro` | YES | YES | SELECT on `public.*` |
| `qa_inspector_rw` | YES | YES | SELECT + INSERT + UPDATE + DELETE on `public.*` + sequence usage |

Defense-in-depth: column-level REVOKE on `access_tokens.hash`, `workspace_invites.token_hash`, `magic_link_tokens.token_hash` for both roles.

**Initial passwords** (provisioned on creation, **MUST be rotated** before sharing with the QA team): `rotate-me-after-creation-001-bk`. Rotation SQL:

```sql
alter role qa_inspector_ro password '<new-secret>';
alter role qa_inspector_rw password '<new-secret>';
```

## Bearer-token end-to-end

`GET /api/v1/me` and `GET /api/v1/workspaces` accept both Supabase cookie session AND Bearer PAT (`Authorization: Bearer bk_pat_<prefix>.<secret>`). The response includes `auth.source` to confirm which auth path served the request.

Three paths to obtain a PAT (all valid):

1. **Browser session + mint** — sign in via `/login`, then `POST /api/v1/tokens` with the cookie. Same as Sprint 1.
2. **Headless signup** — `POST /api/v1/auth/signup` provisions a QA user with password (email_confirm forced) AND mints a PAT in the same response.
3. **Headless signin** — `POST /api/v1/auth/signin` authenticates with email+password and mints a fresh PAT. Useful for CI runs that need a short-lived token per build.

Magic-link users (browser flow) have no password set in `auth.users.encrypted_password`, so they MUST use path 1 (cookie-extract). Password users (provisioned via path 2) can use any of the three.

Commits:

- `6f1b7a3 feat(api): dual-mode auth (cookie + bearer pat) wired into /api/v1/me`
- `abca859 feat(api): bearer pat accepted on /api/v1/workspaces (get)`
- `<pending> feat(auth): headless password signup + signin endpoints with auto-PAT mint`

## Re-run policy

Next time `/testability-guide` runs:

1. Read this snapshot file.
2. Compare migrations + endpoint count + stack signature against current repo.
3. If drift detected → propose surgical patch to `app/qa/page.tsx` + update Epic BK-29 description in place (do NOT create a new Epic — re-use this one).
4. Update this snapshot.
