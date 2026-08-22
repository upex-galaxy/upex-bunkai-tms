# BK-49 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-49)

# Implementation Plan: STORY-BK-49 - TMS Activity Stream (read-side feed over the existing activity log)

## Overview

Read-only, paginated, newest-first feed of workspace `activity_log` rows on a new standalone `/activity` route. No new event writers, no realtime/polling, no defect activity.

******ACs to satisfy**** (`acceptance-criteria.md`): AC1 view the feed (actor/action/item/timestamp, MVP taxonomy, workspace-isolated, safe fallbacks, silent no-ops) · AC2 page through older activity (keyset, no dup/skip, deterministic tie-break, loading/page-end states) · AC3 empty state distinct from error state.

This plan formalizes the canonical 2026-07-31 Jira-thread resolution (`comments.md`) — items 1-6 (SUPERSEDES an earlier, security-flawed v1 proposal) + item 7 (placement, resolved separately). None of the 7 are re-litigated; this fills in the concrete detail Stage 2 needs.

---

## Technical Approach

### The 7 decided items (canonical: `comments.md`), restated

1. ******Read contract.**** **`***bunkai*list*activity(p*workspace*id uuid, p*limit int, p*cursor*created*at timestamptz, p*cursor*id uuid, p*actions text[]){{, }}SECURITY INVOKER{{ (default, no }}security definer{{ clause), no actor param. Route uses }}principal.db{{ from }}getAuth(ctx){{ — never }}createAdminClient(){{. Server component uses }}createClient(){{ (SSR cookie client). Keyset }}(created**at, id) < (cursor){{. Returns }}jsonb {items, next_cursor}` — no totals.
2. ******Cross-workspace leakage — closed by construction.**** **INVOKER means the RPC's queries run under the caller's own RLS (**`auth.uid()` **populated on every call path).** **`activity*log*select*workspace*member**{{ (}}*0009*cross**cutting.sql`) applies transparently — a non-member gets RLS-filtered zero rows, not a leak. No separate assert needed (unlike [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)/38's DEFINER RPCs).
3. ******New migration*****:** **`***activity*log*workspace*created*at*id*idx (workspace*id, created*at desc, id desc){{ — the existing index lacks the }}id` tie-break the keyset seek needs.
4. ******Event allowlist**** — entity-create/update/complete-level only (concrete array below). Excludes `run_step.marked` ([https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) — not yet in this branch; `0044`'s header notes it's on a concurrent branch, already applied remotely as `0042`/`0043`) and no-op/internal events.
5. ******Actor + item display.**** ****New narrow**** `SECURITY DEFINER` ****helper**** `bunkai**resolve**activity**actors`***, scoped to caller co-membership, batch-resolves the page's distinct**** `actor**user**id`****s.**** ****ADR-0011 drafted (Proposed)**** ****— a real posture change (peer-visible**** `auth.users` ****read vs. every existing precedent being self-only or**** `service**role`***-only). Item label:**** ****payload-derived where a usable field exists; generic**** `"a <entity_type>"` ****fallback otherwise (`run.***`).
6. ******Payload safety.**** ****Allowlist payload keys per**** `(entity_type, action)`****, never raw**** `payload`****.**** `run.aborted.reason` ****(free-text, unredacted)**** ****excluded entirely**** (Decision 3).
7. ******Placement.**** Standalone `/activity` (Option A), not Home. Ratified: `master-design-plan.md` §5 D15 + §8 row + new §4.16 (committed `2048a17`, ahead of this plan). No mockup — `DESIGN.md` §2 tokens only, `RunHistoryView.tsx`'s list+load-older pattern for structural inspiration.

### Stage 1 verification performed

- ******Item 5 ADR two-gate test:**** ****Gate 1 architectural (yes — cross-cutting PII-exposure invariant) + Gate 2 hard to reverse (yes — broadcast exposure + likely-reused pattern for BK-208/210) →**** ****both pass, ADR-0011 drafted.****
- ******Item 7 ADR two-gate test:**** ****Gate 1 fails (routing/placement, no schema/auth/invariant touch) →**** ****no ADR; §5 D15 sufficient.**** Confirms the dispatch's working assumption.
- ******Event write-sites****: grepped every `insert into public.activity_log` (not guessed) — table below.
- ******No correctness problem found in items 1-7.**** **One scope-boundary observation (not a blocker, flagged not fixed):** **item 4's literal array excludes** `atc.updated`**,** `test.reordered`**,** **`***test.tags*changed{{, }}run.started{{ — legitimate persisted-change events, not noise on the order of }}run**step.marked`. Implemented literally as decided; expanding it unilaterally would be the same kind of silent alteration this plan is told not to make in reverse.

---

## Database design

### Migration file

Highest local file is `0044**leave**workspace.sql`, but its own header warns `0042`/`0043` are already taken remotely by BK-35's concurrent branch. ******Stage 2 must re-verify the next-free number against both the local dir and the remote ledger**** **before naming the file. Working name:** **`***00XX*activity**stream.sql`.

******1. Index**** **`***activity*log*workspace*created*at*id*idx (workspace*id, created**at desc, id desc)` — additive, existing index stays.

******2.**** **`bunkai*list*activity**{{ — }}**plpgsql**{{, }}**security invoker**{{ (omit clause), }}**set search**___**path = ''*{{.
Signature: }}*(p*workspace*id uuid, p*limit int default 30, p*cursor*created*at timestamptz default null, p*cursor*id uuid default null, p_actions text[] default null){{ → }}jsonb{{.
Logic (mirrors }}0038{{/}}0039`'s validation order, minus the actor-bind guard — nothing to spoof, no actor param):

1. Clamp `p_limit` 1..50, default 30 (Decision 1).
2. `p_actions` null → default to the MVP allowlist (backstop; route always passes it explicitly, Decision 2).
3. Keyset page (`limit+1` probe) on `workspace**id = p**workspace**id AND action = any(p**actions) AND (created**at,id) < (cursor)`; both-cursor-null = first page; half-supplied cursor rejected (new SQLSTATE, next free 45xxx slot) same as `0039`'s `run**cursor_invalid`.
4. Per-row projection: `id`, `entity**type`, `entity**id`, `action`, `actor**user**id`, `created_at`, `payload` built via a `case (action)` returning ONLY the allowlisted keys per the projection table below — positive projection, never `select payload` raw.
5. `next_cursor`: same probe-based shape as `0038`/`0039`.
6. Return `{items, next**cursor`}. `revoke … from public, anon; grant execute … to authenticated, service**role`.

******3.**** **`bunkai*resolve*activity*actors{{ — }}sql{{, }}security definer{{, }}set search*path = ''*{{.
Signature: }}*(p*workspace*id uuid, p*user*ids uuid[]) returns table(user_id uuid, email text)`.

1. Assert `bunkai**is**workspace**member(p**workspace_id)` (reads `auth.uid()` internally, no actor param, non-spoofable — same pattern as `0023`'s module RPCs). Non-member → raise (loud failure over silent empty set).
2. `select id, email from auth.users where id = any(p**user**ids)` — no per-id co-membership filter needed (every `actor**user**id` on an `activity_log` row was already a member of that workspace at write time, per ADR-0011).
3. `revoke all … from public, anon; grant execute … to authenticated, service_role` — the ADR-0011 posture change is exactly this grant.

### Event write-site enumeration (grepped `supabase/migrations/*.sql`)

| ***entity_type**** | ****action**** | ****file:line*** |
| --- | --- | --- |
| atc | atc.created | `0021**atc**create**update.sql:232-236`, `0028**atc_duplicate.sql:110-114` |
| atc | atc.updated | `0021**atc**create**update.sql:350-354`, `0035**atc**update**propagation.sql:145-149` (supersedes 0021) |
| module | module.renamed | `0023**module**activity_log.sql:93-97` |
| module | module.description**updated | `0023**module**activity**log.sql:106-110` (payload always {{{}}}) |
| module | module.moved | `0023**module**activity_log.sql:228-237` |
| module | module.archived | `0023**module**activity_log.sql:318-327` |
| test | test.created | `0024_tests.sql:242-246` |
| test | test.reordered | `0026**tests**reorder.sql:236-244` |
| test | test.tags**changed | `0030**test_tags.sql:255-263` |
| run | run.started | `0031**runs.sql:439-448`, `0040**run**module**snapshot.sql:308-317` (supersedes 0031) |
| run | run.aborted | `0036**run**abort.sql:209-216` (payload: `reason` ≤500 chars free text, `skipped_steps`) |
| run | run.finished | `0037**run**finish.sql:121-128` (payload: `verdict` ∈ {passed,failed}, `skipped_steps`) |

******12 distinct pairs write today.**** `events.md` ****documents 6 (the 4**** ****`module.****{{ + 2 }}atc.**{{) — refresh to cover all 12 + a footnote on the anticipated 13th (}}run_step.marked`, [https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35), concurrent).

### Event allowlist (`p_actions`, item 4, literal)

```
array['module.renamed','module.description_updated','module.moved','module.archived',
      'atc.created','test.created','run.finished','run.aborted']::text[]
```

8 of 12 write-site actions ship in MVP. `atc.updated`, `test.reordered`, `test.tags**changed`, `run.started` excluded per the literal decided text (scope-boundary observation above). `run**step.marked` excluded automatically by the same allowlist mechanism whenever it starts writing.

### Payload projection per action (item 6)

| ***action**** | ****payload keys exposed**** | ****item-label source*** |
| --- | --- | --- |
| module.renamed | name, new_path | payload.name |
| module.description_updated | ***(none — source is always**** {{{}}}****)*** | generic "a module" (E2: action label already says what changed) |
| module.moved | new**path | payload.new**path |
| module.archived | modules, user*stories, acceptance*criteria, atcs | generic "a module" |
| atc.created | title | payload.title |
| test.created | title | payload.title |
| run.finished | verdict, skipped_steps | generic "a run" |
| run.aborted | skipped_steps (******reason excluded****, Decision 3) | generic "a run" |

### `events.md` refresh

Add the 6 missing write-site sections (test.created/reordered/tags*changed, run.started/aborted/finished) in the existing per-event format, grouped under a new* `## Run events (BK-34/36/37/39)` **heading (mirrors** `## Module events`**), plus a footnote on** **`***run*step.marked` ([https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35), anticipated, not yet confirmed). Doc edit, folded into Step 1 (DB design), not a separate step.

---

## API design

### `GET /api/v1/activity`

Auth: cookie or Bearer, no scope requirement (mirrors `GET /api/v1/tests/{id}/runs`).

| ***Param**** | ****Required**** | ****Notes*** |
| --- | --- | --- |
| `workspace**id` | Cookie: no (falls back via `resolveActiveWorkspaceId` + `bk**active_ws` cookie, same as `GET /api/v1/tests`). Bearer/PAT: ******yes******. | Known dependency**:** BK-182**** (open bug, Bearer active-workspace resolution). This route inherits that gap for PAT callers until fixed. Link BK-49→BK-182 (Dependencies). |
| `limit` | No | 1-50, default 30 (Decision 1). Out of range → 422. |
| `cursor` | No | opaque; malformed → 400, never a silent first page. |

Handler (mirrors `tests/[id]/runs/route.ts`, two auth-path differences from item 1):

1. `getAuth(ctx)` → `{principal, db`}.
2. Resolve `workspace**id`: explicit param wins; else cookie-principal-only fallback via `resolveActiveWorkspaceId`; PAT with none → 400 `validation**failed`.
3. Zod-parse `limit`/`cursor`; decode cursor (malformed → 400).
4. `db.rpc('bunkai**list**activity', …)` — `db`, never `createAdminClient()`. Using admin here would silently reopen the v1-proposal leak (RLS bypassed, workspace check reduced to trusting the caller-supplied param). ******Explicit review checklist item**** (Risk 2, DoD).
5. Batch-resolve actors: collect distinct non-null `actor**user**id}}s on the page → {{db.rpc('bunkai**resolve**activity**actors', {p**workspace**id, p**user_ids})` → `Map<userId,email>`. Zero ids → skip.
6. Map rows to response shape (below): `actor` (resolved email or fallback), `action` + `action**label` (from `ACTION**LABELS`), `item` (label from the RPC's already-safe payload, generic fallback), `created**at`, encoded `next**cursor`.
7. `200 {items, next_cursor`} — empty `items` is a valid 200 (AC3), never 404.

### `ActivityItemSchema` (full — no gaps for Stage 2)

```
ActivityItem {
  id: string(uuid)                  // activity_log row id, stable React key
  entity_type: 'module'|'atc'|'test'|'run'
  action: 'module.renamed'|'module.description_updated'|'module.moved'|'module.archived'
        | 'atc.created'|'test.created'|'run.finished'|'run.aborted'
  action**label: string              // server-rendered, from ACTION**LABELS
  actor: { user_id: string(uuid)|null, email: string|null }   // null = unresolvable, safe fallback
  item: { label: string, entity_id: string(uuid)|null }       // NEVER raw payload
  payload: object                   // allowlisted subset only — discriminated union keyed on `action`
                                     // in the Zod schema (one branch per projection-table row), not z.record()
  created**at: string (ISO 8601, offset:true — mirrors RunHistoryItem.started**at)
}
ActivityPage { items: ActivityItem[], next_cursor: string|null }
```

`id`: added even though item 1's signature discussion didn't call it out explicitly — every other list endpoint in this codebase returns its own row id (`RunHistoryItem.id`); zero schema cost, column already exists (Decision 5).

Errors: 400 (malformed cursor), 401 (no session/PAT), 422 (`workspace**id` missing for Bearer, `limit` out of range). No 404 — an inaccessible `workspace**id` returns `200 {items:[]`} (RLS-filtered silently, cleaner non-disclosure than [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)/38's P0002 collapse — nothing to distinguish).

### OpenAPI registration

New `app/api/v1/activity/route.openapi.ts` (mirrors `tests/[id]/runs/route.openapi.ts`). Add one import line to `scripts/openapi-gen.ts`'s side-effect block, run `bun run openapi:gen`, commit regenerated `public/openapi.json` — required Stage-2 step per the generator's own header instructions.

---

## UI/UX Design

`DESIGN.md` §2 frozen tokens only — no mockup (`master-design-plan.md` §4.16/§5 D15, committed). Structural precedent: `RunHistoryView.tsx` list+load-older pattern (no outcome filter/totals — activity has no pass/fail axis).

- `app/(app)/activity/page.tsx` — server component, first page read server-side via `createClient()` + `listActivity(...)`, `<Suspense fallback={<ActivitySkeleton/>}>` around an `ActivitySection` that catches its own failure into `initialError` (mirrors `RunHistorySection`), never throws to `error.tsx`.
- `components/activity/ActivityView.tsx` — one file, `ActivityView` (`'use client'`) + `ActivitySkeleton`, mirrors `RunHistoryView.tsx`'s single-file convention.

States: loading skeleton · rows (actor email or `"a workspace member"` fallback, action*label, item.label, deterministic UTC-slice timestamp — no* **`toLocale**{{, hydration-mismatch risk) · empty (AC3 3.1, no error copy) · error (AC3 3.2, whole-view block + Retry, distinct from empty) · load-older (idle/loading/retry cycle, inline append-error, rows stay mounted) · page-end (}}next*cursor===null{{, control gone, foot line states final count, focus handoff on unmount — mirrors }}run-history-foot`).

`data-testid`: `activity-view`, `-skeleton`, `-empty`, `-error`, `-retry`, `-rows`, `-row-{id`}, `-load-older`, `-append-error`, `-foot`.

******Nav entry****: `AppSidebar.tsx:92-100`'s 7-item nav has no Activity destination (additive, not gap-fill). Add {{{ id:'activity', icon:Activity, label:'Activity', href:'/activity' }}} (lucide-react's `Activity` icon, no new iconography) after the `home` entry.

---

## Types & Type Safety

- `lib/activity/history-validation.ts` — `ActivityQuerySchema` (Zod: `workspace_id` optional UUID, `limit` coerced 1-50 default 30, `cursor` optional string) + domain cursor wrappers.
- `lib/pagination/keyset-cursor.ts` (NEW, generic, zero Zod/domain imports) — `encodeKeysetCursor({timestamp,id})`/`decodeKeysetCursor(raw)`, same base64url algorithm as `lib/runs/history-validation.ts`, field-neutral (Decision 4).
- `lib/activity/history-validation.ts` wraps it: `encodeActivityCursor({createdAt,id})`/`decodeActivityCursor(raw)`.
- `lib/activity/constants.ts` (NEW, zero-import, mirrors `history-constants.ts`) — `ACTIVITY**PAGE**SIZE=30`, `ACTIVITY**ALLOWED**ACTIONS` (the 8-action array, `as const`) — single source for both server schema and client view.
- `lib/activity/labels.ts` (NEW) — `ACTION_LABELS: Record<ActivityAction,string>` (8-row table below) + pure formatting helpers, framework-agnostic (CLAUDE.md §10).
- `lib/supabase/rpc.ts` (MODIFIED) — add `listActivity`/`resolveActivityActors` wrappers, mirrors `listTestRuns`'s shape.

`ACTION**LABELS`: module.renamed→"renamed a module" · module.description**updated→"updated a module description" · module.moved→"moved a module" · module.archived→"archived a module" · atc.created→"created an ATC" · test.created→"created a Test" · run.finished→"finished a run" (verdict shown alongside from payload) · run.aborted→"aborted a run".

---

## Implementation Steps

1. ******Migration**** ****(****`supabase/migrations/00XX**activity**stream.sql`****) — index +**** `bunkai**list**activity` ****+**** `bunkai**resolve**activity_actors`****, per Database design. Re-verify numbering against remote ledger first. Includes the**** `events.md` ****refresh. Apply via Supabase MCP.**** ****Test****: keyset boundary, allowlist filter, cross-workspace isolation, half-cursor rejection, actor-resolver co-membership assert. — 7h
2. ******Cursor codec**** ****(****`lib/pagination/keyset-cursor.ts`****) — generic extraction per Decision 4; Runs' own module untouched.**** ****Test****: round-trip + malformed-input rejection (ports Runs' cursor test cases, renamed). — 2h
3. `lib/activity/`**** ****domain module**** ****(****`constants.ts`****,**** `history-validation.ts`****,**** `labels.ts`****).**** ****Test*****:** **Zod schema parsing (valid/invalid),** **`***ACTION*LABELS{{ covers every }}ACTIVITY*ALLOWED_ACTIONS` value. — 2h
4. `lib/supabase/rpc.ts`**** ****wrappers**** — `listActivity`, `resolveActivityActors`. Covered transitively by Step 5's route test. — 1h
5. ******API route + OpenAPI**** ****(****`app/api/v1/activity/route.ts` ****+**** `.openapi.ts`****,**** `scripts/openapi-gen.ts` ****import, regenerate**** `public/openapi.json`****).**** ****Test:**** ****cross-workspace isolation (foreign**** `workspace_id` ****explicit param → empty, not leak), pagination boundary (AC2 2.2), allowlist filtering,**** `run.aborted.reason` ****absent from response body**** (security assertion), malformed-cursor 400, missing-workspace-for-PAT 422. — 5h
6. `ActivityView`**** ****component + skeleton**** ****— state machine, abort-guarded load-older, focus handoff.**** ****Test****: each state transition, a11y (focus, aria-live, aria-busy). — 6h
7. ******Page + nav entry**** ****(****`app/(app)/activity/page.tsx`****,**** `AppSidebar.tsx` ****addition).**** ****Test****: server-rendered first page (Tier 0 HTTP probe acceptable, full browser pass at Stage 3). — 3h
8. ******Integration + live-UI validation**** ****(Stage 3 placeholder) — seed rows across ≥2 workspaces, full AC1-3 flow, cross-workspace isolation,**** `run.aborted.reason` ****DOM/network absence check.**** ****Test****: E2E. — 4h

******Total****: ****30h.****

---

## ATP → Implementation Step mapping

`acceptance-test-plan.md` Phase 4 (24 outlines) mapped to the step that implements/verifies each:

| ***ATP outline**** | ****Step*** |
| --- | --- |
| Positive: newest-first entries w/ actor/action/item/timestamp | 6 (view) + 5 (route shape) |
| Positive: MVP event set only | 1 (allowlist) + 3 (constants) |
| Positive: load older at page end | 6 (load-older UI) + 5 (keyset route) |
| Positive: empty state, no error copy | 6 (empty state) |
| Positive: safe label for payload-limited events (module.description_updated) | 1 (payload projection) + 3 (labels) |
| Negative: no cross-workspace activity | 1 (RLS/INVOKER) + 5 (route test) |
| Negative: no entries for silent cases | 1 (write-site enumeration — silent cases never write a row, no code needed) |
| Negative: no realtime required | N/A — architectural non-goal (item 1), no step implements "absence" |
| Negative: error state on read failure | 6 (error state) |
| Negative: no defect activity without a writer | 1 (allowlist has no `bug.***`/`defect.***` entry — no code needed) |
| Boundary: no dup/skip at page-size boundary | 1 (keyset probe) + 5 (route test) |
| Boundary: stable order on shared timestamp | 1 (`(created_at,id)` tie-break) |
| Boundary: page-end state | 6 (page-end UI) |
| Boundary: long labels don't break layout | 6 (view CSS — `truncate`/wrap per DESIGN.md tokens) |
| Boundary: timestamp consistency near tz boundary | 6 (UTC-slice formatting, no locale drift) |
| Integration: RLS-constrained reads | 1 (INVOKER + RLS) + 5 (route test) |
| Integration: module writer entries render correctly | 3 (labels) + 6 (view) |
| Integration: ATC/Test writer entries render correctly | 3 (labels) + 6 (view) |
| Integration: run.finished renders w/ allowed payload | 1 (projection) + 6 (view) |
| Integration: missing actor/item fallback, no crash | 1 (resolver null-safety) + 6 (fallback rendering) |
| API: read contract returns paginated data | 5 (route) |
| API: auth/role policy enforced | 5 (auth:'required', RLS) |
| API: stable cursor for pagination | 2 (codec) + 5 (route) |
| API: empty vs error distinguishable in response/UI | 5 (200 empty vs 4xx) + 6 (UI split) |

******24 ATP outlines mapped to 8 implementation steps**** (2 outlines map to "no code needed" — silent cases and defect exclusion are absence-of-behavior, verified by the allowlist/write-site enumeration itself, not a separate build step).

---

## Technical Decisions (Story-specific)

******1. Default page size = 30 (clamp 1-50).**** No PO-specified default exists anywhere in the ATP or Jira thread — Stage-1 gap-fill. Reuses Run History's proven bound; smaller default (30 vs 50) since activity is typically higher-frequency per workspace than one Test's history. ❌ Unratified by PO — one-constant change if wrong.

******2. Route always passes the allowlist explicitly****; the RPC's own default is a direct-caller backstop only (mirrors [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37)/38's clamp-not-reject philosophy), not the enforcement point. Keeps `ACTION_LABELS` and the server's actual filter from silently drifting. ❌ Trade-off: the array now lives in two places (SQL default + TS constant) kept in sync by hand — flagged in code comments on both sides.

******3.**** `run.aborted.reason` ****excluded entirely, not role-gated.**** No existing precedent in this codebase for role-conditional payload fields — building one here is unjustified new plumbing for a 5sp story. Matches the existing payload-minimization convention (`module.description_updated`'s intentionally-empty payload, `0023`). ❌ An operator's abort reason never reaches the feed even for owners — acceptable for MVP, a future drill-through is out of scope here.

******4. Cursor codec extracted generically, Runs' module untouched.**** Item 1 explicitly flags reusing `lib/runs/history-validation.ts` as-is as a layering violation. Writing `lib/pagination/keyset-cursor.ts` generically (not activity-specific) means a future Runs-consolidation is a pure import-swap, not two implementations silently drifting. Meets CLAUDE.md §10's DRY threshold (2nd stable-shape consumer). ❌ Runs' own file is NOT refactored in this story (surgical-changes rule) — one release cycle with two implementations of the same algorithm; flagged as a follow-up tech-story.

******5.**** `activity_log.id` ****added to the RPC's return columns**** — every other list endpoint returns its own row id; zero schema cost, pure gap-fill, no real trade-off.

See ADR-0011 for the actor-resolution posture-change decision (full context there, not restated here).

---

## Dependencies

- [ ] [https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90](https://jira.upexgalaxy.com/browse/BK-90#icft=BK-90) backend slice merged into `staging` — confirmed (this branch is cut from `staging`'s tip).
- [ ] Migration numbering re-verified against the remote ledger before Step 1.
- [ ] ******Link BK-49 → BK-182**** (Dependencies, [https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49) depends on [https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182](https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182)) — not a hard blocker (cookie callers unaffected; PAT callers can pass `?workspace_id=` explicitly) but must be visible.
- [ ] ADR-0011 needs human acceptance (Proposed → Accepted) before/alongside Stage 2.

---

## Risks & Mitigations

******R1 — allowlist/label-map drift**** (Decision 2's trade-off). Impact Medium (unlabeled row, not a crash). Mitigation: Step 3 test asserts full coverage; cross-referencing code comments.

******R2 — admin-client route regression**** (item 1/2's core invariant). Impact High — would silently reopen the v1-proposal leak, no automatic runtime signal. Mitigation: explicit DoD checklist item + Step 5's cross-workspace-isolation test, which fails if the admin client is used.

******R3 —**** `run.aborted.reason` ****leak via future refactor.**** Impact High if it happens, low likelihood (single projection site). Mitigation: Step 5 test asserts `reason`'s absence explicitly, not just happy-path shape.

******R4 — workload size / reviewer fatigue.**** See forecast below — `risk=High`, `chain_strategy=pending`, handed to `/git-flow-master` before Stage 2.

---

## Definition of Done

- [ ] Migration applied, numbering re-verified against remote ledger
- [ ] `events.md` covers all 12 write-site actions + `run_step.marked` footnote
- [ ] All ACs passing (AC1 1.1-1.5, AC2 2.1-2.4, AC3 3.1-3.2, E1-E3)
- [ ] ******Route uses**** `principal.db`****, never**** **`createAdminClient()` (R2 checklist item)
- [ ] `run.aborted.reason`**** ****never appears in any response body****, verified by test (R3)
- [ ] Cross-workspace isolation + pagination boundary + tie-break verified by test
- [ ] `ACTION_LABELS` covers every allowlisted action (test)
- [ ] OpenAPI: `.openapi.ts` authored, `openapi-gen.ts` import added, `public/openapi.json` regenerated + committed
- [ ] `AppSidebar.tsx` nav entry — additive only
- [ ] Unit + route/component + E2E tests written and green
- [ ] `bun run types:check` clean, lint clean
- [ ] [https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49) linked to [https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182](https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182)
- [ ] ADR-0011 reviewed by human owner (Proposed → Accepted or corrected)
- [ ] Deployed to staging; manual smoke test (desktop + mobile)
- [ ] `master-design-plan.md` §5 D15/§8/§4.16 already committed (`2048a17`) — no further edit needed unless the build diverges from D15

---

## Review Workload Forecast

Estimated: 2093 additions + 48 deletions = 2141 total lines
400-line budget risk: High
Chain strategy: feature-branch-chain
Decision trace: Q1=No (new domain logic — a new RPC pair following ADR-0001 Path B, a new PII-exposure ADR, and a wholly new UI surface with zero existing components to reuse; not a rename/formatter/generated-code/vendor-update) · Q2=No (the natural DB/API/UI split has API alone — route.ts + response.ts + the full ActivityItemSchema discriminated-union-across-8-event-types + route.test.ts — realistically landing 450-650 lines, and UI alone — new page + all-new list/skeleton/empty/row components with actor-badge and item-label rendering + tests, nothing reused — realistically landing 700-1000+ lines; neither clears the <400-line-per-slice bar) · Q3=Yes (the new RPC's jsonb {items, next*cursor} shape and the generated TS types for bunkai*list_activity / the actor-resolution helper are shared scaffolding the API slice defines and the UI slice directly imports and calls; a partial merge of the UI slice without the API slice would not compile) → feature-branch-chain
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md)
Decision needed before apply: No

Slices (feat/BK-49-activity-stream is the long-lived integration branch, already cut from origin/staging; docs already committed to it at 2048a17): 1) DB — migration (index + 2 RPCs) + TS types regen. 2) API — route.ts + response.ts + route.openapi.ts + route.test.ts + events.md refresh. 3) UI — page + components/activity/* + tests. 4) Final — feat/BK-49-activity-stream -> staging once slices 1-3 are merged into it. Same mechanics as this repo's [https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35](https://jira.upexgalaxy.com/browse/BK-35#icft=BK-35) precedent (feat/BK-35-mark-run-step, DB/API/Realtime/UI on one long-lived branch).

Basis (new ×1.5 / modified ×1.0, +20% buffer): migration SQL ~220→330, keyset-cursor.ts ~90→135, activity/constants.ts ~30→45, activity/history-validation.ts ~60→90, activity/labels.ts ~70→105, api/v1/activity/route.ts ~90→135, route.openapi.ts ~150→225, activity/page.tsx ~90→135, ActivityView.tsx ~300→450 (new-file sum 1650); rpc.ts +30, openapi-gen.ts +3, AppSidebar.tsx +6, events.md +95 (modified-file sum 134). (1650+134)×1.2 = 2141. `public/openapi.json` (generated) excluded per doctrine's generated-code carve-out; test files covered by the 20% buffer.

---

---
_Synced from Jira by sync-jira-issues_
