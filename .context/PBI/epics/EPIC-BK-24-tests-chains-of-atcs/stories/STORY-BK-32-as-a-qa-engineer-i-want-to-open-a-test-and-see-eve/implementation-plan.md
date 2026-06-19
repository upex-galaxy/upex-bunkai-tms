# BK-32 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-32)

# BK-32 — Implementation Plan (Dev)

> Story: ***TMS-Test View | View a test with all chained ATCs expanded*** — 3 SP, epic BK-24 (Tests — chains of ATCs). Formal dependency: BK-27 (shipped: `tests`/`test*steps` schema + `bunkai*create_test`).
Glossary canon applies throughout: ***Test**** (capital T) = named container owning an ordered ****chain**** of ****ATC**** references — references, never copies. Canonical join table is ****test******_******steps***. Banned: "test case" for a chain, "Atomic Test Component", "published ATC", "snapshot" for this view (live content only).

## Overview

Build the ***read-only expanded Test detail view***: open a Test → render its header (title + "N ATCs" summary) + the ordered chain of ATCs, each ATC expanded inline with its ordered steps and ordered assertions. One read surface, two consumers:

- Headless `GET /api/v1/tests/{id}?expand=atcs.steps,atcs.assertions` (mirrors `GET /api/v1/atcs/{id}` shape and auth).
- A routed server-component page `/projects/{projectSlug}/tests/{testId}` reached by clicking an explorer Tests-group row (BK-27 wired the rows as non-navigating divs; BK-32 makes them navigate).

Both consume ***one server-side read rulebook*** — a SECURITY DEFINER RPC `bunkai*get*test*expanded(p*actor*user*id, p*test*id)` returning composed jsonb (header + ordered chain; each chain item carries the live ATC header + ordered steps + ordered assertions). Strictly READ-ONLY: no drag handles, no edit/add/remove/reorder controls. Designed to be cleanly extensible for BK-28 (reorder), but BK-32 builds only the read path.

***Acceptance Criteria to satisfy (in-scope, after §3 confirmations)******:***

- AC Happy — Open a populated Test, every ATC expanded inline in chain order, steps then assertions per ATC, top summary "N ATCs".
- AC Order — Positions 1..n, no gaps, no repeats, matching saved execution order, for a longer (5/7-ATC) chain.
- AC Live — View reflects latest saved ATC content (references, not snapshots).
- AC Read-only — No edit/add/remove/reorder control anywhere; everything is read-only text.
- AC Empty-section — An ATC with 0 steps or 0 assertions renders a clear empty section state (NOT a zero-ATC empty Test — see Decision 1).
- AC Not-found — Missing / not-visible / foreign-workspace Test → safe non-disclosing not-found, no ATC content, with a way back to the Tests list.
- AC Cross-workspace — Foreign Test denied without leaking its ATCs/steps/assertions.
- AC Perf — 7-ATC expanded read returns in one round trip, <500ms p95.

***Epic invariant honored******:*** INV-3 tenant isolation (workspace-scoped read, non-disclosure for foreign/missing Tests).

***Resolved confirmations baked in (do NOT re-open — §3 of brief)******:***

1. NO zero-ATC empty state. A Test requires ≥1 ATC (BK-27 wins). BK-32-ATC-05 and the "Test has no ATCs" Gherkin scenario are DROPPED from scope. `business-rules.md` line ~10 ("A Test with zero ATCs is valid to open and shows an empty state") is ***overridden*** by this plan — flagged for PM/glossary reconciliation, not edited from here.
2. Route = `/api/v1/tests/{id}?expand=atcs.steps,atcs.assertions` (project `/api/v1` namespace).
3. Live ATC content (latest saved), never a snapshot.
4. Viewer role may read inside the workspace; cross-workspace denied with non-disclosing not-found. No new PAT scope.
5. All ATCs expanded by default (chains ≤ ~7; no accordion for MVP).

---

## Technical Approach

### The security-critical decision: RPC (SECURITY DEFINER) vs RLS-scoped nested select

***Chosen******:****** a single SECURITY DEFINER RPC ****`bunkai*get*test*expanded(p*actor*user*id, p*test*id)` that re-checks ****read-level*** membership against the explicit actor, then composes and returns one jsonb document. Consumed identically by the API route and the UI page.

***Why — the deciding constraint (ADR-0001 + the helper signature)******:**** route handlers run on the ****admin client**** (`createAdminClient()`), and `app/api/****` is ESLint-banned from `createClient().auth.getUser()`. Under the admin client `auth.uid()` is ****NULL****. Every BK-27/BK-04 RLS SELECT policy (`tests`, `test*steps`, `atcs`, `atc*steps`, `atc*assertions`) is built on `bunkai*is*workspace*member(ws*id)` which keys off `auth.uid()` (`0005*rls*helpers.sql:19-33`). So an ****RLS-scoped nested select issued from the API route returns ZERO rows*** — RLS isolation "for free" is unavailable on the surface that needs it most. This is exactly why BK-27's write path uses a DEFINER RPC with explicit `p*actor*user*id`, and why `bunkai*get*atc` (`0021:366`) is also DEFINER with an explicit actor. We mirror that proven precedent.

***The isolation tradeoff, made explicit (per brief §4.2)******:***

- A DEFINER RPC ***bypasses RLS****, so isolation is NOT free — the RPC MUST re-assert membership itself. We do this ****first***, before composing any payload, and we collapse "missing", "not-visible", and "foreign-workspace" into ONE uniform `P0002` raise that echoes nothing (INV-3 non-disclosure — same discipline as `bunkai*get*atc` and BK-27's 45122).
- An RLS-scoped nested select would get isolation for free ***only on a cookie-auth client**** (the UI page's `createClient()` has a real `auth.uid()`, which is why `atcs/[atcId]/page.tsx` can use plain `.from(...).select(...)`). But it is unusable from the API route, so choosing it would force ****two divergent read implementations*** (route via RPC-or-error, page via nested select) — violating the "one rulebook" guarantee and risking drift in the non-disclosure copy and the ordering logic.

***Read-level membership re-check (viewer-allowed) is a NEW helper, not a reuse******:**** the existing `bunkai*assert*actor*can*write*workspace` (0024) and `bunkai*assert*actor*can*write*project` (0021) both gate role ∈ (member, admin, owner) — they would wrongly ****deny viewers***, contradicting confirmation §3.4. We add `bunkai*assert*actor*can*read*workspace(p*actor*user*id, p*workspace*id)` that asserts only `status='active'` membership (any role, viewer included), raising `P0002` (not `42501`) on failure so a foreign/non-member request is indistinguishable from a nonexistent Test (no existence leak; never 403 here, which would itself disclose existence).

***Alternatives considered******:***

- **RLS nested select everywhere** — rejected: impossible from the admin-client API route (NULL `auth.uid()`), forces two implementations.
- **Reuse ****`****bunkai*********assert*********actor*********can*********write****_**`* — rejected: denies viewers (violates §3.4).
- **N separate child queries (one per ATC) in the route** — rejected: N+1, fails the <500ms-p95-for-7-ATC AC; the RPC composes everything in one round trip via correlated `jsonb*agg`, exactly like `bunkai*atc_json`.
- **Parse **`expand`** and conditionally compose** — rejected for MVP (see Decision 4): always return fully expanded; the `expand` param is accepted and ignored (documented), because the only consumer needs the full expansion and conditional composition is dead weight that BK-28 does not need either.

### Why this approach

- ✅ ADR-0001 compliant: route wrapped by `withApiHandler({ auth: 'required' })`; identity gateway resolves the principal; explicit `p*actor*user_id` flows to the RPC.
- ✅ One round trip, one rulebook: header + ordered chain + per-ATC steps/assertions composed server-side via `order by position` correlated aggregates (mirrors `bunkai*atc*json` `0021:69-104`).
- ✅ Non-disclosure by construction: membership re-check first; foreign/missing collapse into one `P0002` → `not_found`.
- ✅ Live content: the RPC reads `atcs`/`atc*steps`/`atc*assertions` directly at request time — no snapshot column anywhere (none exists; none added).
- ✅ Extensible for BK-28: the chain item already carries `position`; BK-28 layers a PATCH reorder RPC + drag UI on top without changing this read shape.
- ❌ Tradeoff: logic in plpgsql is harder to unit-test than TS — mitigated by env-gated RLS/isolation integration tests (clone `lib/api/rls-parity.test.ts`) and a thin TS error-map unit test.

---

## Data Model / DB layer (described — author during Step 1, apply via Supabase MCP)

No table changes. BK-27's `tests` (workspace-scoped: `id, workspace*id, title, created*by, created*at, updated*at`) and `test*steps` (`id, test*id, atc*id, position`, `unique(test*id, position)`) already exist (`0024_tests.sql`). ***No ****`version`**** column, no client UPDATE policy*** — those are BK-28's concern and are explicitly NOT touched here.

***New migration ***`supabase/migrations/0025*test*read.sql` (next free number after 0024) — read-path functions only, all SECURITY DEFINER, `set search*path = ''`, granted to `authenticated, service*role`, revoked from `public, anon` (0021/0024 grant pattern):

1. `bunkai*assert*actor*can*read*workspace(p*actor*user*id uuid, p*workspace*id uuid) returns void` — raises `P0002` ('not*found') unless an `active` `workspace*members` row exists for the actor (ANY role incl. viewer). Note: uses `P0002`, NOT `42501`, so non-members cannot distinguish "exists but forbidden" from "does not exist".

1. `bunkai*test*json(p*test*id uuid) returns jsonb` (language sql, stable) — composition helper, sibling of `bunkai*atc*json`. Shape:

   `
   {
     id, workspace*id, title, created*at, updated_at,
     atc*count,                               -- int, = count(test*steps)
     atcs: [                                  -- ordered by test_steps.position
       {
         position,                            -- test_steps.position (1..n)
         step*id,                             -- test*steps.id (chain-row id; STABLE handle BK-28 reorder needs)
         id, slug, title, layer, status,      -- live atc header
         steps:      [ { id, position, content, input*data, expected } ],  -- order by atc*steps.position
         assertions: [ { id, position, content } ]                          -- order by atc_assertions.position
       }, ...
     ]
   }
   `
   Real columns verified: `atc*steps(id, atc*id, position, content, input*data, expected)`, `atc*assertions(id, atc*id, position, content)` (`0004*atcs.sql:179-291`), both ordered by `position`. The outer `atcs` array is ordered by `test*steps.position` via `jsonb*agg(... order by ts.position)`. Live content: joins `atcs`/`atc*steps`/`atc*assertions` at query time. Includes `step*id` (the `test*steps.id`) so BK-28 has a stable per-row handle to reorder; harmless for BK-32 (used only as a React key).

1. `bunkai*get*test*expanded(p*actor*user*id uuid, p*test*id uuid) returns jsonb` (language plpgsql) — mirrors `bunkai*get*atc` (`0021:366`):

   `
   select workspace*id into v*ws from public.tests where id = p*test*id;
   if v*ws is null then raise exception 'test*not_found' using errcode = 'P0002'; end if;
   perform public.bunkai*assert*actor*can*read*workspace(p*actor*user*id, v_ws);
   return public.bunkai*test*json(p*test*id);
   `
   Validation order is load-bearing: existence probe → membership re-check → compose. Foreign-workspace and nonexistent collapse into the same `P0002` (membership check fails identically whether the Test is foreign or the id is random).

> Defence-in-depth note: BK-27's RLS SELECT policies on all five tables remain in force for the cookie-auth surface; the DEFINER RPC is the admin-client path and re-checks membership in-band.

---

## Domain layer (`lib/tests/*`, `lib/supabase/rpc.ts`)

- `lib/supabase/rpc.ts`*** (modify)*** — add `getTestExpanded(supabase, { actorUserId, testId })` wrapper next to `createTest` (`:145`) and `getAtc` (`:127`):

  `ts
  export async function getTestExpanded(supabase: Client, args: { actorUserId: string, testId: string }) {
    return supabase.rpc('bunkai*get*test*expanded', { p*actor*user*id: args.actorUserId, p*test*id: args.testId });
  }
  `

- `lib/tests/errors.ts`*** (modify)*** — extend the existing `mapTestRpcError` (BK-27) to handle the read path: `P0002` → `ApiError('not*found', 'Test not found.', { details: { reason: 'not*found' } })`; default → `internal_error`. (`42501` mapping already exists from BK-27; the read RPC never raises it, but keeping the case is harmless.)
- `lib/tests/errors.test.ts`*** (modify)*** — add a `P0002 → not_found` row.
- ***Error envelope / OpenAPI registry — NO change.*** Reuse the canonical `not*found` code (already in `API*ERROR*CODES` and the registry enum). We deliberately do NOT add a `test*not*found` code: a distinct code would itself be a weak existence signal, and `not*found` is the established non-disclosure code (mirrors BK-27 Decision 5 and `mapAtcRpcError` P0002). No `error-envelope.ts` / `registry.ts` edits needed for BK-32.
- ***No new Zod body schema*** — this is a GET with a path param + an ignored query param; the only input validation is the UUID-format guard on the path id (mirror `isUuid` in `atcs/[id]/route.ts`, → `bad_request` before any DB round trip).

---

## API layer

`app/api/v1/tests/[id]/route.ts`*** (new)*** — mirror `app/api/v1/atcs/[id]/route.ts`:

```
export const GET = withApiHandler(async (request, ctx) => {
  const testId = extractTestId(request);            // last path segment
  if (!isUuid(testId)) throw new ApiError('bad_request', 'Test id must be a UUID.');
  const { principal } = getAuth(ctx);
  const supabase = createAdminClient();
  const { data, error } = await getTestExpanded(supabase, { actorUserId: principal.userId, testId });
  if (error) mapTestRpcError(error);                 // P0002 -> 404 non-disclosing
  return jsonResponse({ test: data }, { status: 200 });
}, { auth: 'required' });                            // read auth only; NO `requires` write scope
```

- `expand` query param is accepted and ignored (always fully expanded) — documented in OpenAPI (Decision 4).
- `auth: 'required'` with NO `requires: ['atc:write']` — read uses the session/PAT identity only; viewer-role read is gated by the RPC's read-level membership check, not a write capability (§3.4, BK-27 Decision 16 parity for the read direction).
- Non-disclosure: foreign/missing both surface the identical `404 not_found` body.

`app/api/v1/tests/[id]/route.openapi.ts`*** (new)*** — `registerPath({ method: 'get', path: '/api/v1/tests/{id}', tags: ['Tests'] })`:

- Path param `id` (uuid); query param `expand` (string, optional, description: "Accepted for forward-compat; the response is always fully expanded in the MVP.").
- `security: [{ cookieAuth: [] }, { bearerAuth: [] }]`.
- Responses: `200` → `z.object({ test: ExpandedTestSchema })`; `400` malformed id; `401` not authenticated; `404` not found (missing or not visible — non-disclosing). No 403/409/422 (no body, no write, no lock).
- Define and export `ExpandedTestSchema` (reuse/import `AtcStepSchema`/`AtcAssertionSchema` shapes from `app/api/v1/atcs/route.openapi.ts` where practical, or declare local `ChainedAtcSchema`): `{ id, workspace*id, title, created*at, updated*at, atc*count, atcs: ChainedAtcSchema[] }`, where `ChainedAtcSchema = { position, step_id, id, slug, title, layer (enum UI|API|Unit), status, steps[], assertions[] }`.

---

## UI layer

***Design contract******:**** master-design-plan §8 row (line 271): **BK-32 → Projects detail (test view) → **`project.jsx`. The Test-detail screen has ****NO authored mockup**** — `project.jsx` `TestDetail` is a literal placeholder (`:564-570`). Per Critical Rule #15, this view is ****DERIVED by analogy*** and MUST be ratified as a §5 divergence before Stage 2 UI work (see Decision 8 + the §5 entry text at the bottom). Derivation sources:

- ATCDetail steps anatomy — ordered `<ol>`, `bg-2`, `1px stroke-2`, `--r-3`, two-digit mono position gutter `28px`, content `13px fg-1` (`project.jsx:476-501`).
- ATCDetail assertions anatomy — stacked `<code>` rows, `bg-2`, `--r-3`, mono `11.5px` (`project.jsx:502-518`).
- ATCDetail "Used by" chain-row anatomy — `8px 12px`, `bg-2`, `1px stroke-2`, `--r-2`, branch icon `12px fg-3`, mono id `11px fg-3`, layer chip (`project.jsx:528-546`); reused by BK-27 for chain rows and reused here for each ATC card header.
- ***Frozen §2 tokens only**** — reuse existing `components/ui/****` + utility classes (`bg-surface-**`/`bg-2`, `text-fg-*`, `dot`, `layer-chip`, `mono`) exactly as used in `project-workbench.tsx`/`project-explorer.tsx`. Do NOT re-derive colors/radii/fonts.
- ***§7 data-model gate******:*** no Runs exist — render ATC status as neutral `unrun` dots; NO "Run this" affordances.

***Routed page ****`app/(app)/projects/[projectSlug]/tests/[testId]/page.tsx`**** (new)*** — server component, mirror `atcs/[atcId]/page.tsx` structure:

1. `createClient()` (cookie) → resolve active workspace via `ACTIVE*WORKSPACE*COOKIE` + `resolveActiveWorkspaceId` (mirror `atcs/[atcId]/page.tsx:28-38`).
2. `notFound()` if no active workspace.
3. ***One read, one rulebook******:*** call `getTestExpanded(supabase, { actorUserId: <session user id>, testId })` — same RPC as the API route, so the page and the headless surface return byte-identical data and both satisfy the single-round-trip AC. On `error`/`P0002` → `notFound()` (Next renders the safe not-found page; AC Not-found). (Cookie client carries a real `auth.uid()`, but we still call the DEFINER RPC for one-rulebook parity; the RPC's own membership check is authoritative.)
4. Pass the composed `test` to `<TestDetailView test={test} projectSlug={projectSlug} />`.

> Note `projectSlug` here is the route's display context only; Tests are workspace-scoped (BK-27 D9), so the read is keyed by `testId` + active-workspace membership, not by project.

`components/tests/TestDetailView.tsx`*** (new)*** — presentational (server component, no client interactivity needed):

- Header: Test title (branch icon + title), summary chip rendering `"{atc_count} ATCs"` (`data-testid="test-detail-atc-count"`).
- Renders `test.atcs.map(...)` in array order (already ordered by the RPC) into `<ChainedAtcCard>`.
- Read-only: no buttons, no forms, no drag handles. `data-testid="test-detail-view"`.

`components/tests/ChainedAtcCard.tsx`*** (new)*** — presentational, one expanded ATC:

- Header row (ATCDetail "Used by" anatomy): `position` index badge, mono ATC `id`/`slug` (`11px fg-3`), `layer-chip`, title, neutral `unrun` status dot. NO chevron-to-collapse, NO controls.
- ***Steps section*** (`SectionLabel "Steps" + count`): ordered `<ol>` per ATCDetail anatomy; each row = two-digit mono position gutter + content. If `steps.length === 0` → clear empty state `"No steps"` (italic `fg-4`), NOT a blank gap (AC Empty-section, BK-32-ATC-04).
- ***Assertions section*** (`SectionLabel "Assertions" + count`): stacked `<code>` rows per anatomy (neutral styling — no pass/fail coloring; Runs don't exist). If `assertions.length === 0` → `"No assertions"` empty state.
- Long content (BK-32-ATC-09): wrap/`break-words`, no truncation that hides required detail; no horizontal scroll trap.
- `data-testid="chained-atc-card-{position}"`, `chained-atc-steps-{position}`, `chained-atc-assertions-{position}`, `chained-atc-steps-empty-{position}`, `chained-atc-assertions-empty-{position}`.

***Explorer wiring — ****`app/(app)/projects/[projectSlug]/project-explorer.tsx`**** (modify)******:*** the Tests-group rows are currently non-navigating `<div data-testid={`explorer-test-${t.id}`}>` (`:271-282`). Wrap each row in `Link href={`/projects/${projectSlug}/tests/${t.id}`}` (mirror the ATC nav pattern in `components/atcs/AtcTable.tsx:42-43`), preserving the existing row markup (branch icon, title, mono chain-count, `unrun` dot) and the `data-testid`. Keep the BK-27 accordion/collapse/resize behaviors intact (no regression to §5 D8).

***Read-only guarantee (BK-32-ATC-07)******:*** no component imports any mutation action, `<form>`, `<button>` with a handler, drag lib, or `New/Edit/Remove/Reorder` affordance. The page is a pure projection. A UI test asserts the absence of `[data-testid$="-remove"]`, `[draggable]`, edit/reorder controls.

***data-testids (kebab-case, entity-prefixed)******:*** `test-detail-view`, `test-detail-title`, `test-detail-atc-count`, `chained-atc-card-{position}`, `chained-atc-steps-{position}`, `chained-atc-assertions-{position}`, `chained-atc-steps-empty-{position}`, `chained-atc-assertions-empty-{position}`. Existing reused: `explorer-test-{id}`, `explorer-tests-group`.

---

## Implementation Steps

### Step 1 — Migration 0025: read RPC + helper

***Task******:*** Author `supabase/migrations/0025*test*read.sql`: `bunkai*assert*actor*can*read*workspace` (viewer-allowed, P0002), `bunkai*test*json` (composition, ordered by `test*steps.position` / `atc*steps.position` / `atc*assertions.position`), `bunkai*get*test_expanded` (existence → membership → compose). Grants/revokes per 0024 pattern. Apply via Supabase MCP.
***Files******:*** `supabase/migrations/0025*test*read.sql` (new).
***Edge cases******:*** missing Test and foreign-workspace Test BOTH raise identical P0002 (no existence leak); viewer (non-writer) member passes the read assert; ATC with 0 steps / 0 assertions → `coalesce(..., '[]'::jsonb)` (never null); chain order strictly by `test_steps.position`.
***Testing******:*** SQL-level via MCP — member happy path returns header + ordered `atcs` with nested steps/assertions; viewer member succeeds; non-member/foreign/random-uuid all raise P0002; 0-step ATC returns `steps: []`.
***verify******:*** RPC as member returns composed jsonb in one call; foreign-Test call raises P0002.
***Estimated time******:*** 4h

### Step 2 — Regenerate DB types

***Task******:*** `bun run types:gen` → `lib/types/supabase.ts` gains the new RPC signatures (`bunkai*get*test_expanded`, etc.).
***Files******:*** `lib/types/supabase.ts` (generated — excluded from review budget).
***verify******:*** `bun run types:check` exits 0.
***Estimated time******:*** 0.5h

### Step 3 — Domain layer: RPC wrapper + read error mapping

***Task******:*** Add `getTestExpanded` to `lib/supabase/rpc.ts`; extend `mapTestRpcError` (`lib/tests/errors.ts`) with `P0002 → not_found`; add the unit-test row.
***Files******:*** `lib/supabase/rpc.ts` (mod), `lib/tests/errors.ts` (mod), `lib/tests/errors.test.ts` (mod).
***Edge cases******:*** P0002 → 404 with non-disclosing copy `Test not found.`; default → internal_error.
***Testing******:*** `bun test lib/tests` green.
***verify******:*** `bun test lib/tests` passes; `bun run types:check` clean.
***Estimated time******:*** 1.5h

### Step 4 — API route `GET /api/v1/tests/[id]` + OpenAPI sibling

***Task******:*** New route mirroring `atcs/[id]/route.ts` (UUID guard → getAuth → admin client → `getTestExpanded` → `mapTestRpcError` → `jsonResponse({ test }, 200)`), `auth: 'required'`, no write scope. Author `route.openapi.ts` with `ExpandedTestSchema`/`ChainedAtcSchema`, the `expand` query param (accepted/ignored), and 200/400/401/404 responses.
***Files******:*** `app/api/v1/tests/[id]/route.ts` (new), `app/api/v1/tests/[id]/route.openapi.ts` (new).
***Edge cases******:*** non-UUID id → 400 before DB; foreign/missing → identical 404 body; `expand` value never changes the response.
***Testing******:*** curl matrix — member 200 (full nested payload, ordered); foreign-Test 404 == random-uuid 404 (byte-identical); unauth 401; non-UUID 400.
***verify******:*** `bun run openapi:gen && bun run openapi:diff` clean; curl matrix passes against `bun run dev`.
***Estimated time******:*** 3h

### Step 5 — UI page + presentational components

***Task******:*** Build `tests/[testId]/page.tsx` (active-workspace resolution → `getTestExpanded` via one RPC → notFound on error) + `TestDetailView` + `ChainedAtcCard` per the UI section. Strictly read-only; frozen tokens; ATCDetail anatomy.
***Files******:*** `app/(app)/projects/[projectSlug]/tests/[testId]/page.tsx` (new), `components/tests/TestDetailView.tsx` (new), `components/tests/ChainedAtcCard.tsx` (new).
***Edge cases******:*** ATC with 0 steps/0 assertions → explicit empty-section copy (not blank); long step/assertion text wraps; foreign/missing Test → Next not-found page with a path back to the project/Tests list.
***Testing******:*** dev-server flow — open a 3-ATC Test: 3 cards in order 1/2/3, steps-then-assertions, summary "3 ATCs"; open a 5/7-ATC Test: positions 1..n no gaps; open a bookmarked-then-deleted Test id → not-found page; no edit/reorder/remove control present.
***verify******:*** manual flow on `bun run dev` renders ordered expanded chain + "N ATCs"; not-found path is safe and non-blank.
***Estimated time******:*** 6h

### Step 6 — Explorer wiring: Test rows navigate

***Task******:*** Wrap each `explorer-test-{id}` row in a `Link` to `/projects/{projectSlug}/tests/{id}` (mirror `AtcTable`), preserving markup + testid; keep BK-27 accordion/collapse/resize behaviors intact.
***Files******:*** `app/(app)/projects/[projectSlug]/project-explorer.tsx` (mod).
***Edge cases******:*** clicking a row navigates without breaking the accordion toggle; cross-workspace member never sees foreign Tests in the group (RLS on the page-load query already filters).
***Testing******:*** click a Test row → lands on its detail view; explorer collapse/resize still work.
***verify******:*** row click opens the correct Test detail; no regression to explorer interactions.
***Estimated time******:*** 1h

### Step 7 — Integration verification sweep

***Task******:*** Full quality gate in order (Critical Rule #6/#14): `bun test` → `bun run types:check` → `bun run lint:check` → `bun run openapi:diff` → manual smoke on `bun run dev`. Add an env-gated RLS/isolation test cloned from `lib/api/rls-parity.test.ts`: WS-X member reading a WS-Y Test id via the RPC raises P0002 / yields nothing; viewer-role member reads successfully; 7-ATC payload returns in one call (perf sanity). NEVER a production build.
***Files******:*** `lib/tests/read-isolation.test.ts` (new — env-gated `describe.skip` without Supabase creds).
***verify******:*** all four commands exit 0; smoke flow passes; isolation test green when creds present.
***Estimated time******:*** 2h

---

---

> ***Appendix**** (field content limit): Traceability matrix, Technical Decisions, and Review Workload Forecast live in the issue comment ****"Spec Implementation Plan (Dev) — Appendix"***.

---
_Synced from Jira by sync-jira-issues_
