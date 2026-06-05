# BK-17 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

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
_Synced from Jira by sync-jira-issues_
