# BK-22 — Implementation Plan (Spec Implementation Plan / Dev)

> Story: TMS-ATC Usage — "See a 'Used in N tests' report" · Epic BK-13 · 3 pts · Status: In Progress
> Base branch: `staging` (BK-20 + BK-23 merged). Plan-only artifact — no feature code written at this stage.

---

## 0. Feasibility gate — OUTCOME (B → effectively A)

**The tests↔ATC relationship ALREADY EXISTS and is queryable.** BK-22 is NOT blocked.

Evidence:

| Proof | Location |
|-------|----------|
| `test_steps` table with `atc_id` FK to `atcs.id` | `supabase/migrations/0024_tests.sql:60-72` |
| `tests` header table (`workspace_id`, `title`) | `supabase/migrations/0024_tests.sql:40-49` |
| Index built **explicitly for this report** | `0024_tests.sql:70-72` — comment: "future BK-22 'used by N tests' report" |
| Both relations + FKs present in generated types | `lib/types/supabase.ts:634-707` (`test_steps`, `tests`) |

`test_steps.atc_id` is `ON DELETE RESTRICT` (0024:65) — a chained ATC cannot be deleted out from under the report, so no orphan-row guard is needed (answers Story Tech-Q #1: an INNER JOIN naturally excludes nothing because the FK guarantees referential integrity; `tests` delete CASCADEs its `test_steps`, so deleted Tests never leave dangling steps either).

**Why "B not strictly A":** BK-27 (Test Builder) shipped the schema + `bunkai_create_test` RPC, but whether any *Tests* have been authored yet is data-dependent. If the workspace has zero Tests, every ATC shows **"Used in 0 tests"** + empty list today and lights up automatically as Tests get built. This is a valid presentation-layer build per Critical Rule #15. The query/UI is identical either way — the only difference is whether rows come back.

> **No schema invention.** We add ONE read-only `STABLE SECURITY DEFINER` RPC (no new tables/columns) that mirrors the established `bunkai_search_atcs` (0027) / `bunkai_duplicate_atc` (0028) pattern.

---

## 1. Approach

A read-only "Used in N tests" report for an ATC, delivered as:

1. **DB**: new migration `0029_atc_usage.sql` — `bunkai_atc_usage(p_actor_user_id uuid, p_atc_id uuid) returns jsonb`. `STABLE SECURITY DEFINER set search_path = ''`. Resolves the ATC's workspace (`atcs → projects → workspace_id`), asserts the actor is an active member (>= viewer) of THAT workspace, then JOINs `test_steps → tests` filtered to the same workspace and returns the ordered usage list. Cross-workspace / nonexistent ATC → uniform `not_found` raise (no existence leak, INV-3 precedent).
2. **API**: `GET /api/v1/atcs/[id]/usage` route handler via `withApiHandler` `{ auth: 'required', requires: ['atc:read'] }`, mirroring `app/api/v1/atcs/search/route.ts`. Wraps the RPC, returns `200 { used_in: [...] }`.
3. **Types/validation**: response type in `lib/types.ts`; UUID param guard; new RPC wrapper in `lib/supabase/rpc.ts`; OpenAPI doc in `route.openapi.ts`.
4. **UI**: "Used by" section in the ATC detail pane (`components/atcs/AtcPreview.tsx`) per mockup `project.jsx:528-546`, count label + per-Test rows. **Status chip per row is DEFERRED** (needs Runs data, §7 gate — see §3 fidelity note).
5. **Tests**: env-gated `bun:test` integration test (`lib/atcs/usage-rpc.test.ts`) + unit test for the count/label/ordering helper.

### Reused patterns (do not reinvent)
- RPC shape + explicit-actor authZ: `bunkai_search_atcs` (`0027_atc_search.sql`), `bunkai_duplicate_atc` (`0028_atc_duplicate.sql`).
- Workspace-membership assert helper precedent: `bunkai_assert_actor_can_write_workspace` (0024:146) — but BK-22 needs a **read** gate (>= viewer), so use the existing read helper `bunkai_is_workspace_member` (0005) inside the RPC rather than the writer assert.
- Route wrapper + auth + capability check: `lib/api/handler.ts`, `lib/api/principal.ts:79` (`requireCapability`), `lib/supabase/admin.ts` (`createAdminClient`), `lib/supabase/rpc.ts`.
- RPC→ApiError mapping: `lib/atcs/errors.ts` (`mapAtcRpcError`).
- UI atoms: `AtcPreview.tsx` `SectionLabel`, `.mono`, `.chip`, frozen §2 tokens.

---

## 2. AC → files map

| AC / Scenario | Behavior | Files (touch) | Approach |
|---|---|---|---|
| **1.1** "Used in N tests" count (multi-Test) | count distinct Tests | `0029_atc_usage.sql` (new), `AtcPreview.tsx` | RPC returns array; count = `used_in.length` (distinct-Test model, per PO-suggested answer) |
| **2.1** expanded list: title + position, ordered | one entry per Test-step row, ordered | `0029_atc_usage.sql`, `AtcPreview.tsx` | `jsonb_agg(... order by t.title asc, ts.position asc)` — **order by `tests.title`, NOT slug** (see §5 R1: `tests` has no `slug` column) |
| **2.2** same ATC multiple positions in one Test (Edge, NEEDS PO) | multiple rows for same Test | `0029_atc_usage.sql`, `AtcPreview.tsx` | RPC returns one row per `test_steps` row (no dedup — matches 0024 chain-is-a-sequence). UI: **default to PO-suggested "one row per Test, positions comma-joined; count = distinct Tests"**. Flag in PR for PO sign-off. |
| **3.1 / 3.2** zero usage → `200 { used_in: [] }`, NOT 404 | empty array | `route.ts` (new), `0029_atc_usage.sql` | valid ATC + no steps → RPC returns `[]`; route returns `200 { used_in: [] }`. Distinguish from cross-workspace (which raises not_found). |
| **4.1** exclude other-workspace Tests | workspace WHERE filter | `0029_atc_usage.sql` | JOIN `tests t` then `where t.workspace_id = <atc's workspace>`. Only the ATC's own workspace counts (Tests are workspace-scoped, ATCs project→workspace-scoped). |
| **4.2** cross-workspace ATC → 404 not 403/200 (NEEDS PO) | uniform not_found | `0029_atc_usage.sql`, `lib/atcs/errors.ts`, `route.ts` | RPC's membership gate raises uniform `not_found`/`forbidden`→ mapped to **404** (existence-leak prevention, INV-3). Map at `errors.ts`. |
| **E1** singular "Used in 1 test" (NEEDS PO) | grammar | `AtcPreview.tsx` (+ helper in `lib/atcs/`) | label helper: `n === 1 ? '1 test' : \`${n} tests\``. Unit-tested. |
| **E2** valid-but-absent UUID → 404 (NEEDS PO) | uniform not_found | `0029_atc_usage.sql` | ATC lookup misses → same `not_found` as E2/4.2 (no leak). |
| **E3** unauthenticated → 401 (NEEDS PO) | auth gate | `route.ts` | `withApiHandler { auth: 'required' }` returns 401 before handler body. |
| **PAT wrong scope → 403** (Edge #6) | scope gate | `route.ts` | `requires: ['atc:read']` → `requireCapability` throws 403. |
| **Design-fidelity** "Used by tests" surface | UI section | `AtcPreview.tsx` | per `project.jsx:528-546` (see §3). |

> Exact route/RPC/wrapper signatures are mirrored from BK-20/BK-23; see §1 reused-patterns for the source files to copy.

---

## 3. Screen fidelity

**Realizes:** master-design-plan **§4.3 Projects → Detail row "Used-by-tests"** (line 140, currently 🔶 deferred) and **§8 US→Screen map** (line 269: BK-22 → Projects detail "Used by tests", `project.jsx`).

**Mockup anatomy** (`project.jsx:528-546`):
```
SectionLabel: "Used by"  + hint "N tests"
rows (gap 6): [Branch icon] [mono test id, minW 110] [test name, flex] [status chip] [chevron]
  row: padding 8px 12px · bg var(--bg-2) · 1px var(--stroke-2) · radius var(--r-2)
```

**Frozen §2 tokens** (no re-pick): surfaces `--bg-2 #14171c`; strokes `--stroke-2 rgba(255,255,255,.08)`; text `--fg-1/--fg-3`; radii `--r-2 = 5px`; Inter UI + JetBrains Mono for the ID; SectionLabel = `600 10.5px uppercase, .06em, --fg-3`.

**Deliberate, ratified-needed departure (§5 R2):** the mockup row shows a **per-Test status chip** (`pass`/`fail`). That requires **Runs data**, which does not exist yet (master-design-plan §7 gate; §4.3 line 140 already labels Used-by "deferred — need runs/tests data"). BK-22 ships the **chain/title/position** portion of the row and **omits the status chip** for now (faithful presentation layer, no Runs invention). Show the ATC's **position** in the row instead (BK-22's own AC2 requirement) — the mockup `id`/`name`/chevron columns map cleanly; position is additive and AC-required. This mirrors the already-ratified BK-32 derivation (D10) which renders the same "Used by"-row anatomy "neutral styling, no pass/fail color (no Runs, §7 gate)". **Add a §5 row before/with the PR.**

> Test rows are read-only in BK-22 (no navigation target required by AC; chevron optional — Test detail page is BK-32/D10). Keep the chevron as a non-interactive affordance or drop it; do not wire a dead link.

---

## 4. Test plan

Framework: `bun:test` (no `test` npm script — run `bun test`). Integration tests are **env-gated** (`describe.skip` unless `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set), mirroring `lib/atcs/duplicate-rpc.test.ts`.

- **`lib/atcs/usage-rpc.test.ts`** (integration, env-gated):
  - ATC in N Tests → returns N entries, count correct (AC1.1).
  - Entries ordered by `tests.title` asc, then `position` asc (AC2.1).
  - Same ATC at two positions in one Test → ≥2 entries for that Test (AC2.2).
  - ATC with no steps → `[]`, not error (AC3.1).
  - Cross-workspace ATC id → uniform not_found raise (AC4.1/4.2).
  - Absent UUID → same not_found (E2). Non-member actor → not_found/forbidden (no leak).
  - Seeds via existing `bunkai_create_test` (0024) to build chains; `afterAll` cleans `tests`/`test_steps`/`activity_log` rows it created.
- **`lib/atcs/usage.test.ts`** (unit, no DB): the count-label helper — `0→"0 tests"`, `1→"1 test"` (singular, E1), `4→"4 tests"`; and any position-grouping helper if the "one row per Test, positions joined" model is adopted.
- **Route-level**: 401 unauth (E3), 403 wrong-scope (#6), 200 empty-array shape (3.2) — exercise via the route handler with a stub principal where the existing route tests do so; otherwise cover at RPC + manual `bun run dev` check.
- **Verify order (Rule #6):** `bun test` → `bun run types:check` → `bun run lint:check`. After the migration, regenerate types via `bun run types:gen`. NEVER run a production build (Rule #14) — verify UI on `bun run dev`.

---

## 5. Risks / unknowns

- **R1 — `tests` has NO `slug` column.** AC2.1 and the refinement say "order by Test slug ascending" and the response lists a `slug` field, but `0024_tests.sql` / `lib/types/supabase.ts:670` give `tests` only `id`/`title`/`workspace_id`/timestamps. **Resolution: order by `tests.title` asc, return `title` (+ `id`), drop `slug`.** Mockup also shows an `id`/name pair, not a slug. Flag to PO; do not invent a slug column.
- **R2 — Per-Test status chip deferred (Runs gate).** Mockup row has a pass/fail chip; no Runs data exists (§7). Ship neutral rows (no status), add §5 ratification row. Consistent with BK-32/D10 precedent.
- **R3 — Multi-position rendering + count semantics (NEEDS PO, AC2.2 + Q1).** RPC returns raw rows (no dedup). UI/count model = PO-suggested "one row per Test, positions comma-joined, count = distinct Tests". Implement that default; surface in PR for sign-off. Cheap to flip to per-step rows later.
- **R4 — Empty-state today (Outcome B).** If no Tests authored yet, every ATC shows "Used in 0 tests". Expected and correct; not a defect. Lights up when BK-27-built Tests exist.
- **R5 — Performance target contradictory (Q3: 100 vs 10k Tests).** Index `test_steps_atc_id_idx` (0024:72) already supports the lookup; the query is a 2-table indexed JOIN. Not a blocker; do not write a perf assertion until PO reconciles the fixture size.
- **R6 — id vs slug in the route path.** Existing ATC routes key on `id` (UUID) — keep `GET /atcs/{id}/usage` on the ATC UUID, consistent with `[id]/route.ts` and `[id]/duplicate`. AC wording uses "atc-slug-a-id" (the id), so id is correct.

---

## 6. Complexity

**S–M** (lean M). One read-only RPC + one GET route + one UI section, all mirroring shipped BK-20/BK-23 patterns. No new tables, no writes, no migrations beyond the additive function. The only non-mechanical decisions are the PO-pending semantics (R3) and the deferred status chip (R2) — both have clear defaults.
