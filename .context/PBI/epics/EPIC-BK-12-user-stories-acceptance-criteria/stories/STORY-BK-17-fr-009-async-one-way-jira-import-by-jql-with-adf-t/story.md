# Jira Import | Pull Jira issues by JQL

**Jira Key:** [BK-17](https://jira.upexgalaxy.com/browse/BK-17)
**Epic:** [BK-12](https://jira.upexgalaxy.com/browse/BK-12) (User Stories & Acceptance Criteria)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec:*** FR-009

## User story

As a Project lead, I want to pull a batch of Jira issues into Bunkai by JQL, with idempotent re-runs and component-to-Module mapping, so I can seed a Project from an existing Jira backlog without manual copy-paste.

This story implements FR-009 and PRD US 3.3. Import runs asynchronously: the API returns an `import*job*id` immediately; a background worker calls the Jira REST `search` endpoint, converts each issue's ADF description into Markdown, extracts Acceptance Criteria via heuristic parsing, maps Jira components to Bunkai Modules by name, and upserts `user*stories` rows keyed on `external*id`.

## Business rules

- Import is one-way (Jira -> Bunkai); Bunkai never writes back to Jira in this story.
- `external_id` is the idempotency key (Project + uppercase Jira key).
- Max 500 issues per Jira `search` request; jobs auto-chunk above that.
- A job result includes `imported*count`, `created*count`, `updated*count`, `skipped*count`, `errors[]`.
- Per-issue failures append to `errors[]` but do not abort the job.
- Inbox auto-creation: if no Module named `Inbox` exists under Project P, create one before placing unmatched issues.
- The worker honors Jira rate limits - `429` triggers exponential backoff, max 5 retries.

## Workflow

The user opens Project settings, picks ***Import from Jira***, enters a JQL, and submits. The Next.js API route enqueues a row in `import*jobs` (status `queued`) and returns the `import*job*id`. A `pg*cron`-scheduled Supabase Edge Function picks up queued jobs, fetches credentials from the Workspace integration config, calls Jira REST `/search` in chunks of 500, parses each issue's ADF description into Markdown, runs the AC heuristic to split out Acceptance Criteria, resolves the target Module (component match or Inbox), and upserts `user*stories` + `acceptance*criteria` rows keyed on `external*id`. Status transitions `queued -> running -> completed` (or `failed`), with counts and per-issue errors recorded on the `import*jobs` row for polling.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

---

## QA Refinements (Shift-Left Analysis)

### Refined Acceptance Criteria (Given/When/Then, specific data)

***AC1 — Start + poll (fresh import)***: Given a member of "BK-9 QA Testing" on project "BK-9 Module Test Project" (`ae10a3bd-574f-4caf-8076-f19a8e80f5a6`) with no prior `import*jobs` history, when they `POST /api/v1/imports` with `{ project*id: "ae10a3bd-...", jql: "key in (BK-8, BK-9)" }`, then the API returns 202 `{ import*job*id, status: "queued" }` and polling shows `queued → running → completed` with `imported*count = 2`, `created*count = 2`, `updated_count = 0`, `errors = []`.

***AC2 — Idempotent re-run (additive-only)***: Given the AC1 job has completed, when the same payload is submitted again, then the new job completes with `created*count = 0`, `updated*count = 2`, zero duplicate `user*stories` rows (DB-verified `external*id IN ('BK-8','BK-9')`), and module placement / status survive the re-import untouched (only `title`/`description` refresh).

***AC3 — Component routing***: Given a Module name matches (case-insensitive) the Jira `component` of an issue in the JQL result set, when the import completes, then that story's `module*id` resolves to the matching Module (DB join `user*stories.module_id = modules.id AND lower(modules.name) = lower(component)`).

***AC4 — Inbox fallback****: Given an issue carries no component (or an unmatched one), when the import completes, then an "Inbox" Module is auto-created at root level (`parent*module*id: null`) if absent, the story routes there, and ****no*** `errors[]` entry is recorded.

***AC5 — Chunking (>100 issues)****: Given a JQL returns more than 100 issues (Jira Cloud page-size ceiling = 100), when the import runs, then the worker pages in ≤100-issue chunks and the final `imported_count` equals the total. ****Feasibility: UNKNOWN — depends on whether a >100-issue JQL is reachable on the real ****`upexgalaxy`**** corpus; to be probed live in Stage 2, may be DEFERRED if infeasible.***

***AC6 — Bad credentials****: Given `ATLASSIAN*URL`/`ATLASSIAN*EMAIL`/`ATLASSIAN*API*TOKEN` are missing or invalid, when the worker calls Jira `/search`, then `errors[].code = "jira_unauthorized"` and `status = "failed"` (confirmed at `client.ts:120-122,143-145` and `import-runner.ts:122-124`). ****Feasibility: LIKELY UNTESTABLE LIVE — staging creds are confirmed live & working (existing completed job ****`b4b8e74c-...`**** proves it); forcing this path requires disrupting shared staging config. Recommended verdict path: VERIFIED-BY-CODE-INSPECTION.***

### Edge Cases Identified

- ***Concurrent import 409*** (shift-left Gap #5, now CLOSED): a second `POST /api/v1/imports` for a project with an active (`queued`/`running`) job returns 409 `{ reason: "import*in*progress" }`, enforced at the DB layer by the partial UNIQUE index `import*jobs*one*active*per_project` (migration `0020`) — race-proof, not just app-level.
- ***Crash recovery / stuck-****`running` (shift-left Gap #1, partially open): re-run is the chosen crash-recovery strategy (Option A, confirmed by Ely) and is safe/idempotent. However `next*page*token` is persisted but never read back on restart, and ****no timeout sweeper exists**** — a worker that dies mid-job leaves the row stuck `running` forever, permanently blocking new imports on that project. This is a ****documented residual structural risk***, not exercisable live (cannot force a mid-job crash safely).
- ***Unsupported ADF nodes degrade silently***: tables, panels, emoji/expand macros flatten to text content — nothing throws, no `errors[]` entry (graceful degradation, not "document what strips/converts/errors" per the original shift-left ask, but confirmed safe).
- ***Custom-field ACs import as 0***: confirmed expected — Acceptance Criteria are extracted from the description body only; issues keeping ACs in a Jira custom field correctly import zero ACs.
- ***429 backoff exhaustion surfaces as generic ***`job*failed`: the backoff schedule (1s/2s/4s/8s/16s, max 5 retries) matches the architect's spec, but exhaustion produces a generic `job*failed` code rather than a distinguishable rate-limit code — minor observability gap, not an AC violation.

### Clarified Business Rules

- `external*id = issue.key.trim().toUpperCase()`; upsert is keyed on `(project*id, external*id, archived*at IS NULL)`.
- Re-import updates ONLY `title`/`description`; module placement and status are intentionally left untouched (manual moves survive re-import).
- AC reconciliation on re-import is additive-only — appends criteria whose `lower(title)` isn't already present; never removes or restores manually edited/removed ACs.
- Inbox Module is created at ***root level*** (`parent*module*id: null`), positioned after existing root siblings.
- Descriptions are truncated at 50 KB with a visible Markdown blockquote marker (confirms "truncate with marker" was the chosen option for CQ#3).
- Only `summary, description, components, issuetype` are read from Jira `SEARCH_FIELDS` — all other fields (epic link, story points, labels, fixVersions, priority) are genuinely discarded, confirmed out-of-scope per Ely's Phase-2 list.

---

**QA Acceptance Test Plan posted as a 4-part comment series (jira-native modality — **`Acceptance Test Plan (ATP)`** custom field not configured on this instance). Test Results placeholder posted; full ATR to follow at Stage 3.**

---

## Traceability

### Tests (6)

- [BK-169](https://jira.upexgalaxy.com/browse/BK-169): BK-17: TC01: Validate fresh Jira import completes with accurate counts and correct API envelope _(Candidate)_
- [BK-170](https://jira.upexgalaxy.com/browse/BK-170): BK-17: TC02: Validate idempotent re-import updates without duplicating stories _(Candidate)_
- [BK-171](https://jira.upexgalaxy.com/browse/BK-171): BK-17: TC03: Validate concurrent import returns 409 import_in_progress _(Candidate)_
- [BK-172](https://jira.upexgalaxy.com/browse/BK-172): BK-17: TC04: Validate chunked pagination across >100 issues with accurate final count _(Candidate)_
- [BK-173](https://jira.upexgalaxy.com/browse/BK-173): BK-17: TC05: Validate input validation rejects invalid JQL and project_id _(Candidate)_
- [BK-174](https://jira.upexgalaxy.com/browse/BK-174): BK-17: TC06: Validate RLS non-disclosure on non-member and inaccessible resources _(MANUAL)_

### Bugs (2)

- [BK-84](https://jira.upexgalaxy.com/browse/BK-84): [Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — requireAuth middleware regression _(Closed)_
- [BK-142](https://jira.upexgalaxy.com/browse/BK-142): [BK-17] Staging Jira import fails instantly with jira_unauthorized — ATLASSIAN_* credentials not configured in staging deployment _(Closed)_

### Storys (2)

- [BK-14](https://jira.upexgalaxy.com/browse/BK-14): TMS-US | Manage user stories anchored to a module _(QA Approved)_
- [BK-15](https://jira.upexgalaxy.com/browse/BK-15): TMS-AC | Manage criteria under a user story _(Ready For Release)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 7/24/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** integration, jira-import, mvp, shift-left-2026-05-27, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
