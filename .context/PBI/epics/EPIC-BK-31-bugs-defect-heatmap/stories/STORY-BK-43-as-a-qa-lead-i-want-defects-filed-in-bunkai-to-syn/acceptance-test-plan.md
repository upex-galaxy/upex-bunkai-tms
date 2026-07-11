# BK-43 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

## Defect Sync — ATP DRAFT (Shift-Left)

### Coverage Estimate

- Positive: 7 outlines
- Negative/Error: 4 outlines
- Boundary: 2 outlines
- Total: 13 outlines

### Outlines

#### TDS01 — New defect auto-syncs

Given a workspace with external tracker integration enabled
When a defect is filed in Bunkai
Then it is sent to the external tracker.

#### TDS02 — Fire-and-forget on network failure

Given the external tracker is unreachable
When a defect is filed
Then the defect is created locally
And sync is retried later.

#### TDS03 — Failed sync auto-retried

Given a sync attempt failed
When the retry mechanism runs
Then it re-attempts the sync.

#### TDS04 — Sync-failed badge + retry button

Given a defect is in sync-failed state
Then it shows a sync-failed badge
And a manual retry option exists.

#### TDS05 — One-way: no reverse sync

Given a defect is synced
When the external item is updated
Then no change flows back to Bunkai.

#### TDS06 — Workspace without integration

Given the workspace has no integration configured
When a defect is filed
Then no sync is attempted.

#### TDS07 — Duplicate prevention

Given a defect has been synced
When the sync is triggered again
Then no duplicate external item is created.

#### TDS08 — Permanent auth failure stops retries

Given credentials are permanently invalid
When sync fails with auth error
Then retries stop after threshold.

#### TDS09 — Bug update propagates

Given a synced defect is edited in Bunkai
When the integration supports updates
Then the change propagates (NEEDS PO CONFIRMATION).

#### TDS10 — Deletion semantics

Given a synced defect is deleted in Bunkai
Then the external item is NOT deleted (NEEDS PO CONFIRMATION).

#### TDS11 — Rate limit backoff

Given the external tracker returns 429
When the next sync fires
Then it waits and retries with backoff.

#### TDS12 — Field mapping accuracy

Given a defect with severity, module, evidence
When synced
Then severity maps to priority, module to component, evidence to attachment.

#### TDS13 — Workspace isolation

Given defects in two different workspaces
When synced to different external tracker projects
Then each defect lands in its correct target.

---
_Synced from Jira by sync-jira-issues_
