# BK-181 — Root-cause + fix analysis

**Bug:** On the email-verification screen of the signup flow (BK-166), the "Request a new code" control calls `POST /api/v1/auth/signup` again instead of a resend endpoint. This fails with HTTP 422, and the raw backend validation message is rendered verbatim in the UI alert instead of a friendly resend confirmation.

---

## Root cause (verified against current code, not the 5-week-old report alone)

`resendCode()` in `app/(auth)/login/email-first-form.tsx` (BK-166's email-first flow) re-posts `{ email, password }` to `POST /api/v1/auth/signup`, reusing signup's own Zod schema (`app/api/v1/auth/signup/route.ts`):

```ts
const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
```

Resend has no legitimate need for a password — the account already exists and is only waiting on email confirmation. Reusing `/signup`'s schema meant any path into the verify step where `password` React state was not a valid 8+ char string (e.g. the sign-in → 401-unconfirmed branch, or any future refactor that clears `password` on step transition) would fail `BodySchema.parse` **before ever reaching Supabase**. `lib/api/handler.ts`'s generic `toApiError` maps that `ZodError` to:

```json
{ "error": { "code": "validation_failed", "message": "Request body failed validation.", "details": [...] } }
```

`resendCode()`'s catch-all (`body?.error?.message ?? ...`) then rendered that raw envelope message verbatim in the UI alert — exactly the network log captured in the bug report (`422`, `path:["password"]`, `"Request body failed validation."`).

Confirmed this is still live on `origin/staging` as of this fix (not something already resolved by a later BK-166 commit): the resend call and the shared `password` field both still exist unchanged in the current `email-first-form.tsx`.

## Fix

Eliminate the shared failure surface structurally rather than re-wrapping the error message:

1. **New endpoint** `POST /api/v1/auth/resend` (`app/api/v1/auth/resend/route.ts`), Zod schema `{ email }` only — no password field exists to fail validation on. Calls `supabase.auth.resend({ type: 'signup', email })`, which re-sends the pending confirmation OTP without touching the password or re-provisioning the account. Errors are mapped by HTTP status only (never forwarding the raw upstream/Zod message), mirroring `signup`/`confirm`'s existing stance.
2. **Frontend** `resendCode()` now posts `{ email: normalizedEmail }` to `/api/v1/auth/resend` and shows a static friendly message on both success (`"A new code has been sent to your email."`) and failure — the raw-message passthrough that leaked the bug is removed entirely for this path, not just re-wrapped.
3. OpenAPI registration (`route.openapi.ts` + `scripts/openapi-gen.ts` + regenerated `public/openapi.json`) so the new endpoint is documented like every other auth route.

## Verification

- New regression test `app/api/v1/auth/resend/route.test.ts` calls the real exported `POST` handler (only `next/headers`'s `cookies()` is shimmed — a Next.js request-scoping primitive with no meaning in `bun:test`, same class of shim `lib/api/auth-coexistence.test.ts` already uses) against a real Supabase Auth call: seeds a real pending/unconfirmed account, sends the exact email-only body the fixed frontend now sends, asserts `202` (not `422`) and no `validation_failed` envelope.
- `types:check` / `lint:check` / `format:check` clean; full `bun test` run: 1041 pass, 2 pre-existing failures in `lib/atcs/search-isolation.test.ts` (BK-20 full-text search isolation — unrelated domain, confirmed to fail identically with this PR's changes stashed out against a clean `origin/staging` checkout).
- Independent adversarial review (fresh-context subagent, no stake in the implementation): no BLOCKER/MAJOR/MINOR/NIT findings. Verified empirically that the new route does not introduce an enumeration gap (pending/confirmed/nonexistent emails all return the same `202`, no worse than `signup`'s own 409-on-conflict stance).

## Out of scope (noted, not actioned)

The generic `ZodError → "Request body failed validation."` raw-message pattern lives in the shared `lib/api/handler.ts` used by every `app/api/*` route, not just auth. A malformed (not merely missing-password) request to any route still surfaces that generic message. Fixing that app-wide is a separate, larger-blast-radius change than BK-181's literal scope (the resend control leaking a *password* validation message) and is not touched here — flagged for a follow-up ticket if the product wants friendlier validation messages everywhere.
