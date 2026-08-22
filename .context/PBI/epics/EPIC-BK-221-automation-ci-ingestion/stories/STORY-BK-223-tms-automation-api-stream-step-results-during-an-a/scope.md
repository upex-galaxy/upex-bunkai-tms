# BK-223 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-223)

- Start an in-progress run against an existing Test through the API, report per-step results (pass / fail / block) incrementally, and finish the run with a verdict (passed / failed)
- Near-real-time visibility: the run detail view updates as step results arrive, without a manual reload
- Idempotent step reporting — retrying a step report never doubles state
- Abort path for interrupted streamed runs, preserving the partial step results already reported
- The streaming contract documented in the public API reference (OpenAPI spec)

---
_Synced from Jira by sync-jira-issues_
