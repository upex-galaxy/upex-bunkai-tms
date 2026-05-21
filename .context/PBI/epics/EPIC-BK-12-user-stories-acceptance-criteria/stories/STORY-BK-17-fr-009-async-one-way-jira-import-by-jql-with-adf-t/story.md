# Async one-way Jira import by JQL (ADF → Markdown, idempotency on external_id)

**Jira Key:** [BK-17](https://upexgalaxy67.atlassian.net/browse/BK-17)
**Epic:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) (User Stories & Acceptance Criteria)
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

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

## Acceptance Criteria

```gherkin
Feature: Async one-way Jira import by JQL

  Scenario: Start an import job with a valid JQL
    Given the Workspace has valid Jira credentials configured
    And the JQL "project = ACME AND issuetype = Story" returns 12 issues
    When the user POSTs /api/imports with project*id=P and jira*jql
    Then the API responds 202 with { import*job*id, status: "queued" }
    And polling /api/imports/{id} eventually returns { status: "completed", imported_count: 12, errors: [] }

  Scenario: Re-running the same import is idempotent
    Given an import previously created User Stories with external_id ACME-1..ACME-12
    When the user starts a new import with the same JQL
    Then the second job completes with imported*count=12, created*count=0, updated_count=12
    And no duplicate user*stories rows exist for external*id ACME-1..ACME-12

  Scenario: Issues whose Jira component matches a Module name route to that Module
    Given Bunkai has Modules named "Auth", "Billing" under Project P
    And Jira issue ACME-5 has component "Auth"
    When the import processes ACME-5
    Then the created User Story has module_id pointing to the "Auth" Module

  Scenario: Issues with no matching component fall into the Inbox Module
    Given Jira issue ACME-9 has no component or a component name not present as Module in P
    When the import processes ACME-9
    Then the User Story is created under a Module named "Inbox" (auto-created under P if missing)
    And errors[] contains no entry for ACME-9 (Inbox routing is not an error)

  Scenario: JQL above the 500-issue ceiling is chunked
    Given a JQL that returns 1200 Jira issues
    When the import job runs
    Then the job processes the issues in chunks of at most 500
    And the final imported_count equals 1200
    And status is "completed"

  Scenario: Invalid Jira credentials fail the job
    Given the Workspace Jira credentials are revoked
    When a user starts an import
    Then the job transitions to status="failed" with errors[] containing { code: "jira_unauthorized" }
```

---

## Business Rules

- import is one-way (Jira -> Bunkai); Bunkai never writes back to Jira in this story

- external_id is the idempotency key (Project + uppercase Jira key)

- max 500 issues per Jira search request; jobs auto-chunk above that

- a job result includes imported*count, created*count, updated*count, skipped*count, errors[]

- per-issue failures append to errors[] but do not abort the job

- Inbox auto-creation: if no Module named "Inbox" exists under Project P, create one before placing unmatched issues

- the worker honors Jira rate limits (429 -> exponential backoff, max 5 retries)

---

## Scope

- POST /api/imports - enqueue a Jira import job, return import*job*id
- GET /api/imports/:id - poll job status (queued | running | completed | failed)
- Background worker: a Supabase Edge Function triggered by pg*cron reads queued rows from the import*jobs table and calls the Jira REST search endpoint
- ADF -> Markdown converter (in-house) covering headings, lists, code blocks, links, paragraphs
- AC heuristic parser: detect "Acceptance Criteria" / "AC:" heading or labeled section, split bullets
- Component-to-Module name match (case-insensitive); auto-create "Inbox" if no match
- Idempotent upsert on user*stories.external*id (per Project)
- Chunking at 500 issues per Jira search call (uses nextPageToken / startAt)
- Per-issue error capture into errors[] without aborting the whole job

---

## Workflow

The user opens the Project settings, picks "Import from Jira", enters a JQL, and submits. The API enqueues a job row in import*jobs and returns import*job*id with status="queued". A scheduled worker (cron or Supabase Edge Function) picks up queued jobs, fetches credentials from the Workspace integration config, calls Jira REST /search in chunks of 500, parses each issue's ADF description into Markdown, runs the AC heuristic to split out Acceptance Criteria, resolves the target Module (component match or Inbox), and upserts user*stories + acceptance*criteria rows keyed on external*id. Status transitions to running -> completed (or failed), with counts and per-issue errors recorded on the import_jobs row for polling.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** integration, jira-import, mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.136Z_
