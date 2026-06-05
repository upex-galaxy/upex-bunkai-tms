# BK-17 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

- import is one-way (Jira -> Bunkai); Bunkai never writes back to Jira in this story
- external_id is the idempotency key (Project + uppercase Jira key)
- max 500 issues per Jira search request; jobs auto-chunk above that
- a job result includes imported*count, created*count, updated*count, skipped*count, errors[]
- per-issue failures append to errors[] but do not abort the job
- Inbox auto-creation: if no Module named "Inbox" exists under Project P, create one before placing unmatched issues
- the worker honors Jira rate limits (429 -> exponential backoff, max 5 retries)

---
_Synced from Jira by sync-jira-issues_
