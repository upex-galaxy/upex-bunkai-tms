# BK-398 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

## Implementation Plan — BK-398 Command Palette

Ruled by Jira comments `12406` (AI Tech Lead — data-access design) and `12407` (AI Product Owner — UX contract + design-contract position), both BINDING. This plan follows both without re-deriving them.

### 1. Database (migration `0071*workspace*search.sql`)

- `SECURITY INVOKER` function `public.bunkai*search*workspace(p*query text, p*workspace*id uuid, p*limit int default 5)` — ***no actor parameter***. Called through `getAuth(ctx).db`, so every UNION branch re-evaluates its own table's workspace-member SELECT RLS policy against the caller's own `auth.uid()`. `p*workspace*id` is a narrowing filter only, never the authorization boundary.
- Six UNION branches: `atcs` (reuses existing `atcs.tsv` + `atcs*tsv*gin*idx`), `tests`, `projects`, `modules`, `bugs`, `runs`. The latter five get a new ***expression GIN index*** `using gin (to*tsvector('english', <display*column>))` — no new column, no trigger, no `pg*trgm`.
- Display columns verified against live schema reads this session: `atcs.title`, `tests.title` (`0024*tests.sql`), `projects.name` (`0002*projects*modules.sql`), `modules.name` (`0002*projects*modules.sql`), `bugs.title` (`0046*bugs.sql`), `runs.test*title` (`0031*runs.sql`).
- Query construction mirrors `0027*atc*search.sql:79-85`: single token → `to*tsquery('english', tok:*)`; multi-token → `plainto*tsquery('english', ...)`.
- Cap: 5 rows per entity group, ***no total cap*** (natural ceiling 30) — PO correction over the self-ratified 20-total.
- Order within a group: `ts*rank`-based relevance (with the 7-day exponential recency decay for `atcs`, matching parity requirement) DESC, then a recency column DESC, then `name`/`title` ASC, then `id` ASC. ***Deviation***: `projects` and `modules` have no `updated*at` column (verified in `0002*projects*modules.sql`) — recency tie-break for those two branches uses `created_at` instead, the only recency column that exists. Documented as a DECISION, not silently dropped.
- Every failure path (unknown/foreign workspace, empty query) returns an empty result set with HTTP 200 — never 403/404, per rule 9.
- Grants: `revoke execute ... from public, anon;` then `grant execute ... to authenticated, service_role;`.
- Migration number taken from the LIVE Supabase ledger (`mcp_*supabase**list*migrations`), confirmed at `0070` — this migration is `0071`.

### 2. API route — `GET /api/v1/search`

- `lib/search/validation.ts` — Zod schema mirroring `lib/atcs/search-validation.ts`: `q` trimmed `min(2)`, `limit` coerced int `min(1).max(20).default(20)` (the per-request cap on total rows returned across the 5-per-group union; the RPC's own per-group cap of 5 is separate and always applies).
- `app/api/v1/search/route.ts` — `withApiHandler(..., { auth: 'required', requires: ['atc:read'] })`. Uses `getAuth(ctx).db` (never `createAdminClient()` — the single load-bearing condition of the whole ruling). Resolves the active workspace via `resolveActiveWorkspaceId` (`lib/workspaces/active.ts`) fed by the caller's own RLS-scoped `workspaces` read, then calls the RPC with `p*workspace*id`.
- Response envelope: `{ data: SearchResultItem[], truncated: boolean }` per the binding contract. `SearchResultItem` carries `entity*type`, `id`, `project*id`, `project*slug`, `project*name`, `name`, and `module*id` (corrected from the Tech Lead comment's `module*path` — the PO's final destination contract routes Modules by id, not path).
- PAT posture: the ruling instructs verifying whether `getAuth(ctx).db` is RLS-scoped for PAT principals before deciding 403-vs-silent-empty. Verified this session: `lib/api/principal.ts`'s PAT path resolves through the same RLS-scoped client as cookie auth (ADR-0001 Path B impersonation) — so no bespoke 403 branch is added; the endpoint serves PAT callers identically to cookie callers.

### 3. Route builder — extend `lib/notifications/entity-routes.ts`

- Factor the `entity_type` switch into a shared, exported `buildEntityHref` covering all six BK-398 types plus the three existing notification types (run/test/bug — bug already repoints to the defect detail route). `resolveNotificationHref` becomes a thin wrapper for the notification shape. One map, two callers, per the ruling.
- Destination contract (final, PO-corrected): ATC `/projects/{slug}/atcs/{atcId}`, Test `/projects/{slug}/tests/{testId}`, Project `/projects/{slug}`, Module `/projects/{slug}?module={moduleId}`, Bug `/projects/{slug}/bugs/{bugId}`, Run `/projects/{slug}/runs/{runId}`. `encodeURIComponent` on the slug throughout.

### 4. UI — rewrite `components/layout/CommandPalette.tsx` in place on `cmdk`

- Preserve `data-testid="command-palette"`, the controlled/uncontrolled + `ownsHotkey` contract, and the mount points (sidebar owns the hotkey; project topbar trigger is DELETED per the ruling — `project-shell.tsx:115`).
- Reuse frozen §2 tokens + live atoms only: `.kbd`, `.layer-chip`, `.dot`, `ui/input.tsx`, `ui/button.tsx`, `lib/hooks/use-modal-dismiss.ts` for Escape/outside-click.
- States: guidance (empty query), below-2-char guidance, 250ms-debounced loading (skeleton after 150ms only), results grouped by canonical order (ATCs, Tests, Projects, Modules, Bugs, Runs; empty groups omitted; a group at its 5-cap shows a non-interactive "+ more" hint), no-results, recoverable error (plain sentence + Retry, `BugsListView.tsx` shape) with an 8s `AbortSignal.timeout` composed with a manual `AbortController`.
- Keyboard: ArrowUp/Down traversal skips group headings and wraps; Enter selects; Escape closes without navigating.
- Focus contract: capture active element on open; on non-navigating close, restore it if still focusable, else fall back to the sidebar search control; on navigating close, do not restore (destination screen takes focus naturally).
- Workspace-switch re-scope: abort the in-flight request and clear to guidance when the active-workspace cookie changes while open.
- Markdown editor Cmd+K collision: add `e.stopPropagation()` in `components/markdown/markdown-editor.tsx`'s existing Cmd+K branch so the local handler wins and the palette's `window` listener never sees the keystroke — implemented as the owning component's responsibility, not a hardcoded exception list in the palette.

### 5. Tests

- `lib/search/route-builder.test.ts` — unit coverage of the extended `buildEntityHref`/`resolveNotificationHref` for all 9 cases (6 new + 3 existing), `encodeURIComponent` behavior, and the module fallback (unknown/stale id → project root, no error).
- `supabase/migrations/0071*workspace*search.test.ts` (or `lib/search/workspace-search-isolation.test.ts`, shaped like `lib/activity/list-activity-isolation.test.ts`) — the non-negotiable two-workspace DB isolation test: a real authenticated session (QA*E2E identity) sees Workspace A's seeded rows across all 6 entity types and gets zero rows for a foreign Workspace B, proving RLS (not just the `p*workspace_id` filter) is what scopes the result. At least one assertion re-reads a production write path (e.g. inserting through the same columns the real create RPCs populate, not a shortcut column) per the brief's non-negotiable requirement.

### 6. Design contract (Critical Rule #15) — before UI work

- Paste the exact §8 row (under BK-7, after BK-266) and the D33 §5 divergence row (after D32) from Jira comment `12407`, verbatim, into `.context/design/master-design-plan.md`.

### 7. Jira field corrections (also part of this story)

- Fix the CommandPalette stub placeholder string (done as part of the rewrite — new guidance string: "Search ATCs, tests, projects, modules, bugs, and runs in this workspace").
- Correct `business-rules.md` field on the Jira issue: replace "project membership" wording with "active membership in the workspace that owns it" (push to the Jira custom field, then resync).

### 8. Verification order (Critical Rule #6)

1. `bun test` (new isolation + unit tests, plus full suite for regressions)
2. `bun run types:check`
3. `bun run lint:check`

Never `bun run build` (Critical Rule #17) — `bun run dev` only for manual/live verification.

---
_Synced from Jira by sync-jira-issues_
