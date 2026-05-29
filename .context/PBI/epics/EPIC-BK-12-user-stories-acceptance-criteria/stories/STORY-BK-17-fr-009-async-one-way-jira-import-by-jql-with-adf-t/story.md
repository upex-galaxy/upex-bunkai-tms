# Async one-way Jira import by JQL (ADF → Markdown, idempotency on external_id)

**Jira Key:** [BK-17](https://upexgalaxy67.atlassian.net/browse/BK-17)
**Epic:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) (User Stories & Acceptance Criteria)
**Type:** Story
**Status:** Ready For Dev
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

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** integration, jira-import, mvp, shift-left-2026-05-27, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:48.961Z_
