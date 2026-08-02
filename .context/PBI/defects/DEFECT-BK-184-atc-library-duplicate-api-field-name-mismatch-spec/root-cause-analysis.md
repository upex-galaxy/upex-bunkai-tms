# BK-184 — Root-cause + fix analysis

**Defect:** `POST /api/v1/atcs/{source_id}/duplicate` with body `{"new_title":"Custom Title"}` returns HTTP 201, but the created ATC keeps the default `"{source} (copy)"` title — the `new_title` field is silently ignored, with no error signal.

---

## Root cause (verified against current code on `origin/staging`, not the 5-week-old report alone)

FR-014 (`.context/SRS/functional-specs.md`) documents the duplicate endpoint's optional request field as `new_title`:

> **{{PROJECT_KEY}}-014 — ATC duplicate** — Input: `source_atc_id`, optional `new_title`.

BK-23's acceptance criteria (`acceptance-criteria.md`, scenario "Provide a custom title for the duplicate") pin the same expectation. The implementation, however, read a *different*, undocumented field name — `title` — at every HTTP-boundary layer:

| Layer | Field name used (before fix) | Location |
| --- | --- | --- |
| Request validation | `title` | `lib/atcs/validation.ts` (`AtcDuplicateBodySchema`) |
| Route handler | `title` | `app/api/v1/atcs/[id]/duplicate/route.ts` |
| OpenAPI schema | `title` | `app/api/v1/atcs/[id]/duplicate/route.openapi.ts` |

A client sending `{"new_title": "..."}` per the documented spec parsed successfully against the Zod schema (unknown keys are dropped by default, not rejected), so the request never errored — it just always fell through to the RPC's own default-title branch (`coalesce(p_title, v_src_title || ' (copy)')`), silently discarding the caller's intended title.

This was flagged as internally consistent-but-spec-diverging by an earlier investigation comment (2026-06-30) and left open pending a PO/spec decision ("Option A: update the spec to `title`" vs "Option B: rename the implementation to `new_title`"). A later dev hand-off comment (2026-07-13) resolves this explicitly: *"the agreed spec ... defines the optional body field as `new_title` ... align the API field name with the spec"* — i.e. the spec is the agreed source of truth and the implementation had drifted, not the reverse. This fix implements that already-agreed direction (Option B); no new product/business call was made here.

The DB RPC's own parameter name (`p_title` in `supabase/migrations/0028_atc_duplicate.sql`) is an internal implementation detail of a `SECURITY DEFINER` function, not part of the public HTTP contract FR-014 documents — it is left unchanged. No schema migration was required for this fix.

## Fix

Renamed the public request field from `title` to `new_title` at every layer that defines the HTTP contract:

1. `lib/atcs/validation.ts` — `AtcDuplicateBodySchema` now declares `new_title` (same 3–200 length rule as before).
2. `app/api/v1/atcs/[id]/duplicate/route.ts` — reads `AtcDuplicateBodySchema.parse(parsed).new_title` before passing it into the existing `duplicateAtc()` RPC wrapper (whose own `title` parameter name is a local/internal detail, unaffected).
3. `app/api/v1/atcs/[id]/duplicate/route.openapi.ts` — `DuplicateBodySchema` renamed to `new_title`; `public/openapi.json` regenerated via `bun run openapi:gen`.

A request omitting `new_title` (or an empty body) is unaffected — it still defaults to `<source> (copy)`, per FR-014 and AC2.

## Verification

- New regression test `app/api/v1/atcs/[id]/duplicate/route.test.ts` calls the real exported `POST` handler end-to-end (real Bearer PAT minted via `mintPat`, real Zod schema, real `bunkai_duplicate_atc` RPC through the admin client — the exact path the route uses in production) against a real Supabase-backed dev DB: asserts a supplied `new_title` wins outright, and that omitting it still defaults to `<source> (copy)`.
- Updated `lib/atcs/duplicate-validation.test.ts` (schema unit coverage) to reference `new_title`; added a case proving a stale `title` key is now silently ignored rather than mistakenly accepted.
- `lib/atcs/duplicate-rpc.test.ts` (DB RPC layer) and `lib/atcs/duplicate-client.test.ts` (browser client — always posts `{}`, never sets a title) needed no changes; both still pass unmodified.
- `types:check` / `lint:check` clean; full `bun test` run: 1093 pass, 2 pre-existing failures in `lib/atcs/search-isolation.test.ts` (BK-20 full-text search isolation — unrelated domain, confirmed to fail identically with this PR's changes stashed out against a clean `origin/staging` checkout).

## Out of scope (noted, not actioned)

Neither ATC "Duplicate" UI entry point (explorer context menu, ATC detail toolbar — both from BK-185) currently offers a way to type a custom title; `lib/atcs/duplicate-client.ts` always POSTs `{}`. This fix corrects the backend contract per FR-014/AC3 so a `new_title`-aware client works correctly, but does not add a title-prompt UI — that is a separate UI scope, not implied by BK-184's report.
