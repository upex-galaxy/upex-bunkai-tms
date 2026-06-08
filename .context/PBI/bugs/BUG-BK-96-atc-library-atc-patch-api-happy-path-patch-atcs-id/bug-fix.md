# BK-96 — Root-cause + fix analysis

**Bug:** `PATCH /api/v1/atcs/{id}` with the correct `If-Match: <current-version>` returns **HTTP 412 PRECONDITION_FAILED** (non-JSON Vercel platform page) instead of **200**, even though the update commits in full server-side.

---

## Root cause (PROVEN — not hypothesis)

The 412 is synthesized by the **Vercel Edge Network**, not by the application or Next.js. The Vercel edge evaluates the RFC 7232 `If-Match` conditional request header itself and short-circuits a non-matching precondition into a `412 PRECONDITION_FAILED` platform error page — **discarding the origin function's response**. The origin function still executes first, so the ATC mutation commits (version 1→2, steps cascade-replaced, assertions cleared, `atc.updated` logged), but the client only ever sees the edge's 412.

The application is structurally incapable of producing this 412:
- Repo-wide grep for `412` / `precondition` / `etag` → **zero** hits in `app/`, `lib/`, `supabase/`. Version conflict is modeled as **409** only (`lib/atcs/errors.ts` maps SQLSTATE `45022` → `conflict` → 409 in `lib/api/error-envelope.ts`).
- The optimistic lock lives in the Postgres RPC `bunkai_update_atc` (`supabase/migrations/0021_atc_create_update.sql:290-292`): matching version → commit + 200; stale → `raise … version_conflict` → 409.
- `app/api/v1/atcs/[id]/route.ts:78` returns `jsonResponse({ atc }, { status: 200 })` on success and never sets an ETag.
- Every app response is JSON via `NextResponse.json` and carries `x-request-id`. The observed 412 is `text/plain`, carries `x-vercel-error: PRECONDITION_FAILED`, and has **no** `x-request-id` → it is a platform response, not an app response.

### Decisive experiment (run against staging `https://staging-upexbunkai.vercel.app`, read-only)

| Request | Status | Content-Type | Telltale headers |
|---|---|---|---|
| `GET /api/v1/health` (no header) | `200` | `application/json` | `x-request-id` present (app) |
| `GET /api/v1/health` + `If-Match: 1` | `412` | `text/plain` | `x-vercel-error: PRECONDITION_FAILED`, **no** `x-request-id` |
| `GET /api/v1/health` + `If-Match: *` | `200` | `application/json` | RFC 7232 wildcard matches (resource exists) |
| `GET /api/v1/health` + `X-If-Match: 1` | `200` | `application/json` | custom header **ignored** by edge; app responds |

`health` is a public, no-auth, no-body, plain-GET endpoint that just returns `{ok:true}` — yet `If-Match: 1` alone turns it into a 412. This isolates the trigger to the **Vercel edge + the literal `If-Match` header**, fully independent of the ATC route. `If-Match: *` → 200 while `If-Match: 1` → 412 confirms standard RFC 7232 evaluation. The `health` 200 carries **no origin ETag**, yet `If-Match: 1` still 412s → the edge owns the header and the app cannot satisfy/reclaim it on Vercel.

### Why the stale (2nd) call still returned 409 (reconciliation)
The edge applies its conditional rewrite to cacheable 2xx representations; the app's **409 error** response is not subject to the rewrite, so it passes through to the client. Hence call 1 (matching → app 200 → edge rewrites to 412) vs call 2 (stale → app 409 → passes through). Both observations are consistent with a single edge-level `If-Match` evaluation.

---

## Fix direction (reliable, evidence-backed)

Move the optimistic-concurrency version token **off** the reserved RFC 7232 `If-Match` header onto a custom header the Vercel edge does not interpret (confirmed: `X-If-Match` reaches the app and returns 200). The server-side optimistic lock (Postgres RPC) stays exactly as-is — only the transport header name changes.

Rejected alternatives:
- **Echo a matching `ETag`** — `health` 200 has no ETag yet still 412s on `If-Match: 1`; and `If-Match: 1` asserts the *old* tag while the response represents the *new* version → semantically incoherent, and depends on undocumented edge ETag-matching.
- **`force-dynamic` / `Cache-Control: no-store`** — `/api/v1` already uses `force-dynamic` and still emits `public, max-age=0, must-revalidate`; does not target the conditional path. Insufficient alone.
- **Strip `If-Match` in middleware** — the edge evaluates the inbound header before/independently of the function; stripping server-side cannot stop it.
- **`generateEtags: false`** — documented for HTML pages only; the app emits no ETag anyway. No-op for this bug.

Scope: `app/api/v1/atcs/[id]/route.ts` (read the custom header) + `app/api/v1/atcs/[id]/route.openapi.ts` (document the canonical header). Add a route-level test (none exists today; the bug is invisible to the current pure-unit helper tests and does not reproduce on local `next dev`).

> Pending user decision: exact custom header name; whether to keep `If-Match` as a server-side fallback (harmless on the Phase-2 self-hosted edition that has no Vercel edge); whether to record an ADR ("never use RFC 7232 conditional headers on the Vercel edge — use a custom header for optimistic concurrency").
