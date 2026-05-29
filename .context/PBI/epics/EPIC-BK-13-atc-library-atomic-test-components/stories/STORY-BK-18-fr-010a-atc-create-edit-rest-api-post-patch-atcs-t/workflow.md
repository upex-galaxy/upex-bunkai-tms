# BK-18 — Workflow

> Jira field: `customfield_10161` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-18)

A member calls POST /atcs with a fully-formed payload. The API layer validates schema (zod/openapi) then performs cross-entity checks against user*stories, acceptance*criteria, and modules tables. Inside a single SQL transaction the service inserts the atcs row, then bulk-inserts atc*steps and atc*assertions referencing the new atc*id, then computes and persists the slug. On commit the event bus emits atc.created with the full payload. PATCH /atcs/{id} follows the same path but starts by loading the current row, applies the partial update, deletes-then-inserts steps and assertions in the same transaction, increments version, and emits atc.updated with the list of test*ids that reference this ATC.

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.123Z_
