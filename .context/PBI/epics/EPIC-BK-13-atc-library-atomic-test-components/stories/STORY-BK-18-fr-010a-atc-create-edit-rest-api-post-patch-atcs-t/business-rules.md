# BK-18 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-18)

- acceptance*criterion*ids[] must all belong to the supplied user*story*id (cross-entity check)
- module_id must equal the user story's module OR be a descendant module within the same project (subtree check)
- layer must be one of {UI, API, Unit} — enum constraint at DB and API level
- steps[] positions must be integers, strictly increasing, starting at 1
- tags[] max length is 10; title length 3..200 chars; step content max 2KB Markdown
- slug is computed once on create and is immutable across edits (renames do not change slug)
- version integer is monotonically increasing per ATC; PATCH increments by 1

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:47.905Z_
