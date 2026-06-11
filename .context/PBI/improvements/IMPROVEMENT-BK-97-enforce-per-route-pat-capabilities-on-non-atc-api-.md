# IMPROVEMENT: Enforce per-route PAT capabilities on non-ATC API routes (ADR-0001 follow-up)

**Jira Key:** [BK-97](https://jira.upexgalaxy.com/browse/BK-97)
**Priority:** Medium
**Status:** Open
**Components:** None

---

## Description

## Context

Follow-up to ***ADR-0001 — Unified API Authentication*** (shipped in PR #28, merged to `staging`). The unified gateway (`withApiHandler` + `Principal` + impersonating client) closed the BK-17 blocker: a Bearer PAT now authenticates on every `/api/v1` route with the same RLS-based authorization as a cookie session.

## Problem

The migration deferred one piece: ***per-route capability (scope) enforcement on non-ATC routes***.

- ATC routes enforce a scope: `withApiHandler(handler, { requires: ['atc:write'] })` → a PAT lacking that scope gets `403`.
- ***All other routes**** (imports, modules, projects, user-stories, acceptance-criteria, workspaces, invites) migrated with `requires: []` — they enforce ****authentication + RLS workspace membership only***, and do NOT check the PAT's scopes.

***Implication******:*** a user who mints a narrowly-scoped PAT (e.g. `['atc:read']`, intending read-only) can still perform writes on every non-ATC route — invite members, create modules, trigger imports — because those routes do not gate on the token's scope.

> ***INFO:**** This is NOT a cross-tenant data leak — RLS still confines the PAT to workspaces the user belongs to, and it can only do what the user themselves could do via the UI. The gap is that the ****per-token scope limit is not honored outside ATC***, so a leaked narrow-scope PAT is more powerful than its scope implies. Severity: medium.

## Goal

Map each non-ATC route to a required capability so a PAT is gated by its scope ***everywhere***, not just on ATC routes.

## Implementation level — CODE (not DB)

| Part | Level | Files |
| --- | --- | --- |
| Add `requires: [...]` per route | ***Code**** | `app/api/v1/***` (~18 route files) |
| Capability type / constants | ***Code*** | `lib/api/pat.ts` (`AccessTokenScope`, `ALLOWED*PAT*SCOPES`), `lib/api/principal.ts` (`ALL_CAPABILITIES`) |
| New scope names (ONLY if vocabulary is expanded) | ***DB*** (1 migration) | widen the `scopes` CHECK in `supabase/migrations/0008*access*tokens.sql` |

- Reuse the existing 4 scopes (`atc:read`, `atc:write`, `run:execute`, `workspace:admin`) → ***100% code, zero DB***.
- Add new scope names (e.g. `import:run`, `workspace:write`) → code + one small migration.

The enforcement lives in the gateway (`requireCapability`), so this is ***code-first*** — it cannot be done at the DB layer alone.

## Open product decision (do this first)

Define the capability vocabulary: reuse the current 4 scopes vs. introduce finer-grained ones. This is a product/security call, which is why it was deferred rather than invented mid-migration.

## Acceptance criteria

- Each authenticated non-ATC route declares an explicit `requires: [...]` capability.
- A PAT lacking the required scope receives `403` on that route; a cookie session is unaffected (holds the full capability set).
- The capability vocabulary is documented (and, if expanded, the `access_tokens.scopes` CHECK migration ships with it).
- Cross-tenant isolation and the existing parity test remain green.
- ADR-0001 "known limitation" note is updated to "resolved" with a pointer to this ticket.

## References

- ADR: `.context/ADR/ADR-0001-unified-api-authentication.md` (see "KNOWN LIMITATION" + Authorization model)
- PR: #28 (unified auth gateway)
- Origin: BK-17 (the blocker that surfaced the auth gap)

---

## Metadata

- **Created:** 6/8/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** adr-0001, auth, pat-scopes, security, tech-debt

---

_Synced from Jira by sync-jira-issues_
