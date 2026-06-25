# BK-89 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

# ATP ACTIVE — BK-89: TMS-Workspace | View the workspaces I belong to

***Status******:*** ACTIVE (API-only partial phase — 2026-06-12)
***Shift-Left******:*** Completed 2026-06-10 | Risk Level: HIGH (auth/RLS/multi-tenancy)
***Story quality******:*** Needs Improvement — 2 story blockers, 6 open questions for PO/Dev

---

## Story Blockers (block QA sign-off)

| # | Blocker | Severity | AC affected |
| --- | --- | --- | --- |
| 1 | GET /api/v1/workspaces does not return `role` field | CRITICAL | AC 1, AC 4 |
| 2 | "Active workspace" has no data contract (no DB column, no API field, no session spec) | MEDIUM | AC 1, AC 2 |
| 3 | BK-87 Settings Hub not shipped — UI/navigation path unknown | LOW | All UI outlines |

---

## API-Executable TCs (4 created — partial session)

| TC | Jira key | Outline | Type |
| --- | --- | --- | --- |
| TC01 | BK-136 | GET /api/v1/workspaces returns HTTP 200 with correct workspace list shape | Positive |
| TC02 | BK-139 | GET /api/v1/workspaces unauthenticated returns 401 | Negative |
| TC03 | BK-140 | GET /api/v1/workspaces returns only active memberships — DB cross-validation | Integration |
| TC04 | BK-141 | GET /api/v1/workspaces does not return role field — BLOCKER confirmed | Negative (known gap) |

---

## Blocked / Deferred Outlines

### Blocked on role field (BLOCKER 1)

- P-01: Workspace list shows both workspaces with correct names — 2-workspace user
- P-02: Role label renders correctly for each role value
- P-05: Owner role label displays correctly
- AC 4: Owner role resolves correctly from owner*user*id

### Blocked on active workspace data contract (BLOCKER 2)

- P-03: Active workspace is visually marked — 2-workspace user
- P-04: Single workspace renders cleanly with active indicator

### Blocked on test data (QA bot is only member of its workspace)

- N-01: Suspended membership workspace does not appear in the list
- N-02: Invited membership workspace does not appear in the list
- B-01: Zero active workspaces — empty state
- N-04: Cross-tenant isolation — requires second user in a different workspace

### Blocked on cookie session (partial session constraint)

- I-01: Cookie-session auth path returns correct workspace list

### Blocked on BK-87 (UI dependency)

- B-03: Loading state while API request is in flight
- I-03: Navigation from Settings Hub to Workspaces section

---

## Open Questions for PO / Dev

1. ***[******BLOCKER — AC 1]*** Will GET /api/v1/workspaces be extended to return a `role` field per workspace? Or a separate endpoint?
2. ***[******BLOCKER — AC 1 + AC 2]*** What is the data contract for "active workspace"?
3. ***[******DECISION — AC 2]*** Should role label be displayed for single-workspace view too?
4. ***[******DECISION — AC 3]*** Should invited memberships show as "Pending" or be excluded entirely?
5. ***[******DECISION — Empty state]*** What renders when user has zero active workspace memberships?
6. ***[******DEPENDENCY]*** What is the confirmed route and navigation path for the Workspaces section (post BK-87)?

---
_Synced from Jira by sync-jira-issues_
