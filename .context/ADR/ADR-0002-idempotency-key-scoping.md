# ADR-0002 — Idempotency-Key Scoping for the Headless Write Surface

- **Status:** Proposed
- **Date:** 2026-06-12
- **Deciders:** Project architect (pending acceptance) · drafted by `/sprint-development` Stage 1 (BK-27)
- **Tags:** api, idempotency, headless-surface, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Bunkai's headless surface (PAT-authenticated agents, CI clients) and the UI submit writes through the same `/api/v1/*` routes (ADR-0001). Network retries and double-submits must not create duplicate entities. The plumbing has existed since migration `0009_cross_cutting.sql` (`idempotency_keys` table: `unique(user_id, endpoint, key)`, SHA-256 payload hash, 24h TTL) and `lib/api/idempotency.ts` (`beginIdempotentRequest` / `recordIdempotencyResult` / `discardIdempotencyResult`), but **no handler consumed it** until BK-27 (`POST /api/v1/tests`). The first consumer sets a repo-wide precedent agents will depend on — wrong scoping is hard to reverse once external clients encode it.

## Decision

We will scope idempotency exactly as the 0009 schema defines it, with no new semantics:

1. **Key scope = `(user_id, endpoint, key)`.** Two different users (or the same user on two different endpoints) reusing the same key never collide. Race-condition-safe via the unique constraint.
2. **The `Idempotency-Key` header is REQUIRED** on every mutating endpoint that adopts idempotency (`idempotency_key_required` → 400 when absent). The UI auto-generates one UUID per form session (`crypto.randomUUID()`); agents must supply their own retry-safe identifier.
3. **Window = the table's 24h TTL.** Within it, an identical replay (same key + same SHA-256 payload hash) returns the stored response snapshot with its stored status code — no second write.
4. **Same key + different payload → 409 `conflict`.** A key identifies one logical request, not a session.
5. **`pending` / `failed` rows do not block retries** with the same key + hash (the helper lets the journey continue); handlers must `discardIdempotencyResult` on post-begin failure so retries can succeed.
6. **Server-derived fallback keys for header-less clients are explicitly deferred** — that would change the shared helper's contract for all consumers and needs its own ADR (or a supersession of this one).

Invariant: any new mutating `/api/v1/*` endpoint that needs retry safety adopts this exact contract — never an ad-hoc variant.

## Consequences

- **Positive:** double-submit (UI) and agent retry (headless) collapse to one row by construction; the contract is uniform across endpoints, so client SDKs and agents implement it once; everything reuses already-built, already-migrated plumbing (zero new schema).
- **Negative / trade-offs:** the header is mandatory — naive curl calls to adopting endpoints get a 400 until the caller supplies a key; replay snapshots return stale-but-correct bodies (by design); 24h TTL means a replay after 25h creates a second entity (accepted — matches payment-industry norms).
- **Neutral / follow-ups:** first consumer is `POST /api/v1/tests` (BK-27 Step 6); future write endpoints (Runs, Bugs) adopt the same wiring; revisit the deferred fallback-key question if header-less clients materialize.

## Alternatives considered

- **Workspace-scoped keys `(workspace_id, endpoint, key)`** — rejected: a user retrying across a mid-flight workspace switch could collide with another member's key; user scoping matches who actually retries (the caller), and the QA shift-left analysis recommended user scoping for race safety.
- **Optional header with server-derived fallback (hash of payload as implicit key)** — rejected for now: silently dedupes legitimately identical-but-distinct submissions (two intentional Tests with the same title/chain) and changes the shared helper for every future consumer. Deferred, not discarded.
- **Client-side-only double-submit protection (disable button while pending)** — rejected as the sole mechanism: does nothing for headless retries, network-level replays, or multi-tab submits. Kept as UX belt-and-braces on top.

## References

- `supabase/migrations/0009_cross_cutting.sql` — `idempotency_keys` table (scope, hash, TTL)
- `lib/api/idempotency.ts` — helper contract (begin / record / discard, 409 on payload mismatch)
- ADR-0001 — Unified API Authentication (the surface this contract rides on)
- BK-27 implementation plan, `## Technical Decisions` #3 (Jira `spec_implementation_plan` field / synced `implementation-plan.md`)
