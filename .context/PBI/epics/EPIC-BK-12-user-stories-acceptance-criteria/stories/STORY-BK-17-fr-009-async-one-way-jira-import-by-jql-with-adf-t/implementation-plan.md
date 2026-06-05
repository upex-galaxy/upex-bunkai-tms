# BK-17 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

## Spec Implementation Plan (Dev) — BK-17

Async one-way Jira import by JQL. Confirmed MVP scope: Next.js route worker (Vercel `after()`, no Edge Function / pg_cron / Vault), single-tenant env credentials, an import dialog with status polling, and the 6 ACs with pragmatic PO defaults (crash = idempotent re-run, concurrent imports serialized per project, descriptions over 50 KB truncated with a marker, custom fields deferred).

### Architecture (grounded on a live Jira probe)

- Jira Cloud v3 enhanced search: `POST /rest/api/3/search/jql`, Basic auth (email + API token), body `{ jql, maxResults<=100, nextPageToken, fields }`, response `{ issues, nextPageToken, isLast }`. Description arrives as ADF (`type: doc`). Verified against the project's own Jira.
- The worker runs in `after()` (Next 15) after the 202 response, using the service-role admin client to bypass RLS (authorization is enforced at enqueue). Processes all pages to completion in one invocation; a stuck `running` job is recovered by an idempotent re-run.

### AC -> implementation map

- AC1 Start job, poll to completed: `POST /api/v1/imports` returns 202 `{ import*job*id, status: queued }`; the worker fills counts; `GET /api/v1/imports/{id}` polls to `completed`.
- AC2 Idempotent re-run: upsert `user*stories` on `(project*id, upper(external*id))`; existing rows update (created*count 0, updated_count N), no duplicate rows.
- AC3 Component routes to Module: case-insensitive match of a Jira component name to an active Module name in the project.
- AC4 No match -> Inbox: auto-create a root Module named `Inbox` on first need; routing there is not an error.
- AC5 Over 500 chunked: page the search by `nextPageToken` (100/page) until `isLast`; imported_count accumulates across pages.
- AC6 Invalid credentials -> failed: a 401/403 from Jira marks the job `failed` with `errors[]` entry `{ code: jira_unauthorized }`.

### Slice 1 — Migration + env

- Migration `0019*import*jobs.sql`: table `import*jobs` (id, workspace*id, project*id, jql, status check queued|running|completed|failed, next*page*token, imported/created/updated/skipped*count, errors jsonb default [], started*at, completed*at, created*at). Poll index `(workspace*id, status, created*at desc)` + active-job partial index `(project*id) where status in (queued, running)`. RLS: SELECT for workspace members, INSERT for member+ (`bunkai*can*write_workspace`); UPDATE/DELETE only via service-role (no user policy).
- `lib/env.ts`: add server-only `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API*TOKEN` (already in .env / .env.example).
- `bun run types:gen` + patch `lib/types.ts` (ImportJob entity + status enum).

### Slice 2 — ADF -> Markdown (pure, unit-tested)

- `lib/jira/adf-to-markdown.ts`: recursive walker over ADF nodes — doc, paragraph, heading(1-6), bulletList/orderedList/listItem, codeBlock(language), blockquote, rule, hardBreak; inline text marks strong/em/code/strike/link. Unknown nodes flatten to their text content. Null description -> ''.

### Slice 3 — Acceptance-criteria heuristic (pure, unit-tested)

- `lib/jira/extract-acceptance-criteria.ts`: scan the converted Markdown for the first heading/line matching `/^(#{0,6}\s**)?(acceptance criteria|ac:|criteria)\s**:?\s**$/i`; from that anchor capture consecutive bullet (`-`/`**`) or numbered (`1.`) items until the next heading; each item (marker stripped, trimmed) is one criterion title. Returns `string[]` (empty when no section).

### Slice 4 — Jira REST client

- `lib/jira/client.ts`: `searchIssues({ jql, pageToken, maxResults })` -> `{ issues, nextPageToken, isLast }`. Basic auth from env. Fields `[summary, description, components, issuetype]`. 429 -> exponential backoff (1,2,4,8,16 s, max 5 retries). 401/403 -> `JiraAuthError`. Types `JiraIssue { key, fields }`.

### Slice 5 — Import runner (worker core)

- `lib/jira/import-runner.ts`: `runImportJob(jobId)` via the admin client. Claim (status running, started*at), then loop pages: per issue — ADF->MD (truncate over 50 KB with a marker), extract ACs, resolve Module (component match or auto-created Inbox, cached per run), upsert US on `(project*id, upper(key))` keyed external*id (created vs updated), reconcile ACs by `lower(title)` (insert missing, positions appended). Per-issue throw -> `errors[]` `{ jira*key, code, message }` + skipped*count, job continues. JiraAuthError -> status failed + `{ code: jira*unauthorized }`. On `isLast` -> status completed, completed_at. Counts updated incrementally.

### Slice 6 — API routes

- `POST /api/v1/imports`: body `{ project*id, jql }`. Resolve workspace from project, require member+ (RLS insert). Serialize: 409 `import*in*progress` if an active job exists for the project. Insert queued job; `after(() => runImportJob(id))`; return 202 `{ import*job_id, status }`.
- `GET /api/v1/imports/{id}`: return the job row (member read; outsider 404).

### Slice 7 — UI

- `import-from-jira-dialog.tsx`: JQL textarea + submit -> POST; then poll `GET` every ~2 s, render status (queued/running/completed/failed) + counts + errors; `router.refresh()` on completion. Wired from the project explorer (Topbar action). Design-system modal, no window.prompt.

### Slice 8 — OpenAPI + verify

- Register `/api/v1/imports` + `/{id}` in OpenAPI; regen `public/openapi.json`.
- Unit tests: ADF->MD per node type; AC heuristic (heading/bullet/numbered/none); component match (hit + miss->Inbox); chunk accumulation; truncation.
- `bun run lint:check` + `types:check` + `bun test` + `build` green. Live smoke: import a small BK JQL into a dev project, re-run for idempotency.

### Out of scope (deferred)

Two-way sync, webhooks, OAuth 3LO, Epics/Sub-tasks, attachments/comments, custom-field mapping UI, per-workspace Vault credentials, Edge Function + pg_cron durable worker, chunk-resume crash recovery.

## Review Workload Forecast

Estimated: ~1650 additions + ~30 deletions = ~1680 total lines
400-line budget risk: High
Chain strategy: size-exception (single cohesive integration story; solo-owner admin merge; matches BK-10 ~1435 precedent)
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
