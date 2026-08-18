# BK-222 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-222)

Karim finishes executing the "Checkout happy path" Test inside the nightly pipeline. He assembles the per-step outcomes, the duration, and the evidence links, and submits them to Bunkai in one call using his workspace token. The call times out on his side; he retries with the same idempotency key and gets the same run back — nothing doubled. Minutes later Elena opens the Test's run history, sees a new finished run with verdict passed reported by the agent, opens it, and reviews steps and evidence without ever touching the CI logs.

---
_Synced from Jira by sync-jira-issues_
