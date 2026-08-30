# ADR-0017 — System/cron principal class for scheduled internal jobs

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-08-27
- **Deciders:** AI Tech Lead (BK-214 implementation worker)
- **Tags:** authentication, api, cross-cutting-invariant, scheduling
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0001 (Unified API Authentication) defines exactly two caller principal classes at the HTTP edge: a cookie session and a Bearer PAT (`bk_pat_*`), both resolved to `auth.uid()`-scoped RLS access via `requireAuth`/`lib/api/principal.ts`. Every route in `app/api/v1/**` authenticates as one of those two.

BK-214 (email digest of unread notifications) needs a scheduled, unattended job that: (a) reads across every user's unread notifications — an inherently cross-tenant, privileged read no single user's session or PAT can authorize; and (b) makes an outbound HTTPS call to Resend's API to send mail. Neither capability fits the two-principal model, and neither can be done without an HTTP entry point: `supabase.list_extensions` confirms `pg_net` and `http` are both "available, not installed," so there is no path from Postgres itself to an outbound HTTPS call (the same constraint migration `0075_run_inactivity_sweep.sql` documented when it rejected a service-role HTTP sweep — that migration solved it by staying zero-egress, which is not an option here).

`.context/SRS/architecture-specs.md` (lines 56, 230) already documents the MVP-era fallback for exactly this job shape: "Vercel cron + serverless functions" invoking a route handler. A scheduler-triggered route handler needs to authenticate as *something* — Vercel Cron supplies no user session and no PAT, only whatever the route itself is configured to check.

## Decision

We will introduce a third principal class, **system/cron**, for internal routes that a scheduler invokes rather than a human or PAT-bearing client. A system/cron route:

1. Lives under `app/api/v1/admin/**`, is never linked from any user-facing UI, and is documented in its OpenAPI entry as internal (`x-internal: true` in the description) rather than part of the public consumer surface.
2. Authenticates by comparing `Authorization: Bearer <token>` (constant-time comparison) against a new, **required** environment variable, `CRON_SECRET`, validated in `lib/env.ts` alongside the other required secrets. Required — not optional like `RESEND_API_KEY` — because an unauthenticated version of this route is a cross-user data-exfiltration path: the cost of boot-failing a deployment that omits it is the correct trade, not a silently-open admin endpoint.
3. Internally uses the existing service-role admin client (`lib/supabase/admin.ts`, already precedented for cross-user batch work by `lib/jira/import-runner.ts`), which intentionally bypasses RLS — because the job's job is to cross user/tenant boundaries — but **re-derives every authorization fact RLS would otherwise have enforced** explicitly in the query layer (current workspace membership, 90-day retention, per-recipient event-type preference), rather than trusting any client-supplied identity or a stale snapshot.
4. Never accepts a cookie session or PAT as an alternative credential, and never proxies a per-user identity through to the service-role client — it always acts as "the system," scoped by its own query logic, never as an impersonated user.
5. Writes an auditable ledger row (`digest_log`, for this story) per attempted recipient, so a scoping mistake is at least observable after the fact even though — unlike an HTTP response to an already-authenticated caller — an email already sent cannot be revoked.

The invariant this ADR establishes: **any future scheduler-triggered route follows this same shape** (system-secret auth, `admin/` path, required env var, service-role client with explicit re-derived authorization, audit ledger) rather than each story inventing its own variant.

## Consequences

- **Positive:** BK-214 (and any future scheduled job — retention purges, digests, sweeps that need egress) has one settled, reusable pattern instead of each story re-deciding cron auth from scratch. The public two-principal model (ADR-0001) stays exactly as documented for every user-facing route; this ADR only adds a third class for a structurally different caller (no user behind the request at all).
- **Negative / trade-offs:** A third principal class is a real increase in the auth surface a future reader must hold in their head — ADR-0001's "every route is one of two things" simplicity no longer covers `admin/` routes without reading this ADR too. A leaked `CRON_SECRET` grants whoever holds it the ability to trigger a cross-user privileged read + external send on demand; unlike a PAT, it is not scoped to one user and cannot be revoked per-recipient (only globally, by rotating the secret).
- **Neutral / follow-ups:** Any later `admin/**` route should point back at this ADR instead of re-deriving cron auth. If a second scheduled job with different risk characteristics arrives, revisit whether one shared `CRON_SECRET` is still adequate or whether per-job secrets/scoping are warranted.

## Alternatives considered

- **In-DB `pg_cron` only** (the 0075 precedent's shape) — infeasible here: `pg_net`/`http` are not installed, so there is no way for a pure-SQL job to reach Resend's HTTPS API. Would require installing a new Postgres extension, a bigger and riskier change than adding one route.
- **Supabase Edge Function on a schedule** — solves the egress problem but introduces a wholly new deployment surface (no Edge Functions exist anywhere in this repo today) for one job, and still needs its own caller-identity answer — the same open question relocated, not resolved.
- **n8n scheduled workflow calling back into the app** — no existing n8n wiring for this domain; adds a second orchestrator and a second credential to operate for a single internal job, worse cost than a Vercel Cron entry the platform already provides.
- **Treat the Vercel Cron invocation as an anonymous/PAT-less "authenticated: false" route** — rejected outright: the route performs a cross-user privileged read; anonymous access to it is the exact risk this ADR exists to close off, not a way to avoid deciding.

## References

- `.context/SRS/architecture-specs.md` (lines 56, 230) — MVP background-job precedent.
- `supabase/migrations/0075_run_inactivity_sweep.sql` — zero-egress in-DB cron precedent and its documented rejection of a service-role HTTP sweep.
- `.context/ADR/ADR-0001-unified-api-authentication.md` — the two-principal model this ADR extends.
- `.context/ADR/ADR-0012-rpc-authorization-invariant.md` — the six-question DEFINER checklist this route's query layer answers by re-deriving RLS-equivalent checks in application code instead.
- Jira BK-214 — "AI Tech Lead — Decision: mail transport, scheduling/principal class, and closing the 2026-08-22 readiness finding" (2026-08-27).

<!--
Authoring notes (delete this comment in the real ADR):
- Filename: ADR-<NNNN>-<kebab-slug>.md  (4-digit number, never reused).
- Add a row to .context/ADR/README.md → Index after creating this file.
- Append-only: once Accepted, do not rewrite the Decision/Consequences. To change course,
  write a NEW ADR that Supersedes this one and flip this file's Status + Superseded-by line.
- Only ADR-worthy decisions belong here: architectural AND hard to reverse. Story-local
  trade-offs stay in the story's implementation-plan.md. See .context/ADR/README.md.
-->
