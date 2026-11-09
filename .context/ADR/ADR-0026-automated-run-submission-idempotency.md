# ADR-0026 — Automated run submission: a domain idempotency key in the body

- **Status:** Accepted
- **Date:** 2026-11-09
- **Deciders:** AI Tech Lead of BK-222 under the owner's standing delegation (`decision_authority.product: decide`); idempotency rules ruled by the AI Product Owner on BK-222 (shift-left refinement, 2026-11-09)
- **Tags:** api, idempotency, runs, automation, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-222 adds `POST /api/v1/runs/submissions`, where an automated executor reports a finished Run in one call. Retries are the norm for CI and agents, so the endpoint needs retry safety. ADR-0002 already fixes one contract for mutating endpoints: a required `Idempotency-Key` header (8..128 chars), scoped per user and endpoint, backed by the `idempotency_keys` table.

The product rulings for this endpoint do not fit that contract: the key is optional, 1..64 characters (the SRS cap), scoped per workspace, with a 24 hour window that is measured from the first accepted submission, and a rejected submission must not consume the key.

## Decision

1. The submission endpoint uses an optional **body field `idempotency_key`** (1..64 chars), not the `Idempotency-Key` header, and does not call `lib/api/idempotency.ts`.
2. The key is a **domain key** in the same family as BK-34's `start_token` (`bunkai_create_run`): the database rulebook owns it, inside the RPC transaction. Scope is `(workspace_id, key)`. Storage is `run_submission_keys`, a table written only by the SECURITY DEFINER RPC (RLS on, no policies).
3. Same key and same payload within 24 hours (measured from the key row's `created_at`) returns the original Run with HTTP 200 and `replayed: true`. Same key and a different payload is 409. After the window the key row is overwritten and a new Run is created.
4. Concurrent requests with the same key serialize on a per-(workspace, key) advisory transaction lock, so exactly one Run is created.
5. A rejected submission rolls the whole RPC back, so it never consumes the key.

## Consequences

- **Positive:** the contract matches the PO rulings and the SRS; failures are race-free inside one transaction; no second round trip to a snapshot store.
- **Negative:** ADR-0002's invariant ("never an ad-hoc variant") is departed from for this one endpoint, so clients meet two idempotency shapes in the API (`Idempotency-Key` header on most writes, body key on run submissions). The OpenAPI spec states plainly that the header is not used here.
- **Neutral:** ADR-0002 stays in force for every other endpoint. A future endpoint that wants a domain key should cite this ADR rather than re-deciding.

## Alternatives considered

- **Reuse the header guard (ADR-0002).** Rejected: header required and 8..128 chars (the PO ruled optional, 1..64), scoped per user (ruled per workspace), and it only partly protects a failed request's key.
- **Both header and body key.** Rejected: two sources of truth for one decision; every client must then pick which wins.

## References

- ADR-0002 (Idempotency-Key scoping), ADR-0012 (RPC authorization invariant)
- `supabase/migrations/0121_automated_run_submission.sql`
- BK-222 comments: AI Product Owner "Idempotency key rules", AI Tech Lead "Idempotency key transport"
- `.context/SRS/functional-specs.md` (run input, `idempotency_key` max 64)
