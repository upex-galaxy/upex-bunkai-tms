# BK-17 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

The user opens the Project settings, picks "Import from Jira", enters a JQL, and submits. The API enqueues a job row in import*jobs and returns import*job*id with status="queued". A scheduled worker (cron or Supabase Edge Function) picks up queued jobs, fetches credentials from the Workspace integration config, calls Jira REST /search in chunks of 500, parses each issue's ADF description into Markdown, runs the AC heuristic to split out Acceptance Criteria, resolves the target Module (component match or Inbox), and upserts user*stories + acceptance*criteria rows keyed on external*id. Status transitions to running -> completed (or failed), with counts and per-issue errors recorded on the import_jobs row for polling.

---
_Synced from Jira by sync-jira-issues_
