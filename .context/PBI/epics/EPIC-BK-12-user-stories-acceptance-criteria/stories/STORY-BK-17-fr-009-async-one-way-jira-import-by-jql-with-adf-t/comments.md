# Comments for BK-17

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-17)

---

### Ely - 5/19/2026, 9:54:42 PM

# 🧱 Architect Annotation

## Technical Notes
- **DB**: new table `import_jobs` (id uuid pk, project_id uuid fk, workspace_id uuid fk, jql text, status text check in queued|running|completed|failed, imported_count int default 0, created_count int default 0, updated_count int default 0, skipped_count int default 0, errors jsonb default '[]', started_at, completed_at, created_at). Index on `(workspace_id, status, created_at desc)` for status polling.
- **API surface**: `POST /api/imports` returns 202 `{ import_job_id, status: 'queued' }`. `GET /api/imports/:id` returns full job row. Both gated by Workspace membership.
- **Worker**: Supabase Edge Function `process-import-jobs` invoked by cron every 30 s; claims one job at a time via `UPDATE ... WHERE status='queued' RETURNING *` with `FOR UPDATE SKIP LOCKED` semantics emulated through a status transition. On claim, status flips to `running`, `started_at` set.
- **Jira REST**: hits `POST /rest/api/3/search/jql` (v3 endpoint with `nextPageToken`); falls back to `GET /search` with `startAt` for older sites. Chunk size 500 (Jira's hard ceiling is 100 per page on cloud — adjust per page, accumulate up to 500 per chunk for our internal batching). Backoff schedule on 429: 1s, 2s, 4s, 8s, 16s — max 5 retries before flagging the job failed.
- **ADF -> Markdown converter**: in-house, recursive walker over ADF node types — `heading -> #...####`, `paragraph -> text`, `bulletList -> -`, `orderedList -> 1.`, `codeBlock -> fenced with language attr`, `inlineCode`, `link`, `hardBreak`, `rule -> ---`. Unknown nodes flatten to text content.
- **AC heuristic**: scan the converted Markdown for the first heading or paragraph matching `/^(?:acceptance criteria|ac:|criteria)\s*:?\s*$/i`. From that anchor, capture consecutive bullet items (or numbered list items) until the next heading. Each bullet becomes one AC row with position assigned in order.
- **Component mapping**: lower-case match on `module.name`. If no match, ensure a Module named "Inbox" exists under the Project (create on first need) and route the story there.
- **Idempotency**: upsert keyed on `(project_id, upper(external_id))` against `user_stories`. Existing rows update title/description; ACs for re-imports are reconciled by `(user_story_id, lower(title))` to avoid duplicates while still allowing AC text edits.
- **Credentials**: stored in `workspace_integrations` (`type='jira'`, `config jsonb { site_url, email, api_token_encrypted }`). Token encrypted via Supabase Vault. Worker reads via service-role key.
- **Per-issue errors**: any issue that throws during conversion or persist is appended to `errors[]` as `{ jira_key, code, message }` — the job continues. Job fails (`status='failed'`) only on authentication/JQL-parse/total-network errors.

## Dependencies
- Upstream: **BK-14** "User Story CRUD" (write target). **BK-15** "AC CRUD" (write target). **BK-7** "Module hierarchy" (component routing requires modules table).
- Downstream: future "Jira webhook live sync" (Phase 2), future "Two-way sync" (Phase 2+).
- External: Jira Cloud REST API v3, Supabase Edge Functions runtime, Supabase Vault for token storage.

## Definition of Done (expanded)
- [ ] Migrations applied: `import_jobs`, `workspace_integrations` (or extension of existing), Inbox Module auto-create logic
- [ ] OpenAPI updated; `bun run api:sync` clean
- [ ] Unit tests: ADF -> Markdown converter covers each node type; AC heuristic covers heading + bullet + numbered list variants; component-to-module match (hit + miss -> Inbox)
- [ ] Integration tests: idempotent re-import (created 12 + updated 12 + zero dup rows); chunking over 500 issues; 429 backoff schedule; invalid creds -> failed job
- [ ] Worker handles partial failure (1 bad issue -> errors[] entry, others succeed, job completes)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: import a small JQL into a dev Project, confirm Stories + ACs appear, re-run and confirm zero dup
- [ ] PR description cross-references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.3
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-009
- Business map: `.context/business/business-data-map.md` § import_jobs + workspace_integrations entities
- API contract: `.context/SRS/api-contracts.yaml` § `/api/imports`
- Jira REST v3 search: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:05.925Z_
