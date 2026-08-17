# BK-497 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

- Every API route handler across `app/api` declares its authentication/capability posture explicitly; a handler that omits a posture fails to compile.
- All 87 exported handlers across 68 route files migrate to the new posture-declaring shape.
- `AccessTokenScope` (`lib/api/pat.ts:12`) is consolidated into `ALL_CAPABILITIES` (`lib/api/principal.ts:31`).
- The hand-rolled bearer rejection currently in `app/api/v1/tokens/route.ts:36` and `app/api/v1/tokens/[id]/route.ts:21` is lifted into the gateway as a first-class `cookie-only` posture.
- `GET /api/v1/tokens` (`app/api/v1/tokens/route.ts:111`) is given a declared no-capability posture carrying its existing justification ("Listing is read-only and RLS-scoped to the caller's own tokens") — not the `cookie-only` lift.
- A coverage check enumerates every handler and its posture, fails when a new route appears without one, and explicitly enumerates the two gateway bypassers (`app/api/openapi/route.ts:18` and `app/api/v1/route.ts:21`) so the check cannot claim false completeness.
- No behaviour change: every existing gate stays green.
- No database migration.

---
_Synced from Jira by sync-jira-issues_
