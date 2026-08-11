# BK-373 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

## Defect Sync — recovery and sync state

Slice c of the BK-43 split (ruling 12170). Carries BK-43 ATP outlines TDS03, TDS04, TDS08 and TDS11, amended where the rulings changed them.

### Coverage estimate

- Positive: 2 outlines
- Negative / Error: 3 outlines
- Boundary: 2 outlines
- Total: 7 outlines

### Outlines

#### TDS03 — Failed sync auto-retried

Given a send attempt that failed for a reason that could still clear
When the recovery runs
Then it attempts the send again with no user action.

#### TDS04 — Sync-failed badge and failure-reason card, no manual retry control

Given a defect in the sync-failed state
Then the External tracker panel shows the fail-tone badge and the failure-reason card
And no manual retry control is present anywhere on the record.

**Amended from the BK-43 draft, which expected a manual retry option. Ruling 12170 decided there is none****:**** the frozen copy promises automatic retries and points the user at Settings for the real fix.**

#### TDS08 — Retries decay to a floor and never stop while the failure is retryable

Given a defect failing repeatedly for a reason that could still clear
Then each attempt is spaced further apart than the last, up to the interval ceiling
And the attempts continue indefinitely at that ceiling
And only a failure classified as unable to clear stops them.

**Amended from the BK-43 draft, which expected retries to stop after a threshold. Ruling 12177 (decision 2) resolved this against the draft and in the frozen mockup's favour****:**** the copy promises retries resume once the connection is fixed, and the business rule says "until they succeed". A counted ceiling would silently break both.**

#### TDS11 — Rate limiting is invisible

Given Jira rate-limits the send
When the next attempt is scheduled
Then the defect does not enter the sync-failed state
And the attempt is simply deferred.

#### TDS15 — Sent state renders the frozen copy

Given a defect that reached Jira
Then the panel shows the pass-tone badge, the Jira issue key as a link, and the last-synced timestamp.

#### TDS16 — Panel absent when the project has no destination

Given a Project whose defect sync is not enabled
When a defect filed in it is opened
Then no External tracker panel is rendered at all.

#### TDS17 — Interrupted attempt adopts rather than duplicates

Given an attempt that created a Jira issue but was interrupted before recording it
When the recovery reclaims that defect
Then it adopts the existing Jira issue
And no second issue is created.

---
_Synced from Jira by sync-jira-issues_
