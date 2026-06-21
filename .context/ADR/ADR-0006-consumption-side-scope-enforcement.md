# ADR-0006 — Consumption-side scope enforcement: TS capability gate + workspace context match

- **Status:** Accepted <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-06-21
- **Deciders:** Ely (PO/approver), dev (proposer)
- **Tags:** authentication, authorization, api, security, cross-cutting-invariant
- **Supersedes:** — (extends ADR-0001 capability-gating; complements ADR-0005)
- **Superseded by:** —

---

## Context

ADR-0005 closed PAT *issuance* of `workspace:admin` (BK-135). But scopes are still barely enforced at *consumption* time:

- `requireCapability` (lib/api/principal.ts) is the live gate, invoked once in `withApiHandler` from the `requires: string[]` handler option. Only the ATC domain (~10 routes) uses it (`atc:read`/`atc:write`/`run:execute`). `workspace:admin` has **zero** gates; `requireScope` (lib/api/middleware/bearer.ts) is dead code.
- The impersonation JWT (lib/api/user-jwt.ts) carries only `sub` + `role: 'authenticated'` — **no scopes**. So Postgres RLS cannot see a PAT's scope subset; RLS gates *data isolation* (which workspace/user), not *which operation class*. Capability enforcement therefore must live in the TS layer.
- Cookie sessions hold `ALL_CAPABILITIES`, so `requireCapability` only constrains PAT callers in practice — cookie users are gated by RLS + explicit `workspace_members` role checks.
- A workspace-scoped PAT (`workspace_id = A`) had no check binding it to workspace A; nothing stopped it acting on workspace B's resources beyond RLS (which is per-user, scope-blind).

This ADR fixes the `workspace:admin` slice (BK-167). The broad non-ATC audit is BK-168.

## Decision

We will enforce PAT capabilities at the **TypeScript layer**, as a gate that **complements** (never replaces) RLS and explicit role checks. Two mechanisms, both invariant going forward:

1. **Operation gate** — an admin operation declares `requires: ['workspace:admin']` in its `withApiHandler` options. A PAT lacking the scope is rejected with 403 before the handler runs. (Cookie sessions hold all capabilities and pass; their authorization is still enforced by the existing `workspace_members` role check + RLS.)
2. **Workspace context match** — `assertWorkspaceContext(principal, targetWorkspaceId)`: for `via === 'bearer'`, the token's `workspace_id` must be non-null and equal the operation's target workspace; otherwise 403. Cookie sessions pass through (trusted UI). This binds a workspace-scoped admin PAT to its own workspace and forbids a null-workspace token from performing admin operations (consistent with "no global admin", ADR-0005).

Invariant: **a workspace-admin operation is authorized only when (a) the caller holds the `workspace:admin` capability, (b) for PATs, the token is scoped to the target workspace, and (c) the caller is `admin`/`owner` of that workspace (RLS + role check).** All three layers apply; none is redundant.

Applies in BK-167 to: invites create/list/resend/revoke and workspace settings PATCH.

## Consequences

- **Positive:** `workspace:admin` becomes a real capability with teeth; a read/write-scoped PAT can no longer perform admin operations; a workspace-scoped PAT cannot cross workspaces. Establishes the reusable pattern (`requires` + `assertWorkspaceContext`) future admin routes inherit.
- **Negative / trade-offs:** authorization for admin ops now spans two TS checks plus RLS — more places to keep aligned. The `requires`/`assertWorkspaceContext` pairing must be remembered for each new admin route (mitigated by the pattern + tests).
- **Neutral / follow-ups:** BK-168 extends capability enforcement to non-ATC write endpoints and consolidates the scope vocabulary (currently duplicated in pat.ts / principal.ts / tokens route / migration 0008). This ADR is the model BK-168 builds on.

## Alternatives considered

- **Carry scopes into the impersonation JWT and enforce in RLS** — rejected: spreads authorization across SQL policies (where cross-tenant leaks hide, per ADR-0001), couples scope vocabulary to migrations, and complicates the JWT. TS-layer gating keeps the scope model in one language.
- **Operation gate only (no workspace context match)** — rejected: a workspace-A admin PAT could act as admin on workspace B if RLS/role didn't independently block it; the context match is the teeth that close cross-workspace escalation.
- **Apply the capability gate to cookie sessions too** — moot: cookie sessions hold `ALL_CAPABILITIES` by design (trusted UI); their gate is RLS + role. Forcing a scope on cookies would break the UI without a security gain.

## References

- BK-167 (this), BK-168 (broad audit), BK-135 / ADR-0005 (issuance fix)
- ADR-0001 — Unified API Authentication (capability gating + RLS-as-truth)
- `lib/api/principal.ts` (requireCapability, assertWorkspaceContext), `lib/api/handler.ts` (`requires`), `lib/api/user-jwt.ts` (JWT claims)
- Routes: `app/api/v1/workspaces/[id]/route.ts`, `app/api/v1/workspaces/[id]/invites/route.ts`, `app/api/v1/workspaces/[id]/invites/[inviteId]/route.ts`
