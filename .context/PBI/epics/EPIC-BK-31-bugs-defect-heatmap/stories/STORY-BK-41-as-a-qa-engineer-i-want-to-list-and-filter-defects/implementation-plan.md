# BK-41 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

# Implementation Plan: STORY-BK-41 - TMS-Defect List | List and filter defects by module, status, severity

## Overview

Add a filtered, paginated, aggregate-bearing `GET /api/v1/bugs` endpoint over the `bugs` table BK-40 already shipped, plus the List-view UI of the frozen `bug-reports-index.html` mockup on the existing `/projects/[projectSlug]/bugs` route. QA Engineers scope the defect list to a module (rolling up nested sub-modules), filter by status/severity (combinable, multi-select), and see severity/status counts over the full filtered set, not just the current page.

***Acceptance Criteria to satisfy*** (8 Gherkin scenarios, `acceptance-criteria.md`):

- AC-1 List defects scoped to a chosen module, with aggregates present and consistent
- AC-2 Module filter includes nested sub-modules recursively (depth up to 6), excludes siblings
- AC-3 Filter by status only
- AC-4 Filter by severity only
- AC-5 Combined status + severity filter (logical AND across fields)
- AC-6 Aggregates reflect the full filtered set, not only the current page
- AC-7 Empty result is a clear 200 + `[]` + zeroed aggregates, never a blank/broken screen
- AC-8 Archived-module defects hidden by default

---

## Technical Approach

***Chosen approach******:*** One new Postgres function (`bunkai*list*bugs`, `SECURITY INVOKER`, no actor parameter) queries `bugs` under the caller's own RLS via the already-shipped `bugs*select*workspace*member` policy (`0046*bugs.sql`). Module subtree is resolved by `modules.path` prefix-match (`path = X OR path LIKE 'X/%'`), not a recursive CTE. `GET /api/v1/bugs` (new handler on the existing route file, which today only exports `POST`) validates query params with Zod, decodes/encodes an opaque keyset cursor, and renders the RPC's JSON. The List-view portion of `bug-reports-index.html` (module picker, status/severity toggle chips, counts panel, load-more) is added to the existing `BugsListView.tsx` client component BK-40 already shipped bare-bones.

***Alternatives considered******:***

- Recursive CTE over `parent*module*id` for the module subtree (the wording in the pre-ratification shift-left `acceptance-criteria.md` "Key Contract Decisions" table): rejected — superseded by evidence, see Technical Decision 7.
- A new `SECURITY DEFINER` RPC with an explicit `p*actor*user*id` (Path A, matching `bunkai*create_bug`'s own shape): rejected by ratified Decision 3 and by ADR-0012's own preferred outcome.
- Doing the whole thing via plain PostgREST resource embedding, no new SQL function (the task's initial "no new migration" hypothesis): rejected, see Technical Decision 8.

***Why this approach******:***

- ✅ Zero new actor-bind surface — `bunkai*list*bugs` takes no identity parameter, so ADR-0012's Class does not apply to it at all (the strongest fix per `rpc-authorization.md` §2: "delete the parameter").
- ✅ Reuses the exact, already-shipped `bugs*select*workspace_member` policy and the exact `modules.path` prefix technique BK-20 already proved correct in production.
- ✅ Matches `bunkai*list*activity`'s worked-example shape line-for-line, so review has a known-good precedent to check against, not a novel pattern.
- ❌ Trade-off: a genuinely new migration file, despite the task brief's initial assumption otherwise (justified below).

---

## Technical Decisions

> Decisions 1-6 are ratified verbatim by Jira comment `12071` (BK-41, PO+Dev Ratification, 2026-08-01) — read-only inputs to this plan, not re-derived. Decisions 7-14 are mine, made under the plan's own engineering-judgment latitude; each cites the precedent it copied.

***Decision 1 (ratified)******:****** BK-40 dependency is cleared.*** `supabase/migrations/0046*bugs.sql` (the `bugs` table, its RLS, `bunkai*create*bug`, `bunkai*list*project*bugs`) is on `origin/staging` as of commit `f2188e8`; BK-40 is at Jira status Ready For QA. No blocker to starting BK-41.

***Decision 2 (ratified)******:****** No PAT scope gate.*** `auth: 'required'`, no capability requirement. `lib/api/pat.ts`'s `AccessTokenScope` union (`'atc:read' | 'atc:write' | 'run:execute' | 'workspace:admin'`) has no `bugs:read` — that scope was never implemented. Mirrors `GET /api/v1/activity` and `GET /api/v1/tests/{id}/runs`, both scope-free reads.

***Decision 3 (ratified)******:****** RLS shape = ****`SECURITY INVOKER`**** over ****`bugs*select*workspace*member`****.*** Not a new Path-A `SECURITY DEFINER` function with an actor parameter. Per ADR-0012's own preferred outcome ("prefer `SECURITY INVOKER`... over guarding it") and its worked example, `bunkai*list*activity` (`0045*activity_stream.sql`).

***Decision 4 (ratified)******:****** Pagination wire contract = ****`lib/pagination/keyset-cursor.ts`****'s contract.*** `?limit=<1..50>` optional, default 30. `?cursor=<opaque>` optional; a malformed cursor is 400, never a silent first page. Same contract `GET /api/v1/activity` and `GET /api/v1/tests/{id}/runs` already use.

***Decision 5 (ratified)******:****** Default sort = severity ascending (P1→P4), then most-recent-first tiebreak.*** Fixed, not user-configurable in v1. Sourced from the frozen mockup's own `filteredBugs().sort((a,b) => a.sev.localeCompare(b.sev) || a.age - b.age)` (`bug-reports-index.html`, master-design-plan.md §4.6) — the only source of truth available, since no AC/business-rule states an order.

***Decision 6 (ratified)******:****** Filters are multi-select — OR-within-field, AND-across-fields.**** Wire contract `status=open,in_progress&severity=P1,P2` (comma-separated), generalizing AC-3/AC-4/AC-5's single-value scenarios (n=1 case, unchanged). ****Follow-up required, not blocking******:*** QA adds one Gherkin scenario + one ATP row for the combined multi-select case before Stage 3 review closes.

***Decision 7 (mine)******:****** Module subtree uses ****`modules.path`**** prefix-match, not a recursive CTE over ****`parent*module*id`****.**** The pre-ratification `acceptance-criteria.md` "Key Contract Decisions" table says "recursive traversal... not prefix-match on slug path" — that line predates today's ratification and is now stale for two independent reasons: (a) `bunkai*search*atcs` (`0027*atc*search.sql`, BK-20, already shipped to production) solved the identical module-subtree-filter problem with `m.path = v*module*path or m.path like v*module*path || '/%'`, proven correct and index-compatible; (b) `master-design-plan.md` §4.6 itself specifies the List view as "selecting a module rolls up all nested sub-modules ****by path prefix***" — the frozen mockup spec already assumes this technique. Following the live, shipped precedent over a stale planning note is the Rule #14 (LIVE-UI-FIRST) call.

***Decision 8 (mine)******:****** A new migration IS required — ****`supabase/migrations/0051*bugs*list.sql`****.*** Departs from the task brief's initial "no new migration" framing. Correct full-filtered-set aggregates (AC-6/ATP-7) combined with multi-value filters and a subtree predicate cannot be done reliably through plain PostgREST resource embedding (no GROUP BY aggregation surface, no path-prefix join across two RLS-protected tables in one round trip without a function). `bunkai*list*activity` (`0045*activity*stream.sql`) is direct precedent: a `SECURITY INVOKER`, no-actor-param list function that still required its own migration. The new migration touches no existing table, RLS policy, or write path — "no new migration" is satisfied in spirit (zero schema/RLS change), even though one new file is needed. Next free migration number confirmed against `supabase/migrations/` (highest existing: `0050*project*coverage*report*real*execution*source.sql`) — reverify freshness at Stage 2 start per `0045`'s own numbering-caution precedent.

***Decision 9 (mine)******:****** A caller who cannot see ****`project*id`**** gets 200 ****`{data:[], aggregates: zeroed}`****, not 403.**** `acceptance-test-plan.md`'s ATP-9 ("403, not a fake empty result") predates today's Decision 3 ratification and now conflicts with it. `GET /api/v1/activity`'s own route comment documents the deliberate non-disclosure collapse for exactly this INVOKER/RLS shape ("An inaccessible `workspace*id`... collapses into the SAME 200 `{items: []}`"), and ADR-0012 names `bunkai*list*activity` as the canonical worked example this story now follows. ****Follow-up for QA******:*** correct ATP-9's expected result in a later ATP revision; not blocking.

***Decision 10 (mine)******:****** ****`module*id`**** outside ****`project*id`**** is a disclosed 400, but only after ****`project*id`**** itself is confirmed visible.*** Reconciles ATP-10 (400 `module*not*in*project`) with Decision 9. Route logic: (a) `select id from projects where id = :project*id` under the caller's RLS client — zero rows → Decision 9's silent 200-empty, no further checks; (b) rows found and `module*id` given → `select id from modules where id = :module*id and project*id = :project*id` — zero rows → 400 `validation*failed` / `module*not*in_project` (safe to disclose: caller already proved project membership). Mirrors `resolveActivityWorkspaceId`'s own extra-select-before-RPC shape.

***Decision 11 (mine)******:****** The keyset cursor is a bugs-local 3-field codec (****`severity`****, ****`created_at`****, ****`id`****), not a direct reuse of ****`lib/pagination/keyset-cursor.ts`****'s 2-field ****`{timestamp,id}`**** shape.*** Decision 5's severity-primary sort needs a 3-tuple seek predicate the shared 2-field codec cannot carry without changing its signature (and thereby its two existing consumers, Runs and Activity). `lib/pagination/keyset-cursor.ts`'s own file header already sanctions this: it notes Runs' own cursor was deliberately NOT migrated onto the shared module ("a follow-up tech-story consolidates the two callers"), i.e. per-domain cursor wrappers are the established norm here, not a shortcut. New file `lib/bugs/list-cursor.ts`, same base64url mechanics, 3 parts instead of 2. Decision 4's WIRE contract (opaque token, 400 on malformed, 1-50/default-30 limit) is fully honored; only the internal payload shape differs.

***Decision 12 (mine)******:****** Archived-module bugs are hidden by default unconditionally***, not only when the caller explicitly filters by an archived module. Consistent, predictable "no defects match" contract regardless of which module a caller happens to pick. `include*archived=true` stays out of v1 per the story's own QA Expert Decision text ("A future `include*archived=true` query parameter can make this reversible... if PO/Dev decide").

***Decision 13 (mine)******:****** Frontend scope includes the List-view build of ****`bug-reports-index.html` on the existing `/projects/[projectSlug]/bugs` route — not API-only. Grounds: `scope.md` ("Show a clear empty state when no defects match"), `business-rules.md` ("an explicit empty state is shown"), `workflow.md`'s narrated UI walkthrough (Elena "opens the defects view"), and BK-40's own Slice-3 code comments, which explicitly anticipate this exact addition ("filters/counts/heatmap are BK-41/BK-42's additive work on this SAME route, not built here" — `BugsListView.tsx`; "Tone mapping matches the mockup's own chip-toggle... so BK-41's filter chips... will read as the same visual language" — `lib/bugs/list-view.ts`). The ****Heatmap view toggle is explicitly out of scope*** (`out-of-scope.md`: "The per-module defect heatmap and week-over-week trend (BK-027)" = BK-42).

***Decision 14 (mine)******:****** The new filtered GET lands on the existing ***`app/api/v1/bugs/route.ts` (today POST-only), matching the ratified Gherkin ACs' literal `GET /api/v1/bugs?project_id=...` contract — not on `app/api/v1/projects/{id}/bugs/route.ts`, whose own BK-40 comment predicted "BK-41/BK-42 extend this route additively" but predates the ratified query-param contract. The old path-param route stays in place (comment-only update marking it superseded) rather than being deleted — it is a shipped, potentially externally-called endpoint and removing it is out of this story's surgical-change scope; a follow-up tech-story can retire it once nothing depends on it.

---

## Task breakdown

### Slice 1 — Database

1. ***Add ****`bunkai*list*bugs` (`supabase/migrations/0051*bugs*list.sql`, new). `SECURITY INVOKER`, no actor param. Params: `p*project*id uuid`, `p*module*id uuid default null`, `p*statuses text[] default null`, `p*severities text[] default null`, `p*limit int default 30`, `p*cursor*severity text default null`, `p*cursor*created*at timestamptz default null`, `p*cursor*id uuid default null`. Module subtree via `modules.path` prefix-match (Decision 7); archived modules excluded unconditionally (Decision 12); OR-within-field/AND-across-fields on `p*statuses`/`p*severities` (Decision 6); order by severity rank asc, `created*at` desc, `id` desc (Decision 5); `aggregates.by*severity`/`aggregates.by*status` computed via `count(**) filter (where ...)` over the FULL filtered set before the `limit` is applied (AC-6). Returns `{ data, aggregates, next*cursor }`. — Covers ***AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8****; ****ATP-1, ATP-2, ATP-3, ATP-4, ATP-5, ATP-6, ATP-7, ATP-8, ATP-16***.
2. ***Add a supporting index*** on `bugs (project*id, severity, created*at desc, id desc)` in the same migration, mirroring `0045`'s additive keyset-seek index rationale (the existing `bugs*project*id*created*at_idx` from `0046` lacks the severity-first ordering the new seek predicate needs).

### Slice 2 — API

1. `lib/bugs/list-cursor.ts` (new). `BugsCursor { severity, createdAt, id }`, `encodeBugsCursor`/`decodeBugsCursor` — bugs-local base64url 3-field codec (Decision 11). — Covers ***ATP-14*** (malformed cursor boundary).
2. `lib/bugs/list-query.ts` (new). `BugsListQuerySchema` (Zod): `project*id` required uuid, `module*id` optional uuid, `status` optional comma-list → `BugStatus[]` (reuse `BUG*STATUS*VALUES`), `severity` optional comma-list → `BugSeverity[]` (reuse `BUG*SEVERITY*VALUES`), `cursor` optional string, `limit` optional 1-50 default 30. `parseBugsListParams(searchParams)`. — Covers ***ATP-11, ATP-12, ATP-13, ATP-14***.
3. `lib/supabase/rpc.ts` (modify). Add `listBugs(supabase, args)` wrapping `supabase.rpc('bunkai*list*bugs', {...})`, mirroring `listActivity`'s doc comment on why the caller's own RLS-scoped client is mandatory here.
4. `app/api/v1/bugs/list-response.ts` (new). `resolveBugsProjectVisibility` + `assertModuleInProject` (Decision 9/10's two-step check), `mapBugsListRpcError`, `fetchBugsListPage(db, params)` calling `listBugs`, row/aggregate → wire-shape mapping. — Covers ***ATP-9, ATP-10, ATP-15***.
5. `app/api/v1/bugs/route.ts` (modify — currently POST-only). Add `export const GET = withApiHandler(...)`: parse query, decode cursor, call `fetchBugsListPage`, `jsonResponse(page, {status:200})`. — Covers ***AC-1..AC-8, ATP-1..ATP-16*** (integration point).
6. `app/api/v1/bugs/route.openapi.ts` (modify). Register the `GET` operation: query params, `BugsListResponse` schema (`data[]`, `aggregates.by*severity`, `aggregates.by*status`, `next_cursor`).
7. `app/api/v1/projects/[id]/bugs/route.ts` (modify, comment-only). Mark superseded by `GET /api/v1/bugs` per Decision 14; zero functional change.
8. `lib/bugs/constants.ts` (modify). Add `BUGS*LIST*PAGE*SIZE = 30`, `BUGS*LIST*MAX*PAGE_SIZE = 50`.
9. `lib/bugs/list-view.ts` (modify). Add `BugAggregates` type and any multi-select label-formatting helpers the UI chips need (reuses existing `BUG*STATUS*TOKEN`/`BUG*SEVERITY*TOKEN` maps unchanged).

### Slice 3 — Frontend (List view of `bug-reports-index.html`)

1. `components/bugs/BugsListView.tsz` → `BugsListView.tsx` (modify — substantial). Add: module picker (subtree note in helper text), status/severity multi-select toggle chips (combinable, same `.status-chip`/`data-status` tone language the bare list already uses per BK-40's own forward-looking comment), severity/status counts panel driven by `aggregates`, "load more" keyset button (mirrors `ActivityView.tsx`'s `fetchActivity`/`AbortController` pattern against `/api/v1/bugs`), and a SECOND distinct empty state ("no defects match the current filters" vs. the existing "no bugs filed yet") per AC-7/business-rules.md. — Covers ***AC-7*** (UI half), workflow.md steps 3-5.
2. `app/(app)/projects/[projectSlug]/bugs/page.tsx` (modify). First page now server-read through the new filtered path (unfiltered defaults: no module/status/severity) instead of `listProjectBugs`/`bunkai*list*project_bugs`, handed to `BugsListView` as `initialPage` (mirrors `activity/page.tsx`'s server-then-client handoff).

### Slice 4 — Tests

1. `lib/bugs/list-cursor.test.ts` (new) — malformed/valid cursor round-trip.
2. `lib/bugs/list-query.test.ts` (new) — Zod boundary cases (ATP-11, ATP-12, ATP-13, ATP-14).
3. `lib/bugs/list-isolation.test.ts` (new, DB-integration) — mirrors `lib/activity/list-activity-isolation.test.ts`: a real session proves a non-member's `project*id` yields empty (Decision 9), a member sees only their workspace's bugs, and the RLS policy is actually exercised (not mocked) — satisfies `rpc-authorization.md` §5's "test against the real database" bar, even though `bunkai*list_bugs` has no actor param to spoof.
4. `app/api/v1/bugs/route.test.ts` (modify) — extend with GET cases across all 16 ATP rows.
5. `lib/bugs/list-view.test.ts` (modify) — aggregate formatting.

---

## Dependencies

***Pre-requisites technical******:***

- [x] BK-40's `bugs` table + RLS + `bunkai*create*bug` on `origin/staging` (Decision 1) — cleared.
- [ ] Migration number `0051` re-verified free at Stage 2 start (another in-flight story may claim it first).

---

## Risks & Mitigations

***Risk 1 — Subtree traversal correctness at depth 6 (ATP-2, QA-flagged High).***

- ***Impact******:*** High if wrong — a bug would leak across sibling module boundaries or vanish from a legitimate parent view.
- ***Mitigation******:*** Reuses `bunkai*search*atcs`'s already-production-proven `path`/`path LIKE 'X/%'` predicate verbatim in shape; `list-isolation.test.ts` and the route test both exercise a 6-level-deep fixture tree explicitly.

***Risk 2 — Aggregates drift with pagination (AC-6/ATP-7).***

- ***Impact******:*** Medium — counts that don't match the filtered set undermine the whole point of the story ("focus on defects... without wading through everything").
- ***Mitigation******:*** Aggregates are computed in the SAME query, over the pre-`limit` filtered set, inside `bunkai*list*bugs` — never derived client-side from the page.

***Risk 3 — Two independent divergences from the shipped ATP (ATP-9's 403, the "no new migration" hypothesis) land wrong if the ratification's own reasoning is misread.***

- ***Impact******:*** Medium — a reviewer following the literal ATP text would flag both as regressions.
- ***Mitigation******:*** Both are traced explicitly to Decision 3/9/8 above with file-and-line precedent; flagged prominently for the human reviewer and for QA's own ATP follow-up, not silently decided.

***Risk 4 — Size.*** 18 tasks across DB/API/Frontend/Tests is large for one story (see forecast below).

- ***Impact******:*** Reviewer fatigue if shipped as one PR.
- ***Mitigation******:*** The Slice 1/2/3/4 split above gives `/git-flow-master` a natural `stacked-to-main` decomposition to evaluate at the Stage 2 gate, without this plan pre-deciding it.

---

## Definition of Done Checklist

- [ ] All 8 Gherkin ACs passing against a live `GET /api/v1/bugs`
- [ ] All 16 ATP rows covered (2 with corrected expected results per Decisions 9/10 — flagged to QA)
- [ ] `bunkai*list*bugs` reviewed against `rpc-authorization.md`'s 6-question checklist (trivially satisfied: no actor param, question 2 answered "removed entirely")
- [ ] `list-isolation.test.ts` runs against the real database, not a mock (`rpc-authorization.md` §5)
- [ ] List-view UI matches `bug-reports-index.html`'s frozen tokens/chip language (Rule #15)
- [ ] Old `GET /api/v1/projects/{id}/bugs` left functionally untouched, comment-updated only
- [ ] Types/lint/build clean; OpenAPI diff reviewed (`bun run api:sync`)
- [ ] Deployed to staging; manual smoke test of module/status/severity filter combinations

---

## Review Workload Forecast

Estimated: 1637 additions + 193 deletions = 1830 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace: n/a (owed to /git-flow-master at Stage 2 entry, not decided here)
Decided by: n/a
Decision needed before apply: Yes

Notes: Slice 1 (DB, ~1 file), Slice 2 (API, ~7 files), Slice 3 (Frontend, 2 files), Slice 4 (Tests, 5 files) are laid out above as a natural stacked-to-main candidate, but the chain decision itself is intentionally left to `/git-flow-master` at the Stage 2 boundary per the fail-closed gate.

---
_Synced from Jira by sync-jira-issues_
