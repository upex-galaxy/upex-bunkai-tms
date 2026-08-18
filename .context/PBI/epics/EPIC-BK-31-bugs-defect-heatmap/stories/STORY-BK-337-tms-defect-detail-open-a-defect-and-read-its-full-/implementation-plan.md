# BK-337 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

## Goal

Ship the read-only defect detail record (`/projects/[projectSlug]/bugs/[bugId]`) and its supporting `GET /api/v1/bugs/{id}` route, per the Acceptance Criteria field (revision 2) and the AI Product Owner / AI Tech Lead rulings on this ticket's comments. Section 1b of the AC field supersedes three clauses of the original Gherkin; sections 2-3 are what gets built. `scope.md`, `business-rules.md`, `workflow.md`, `out-of-scope.md` are stale (never rewritten after the rulings) and are NOT followed where they conflict with the AC field or the rulings below.

## Scope (files)

- `supabase/migrations/0070*bug*detail*composer.sql` — `create or replace function public.bunkai*bug*json` only (widen composed JSON with nested `origin` + module `archived*at`). No schema change.
- `lib/utils/url.ts` — add `isHttpUrl(value)`.
- `lib/bugs/validation.ts` — tighten `evidenceUrlsSchema` to `z.url({ protocol: z.regexes.httpProtocol })` (TQ5).
- `components/bugs/BugFormDialog.tsx` — evidence-link client check moves from `isValidUrl` to `isHttpUrl` (same helper as the server, per TQ5's "or the dialog and the route will disagree").
- `lib/bugs/errors.ts` — extract `throwBugNotFound()`, mirrors `lib/traceability/errors.ts`.
- `lib/supabase/rpc.ts` — add `getBugJson(supabase, bugId)` wrapper over `bunkai*bug*json`.
- `app/api/v1/bugs/[id]/route.ts` (new) — `GET`, `withApiHandler(..., { auth: 'required' })`, `isUuid` guard -> 400, calls `getBugJson`, null -> `throwBugNotFound()`.
- `app/api/v1/bugs/[id]/route.openapi.ts` (new) — OpenAPI registration for the new GET, extending `BugSchema` with `origin` + `module.archived_at`. One import line added to `scripts/openapi-gen.ts`; regenerate `public/openapi.json`.
- `lib/bugs/detail-view.ts` (new) — pure formatters: steps-to-reproduce line-split (drop blanks, number from 1), evidence-row label (last path segment / host fallback), origin-panel state resolution (linked vs standalone vs archived-module tag), "Failed at step N" arithmetic (`run_steps.position + 1`).
- `components/bugs/BugDetailView.tsx` (new) + skeleton — the read-only record. Reuses live `Card`, `.status-chip`/`.dot` tokens, and the list's existing 8-char-prefix identifier treatment.
- `app/(app)/projects/[projectSlug]/bugs/[bugId]/page.tsx` (new) — clone of `bugs/page.tsx:41-61`'s workspace-then-slug resolution, reads the bug via `getBugJson`, then `if (bug.project_id !== project.id) notFound()` (TQ3).
- `components/bugs/BugsListView.tsx` — Bug cell and Run cell both become links to `/projects/{projectSlug}/bugs/{bugId}` (2026-08-10 PO ruling: Run cell opens the SAME record, not the run report). Needs a new `projectSlug` prop threaded from `bugs/page.tsx`.
- `lib/bugs/list-view.ts` — no structural change; `BugsListView` builds the href directly (the row's `id` is already present).
- `lib/notifications/entity-routes.ts` — repoint the `bug` case to `/projects/{slug}/bugs/{bugId}` for both run-linked and standalone (drops the old `/runs/{runId}?bugId=` deep link entirely, per the PO's follow-up ruling).
- `lib/notifications/entity-routes.test.ts` — update the two bug-route tests for the new destination.
- `lib/bugs/detail-view.test.ts`, `lib/bugs/detail-isolation.test.ts` (new tests).

## Out of scope (explicitly, per the ticket's rulings)

- Expected vs Actual panel (PO Q1 — cut, follow-up story).
- `layer` / `environment` rows in Details panel (PO Q2 — cut, one hop away via Origin panel links).
- In-list failing-step highlight (TQ1 / PO follow-up ruling — dropped, replaced by the Origin panel's "Failed at step N of {ATC title}" line).
- Human-readable identifier sequence (`BUG-101`) (PO Q4 — the list's existing 8-char-prefix treatment is reused verbatim).
- External-tracker / sync panel (BK-372/BK-373's screen).
- `RunnerView.tsx:811-818` / `lib/runs/mark-step-view.ts`'s unguarded evidence anchor — separate ticket per the PO's 2026-08-11 ruling (filed as a Bug, P2/Major, sequenced ahead of BK-337 by that ruling; not blocking this Story's own surface).

## ATP mapping

Acceptance Criteria field (`customfield_10097`, revision 2) sections 2-3 map to implementation as follows — every scenario has a code path:

- 1.1 (header) -> `BugDetailView.tsx` header block + `GET /api/v1/bugs/{id}`.
- 1.2 (description + steps) -> `lib/bugs/detail-view.ts`'s step-split formatter + `BugDetailView.tsx`.
- 1.3 (Origin "Failed at step N") -> `bunkai*bug*json`'s nested `origin` object (`run_steps.position + 1`, `atcs.title`) + `lib/bugs/detail-view.ts`.
- 1.4 (Origin links) -> same nested `origin` object; `BugDetailView.tsx` renders the ATC + run links.
- 2.1 (standalone "Filed manually", Details panel exactly 6 rows) -> `lib/bugs/detail-view.ts` origin-state resolver + `BugDetailView.tsx` Details panel (severity/status/module/reporter/filed/assignee).
- 3.1-3.3 (evidence count vs cap) -> `BugDetailView.tsx` evidence panel, reading `evidence_urls.length` directly (no new field needed — cap is DB CHECK, not columned).
- 3.4 (non-http evidence renders as text) -> `isHttpUrl` (`lib/utils/url.ts`) gates anchor-vs-text in `BugDetailView.tsx`; `evidenceUrlsSchema` tightening is the filing-time half.
- 4.1 (no edit/status/assign controls) -> `BugDetailView.tsx` structurally omits every control (no shared component with the list's status/assignee editors).
- 5.1/5.2 (Bug cell + Run cell both open the same record) -> `BugsListView.tsx` cell links.
- 5.3 (notification deep link) -> `lib/notifications/entity-routes.ts` repoint.
- E-1/E-2/E-3 (404/400 negative + project-slug re-check) -> RLS + `throwBugNotFound()` + `isUuid` guard + the page's `project_id !== project.id` re-check.
- E-4 (viewer reads, no controls) -> same `bugs*select*workspace_member` RLS policy already grants this; asserted by a live-UI check at viewer role.
- E-5 (archived module renders, tagged) -> `bunkai*bug*json`'s nested `module.archived*at`, NOT filtered by the composer (unlike `bunkai*list_bugs`).
- E-6 (assignee shown, read-only) -> `bunkai*bug*json` already carries `assignee*user*id` (0054); resolved to display name the same way `bugs/page.tsx:111-132` already resolves the list's roster, keyed on the bug's OWN `workspace_id` (never the cookie's active workspace).

## Technical Decisions

### RPC authorization gate (`rpc-authorization.md` §4)

1. ***Does this need ****`SECURITY DEFINER`****, or does ****`SECURITY INVOKER`**** do it?*** `bunkai*bug*json` stays `language sql stable`, no `security definer` (unchanged from 0046/0054). It runs as the caller (invoker). The new `GET /api/v1/bugs/{id}` route calls it through the caller's own RLS-scoped client (`getAuth(ctx).db`), never `createAdminClient()`.
2. ***Can the identity parameter be removed entirely?*** Already has none — `bunkai*bug*json(p*bug*id uuid)` takes no actor/scope parameter today and none is added.
3. ***Where is the actor bind, and is it step 0?*** N/A for this function directly — there is no actor parameter to spoof. The enforcement is RLS's `bugs*select*workspace_member` policy (`0046:132-136`), evaluated against `auth.uid()` on every direct invocation.
4. ***Which returned rows cross a tenant boundary, and what constrains each?*** Two call shapes exist for this same function, with two different enforcement mechanisms:
5. ***Does the failure path disclose existence?*** No new disclosure channel. `bunkai*bug*json` returns a NULL row (not an exception) both when the bug does not exist AND when RLS hides it from the caller — the route's null-check calls `throwBugNotFound()` either way (same "Bug not found." 404 the sibling `/assign` and `/status` routes already use via `mapBugRpcError(error, { notFoundEntity: 'bug' })`'s P0002 case, which now shares the same underlying message). A malformed (non-UUID) id is rejected as 400 by the route's own `isUuid` guard, computed from the string alone, with no DB round trip — matches every sibling route (`status/route.ts:58-61`, `assign/route.ts`).
6. ***Which test proves it against the real database?*** `lib/bugs/detail-isolation.test.ts` (new), modeled on `lib/bugs/list-isolation.test.ts`'s fixture/service-role pattern: (a) a real authenticated non-member of the fixture workspace gets `null` from `bunkai*bug*json` for a bug in that workspace (RLS-filtered, not an error); (b) a real member of the workspace reading their OWN project's bug gets the full composed record, including the nested `origin` object for a run-linked fixture and `module.archived_at` populated for an archived-module fixture. Mocked `db.rpc` proves nothing about this and is not used for the isolation assertions.

### Steps-to-reproduce split (TQ1)

Split `steps*to*reproduce` on newlines at render time, drop blank lines, render an `<ol>` numbered from 1. That number is a line ordinal of the rendered list, never `run*steps.position` — they are different quantities (a run-linked defect's `steps*to*reproduce` is the ONE failed step's own content, verbatim, per `lib/runs/report-bug-view.ts:57`; there is no stored index of "which line failed" to highlight against). The Origin panel's "Failed at step N of {ATC title}" is a SEPARATE number, sourced from the joined `run*steps.position + 1` (0-based -> 1-based, per the PO's explicit arithmetic ruling) — the two numbers are never conflated in one component.

### Which composer the read extends (TQ2)

`bunkai*bug*json` is extended in place via `create or replace function`, exactly as `0054:184-216` did. No second composer, no new RPC — the function is already granted to `authenticated`, already invoker, already returns NULL for a caller RLS hides. The route calls it directly.

### Route/page re-check (TQ3)

The API is UUID-keyed and never receives a slug — no re-check applies to `GET /api/v1/bugs/{id}` (E-3 is page-only). The page clones `bugs/page.tsx:41-61`'s workspace-then-slug resolution, reads the bug, then `if (bug.project_id !== project.id) notFound()`.

### Evidence row label + open target (TQ4)

Label = URL's last non-empty path segment, else host, full URL in `title` (mirrors `BugsListView.tsx:774-775`'s identifier treatment). `target="_blank" rel="noopener noreferrer"` for http/https only (note: NOT `rel="noreferrer"` alone, unlike the pre-existing `RunnerView.tsx:811-818` anchor — that anchor is out of scope, filed separately). Non-http entries render as plain text, never an anchor.

### Evidence scheme tightening (TQ5)

`lib/bugs/validation.ts`'s `evidenceUrlsSchema` becomes `z.url({ protocol: z.regexes.httpProtocol })` — verified interactively against the installed zod 4.4.3: rejects `javascript:alert(1)` and `http:example.com` (no `//`), accepts `https://a.com/x`. `BugFormDialog.tsx`'s client-side check moves from `isValidUrl` to the new `isHttpUrl` so dialog and route cannot disagree.

### ADR verdict

***Not required.*** No new authorization model (reuses `bugs*select*workspace*member`, the existing invoker shape, the existing `bugs*check_consistency` trigger), no new response contract (extends an existing composer additively), no tenancy change, fully reversible (a `create or replace` back to the prior definition). Same conclusion the Tech Lead's ruling and D-series design-plan precedent reach for equivalent-shaped stories.

## Design fidelity

Master design plan §4.6, `bug-detail.html` mockup. One consolidated departure recorded as ***D32*** in `.context/design/master-design-plan.md` §5, per the PO's 2026-08-11 request to record the Expected/Actual cut, layer/environment cut, steps-highlight cut, and identifier-treatment reuse as ONE row (all four trace to the same root cause: the mockup was drawn before the Bugs data model existed).

## Workload Forecast

Estimated: ~830 additions + ~45 deletions = ~875 total lines across the whole story (migration ~110, backend route + openapi + lib helpers + backend tests ~430, page + BugDetailView component + skeleton ~230, list-links + notification repoint + entity-routes test updates ~105, with a 20% test/docs buffer folded into each figure above).
400-line budget risk: High
Chain strategy: single-pr (deliberate override, disclosed — mechanical leaf below is stacked-to-main)
Decision trace: Q1=No (this is new domain logic — a migration, a route, a page, a component, tests — not a rename, formatter run, or generated-code sweep) · Q2=Yes (three independently mergeable, linearly-ordered slices exist in principle: (1) backend — migration 0070 + `GET /api/v1/bugs/{id}` + OpenAPI + `lib/bugs/detail-view.ts` + `isHttpUrl` + evidence-schema tightening + backend/isolation tests; (2) the page + `BugDetailView.tsx` + skeleton; (3) `BugsListView.tsx` cell links + notification-route repoint) → the tree's mechanical leaf is `stacked-to-main`. ***Overridden to ****`single-pr`****, disclosed rather than silently executed***, for three stated reasons: (a) this run's own governing briefing explicitly names one branch (`feature/BK-337-defect-detail-read`), one PR, one merge, and one Stage-4 close-out — re-deriving a 3-PR chain contradicts the settled scope of this specific unattended invocation; (b) every technical decision behind this diff was already exhaustively pre-ruled on the ticket (PO Q1-Q4, TQ1-TQ5, the RPC-authorization §4 answers) before any code was written, which is precisely the condition that makes a larger single diff still safely reviewable — there is no open design question a reviewer could catch mid-chain that isn't already answered in `implementation-plan.md`; (c) three sequential unattended PR cycles (branch, push, open, adversarial review, adjudicate, merge, ancestry-verify) inside one fully-unattended session multiplies failure surface (context exhaustion, partial-chain abandonment leaving `staging` mid-migration) without a proportionate review-quality gain, given (b). The three slices remain visible as separate, clearly-bounded commits inside the one PR so a human reviewer can still review them independently if desired.
Decided by: this run's orchestrator (override of /git-flow-master §Chained-PR decision tree's mechanical leaf; git-flow-master itself was not separately invoked to re-derive a chain plan it would not execute)
Decision needed before apply: No — resolved above

---
_Synced from Jira by sync-jira-issues_
