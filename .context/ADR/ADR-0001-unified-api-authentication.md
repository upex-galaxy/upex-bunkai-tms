# ADR-0001 — Unified API Authentication (Single Identity Gateway)

- **Status:** Accepted
- **Date:** 2026-06-08 (proposed) · 2026-06-08 (accepted)
- **Deciders:** Project architect + auth owner (ratified after external AI cross-judgment)
- **Tags:** authentication, authorization, api, security, cross-cutting-invariant

---

## Context

The `/api/v1` surface supports **two authentication methods for the same human**:

- **Cookie session** — browser / UI callers, via Supabase SSR session.
- **Personal Access Token (PAT)** — `bk_pat_*` bearer tokens, the documented method for headless / CLI / agent callers (API).

The intended product behaviour is **parity**: a user who authenticates via API should be able to do essentially everything they can do via the UI (with deliberate, documented exceptions).

Today that parity is **not** an architectural guarantee — it is a per-route decision a developer can silently get wrong. Two auth code paths exist:

1. **Dual-mode** — handlers that call `requireAuth(request)` (`lib/api/auth.ts:20-49`). Checks `Authorization: Bearer bk_pat_*` first (`lib/api/auth.ts:21-31`) and falls back to the cookie session (`lib/api/auth.ts:33-48`). Accepts **both** methods.
2. **Cookie-only** — handlers that call `createClient().auth.getUser()` directly (`lib/supabase/server.ts`). Reads only the SSR session cookie and **ignores the Authorization header entirely**, so a valid PAT yields `user = null` → `401 unauthorized`.

### The triggering incident (BK-17)

A valid PAT returns `200` on `GET /me` and `GET /workspaces` but `401` on `POST /imports`, `/tokens`, `/workspaces/[id]/projects`, and `/projects/[id]/modules`. This blocked 100% of BK-17 (Jira Import) QA — 0 of 22 test outlines executable.

Root cause is **not** a regression in `requireAuth`. `requireAuth` works correctly. The failing handlers **never called it**. Bearer support was wired into a handful of handlers and never extended to the rest. The disease is structural: *authenticating is a per-handler choice instead of a project invariant.* Left as-is, this class of bug recurs every time a new route is added.

### Three findings from the full grep of `app/api/**` (2026-06-08)

**Finding A — the real scope is the whole API, not 4 routes.** Of all authenticated handlers, **only 4 accept a PAT**; **~29 handler entries across 18 route files** are cookie-only and reject PATs — including read (`GET`) endpoints, so the API can barely *read*, let alone write. BK-17 surfaced 4 of them; the gap is system-wide.

**Finding B — the single-gateway infrastructure already exists.** Every route is already wrapped by `withApiHandler` (`lib/api/handler.ts:27`), which centralises request-id propagation, structured logging, and error→envelope mapping — but does **not** touch auth. Auth is still hand-rolled inside each handler. This means the proposed gateway is **half-built**: we extend an established, already-universal wrapper rather than introduce a new one. Large de-risk and cost reduction.

**Finding C — the cookie-only routes delegate *authorization* to Postgres RLS, not just authentication.** They build a session-scoped client (`createClient()` from `lib/supabase/server.ts`) and let RLS policies keyed on `auth.uid()` (present in 9 migrations) decide what each query returns — e.g. `imports/route.ts:33,65` ("RLS scopes the read… an outsider reads as not found"; "RLS INSERT policy gates to member+"). A PAT caller has no session, so `auth.uid()` is null and RLS denies everything; the service-role admin client, conversely, **bypasses RLS entirely**. Therefore **unifying authentication is necessary but not sufficient** — the migration must also keep each route's RLS-based authorization working for PAT callers. This corrects an earlier optimistic framing of the migration as purely "mechanical": it is mechanical **only** once authorization parity is solved structurally (see Decision, Authorization model → Path B).

### Latent second defect (worse than BK-17)

Authentication and authorization are entangled and asymmetric. Cookie sessions are created with `scopes: []` (`lib/api/auth.ts:45`) and rely on RLS alone, while PATs are gated by `requireScopeOrCookie` (`lib/api/auth.ts:53-60`), which **passes cookie sessions through unchecked** and enforces scopes only for bearer callers. Consequence: the **same human** has different effective permissions depending on whether they entered via UI or API — the exact opposite of the parity goal. The code comment at `lib/api/auth.ts:41-45` already acknowledges this asymmetry.

---

## Current-state inventory (`app/api/**`, grep 2026-06-08)

### Dual-mode — accepts PAT (`requireAuth`) — 4 handlers

| Route file | Handler | `requireAuth` |
| ---------- | ------- | ------------- |
| `app/api/v1/me/route.ts` | GET | `:22` |
| `app/api/v1/workspaces/route.ts` | GET | `:100` |
| `app/api/v1/atcs/route.ts` | POST | `:18` |
| `app/api/v1/atcs/[id]/route.ts` | PATCH | `:23` |

### Cookie-only — rejects PAT (`createClient().auth.getUser()`) — ~29 handler entries / 18 files

| Route file | Handler(s) | `getUser()` line(s) |
| ---------- | ---------- | ------------------- |
| `app/api/v1/imports/route.ts` | POST | `:23` |
| `app/api/v1/imports/[id]/route.ts` | GET | `:19` |
| `app/api/v1/projects/[id]/modules/route.ts` | POST | `:41` |
| `app/api/v1/modules/[id]/route.ts` | PATCH, DELETE | `:43`, `:149` |
| `app/api/v1/modules/[id]/user-stories/route.ts` | POST, GET | `:35`, `:108` |
| `app/api/v1/user-stories/[id]/route.ts` | GET, PATCH, DELETE | `:37`, `:65`, `:216` |
| `app/api/v1/user-stories/[id]/acceptance-criteria/route.ts` | POST, GET | `:38`, `:107` |
| `app/api/v1/acceptance-criteria/[id]/route.ts` | GET, PATCH, DELETE | `:38`, `:66`, `:165` |
| `app/api/v1/workspaces/route.ts` | POST | `:57` |
| `app/api/v1/workspaces/[id]/route.ts` | GET, PATCH | `:19`, `:47` |
| `app/api/v1/workspaces/[id]/projects/route.ts` | POST | `:31` |
| `app/api/v1/workspaces/[id]/invites/route.ts` | POST, GET | `:30`, `:105` |
| `app/api/v1/workspaces/[id]/invites/[inviteId]/route.ts` | POST, DELETE | `:25`, `:81` |
| `app/api/v1/me/active-workspace/route.ts` | POST | `:24` |
| `app/api/v1/tokens/route.ts` | POST, GET | `:34`, `:100` |
| `app/api/v1/tokens/[id]/route.ts` | DELETE | `:25` |
| `app/api/v1/invites/accept/route.ts` | POST | `:22` |
| `app/api/v1/me/route.ts` | GET (secondary call) | `:81` |

> `app/api/v1/me/route.ts` GET starts with `requireAuth` (`:22`, PAT-capable) yet performs a second `getUser()` at `:81` within the same handler — a mixed pattern to untangle during retrofit (verify the secondary call does not break PAT callers).

### Public / intentionally unauthenticated (no retrofit)

| Route file | Why public |
| ---------- | ---------- |
| `app/api/v1/health/route.ts`, `app/api/openapi/route.ts`, `app/api/v1/route.ts` | Health / spec / index |
| `app/api/v1/auth/signin`, `auth/signup`, `auth/magic-link` | Session minting — pre-auth by nature |

### Deliberate parity exceptions (cookie-only **on purpose**)

| Route file | Why excluded from PAT parity |
| ---------- | ---------------------------- |
| `app/api/v1/tokens/route.ts` (POST), `tokens/[id]/route.ts` (DELETE) | A PAT must not mint/revoke PATs — privilege escalation. UI-session only. |
| `app/api/v1/invites/accept/route.ts` (POST) | Invite acceptance is a UI flow tied to the browser session. (Confirm during planning.) |

**Headline number:** 4 handlers PAT-capable vs ~29 cookie-only. The retrofit target after removing public + deliberate-exception routes is the bulk of the cookie-only list above.

---

## Decision

Make authentication a **cross-cutting invariant enforced mechanically**, not a per-handler convention. Adopt the principle: **the right thing is the only thing** — a developer must not be able to ship an under-protected route by forgetting a helper. Build **on the existing `withApiHandler`**, do not introduce a parallel wrapper.

Four pieces, defense-in-depth (prevent → detect → verify):

### 1. Unified identity — `Principal` + `resolveIdentity()`  *(prevent, root)*

A single normalizer resolves **either** auth method into one canonical object early in the request:

```
Request (cookie OR bearer)
        │
   resolveIdentity()      ← the ONLY place that knows about cookie vs PAT
        │
        ▼
   Principal { userId, workspaceId, capabilities[], via }
        │
        ▼
   handler                ← sees only Principal; does not know/care how auth happened
```

After this point there is exactly **one** code path. Handlers never branch on auth method. The parity bug becomes structurally impossible, not merely improbable.

### 2. Auth-aware gateway — extend `withApiHandler`  *(prevent)*

`withApiHandler` (`lib/api/handler.ts:27`) already wraps **every** route. Extend it to take an auth option, run `resolveIdentity`, enforce required capabilities, and inject the resolved `Principal` into `ApiHandlerContext` (`lib/api/handler.ts:18-20`):

```
withApiHandler(handler, { auth: 'required', requires: ['atc:write'] })   // default
withApiHandler(handler, { auth: 'public' })                              // explicit opt-out
```

`auth: 'required'` is the **default**; a route is public only by an explicit, reviewable flag. Because the wrapper is already universal, there is no "naked" handler to miss — the gateway is already on every route; we are adding the auth responsibility it should have owned from the start.

### 3. Mechanical CI ban on the bypass  *(detect)*

A lint/CI rule forbids `createClient().auth.getUser()` (and equivalent raw session reads) inside `app/api/**`. Bypassing the gateway turns the build red. This is the safety net that does **not** depend on human memory — it survives new hires and release-day pressure.

### 4. Parity contract test  *(verify)*

A parameterized test drives the route catalog with **both** a cookie and a PAT and asserts equivalent results, except for the explicit exception list (public + token-mint + invite-accept). Living proof that parity holds today and a regression alarm for tomorrow.

### Authorization model — Path B: impersonating client (chosen)

The core problem (Finding C): cookie routes delegate authorization to Postgres RLS via `auth.uid()`; a PAT has no `auth.uid()`. Three options were weighed — (A) rewrite each route's data access as `SECURITY DEFINER` RPCs with an explicit actor (the BK-18 pattern), (B) give the PAT caller an RLS-scoped client by **impersonating** its user at the Postgres layer, or (C) a hybrid. **Path B was chosen** (ratified with the user).

Mechanism: `resolveIdentity` returns `principal.db`, an RLS-scoped Supabase client authenticated **as** the resolved user, for both methods:

- **Cookie** → the existing SSR client (the session already carries `auth.uid()`).
- **Bearer PAT** → an anon client carrying a **short-lived (60s), user-scoped JWT** (`sub = userId`, `role = authenticated`) signed with `SUPABASE_JWT_SECRET` (`lib/api/user-jwt.ts`). PostgREST resolves `auth.uid()` to that user, so **every existing RLS policy applies to the PAT caller exactly as to the browser** — no per-route authorization rewrite, no hand-rolled checks in TypeScript (which is where cross-tenant leaks hide).

Why Path B over A: RLS stays the **single source of authorization truth**; the migration of ~25 handlers becomes a near-mechanical swap (drop `createClient()` + `getUser()`; use `ctx.db` + `ctx.principal`) instead of ~9 new migrations plus 25 SQL rewrites. The service-role key is never handed to PostgREST — we authenticate as the user, never as a god-mode service.

Capability gating is separate from RLS and modelled **once**: a cookie session holds the full capability set (`ALL_CAPABILITIES`); a PAT holds its `access_tokens.scopes` subset; `requireCapability` enforces uniformly. This removes the old cookie-`scopes:[]` / bearer-scoped asymmetry (`lib/api/auth.ts:45` vs `:53-60`).

**Security proof (2026-06-08):** a live round-trip against the real DB confirmed the impersonating client is RLS-scoped — an impersonated user sees only its own `workspaces`, leaks **zero** foreign-tenant rows, and an anon client (no JWT) sees nothing. Unit tests (`lib/api/user-jwt.test.ts`, 6/6) guard the token's shape, minimal claims, and signature. A committed parity/cross-tenant test (Phase 6) will lock this in for regression.

### Security exceptions (non-negotiable)

- **Secure by default.** A new route requires auth + capability by default; opting out costs one explicit, reviewable line in the PR — never the easy path.
- **A PAT must not mint a PAT.** `tokens` POST + `tokens/[id]` DELETE stay UI-session only (see inventory). Deliberate parity exceptions, documented.

---

## Consequences

**Positive**

- The BK-17 401 class of bug is eliminated at the root, system-wide (all ~29 handlers), not patched per-route; BK-17 unblocks as a side effect.
- Implementation cost is **lower than first estimated**: the universal wrapper already exists (`withApiHandler`), so this is an extension + per-handler migration, not new infrastructure scaffolding.
- True UI/API parity, enforced by structure + CI, not by reviewer vigilance.
- One authorization model — same human, same effective permissions regardless of entry method.
- Future routes inherit correct auth via the wrapper default; the cost of getting it wrong moves from "production 401 found in QA" to "build fails locally".

**Negative / cost**

- One-time migration of ~29 cookie-only handlers across 18 files onto the auth-aware wrapper + `Principal`. Mechanical but broad; touches most of `app/api/**`.
- The `me/route.ts` mixed pattern (`:22` requireAuth + `:81` getUser) needs careful untangling.
- New pieces to build/maintain: `Principal`, `resolveIdentity`, the wrapper auth option, the lint rule, the parity harness.
- The exception list (token-mint, invite-accept, public) must be kept honest and reviewed.

**Neutral**

- RLS stays as a data-layer safety net; its role is clarified, not changed.

---

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| **Patch the 4 BK-17 routes only** | Fixes the instance, not the class. Grep proves ~29 handlers are affected; the same bug returns with the next new route. Treats a symptom. |
| **Introduce a brand-new HOF gateway** | Redundant — `withApiHandler` is already universal. Extend it; do not run two wrappers. |
| **Process-only guardrail** (DoD checklist, docs) | Necessary but never sufficient for security. Any defense whose only enforcement is "the developer remembers" has already failed. Kept as layer 0, not the mechanism. |
| **External API gateway / OAuth server / policy engine** (Casbin, OPA) | Over-engineering for a fixed scope catalog and two auth methods. Adds operational complexity without paying rent. |
| **Make cookie sessions carry every scope implicitly** | Hides the authorization model instead of unifying it; pretends a session has scopes it was never granted. Replaced by modelling capabilities once for both methods. |
| **Path A — `SECURITY DEFINER` RPC per route** (authz fork) | Correct and proven (BK-18) but heavy: ~9 new migrations + ~25 handler rewrites moving authz into SQL. Path B reaches the same parity by impersonation with one signed-JWT helper and keeps RLS as the single authz source. Path A stays valid where transactional integrity already demands an RPC (e.g. atcs). |

---

## Follow-ups (post-acceptance — do NOT start until Status = Accepted)

- Implementation plan + per-handler migration order tracked under the relevant PBI ticket, not in this ADR.
- Confirm the parity exception list with product/security (token-mint = yes; invite-accept = verify).
- Decide capability vocabulary for cookie sessions (full set vs derived) when removing the `scopes: []` asymmetry.
