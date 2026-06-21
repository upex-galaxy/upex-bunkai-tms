# BK-20 — Spec Implementation Plan (Dev)

> Story: **TMS-ATC Search | Search and autocomplete ATCs** · Epic [BK-13](https://jira.upexgalaxy.com/browse/BK-13) · 5 pts · FR-011
> Source of truth: this file is materialized from the Jira `spec_implementation_plan` field. Hand-edits should be pushed back to Jira.

## Goal

Deliver workspace-scoped full-text search + autocomplete over ATCs (match on **title** and **tags**), ranked by relevance with a recency tie-break, optionally narrowed by Module subtree and/or layer — exposed as a `GET /api/v1/atcs/search` endpoint **and** wired into the Projects toolbar as an inline filter/autocomplete (the §4.3 "inline filter box" gap, `screens/project.jsx`).

Two halves: a **backend search half** (the ATP's 21 outlines — API + RPC + ranking + isolation) and a **UI fidelity half** (Projects toolbar inline filter, master-design-plan §4.3 row "Toolbar · Inline filter box"). Both ship in this story.

---

## Key discoveries (ground truth — read before coding)

1. **The FTS infrastructure already exists.** `supabase/migrations/0004_atcs.sql` already adds `atcs.tsv tsvector`, the GIN index `atcs_tsv_gin_idx`, and the `atcs_refresh_tsv` trigger (`before insert or update of title, tags`). The `atcs_set_updated_at` trigger and `updated_at NOT NULL DEFAULT now()` also already exist. **→ No new tsvector/trigger migration is required.** The ATP line "BK-20 adds its own `search_tsv` migration" is already satisfied by 0004.
   - **Divergence from ATP:** 0004 uses `to_tsvector('english', …)`, not the `'simple'` config the ATP assumed. Decision: **keep `'english'`** (the indexed column is fixed; re-indexing is out of scope and a backend refactor). The search RPC's `to_tsquery`/`plainto_tsquery` MUST use the **same `'english'` regconfig** to stay index-compatible. See Risk R1.
2. **No GET/search handler exists** under `app/api/v1/atcs/` — only `POST` (BK-18). This is a new route file.
3. **Established backend pattern** (BK-18): API routes use `withApiHandler` + `getAuth(ctx)` + a Zod schema + a **SECURITY DEFINER RPC** invoked through `createAdminClient()` (`lib/supabase/rpc.ts` wrappers like `createAtc`/`getAtc` calling `bunkai_*` functions with an explicit `p_actor_user_id`). Workspace isolation is enforced **inside** the RPC (admin client bypasses RLS by design). The search RPC follows this exact contract.
4. **Test runner is `bun:test`** (native), tests colocated as `lib/**/*.test.ts` (e.g. `lib/atcs/sanitize.test.ts`). No vitest/jest.
5. **Projects toolbar** lives in `app/(app)/projects/[projectSlug]/project-shell.tsx` (the `Topbar` `center`/`right` slots). View toggle + CommandPalette + New buttons exist; **no inline filter input**. Base input atom is `components/ui/input.tsx`. There is **no debounce/combobox primitive yet** — one will be added minimally. The Table view renders `components/atcs/AtcTable.tsx`.

---

## Acceptance-Criteria → file/approach map

| AC / scenario | Files touched | Approach |
|---|---|---|
| **AC1** Find by title word (S1.1–S1.3) | `supabase/migrations/00XX_atc_search_rpc.sql` (new RPC), `app/api/v1/atcs/search/route.ts` (new), `lib/supabase/rpc.ts` (+`searchAtcs` wrapper) | New `bunkai_search_atcs` SECURITY DEFINER fn: `to_tsquery('english', $token || ':*')` (single token, prefix-aware) `@@ tsv`; returns `atc_id, slug, title, module_path, layer, status`. |
| **AC2** Find by tag (S2.1–S2.2) | same as AC1 | Tags are already flattened into `tsv` by the 0004 trigger, so tag matches fall out of the same `@@` query (weight inherited from the trigger's vector). No extra clause. |
| **AC3** Module subtree filter (S3.1–S3.2) | search RPC, `route.ts` (zod `module_id` opt) | Recursive CTE over `modules` (parent_id) from `module_id` → set of descendant module ids; `WHERE atcs.module_id = ANY(subtree)` when provided. Siblings excluded. Non-existent `module_id` → empty set → `{items: []}` (no 404). |
| **AC4** Recency ranking (S4.1–S4.2) | search RPC | `ORDER BY ts_rank(tsv, query) * exp(-extract(epoch from (now() - updated_at)) / 604800) DESC` — relevance × 7-day decay. Equal relevance → newer `updated_at` wins. |
| **AC5** Empty query → no search (S5.1–S5.3) | `route.ts` (zod), Projects filter component | Zod: `query` required, `.trim().min(1)`; empty / absent / whitespace-only → `400 validation_failed` (reuse `withApiHandler` ZodError→envelope mapping). UI: empty input performs **no request** and shows nothing. |
| **AC6** Workspace isolation (S6.1–S6.2) | search RPC | RPC takes `p_actor_user_id`; joins `atcs→projects→workspace_members` filtered to the actor's `active` membership (mirrors the 0004 RLS SELECT policy). Any `workspace_id` request param is **ignored** — scope derives from the session principal only. Verified at DB + API. |
| **SG1** Unauth → 401 | `route.ts` | `withApiHandler(…, { auth: 'required', requires: ['atc:read'] })` — `requireAuth` cookie OR Bearer PAT (same gate as POST). |
| **SG2/SG3** limit default 20 / cap 50 | `route.ts` (zod) | `limit: z.coerce.number().int().min(1).max(50).default(20)`; `>50` clamps to 50. (`limit=0` open item → resolve to 400 per validation `.min(1)`; see Open Items.) |
| **SG4** layer filter (`?layer=UI`) | `route.ts` (zod), search RPC | `layer: z.enum(['UI','API','Unit']).optional()` (reuse `ATC_LAYERS`); RPC adds `AND ($layer IS NULL OR layer = $layer)`. Invalid enum → 400. |
| **SG5** zero matches → `200 {items: []}` | search RPC, `route.ts` | No match returns empty array, never 404. |
| **AC (design fidelity)** Projects toolbar inline filter | `project-shell.tsx` (+ new `atc-search-filter.tsx`), `components/ui/input.tsx` (reuse) | Inline filter/autocomplete in the toolbar `right` slot: type → debounced call to `GET /atcs/search?query=&module_id=<current>` → dropdown of matches (slug + title + layer chip) → navigate to ATC on select. Reuses frozen §2 tokens only. See "Screen fidelity". |

> **Multi-word queries:** single-token input uses `to_tsquery('english', tok || ':*')` (prefix-aware autocomplete); multi-word input uses `plainto_tsquery('english', $query)` (AND semantics, no prefix) per the PO decision. The RPC branches on token count.

---

## Screen fidelity (master-design-plan §4.3 — Projects, `screens/project.jsx`)

BK-20 realizes exactly one §4.3 toolbar row, currently `🔶`:

> **Toolbar · Inline filter box (name/ATC ID/tag)** — "replaced by CommandPalette → add inline filter".

- **What we build:** an inline filter input in the Projects `Topbar` (`project-shell.tsx`, between view-toggle and the New buttons, or in the `right` slot). Typing narrows the visible ATCs / shows an autocomplete dropdown of matches; selecting one opens it (existing `/atcs/{id}` route or a workbench tab). Matches the mockup toolbar filter affordance — **not** the ⌘K CommandPalette (that stays a separate stub for global jump).
- **Frozen §2 tokens reused (no new visual decisions):**
  - Surfaces `bg-surface-1/2/3`, strokes `border-stroke-1`, text `fg-0..3` — exactly as the existing view-toggle in `project-shell.tsx`.
  - Base input atom `components/ui/input.tsx` (already `bg-surface-2`, `focus:accent` ring) — reuse, do not restyle.
  - **Layer chips** in dropdown rows reuse the canonical `.layer-chip` colors (UI `#8b6df0` · API `#4f8cf7` · Unit `#2fb673`) and the `AtcTable` chip render.
  - Status dot reuses the `.dot` signal palette. Radii `rounded-1/2` (3/5px). Mono (JetBrains) for the ATC slug/ID per §2 Fonts.
- **No UI invented:** dropdown anatomy (slug + title + layer chip + status dot per row) mirrors `AtcTable.tsx` row composition. No new color/radius/font tokens. If any affordance is missing from the mockup, it is ratified in §5 before coding (none expected — the filter box is explicitly specced in §4.3).
- **Principle (Critical Rule #15):** maximize fidelity WITHOUT backend refactors. The search half is additive (new endpoint + new RPC); the existing `tsv` column/trigger/index are untouched.

---

## Implementation steps (ordered, with verify)

1. **DB — search RPC migration** `supabase/migrations/00XX_atc_search_rpc.sql`: `bunkai_search_atcs(p_actor_user_id, p_query, p_module_id, p_layer, p_limit)` SECURITY DEFINER, `set search_path = ''`. Recursive module CTE, workspace-scoped join, prefix/`plainto` branch, recency-decayed ranking, `LIMIT`. _verify:_ `supabase db reset` (local) or `execute_sql` smoke; `EXPLAIN ANALYZE` shows GIN index use.
2. **lib wrapper** `lib/supabase/rpc.ts` → add `searchAtcs(supabase, args)` mirroring `getAtc`. _verify:_ `bun run types:check` clean.
3. **Validation schema** `lib/atcs/search-validation.ts` (or extend `lib/atcs/validation.ts`): `AtcSearchQuerySchema` (query req `.trim().min(1)`, module_id uuid opt, layer enum opt, limit 1–50 default 20). _verify:_ unit test green.
4. **Route** `app/api/v1/atcs/search/route.ts` (+ `route.openapi.ts`): `GET` via `withApiHandler({auth:'required', requires:['atc:read']})`, parse `request.nextUrl.searchParams` through the schema, call `searchAtcs`, return `{ items }`. _verify:_ route handler unit test green; manual `curl` 200/400/401.
5. **OpenAPI sync** — author `route.openapi.ts`, run `bun run api:sync`. _verify:_ `bun run openapi:diff` clean / regenerated types compile.
6. **UI — inline filter** `app/(app)/projects/[projectSlug]/atc-search-filter.tsx` (new client component) + mount in `project-shell.tsx`: debounced (`useDeferredValue` or a tiny `useDebouncedValue` hook) input → fetch `/api/v1/atcs/search` scoped to the active `projectId`/`module_id` → autocomplete dropdown (reuse `Input` + `AtcTable` row anatomy) → select navigates. Empty input = no fetch. _verify:_ `bun run dev` visual check on `/projects/{slug}`; tokens match §2.
7. **Verification gate (parallel cap=3):** `bun run lint:check` · `bun run types:check` · `bun test`. All green before PR.

---

## Test plan (`bun:test`, colocated `lib/**/*.test.ts`)

- **Validation unit** `lib/atcs/search-validation.test.ts`: empty/absent/whitespace query → invalid (AC5); `limit` default 20, cap 50, `limit=0`/negative rejected (SG2/SG3); invalid `layer` rejected (SG4); valid combos parse.
- **Route handler unit** `app/api/v1/atcs/search/route.test.ts` (mock `searchAtcs` + `getAuth`, mirror existing handler tests): 200 with `{items}`; 400 on bad query; 401 unauth; `workspace_id` request param ignored (S6.2).
- **RPC / integration** (DB-level, via Supabase MCP `execute_sql` against seeded data, documented as ATP integration outlines): title prefix match (S1.1), tag match (S2.1), module subtree recursive incl/exclude (S3.1/S3.2), recency tie-break with controlled `updated_at` (S4.1), two-tenant workspace isolation at DB level (S6.1), zero-match `{items:[]}` (SG5), `EXPLAIN ANALYZE` confirms GIN index (ATP integration #2).
- **Security**: `workspace_id` injection ignored (S6.2); query param is parameterized (no SQL injection) — covered by the parameterized RPC + a handler test asserting raw input is passed as a bound param.
- **ATP coverage:** maps the 21 ATP outlines (5 positive / 7 negative / 4 boundary / 3 integration / 2 security). E2E/automation is out of scope here (handled by QA from `Ready For QA`).

---

## Risks / unknowns

- **R1 (medium) — tsvector regconfig mismatch.** The indexed `atcs.tsv` uses `'english'` (migration 0004), but the ATP assumed `'simple'`. The search RPC **must** query with `to_tsquery('english', …)` to hit `atcs_tsv_gin_idx`; using `'simple'` would either miss the index or mismatch stemming. Decision: keep `'english'` (no re-index — that is a backend refactor, Critical Rule #15). Flag to PM that stemming ('login' ↔ 'logins') applies; acceptable for MVP.
- **R2 (low) — BK-18 dependency.** ATP says "BK-18 schema confirmed." Confirmed: `atcs` table + `tsv` + triggers exist (0004). The search RPC only **reads** `atcs`; no schema change. BK-18 is `In Test`, not yet dev-done — but the schema it owns is already merged, so search is not blocked.
- **R3 (low) — `module_path` source.** AC1 response wants `module_path`. The RPC must compute the module breadcrumb (recursive CTE up the `modules` tree) or join a precomputed path. Confirm a `module_path` is derivable from `modules.parent_id`; if a materialized path column doesn't exist, compute it in the RPC. _Investigate at Step 1._
- **R4 (low) — autocomplete data source / debounce.** No combobox/debounce primitive exists. Plan adds a minimal `useDebouncedValue` hook (~10 lines, framework-agnostic) rather than a new dependency. The dropdown is bespoke (reusing `AtcTable` row anatomy), not a new library.
- **R5 (low) — `atc:read` scope existence.** POST uses `requires: ['atc:read']`? No — POST uses `atc:write`. Confirm an `atc:read` PAT scope exists in the auth scope catalog; if reads are gated only by session membership, use `{ auth: 'required' }` without a `requires` scope (cookie OR any valid PAT) and let the RPC's workspace join authorize. _Confirm at Step 4._

## Open items (from ATP, non-blocking)

- `limit=0` → resolve to **400** (zod `.min(1)`), consistent with "at least 1".
- Invalid `layer` enum → **400** (zod `.enum`), consistent with other invalid-param handling.

## Technical Decisions (story-local — not ADR-worthy)

- Reuse existing `tsv`/trigger/index from 0004; add only a read-only search RPC. No schema migration beyond the function. (Additive, reversible → stays in plan, no ADR.)
- Keep `'english'` regconfig to stay index-compatible (R1). (Constrained by existing index, not a new architectural choice → no ADR.)

## Review Workload Forecast

Estimated: ~260 additions + ~10 deletions = ~270 total lines
(1 RPC migration ~70 · route + openapi ~80 · rpc wrapper + validation ~40 · UI filter + hook ~80 · tests counted separately under the 20% buffer)
400-line budget risk: Medium
Chain strategy: feature-branch-chain (optional split: backend search endpoint PR → UI filter PR) | size-exception not needed
Decision needed before apply: No
