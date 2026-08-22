# BK-89 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

# Implementation Plan: STORY-BK-89 - TMS-Workspace | View the workspaces I belong to

## Overview

Give a signed-in user a read-only "Workspaces" section (`/settings/workspaces`, already live-linked from the [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) Settings nav as a "coming soon" placeholder) listing every workspace they actively belong to, with their role in each, and a clear marker for the currently active one.

***Acceptance Criteria to satisfy:***

- AC 1 — Multi-workspace user sees a list with roles, active workspace visually distinguished.
- AC 2 — Single-workspace user sees a clean state (role shown too, no broken layout, no leave/add controls).
- AC 3 — Suspended/invited memberships are excluded.
- AC 4 — Owner role resolves and displays as "Owner".

---

## Technical Decisions (Story-specific)

### Decision 1: Active-workspace transport — reuse the [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) cookie mechanism

***Chosen:*** Reuse the existing `bk*active*ws` cookie + `resolveActiveWorkspaceId()` (`lib/workspaces/active.ts`, `lib/api/workspace-cookie.ts`) that [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) already shipped and that `(app)/layout.tsx`, `/settings/account`, and the workspace switcher already depend on. No new mechanism, no new DB column, no new API field for "active."

***Reasoning:***

- Source: Jira comment, Ely, 2026-07-31 03:32 — "Dev contract resolved — role field + active-workspace transport." Quote: "this isn't actually an open architectural question anymore — it's precedent already in the codebase. [https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89](https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89) reuses it as-is."
- ✅ Zero new surface area; the exact same resolution `/settings/account/page.tsx` already runs (cookie → `resolveActiveWorkspaceId` → compare workspace id) is copied verbatim into the new page.
- ✅ Consistent with PO Decision 2 (comment, 2026-06-12): "Dev to confirm the data contract... needed to drive this indicator" — this **is** that confirmation.
- ❌ Trade-off: none identified — this is adopting shipped precedent, not a new trade-off.

### Decision 2: `role` on `GET /api/v1/workspaces` — second query, manual JS merge

***Chosen:*** Add a second `workspace*members` query scoped to the caller's own `user*id` (`.eq('user*id', principal.userId).eq('status', 'active')`), then merge `role` onto each `workspaces` row by `workspace*id` in a pure JS function — not a PostgREST embedded-select.

***Reasoning:***

- Source: same Jira comment (2026-07-31). Quote: "Widen it: add a second query to `workspace*members` scoped to the caller's own `user*id`... merge in `role`... per workspace by `workspace_id`," explicitly matching "the same shape BK-87's PR2 already used for its workspace list."
- ✅ Matches the exact precedent already live in `app/(app)/settings/account/page.tsx`'s `WorkspacesSection` (lines 107-154): two queries, manual `Map`-based join, no embedded-select string.
- ✅ RLS-safe: both queries run through the caller's own authenticated client; no admin-client bypass needed (member-count enrichment, which [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) does need an admin client for, is out of scope here — see Decision 4).
- ❌ Trade-off: one extra round-trip per request vs. a PostgREST embedded select (`workspace_members(role)`), but this repo has an established convention against embedded-select syntax (cited by both `lib/account/workspaces.ts` and the Dev-contract comment itself), so consistency wins over a marginal round-trip.

### Decision 3: AC2/AC3/AC4 resolutions (open annotations not covered by the Dev-contract)

***AC 2 — Role label for single-workspace users:**** show it. PO Decision 1 (comment, 2026-06-12, "Display layout per workspace entry") specifies Title = name / Subtitle = role label for **every* workspace entry with no single-vs-multi carve-out. The AC's own annotation flags this as needing confirmation, but the PO decision already answers it generically — resolving "yes" is not a guess, it's applying an existing decision to a case it didn't explicitly exclude.

***AC 3 — Invited/suspended memberships:*** excluded entirely, no "Pending" state built. Verified two independent enforcement points, not just the AC's own claim:

1. RLS policy `workspaces*select*active*member` (`supabase/migrations/0001*tenancy.sql:68-79`) restricts `workspaces` SELECT to rows where `EXISTS (... wm.status = 'active')` — an invited/suspended-only membership never returns a `workspaces` row at all, at the database level, regardless of any application code.
2. The already-shipped `WorkspacesSection` in `settings/account/page.tsx:111-116` additionally filters its own `workspace_members` query with `.eq('status', 'active')` as defense-in-depth.

QA's own [https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140](https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140) (TC03, "active memberships filter — DB cross-validation") already PASSED against this exact behavior per the 2026-06-12 QA session comment. Combined with PO Decision 3 ("this story is read-only... minimal net-new UI surface"), building a distinct "Pending" state would be scope creep with no data source feeding it (invited/suspended rows are structurally invisible to this endpoint). Resolution: exclude entirely, matching the mockup's own footer copy ("Only active memberships are listed — invitations and suspended memberships never appear here").

***AC 4 — Owner role source + label:*** the API returns `role` as a real column value, no client-side `owner*user*id` comparison needed. Verified in `supabase/migrations/0001*tenancy.sql:43-44`: `workspace*members.role` is `text not null default 'member' check (role in ('viewer','member','admin','owner'))` — `'owner'` is a first-class value the workspace-bootstrap RPC already inserts at creation time (`0006*bootstrap*workspace.sql`), the same mechanism [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) already relies on. Displayed label: "Owner" — produced by the existing, already-unit-tested `roleLabel()` helper (`lib/account/role-label.ts` — capitalizes the raw DB value; `role-label.test.ts` already asserts `roleLabel('owner') === 'Owner'`). No new logic needed for AC4 beyond Decision 2's join.

### Decision 4: Design fidelity — reuse the [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) hub shell + `WorkspacesList`, not a from-scratch build

***Chosen:*** Build inside the existing Settings hub shell (`app/(app)/settings/layout.tsx` + `SettingsNav`) that [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) already ships — no shell/nav changes needed, since `lib/settings/nav-items.ts` already lists {{{ id: 'workspaces', label: 'Workspaces', href: '/settings/workspaces' }}} under `SETTINGS*NAV*AVAILABLE` (the nav link is live today; it currently 200s into a `ComingSoon` placeholder at `app/(app)/settings/workspaces/page.tsx`). This story replaces that placeholder's content only.

For the list itself, reuse `components/settings/WorkspacesList.tsx` / `WorkspacesListSkeleton` unchanged. That component ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) PR2) already renders exactly what [https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89](https://jira.upexgalaxy.com/browse/BK-89#icft=BK-89) needs: name + slug, a role `Badge` via `roleLabel()`, an active dot+text indicator (`ws.isActive`), and a member count — built against the same frozen §2 tokens (`Badge`, `Card`, `text-fg-*`) DESIGN.md and the master-design-plan define, so no new component or token work is needed.

***Mockup found and cross-checked:*** `.context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-workspaces.html`, spec'd in `master-design-plan.md` §4.10 (row present in §8 US→Screen map: "BK-89 View my workspaces | Settings · Shell switcher | §4.10 · `settings-workspaces.html`" — no missing-row gate to flag). The mockup's table (Workspace/Your role/Members/Since/Actions) confirms: role chips for every row (✅ matches AC2 resolution and `WorkspacesList`'s existing role badge), "only ACTIVE memberships" (✅ matches AC3 resolution), and active = dot + text (✅ matches `WorkspacesList`'s existing `isActive` treatment). Two mockup elements are deliberately NOT built: the "Since" (`joined_at`) column and the entire "Actions" (Leave) column — the latter is explicitly Out of Scope (owned by [https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90](https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90)), the former is a minor visual gap versus the mockup that the already-shipped `WorkspacesList` doesn't have either; per Rule #14 (Live-UI-First), this is filed as a follow-up polish item, not forced into this story's diff.

***Reasoning:***

- ✅ Zero new component code for the list itself — maximizes reuse of already-tested, already-token-compliant UI (Live-UI-First doctrine, Rule #14).
- ✅ Matches PO Decision 1 (Title=name, Subtitle=role) and the mockup's role-chip-per-row pattern simultaneously — no conflict between "current live UI" and "mockup" for this story.
- ❌ Trade-off: the reused component shows `slug` (mono) and `memberCount`, which the PO's minimal Decision 1 note didn't explicitly ask for. Both are already-shipped, already-designed elements of the **same** Settings hub (visible today on `/settings/account`) and the mockup independently confirms a Members count column is expected — so this is additive consistency with the existing hub, not a departure requiring ADR ratification (it doesn't touch backend or architecture, and it doesn't contradict any explicit PO instruction).

### Decision 5: `role` widening is API-route-local — new page queries Supabase directly, does not call its own REST endpoint

***Chosen:*** `app/(app)/settings/workspaces/page.tsx` follows the exact same convention `settings/account/page.tsx` already established: a server component that queries Supabase directly (not via `fetch('/api/v1/workspaces')`). The public REST endpoint (`GET /api/v1/workspaces`) is widened independently because it is a separately-contracted, Bearer-PAT-reachable API surface with its own ATP test cases ([https://jira.upexgalaxy.com/browse/BK-136#icft=BK-136](https://jira.upexgalaxy.com/browse/BK-136#icft=BK-136)/139/140/141) — not because the UI consumes it.

***Reasoning:***

- ✅ Matches the only existing precedent in this repo for a Settings page (no Settings page fetches its own API route).
- ✅ Keeps the REST contract change (Decision 2) and the UI change decoupled and independently testable/reviewable.
- ❌ Trade-off: the "join workspaces + workspace*members by workspace*id, keep the role" query-orchestration shape is written twice (once in the route handler, once in the new page's own async section function) rather than shared. Given this mirrors the **existing** un-shared duplication pattern between `settings/account/page.tsx`'s inline `WorkspacesSection` and the route handler (they already don't share code today), and touching the already-shipped, already-tested `settings/account/page.tsx` to force a shared helper is out of proportion for a 2sp story, this duplication is accepted as-is. Flag as a candidate extraction if a third consumer appears (`agentic-dev-core` DRY rule: "Move to shared/ only when ≥2 features import AND abstraction stable" — stability isn't established yet with just 2).

---

## API changes — `GET /api/v1/workspaces`

***New file*** `app/api/v1/workspaces/response.ts` (dependency-free pure module, mirrors `app/api/v1/me/active-workspace/response.ts`'s isolation pattern so it's unit-testable without mocking `withApiHandler`/Supabase):

```
export interface WorkspaceMembershipRole {
  workspace_id: string
  role: string
}

export interface WorkspaceRecord {
  id: string
  slug: string
  name: string
  owner*user*id: string
  plan: string
  created_at: string
}

export interface WorkspaceWithRole extends WorkspaceRecord {
  role: string | null
}

// Manual JS-side join (not a PostgREST embedded-select), matching the
// convention this repo already uses in lib/account/workspaces.ts and the
// pattern BK-87 PR2 shipped for its own workspace list.
export function mergeWorkspaceRoles(
  workspaces: WorkspaceRecord[],
  memberships: WorkspaceMembershipRole[],
): WorkspaceWithRole[] {
  const roleByWorkspaceId = new Map(memberships.map(m => [m.workspace_id, m.role]));
  return workspaces.map(ws => ({ ...ws, role: roleByWorkspaceId.get(ws.id) ?? null }));
}
```

`app/api/v1/workspaces/route.ts` ***GET handler*** — widen to:

```
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx); // was: const { db } = getAuth(ctx);
  const { data, error } = await db
    .from('workspaces')
    .select('id, slug, name, owner*user*id, plan, created_at')
    .order('created_at', { ascending: true });
  if (error) { throw new ApiError('internal_error', error.message); }

  const { data: memberships, error: membershipsError } = await db
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', principal.userId)
    .eq('status', 'active');
  if (membershipsError) { throw new ApiError('internal_error', membershipsError.message); }

  return jsonResponse({ workspaces: mergeWorkspaceRoles(data ?? [], memberships ?? []) });
}, { auth: 'required' });
```

Note the explicit `.eq('status', 'active')` on the second query is defense-in-depth, not the primary enforcement — RLS (`workspaces*select*active_member`) already restricts which `workspaces` rows are visible; this just keeps the merged `role` value itself scoped to an active membership too, consistent with the [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) pattern.

`app/api/v1/workspaces/route.openapi.ts` — do NOT widen the existing shared `WorkspaceSchema` (it's also used by `POST /api/v1/workspaces`'s create-response and by `GET /api/v1/workspaces/[id]`, neither of which computes `role` — widening it there would misdocument those two endpoints). Instead add a new schema used only by the list response:

```
const WorkspaceWithRoleSchema = WorkspaceSchema
  .extend({ role: z.enum(['viewer', 'member', 'admin', 'owner']).nullable() })
  .openapi('WorkspaceWithRole');

const ListResponseSchema = z
  .object({ workspaces: z.array(WorkspaceWithRoleSchema) })
  .openapi('WorkspaceListResponse'); // was z.array(WorkspaceSchema)
```

`app/api/v1/workspaces/route.test.ts` (new) — unit tests for `mergeWorkspaceRoles` in isolation (no DB/Supabase mocking, same style as `active-workspace/route.test.ts`):

- merges `role` onto the matching workspace by `workspace_id`.
- a workspace with no matching membership row gets `role: null` (defensive — shouldn't happen given RLS, but the function must not throw).
- preserves workspace field order/values (`id`, `slug`, `name`, `owner*user*id`, `plan`, `created_at`) unchanged, only adds `role`.
- empty `memberships` array → every workspace gets `role: null`, no crash.

---

## UI changes — `/settings/workspaces`

Replace the current `ComingSoon` placeholder body in `app/(app)/settings/workspaces/page.tsx` with a real page, structurally mirroring `app/(app)/settings/account/page.tsx`'s existing `WorkspacesSection` pattern (own async server component, own `<Suspense>` boundary, `WorkspacesList`/`WorkspacesListSkeleton` reused unchanged — see Decision 5 for why this isn't shared code):

- Resolve `user` via `supabase.auth.getUser()`; redirect to `/login?next=/settings/workspaces` if absent (same guard as the account page).
- Resolve `activeWorkspaceId` via `cookies()` → `ACTIVE*WORKSPACE*COOKIE` → `resolveActiveWorkspaceId()` (Decision 1 — reused verbatim, no new logic).
- Page header: `<h1>Workspaces</h1>` + `<p>Every workspace you belong to, and the one you're working in right now.</p>` (matches mockup's `page-head` copy, `.context/designs/.../settings-workspaces.html` lines ~717-719).
- `WorkspacesSection` (local async function, same file): query `workspace*members` (`.eq('user*id', userId).eq('status','active')`) → query matching `workspaces` rows + the admin-client active-member-count aggregate (same two-query shape as `settings/account/page.tsx:111-140`) → `buildWorkspaceRows()` (reused, already tested) → render `<WorkspacesList workspaces={rows} />`; any thrown error is caught locally and rendered as `<WorkspacesList workspaces={[]} error />` (same TD7 isolation contract already established).
- Loading state: `<Suspense fallback={<WorkspacesListSkeleton />}>` around the section (component reused unchanged).
- Empty/single-workspace state: no new code — `resolveWorkspacesViewState()` already branches to `'empty'` (zero rows) vs `'list'` (one or more rows, rendered identically regardless of count, so a single row never looks broken — satisfies AC2's "no broken or empty-looking space").
- No leave/switch/add controls anywhere on this page (Decision 3/AC3 resolution + Out of Scope — the reused `WorkspacesList` component has no such controls to begin with).

No changes needed to `SettingsNav.tsx` or `lib/settings/nav-items.ts` — the `/settings/workspaces` nav entry is already live ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87)), it just currently 200s into `ComingSoon`.

---

## Acceptance Test Plan mapping

Every item in `acceptance-test-plan.md` (4 created Jira TCs + 13 blocked/deferred outlines) maps to one of 5 implementation steps below. None are skipped.

| ***ATP item**** | ****Was blocked on**** | ****Implementation step*** |
| --- | --- | --- |
| TC01 ([https://jira.upexgalaxy.com/browse/BK-136#icft=BK-136](https://jira.upexgalaxy.com/browse/BK-136#icft=BK-136)) — 200, correct shape | — (passed already) | Step 1 (API widening) — shape now includes `role`; existing shape assertions still hold |
| TC02 ([https://jira.upexgalaxy.com/browse/BK-139#icft=BK-139](https://jira.upexgalaxy.com/browse/BK-139#icft=BK-139)) — unauthenticated 401 | — (passed already) | Step 1 — `withApiHandler(..., { auth: 'required' })` unchanged, still returns 401 |
| TC03 ([https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140](https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140)) — active-memberships-only, DB cross-validation | — (passed already) | Step 3 (AC3 verification) — RLS + explicit `status='active'` filter, re-verified, no regression |
| TC04 ([https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141](https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141)) — role field absent (blocker) | BLOCKER 1 | Step 1 + Step 2 (unit tests) — ***inverts***: after this story, `role` is present; QA must update TC04's assertion from "absent" to "present" before re-running (flagged for QA, not a dev step) |
| P-01 — 2-workspace user, correct names | BLOCKER 1 | Step 1 + Step 4 (UI list rendering) |
| P-02 — role label renders correctly per role value | BLOCKER 1 | Step 1 (role sourced) + Step 4 (`roleLabel()` rendering, already unit-tested) |
| P-05 — owner role label displays correctly | BLOCKER 1 | Step 1 + Decision 3/AC4 resolution + Step 4 |
| AC 4 outline — owner resolves from `owner*user*id` | BLOCKER 1 | Step 1 + Decision 3/AC4 resolution (role is a DB value, not derived client-side) |
| P-03 — active workspace visually marked, 2-workspace user | BLOCKER 2 | Step 5 (active-indicator wiring, Decision 1) |
| P-04 — single workspace renders cleanly with active indicator | BLOCKER 2 | Step 5 + Step 4 (empty/single-state reuse) |
| N-01 — suspended membership excluded | test data | Step 3 (AC3 verification) |
| N-02 — invited membership excluded | test data | Step 3 (AC3 verification) |
| B-01 — zero active workspaces, empty state | test data | Step 4 — `resolveWorkspacesViewState()`'s existing `'empty'` branch |
| N-04 — cross-tenant isolation | test data | Step 3 — RLS (`workspaces*select*active_member`) already enforces this; re-verify, no new code |
| I-01 — cookie-session auth path returns correct list | partial session | Step 1 — `getAuth()`/RLS already serve cookie and Bearer-PAT callers identically (`route.ts`'s own header comment already states this) |
| B-03 — loading state while request in flight | [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) dependency (shipped) | Step 4 — `<Suspense fallback={<WorkspacesListSkeleton />}>` |
| I-03 — navigation from Settings Hub to Workspaces | [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) dependency (shipped) | Step 4 — nav entry already live; this step makes the destination real |

***17 ATP items → 5 implementation steps, all covered.***

---

## Implementation Steps

### Step 1: Widen `GET /api/v1/workspaces` to return `role`

***Task:*** Add the `workspace_members` query + `mergeWorkspaceRoles()` merge to the GET handler; extend the OpenAPI contract with a list-only `WorkspaceWithRoleSchema`.

***Files:***

- `app/api/v1/workspaces/response.ts` (new)
- `app/api/v1/workspaces/route.ts` (modify — GET handler only; POST is untouched)
- `app/api/v1/workspaces/route.openapi.ts` (modify)

***Edge cases handled:***

- No membership row for a workspace (shouldn't happen under RLS, but defensive): `role: null`, no crash.
- Caller with zero workspaces: both queries return empty arrays, `mergeWorkspaceRoles([], [])` → `[]`.

***Testing:*** Step 2 (unit tests below). Manual: `curl` the endpoint with a staging Bearer PAT for a multi-role test user, confirm `role` appears per workspace and matches the DB.

***Estimated time:*** 1.5h

### Step 2: Unit tests for `mergeWorkspaceRoles`

***Task:*** `app/api/v1/workspaces/route.test.ts` — 4 cases per the ATP mapping table (merge by id, defensive null, field preservation, empty-memberships).

***Testing:*** `bun test app/api/v1/workspaces/route.test.ts`.

***Estimated time:*** 0.5h

### Step 3: Verify AC3 exclusion + cross-tenant isolation (no new code)

***Task:*** Confirm (not build) that `workspaces*select*active_member` RLS + the explicit `.eq('status','active')` filter from Step 1 keep invited/suspended memberships and other tenants' workspaces out of the response. Re-run BK-140's staging query manually against a test account with a suspended/invited membership fixture (QA already has these per `acceptance-test-plan.md`'s "blocked on test data" note — coordinate with QA rather than fabricating fixtures in this story).

***Testing:*** Manual staging verification (documented in the PR description); no new automated test needed since the enforcement is RLS/DB-level and already exercised by TC03 ([https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140](https://jira.upexgalaxy.com/browse/BK-140#icft=BK-140), already PASSED).

***Estimated time:*** 0.5h

### Step 4: Build the `/settings/workspaces` page

***Task:*** Replace the `ComingSoon` placeholder body with a real page reusing `WorkspacesList`/`WorkspacesListSkeleton`, per the UI changes section above.

***Files:*** `app/(app)/settings/workspaces/page.tsx` (modify)

***Structure/Logic:***

- Page header copy (mockup-aligned).
- `WorkspacesSection` async local function: two-query fetch (`workspace_members` + `workspaces` + admin member-count aggregate) → `buildWorkspaceRows()` → `<WorkspacesList>`.
- `<Suspense>` + skeleton fallback.
- try/catch → error-state render on failure (TD7 isolation, matches account page).

***Edge cases handled:***

- Zero workspaces → `WorkspacesList`'s existing `'empty'` state (Create workspace CTA to `/onboarding`).
- Exactly one workspace → same `'list'` render path as multi-workspace, no special-casing, so no broken/empty-looking layout (AC2).
- Failed query → `'error'` state with Retry button (existing behavior, reused).

***Testing:*** Manual smoke on staging: 3 scenarios (multi-workspace user, single-workspace user, forced-error via network throttling) — Live-UI validation itself is suspended for this run per avalanche-2026-07 §9b, so this is a manual check during Stage 2/3, not an automated E2E gate.

***Estimated time:*** 2h

### Step 5: Active-workspace indicator wiring

***Task:*** Confirm the page's `activeWorkspaceId` resolution (cookie → `resolveActiveWorkspaceId`) correctly flows into `buildWorkspaceRows()`'s `isActive` comparison, and that `WorkspacesList` renders the dot+"active" text treatment. This is largely covered by Step 4's implementation (same code path) — called out separately because it's the direct closure of BLOCKER 2 / PO Decision 2.

***Testing:*** Manual: switch active workspace via the existing switcher, reload `/settings/workspaces`, confirm the indicator moves to the newly-active row.

***Estimated time:*** included in Step 4 (no separate time budget).

---

## Unit Test Authoring Gate

Per the Stage 2 gate (scenario/module-driven, not percentage-based):

- ***New pure-logic unit requiring a co-located test:*** `mergeWorkspaceRoles()` in `app/api/v1/workspaces/response.ts` — pure, deterministic, business-relevant (it's the whole Dev-contract resolution for `role`). Covered by Step 2's `route.test.ts`, mirroring the existing `active-workspace/route.test.ts` pattern exactly (import the pure function, no framework mocking).
- ***Reused pure logic, no new test needed:*** `buildWorkspaceRows()`, `countActiveMembersByWorkspace()`, `resolveWorkspacesViewState()` (`lib/account/workspaces.ts`) and `roleLabel()` (`lib/account/role-label.ts`) are unchanged and already covered by `lib/account/workspaces.test.ts` / `role-label.test.ts`.
- ***Exempted as presentational/pass-through (logged, not silently skipped):*** the new `WorkspacesSection` async function inside `settings/workspaces/page.tsx` is I/O orchestration (Supabase queries + wiring), not pure logic — same exemption already implicitly applied to the identical pattern in `settings/account/page.tsx`'s `WorkspacesSection`, which also has no direct unit test. `route.ts`'s GET handler itself is likewise exempt (thin orchestration around `mergeWorkspaceRoles`, which IS tested).
- ***No bug fix in this story***, so the regression-test rule (c) doesn't apply.

---

## Dependencies

***Pre-requisites (all already satisfied):***

- [x] [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) shipped (2026-07-30) — Settings hub shell, nav, `bk*active*ws` cookie, `resolveActiveWorkspaceId`, `WorkspacesList`/`WorkspacesListSkeleton`, `buildWorkspaceRows`.
- [x] Dev contract resolved (Jira comment, 2026-07-31) — both blockers closed, no open PO/Dev question left blocking code.

No blocking pre-requisites remain.

---

## Risks & Mitigations

***Risk 1:*** Widening the shared `WorkspaceSchema` by mistake would silently misdocument `POST /api/v1/workspaces` and `GET /api/v1/workspaces/[id]` as also returning `role` (they don't compute it).

- ***Impact:*** Medium — API consumers relying on the OpenAPI doc could assume `role` is present where it isn't.
- ***Mitigation:*** Decision covered explicitly (API changes section) — a new `WorkspaceWithRoleSchema` is added for the list response only; the base `WorkspaceSchema` is untouched.

***Risk 2:**** QA's existing TC04 ([https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141](https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141)) asserts `role` is **absent* — a stale assertion after this story ships would show as a false regression.

- ***Impact:*** Low — cosmetic QA confusion, not a functional risk.
- ***Mitigation:*** Flagged explicitly in the ATP mapping table; call out in the PR description that TC04 needs its expected-result updated by QA (not a dev-side change).

---

## Estimated Effort

| ***Step**** | ****Time*** |
| --- | --- |
| 1. Widen GET /api/v1/workspaces | 1.5h |
| 2. Unit tests for merge logic | 0.5h |
| 3. Verify AC3/RLS exclusion | 0.5h |
| 4. Build /settings/workspaces page | 2h |
| 5. Active-indicator wiring | (in Step 4) |
| ***Total**** | ****~4.5h*** |

***Story points:*** 2 (matches `story.md`)

---

## Definition of Done Checklist

- [ ] `GET /api/v1/workspaces` returns `role` per workspace; `route.test.ts` green
- [ ] `route.openapi.ts` documents `role` on the list response only (not create / get-by-id)
- [ ] `/settings/workspaces` renders the real list (multi-workspace, single-workspace, empty, error, loading states)
- [ ] Active workspace visually marked via reused `WorkspacesList` `isActive` treatment
- [ ] No leave/switch/add/invite controls anywhere on the page
- [ ] AC 1-4 all pass manually on staging
- [ ] Existing tests (`workspaces.test.ts`, `role-label.test.ts`, `active-workspace/route.test.ts`) still green — no regression
- [ ] `bun run types:check` clean
- [ ] Lint clean
- [ ] Deployed to staging; manual smoke test (desktop + mobile)
- [ ] PR description flags TC04 ([https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141](https://jira.upexgalaxy.com/browse/BK-141#icft=BK-141)) for QA's expected-result update

---

## Review Workload Forecast

Estimated: 268 additions + 42 deletions = 310 total lines
400-line budget risk: Medium
Chain strategy: pending
Decision trace: n/a (risk not High)
Decided by: n/a
Decision needed before apply: No

Notes: Medium risk, chain optional per the gate — a single PR is sufficient (both slices, API widening and the UI page, are independently small and neither depends on the other's code, so splitting into a stacked chain would not reduce reviewer cognitive load enough to justify the coordination overhead). Per-file estimate: `response.ts` (new, ~40 lines), `route.ts` (modify, ~18 lines), `route.openapi.ts` (modify, ~13 lines), `route.test.ts` (new, ~55 lines), `settings/workspaces/page.tsx` (modify, ~85 lines) — summed, ×1.2 tests/docs buffer.

---
_Synced from Jira by sync-jira-issues_
