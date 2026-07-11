# BK-21 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-21)

# Acceptance Test Results - BK-21

## Verdict

PASS WITH FOLLOW-UP.

## Summary

BK-21 passed its direct acceptance criteria in staging. ATC edits propagate to linked Tests, the API reports the affected Test count, and the UI displays count-aware save confirmation.

## Passed Evidence

| Area | Result | Evidence |
| --- | --- | --- |
| API ATC propagation | PASS | PATCH /api/v1/atcs/{id} returned version = 2 and affected*test*count = 3. |
| Live Test propagation | PASS | Reading a linked Test after the ATC edit showed updated ATC step content. |
| DB reference integrity | PASS | DB confirmed three distinct test_steps rows still reference the same ATC. |
| Activity event | PASS | atc.updated event payload included the affected Test ids. |
| Optimistic concurrency | PASS | Stale X-If-Match returned 409 version_conflict; malformed X-If-Match returned 400. |
| UI affected-count confirmation | PASS | Saving a linked ATC displayed count-aware confirmation: ATC saved - 1 Test updated. |

## Follow-up

BK21-T15 historical Run snapshot validation remains a separate follow-up for the Runs flow. It was blocked by POST /api/v1/runs returning 422: No active workspace could be resolved for this request.

This does not block BK-21 sign-off because the direct BK-21 acceptance criteria cover ATC propagation, versioning, and affected-count confirmation, all verified in staging.

---
_Synced from Jira by sync-jira-issues_
