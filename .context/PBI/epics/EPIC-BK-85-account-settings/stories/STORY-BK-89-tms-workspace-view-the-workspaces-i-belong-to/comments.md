# Comments for BK-89

[View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

---

### Carlos Alberto Chiavassa - 6/10/2026, 5:33:37 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT lives in the ***Acceptance Test Plan (ATP)*** custom field on this Story.

***Session******:*** shift-left-testing/2026-06-10-bk89-workspace-view
***Risk Level******:*** HIGH (auth/RLS/multi-tenancy)
***2 story blockers identified******:***

1. `GET /api/v1/workspaces` does not return `role` — AC 1 is untestable until the endpoint is extended
2. "Active workspace" concept has no data contract (no DB field, no API field, no session spec defined)

***6 open questions for PO/Dev*** — see ATP DRAFT field for full detail.

***15 test outlines******:*** 5 Positive | 4 Negative | 3 Boundary | 3 Integration

When this Story reaches Ready For QA, run `/sprint-testing` — the `shift-left-reviewed` label will short-circuit Phases 1-3.

---


_Synced from Jira by sync-jira-issues_
