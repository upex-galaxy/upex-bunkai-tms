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


_Synced from Jira by sync-jira-issues_
