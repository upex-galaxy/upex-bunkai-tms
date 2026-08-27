# ADR-0005 — Role-gated PAT issuance; no global `workspace:admin` tokens

- **Status:** Accepted <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-06-21
- **Deciders:** Ely (PO/approver), dev (proposer)
- **Tags:** authentication, authorization, api, security, cross-cutting-invariant
- **Supersedes:** — (amends the token-scoping intent documented in `supabase/migrations/0008_access_tokens.sql`)
- **Superseded by:** —

---

## Context

Personal Access Tokens (PATs) carry a `scopes[]` array drawn from `atc:read`, `atc:write`, `run:execute`, `workspace:admin` (ADR-0001 unified auth). Three code paths mint PATs:

1. `POST /api/v1/tokens` — cookie-session only (a PAT cannot mint a PAT, per ADR-0001). Caller supplies `scopes[]` and optional `workspace_id`. **No role check existed.**
2. `POST /api/v1/auth/signin` — headless CLI sign-in; default `pat_scopes = ALL_CAPABILITIES` (includes `workspace:admin`), `workspace_id = NULL`.
3. `POST /api/v1/auth/signup` — headless CLI sign-up; same defaults.

Migration `0008_access_tokens.sql` documented `workspace_id = NULL` as a *global / cross-workspace* token "for admin or AI-agent use cases that need to enumerate workspaces." In practice this meant **every CLI login auto-minted a global `workspace:admin` PAT for any user regardless of workspace role** — a privilege escalation surface (BK-135). Staging evidence (single shared Supabase project, so == prod): 136 active `workspace:admin` PATs across 24 users; at least one confirmed `member`-role user holding 19. The workspace role model is **per-workspace only** (`viewer/member/admin/owner` in `workspace_members`); there is **no global-admin role**, so a global `workspace:admin` token has no role it can be authorized against. BK-88 AC Scenario 4 requires: `member` + `workspace:admin` → `403`.

Note: `workspace:admin` currently has **no enforcement on the consumption side** (`requireScope` in `lib/api/middleware/bearer.ts` is unused; zero `requireCapability('workspace:admin')` calls in `app/api`). It is a latent capability — granted but not yet checked. This makes remediation non-disruptive but does not make the escalation acceptable: enforcement will be wired later, at which point every pre-existing global admin token becomes a live breach.

## Decision

We will **role-gate the issuance of the `workspace:admin` scope** and **forbid global (`workspace_id = NULL`) `workspace:admin` tokens** across all three minting paths, via a shared authorization helper. The invariant:

> A PAT may carry `workspace:admin` **only if** it is bound to a specific `workspace_id` **and** the issuing user holds `admin` or `owner` role in that workspace. Issuing a token bound to a `workspace_id` additionally requires the issuer to be an active member of that workspace.

Concretely:

- **`POST /api/v1/tokens`**: if `scopes` includes `workspace:admin` → require non-null `workspace_id` and caller role ∈ {`admin`,`owner`} in that workspace, else `403`. If `workspace_id` is provided for any scope → require active membership, else `403`.
- **`/auth/signin` + `/auth/signup`**: drop `workspace:admin` from the default scope set (new `DEFAULT_PAT_SCOPES = ['atc:read','atc:write','run:execute']`); reject any explicit `pat_scopes` containing `workspace:admin` with `403` (these headless flows take no `workspace_id`, so they can never satisfy the invariant).
- **Global tokens remain allowed for non-admin scopes** (`atc:read/write/run:execute` with `workspace_id = NULL`) — the AI-agent / cross-workspace enumeration use case from migration 0008 is preserved for non-admin capabilities only.

Enforcement responses use `ApiError('forbidden', …)` (HTTP 403), mirroring the existing `workspaces/[id]/invites` role gate.

## Consequences

- **Positive:** closes the BK-135 privilege escalation at the source (auth endpoints) and at the direct vector (`/api/v1/tokens`); satisfies BK-88 AC Scenario 4; unblocks BK-88 QA; establishes a single authorization invariant for token issuance reused by all mint paths.
- **Negative / trade-offs:** `workspace:admin` can no longer be obtained via CLI bootstrap — an admin who wants an admin-scoped PAT must mint it through a cookie session at `POST /api/v1/tokens` with an explicit `workspace_id`. The "global admin token" affordance documented in migration 0008 is intentionally removed.
- **Neutral / follow-ups:**
  - Existing tokens are remediated by **scope-strip** (remove `workspace:admin` from violating tokens; keep the token live for its other scopes) — non-disruptive because the scope has no teeth yet.
  - **Follow-up ticket (out of scope here):** wire consumption-side enforcement of `workspace:admin` (`requireScope`/`requireCapability`) and validate the token's `workspace_id` against the request's workspace context. Until then `workspace:admin` stays a label.
  - When that enforcement lands, admins must re-mint a proper workspace-scoped admin token.

## Alternatives considered

- **Silent scope-downgrade on issuance (return 201 minus the admin scope)** — rejected: hides the authorization failure from the caller; an explicit `403` is auditable and matches the existing invites pattern and BK-88 AC.
- **Allow global `workspace:admin` if the caller is admin/owner in their active workspace** — rejected: grants admin across *all* the user's workspaces from a single-workspace role; reproduces the cross-workspace escalation the ADR exists to close.
- **Revoke existing violating tokens instead of scope-stripping** — rejected for remediation: the offending tokens bundle `workspace:admin` with normal scopes; full revoke would strip users of `atc:read/write/run` access too, for no extra security benefit (admin scope is unenforced today).
- **Fix only `/api/v1/tokens` (the AC endpoint), defer auth endpoints** — rejected: `/auth/signin` + `/auth/signup` are the actual source of the 136 tokens; leaving their defaults open keeps the breach producing new tokens.

## References

- BK-135 (bug), BK-88 (Settings | Manage Personal Access Tokens) AC Scenario 4
- ADR-0001 — Unified API Authentication
- `supabase/migrations/0008_access_tokens.sql` (amended token-scoping intent)
- `app/api/v1/tokens/route.ts`, `app/api/v1/auth/signin/route.ts`, `app/api/v1/auth/signup/route.ts`, `lib/api/pat.ts`, `lib/api/principal.ts`, `lib/api/middleware/bearer.ts`

## Implementation status (as of 2026-08-24)

Append-only note per `.context/ADR/README.md:43` — the Context, Decision and Consequences above are untouched historical record. Two of their statements about the *rest of the system* have since been overtaken by events, and this ADR read standalone would now mislead a reader into re-opening a closed hole.

- **`workspace:admin` is NO LONGER a label without teeth. The Context note at `:22` and the follow-up at `:44` are answered by [ADR-0006](./ADR-0006-consumption-side-scope-enforcement.md) (BK-167), which SHIPPED.** Five handler entries now declare `requires: ['workspace:admin']`, confirmed against `lib/api/route-capability-coverage.snapshot.json`: workspace settings PATCH (`app/api/v1/workspaces/[id]/route.ts:76`), invites create and list (`app/api/v1/workspaces/[id]/invites/route.ts:161`, `:188`), invite resend and revoke (`app/api/v1/workspaces/[id]/invites/[inviteId]/route.ts:69`, `:96`). Each pairs the capability gate with the workspace-context match `assertWorkspaceContext(principal, targetWorkspaceId)` (`lib/api/principal.ts:96`), called at `app/api/v1/workspaces/[id]/route.ts:49`, `app/api/v1/workspaces/[id]/invites/route.ts:31` and `:170`, `app/api/v1/workspaces/[id]/invites/[inviteId]/route.ts:25` and `:78`. The gate itself runs in `withApiHandler` before the handler (`lib/api/handler.ts:93-97`). **Do not treat `workspace:admin` as unenforced** — a PAT lacking the scope, or holding it for a different workspace, is rejected with 403.
- **The Decision bullet at `:33` has partly relocated: `/auth/signup` no longer mints PATs at all.** [ADR-0007](./ADR-0007-password-auth-and-email-otp.md) (BK-166) made sign-up verification-first — it returns 202 with no session and no PAT (`app/api/v1/auth/signup/route.ts:9-12`), so there is no longer a scope set there to reject. The `assertNoGlobalAdminScope` rejection this ADR specified now runs on the two routes that actually mint a PAT: `app/api/v1/auth/confirm/route.ts:51-52` and `app/api/v1/auth/signin/route.ts:40-41`, both defaulting to `DEFAULT_PAT_SCOPES` (`lib/api/pat.ts:22-26`, which excludes `workspace:admin`; the guard is `lib/api/pat.ts:31-38`). The invariant is intact; only its address changed.
- **The scope-strip remediation at `:43` shipped as `supabase/migrations/0033_remediate_bk135_admin_scope.sql`.** It revokes tokens whose only scope was `workspace:admin` (`:29-30`, because the `access_tokens_scopes_nonempty` CHECK forbids an empty array) and `array_remove`s the scope from tokens carrying it alongside others (`:47-48`), idempotent by construction (`:21-22`). Because ADR-0006 subsequently gave the scope teeth, the consequence at `:45` — admins must re-mint a workspace-scoped admin token via `POST /api/v1/tokens` — is now live rather than pending.
