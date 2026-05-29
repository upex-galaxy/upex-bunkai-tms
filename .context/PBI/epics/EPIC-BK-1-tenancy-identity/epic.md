# EPIC: Tenancy & Identity

**Jira Key:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 13

---

## Description

# Tenancy & Identity

Foundational epic for the Bunkai TMS multi-tenancy model. Owns the boundary that every other entity in the product (Projects, Modules, User Stories, Acceptance Criteria, ATCs, Tests, Runs, Bugs) is scoped under.

## Wave

***Wave 1*** — Tenancy + Identity + RLS. Foundational substrate; every other epic depends on the auth model and `workspace_members` RBAC table landed here. See `.context/master-implementation-plan.md` §5.

## Scope

Sign-up and sign-in via email magic-link and OAuth providers (GitHub, Google). Workspace creation with `owner` role. Member invitations by email with role assignment (`owner` / `admin` / `member` / `viewer`). Workspace switching for users who belong to multiple tenants.

## Business value

Without this epic shipped, no other epic can be tested end-to-end. It is the prerequisite for every customer-facing flow and for the design-partner pilot launch.

## In scope (MVP)

- Email magic-link sign-up + sign-in via ***Supabase Auth***
- OAuth sign-up + sign-in (GitHub, Google) via Supabase Auth
- Workspace creation (one default workspace auto-created on first verified sign-in)
- Member invitations by email with role assignment
- Workspace switching (rotates session `active*workspace*id`)
- Role hierarchy: `owner` > `admin` > `member` > `viewer`

## Out of scope (Phase 2 / Phase 3)

- SSO / SAML (Okta, Azure AD, Google Workspace) — Enterprise tier, Phase 3
- Audit log of authentication events (compliance-grade) — Phase 3
- Custom role definitions / fine-grained permissions — Phase 3
- Workspace deletion / archival flow — backlog post-MVP

## Acceptance criteria (epic level)

1. A new visitor can sign up with email magic-link and land on the Workspace Home in less than 2 minutes.
2. A new visitor can sign up via GitHub or Google OAuth and the resulting account is correctly upserted in `auth.users`.
3. The first verified login automatically creates a personal default Workspace named `"{display_name}'s workspace"`.
4. A Workspace owner can invite a teammate by email + role; the invitee receives an email with a signed token (24h expiry) and lands in the new Workspace after accepting.
5. An authenticated user belonging to multiple Workspaces can switch between them; the rotation is reflected immediately in the session and in all subsequent API calls.
6. Roles enforce write boundaries: a `viewer` cannot create / edit / delete entities; a `member` cannot invite teammates; only `owner` or `admin` can invite.

## Related functional requirements

- ***FR-001*** — Email + OAuth sign-up
- ***FR-002*** — Workspace creation
- ***FR-003*** — Invite teammate
- ***FR-004*** — Workspace switch

See `.context/SRS/functional-specs.md`.

## Technical considerations

- ***Auth substrate***: Supabase Auth (managed) for MVP. Self-hosted Phase 2 edition swaps to Better Auth. All FRs go through `lib/supabase/server.ts` (SSR client) and `middleware.ts` (route guards).
- ***Stack****: single Next.js 15 monorepo. API routes live under `app/api/v1/**` — no separate backend service in MVP.
- ***Tables involved***: `auth.users` (Supabase managed), `workspaces`, `workspace*members`, `workspace*invites`.
- ***Security***: OAuth state CSRF token validated; invite tokens HMAC-signed with 24h TTL; role ≤ caller's role enforced server-side; RLS policies on `workspaces` and `workspace_members`.
- ***Schema***: consult Supabase MCP at run-time — no hardcoded SQL in this epic.

## Dependencies

- ***External***: Supabase Auth (managed), GitHub OAuth app, Google OAuth client.
- ***Internal***: none (this is Wave 1).
- ***Blocks***: EPIC-BK-002 (Project & Module hierarchy needs `workspace_id`), EPIC-BK-009 (API tokens are workspace-scoped).

## Success metrics

- Sign-up → first ATC time ≤ 10 minutes (per Journey 1 of `.context/PRD/user-journeys.md`).
- Invite acceptance rate ≥ 70% within 7 days of send.
- Less than 1% of OAuth flows fall back to magic-link due to provider failure.

## Risks & mitigations

- ***OAuth callback blocked by IT proxy / third-party-cookie restrictions*** — High impact, Medium probability. Mitigation: always-available magic-link fallback surfaced within 30s.
- ***Invite token leaked or replayed*** — High impact, Low probability. Mitigation: HMAC-signed token, single-use, 24h TTL, rotated on accept.
- ***Role-escalation via API bypass*** — Critical impact, Low probability. Mitigation: RLS policies + server-side role-check middleware on every mutation.
- ***Supabase Auth outage*** — High impact, Low probability. Mitigation: manual user-create runbook + status-page communication.

## Testing strategy

Per-story acceptance criteria live in Gherkin form on each child story. Edge cases enumerated per story before Shift-Left QA exits.

### Test coverage requirements

- ***Unit***: invite-token signing / verification, role-hierarchy comparisons.
- ***Integration***: sign-up → workspace-default-create → first sign-in path; invite-create → email send → accept path.
- ***E2E (Playwright)***: both OAuth providers + magic-link, hitting staging.

## Notes

- Persona: Elena Vargas (Senior QA Engineer) is the primary user of Journey 1; she expects to reach the Workspace Home in under 60s after clicking the invite link.
- Self-hosted edition (Phase 2): swap Supabase Auth → Better Auth; FR contracts must remain stable so the same API tests pass against both backends.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2) | Authentication | Sign up and sign in with email magic-link | 5 | Medium | QA Approved |
| [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3) | Authentication | Sign up and sign in via OAuth (GitHub / Google) | 8 | Medium | Ready For Dev |
| [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4) | TMS-Workspace | Create a workspace | - | Medium | Ready For QA |
| [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5) | TMS-Workspace | Invite a teammate with a role | - | Medium | Ready For QA |
| [BK-6](https://upexgalaxy67.atlassian.net/browse/BK-6) | TMS-Workspace | Switch between workspaces | - | Medium | Ready For QA |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:44.072Z_
