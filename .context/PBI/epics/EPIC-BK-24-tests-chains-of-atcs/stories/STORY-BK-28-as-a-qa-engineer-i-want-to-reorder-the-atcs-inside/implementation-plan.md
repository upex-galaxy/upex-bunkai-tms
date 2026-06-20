# BK-28 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

## Goal

Let a workspace member reorder the ATC chain inside an existing Test, preserving the exact multiset of chained ATCs. One server-side rulebook (`bunkai*reorder*test_steps` SECURITY DEFINER RPC) consumed identically by the headless `PATCH /api/v1/tests/{id}/reorder` surface and the UI drag-reorder on the BK-32 Test detail page. Optimistic locking, no-op detection, atomic position rewrite, single `test.reordered` activity-log event.

## Key design decisions

- ***Reorder handle = ****`step*id`**** (test*************steps.id), NOT atc*************id.**** The 0025 read RPC already declares `step*id` as "the stable per-row chain handle ... the reorder handle BK-28 will need" (0025:69). A chain may legally hold the same `atc*id` at multiple positions (surrogate PK, no `unique(test*id, atc*id)` — BR-5), so atc*id cannot identify a row. The request body is an ordered array of the test's existing `step*id`s, permuted. This cleanly resolves the AC narrative (written in atc*id terms) against the duplicate-ATC business rule. The activity-log `old*chain`/`new*chain` stay as arrays of ****atc******_******id*** (human-meaningful run order). Flag for PM/glossary in review.
- ***Optimistic locking via ****`version`**** column + ****`X-If-Match`**** custom header***, mirroring the BK-96 ATC precedent. The `tests` table has no `version` today (BK-27 omitted it) — BK-28 adds `version int not null default 1` (the architect clarification said BK-28 owns this migration if BK-27 skips it). Reuse `readVersionPrecondition` (lib/atcs/optimistic-lock.ts) verbatim. Lenient mode: absent header skips the check; version still bumps on real change.
- ***No-op = identical ordered step*************id list*** → RPC returns current composed Test, no version bump, no `updated*at` change (detect BEFORE any UPDATE), no event. Covers same-order submit, single-step Test, and retry-safe double-click (resubmitting an already-applied order is a no-op).
- ***Atomic position rewrite without unique-constraint collision***: two-phase offset inside the RPC (bump all positions by a large offset, then set finals) — no DDL change to the `unique(test*id, position)` constraint, fully contained in the function. Keeps `step*id`s stable (UI keys on them; no delete/reinsert).
- ***Dedicated sub-resource*** `PATCH /api/v1/tests/{id}/reorder` (BR: body is the complete new order, not a diff). Capability gate `atc:write` (same as Test create — the system has no separate `test:write` capability; BK-27 used `atc:write`).
- ***UI is a ratified DERIVATION*** extending the BK-32 read-only detail page (design plan §8 D9/D10 — `TestDetail` mockup is a placeholder; reorder UX explicitly deferred to BK-28). Frozen §2 tokens only. Add `@dnd-kit` (core + sortable + utilities). Viewer role: drag handles absent, no Save.

## ATP → implementation-step coverage (12 scenarios)

| # | ATP scenario | Covered by step |
| --- | --- | --- |
| 1 | Successful reorder (200, v2, positions, event) | 1,2,3,4 |
| 2 | Reorder persists across reads | 1 (getTestExpanded returns new order+version) |
| 3 | No-op same order (no bump/event/updated_at) | 1 |
| 4 | Single-ATC no-op | 1 |
| 5 | Unauthenticated rejected (401) | 4 (withApiHandler auth) |
| 6 | Viewer forbidden (403) | 1 (write-gate), 7 (UI hides affordance) |
| 7 | Version conflict (409 + current*chain + current*version) | 1,4 |
| 8 | Chain mismatch (422 chain_mismatch, missing/extra) | 3,4 |
| 9 | Duplicate step ids rejected (422 chain_invalid) | 3 |
| 10 | Empty chain rejected (422 chain_invalid) | 3 |
| 11 | Activity log captures reorder event | 1 |
| 12 | Retry-safe double-click no-op | 1,4 |

## Implementation steps

### Step 1 — Migration `0026*tests*reorder.sql` (DB rulebook)

- `alter table public.tests add column version int not null default 1;`
- Add defence-in-depth RLS UPDATE policies (member+): `tests*update*workspace*role*member*plus` and `test*steps*update*workspace*role*member_plus` (parent-workspace write gate; the RPC is DEFINER so it bypasses RLS, but parity with the INSERT policies keeps direct-write closed to viewers).
- `create or replace function public.bunkai*test*json` — add `'version', t.version` to the header (so the read path exposes the lock token).
- New RPC `bunkai*reorder*test*steps(p*actor*user*id uuid, p*test*id uuid, p*if*match int, p*step*ids uuid[]) returns jsonb`, SECURITY DEFINER, `search_path = ''`:
- ***verify******:*** migration applies clean against the local Supabase project (db*project*ref `fmbpikzpkafptqximhxn`); `bun run types:gen` regenerates `lib/types/supabase.ts` with the new RPC + `version`.

### Step 2 — RPC wrapper + types (`lib/supabase/rpc.ts`)

- `reorderTestSteps(supabase, {actorUserId, testId, ifMatch, stepIds})` → `supabase.rpc('bunkai*reorder*test*steps', {p*actor*user*id, p*test*id, p*if*match, p*step*ids})`. Mirror `updateAtc` null-handling for `p*if*match`.
- ***verify******:*** `bun run types:check` clean.

### Step 3 — Validation + error mapping

- `lib/api/error-envelope.ts`: add `CHAIN*MISMATCH: 'chain*mismatch'` (422), `CHAIN*INVALID: 'chain*invalid'` (422) to `API*ERROR*CODES` + `DEFAULT_STATUS`. Add both to `lib/openapi/registry.ts` `ApiErrorCodeSchema` enum.
- `lib/tests/validation.ts`: `TestReorderBodySchema = z.object({ step*ids: z.array(z.string().uuid()).min(1) })` with `.superRefine` for duplicate step*ids → issue mapped to `chain_invalid`. Helper `chainDiff(current: string[], submitted: string[]) → {missing, extra}` for the friendly 422 body.
- `lib/tests/errors.ts`: `mapTestReorderError` (or extend `mapTestRpcError`) for 45123 → `chain*mismatch`, 45124 → `chain*invalid`, 45125 → `conflict` (parse `version*conflict:<v>` → details.current*version), keep 42501/P0002.
- ***verify******:*** `bun run types:check`.

### Step 4 — API route `app/api/v1/tests/[id]/reorder/route.ts` (PATCH) + OpenAPI

- `withApiHandler(..., {auth:'required', requires:['atc:write']})`. Extract+validate `{id}` uuid (bad_request else). `getAuth(ctx)`.
- Parse body → `TestReorderBodySchema` (empty/dup → chain*invalid). `readVersionPrecondition(headers)` → bad*request if `!ok`.
- Fetch current expanded Test via `getTestExpanded` (admin client) → map P0002→404; derive current ordered `step*id`s + `version`. `chainDiff` → if mismatch throw `chain*mismatch` with `details:{missing,extra}`.
- Call `reorderTestSteps`. On error `mapTestReorderError`; on `conflict` enrich body with `current*chain` (atc*id order) + `current_version` from the already-fetched current Test (no extra round-trip).
- Return `{test: data}` 200.
- `route.openapi.ts`: register `patch /api/v1/tests/{id}/reorder` (cookie+bearer security, `X-If-Match` header param, body schema, 200/400/401/403/404/409/422 envelopes). Add side-effect import to `scripts/openapi-gen.ts`. Run `bun run openapi:gen`.
- ***verify******:*** `bun run types:check`; `bun run openapi:gen` regenerates `public/openapi.json` clean.

### Step 5 — UI drag-reorder on the BK-32 detail page

- `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
- Page `app/(app)/projects/[projectSlug]/tests/[testId]/page.tsx`: resolve actor workspace role; pass `canReorder` (member/admin/owner) to the view. Expose `version` from the expanded payload.
- New client component `components/tests/TestReorderClient.tsx`: dnd-kit `SortableContext` over the chain (keyed on `step*id`), drag handle on each `ChainedAtcCard` (handle hidden when `!canReorder`), local optimistic order, dirty-state Save/Cancel bar. On Save → `PATCH .../reorder` with `X-If-Match: <version>` body `{step*ids:[...]}`; on 200 refresh (router.refresh) ; on 409 open conflict modal showing current order + "Reload" (discard mine) / dismiss; on 422/403 toast (sonner). No-op submit → silently resolves (200, no change).
- Keep `TestDetailView` the read-only path; render `TestReorderClient` only when `canReorder`. Frozen §2 tokens, `data-testid` per data-testid-standards (e.g. `test-reorder-save`, `test-reorder-handle`, `test-reorder-conflict-modal`).
- ***verify******:*** localhost:3000 via Playwright MCP — drag, save, reload persists, viewer sees no handles; `bun run lint:check` + `types:check`.

### Step 6 — Env-gated integration test

- `lib/tests/reorder.test.ts` mirroring the BK-32 `read-isolation.test.ts` harness (env-gated, real Supabase): successful reorder (version 1→2, event row, positions), no-op same order (no bump/event), single-step no-op, version conflict (X-If-Match stale → 409 + current*version), chain*mismatch, chain_invalid (dup + empty), viewer 403, unauth 401, retry-safe double-click (one event total).
- ***verify******:*** `bun run test` (or the env-gated path) green; final parallel gate tests + types + lint.

## Technical decisions (story-local, not ADR)

- Reorder-by-step_id contract (see Key design decisions). Reversible internal API shape pre-MVP; record here, promote to ADR only if a second reorder-style endpoint emerges.
- Two-phase position offset over making `unique(test_id, position)` deferrable — avoids DDL on an existing constraint; behavior identical, blast radius smaller.
- Error codes 45123/45124/45125 follow the tests-domain 451xx block (BK-27 used 45120-45122).

## Out of scope (per story)

Add/remove ATCs (BK-27), Test metadata edit, runs/exec order, activity-log VIEWING UI, undo/rollback, bulk reorder, diff visualization, live teammate notification.

## Review Workload Forecast

Estimated: ~900 additions + ~30 deletions = ~930 total lines (≈40% generated openapi/supabase-types + env-gated test harness; net hand-reviewed logic ≈400).
400-line budget risk: High
Chain strategy: size-exception — one cohesive vertical slice (migration → RPC → route → UI → test) on `feature/BK-28-reorder-atcs`; splitting backend/UI would ship a dead endpoint. Justified by generated-code + test share.
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
