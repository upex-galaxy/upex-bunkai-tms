# BK-27 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

# BK-27 — Implementation Plan

> Story: ***TMS Test Builder | Assemble a test by chaining ATCs*** — 8 SP, epic BK-24 (Tests — chains of ATCs), Sprint 2 (wave 2).
Glossary canon applies throughout: ***Test**** (capital T) = named container owning an ordered ****chain**** of ****ATC*** (Acceptance Test Case) references — references, never copies. Banned: "test case" for a chain, "Atomic Test Component", "published ATC".

## Overview

Implement Test creation end-to-end: a `tests` entity bound to exactly one Workspace at save-commit time, an ordered `test*steps` chain (duplicates legal — sequence, not set), one server-side rulebook (`bunkai*create_test` SECURITY DEFINER RPC) consumed identically by the UI builder and the headless `POST /api/v1/tests` surface, idempotent submission, and an activity-log entry per creation.

***Acceptance Criteria to satisfy******:***

- AC 1.1 — Create a Test with three ATCs in the selected order (High)
- AC 1.2 — Preserve a chain that references the same ATC twice (High)
- AC 2.1 — Block save when no ATC is selected, server-enforced (High)
- AC 2.2 — Reject empty/whitespace-only title (High)
- AC 2.3 — Accept 200-char title, reject 201 (Medium)
- AC 3.1 — Exactly one Test on a double-submit (High)
- AC 3.2 — Dedupe a headless agent retry with the same idempotency key (High)
- AC 4.1 — Reject foreign-workspace ATC without disclosing existence (Critical)
- E1 — Viewer cannot create via headless API (403) (High)
- E2 — Test binds to the workspace active at the creation instant (Medium)

***Epic exit criterion honored******:*** INV-3 tenant isolation (RLS, non-disclosure).

---

## Technical Approach

***Chosen approach******:**** Clone the proven BK-18 ATC-create vertical: one transactional ****SECURITY DEFINER plpgsql RPC*** (`bunkai*create*test`, mirroring `bunkai*create*atc` in `supabase/migrations/0021*atc*create_update.sql:112`) holds ALL business rules (role gate, title rules, chain ≥ 1, same-workspace ATC resolution, activity-log insert); a thin `withApiHandler` route (`app/api/v1/tests/route.ts`, cloned from `app/api/v1/atcs/route.ts`) does Zod parsing, workspace resolution, idempotency, and error mapping; the UI builder is just another client of the same route. This is the "one rulebook / three executors" guarantee TC-15 demands.

***Alternatives considered******:***

- **Security-invoker **`bunkai*save*test`** mirroring **`bunkai*save*atc`** (0007), as floated in the Jira dev comment** — rejected: BK-27 is create-only (edit/reorder are BK-28/backlog), so full-ordered-replace semantics are dead weight; invoker functions cannot write `activity*log` (no client INSERT policy, by design — `0009*cross*cutting.sql:110`) and cannot serve PAT callers, who have no `auth.uid()` on the admin client. The 0021 DEFINER pattern with explicit `p*actor*user*id` solves both and is the canonical create path post-ADR-0001.
- **Validation in the route handler only** — rejected: TC-08 explicitly requires server-side re-validation below the HTTP layer; the RPC is the single enforcement point any future surface inherits.
- **Direct table inserts from the handler via admin client** — rejected: loses transactionality across `tests` + `test*steps` + `activity*log`, and scatters the rulebook.

***Why this approach******:***

- ✅ ADR-0001 compliant: route wrapped by `withApiHandler` (`auth: 'required'`), PAT parity free via the identity gateway, RLS remains the authorization source.
- ✅ Atomic: all-or-nothing insert of test + chain + audit row (QA recommendation "validate ALL ATCs before insert atomically" — satisfied inside one transaction).
- ✅ Non-disclosure by construction: ATC resolution inside the RPC is workspace-scoped; foreign and nonexistent ids collapse into one uniform raise.
- ❌ Trade-off: business logic in plpgsql is harder to unit-test than TS — mitigated by mirroring every rule in `lib/tests/validation.ts` (fast Zod layer, fully unit-tested) and env-gated integration tests for the RPC-only rules.

---

## Data Model (described — no static SQL in plan; author during Step 1, apply via Supabase MCP)

***Migration ***`supabase/migrations/0024_tests.sql` (next free number after 0023):

***Table ***`tests` — workspace-scoped (unlike project-scoped `atcs`):

| Column | Type / constraint |
| --- | --- |
| `id` | uuid PK, `gen*random*uuid()` |
| `workspace_id` | uuid NOT NULL → `workspaces(id)` ON DELETE CASCADE |
| `title` | text NOT NULL, CHECK trimmed + length 1–200 |
| `created_by` | uuid NOT NULL → `auth.users(id)` |
| `created*at` / `updated*at` | timestamptz NOT NULL default now() |

***Table ***`test*steps` — the chain (glossary-canonical name; the Jira dev comment's `test*atcs` is overridden — see Decision 15):

| Column | Type / constraint |
| --- | --- |
| `id` | uuid PK surrogate — duplicates of the same `atc*id` are legal (Business Rule 5), so NO `unique(test*id, atc_id)` |
| `test_id` | uuid NOT NULL → `tests(id)` ***ON DELETE CASCADE*** |
| `atc*id` | uuid NOT NULL → `atcs(id)` ***ON DELETE RESTRICT*** (matches `atcs.user*story_id` precedent, 0004) |
| `position` | int NOT NULL, CHECK ≥ 1, `UNIQUE (test_id, position)` |

Index `test*steps(atc*id)` (RESTRICT enforcement + future BK-22 usage report). `atc_id` is a ***reference, not a copy*** — never snapshot ATC content into a Test (snapshots belong to Runs).

***RLS*** (both tables, defence-in-depth even though writes go through the RPC): SELECT via `bunkai*is*workspace*member(workspace*id)` on `tests`, EXISTS-join through `tests` for `test*steps`; INSERT via `bunkai*can*write*workspace` (helpers from `supabase/migrations/0005*rls*helpers.sql:19,35`). Future contract `GET /tests/{id}?expand=atcs.steps,…` reads through these policies — nothing here blocks it.

***RPC ***`bunkai*create*test(p*actor*user*id uuid, p*workspace*id uuid, p*title text, p*atc*ids uuid[])` SECURITY DEFINER, plus helper `bunkai*assert*actor*can*write*workspace(p*actor*user*id, p*workspace*id)` mirroring `bunkai*assert*actor*can*write_project` (0021:32). Validation order is load-bearing:

1. Role gate: actor must be active member with role member/admin/owner → RAISE SQLSTATE `42501` (→ 403). Covers E1.
2. Title: trim, then 1–200 chars → custom SQLSTATE `45121` (→ 422). Trim-then-validate: `"  Cart  "` → valid `"Cart"`.
3. Chain: `array*length(p*atc_ids, 1) ≥ 1` → custom SQLSTATE `45120` — checked ***before*** any ATC resolution. Covers TC-08.
4. ATC resolution: every DISTINCT id must exist in `atcs JOIN projects ON projects.id = atcs.project*id WHERE projects.workspace*id = p*workspace*id` → any miss raises custom SQLSTATE `45122` with ***no id echo***. Foreign-workspace and nonexistent collapse into the identical raise (INV-3 non-disclosure). No hard chain-length cap server-side (Decision 9).
5. Insert `tests` row; insert `test_steps` rows at positions 1..n in ***array order*** (duplicates preserved verbatim — Business Rules 4–5).
6. Insert `activity*log` row (`workspace*id, actor*user*id, entity*type='test', entity*id, action='test.created', payload {title, atc_count}`) — 0021:232 / 0023 precedent: DEFINER insert is the only sanctioned write path.
7. Return composed jsonb `{ id, workspace*id, title, created*by, created*at, steps: [{position, atc*id}] }`.

---

## UI/UX Design

***Design contract (****`.context/design/master-design-plan.md`**** §8, line 268)******:**** BK-27 → ****Projects*** screen (Test nodes) + Tests builder; mockup `.context/designs/bunkai-test-management-tool/project/screens/project.jsx`.

***⚠️ Known design gap (must be ratified, not silently invented)******:**** mockup `TestDetail` is a placeholder (`project.jsx:564-570`) — the builder interaction itself has no authored spec. This plan derives it ****by analogy**** with the ATC creation precedent (routed editor page: `app/(app)/projects/[projectSlug]/atcs/new/page.tsx` + `components/atcs/NewAtcEditor.tsx`), using the ATCDetail "Used by"-row anatomy (`project.jsx:529-546`) for the chained-ATC list. ****Orchestrator action before Stage 2 UI work******:****** record this derivation as a §5 ratified divergence in ***`master-design-plan.md` (cheap, not PO-blocking). Deferred with it: Test `code` generation (mock shows `T-{PROJ}-{SLUG}`; schema has title only — render title for MVP) and tree placement under modules (Tests are workspace-scoped, no module anchor — MVP renders a flat "Tests" explorer group).

***What IS designed and must be matched exactly******:***

- `New Test`*** toolbar button*** — already stubbed disabled at `app/(app)/projects/[projectSlug]/project-workbench.tsx:114-124`. Enable as primary (`--accent #d9543f`) small button with Plus icon, navigating to the builder (mirror the `New ATC` Link at :105-113).
- ***Test rows/nodes****: branch icon 12px `fg-3` + title 12.5px + status dot; ****NO layer chip on Tests*** (layer chips are ATC-only); chained-ATC rows DO show their layer chip. Row card: `8px 12px`, `bg-2`, 1px `stroke-2`, radius `--r-2`; mono ATC ids 11px `fg-3` (JetBrains Mono).
- ***Frozen tokens only**** (§2.1): reuse the project's existing `components/ui/**` + utility classes (`bg-surface-**`, `text-fg-**`, `dot`, `layer-chip` as used in `project-workbench.tsx`). Do NOT re-derive colors/radii/fonts; do NOT fix §2.2 atom drift inside BK-27.
- ***§7 data-model gate***: no Runs exist — render Tests with neutral `unrun` status dots; no "Run this" affordances.

***Builder layout (****`/projects/{slug}/tests/new`****)******:***

```
+--------------------------------------------------------------+
| Topbar: breadcrumb  Project > New Test                       |
+--------------------------------------------------------------+
| Title input (200-char counter)                               |
+---------------------------+----------------------------------+
| ATC picker (cmdk list,    | Chain (ordered list)             |
| filter input, workspace   |  1. [mono id] title [layer] [x]  |
| library; click = append)  |  2. ...   (append order only)    |
+---------------------------+----------------------------------+
| [Create Test]  (disabled while pending / chain empty)        |
+--------------------------------------------------------------+
```

***UI states******:*** Empty chain → inline hint "A Test must include at least one ATC." + disabled submit; Loading → submit spinner + disabled form; Error → `data-testid="new-test-error"` rendering the server `error.message` verbatim (non-disclosure copy must not be rephrased client-side); Success → redirect to `/projects/{slug}` + router refresh (new Test visible in explorer Tests group).

***Form validations (mirror server, never replace it)******:**** title required/≤200 after trim; chain ≥ 1; soft cap: picker stops appending at ****100*** chained ATCs with hint "Chains are limited to 100 ATCs in the UI." (server imposes no cap).

***Sibling-story exclusions (explicitly deferred — do NOT build)******:***

- BK-28: drag-to-reorder / move-up-down of chain rows (BK-27 = append order + remove-row only; no DnD libs).
- BK-32: rich read-only Test detail pane/tab (full per-ATC expansion). BK-27's explorer Tests group is a list only; clicking does not open a `t:` tab yet.
- BK-33: `.tag` chip input on Tests.
- BK-22: "Used by N tests" wiring in ATC detail.

***data-testids (kebab-case, entity-prefixed per ****`NewAtcEditor.tsx`**** convention)******:*** `new-test-builder`, `new-test-title`, `new-test-atc-picker`, `new-test-chain-row-{i}`, `new-test-chain-remove-{i}`, `new-test-submit`, `new-test-error`, `project-new-test`, `explorer-tests-group`, `explorer-test-{id}`.

---

## Implementation Steps

### Step 1 — Migration 0024: schema + RLS

***Task******:*** Author `supabase/migrations/0024*tests.sql` sections 1–2: `tests` + `test*steps` tables per the Data Model above, RLS enabled with member-SELECT / writer-INSERT policies reusing `bunkai*is*workspace*member` / `bunkai*can*write*workspace` (0005). Apply via Supabase MCP during implementation.

***Files******:*** `supabase/migrations/0024_tests.sql` (new).

***Edge cases******:*** duplicate `atc*id` in one chain must be insertable (surrogate PK, no `(test*id, atc*id)` unique); `position` uniqueness per test; RESTRICT on `atc*id` so deleting a chained ATC fails loudly.

***Testing******:*** apply migration to local/branch DB; as WS-X member SELECT own tests OK, WS-Y tests → 0 rows; direct INSERT as viewer rejected by policy.

***verify******:*** migration applies cleanly; cross-tenant SELECT returns zero rows.
***Estimated time******:*** 3h

### Step 2 — Migration 0024: `bunkai*create*test` RPC + activity log

***Task******:*** Same file, section 3: `bunkai*assert*actor*can*write*workspace` helper + `bunkai*create*test` DEFINER RPC implementing validation order 1–7 from the Data Model section (role 42501 → title 45121 → chain-empty 45120 → uniform ATC-resolution 45122 → inserts → `activity*log` insert → composed jsonb).

***Files******:*** `supabase/migrations/0024_tests.sql` (same new file).

***Edge cases******:*** empty-chain check BEFORE ATC resolution (validation order is observable behavior); 45122 raise carries NO ATC ids (non-disclosure); duplicates inserted at distinct positions in array order; whitespace-only title → 45121 after trim.

***Testing******:*** SQL-level calls via MCP: member happy path (rows in `tests`, `test*steps` positions 1-2-3, `activity*log` row with actor/action/target/timestamp); viewer → 42501; foreign ATC and random uuid → identical 45122; zero-length array → 45120.

***verify******:*** RPC call as member returns composed jsonb AND one `activity_log` row exists; viewer call raises 42501.
***Estimated time******:*** 5h

### Step 3 — Regenerate DB types

***Task******:*** `bun run types:gen` → `lib/types/supabase.ts` gains `tests`/`test_steps`/RPC types.

***Files******:*** `lib/types/supabase.ts` (generated — excluded from review budget).

***verify******:*** `bun run types:check` exits 0.
***Estimated time******:*** 0.5h

### Step 4 — Domain layer: validation, errors, codes, RPC wrapper

***Task******:*** TS mirror of the rulebook + error translation.

***Files******:***

- `lib/tests/validation.ts` (new): `TEST*TITLE*MAX = 200`, `TEST*CHAIN*UI*SOFT*CAP = 100` (exported for UI only), `TestCreateBodySchema` — `title` (trim → min 1 → max 200), `atc*ids: z.array(z.string().uuid()).min(1)` (ZodError → 422 automatically via `withApiHandler`), `workspace*id: z.string().uuid().optional()`.
- `lib/tests/validation.test.ts` (new): table tests (see Unit-test plan).
- `lib/tests/errors.ts` (new): `mapTestRpcError` SQLSTATE switch per `lib/atcs/errors.ts` precedent — `42501` → `forbidden`; `45120` → `chain*empty` with copy `A Test must include at least one ATC.`; `45121` → `validation*failed` (title); `45122` → `not*found` with copy `One or more selected ATCs are not available in this workspace.`; default → `internal*error`.
- `lib/tests/errors.test.ts` (new).
- `lib/api/error-envelope.ts` (modify): add `CHAIN*EMPTY: 'chain*empty'` to `API*ERROR*CODES` + `chain*empty: 422` to `DEFAULT*STATUS` (Tests domain comment block, BK-27).
- `lib/openapi/registry.ts` (modify): mirror `chain_empty` in the error-code enum (`:31-45` — the two lists MUST stay in sync).
- `lib/supabase/rpc.ts` (modify): `createTest(supabase, { actorUserId, workspaceId, title, atcIds })` typed wrapper next to `createAtc` (:85).

***Edge cases******:*** trim-then-validate (`"  Cart  "` valid); exactly 200 chars pass, 201 fail; uuid-format rejection at Zod layer (cheap 422 before DB roundtrip).

***Testing******:*** `bun test lib/tests` green.

***verify******:*** `bun test lib/tests` passes; `bun run types:check` clean.
***Estimated time******:*** 4h

### Step 5 — API handler `POST /api/v1/tests` + OpenAPI sibling

***Task******:**** Clone the `app/api/v1/atcs/route.ts` shape: `withApiHandler(handler, { auth: 'required', requires: ['atc:write'] })` (Decision 16); `getAuth(ctx)`; JSON parse → `bad*request`; `TestCreateBodySchema.parse`; ****workspace binding at this instant (E2)****: `body.workspace*id` if present, else `resolveActiveWorkspaceId` (`lib/workspaces/active.ts:10`, cookie-based — PAT callers have no cookie so they MUST send `workspace*id`; neither → 422 `validation*failed` "workspace_id is required for token-authenticated calls."); `createAdminClient()` + `createTest` wrapper; `mapTestRpcError(error)`; `jsonResponse({ test: data }, { status: 201 })`. Never call `createClient().auth.getUser()` in `app/api/***` (ESLint-banned, ADR-0001).

***Files******:*** `app/api/v1/tests/route.ts` (new), `app/api/v1/tests/route.openapi.ts` (new — `registerPath` with 201/400/401/403/404/409/422 responses, required `Idempotency-Key` header param, exported `TestSchema`).

***Edge cases******:*** mid-form workspace switch — cookie value read at submit re-targets binding; now-foreign chained ATCs fall through to the uniform 404 copy. Foreign and nonexistent ATC responses are byte-identical (same code, status, message, no `details`).

***Testing******:*** curl matrix — member 201; viewer 403; foreign-ATC vs random-uuid responses diffed byte-identical; empty chain 422; 201-char title 422.

***verify******:*** `bun run openapi:gen && bun run openapi:diff` clean; curl matrix passes against local dev (`bun run dev` — never a local production build).
***Estimated time******:*** 4h

### Step 6 — Idempotency wiring (first-ever consumer of `lib/api/idempotency.ts`)

***Task******:*** Inside the Step 5 handler, after Zod parse + workspace resolution: `beginIdempotentRequest({ headers, userId: principal.userId, endpoint: 'POST /api/v1/tests', workspaceId, requestPayload: body })`; if `isReplay` → return stored snapshot with stored status (no second Test); wrap RPC call so success → `recordIdempotencyResult(token, responseBody, 201)` and any thrown error after begin → `discardIdempotencyResult(token)` then rethrow. Header is REQUIRED on this endpoint (helper already throws `idempotency*key*required` 400 when absent — `lib/api/idempotency.ts:162-168`); same key + different payload → 409 `conflict` (already built, `:74-79`). Window = the table's 24h TTL (0009). This sets the repo precedent — see Decision 3 + ADR candidate.

***Files******:*** `app/api/v1/tests/route.ts` (same file as Step 5 — wiring authored as a discrete commit).

***Edge cases******:*** replay must return the exact 201 snapshot (agent retry, TC-16); `pending`/`failed` rows let the same key+hash continue the journey (helper behavior `:93-98`); double-submit from the UI shares one key per form session.

***Testing******:*** two identical curls, same key → one `tests` row + identical bodies; same key, mutated payload → 409.

***verify******:**** `select count(**) from tests` unchanged after replayed curl; second response body equals first.
***Estimated time******:*** 2h

### Step 7 — UI: Test builder page

***Task******:*** Builder per the UI/UX Design section.

***Files******:***

- `app/(app)/projects/[projectSlug]/tests/new/page.tsx` (new): server component mirroring `app/(app)/projects/[projectSlug]/atcs/new/page.tsx` — active-workspace cookie → workspace-scoped project lookup by slug (`notFound()` guards) → load workspace ATC library (id, slug, title, layer; selectable = every non-archived workspace ATC — Decision 2) → render builder.
- `components/tests/AtcChainPicker.tsx` (new): client — `cmdk` filterable list of library ATCs; click appends to chain (re-click re-appends: duplicates legal); chain list rows per "Used by" anatomy with position index, layer chip, remove button; stops appending at 100 with soft-cap hint.
- `components/tests/NewTestBuilder.tsx` (new): client — title input + counter, hosts picker, `crypto.randomUUID()` generated once per form session (lazy `useState` initializer) sent as `Idempotency-Key` on `fetch('/api/v1/tests', { method: 'POST', … })`; submit disabled while pending or chain empty; branch on `error.code` and render server `error.message` verbatim; success → `router.push('/projects/{slug}')` + refresh. Mirror `components/atcs/NewAtcEditor.tsx` patterns (fetch at :206, error branching, testids).
- `app/(app)/projects/[projectSlug]/project-workbench.tsx` (modify): replace the disabled `New Test` stub (:114-124) with a primary `Link` to `/projects/${projectSlug}/tests/new`, `data-testid="project-new-test"`.

***Edge cases******:*** double-click submit → one key, one Test (pending-disable + idempotency belt-and-braces); duplicate appends render as distinct rows with distinct positions; remove-row reindexes positions client-side; whitespace-only title blocked client-side AND server-side.

***Testing******:*** dev-server flow — assemble Test with 3 ATCs incl. one duplicate; verify chain order in DB equals selection order; empty-chain and title errors render exact copy.

***verify******:*** manual flow on `bun run dev` creates a `tests` row with positions 1-2-3 preserved; submit blocked on empty chain with exact copy.
***Estimated time******:*** 8h

### Step 8 — Explorer Tests group (creation feedback list)

***Task******:*** Make created Tests visible (TC-01 "appears in list"): fetch workspace Tests RLS-scoped in the project page and render a collapsible "Tests" group in the explorer panel — branch icon 12px `fg-3`, title, neutral `unrun` dot, NO layer chip; read-only list (opening as a `t:` tab = BK-32). Must coexist with §5 D8 explorer behaviors (accordions, collapse/resize) without regressing them.

***Files******:*** `app/(app)/projects/[projectSlug]/page.tsx` (modify — load tests), `app/(app)/projects/[projectSlug]/project-explorer.tsx` (modify — Tests group, `data-testid="explorer-tests-group"` / `explorer-test-{id}`).

***Testing******:*** created Test appears after redirect; a member of another workspace sees an empty group.

***verify******:*** new Test visible in explorer after Step 7 flow; cross-workspace account sees none.
***Estimated time******:*** 3h

### Step 9 — Integration verification sweep

***Task******:*** Full quality gate in order (Critical Rule #6): tests → types → lint; plus env-gated RLS isolation test and OpenAPI diff.

***Files******:*** `lib/tests/rls-isolation.test.ts` (new — cloned from the `lib/api/rls-parity.test.ts` pattern: env-gated `describe.skip` without Supabase creds, impersonating JWT clients, asserts WS-X member gets zero WS-Y `tests`/`test_steps` rows and that foreign-ATC create fails with the uniform error).

***Flow******:*** 1) `bun test` (no `test` script exists in `package.json` — invoke `bun test` directly) → 2) `bun run types:check` → 3) `bun run lint:check` → 4) `bun run openapi:diff` → 5) manual smoke on `bun run dev`. Never run a production build locally.

***verify******:*** all four commands exit 0; smoke flow passes.
***Estimated time******:*** 2.5h

---

## Traceability — ATP TC → Implementation Steps

> ⚠️ ***Count note******:**** the handoff comment claims "25 ATP scenarios (5P/6N/7B/7I)"; the synced ATP field contains ****19*** per its own coverage table (3P/5N/4B/4I/3API). All 19 are mapped below — none unmapped. If a Jira re-sync surfaces additional outlines, they must be mapped here before Stage 2 starts.

| TC | Title (abridged) | Steps that make it pass |
| --- | --- | --- |
| TC-01 | Create Test with 3 ATCs, order preserved, appears in list | 1, 2, 5, 7, 8 |
| TC-02 | Chain order exactly as selected (non-alphabetical) | 2 (array-order positions), 7 (picker append order) |
| TC-03 | Same ATC twice persisted (sequence, not set) | 1 (surrogate PK), 2, 7 |
| TC-04 | Block save when no ATC selected, exact copy | 4 (Zod min 1), 2 (RPC 45120), 7 (UI guard + copy) |
| TC-05 | Reject whitespace-only title | 4 (trim→min 1), 2 (45121), 7 |
| TC-06 | Foreign-workspace ATC: non-disclosing reject | 2 (45122 uniform), 4 (404 + copy), 5 |
| TC-07 | Viewer create via headless API → 403 | 2 (42501), 4 (`forbidden`), 5 |
| TC-08 | Empty chain re-validated server-side (bypass UI) | 2 (45120 below HTTP layer), 5 |
| TC-09 | 200-char title OK / 201 rejected | 4 (boundary), 2 (CHECK + 45121) |
| TC-10 | Single-ATC chain accepted (minimum) | 1, 2, 5 |
| TC-11 | Max-chain ceiling | 7 (UI soft cap 100 + hint), 5 (OpenAPI documents "no server cap") — Decision 9 |
| TC-12 | Double-submit within window → one Test | 6 (idempotency), 7 (one key per form session + pending-disable) |
| TC-13 | Cross-workspace Test isolation (RLS, INV-3) | 1 (RLS policies), 9 (`lib/tests/rls-isolation.test.ts`) |
| TC-14 | activity_log entry on creation (actor/action/target/ts) | 2 (in-RPC insert) — Decision 4: no longer blocked |
| TC-15 | UI and headless produce identical results | 2 (one rulebook), 5 (one route), 7 (UI calls same route) |
| TC-16 | Headless retry, same key → one Test + cached response | 6 (replay snapshot) |
| TC-17 | API: POST /tests happy path as member | 2, 5 |
| TC-18 | API: POST /tests as viewer → 403 | 2, 4, 5 |
| TC-19 | API: POST /tests foreign ATC → non-disclosing reject | 2, 4, 5 |

***AC scenarios → Steps******:*** 1.1 → 1,2,5,7,8 (TC-01/02) · 1.2 → 1,2,7 (TC-03) · 2.1 → 2,4,7 (TC-04/08) · 2.2 → 2,4,7 (TC-05) · 2.3 → 2,4 (TC-09) · 3.1 → 6,7 (TC-12) · 3.2 → 6 (TC-16) · 4.1 → 2,4,5 (TC-06/19) · E1 → 2,4,5 (TC-07/18) · E2 → 5 (workspace resolved from authenticated context at submit instant).

---

## Technical Decisions

> Story-local decisions live here; cross-cutting + hard-to-reverse ones are flagged as ADR candidates per `.context/ADR/README.md`.

| # | Question | Decision | Status |
| --- | --- | --- | --- |
| 1 | `tests` entity in BK-27 scope? | Yes — table + chain + RPC + route + RLS + builder UI, at 8 SP (PO-ratified in comments; epic table already shows 8) | DECIDED-IN-PLAN |
| 2 | "Selectable / published ATC"? | "Published" deleted everywhere; selectable = any non-archived ATC in the active workspace. `atcs` has no archive state today, so selectable = every workspace ATC; revisit when archival ships | DECIDED-IN-PLAN |
| 3 | Idempotency window / key source / scope | Window = 24h table TTL; scope = `unique(user_id, endpoint, key)` + SHA-256 payload hash (all already built in 0009 + `lib/api/idempotency.ts`); `Idempotency-Key` header ***required**** on this endpoint — agents must supply it, UI auto-generates a UUID per form session. Server-derived fallback key for header-less clients is ****deferred**** (would modify the shared helper — cross-cutting) | DECIDED-IN-PLAN · ****ADR candidate — no ADR covers idempotency-key scoping for the headless surface; orchestrator to draft ***`ADR-0002-idempotency-key-scoping` |
| 4 | activity*log writer in scope? | Yes — implemented inside `bunkai*create_test` (0021/0023 precedent; ~10 lines, only sanctioned write path). This ***absorbs the write-path half of the proposed sibling "BK-2x"***, which was never created in Jira; the owner+admin read/visibility surface stays OUT of BK-27. Orchestrator: confirm with PO that BK-2x is dissolved or re-scoped to the read surface | DECIDED-IN-PLAN (PO sync recommended, non-blocking) |
| 5 | Foreign-ATC rejection status + copy | ***404 ***`not_found`, byte-identical to nonexistent-id case, copy `One or more selected ATCs are not available in this workspace.`, no id echo. Never 403/422 (existence leak) | DECIDED-IN-PLAN |
| 6 | Server-side re-validation (chain/title) | Yes — inside the RPC, below the HTTP layer (TC-08) | DECIDED-IN-PLAN |
| 7 | ATC deleted while chained | `test*steps.atc*id` ON DELETE ***RESTRICT***; `test_id` CASCADE | DECIDED-IN-PLAN |
| 8 | Workspace binding instant (E2) | Save-commit time — resolved server-side from authenticated context at submit (cookie for sessions, explicit `workspace_id` for PAT callers); mid-form switch re-targets binding; now-foreign ATCs → uniform 404 | DECIDED-IN-PLAN |
| 9 | Max chain length | No hard server cap in MVP; UI soft cap 100 with hint. TC-11 tests the UI cap + documents "no server cap" | DECIDED-IN-PLAN (PO ratification welcome, non-blocking) |
| 10 | Title trim | Trim then validate — `"  Cart  "` → `"Cart"`, valid | DECIDED-IN-PLAN |
| 11 | Title uniqueness | None — two Tests, same title, same workspace both succeed | DECIDED-IN-PLAN |
| 12 | Title-only vs description | ***Title-only*** — no description field anywhere in the mockup or ACs | DECIDED-IN-PLAN |
| 13 | Empty-chain copy | `A Test must include at least one ATC.` (verbatim from AC), server + UI identical | DECIDED-IN-PLAN |
| 14 | activity*log actor shape | `actor*user_id` uuid FK, per 0021 precedent | DECIDED-IN-PLAN |
| 15 | Join table name | `test*steps` — glossary canon (`domain-glossary.md` §3) + business-data/api maps all use it; overrides the Jira dev comment's `test*atcs`. Glossary wins | DECIDED-IN-PLAN |
| 16 | PAT capability for POST /tests | ***Reuse ***`atc:write` — adding `test:write` needs a migration widening the 0008 CHECK + principal + token-issuance changes mid-sprint; Tests are authoring-domain; RLS + the RPC role gate remain the real authorization (ADR-0001). Revisit when `run:execute` surfaces land | DECIDED-IN-PLAN |
| 17 | Builder surface (modal/page/pane) | Routed page `/projects/{slug}/tests/new`, by analogy with the ATC-creation precedent — mockup `TestDetail` is a placeholder. ***Orchestrator must record this derivation as a §5 ratified divergence in ****`master-design-plan.md`**** before Stage 2 UI work*** (silent invention is a defect per Critical Rule #15) | DECIDED-IN-PLAN (ratification entry required) |
| 18 | Test `code` (`T-{PROJ}-{SLUG}`) + tree placement under modules | Deferred — schema is title-only; explorer shows a flat "Tests" group (Tests have no module anchor). Fold into the same §5 ratification entry | DECIDED-IN-PLAN |

No question is classified NEEDS-PO: every open item has a ratifiable default that does not change the schema or API contract if later overturned (copy strings, soft cap, visibility surface).

---

> ***Appendix note******:*** Types & Type Safety, Content Writing (exact UI copy), Unit-Test Plan, Dependencies, Risks & Mitigations, Estimated Effort, and the DoD Checklist live in the issue comment "Spec Implementation Plan (Dev) — Appendix" (field content limit).

## Review Workload Forecast

```
## Review Workload Forecast

Estimated: 1816 additions + 53 deletions = 1869 total lines
400-line budget risk: High
Chain strategy: feature-branch-chain
Decision needed before apply: No
```

Per-file estimates (new ×1.5, modified ×1.0, ×1.2 tests/docs buffer; `lib/types/supabase.ts` excluded as generated):

| File | Op | Base | Weighted |
| --- | --- | --- | --- |
| `supabase/migrations/0024_tests.sql` | new | 220 | 330 |
| `lib/tests/validation.ts` | new | 60 | 90 |
| `lib/tests/errors.ts` | new | 50 | 75 |
| `app/api/v1/tests/route.ts` | new | 90 | 135 |
| `app/api/v1/tests/route.openapi.ts` | new | 120 | 180 |
| `app/(app)/projects/[projectSlug]/tests/new/page.tsx` | new | 60 | 90 |
| `components/tests/AtcChainPicker.tsx` | new | 170 | 255 |
| `components/tests/NewTestBuilder.tsx` | new | 170 | 255 |
| `lib/supabase/rpc.ts` | mod | 35 | 35 |
| `lib/api/error-envelope.ts` | mod | 6 | 6 |
| `lib/openapi/registry.ts` | mod | 6 | 6 |
| `app/(app)/projects/[projectSlug]/project-workbench.tsx` | mod | 15 | 15 |
| `app/(app)/projects/[projectSlug]/project-explorer.tsx` | mod | 60 | 60 |
| `app/(app)/projects/[projectSlug]/page.tsx` | mod | 25 | 25 |
| ***Sum**** |  | ****1557**** | ×1.2 = ****1869*** |

***Proposed chain (concrete)******:*** integration branch `feature/BK-27-test-builder` off `staging`; child PRs merge into it; final merge to `staging` is one `--no-ff` merge commit (matches this repo's main-integration flow).

- ***PR-1*** — Steps 1–3: migration 0024 + generated types (~400 reviewable; types marked `// generated, do not review`)
- ***PR-2*** — Step 4: domain lib + error codes + RPC wrapper (~255)
- ***PR-3*** — Steps 5–6: route + OpenAPI sibling + idempotency wiring (~380)
- ***PR-4*** — Step 7 components: `AtcChainPicker` + `NewTestBuilder` (~510; ≈40% declarative JSX/classNames — flagged for the reviewer as low cognitive density; split picker-first if the reviewer objects)
- ***PR-5*** — Steps 7 (page + workbench link) + 8 (explorer Tests group) + 9 (env-gated RLS test) (~320)

Notes: generated Supabase types excluded from budget per forecast doctrine; PR-4 is the only child above 400 and carries a written rationale in its description.

---
_Synced from Jira by sync-jira-issues_
