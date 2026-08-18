# BK-222 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-222)

- Single-call submission of a ***completed*** automated execution of an existing Test: per-step results (pass / fail / block), final verdict (passed / failed), total duration, target Project Environment, and evidence references (URLs)
- Idempotency-key support: retrying the same submission returns the original run instead of creating a duplicate
- Submitted runs recorded as first-class Runs (automated executor) — visible in the Test's run history, the project runs view, and the run detail like any manual run
- Validation feedback that names exactly what is wrong with a rejected submission (missing steps, unknown environment, invalid verdict)
- The submission contract documented in the public API reference (OpenAPI spec)

---
_Synced from Jira by sync-jira-issues_
