# BK-33 — Implementation Plan (Spec Implementation Plan / Dev)

> Story: **TMS-Test Tags — assign reserved + custom tags to a Test** · Epic: BK-24 (Tests) · 8 pts
> Branch base: `staging`. Author against the **LIVE UI** (Critical Rule #15, live-first UI contract); mockup is inspiration only.

## Goal

Let a workspace writer assign / replace / clear the tag set on a Test (reserved suite tags `smoke` `sanity` `regression` + free-text custom tags), and filter the Tests list by a single tag — reusing the **exact backend + UI idioms already shipped** by BK-20 (ATC tags, search/filter), BK-27 (`bunkai_create_test`), BK-28 (`version` column + `X-If-Match` optimistic lock), and BK-32 (Test detail page). No new patterns are invented; BK-33 is the first **Test-header edit** surface and threads tags through the one composer (`bunkai_test_json`) every read path already uses.

## Key precedents discovered (reuse, do not reinvent)

- **`tests` table already has `version int` (default 1)** — added by BK-28 migration `0026`. No new lock column needed.
- **Optimistic lock is fully built**: `X-If-Match` header → `readVersionPrecondition` (`lib/atcs/optimistic-lock.ts`) → RPC `FOR UPDATE` version guard → SQLSTATE `45125` → 409 `version_conflict` with `current_version` echoed (`lib/tests/errors.ts:parseConflictVersion`). BK-33 reuses this verbatim.
- **`atcs.tags text[] not null default '{}'`** (migration `0004`) is the storage precedent — BK-33 mirrors it on `tests`.
- **`bunkai_test_json(p_test_id)`** (`0025_test_read.sql:71`) is the single composer both the read RPC (`bunkai_get_test_expanded`) and reorder RPC return. **Add `tags` there once → it surfaces on detail page, reorder response, and API GET automatically.**
- **Tag-pill UI idiom already exists**: edit pills with `×` in `components/atcs/AtcEditor.tsx:327-363`; read-only chips in `components/atcs/AtcPreview.tsx:171-183`. Class contract (frozen tokens §2): `inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2`.
- **Filter idiom**: `app/(app)/projects/[projectSlug]/atc-search-filter.tsx` + RPC-backed `GET /api/v1/atcs/search` (`searchAtcs`, project-scoped, `{ items: [] }` never 404).
- **Live Test detail is read-only** (BK-32) with **reorder-only** mutation (BK-28). BK-33 introduces the first edit affordance on the Test header.

## Backend shape decision: `text[]` column on `tests` (NOT a tags table)

**Chosen: a `tags text[] not null default '{}'` column on `public.tests`, replaced atomically by a SECURITY DEFINER RPC.**

Rationale (matches the story's explicit Engineering recommendation + BK-20 `atcs.tags` precedent):
- Business rules say tags are **values on the Test, not first-class entities** — no registry, no colors/ownership/rename (all deferred). A join table would add an entity the MVP explicitly rejects.
- Replacement semantics ("assigning tags replaces the whole set") map cleanly to overwriting an array column under the existing `version` lock.
- Filtering by one tag is a `tags @> array[$1]` containment over a GIN index — no join.
- Mirrors `atcs.tags` exactly, so reviewers and future devs read one idiom.

A separate tags table would only pay off for autocomplete-across-tests / usage analytics — **both deferred to a future story** (see Risks). MVP needs none of it.

### Schema migration `0029_test_tags.sql`
1. `alter table public.tests add column if not exists tags text[] not null default '{}';`
2. `create index if not exists tests_tags_gin_idx on public.tests using gin (tags);` (backs single-tag containment filter).
3. **Validation helper** `bunkai_normalize_test_tags(text[]) returns text[]` (language sql, immutable) — pure normalization the RPC and a CHECK can share: trim each, drop empties, lowercase **reserved** values only (`smoke`/`sanity`/`regression`), dedupe after normalization, preserving custom-tag casing. (Custom casing preserved per QA note in `comments.md:123` — flag for PO confirm, see Risks.)
4. **Defence-in-depth CHECK** (twin of the RPC, like the title CHECK on `tests`): every element `= btrim(element)`, `char_length <= 50`, no comma (`position(',' in element) = 0`), `array_length(tags,1) <= 20` (or null). Reserved-lowercasing and dedupe stay RPC-only (can't express in a simple CHECK).
5. **RPC `bunkai_set_test_tags(p_actor_user_id uuid, p_test_id uuid, p_tags text[], p_if_match int) returns jsonb`** — SECURITY DEFINER, `search_path=''`, mirroring `bunkai_reorder_test_steps` (`0026`) line-for-line:
   - lock Test header `FOR UPDATE`, capture `workspace_id` + `version`; missing → `P0002`.
   - `bunkai_assert_actor_can_write_workspace(actor, workspace_id)` → `42501`.
   - normalize via helper; validate count ≤ 20, each ≤ 50 chars, no comma → new domain code (e.g. `45126 tags_invalid`).
   - If-Match (when non-null) `<> version` → `raise 'version_conflict:%', v_version using errcode='45125'` (identical to reorder).
   - no-op (normalized set == current set) → return current json, **no** version bump / event / `updated_at` touch.
   - real change → `update tests set tags = v_norm, version = version + 1`; `activity_log` row `test.tags_changed` with `old_tags`/`new_tags`; return `bunkai_test_json(p_test_id)`.
   - `revoke … from public, anon; grant execute … to authenticated, service_role;`
6. **Expose `tags` in `bunkai_test_json`** (`0025:71`) — add `'tags', coalesce(t.tags,'{}')` to the header `jsonb_build_object`. Single edit, surfaces on every read.

## AC → files map

| AC scenario | Files | Approach |
|---|---|---|
| **Assign reserved + custom mix** (sc.1) | `supabase/migrations/0029_test_tags.sql` (RPC + normalize) · `lib/supabase/rpc.ts` (`setTestTags` wrapper) · `lib/tests/validation.ts` (`TestTagsBodySchema`) · `app/api/v1/tests/[id]/tags/route.ts` (PUT) + `.openapi.ts` · `components/tests/TestTagEditor.tsx` (new) | PUT `/tags` body `{ tags: string[] }` → `bunkai_set_test_tags`. Reserved values lowercased, customs kept verbatim; both coexist. |
| **Filter by reserved suite tag** (sc.2) | `supabase/migrations/0029_test_tags.sql` (`bunkai_filter_tests_by_tag` RPC, workspace-scoped, GIN `@>`) · `app/api/v1/tests/route.ts` (extend GET with `?tag=`) or new `tests/search` · `app/(app)/projects/[projectSlug]/test-tag-filter.tsx` (new, mirrors `atc-search-filter.tsx`) · `project-explorer.tsx` (consume filtered list) | SECURITY DEFINER RPC restricts to actor's workspace memberships; `tags @> array[$tag]`. Workspace-scoping authoritative server-side (mirrors `searchAtcs`). |
| **Replacing re-groups the Test** (sc.3) | same as sc.1 + filter | Full-set replace is the only write mode; after PUT, `router.refresh()` re-runs the filtered server fetch so the Test moves suites. |
| **Remove all tags (boundary)** (sc.4) | RPC (empty array valid) · `TestTagEditor.tsx` · `lib/tests/validation.ts` | `{ tags: [] }` is valid → untagged; Test stays intact/runnable (tags never touch `test_steps`). |
| **Add same tag twice → single** (sc.5) | `bunkai_normalize_test_tags` · zod `.transform` dedupe | Dedupe after trim+reserved-lowercase, in helper (server is enforcement of record). |
| **Filter by tag no Test carries** (sc.6) | filter RPC returns `[]` · `test-tag-filter.tsx` empty state | `{ items: [] }`, never 404; UI shows "No Tests carry this tag" (matches `searchAtcs` zero-match idiom). |
| **Concurrent stale update rejected** (BR / shift-left risk) | RPC `45125` · route 409 mapping (`lib/tests/errors.ts` extend `mapTestTagsError`) · `TestTagEditor.tsx` conflict toast + refresh | `X-If-Match: <version>` from loaded Test; mismatch → 409 `version_conflict` + `current_version`; UI offers refresh, never silent overwrite. |
| **Invalid tag rejected (comma / >50 / >20)** (BR) | RPC `45126` + CHECK · zod · `TestTagEditor.tsx` inline error | Fail-fast 422 in zod for shape; domain `tags_invalid` for comma/length/count; inline message before save. |

## UI plan (live-first)

**Reuse, don't invent.** All chips reuse the `AtcEditor`/`AtcPreview` pill classes (frozen §2 tokens).

- **Read display** — `components/tests/TestDetailView.tsx` header (`:60-110`): add a wrapped row of read-only tag chips under the title (same column, `max-w-[820px]`), mirroring `AtcPreview.tsx:171-183`. Reserved tags can carry a subtle accent later; MVP renders all identically.
- **Edit affordance** — `TestDetailView` already receives `canReorder` (member+); reuse that gate as `canEdit`. Add an "Edit tags" control in the header that opens **`components/tests/TestTagEditor.tsx`** (new) — a compact panel/popover reusing `AtcEditor.tsx:327-363` verbatim: reserved tags as quick-add chips + free-text input (Enter to add, `×` to remove), inline validation (comma/length/count/conflict), Save. Save sends PUT `/api/v1/tests/{id}/tags` with `X-If-Match: {test.version}`, then `router.refresh()`. Keying `TestDetailView`'s reorder client already on `id:version` means a post-save refresh remounts cleanly.
- **Filter / discovery** — new **`test-tag-filter.tsx`** placed in the project toolbar beside `AtcSearchFilter` (project-shell toolbar, where `atc-search-filter.tsx` lives), reusing its debounced-input + dropdown shell. Selecting a tag scopes the explorer Tests group (`project-explorer.tsx:285-331`) to matching Tests; empty → "No Tests carry this tag".
- **Navigation (golden rule)**: user opens a Test from the explorer Tests group → Test detail → sees tags in header → "Edit tags" (member+) opens the editor inline; OR from the toolbar tag-filter narrows the Tests list. No new route — tags live where the Test already lives.

### Divergence from / improvement on mockup
- Mockup (`editor.jsx`/`project.jsx`) shows ATC-centric tagging; live app has **no Test-tag surface yet** — BK-33 extends the live Test detail (BK-32) rather than copying any mockup Test screen. We **improve on** the mockup by reusing the already-polished live chip idiom rather than the mockup's unported `.tag` atom class (frozen §2 notes `.tag` is "❌ not ported").
- The mockup's separate filter sidebar is **not** adopted — the live toolbar-filter idiom (BK-20) is the improved pattern; forcing the mockup sidebar would regress live nav.

## Test plan

- **Unit (zod / normalize)** — `lib/tests/validation.test.ts`-style: trim, reserved lowercase, custom casing preserved, dedupe-after-normalize, comma reject, >50 reject, >20 reject, empty-set valid. (Hand off to `/unit-testing` for the normalize helper TDD.)
- **RPC parity** — extend the existing `lib/api/rls-parity.test.ts` precedent: writer can set tags; viewer/non-member → `42501`; foreign-workspace Test → `P0002`/404; stale `X-If-Match` → `45125`; no-op leaves `version` + `updated_at` untouched.
- **Route** — PUT `/tags` happy path (200 + tags in body), 422 invalid, 409 conflict (with `current_version`), 403 viewer; GET filter returns only matching workspace Tests, `[]` for unused tag, never cross-workspace leak.
- **Filter isolation** — assert Tests from another workspace never appear in tag-filtered results (shift-left medium risk `comments.md:26,126`).
- Verification gate (Stage 2): `bun run lint:check` · `bun run types:check` · unit tests (parallel cap=3). **Never** `bun run build` (Rule #14); type-safety via `tsc --noEmit`.

## Technical decisions

- **TD-1**: `text[]` column over tags table — array storage, replace-whole-set, GIN filter. Mirrors `atcs.tags`. (Not ADR-worthy: reversible, matches an existing precedent, story-local.)
- **TD-2**: New domain SQLSTATE `45126 tags_invalid` for comma/length/count; reuse `45125 version_conflict`, `42501`, `P0002` unchanged.
- **TD-3**: Expose `tags` by editing the shared `bunkai_test_json` composer — one edit, all read surfaces. (Additive, backward-compatible.)
- **TD-4**: PUT (full replace) over PATCH — semantics are "replace the whole set", so PUT is the honest verb; reorder used PATCH because it permutes, not replaces.

No ADR required — no cross-cutting/hard-to-reverse decision; all choices follow settled precedents (BK-20/27/28 + BUG-BK-96 X-If-Match).

## Risks / unknowns

- **PO confirm — custom-tag casing**: `comments.md:123` flags ambiguity on whether custom tags preserve user casing. Plan assumes **preserve custom casing, lowercase reserved only**. Confirm with PO before merge; one-line change in the normalize helper if wrong.
- **GET `/tests` shape**: live `GET /api/v1/tests` list shape must be confirmed during impl (the search precedent is ATC-only). If no list-GET exists, add a thin `bunkai_filter_tests_by_tag` RPC + `tests?tag=` rather than overloading create. (Verify at Stage 2 entry.)
- **Reserved-tag visual treatment**: MVP renders reserved + custom chips identically. A reserved-tag accent/badge is a nice-to-have, deferred — not in BK-33 ACs.
- **Mockup gem → future tech-story candidate**: the mockup's richer tag surface (tag colors / suite legend / multi-tag boolean AND-OR filter) is genuinely nicer but explicitly **out of scope** (story Out-of-Scope + `comments.md:136`). Recommend a follow-up tech-story: *"Tag registry + colored suite chips + multi-tag boolean filter"* once Test Execution reporting (BK-34+) shows demand. Do **not** force into BK-33.
- **Concurrency correctness** is the top quality risk (shift-left medium): covered by reusing the proven BK-28 lock; the only new surface is the tags write path, exercised by the parity tests above.

## Review Workload Forecast

Estimated: ~340 additions + ~30 deletions = ~370 total lines
(1 migration ~120 · 1 RPC wrapper + zod ~50 · 1 PUT route + openapi ~90 · 1 GET-filter extension ~40 · TestTagEditor.tsx ~90 · test-tag-filter.tsx ~60 · TestDetailView edit ~30 — minus shared reuse)
400-line budget risk: **Medium**
Chain strategy: **single feature-branch** (`feature/BK-33-test-tags`) — under budget, cohesive slice
Decision needed before apply: **No**
