# Sprint 1 — In-Sprint Development Tracker

> Purpose: track dev progress per ticket; cross-ticket aggregate for AI session resume.
> Sprint: 1 (Jira: "Bunkai (67) Sprint 1", board 7) | Tech Lead: Ely | Started: 2026-06-03 | Last Updated: 2026-06-04
>
> **Authoritative build order + Part 1 / Part 2 split:** `.context/PBI/sprint-sequence.md`.
> **Operational gotchas for a fresh session:** see "Operational Notes" below + Engram topic keys
> `sprint/sprint-1-roadmap`, `config/jira-site-target`, `pbi/bk-8/implementation`, `pbi/bk-9/implementation`.

## Board Summary

| Status           | Count | Dev Relevant            |
| ---------------- | ----- | ----------------------- |
| Ready For Dev    | 6     | YES — queue head        |
| In Progress      | 0     | YES — being implemented |
| In Review        | 0     | YES — PR open           |
| Estimation       | 1     | pulled in (treat as shift-left done) |
| Shift-Left QA    | 7     | pulled in (treat as shift-left done) |
| Ready For QA     | 5     | NO — handed to QA       |
| QA Approved      | 1     | NO — done               |
| Total Sprint 1   | 20    |                         |

Dev scope = 16 of 20 (4 already dev-done: BK-2 QA Approved; BK-4/5/6 Ready For QA — excluded from development).

## Development Queue (Priority Order)

### In-Flight — Active Work

> Tickets currently in `In Progress` or `In Review`.

| #   | Ticket | Type  | Title | Priority | Owner | Impl Plan | PR  | Delivery Strategy | Forecast Risk | Status |
| --- | ------ | ----- | ----- | -------- | ----- | --------- | --- | ----------------- | ------------- | ------ |
| —   | —      | —     | (none in flight — between stories) | — | — | — | — | — | — | — |

### Queue — Part 1 remaining (build in this order)

| # | Ticket | Type  | Title | Jira Status | SP | Notes |
| - | ------ | ----- | ----- | ----------- | -- | ----- |
| — | —      | —     | **Part 1 COMPLETE — 8/8 Ready For QA.** Next batch = Part 2 (see `sprint-sequence.md`). | — | — | — |

### Pipeline — Part 2 (next batch, NOT this session)

> Differentiator + execution layer. Full order in `sprint-sequence.md`.

| Ticket | Title | Jira Status | SP |
| ------ | ----- | ----------- | -- |
| BK-3  | Authentication \| Sign up/sign in via OAuth (GitHub/Google) | Ready For Dev | 8 |
| BK-18 | TMS-ATC API \| Create and edit ATCs with steps and assertions | Ready For Dev | 5 |
| BK-19 | TMS-ATC Builder \| Build an ATC with ordered steps and assertions | Shift-Left QA | 5 |
| BK-20 | TMS-ATC Search \| Search and autocomplete ATCs | Ready For Dev | 5 |
| BK-21 | TMS-ATC Propagation \| Cascade ATC edits to all tests | Shift-Left QA | 5 |
| BK-22 | TMS-ATC Usage \| See a "Used in N tests" report | Ready For Dev | 3 |
| BK-23 | TMS-ATC Duplicate \| Duplicate an ATC with steps and assertions | Shift-Left QA | 2 |
| BK-27 | TMS-Test Builder \| Assemble a test by chaining ATCs | Shift-Left QA | 3 |

### Done — This Sprint

| Ticket | Title | Owner | PR  | Merged     | Staging    | Prod | Notes (QA hand-off) |
| ------ | ----- | ----- | --- | ---------- | ---------- | ---- | ------------------- |
| BK-8 | Create a project inside a workspace | Ely | #7 | 2026-06-03 | 2026-06-03 | —   | Ready For QA. Hybrid error model; as-built contract in the Jira QA comment. |
| BK-9 | Create modules with nested sub-modules | Ely | #8 | 2026-06-04 | 2026-06-04 | —   | Ready For QA. Migration 0013 applied; tree UI + breadcrumb; as-built contract in the Jira QA comment. |
| BK-10 | Rename and soft-delete a module | Ely | #9 | 2026-06-04 | 2026-06-04 | —   | Ready For QA. Migration 0014 (archived_at x4 + 2 SECURITY DEFINER fns: rename+path-rebuild, cascade archive); flat PATCH/DELETE /modules/{id}; rename+delete UI. as-built contract in the Jira QA comment. |
| BK-11 | Move a module to a different parent | Ely | #11 | 2026-06-04 | 2026-06-04 | —   | Ready For QA. Migration 0015 (bunkai_move_module: atomic re-parent + path rebuild; cycle via materialized path; depth check). PATCH /modules/{id} parent_module_id branch; move dialog (valid-targets picker). as-built contract in the Jira QA comment. |
| BK-16 | Markdown editor + safe render | Ely | #12 | 2026-06-04 | 2026-06-04 | —   | Ready For QA. Reusable MarkdownEditor + MarkdownRenderer (react-markdown+remark-gfm+rehype-sanitize, no rehype-raw) + save-path sanitizer; mounted on module description. Deviated from sanitize-html (corrupts MD) — render is the XSS wall. Security review: 0 render-exploitable XSS. No DB. |
| BK-14 | Manage user stories anchored to a module | Ely | #13 | 2026-06-04 | 2026-06-04 | —   | Ready For QA. Migration 0016 (denorm project_id + partial unique index on (project_id, upper(external_id))). Scoped create/list + flat mutate API; Jira-key validation/immutability/uniqueness; soft-delete; reuses MarkdownEditor 50KB. Review caught + fixed a create-schema BLOCKER (null fields). |
| BK-15 | Manage acceptance criteria under a user story | Ely | #14 | 2026-06-05 | 2026-06-05 | —   | Ready For QA. Migrations 0017 (US.status + partial unique pos index + insert/move/archive SECURITY DEFINER fns, collision-free negative-parking rebalance) + 0018 (serialized ready-to-test gate setter, review fix). Scoped create/list + flat GET/PATCH/DELETE AC API; ready-to-test gate (409); live AcceptanceCriteriaPanel (up/down reorder, edit, remove, status toggle). Adversarial review GO-WITH-FIXES → fixed MAJOR TOCTOU race + 2 MINORs. Ordering+gate proven end-to-end vs live DB. |
| BK-17 | Jira Import — pull issues by JQL | Ely | #15 | 2026-06-05 | 2026-06-05 | —   | Ready For QA. **Closes Part 1.** Migrations 0019 (import_jobs + RLS) + 0020 (one-active-per-project unique index). lib/jira: adf-to-markdown + extract-acceptance-criteria + client (v3 /search/jql + nextPageToken + 429 backoff) + import-runner (service-role worker, atomic claim, ADF→MD 50KB truncate, component→Module/Inbox, idempotent US upsert, AC reconcile). POST/GET imports routes (after() background, serialize 409). Import dialog + poll. 3 pure libs built in PARALLEL via Workflow. Adversarial review GO-WITH-FIXES → fixed MAJOR stuck-running/double-count (atomic claim+unique index) + DI'd worker test (AC2-6). Live read smoke vs real Jira green. NOTE: staging needs ATLASSIAN_* env for live import. |

### Blocked

| Ticket | Owner | Blocking | Since | Decision Pending |
| ------ | ----- | -------- | ----- | ---------------- |
| (none) | | | | |

### Cancelled (Aborted)

| Ticket | Reason | Decided By | Date |
| ------ | ------ | ---------- | ---- |
| (none) | | | |

## Sprint 1 Stats

| Metric                              | Value |
| ----------------------------------- | ----- |
| Total Sprint Tickets                | 20    |
| Dev scope (this + next batch)       | 16    |
| In-Flight (In Progress + In Review) | 0     |
| Merged this sprint                  | 8 (BK-8, BK-9, BK-10, BK-11, BK-16, BK-14, BK-15, BK-17) |
| Staging-deployed                    | 8 (BK-8, BK-9, BK-10, BK-11, BK-16, BK-14, BK-15, BK-17) |
| Prod-deployed                       | 0     |
| Blocked                             | 0     |
| Cancelled                           | 0     |
| Part 1 progress                     | **8 / 8 — COMPLETE** |
| Estimated LOC delivered so far      | ~230 (BK-8) + ~600 (BK-9) + ~1435 (BK-10) + ~555 (BK-11) + ~900 (BK-16) + ~900 (BK-14) + ~1050 (BK-15) + ~1750 (BK-17) |

## Operational Notes (session-learned — honor these; also in Engram)

These are NOT in the skills — they are this project's infra realities:

1. **Jira site = `upexgalaxy69`** — verify `acli jira auth status` before any Jira op; re-login to 69 if it drifted to 67.
2. **Custom fields** read via REST or `--fields '*all'` (default `view` omits them). Story Points = `customfield_10035`.
3. **Jira does NOT auto-transition** — do In Progress / In Review / Ready For QA manually with `acli`.
4. **Supabase MCP** (project `fmbpikzpkafptqximhxn`) may be Unauthorized at spawn → user runs `/mcp`. Migrations via MCP `apply_migration`; then `bun run types:gen` + patch `lib/types.ts`. Single-project tenancy → keep migrations additive.
5. **Solo-owner merge** to `staging`: `gh pr merge <N> --merge --admin --delete-branch` (REVIEW_REQUIRED, author can't self-approve).
6. **Pre-push** runs `repo:check` (`format:check` repo-wide) — `prettier --write` an unrelated dirty file (e.g. `.mcp.json`) rather than committing it.
7. **Tests** = `bun test` (no `test` script). **OpenAPI** regen = `bun run openapi:gen` (+ side-effect import in `scripts/openapi-gen.ts`).
8. **Mirror** the route pattern of `app/api/v1/workspaces/[id]/projects/route.ts` (BK-8) / `app/api/v1/projects/[id]/modules/route.ts` (BK-9): cookie + RLS, hybrid error (`code` + `details.reason`). UI reuses `DESIGN.md` + shadcn + `lib/tree.ts` + `Sidebar` + `Topbar` Breadcrumb.

## Session Log

### 2026-06-03 — Sprint 1 dev batch started
- Roadmap sequenced into Part 1 / Part 2 (8 + 8) — `.context/PBI/sprint-sequence.md`. Story points written to Jira for the 16 dev stories (AI scale).
- Fixed acli site drift (67 → 69); re-synced `.agents/jira-*` catalogs to site 69.
- Created this tracker.

### 2026-06-03 — BK-8 IN_PROGRESS → STAGING_DEPLOYED
- Plan pushed, In Progress, branch `feature/BK-8-create-project`. API + UI. PR #7, code-review GO-WITH-FIXES (fixed), merged via `--admin`, staging deploy READY, Jira → Ready For QA.

### 2026-06-04 — BK-9 IN_PROGRESS → STAGING_DEPLOYED
- Migration 0013 (modules.description) via Supabase MCP. API + tree UI + breadcrumb (AC2). PR #8, code-review GO-WITH-FIXES (AC2 breadcrumb added), merged via `--admin`, staging deploy READY, Jira → Ready For QA.

### 2026-06-04 — BK-10 IN_PROGRESS → STAGING_DEPLOYED
- Migration 0014 (archived_at on modules/user_stories/acceptance_criteria/atcs + bunkai_update_module rename/path-rebuild + bunkai_archive_module_subtree cascade, both SECURITY DEFINER) via Supabase MCP. Flat PATCH/DELETE `/api/v1/modules/{id}`. Rename form + delete dialog + per-node tree actions; active-tree archived filter. PR #9, code-review GO-WITH-FIXES (cascade copy + SQL slug guard fixed), merged via `--admin`, staging deploy READY (`staging-upexbunkai.vercel.app`), Jira → Ready For QA.

### 2026-06-04 — BK-11 IN_PROGRESS → STAGING_DEPLOYED
- Migration 0015 (bunkai_move_module SECURITY DEFINER: no-op short-circuit, same-project + cycle via materialized path, depth math, atomic re-parent + recursive path rebuild + reposition). PATCH /api/v1/modules/{id} parent_module_id branch (45001/45002/45003 reason codes). isDescendantPath + movedSubtreeMaxDepth helpers. move-module-dialog (valid-targets picker) + Sidebar Move action. PR #11, code-review GO-WITH-FIXES (no blocking; logic verified), merged via --admin, staging deploy READY (`staging-upexbunkai.vercel.app`, 8fd44e2), Jira → Ready For QA.

### 2026-06-04 — Mid-sprint gap remediation
- Fixed gap: archived ATCs reachable via detail deep-link (fix(BK-10) PR #10, b6e646a). Opened follow-up tickets BK-57 (PATCH rename+move atomicity), BK-58 (migration ledger cleanup), BK-59 (activity_log audit on structural ops). Convention: every listing query filters archived_at IS NULL (Engram convention/archived-filtering).

### 2026-06-04 — BK-16 IN_PROGRESS → STAGING_DEPLOYED
- Markdown editor + safe render path. Deps react-markdown/remark-gfm/rehype-sanitize (sanitize-html removed — corrupts MD; render is the XSS wall, no rehype-raw). lib/markdown/sanitize.ts (save cleaner) + format.ts (toolbar helpers) + MarkdownEditor + MarkdownRenderer; mounted on module description (create/rename forms), sanitize on POST + PATCH save paths. PR #12, security review GO (0 render-exploitable XSS, every vector rendered through the real pipeline), merged --admin (97ba126), staging READY, Jira → Ready For QA. Carry-forward to BK-14/15: overCap submit-gate + server 50KB guard for byte-mode mount.

### 2026-06-04 — BK-14 IN_PROGRESS → STAGING_DEPLOYED
- US CRUD anchored to module. Migration 0016 (denorm project_id + partial unique index for per-project case-insensitive Jira-key uniqueness). Scoped create/list /api/v1/modules/{id}/user-stories + flat GET/PATCH/DELETE /api/v1/user-stories/{id}; CRUD via existing RLS. Jira-key validation + immutability + soft-delete; reuses MarkdownEditor (50KB) + sanitizer. Sidebar New US + per-US edit/remove. PR #13, review caught a BLOCKER (CreateBodySchema rejected null desc/key → title-only create broken) — fixed + verified. Merged --admin (8a19b1f), staging READY, Jira → Ready For QA.

### 2026-06-05 — BK-15 IN_PROGRESS → STAGING_DEPLOYED
- AC CRUD under a user story + ordering + ready-to-test gate. Migration 0017 (user_stories.status; full→partial unique pos index; bunkai_insert/move/archive_acceptance_criterion SECURITY DEFINER, collision-free negative-parking shift) + 0018 (bunkai_set_user_story_status serialized FOR UPDATE gate — review fix for a TOCTOU race; archive-fn parent-active filter). Scoped POST/GET + flat GET/PATCH/DELETE AC routes; gate on US PATCH (409 ac_required_for_ready_to_test). AcceptanceCriteriaPanel (live, up/down reorder, edit, remove, status toggle, sanitized detail render). OpenAPI +2 paths. Ordering+gate+revert proven end-to-end vs live Postgres (JWT-impersonation, rolled back). PR #14, adversarial review GO-WITH-FIXES (fixed MAJOR + 2 MINOR), merged --admin (5ad4a4d), staging READY (`staging-upexbunkai.vercel.app`), Jira → Ready For QA.

### 2026-06-05 — BK-17 IN_PROGRESS → STAGING_DEPLOYED (Part 1 CLOSED)
- Async one-way Jira import by JQL. MVP scope (Next.js route worker via after(), env single-tenant creds, import dialog+poll, 6 ACs). Migrations 0019 (import_jobs + RLS) + 0020 (one-active-per-project unique). lib/jira/{adf-to-markdown,extract-acceptance-criteria,client,import-runner} — 3 pure libs built in parallel via Workflow (3 subagents). POST/GET imports routes (after() background, serialize 409). Import dialog. OpenAPI +2 paths (23 total). Live read-only smoke vs real Jira green (HTTP 200, pagination, ADF→MD). PR #15, adversarial review GO-WITH-FIXES → fixed MAJOR stuck-running+double-count (atomic claim + unique index 0020) + DI'd worker test (131 tests total). Merged --admin (8c35c23), staging READY, Jira → Ready For QA. NOTE: staging Vercel needs ATLASSIAN_* env for live import (absent → graceful jira_unauthorized = AC6).

### Sprint 1 Part 1 — COMPLETE (8/8 Ready For QA)
- BK-8, BK-9, BK-10, BK-11 (Project & Module hierarchy) + BK-16, BK-14, BK-15, BK-17 (US & AC). All Ready For QA, awaiting testers. Open debt tickets: BK-57/58/59. Next batch = Part 2 (OAuth + ATC Library + Test) per `sprint-sequence.md`.
