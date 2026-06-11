# Comments for BK-17

[View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

---

### Ely - 5/19/2026, 9:54:42 PM

1. 🧱 Architect Annotation

1. 

- ****DB****: new table `import*jobs` (id uuid pk, project*id uuid fk, workspace*id uuid fk, jql text, status text check in queued|running|completed|failed, imported*count int default 0, created*count int default 0, updated*count int default 0, skipped*count int default 0, errors jsonb default '[]', started*at, completed*at, created*at). Index on `(workspace*id, status, created*at desc)` for status polling.
- ****API surface****: `POST /api/imports` returns 202 `{ import*job*id, status: 'queued' }`. `GET /api/imports/:id` returns full job row. Both gated by Workspace membership.
- ****Worker*****: Supabase Edge Function `process-import-jobs` invoked by cron every 30 s; claims one job at a time via `UPDATE ... WHERE status='queued' RETURNING **` with `FOR UPDATE SKIP LOCKED` semantics emulated through a status transition. On claim, status flips to `running`, `started_at` set.
- ****Jira REST****: hits `POST /rest/api/3/search/jql` (v3 endpoint with `nextPageToken`); falls back to `GET /search` with `startAt` for older sites. Chunk size 500 (Jira's hard ceiling is 100 per page on cloud — adjust per page, accumulate up to 500 per chunk for our internal batching). Backoff schedule on 429: 1s, 2s, 4s, 8s, 16s — max 5 retries before flagging the job failed.
- ****ADF -> Markdown converter****: in-house, recursive walker over ADF node types — `heading -> #...####`, `paragraph -> text`, `bulletList -> -`, `orderedList -> 1.`, `codeBlock -> fenced with language attr`, `inlineCode`, `link`, `hardBreak`, `rule -> ---`. Unknown nodes flatten to text content.
- ****AC heuristic: scan the converted Markdown for the first heading or paragraph matching `/^(?:acceptance criteria|ac:|criteria)\s****:?\s**$/i`. From that anchor, capture consecutive bullet items (or numbered list items) until the next heading. Each bullet becomes one AC row with position assigned in order.
- ****Component mapping****: lower-case match on `module.name`. If no match, ensure a Module named "Inbox" exists under the Project (create on first need) and route the story there.
- ****Idempotency****: upsert keyed on `(project*id, upper(external*id))` against `user*stories`. Existing rows update title/description; ACs for re-imports are reconciled by `(user*story_id, lower(title))` to avoid duplicates while still allowing AC text edits.
- ****Credentials****: stored in `workspace*integrations` (`type='jira'`, `config jsonb { site*url, email, api*token*encrypted }`). Token encrypted via Supabase Vault. Worker reads via service-role key.
- ****Per-issue errors****: any issue that throws during conversion or persist is appended to `errors[]` as `{ jira_key, code, message }` — the job continues. Job fails (`status='failed'`) only on authentication/JQL-parse/total-network errors.

1. 

- Upstream: ****BK-14***** "User Story CRUD" (write target). *****BK-15***** "AC CRUD" (write target). *****BK-7**** "Module hierarchy" (component routing requires modules table).
- Downstream: future "Jira webhook live sync" (Phase 2), future "Two-way sync" (Phase 2+).
- External: Jira Cloud REST API v3, Supabase Edge Functions runtime, Supabase Vault for token storage.

1. 

- [ ] Migrations applied: `import*jobs`, `workspace*integrations` (or extension of existing), Inbox Module auto-create logic
- [ ] OpenAPI updated; `bun run api:sync` clean
- [ ] Unit tests: ADF -> Markdown converter covers each node type; AC heuristic covers heading + bullet + numbered list variants; component-to-module match (hit + miss -> Inbox)
- [ ] Integration tests: idempotent re-import (created 12 + updated 12 + zero dup rows); chunking over 500 issues; 429 backoff schedule; invalid creds -> failed job
- [ ] Worker handles partial failure (1 bad issue -> errors[] entry, others succeed, job completes)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: import a small JQL into a dev Project, confirm Stories + ACs appear, re-run and confirm zero dup
- [ ] PR description cross-references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.3
- SRS: `.context/SRS/functional-specs.md` § FR-009
- Business map: `.context/business/business-data-map.md` § import*jobs + workspace*integrations entities
- API contract: `.context/SRS/api-contracts.yaml` § `/api/imports`
- Jira REST v3 search: [https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)

---

### Nahuel Gomez - 5/27/2026, 7:38:18 PM

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17](https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17) — Async one-way Jira import by JQL

***Status****: Refined — Awaiting PO Estimation | ****Score****: CRITICAL 18 | ****Refined***: 2026-05-27

## Verdict: Needs Improvement

High integration complexity (Jira REST, ADF parsing, async reliability) with critical gaps in crash recovery and heuristic specification.

## Key Gaps (5 found)

1. ***No crash recovery specification*** — Worker crashes mid-job (e.g., 7/20 chunks). No checkpoint/resume mechanism. CRITICAL 18 feature with 20+ chunks MUST define failure recovery.
2. ***No AC for Jira credential failure*** — Worker picks up queued job with expired/invalid PAT, behavior undefined.
3. ***ADF→Markdown node support list undocumented*** — No contract for what ADF nodes are supported. Tables, emoji, expand macros, panels — which are converted vs stripped?
4. ***Jira custom fields silently discarded*** — Epic link, story points, labels, fixVersions, issue type, priority have no mapping to Bunkai entities.
5. ***Concurrent imports on same project behavior unspecified*** — Race on Jira rate limits and idempotency.

## Key Ambiguities (8 found)

1. Auto-chunking mechanism: pagination-based or JQL partitioning?
2. Inbox Module parent placement in tree (root level?)
3. Idempotency key composition (BR1 says "Project + Jira key" — exact format?)
4. AC heuristic extraction algorithm (heading detection, bullet parsing, stop condition)
5. Component→Module match strategy (exact/partial, case-sensitive, multi-component)
6. created*count vs updated*count vs skipped_count definitions
7. pg_cron frequency and worker race-condition handling
8. Jira key case normalization (lowercase from external tool?)

## Critical Questions for PO (block sprint planning)

1. ***Crash recovery strategy?*** Option A: mark failed, user re-submits, idempotency prevents duplicates. Option B: resume from last chunk on next cron tick.
2. ***Concurrent imports on same project?*** Serialize (409 Conflict) or allow (idempotency handles overlaps)?
3. ***Oversized descriptions (>50KB)?*** Truncate with marker, reject entire issue, or store in overflow column?
4. ***Jira custom field mapping?*** Phase 1: store as jsonb `jira_metadata`. Phase 2: promote to first-class columns?

## Blockers

- Define worker crash recovery semantics before sprint planning
- Document ADF node type support list (what converts, what strips, what errors)
- Specify AC extraction heuristic with pseudocode
- Resolve concurrent-import behavior
- Confirm Inbox Module placement in tree

## Test Coverage Estimate

| Type  | Count  |
| --- | --- |
| ------ | ------- |
| Positive  | 15  |
| Negative  | 12  |
| Boundary  | 8  |
| Integration  | 6  |
| API  | 5  |
| ***Total****  | ****46***  |

High count reflects CRITICAL 18 score + heavy integration surface (Jira REST pagination, ADF parsing, rate-limit backoff, async worker lifecycle).

## Top Suggested Improvements

1. Add crash recovery AC with timeout sweeper (stuck running → failed after 5min)
2. Add credential-failure AC (status=failed, error=JIRA*AUTH*FAILED)
3. Document ADF node support list with fallback behavior
4. Add `jira*metadata` jsonb column to `user*stories` for custom field capture
5. Serialize concurrent imports per project (409 Conflict)
6. Specify truncation behavior for >50KB descriptions

**Shift-Left QA refinement — batch session 2026-05-27**

---

### Ely - 6/5/2026, 5:35:55 AM

## Ready For QA — BK-17 Async one-way Jira import by JQL

***Staging:**** https://staging-upexbunkai.vercel.app  ·  ****PR:**** #15 (merged)  ·  ****Deploy:*** READY

### What shipped (as-built)

Import Jira issues into a Bunkai project by JQL. In the project explorer, click ***Import**** (top bar) → enter a JQL → Start. The job runs in the background; the dialog polls and shows live status + counts (imported / created / updated / skipped) + per-issue errors. Imported issues become User Stories under a Module matched by Jira component name (or an auto-created ****Inbox***), each keyed on its Jira key.

### Endpoints

- `POST /api/v1/imports` `{ project*id, jql }` → 202 `{ import*job*id, status: queued }` (member-only; one active import per project, else 409 `import*in_progress`).
- `GET /api/v1/imports/{id}` → poll status (queued | running | completed | failed) + counts + `errors[]`.

### AC verification guide (staging)

1. ***Start + poll***: Import with a JQL returning a handful of Story issues → the dialog goes queued → running → completed with `imported_count` = the number of issues and empty errors.
2. ***Idempotent re-run***: run the SAME JQL again → completes with `created*count = 0`, `updated*count = N`, and NO duplicate stories.
3. ***Component routing***: an issue whose Jira component equals a Module name in the project → its story lands under that Module.
4. ***Inbox****: an issue with no matching component → its story lands under an auto-created ****Inbox*** module (not reported as an error).
5. ***Chunking***: a JQL above 100 issues pages through (≤100/page) and the final `imported_count` equals the total.
6. ***Bad credentials***: with no/invalid Jira credentials configured for staging, the job ends `failed` with `errors[].code = jira_unauthorized`.

### IMPORTANT for QA — staging credentials

Live import needs `ATLASSIAN*URL`, `ATLASSIAN*EMAIL`, `ATLASSIAN*API*TOKEN` set in the ***Vercel staging*** environment (server-side, single-tenant for the MVP). Until they are set, every import correctly ends `failed` with `jira_unauthorized` (that is exactly AC6). Add them in Vercel → Settings → Environment Variables (Preview/Production scope for the staging project), then redeploy or re-run an import.

### Notes for QA

- One import at a time per project (concurrent attempts get 409). A re-run is always safe (idempotent), which is also the crash-recovery path.
- Imported descriptions are converted ADF→Markdown and pass through the BK-16 sanitizer (no raw HTML execution). Acceptance Criteria are extracted from the description body only (issues that keep ACs in a Jira custom field import 0 ACs — expected).
- Out of scope (Phase 2): two-way sync, webhooks, OAuth, Epics/Sub-tasks, attachments, custom-field mapping, per-workspace credential config.

---

### Andrés Daniel Cumare Morales - 6/7/2026, 10:41:16 AM

## Acceptance Test Plan (ATP) — BK-17 — Part 4/4: Edge Cases, Test Data & Risks

### Phase 5 — Edge Cases + Test Data

#### Edge case table

| Edge case | In original story? | Added to refined AC? | Outline | Priority |
|---|---|---|---|---|
| Concurrent import 409 (race) | No (shift-left Gap #5) | Yes — Cross-cutting scenario A | TC-NEG-02 | Critical |
| Crash mid-job → stuck `running` forever (no sweeper) | No (shift-left Gap #1, partially) | Yes — Cross-cutting scenario B (documented gap, not live-tested) | n/a — ATR documentation only | High (residual risk) |
| Idempotent re-run leaves module/status untouched | Implied by "idempotent" but not spelled out | Yes — folded into AC2 refinement | TC-POS-02 (step 4) | High |
| Non-member access (RLS forbidden) | Implied by "member-only" | Yes | TC-NEG-01 | High |
| RLS hide-on-SELECT (404 vs 403 non-disclosure) | No | Yes | TC-NEG-04 | Medium |
| Unsupported ADF nodes degrade silently (tables, panels, emoji) | No (shift-left Gap #3) | Yes — spot-check | TC-POS-06 | Medium |
| Custom-field ACs import as 0 (expected) | Confirmed by Ely, not in original AC | Yes | TC-INT-02 | Medium |
| 429 exhaustion surfaces as generic `job_failed`, not a distinguishable code | No (minor observability gap) | Yes — documented, code-inspection only | TC-INT-04 | Low |
| JQL length boundary (1 / 2000 chars) | Implied by business rule, not in AC | Yes | TC-BND-01 / TC-API-03 | Medium |

#### Test-data categories

| Data type | Count | Purpose | Examples |
|---|---|---|---|
| Valid | 3 | Drive AC1/AC2/AC3/AC4 happy paths | `key in (BK-8, BK-9)`, a component-bearing JQL (TBD Stage 2), an uncomponentized-issue JQL (TBD Stage 2) |
| Invalid | 4 | Drive validation/negative paths | `""`, 2001-char JQL, `not-a-uuid` project_id, non-UUID job id |
| Boundary | 3 | Drive length/volume edges | 1-char JQL, 2000-char JQL, >100-issue JQL (feasibility-gated) |
| Edge | 2 | Drive race + RLS-disclosure paths | concurrent 409 trigger, inaccessible-but-existing job id `b4b8e74c-...` |

#### Data generation strategy

- ***Static***: `project_id = "ae10a3bd-574f-4caf-8076-f19a8e80f5a6"`, `jql = "key in (BK-8, BK-9)"` — hardcoded because they are the verified clean-slate anchor for AC1/AC2 chaining; reusing a known-good pair removes guesswork from the critical-path tests
- ***Dynamic (generated at Stage 2)***: the 2000-char and 2001-char JQL strings should be built programmatically (`"x".repeat(2000)` / `.repeat(2001)`) rather than hand-typed — avoids off-by-one authoring errors; the AC3/AC4/AC5 candidate JQLs depend on a live corpus probe and cannot be pre-determined
- ***Cleanup***: AC1/AC2 are explicitly chained (do not clean up between them — the second run depends on the first's output). TC-BND-01's boundary sweep may enqueue extra jobs — let them complete or note their `import*job*id`s before running TC-NEG-02 to avoid muddying the 409 race assertion. TC-BND-02 (if executed) creates N new `user_stories` rows — confirm volume tolerance with the user before running on a shared project; prefer an isolated throwaway project if N is large

---

### Risks & Residual Gaps (carried into ATR)

1. ***No timeout sweeper*** (finding #3) — a crashed worker leaves a job permanently `running`, blocking all future imports on that project (DB unique index keeps it "active" forever). Cannot be exercised live; document as a structural residual risk in the ATR, recommend the shift-left's Top Suggested Improvement #1 (timeout sweeper, stuck→failed after N minutes) as a fast-follow.
2. ***AC5 feasibility*** — chunking can only be verified if a >100-issue JQL is reachable; PROBE FIRST in Stage 2, defer with documented reason if infeasible.
3. ***AC6 feasibility*** — bad-credentials path is provably correct by code inspection but cannot be forced live without disrupting shared staging Jira config; record `VERIFIED-BY-CODE-INSPECTION`.
4. ***Data hygiene*** (not BK-17-related) — ~33 leftover "BK9 Integration <timestamp>" workspaces under the active QA user; noted, does not block this session.

---

### Andrés Daniel Cumare Morales - 6/7/2026, 10:41:21 AM

## Acceptance Test Plan (ATP) — BK-17 — Part 1/4: Triage, Refined ACs, Critical Analysis & Data Feasibility

***Modality****: jira-native · ****Environment****: staging (`https://staging-upexbunkai.vercel.app`) · ****Risk****: HIGH (score 11) · ****Triage***: REQUIRE TESTING (veto — external integration + data integrity)

---

### Triage

***Veto***: REQUIRE TESTING — this story touches an external integration (Jira REST `/search`), an async background worker, data-integrity upserts on `user*stories` keyed by `external*id`, and component-to-Module routing. Veto beats score; Full ATP is mandatory regardless of the computed risk score.

***Risk score (for the record)****: New feature (+3) · Dynamic API/DB data (+3) · Explicit ACs present (+2) · User-facing (+2) · Multi-component (+1) = ****11 → HIGH*** (extended edge cases warranted).

---

### Refined Acceptance Criteria (Given/When/Then, specific data)

#### AC1 — Start + poll (fresh import)

- ***Given*** a member of workspace "BK-9 QA Testing" is on project "BK-9 Module Test Project" (`ae10a3bd-574f-4caf-8076-f19a8e80f5a6`), which has an empty `import_jobs` history
- ***When*** they `POST /api/v1/imports` with `{ project_id: "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", jql: "key in (BK-8, BK-9)" }`
- ***Then**** the API returns ****202*** `{ import*job*id: <uuid>, status: "queued" }`; polling `GET /api/v1/imports/{id}` shows the status transition `queued → running → completed`; the final row has `imported*count = 2`, `created*count = 2`, `updated*count = 0`, `skipped*count = 0`, `errors = []`, `completed_at` populated

#### AC2 — Idempotent re-run (additive-only, finding #6)

- ***Given*** the AC1 job has completed for `jql: "key in (BK-8, BK-9)"` on the same project (2 stories now exist with `external_id` `BK-8` / `BK-9`)
- ***When*** the same payload `{ project_id: "ae10a3bd-...", jql: "key in (BK-8, BK-9)" }` is submitted again
- ***Then**** the new job completes with `created*count = 0`, `updated*count = 2`, `skipped*count = 0`, `imported*count = 2`; a DB query on `user*stories WHERE project*id = 'ae10a3bd-...' AND external*id IN ('BK-8','BK-9')` returns ****exactly 2 rows*** (zero duplicates); `title`/`description` are refreshed but `module*id`/`status` are left untouched if manually changed between runs (per `import-runner.ts:228-235`)

#### AC3 — Component routing

- ***Given*** the target project has a Module whose `name` matches (case-insensitive, per `comments.md` "lower-case match on `module.name`") the Jira `component` of at least one issue returned by the chosen JQL
- ***When*** the import completes
- ***Then*** the corresponding `user*stories` row's `module*id` resolves to that Module's id (verified via DB join `user*stories.module*id = modules.id AND lower(modules.name) = lower(<component name>)`)

#### AC4 — Inbox fallback

- ***Given*** an issue returned by the JQL carries no `component`, or a component with no name-match to any existing Module in the target project
- ***When*** the import completes
- ***Then**** an "Inbox" Module is auto-created at ****root level**** (`parent*module*id: null`, positioned after existing root siblings — confirmed pattern from `ensureInbox`, `import-runner.ts:168-200`) if it doesn't already exist, the story's `module_id` resolves to it, and ****no*** `errors[]` entry is recorded for that issue

#### AC5 — Chunking (>100 issues)

- ***Given**** a JQL against the real `upexgalaxy` Jira returns ****more than 100*** issues (page size hard-capped at 100 by Jira Cloud, `client.ts:27`)
- ***When*** the import runs to completion
- ***Then**** the worker pages through in ≤100-issue chunks (`next*page*token` persisted per page, `import-runner.ts:97-107`), and the final `imported_count` equals the ****total**** issue count returned by the JQL — ****FEASIBILITY: UNKNOWN, to be probed live in Stage 2*** (see Data Feasibility table — depends on whether any reachable JQL surfaces a >100-issue corpus)

#### AC6 — Bad credentials

- ***Given*** `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API*TOKEN` are missing or invalid for the worker's Jira client
- ***When*** a job is claimed and the worker calls Jira `/search`
- ***Then**** `client.ts:120-122` throws `JiraAuthError` (missing-creds path) or `:143-145` (HTTP 401/403 path); `import-runner.ts:122-124` maps it to `errors[].code = "jira_unauthorized"`, `status = "failed"` — ****FEASIBILITY: LIKELY UNTESTABLE LIVE**** (see Data Feasibility table — creds are confirmed live server-side via the existing `completed` job `b4b8e74c-...`; forcing this path would require disrupting shared staging config). ****Recommended path: verify by code inspection*** (already done — finding #4, `context.md:17`), record verdict as `VERIFIED-BY-CODE-INSPECTION`

#### Cross-cutting scenario A — Concurrent import 409 (race-proof, finding #2)

- ***Given*** project "BK-9 Module Test Project" has an import job in `queued` or `running` status
- ***When**** a second `POST /api/v1/imports` is submitted for the ****same*** `project_id` (regardless of `jql` value)
- ***Then**** the API returns ****409**** `{ reason: "import*in*progress" }` — enforced at the DB layer by the partial UNIQUE index `import*jobs*one*active*per*project` (migration `0020*import*jobs*one_active.sql`); the route's fast-path `SELECT` (`route.ts:49-63`) AND its `23505`-catch fallback (`route.ts:77-82`) both map to this envelope — confirm the ****shape***, not just the status code

#### Cross-cutting scenario B — Crash recovery / stuck-`running` (documented gap, NOT a live test, finding #3)

- ***Given*** a worker dies mid-job (cannot be forced from outside Vercel — would require killing the function mid-`after()`)
- ***Then**** the job row remains `status = 'running'` forever — `next*page*token` is persisted but never read back on restart (`import-runner.ts:71`), and ****no timeout sweeper exists**** (Top Suggested Improvement #1 from shift-left was NOT implemented). This is a ****structural residual risk***, documented in the ATR as a DOCUMENTED GAP, not exercised as a pass/fail test — the precondition cannot be safely set up in a shared staging environment

---

### Phase 1 — Critical Analysis (business + technical context)

***Business context***: Primary persona = Project lead seeding a new Bunkai Project from an existing Jira backlog (avoiding manual copy-paste); KPI influenced = onboarding speed / time-to-first-Module-populated. This sits at the "Project setup" step of the user journey, immediately after BK-7/BK-8/BK-9 (workspace → project → module hierarchy) and feeding BK-14/BK-15 (User Story / AC CRUD as write targets).

***Technical context***:

- API surface: `POST /api/v1/imports` (`app/api/v1/imports/route.ts`), `GET /api/v1/imports/{id}` (`app/api/v1/imports/[id]/route.ts`)
- Worker: `lib/jira/import-runner.ts` (CAS claim, paging, upsert, AC reconciliation, Inbox creation)
- External: `lib/jira/client.ts` (Jira REST `/search`, 429 backoff, auth)
- Conversion: `lib/jira/adf-to-markdown.ts` (ADF → Markdown), `lib/jira/extract-acceptance-criteria.ts` (AC heuristic)
- DB: `import*jobs` (migration `0019*import*jobs.sql`), partial unique index (migration `0020*import*jobs*one*active.sql`), `user*stories`, `acceptance_criteria`, `modules`
- Integration points: API ↔ DB (RLS-gated insert/select), API ↔ External (Jira REST v3), async worker ↔ DB (status polling)

***Story complexity***: Business logic = High (idempotency, AC reconciliation, component routing). Integration = High (external Jira REST, async lifecycle, rate-limit backoff). Data validation = Medium (JQL length 1-2000, UUID checks). UI = Low-Medium (poll dialog, status display).

***As-built deviation (informational, not a defect)***: shipped uses Vercel `after()` + env-var creds + single-tenant admin client, NOT the architect's planned `pg*cron` Edge Function + `workspace*integrations`/Vault — confirmed intentional MVP shape per Ely's "Ready For QA" comment.

---

### Story Quality Analysis

No new ambiguities or gaps surfaced beyond the 6 pre-resolved findings already documented in `context.md` (all traced to file:line). Summary of resolutions inherited from code review:

| Shift-left concern | Resolution | Evidence |
|---|---|---|
| Gap #1 — crash recovery | Option A (re-run is safe/idempotent); BUT no timeout sweeper — residual structural risk | `import-runner.ts:43-58,71`, Ely's note |
| Gap #2 — credential failure | `jira_unauthorized` + `status=failed`, exactly matches AC6 | `client.ts:120-122,143-145`, `import-runner.ts:122-124` |
| Gap #3 — ADF node support | Documented: doc/paragraph/heading/lists/codeBlock/blockquote/rule + inline marks; unknowns degrade gracefully (no throw, no error entry) | `adf-to-markdown.ts:29-51,105-110,127-132` |
| Gap #4 — custom fields discarded | Confirmed expected/out-of-scope (Phase 2): only `summary, description, components, issuetype` read | `client.ts:76`, Ely's "Notes for QA" |
| Gap #5 — concurrent imports | Race-proof via DB partial UNIQUE index, 409 on both fast-path and `23505` fallback | migration `0020`, `route.ts:49-63,77-82` |
| Ambiguity — AC heuristic | Heading regex + bullet/numbered collection + stop conditions documented | `extract-acceptance-criteria.ts:9-18,30-68` |
| Ambiguity — Inbox placement | Root-level, positioned after siblings; DB-confirmed (Smoke Checkout project) | `import-runner.ts:168-200` |
| CQ#3 — oversized descriptions | Truncate at 50KB with visible blockquote marker | `import-runner.ts:25-26,285-295` |

***Testability***: Yes — all 6 ACs map to concrete, observable API/DB/UI states. AC5 and AC6 carry data-feasibility risk (see below), not a testability gap in the spec itself.

---

### Data Feasibility Check (per AC)

| AC | Precondition | Data found? | Pattern | Notes |
|----|---|---|---|---|
| AC1 | Clean project, fresh JQL | Yes | Discover | "BK-9 Module Test Project" (`ae10a3bd-...`) has an empty `import_jobs` history — clean slate. JQL `key in (BK-8, BK-9)` known to import cleanly (proven by existing completed job on a different project) |
| AC2 | Same JQL re-run on AC1's project | Yes | Discover (chained from AC1) | Free second AC from one JQL choice — run AC1's JQL twice |
| AC3 | Issue with component matching an existing Module name | Partial | Modify / Generate | Modules in "BK-9 Module Test Project" not yet enumerated as of session-start; may need to pre-create a Module whose name matches a real component on a candidate issue, OR pick a JQL surfacing a componentized issue — ***resolve in Stage 2 before running AC3*** |
| AC4 | Issue with no matching component | Yes | Discover | Any issue lacking a component, or with an unmatched one, triggers Inbox — low risk, near-guaranteed with a broad JQL |
| AC5 | JQL returning >100 issues | ***Unknown**** | Generate (if reachable) / DEFERRED | Depends entirely on whether the real `upexgalaxy` Jira corpus has a >100-issue JQL reachable by the QA user's project scope — ****PROBE IN STAGE 2 FIRST*** before committing to a live TC; if infeasible, mark DEFERRED with reason |
| AC6 | No/invalid Jira credentials | ***No (creds are live & proven working)**** | Blocked — code-inspection only | Existing `completed` job (`imported_count: 2`, real keys BK-8/BK-9) proves creds are configured server-side; forcing the negative path requires breaking shared staging config — ****out of bounds***. Verdict path: `VERIFIED-BY-CODE-INSPECTION` |

***Risk flag***: AC5 and AC6 are DATA-FEASIBILITY RISKS, not spec gaps — both are explicitly called out in the ATR as "feasibility-constrained" rather than failed/blocked.

---

**(continued in Part 2/4 — see next comment)**

---

### Andrés Daniel Cumare Morales - 6/7/2026, 10:41:26 AM

## Acceptance Test Plan (ATP) — BK-17 — Part 2/4: Test Outlines (TC-POS-01 to TC-NEG-04)

### Phase 4 — Test Design (Outlines)

#### Coverage estimate

| Type | Count | Notes |
|---|---|---|
| Positive | 6 | Fresh import, idempotent re-run, component routing, Inbox fallback, polling status transitions, 202 envelope shape |
| Negative | 5 | Invalid JQL length, non-member access, malformed `project_id`, 404 on inaccessible job, AC6 (code-inspection-verified) |
| Boundary | 3 | JQL at 1 char / 2000 chars, chunking at >100 issues (AC5) |
| Integration | 4 | API↔External (Jira REST contract), API↔DB (RLS + upsert), async worker lifecycle (queued→running→completed), ADF→Markdown + AC-heuristic spot-check |
| API | 4 | `POST /imports` 202 + 409 + validation 400, `GET /imports/{id}` 200 + 400 + 404 |
| ***Total**** | ****22*** | Right-sized down from the shift-left's raw 46-estimate — 6 of 8 ambiguities and 5 of 5 gaps were pre-resolved by code review, eliminating ~half the originally-anticipated exploratory surface (no need to separately probe ADF node coverage, AC heuristic edge cases, or 429 backoff schedule as discrete TCs — covered by code-inspection findings #5/#6/#8 already) |

***Rationale***: HIGH risk score (11) + multi-integration surface justifies extended edge-case coverage (cross-cutting scenarios A/B), but the pre-session code review collapsed most of the raw ambiguity-driven estimate into confirmed-resolved findings — so the live-test surface concentrates on the 6 ACs + the 409 race + the polling lifecycle, not on re-deriving already-answered architecture questions.

#### Parametrization

***Group 1 — JQL boundary lengths*** (same `POST /imports` validation path, varying `jql` length):

| jql | Length | Expected |
|---|---|---|
| `"k"` | 1 char | 202 (valid, though likely 0 results) |
| `"key in (BK-8, BK-9)"` | 19 chars | 202 |
| `"project = BK" + " ".repeat(1988)` (padding to exactly 2000) | 2000 chars | 202 |
| `""` (empty string) | 0 chars | 400 validation error |
| `"x".repeat(2001)` | 2001 chars | 400 validation error |

3 tests collapse into 1 parametrized outline + edge boundary pair (5 total data points → outline TC-API-03 below).

***Group 2 — Job polling status snapshots*** (same `GET /imports/{id}` shape assertion, varying lifecycle stage):

| Stage | `status` | `imported_count` | `errors` |
|---|---|---|---|
| Immediately after enqueue | `queued` | `0` | `[]` |
| Mid-run (if catchable) | `running` | partial (≥0) | `[]` |
| Terminal | `completed` | `N` (final) | `[]` |

Benefit: one polling-loop test asserts the envelope shape across all three observed states rather than three separate tests — broader coverage with less duplication (outline TC-INT-03 below).

#### Outlines

---

***TC-POS-01 — Should complete a fresh import with accurate counts on a clean project***

- Related scenario: AC1
- Type: Positive · Priority: Critical · Test level: API + DB
- Parametrized: No
- Preconditions: authenticated as `bunkai-staging-user@veluarzooo.resend.app`, member of "BK-9 QA Testing", project "BK-9 Module Test Project" (`ae10a3bd-574f-4caf-8076-f19a8e80f5a6`) has an empty `import_jobs` table for this project
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project*id: "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", jql: "key in (BK-8, BK-9)" }`. Verify: HTTP 202, body `{ import*job_id: <uuid>, status: "queued" }`
  2. Poll `GET /api/v1/imports/{import*job*id}` every ~2s. Verify: `status` transitions `queued → running → completed`, no skipped intermediate states observed as terminal
  3. On `completed`. Verify: `imported*count = 2`, `created*count = 2`, `updated*count = 0`, `skipped*count = 0`, `errors = []`, `started*at` and `completed*at` populated, `completed*at > started*at`

- Expected result: 202 envelope on enqueue; terminal row matches counts above; DB `user*stories` has 2 new rows with `external*id IN ('BK-8','BK-9')`, `project_id = 'ae10a3bd-...'`
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "key in (BK-8, BK-9)"}`
- Post-conditions: 2 `user_stories` rows persist for AC2 chaining; do not archive/delete (needed for re-run test)

---

***TC-POS-02 — Should re-run the same JQL idempotently with zero duplicate stories***

- Related scenario: AC2
- Type: Positive · Priority: Critical · Test level: API + DB
- Parametrized: No
- Preconditions: TC-POS-01 has completed; 2 `user*stories` rows exist for `external*id` `BK-8`/`BK-9` on the same project
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", jql: "key in (BK-8, BK-9)" }` (identical payload). Verify: HTTP 202 (NOT 409 — prior job is `completed`, not active)
  2. Poll to `completed`. Verify: `created*count = 0`, `updated*count = 2`, `skipped*count = 0`, `imported*count = 2`
  3. DB query: `SELECT count(*) FROM user*stories WHERE project*id = 'ae10a3bd-...' AND external*id IN ('BK-8','BK-9') AND archived*at IS NULL`. Verify: returns exactly `2`
  4. DB query: compare `module_id`/`status` on the 2 rows before and after re-run. Verify: unchanged (additive-only update — only `title`/`description` refresh, per finding #6)

- Expected result: zero duplicate `user_stories` rows; counts confirm update-not-create; module placement/status survive re-import untouched
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "key in (BK-8, BK-9)"}`
- Post-conditions: none — data state is stable for subsequent runs

---

***TC-POS-03 — Should route an imported story to the Module matching its Jira component***

- Related scenario: AC3
- Type: Positive · Priority: High · Test level: API + DB
- Parametrized: No
- Preconditions: a Module exists in "BK-9 Module Test Project" whose `name` (case-insensitive) matches the Jira `component` of at least one issue in the candidate JQL — ***TO BE RESOLVED in Stage 2***: enumerate modules + candidate issues' components first; pre-create a matching Module if none exists naturally
- Test steps:

  1. Identify (or create) Module `M` with `name` matching component `C` of issue `I`
  2. `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-...", jql: "<JQL surfacing issue I>" }`
  3. Poll to `completed`
  4. DB query: `SELECT module*id FROM user*stories WHERE external*id = '<I.key>' AND project*id = 'ae10a3bd-...'`. Verify: `module_id = M.id`

- Expected result: story for issue `I` lands under Module `M`, not Inbox
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "<TBD — resolved in Stage 2 from candidate components>"}`
- Post-conditions: leave Module `M` and the imported story for traceability evidence

---

***TC-POS-04 — Should auto-create an Inbox module and route unmatched issues there without flagging an error***

- Related scenario: AC4
- Type: Positive · Priority: High · Test level: API + DB
- Parametrized: No
- Preconditions: project has at least one importable issue with no component, or a component name with no matching Module
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-...", jql: "<JQL surfacing an uncomponentized/unmatched issue>" }`
  2. Poll to `completed`
  3. DB query: `SELECT id, parent*module*id, position FROM modules WHERE project*id = 'ae10a3bd-...' AND lower(name) = 'inbox'`. Verify: row exists, `parent*module_id IS NULL` (root-level), `position` follows existing root siblings
  4. DB query: `SELECT module*id FROM user*stories WHERE external*id = '<unmatched issue key>'`. Verify: `module*id = <Inbox module id>`
  5. Re-check the job row's `errors[]`. Verify: no entry for the unmatched issue

- Expected result: Inbox module auto-created at root, unmatched story routed there, zero `errors[]` impact
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "<TBD — resolved in Stage 2>"}`
- Post-conditions: Inbox module persists for evidence

---

***TC-POS-05 — Should display live polling status and counts in the UI import dialog***

- Related scenario: AC1 (UI surface)
- Type: Positive · Priority: Medium · Test level: UI (Playwright)
- Parametrized: No
- Preconditions: authenticated session on staging, on project explorer for "BK-9 Module Test Project"
- Test steps:

  1. Click "Import" (top bar). Verify: dialog opens with a JQL input
  2. Data: enter `key in (BK-8, BK-9)`, click "Start". Verify: dialog shows `queued` then `running` with live counts (imported/created/updated/skipped)
  3. Wait for terminal state. Verify: dialog shows `completed`, final counts match the API response, per-issue `errors[]` rendered if any (expect none here)

- Expected result: UI dialog mirrors the API job lifecycle accurately, no flicker/stuck states
- Test data: `{"jql": "key in (BK-8, BK-9)"}`
- Post-conditions: close dialog; underlying job/data persists

---

***TC-POS-06 — Should confirm imported descriptions render as sanitized Markdown converted from ADF***

- Related scenario: Cross-cutting (ADF→Markdown, BK-16 sanitizer integration per Ely's note)
- Type: Positive · Priority: Medium · Test level: Integration (spot-check)
- Parametrized: No
- Preconditions: at least one imported issue (BK-8 or BK-9) has a non-trivial ADF description body (headings, lists, code, links)
- Test steps:

  1. Open the imported User Story for `BK-8` (or `BK-9`) in the Bunkai UI
  2. Verify: description renders as Markdown-converted content — headings, bullet/numbered lists, code blocks, links preserved; no raw HTML executes (BK-16 sanitizer pass-through)
  3. If the source ADF contains an unsupported node (table, panel, emoji) — Verify: it degrades gracefully to flattened text, does NOT throw, and produces NO `errors[]` entry (per finding #5)

- Expected result: converted Markdown renders safely; unsupported nodes degrade without error
- Test data: n/a (uses already-imported BK-8/BK-9 content)
- Post-conditions: none

---

***TC-NEG-01 — Should reject an import request from a non-member with a forbidden error***

- Related scenario: Cross-cutting (RLS / membership gate)
- Type: Negative · Priority: High · Test level: API
- Parametrized: No
- Preconditions: a second staging user account that is NOT a member of "BK-9 QA Testing" (or use the "Bunkai Smoke QA" workspace's owner account against a "BK-9 QA Testing" project, if reachable)
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", jql: "key in (BK-8)" }` authenticated as the non-member
  2. Verify: HTTP 403 (or RLS-equivalent) with body `{ error: "forbidden" }` or `{ error: "not*a*member" }` (exact shape per RLS INSERT policy)
  3. DB query: confirm no new `import_jobs` row was inserted for this attempt

- Expected result: request rejected before any job is enqueued; no DB side effect
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "key in (BK-8)"}`
- Post-conditions: no cleanup needed (no row created)

---

**(continued in Part 3/4)**

---

### Andrés Daniel Cumare Morales - 6/7/2026, 10:41:29 AM

## Acceptance Test Plan (ATP) — BK-17 — Part 3/4: Test Outlines (TC-NEG-05 to TC-API-04)

***TC-NEG-02 — Should return 409 import*************in*************progress when a second import is enqueued for the same project while one is active***

- Related scenario: Cross-cutting scenario A (race-proof 409)
- Type: Negative · Priority: Critical · Test level: API + Integration
- Parametrized: No
- Preconditions: an import job is currently `queued` or `running` on "BK-9 Module Test Project" (trigger via TC-POS-01/02 timing, or a deliberately slow/broad JQL to widen the `running` window)
- Test steps:

  1. While the first job is `queued`/`running`, `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-...", jql: "<any different JQL>" }`
  2. Verify: HTTP 409, body `{ reason: "import*in*progress" }` — exact field name and value
  3. Repeat the second POST as fast as possible (tight loop, 5-10 rapid attempts) to also exercise the `23505`-catch fallback path (`route.ts:77-82`), not just the fast-path SELECT
  4. DB query: confirm exactly ONE `import*jobs` row is in `queued`/`running` state for this `project*id` at any instant (the partial UNIQUE index guarantees this)

- Expected result: every concurrent attempt returns the same 409 envelope; DB never holds 2 active rows for one project (index-enforced)
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "project = BK"}`
- Post-conditions: let the original job complete naturally before further tests

---

***TC-NEG-03 — Should return 400 on a malformed import*************job*************id when polling***

- Related scenario: Cross-cutting (`GET /imports/{id}` validation)
- Type: Negative · Priority: Medium · Test level: API
- Parametrized: No
- Preconditions: authenticated session, any valid project membership
- Test steps:

  1. `GET /api/v1/imports/not-a-uuid`. Verify: HTTP 400, body indicates invalid id format (non-UUID)
  2. `GET /api/v1/imports/12345`. Verify: HTTP 400 (same validation path)

- Expected result: non-UUID path segments rejected with 400 before any DB lookup
- Test data: `{"id": "not-a-uuid"}`, `{"id": "12345"}`
- Post-conditions: none

---

***TC-NEG-04 — Should return 404 when polling a job that does not exist or belongs to an inaccessible project***

- Related scenario: Cross-cutting (`GET /imports/{id}` RLS hide-on-SELECT)
- Type: Negative · Priority: Medium · Test level: API + Integration
- Parametrized: No
- Preconditions: a valid-format UUID that does not correspond to any `import_jobs` row reachable by the current user — e.g. job `b4b8e74c-...` belongs to "Smoke Checkout" / "Bunkai Smoke QA", NOT reachable by the current QA user `c4cb73a7-...`
- Test steps:

  1. `GET /api/v1/imports/b4b8e74c-...` (the known-but-inaccessible job id) authenticated as the current QA user. Verify: HTTP 404 (row hidden by SELECT RLS — the row exists but is invisible, not merely "not found")
  2. `GET /api/v1/imports/00000000-0000-0000-0000-000000000000` (well-formed UUID, no row at all). Verify: HTTP 404, same envelope shape — confirms the API does not leak existence information between "row exists but hidden" and "row truly absent"

- Expected result: both cases return an identical 404 envelope — RLS-correct non-disclosure
- Test data: `{"id": "b4b8e74c-..."}`, `{"id": "00000000-0000-0000-0000-000000000000"}`
- Post-conditions: none

---

***TC-NEG-05 — Should verify bad-credentials behavior by code inspection (live negative path infeasible)***

- Related scenario: AC6
- Type: Negative · Priority: High (documented, not live-executed) · Test level: Code review / Static verification
- Parametrized: No
- Preconditions: n/a — this is a code-inspection verification, not a live execution (creds confirmed live & working server-side per the existing `completed` job)
- Test steps:

  1. Review `client.ts:120-122` — confirm `JiraAuthError` thrown when any of `ATLASSIAN*URL`/`ATLASSIAN*EMAIL`/`ATLASSIAN*API*TOKEN` is absent
  2. Review `client.ts:143-145` — confirm the same error type is thrown on Jira HTTP 401/403 responses
  3. Review `import-runner.ts:122-124` — confirm `JiraAuthError` is mapped to `errors: [{ code: "jira_unauthorized", ... }]`, `status: "failed"`
  4. Cross-check the error code value against AC6's literal expectation `errors[].code = jira*unauthorized` — confirm exact string match (not a near-miss like `JIRA*AUTH_FAILED`, which the shift-left's suggested-improvement #2 proposed but was NOT what shipped)

- Expected result: code path provably produces the AC6-specified envelope; verdict recorded as `VERIFIED-BY-CODE-INSPECTION` with file:line citations
- Test data: n/a
- Post-conditions: none — record verdict + rationale in the ATR; flag in the final report that the live negative path was out of bounds (would require disrupting shared staging Jira credentials)

---

***TC-BND-01 — Should accept a JQL at the minimum (1 char) and maximum (2000 char) length boundaries***

- Related scenario: Cross-cutting (input validation, parametrization Group 1)
- Type: Boundary · Priority: Medium · Test level: API
- Parametrized: Yes — Group 1 (5 data points: 0 / 1 / 19 / 2000 / 2001 chars)
- Preconditions: authenticated, valid project membership
- Test steps:

  1. For each `jql` value in the parametrization table: `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-...", jql: <value> }`
  2. Verify per row: `0` chars → 400; `1`/`19`/`2000` chars → 202 (queued, even if the JQL itself yields zero Jira results — that's a worker-level concern, not a route-validation concern); `2001` chars → 400

- Expected result: route-level length validation enforces the documented `1-2000` char range; boundary values (1, 2000) accepted, out-of-range values (0, 2001) rejected with 400
- Test data:

```json
[
  {"jql": "", "expectedStatus": 400},
  {"jql": "k", "expectedStatus": 202},
  {"jql": "key in (BK-8, BK-9)", "expectedStatus": 202},
  {"jql": "<exactly 2000 chars>", "expectedStatus": 202},
  {"jql": "<2001 chars>", "expectedStatus": 400}
]
```

- Post-conditions: cancel/let-complete any 202'd jobs from this boundary sweep before running TC-NEG-02 (avoid polluting the active-import-per-project state)

---

***TC-BND-02 — Should chunk an import over 100 issues and report an accurate final imported******_******count***

- Related scenario: AC5
- Type: Boundary · Priority: High (if feasible) / DEFERRED (if not) · Test level: Integration + API + DB
- Parametrized: No
- Preconditions: ***MUST FIRST**** probe whether any reachable JQL against `upexgalaxy` Jira returns >100 issues — ****resolve in Stage 2 before attempting this TC***; if no such JQL exists/is reachable, mark DEFERRED with the corpus-size finding as the reason
- Test steps (if feasible):

  1. Identify a broad JQL (e.g., `project = BK ORDER BY created DESC`) returning N > 100 issues
  2. `POST /api/v1/imports` Data: `{ project_id: "<project with capacity for N stories>", jql: "<broad JQL>" }`
  3. Poll repeatedly. Verify: `imported_count` increments in ≤100-row increments across multiple polls (visible partial progress, `import-runner.ts:97-107`), never jumps directly from 0 to N
  4. On `completed`. Verify: `imported*count = N` (matches the JQL's total result count exactly), `next*page_token` is `null`/cleared

- Expected result: pagination loop correctly pages at the 100-row Jira Cloud ceiling and the final count reconciles with the source total
- Test data: `{"jql": "<TBD — resolved in Stage 2 based on corpus probe>"}`
- Post-conditions: if executed, this creates N new `user_stories` rows — confirm with the user/PO whether this volume is acceptable on the shared staging project before running; consider an isolated throwaway project

---

***TC-INT-01 — Should persist accurate per-page progress to import******_******jobs during a multi-page run***

- Related scenario: AC5 (supporting integration check, runs alongside TC-BND-02 if feasible)
- Type: Integration · Priority: Medium · Test level: API + DB
- Parametrized: No
- Preconditions: same as TC-BND-02 (depends on a multi-page-eligible JQL existing)
- Test steps:

  1. While TC-BND-02's job is `running`, repeatedly `GET /api/v1/imports/{id}` and snapshot `imported*count` + `next*page_token`
  2. Verify: counts increase monotonically across polls, `next*page*token` changes between snapshots (proves per-page persistence, `import-runner.ts:97-107`), never decreases or resets mid-run

- Expected result: progress is durable and observable mid-flight, not just on terminal completion
- Test data: n/a (observation-only, piggybacks on TC-BND-02)
- Post-conditions: none — DEFER alongside TC-BND-02 if no multi-page JQL is reachable

---

***TC-INT-02 — Should extract Acceptance Criteria from description body only, ignoring custom-field ACs***

- Related scenario: Cross-cutting (AC heuristic, finding #6/#5 spot-check)
- Type: Integration · Priority: Medium · Test level: API + DB
- Parametrized: No
- Preconditions: identify (or use BK-8/BK-9) at least one issue whose description contains a recognizable "Acceptance Criteria" heading + bullet list, and ideally one issue that keeps ACs in a Jira custom field instead
- Test steps:

  1. After import, DB query: `SELECT title, position FROM acceptance*criteria WHERE user*story*id = (SELECT id FROM user*stories WHERE external_id = '<issue with description-body ACs>')`. Verify: rows match the bullet items under the description's "Acceptance Criteria" heading, in order
  2. For an issue keeping ACs in a custom field (if one exists in the candidate set): DB query the same. Verify: ***zero*** `acceptance_criteria` rows imported (expected — confirmed by Ely, "issues that keep ACs in a Jira custom field import 0 ACs")

- Expected result: heuristic correctly anchors on the description-body heading and ignores custom-field AC sources, matching Ely's documented expectation
- Test data: n/a (uses imported BK-8/BK-9 or a chosen alternative)
- Post-conditions: none

---

***TC-INT-03 — Should expose a consistent job-row envelope shape across all lifecycle stages when polled***

- Related scenario: AC1 (supporting, parametrization Group 2)
- Type: Integration · Priority: Medium · Test level: API
- Parametrized: Yes — Group 2 (3 lifecycle snapshots)
- Preconditions: a fresh import enqueued (chain off TC-POS-01's first POST, sample polls during its run)
- Test steps:

  1. Snapshot `GET /api/v1/imports/{id}` immediately after the 202 (expect `queued`)
  2. Snapshot again ~1-2s later (expect `running`, if the window is catchable — note if the job completes too fast to observe `running`)
  3. Snapshot at terminal `completed`
  4. For each snapshot. Verify: the envelope always exposes `{ id, workspace*id, project*id, jql, status, imported*count, created*count, updated*count, skipped*count, errors[], started*at, completed*at, created_at }` — no field appears/disappears across stages, only values change

- Expected result: stable response shape across the full lifecycle — critical for UI polling code that destructures the envelope
- Test data: see Group 2 table (queued / running / completed snapshots)
- Post-conditions: none — observation piggybacks on TC-POS-01

---

***TC-INT-04 — Should honor Jira 429 rate-limit backoff without surfacing a misleading error code***

- Related scenario: Cross-cutting (finding #8 — verified by code inspection, not forced live)
- Type: Integration · Priority: Low · Test level: Code review / Static verification
- Parametrized: No
- Preconditions: n/a — code-inspection verification (forcing a live 429 against shared staging Jira is out of bounds, same constraint as AC6)
- Test steps:

  1. Review `client.ts:79,87-96,147-153` — confirm backoff schedule `[1000, 2000, 4000, 8000, 16000]` ms, `Retry-After` header honored over the schedule, max 5 retries
  2. Confirm the failure mode after exhaustion: plain `JiraError(429)` → surfaces as generic `errors[].code = "job_failed"`, NOT a distinguishable rate-limit code — note this as a minor observability gap (not an AC violation, since no AC specifies the 429-exhaustion error code)

- Expected result: backoff schedule matches the architect's spec (max 5 retries); the generic-`job_failed` surfacing is confirmed-as-is, documented as a minor observability note in the ATR
- Test data: n/a
- Post-conditions: none

---

***TC-API-01 — Should return the documented 202 envelope shape on successful enqueue***

- Related scenario: AC1 (API contract)
- Type: API · Priority: Critical · Test level: API (contract validation against OpenAPI)
- Parametrized: No
- Preconditions: valid member session, valid `project_id`
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project_id: "ae10a3bd-...", jql: "key in (BK-9)" }`
  2. Verify: HTTP 202, `Content-Type: application/json`, body schema exactly `{ import*job*id: string (uuid), status: "queued" }` — no extra/missing keys, matches `api/schemas/` OpenAPI-derived types

- Expected result: contract-exact 202 response
- Test data: `{"project_id": "ae10a3bd-574f-4caf-8076-f19a8e80f5a6", "jql": "key in (BK-9)"}`
- Post-conditions: this enqueues a real job — coordinate timing with TC-NEG-02 to avoid 409 collisions

---

***TC-API-02 — Should return the documented 200 job envelope shape on poll***

- Related scenario: AC1 (API contract)
- Type: API · Priority: Critical · Test level: API (contract validation)
- Parametrized: No
- Preconditions: a known `import*job*id` reachable by the current user
- Test steps:

  1. `GET /api/v1/imports/{id}`
  2. Verify: HTTP 200, body schema exactly `{ import*job: { id, workspace*id, project*id, jql, status, imported*count, created*count, updated*count, skipped*count, errors: [{jira*key, code, message}] | [], started*at, completed*at, created*at } }` — types match OpenAPI (`api/schemas/`), `errors[]` items match `{ jira*key, code, message }` shape per finding

- Expected result: contract-exact 200 response, nested `import_job` object present
- Test data: `{"id": "<TC-POS-01's import*job*id>"}`
- Post-conditions: none

---

***TC-API-03 — Should validate jql length within the documented 1-2000 char contract***

- Related scenario: Cross-cutting (parametrization Group 1, contract-level framing of TC-BND-01)
- Type: API · Priority: Medium · Test level: API (contract validation, schema-error shape)
- Parametrized: Yes — Group 1 (reuses TC-BND-01's data set, asserts the 400 error BODY shape specifically)
- Preconditions: same as TC-BND-01
- Test steps:

  1. For the two invalid rows (`""` and 2001-char string): `POST /api/v1/imports`
  2. Verify: HTTP 400, body matches the documented validation-error envelope (e.g., `{ error: "validation_error", details: [...] }` or equivalent — confirm exact shape against `api/schemas/`)

- Expected result: validation failures return a structured, contract-conformant error body — not a bare string or stack trace
- Test data: `{"jql": ""}`, `{"jql": "<2001 chars>"}`
- Post-conditions: none

---

***TC-API-04 — Should reject a non-UUID project******_******id with a structured 400/422 error***

- Related scenario: Cross-cutting (input validation contract)
- Type: API · Priority: Medium · Test level: API
- Parametrized: No
- Preconditions: authenticated session
- Test steps:

  1. `POST /api/v1/imports` Data: `{ project_id: "not-a-uuid", jql: "key in (BK-9)" }`
  2. Verify: HTTP 400 (or 422), structured error body identifying `project_id` as the invalid field — no raw DB/driver error leaks

- Expected result: input validated before any DB/Jira call; clean structured error
- Test data: `{"project_id": "not-a-uuid", "jql": "key in (BK-9)"}`
- Post-conditions: none

---

**(continued in Part 4/4)**

---

### Andrés Daniel Cumare Morales - 6/7/2026, 10:41:44 AM

## Acceptance Test Results (ATR)

Test Results: BK-17 — pending execution

---

### Andrés Daniel Cumare Morales - 6/7/2026, 11:16:06 AM

## QA Status — Stage 2 Execution PAUSED (environment blocker)

Sprint-testing for this story is paused at Stage 2 (Execution). The smoke-test gate returned a No-Go: the entire Imports API surface (POST/GET /api/v1/imports*) returns 401 "You must be signed in" with a valid, unrevoked, freshly-minted PAT bearer token — the same token that authenticates successfully on /me and /workspaces. Re-tested with a second token; same result. The same 401 also reproduces on unrelated routes (Projects, Modules, Tokens), which indicates this is a staging-wide auth-middleware regression, NOT a defect in this story's implementation.

0 of the 22 planned ATP test outlines could be executed — every one requires at least one authenticated call to the Imports API. AC1-AC6 are recorded as DEFERRED pending environment fix.

Filed as a separate BLOCKING ticket: BK-84 — "[Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — requireAuth middleware regression". This story will resume QA once BK-84 is resolved (or a confirmed workaround is identified).

Stage 1 (Planning / ATP) is complete and committed — see the Acceptance Test Plan posted in this story's comments / acceptance*test*plan field.

---

### Carlos Alberto Chiavassa - 6/9/2026, 5:15:30 PM

## BK-17 Acceptance Test Results

***Tested******:*** 2026-06-09
***Environment******:*** Staging (staging-upexbunkai.vercel.app)
***Tester******:*** qa.bot.chiavassa@gmail.com
***Result******:*** PASSED WITH ISSUES — 10 executed / 21 total

> ***WARNING:**** ****8 TCs ENV*************BLOCKED*** — Vercel staging is missing `ATLASSIAN*URL`, `ATLASSIAN*EMAIL`, `ATLASSIAN*API*TOKEN` server-side. All positive/integration TCs requiring a real Jira fetch cannot run. Story must stay in testing until these vars are configured and ENV*BLOCKED TCs are re-executed.

---

### Summary

Tested `POST /api/v1/imports` and `GET /api/v1/imports/{id}` (Jira Import — Pull by JQL). All API contract, boundary, auth, and error-handling TCs passed. No code defects found. The 8 ENV_BLOCKED TCs cover ACs 1–5 and require a live Jira connection.

### Test Results

| TC | Title | Type | Result |
| --- | --- | --- | --- |
| TC-API-01 | 202 envelope — POST /imports | API | {status:green | PASSED} |
| TC-API-02 | 200 poll envelope — GET /imports/{id} | API | {status:green | PASSED} |
| TC-API-03 | JQL >2000 chars → 422 | API | {status:green | PASSED} |
| TC-API-04 | Non-UUID project_id → 422 | API | {status:green | PASSED} |
| TC-NEG-01 | Non-member → 404 RLS non-disclosure | Negative | {status:yellow | FINDING} |
| TC-NEG-02 | Concurrent import → 409 | Negative | {status:blue | CODE-REVIEW} |
| TC-NEG-03 | Malformed job id → 400 | Negative | {status:green | PASSED} |
| TC-NEG-04 | Inaccessible job → 404 RLS | Negative | {status:green | PASSED} |
| TC-NEG-05 | Bad credentials → jira_unauthorized | Negative | {status:blue | CODE-REVIEW} |
| TC-BND-01 | JQL length (4 checkpoints) | Boundary | {status:green | PASSED} |
| TC-INT-03 | Job lifecycle shapes (queued + failed) | Integration | {status:yellow | PARTIAL} |
| TC-INT-04 | 429 backoff schedule | Integration | {status:blue | CODE-REVIEW} |
| TC-POS-01 | Fresh import accurate counts | Positive | {status:red | ENV_BLOCKED} |
| TC-POS-02 | Idempotent re-run zero duplicates | Positive | {status:red | ENV_BLOCKED} |
| TC-POS-03 | Component routing to Module | Positive | {status:red | ENV_BLOCKED} |
| TC-POS-04 | Inbox fallback auto-create | Positive | {status:red | ENV_BLOCKED} |
| TC-POS-05 | UI poll dialog | Positive | {status:neutral | N/A} |
| TC-POS-06 | ADF to Markdown spot-check | Positive | {status:red | ENV_BLOCKED} |
| TC-BND-02 | Chunking over 100 issues | Boundary | {status:red | ENV_BLOCKED} |
| TC-INT-01 | Per-page progress durable | Integration | {status:red | ENV_BLOCKED} |
| TC-INT-02 | AC heuristic description-body | Integration | {status:red | ENV_BLOCKED} |

### Test Data

| Entity | Name | ID |
| --- | --- | --- |
| Workspace (QA bot) | BK-17 QA Test Workspace | 047a3ba6-6c30-4abd-a52f-b84da723652b |
| Project (QA bot) | BK-17 Import Test Project | f31fbabd-ce89-43e9-8220-b287179a4670 |
| JQL used | key in (BK-8, BK-9) | — |

### Bugs Found

None.

### Observations

> ***INFO:**** ****TC-NEG-01 — WAD******:*** Non-member returns `404 not*found`, not `403 forbidden`. RLS makes the project invisible via the projects SELECT, so the route hits `not*found` before the INSERT. The `403` path fires only for viewer-role members. More secure by design. ATP expectation needs correction.

> ***INFO:**** ****TC-API-03 / TC-API-04 — spec gap******:*** Zod validation errors return `422 validation_failed`; OpenAPI spec documents only `400`. Behavior is correct; spec needs a `422` response entry.

> ***INFO:**** ****TC-NEG-02 — timing note******:*** Concurrent 409 could not be demonstrated live. Background worker completes in ~42ms (env-blocked fast-fail), shorter than network RTT. Partial unique index `import*jobs*one*active*per_project` (migration 0020) confirmed correct in DB schema.

> ***WARNING:**** ****ENV*************BLOCKED root******:*** `lib/jira/client.ts:98-101` reads `env.ATLASSIAN*URL`, `env.ATLASSIAN*EMAIL`, `env.ATLASSIAN*API*TOKEN`. Not set in Vercel staging. All 9 import jobs in this session failed within 54ms with `jira*unauthorized: "Jira credentials are not configured."`.

### Recommendations

1. ***URGENT******:*** Set `ATLASSIAN*URL`, `ATLASSIAN*EMAIL`, `ATLASSIAN*API*TOKEN` in Vercel staging project settings. Re-run TC-POS-01..04, TC-POS-06, TC-BND-02, TC-INT-01..02 after.
2. ***OpenAPI spec******:*** Add `422` response to `POST /api/v1/imports` for Zod validation path.
3. ***ATP correction******:*** Update TC-NEG-01 expectation from `403` to `404`; add viewer-role TC.
4. ***BK-84******:*** Close in Jira — bearer auth fix (commit `7c56670`) on staging since 2026-05-27; PAT auth confirmed working.

---

### Carlos Alberto Chiavassa - 6/9/2026, 5:15:34 PM

## QA Testing Complete — BK-17

***Environment******:*** Staging (staging-upexbunkai.vercel.app)
***Result******:*** PASSED WITH ISSUES (10/21 TCs executed; 8 ENV_BLOCKED)

### Test Data Used

- Workspace: BK-17 QA Test Workspace (`047a3ba6`)
- Project: BK-17 Import Test Project (`f31fbabd`)
- JQL: `key in (BK-8, BK-9)`

### Verified Behaviors

- AC6 (bad credentials): `jira_unauthorized` error — VERIFIED via code inspection + live precondition path
- API contract: 202 enqueue envelope, 200 poll envelope with full job object — VERIFIED
- Error handling: 400 malformed job id, 404 RLS non-disclosure (inaccessible job + non-member), 409 serialization logic — VERIFIED
- JQL validation: empty→422, 1-char→202, 2000-char→202, 2001-char→422 — VERIFIED (all 4 boundaries)

### Blocked (Environment)

> ***WARNING:*** ACs 1–5 (import counts, idempotency, component routing, inbox fallback, chunking) require a live Jira connection. `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API*TOKEN` not set in Vercel staging. Re-run after env configuration.

### Finding (non-defect)

- ***TC-NEG-01******:*** Non-member project returns `404` (RLS non-disclosure), not `403` as the ATP expected. Working as designed — more secure.

Story remains ***In Test*** until ENV_BLOCKED TCs are executed after env vars are configured.

Full test evidence in the ATR comment above.

---


_Synced from Jira by sync-jira-issues_
