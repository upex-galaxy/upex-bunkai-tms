# Functional Specifications — Bunkai MVP

> Each FR maps to a User Story in `.context/PRD/mvp-scope.md`. Validations + processing intentionally specific so subagents can implement without re-deriving rules.

---

## EPIC-BK-001 — Tenancy & Identity

### {{PROJECT_KEY}}-001 — Email + OAuth sign-up
- **Relacionado a**: EPIC-BK-001, US 1.1
- **Input**:
  - `email` (RFC 5321, max 254 chars) — for magic-link flow.
  - OAuth provider token (GitHub / Google) returned by Supabase Auth.
- **Processing**:
  - Validate email format / OAuth state.
  - Create or upsert `users` row via Supabase Auth.
  - Send verification email (Supabase managed).
  - On first verified login, create a personal default Workspace (`name = "{display_name}'s workspace"`) unless user accepted an invite.
- **Output**: 201 `{ user_id, email, default_workspace_id }`; or 400 with `code` from { `INVALID_EMAIL`, `EMAIL_EXISTS`, `OAUTH_DENIED` }.
- **Validations**: email unique in `auth.users`; OAuth state CSRF token present.

### {{PROJECT_KEY}}-002 — Workspace creation
- **Relacionado a**: US 1.2
- **Input**: `name` (3–60 chars, unique-per-owner case-insensitive), `slug` (auto-derived, kebab-case, unique globally).
- **Processing**: Insert `workspaces` row; insert creator into `workspace_members` with role `owner`; emit `workspace.created` event.
- **Output**: 201 `{ workspace_id, slug }`.
- **Validations**: at least 1 char alphanumeric in `name`; slug not in reserved list (`api`, `app`, `auth`, `admin`, `bunkai`, ...).

### {{PROJECT_KEY}}-003 — Invite teammate
- **Relacionado a**: US 1.3
- **Input**: `workspace_id`, `email`, `role` (`owner|admin|member|viewer`).
- **Processing**: Generate signed invite token (24h expiry); send email; insert `workspace_invites` row.
- **Output**: 201 `{ invite_id, expires_at }`.
- **Validations**: caller is owner or admin of the workspace; email not already a member; `role` ≤ caller's role.

### {{PROJECT_KEY}}-004 — Workspace switch
- **Relacionado a**: US 1.4
- **Input**: `workspace_id`.
- **Processing**: Verify membership; rotate session's `active_workspace_id`.
- **Output**: 200 `{ workspace }`.
- **Validations**: user is a member with status `active`.

---

## EPIC-BK-002 — Project & Module Hierarchy

### {{PROJECT_KEY}}-005 — Project creation
- **Relacionado a**: US 2.1
- **Input**: `workspace_id`, `name` (3–80 chars), `slug` (auto, kebab-case, unique within workspace), optional `description`.
- **Processing**: Insert `projects` row.
- **Output**: 201 `{ project_id, slug }`.
- **Validations**: caller member of workspace with role ≥ member; slug unique in workspace.

### {{PROJECT_KEY}}-006 — Module CRUD with nesting
- **Relacionado a**: US 2.2, US 2.3
- **Input**: `project_id`, `name` (2–80 chars), optional `parent_module_id`, optional `description` (Markdown).
- **Processing**: Insert / update / soft-delete `modules` row. Maintain `path` materialized column (`/cart/add-to-cart`) for tree queries. Soft-delete cascades to descendant modules + linked entities (US, ATC, Tests) via `archived_at`.
- **Output**: 201/200 `{ module }`; or 409 `MODULE_CIRCULAR_PARENT`.
- **Validations**: depth ≤ 6 (soft warning at depth 4 returned in response metadata); parent in same project; no circular ancestry.

---

## EPIC-BK-003 — User Stories & Acceptance Criteria

### {{PROJECT_KEY}}-007 — User Story CRUD
- **Relacionado a**: US 3.1, US 3.4
- **Input**: `module_id`, `title` (3–200 chars), `description` (Markdown, max 50KB), optional `external_id` (Jira issue key), optional `external_url`.
- **Processing**: Insert/update `user_stories` row. If `external_id` set, normalize and dedupe within Project.
- **Output**: 201/200 `{ user_story }`.
- **Validations**: module belongs to caller's workspace; `external_id` matches `[A-Z]+-\d+` when present.

### {{PROJECT_KEY}}-008 — Acceptance Criterion CRUD
- **Relacionado a**: US 3.2
- **Input**: `user_story_id`, `title` (3–200 chars), `description` (Markdown), `position` (integer, sort order).
- **Processing**: Insert/update `acceptance_criteria` row; rebalance `position` integers.
- **Output**: 201/200 `{ acceptance_criterion }`.
- **Validations**: at least 1 AC required for a US to be marked `ready_to_test`.

### {{PROJECT_KEY}}-009 — Jira import (one-way pull)
- **Relacionado a**: US 3.3
- **Input**: `project_id`, `jira_jql` (string), credentials retrieved from Workspace integration config.
- **Processing**: Async job: call Jira REST `search` with JQL; parse each issue: title → US.title, description → US.description (Markdown converted from Atlassian Document Format), extract AC bullets via heuristic ("Acceptance criteria" / "AC:" / numbered list under heading). Map Jira component → Bunkai Module if name match; otherwise place in "Inbox" module. Idempotent on `external_id`.
- **Output**: Async — returns `import_job_id`; poll `/imports/{id}` for `{ status, imported_count, errors[] }`.
- **Validations**: Jira credentials valid; JQL parses; max 500 issues per job (chunk if larger).

---

## EPIC-BK-004 — ATC Library

### {{PROJECT_KEY}}-010 — ATC creation
- **Relacionado a**: US 4.1, US 4.2
- **Input**:
  - `title` (3–200 chars), `module_id`, `user_story_id` (required), `acceptance_criterion_ids[]` (≥1 required), `layer` (`UI|API|Unit`), `steps[]` (ordered list, ≥1 entry; each `{ position, content (Markdown, max 2KB), input_data (JSON, optional), expected (string, optional) }`), `assertions[]` (≥0; each `{ position, content }`), `tags[]` (≤10).
- **Processing**: Insert `atcs` row; insert `atc_steps` and `atc_assertions` in transaction. Compute `slug` = `{module-slug}/{atc-id-padded}`. Emit `atc.created`.
- **Output**: 201 `{ atc, steps, assertions }`.
- **Validations**: `acceptance_criterion_ids[]` all belong to `user_story_id`; `module_id` matches the US's module or a descendant module of the same Project; layer in enum; step `position` strictly increasing from 1.

### {{PROJECT_KEY}}-011 — ATC search & autocomplete
- **Relacionado a**: US 4.3
- **Input**: `query` (string), optional `module_id`, optional `layer`, optional `limit` (default 20, max 50).
- **Processing**: Postgres full-text search on `title` + `tags` (using `tsvector` indexed column); rank by `ts_rank` + recency (`updated_at` decay). Filter by module subtree if `module_id` set.
- **Output**: 200 `{ items: [{ atc_id, slug, title, module_path, layer, status_dot }] }`.
- **Validations**: query at least 1 char; result respects workspace scope.

> Semantic search via pgvector + embeddings ships Phase 2 (separate FR).

### {{PROJECT_KEY}}-012 — ATC edit propagation
- **Relacionado a**: US 4.4
- **Input**: `atc_id`, partial fields (title, steps, assertions, tags, layer, module, US, AC ids).
- **Processing**: Update `atcs` + cascade replace of `atc_steps` and `atc_assertions` in transaction. Increment `version` (integer). Tests that chain this ATC do NOT copy step content — they reference the ATC, so propagation is automatic. Emit `atc.updated` with `affected_test_ids`.
- **Output**: 200 `{ atc, version, affected_test_count }`.
- **Validations**: caller role ≥ member; new layer / module changes obey {{PROJECT_KEY}}-010 rules.

### {{PROJECT_KEY}}-013 — ATC usage report
- **Relacionado a**: US 4.5
- **Input**: `atc_id`.
- **Processing**: Query `test_steps` (the join table linking Tests to ATCs) for rows referencing this ATC; return list of Tests with position.
- **Output**: 200 `{ used_in: [{ test_id, slug, title, position_in_test }] }`.

### {{PROJECT_KEY}}-014 — ATC duplicate
- **Relacionado a**: US 4.6
- **Input**: `source_atc_id`, optional `new_title`.
- **Processing**: Insert new ATC row copying all fields (title becomes `{source_title} (copy)` unless `new_title` provided); copy steps + assertions; emit `atc.created`.
- **Output**: 201 `{ atc_id }`.

---

## EPIC-BK-005 — Tests as ATC Chains

### {{PROJECT_KEY}}-015 — Test creation
- **Relacionado a**: US 5.1
- **Input**: `project_id`, `title` (3–200 chars), `module_id` (optional — for top-level grouping), `atc_chain[]` (ordered array of `atc_id`s, ≥1), optional `tags[]` (`smoke|sanity|regression|custom`), optional `description`.
- **Processing**: Insert `tests` row; insert `test_steps` rows linking each `atc_id` with its `position`. Validate every ATC belongs to the same Project. Emit `test.created`.
- **Output**: 201 `{ test_id, atc_count }`.
- **Validations**: every `atc_id` exists + in same Project; no duplicate positions.

### {{PROJECT_KEY}}-016 — Reorder Test chain
- **Relacionado a**: US 5.2
- **Input**: `test_id`, `atc_chain[]` (new ordering — same ATC ids, possibly with insertions/removals).
- **Processing**: Diff old vs new chain; insert/delete/update `test_steps` rows; rebalance `position` integers.
- **Output**: 200 `{ test_id, atc_count }`.
- **Validations**: every `atc_id` exists; chain non-empty.

### {{PROJECT_KEY}}-017 — Test rendered (expanded) view
- **Relacionado a**: US 5.3
- **Input**: `test_id`, query `?expand=atcs.steps,atcs.assertions`.
- **Processing**: Single query joining `tests`, `test_steps`, `atcs`, `atc_steps`, `atc_assertions`. Return ordered structure.
- **Output**: 200 `{ test, atcs: [{ atc, steps[], assertions[] }] }`.

### {{PROJECT_KEY}}-018 — Test tagging
- **Relacionado a**: US 5.4
- **Input**: `test_id`, `tags[]`.
- **Processing**: Replace tags. Reserved values (`smoke|sanity|regression`) are recognized for filter semantics.
- **Output**: 200 `{ test }`.

---

## EPIC-BK-006 — Manual Execution + Runs

### {{PROJECT_KEY}}-019 — Start Run
- **Relacionado a**: US 6.1
- **Input**: `test_id`, `environment` (string from configured environments), `executor` (`{ type: "human" | "agent" | "ci", identity: string }`), optional `idempotency_key` (max 64 chars).
- **Processing**: Insert `runs` row with `status = "running"`, `started_at = now()`. For each ATC in the test's chain, insert a `run_atcs` row (status `pending`). For each ATC step, insert a `run_steps` row (status `pending`). If `idempotency_key` already exists for this `test_id` within 24h, return the existing `run_id`.
- **Output**: 201 `{ run_id }`.
- **Validations**: env exists in Project's environment list; test has ≥1 ATC; caller member of project.

### {{PROJECT_KEY}}-020 — Report step result
- **Relacionado a**: US 6.2
- **Input**: `run_id`, `run_step_id`, `{ status: "pass" | "fail" | "block", duration_ms (optional), notes (Markdown, optional), evidence_url (URL, optional), error_message (string, optional) }`.
- **Processing**: Update `run_steps` row. Recompute parent `run_atcs.status` (pass if all steps pass; fail if any step fails; block if any step blocked and none failed; running otherwise). Recompute parent `runs.progress_pct`. Emit Supabase Realtime row-change for UI subscribers.
- **Output**: 200 `{ run_step, derived: { run_atc_status, run_progress_pct } }`.
- **Validations**: run_step belongs to run_id; status in enum; run not in terminal status.

### {{PROJECT_KEY}}-021 — Abort Run
- **Relacionado a**: US 6.3
- **Input**: `run_id`, `reason` (string ≥3 chars).
- **Processing**: Update `runs.status = "aborted"`, `finished_at = now()`, `abort_reason = reason`. Mark remaining `run_steps` as `skipped`.
- **Output**: 200 `{ run }`.

### {{PROJECT_KEY}}-022 — Run history per Test
- **Relacionado a**: US 6.4
- **Input**: `test_id`, query: `?limit=50&before={cursor}&status={pass|fail|aborted}`.
- **Processing**: SELECT from `runs` indexed by `test_id, started_at DESC`. Cursor pagination.
- **Output**: 200 `{ runs[], next_cursor }`.

### {{PROJECT_KEY}}-023 — Project-wide Run filter
- **Relacionado a**: US 6.5
- **Input**: `project_id`, query: `?date_from=&date_to=&module_id=&status=&executor_type=`.
- **Processing**: SELECT from `runs` JOIN `tests` JOIN `modules`. Indexed by `(project_id, started_at, status)`.
- **Output**: 200 `{ runs[], aggregates: { pass_count, fail_count, ... } }`.

### {{PROJECT_KEY}}-024 — Finish Run
- **Relacionado a**: API contract for agentic + automated modes
- **Input**: `run_id`, `{ status: "passed" | "failed" | "aborted", finished_at }`.
- **Processing**: Update `runs.status` + `finished_at`. Validate no pending steps remain (or set them to `skipped` automatically).
- **Output**: 200 `{ run }`.

---

## EPIC-BK-007 — Bugs

### {{PROJECT_KEY}}-025 — File Bug
- **Relacionado a**: US 7.1
- **Input**: `{ title (5–200 chars), module_id, severity ("P1"|"P2"|"P3"|"P4"), description (Markdown, max 50KB), steps_to_reproduce (Markdown), atc_id (optional), run_id (optional), evidence_urls[] (optional, max 10) }`.
- **Processing**: Insert `bugs` row with `status = "open"`. If `run_id` present, link to that Run + auto-link `atc_id` from the failing run_atc. Update Module's `defect_count` materialized view.
- **Output**: 201 `{ bug_id, jira_sync_status }`.
- **Validations**: module belongs to Project; severity in enum; if `atc_id` set it must belong to same Project.

### {{PROJECT_KEY}}-026 — Bugs filtered by Module
- **Relacionado a**: US 7.2
- **Input**: `module_id`, query `?status=&severity=&from=&to=`.
- **Processing**: SELECT from `bugs` JOIN `modules` filtered by module subtree.
- **Output**: 200 `{ bugs[], aggregates: { by_severity, by_status } }`.

### {{PROJECT_KEY}}-027 — Defect heatmap
- **Relacionado a**: US 7.3
- **Input**: `project_id`, query `?window=30d`.
- **Processing**: Materialized view `module_defect_stats` joined to `modules`. Returns count + trend (week-over-week %).
- **Output**: 200 `{ modules: [{ module_id, path, defect_count, trend_pct }] }`.

### {{PROJECT_KEY}}-028 — Jira Bug sync
- **Relacionado a**: US 7.4
- **Input**: `bug_id` (called automatically on bug create when integration enabled).
- **Processing**: Async job: create Jira issue via REST API with mapped fields (title → summary, description+steps → ADF, severity → priority); store returned issue key in `bugs.external_id`; backlink Jira issue body with Bunkai URL.
- **Output**: 200 `{ bug, external_id, external_url }`; failures set `jira_sync_status = "failed"` and retry with exponential backoff.

---

## EPIC-BK-008 — Views & Search

### {{PROJECT_KEY}}-029 — Tree view query
- **Relacionado a**: US 8.1
- **Input**: `project_id`, optional `expanded_module_ids[]`.
- **Processing**: Single recursive CTE: traverse `modules` tree; aggregate child counts per type (US, ATC, Test); compute `status_dot` based on most-recent run of any test under the subtree.
- **Output**: 200 `{ tree: [{ type, id, name, path, status_dot, children: [...] }] }`.

### {{PROJECT_KEY}}-030 — Table view query
- **Relacionado a**: US 8.2
- **Input**: `entity` (`atc|test|run|bug`), filters per type, `sort`, `page`, `limit`.
- **Processing**: Generic listing endpoint per entity with column filters + bulk-edit endpoint `PATCH /api/v1/{entity}/bulk` accepting `{ ids[], patch }`.
- **Output**: 200 `{ items[], total, page_info }`.

### {{PROJECT_KEY}}-031 — Command palette search
- **Relacionado a**: US 8.3
- **Input**: `query` (string), optional `scope` (`global|project`).
- **Processing**: Multi-source search across Modules, US, AC, ATCs, Tests, Runs, Bugs using union of `tsvector` indexes; rank by entity-type weight + recency.
- **Output**: 200 `{ groups: [{ entity_type, items[] }], actions: [{ id, label, hotkey, route }] }`.

### {{PROJECT_KEY}}-032 — Persist view state
- **Relacionado a**: US 8.4
- **Input**: `view_state` (JSON: active filters, sort, expanded nodes, columns).
- **Processing**: Upsert `user_view_state` per (user_id, project_id, view_kind).
- **Output**: 200 `{ ok }`.

---

## EPIC-BK-009 — API + CLI Foundation

### {{PROJECT_KEY}}-033 — OpenAPI spec served
- **Relacionado a**: US 9.1
- **Processing**: Next.js route `GET /api/openapi.json` returns the up-to-date OpenAPI 3.1 spec (source-of-truth at `api/openapi.yaml`, see `.context/SRS/api-contracts.yaml`). Spec includes `securitySchemes`, `servers`, all endpoints from {{PROJECT_KEY}}-001 to {{PROJECT_KEY}}-032.
- **Output**: 200 application/json.

### {{PROJECT_KEY}}-034 — Bearer-token auth
- **Relacionado a**: US 9.2
- **Input**: `Authorization: Bearer <token>` header on protected endpoints.
- **Processing**: Token issuance via `POST /api/v1/auth/tokens` for an authenticated session: generates a 32-byte random token (prefix `bk_pat_`), stores SHA-256 hash + scopes (`read|write`, optional `workspace_id` constraint), returns plain token once. Verification middleware looks up hash, checks expiry, attaches workspace context.
- **Output**: 201 `{ token, prefix, scopes, expires_at }` on issuance; 401 with `code` on bad/expired/revoked token.
- **Validations**: token revocation (`DELETE /api/v1/auth/tokens/{id}`) immediately invalidates.

### {{PROJECT_KEY}}-035 — CRUD endpoints exposed
- **Relacionado a**: US 9.3
- **Processing**: All FRs 001–032 exposed under `/api/v1/...` per `.context/SRS/api-contracts.yaml`. Versioned (`v1`). Response envelope `{ success, data, error }`.

### {{PROJECT_KEY}}-036 — CLI binary
- **Relacionado a**: US 9.4
- **Surface**: `bunkai` CLI distributed as a Bun-compiled single binary + as `npx bunkai`. Initial commands:
  - `bunkai auth login` — interactive device-code flow that creates a Personal Access Token via {{PROJECT_KEY}}-034.
  - `bunkai atc list [--module <id>] [--query <text>]` — calls {{PROJECT_KEY}}-011.
  - `bunkai run start --test <id> --env <name>` — calls {{PROJECT_KEY}}-019.
  - `bunkai run import --file <json> --test <id>` — Phase 2 placeholder (returns "not implemented" with link).
- **Validations**: writes config to `~/.bunkai/config.json` (token, default workspace).

---

## Cross-cutting Functional Requirements

### {{PROJECT_KEY}}-037 — Idempotency
- **Applies to**: every POST endpoint that creates non-trivial state ({{PROJECT_KEY}}-002, {{PROJECT_KEY}}-005, {{PROJECT_KEY}}-007, {{PROJECT_KEY}}-010, {{PROJECT_KEY}}-015, {{PROJECT_KEY}}-019, {{PROJECT_KEY}}-025).
- **Input**: optional header `Idempotency-Key` (max 64 chars).
- **Processing**: Lookup `(endpoint, idempotency_key)` in a 24h LRU table; on hit, return stored response.

### {{PROJECT_KEY}}-038 — Audit-light logging
- **Applies to**: all state-changing endpoints.
- **Processing**: Insert `activity_log` row `{ actor_id, action, entity_type, entity_id, payload_summary, at }` for use in the Workspace activity timeline. NOT compliance-grade — Enterprise audit log is Phase 3.

### {{PROJECT_KEY}}-039 — Soft-delete
- **Applies to**: Modules, US, AC, ATC, Tests.
- **Processing**: `DELETE` endpoints set `archived_at = now()`. Listing endpoints filter `archived_at IS NULL` by default; `?include_archived=true` opts-in. Hard-delete only via admin endpoint with confirmation header.

### {{PROJECT_KEY}}-040 — Realtime row subscriptions
- **Applies to**: `runs`, `run_atcs`, `run_steps`, `bugs`.
- **Processing**: Supabase Realtime channels keyed by `project_id`. Frontend subscribes via the Supabase JS client.

---

**Traceability**: each FR above is testable. The acceptance test for {{PROJECT_KEY}}-N is at minimum "the corresponding User Story's happy path passes manually". Full ATCs that cover these FRs are produced by `/product-management` (post-foundation).
