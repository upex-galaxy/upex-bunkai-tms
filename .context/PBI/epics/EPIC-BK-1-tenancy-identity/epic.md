# EPIC: Tenancy & Identity

**Jira Key:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 13

---

## Description

# Tenancy & Identity

Foundational epic for Bunkai TMS multi-tenancy. Owns the boundary that every other entity in the product (Projects, Modules, US, AC, ATCs, Tests, Runs, Bugs) is scoped under.

## Scope

Sign-up and sign-in via email magic-link and OAuth providers (GitHub, Google). Workspace creation with owner role. Member invitations with email + role assignment (owner / admin / member / viewer). Workspace switching for users belonging to multiple tenants.

## Business Value

Without this epic shipped, no other epic can be tested end-to-end. It is the prerequisite for every customer-facing flow and for the design-partner pilot launch.

## In Scope (MVP)

- Email magic-link sign-up + sign-in (Supabase Auth)
- OAuth sign-up + sign-in (GitHub, Google) via Supabase Auth
- Workspace creation (one default workspace auto-created on first sign-in)
- Member invitations by email with role assignment
- Workspace switching (rotate session active_workspace_id)
- Role hierarchy: owner > admin > member > viewer

## Out of Scope (Phase 2 / Phase 3)

- SSO / SAML (Okta, Azure AD, Google Workspace) — Enterprise tier, Phase 3
- Audit log of authentication events (compliance-grade) — Phase 3
- Custom role definitions / fine-grained permissions — Phase 3
- Workspace deletion / archival flow — backlog post-MVP

## Acceptance Criteria (Epic Level)

1. A new visitor can sign up with email magic-link and land on the Workspace Home in less than 2 minutes.
2. A new visitor can sign up via GitHub or Google OAuth and the resulting account is correctly upserted in auth.users.
3. The first verified login automatically creates a personal default Workspace named "{display_name}'s workspace".
4. A Workspace owner can invite a teammate by email + role; the invitee receives an email with a signed token (24h expiry) and lands in the new Workspace after accepting.
5. An authenticated user belonging to multiple Workspaces can switch between them; the rotation is reflected immediately in the session and in all subsequent API calls.
6. Roles enforce write boundaries: a viewer cannot create / edit / delete entities; a member cannot invite teammates; only owner/admin can invite.

## Related Functional Requirements

- FR-001 — Email + OAuth sign-up
- FR-002 — Workspace creation
- FR-003 — Invite teammate
- FR-004 — Workspace switch

See: `.context/SRS/functional-specs.md`

## Technical Considerations

- **Auth substrate:** Supabase Auth (managed) for MVP; swap to Better Auth for self-hosted (Phase 2). All FRs go through `lib/supabase/server.ts` (SSR client) and `middleware.ts` (route guards).
- **Tables involved:** `auth.users` (Supabase managed), `workspaces`, `workspace_members`, `workspace_invites`.
- **Security:** OAuth state CSRF token validated; invite tokens are signed with HMAC + 24h TTL; role ≤ caller's role rule enforced server-side; RLS policies on workspaces + workspace_members.
- **Schema:** consult Supabase MCP at run-time — do not hardcode SQL in this epic file.

## Dependencies

- **External:** Supabase Auth (managed), GitHub OAuth app, Google OAuth client.
- **Internal:** none (this is Wave 1).
- **Blocks:** EPIC-BK-002 (Project & Module Hierarchy needs Workspace ID), EPIC-BK-009 (API tokens are Workspace-scoped).

## Success Metrics

- Sign-up → first ATC time ≤ 10 minutes (per Journey 1 of `.context/PRD/user-journeys.md`).
- Invite acceptance rate ≥ 70% within 7 days of send.
- < 1% of OAuth flows fall back to magic-link due to provider failure.

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| OAuth callback blocked by IT proxy / third-party-cookie restrictions | High (users locked out) | Medium | Always-available magic-link fallback surfaced within 30s |
| Invite token leaked / replayed | High (account hijack) | Low | HMAC-signed token, single-use, 24h TTL, rotated on accept |
| Role-escalation via API bypass | Critical | Low | RLS policies + server-side role-check middleware on every mutation |
| Supabase Auth outage | High | Low | Manual user-create runbook + status page communication |

## Testing Strategy

See `.context/PBI/epics/EPIC-BK-{N}-tenancy-identity/stories/*/story.md` for per-story acceptance criteria in Gherkin format. Edge cases enumerated in a future `edge-cases.md` per story (see `/product-management` reference `edge-cases-enumeration.md`).

### Test Coverage Requirements

- Unit: invite-token signing/verification, role hierarchy comparisons.
- Integration: sign-up → workspace-default-create → first sign-in path; invite create → email send → accept path.
- E2E (Playwright): both OAuth providers + magic-link, hitting staging.

## Notes

- Persona: Elena Vargas (Senior QA Engineer) is the primary user of Journey 1; she expects to be on the Workspace Home in under 60s after clicking the invite link.
- Self-hosted edition (Phase 2): swap Supabase Auth → Better Auth; FR contracts must remain stable so the same API tests pass against both backends.


---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2) | Sign up and sign in with email (magic-link) | 5 | Medium | Estimation |
| [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3) | Sign up and sign in via OAuth (GitHub / Google) | 5 | Medium | Estimation |
| [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4) | Create a Workspace | 1 | Medium | Shift-Left QA |
| [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5) | Invite a teammate to a Workspace with role assignment | 1 | Medium | Estimation |
| [BK-6](https://upexgalaxy67.atlassian.net/browse/BK-6) | Switch between Workspaces I belong to | 1 | Medium | Estimation |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:01.421Z_
