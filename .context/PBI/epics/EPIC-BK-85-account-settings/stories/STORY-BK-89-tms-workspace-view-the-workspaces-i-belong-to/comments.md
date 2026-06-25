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

### Carlos Alberto Chiavassa - 6/12/2026, 7:03:31 PM

## QA Session Report — BK-89 (API-only, partial)

***Date******:**** 2026-06-12 | ****Tester******:**** Carlos Chiavassa | ****Environment******:*** staging

---

### Scope

API surface only (Bearer PAT). Story in Shift-Left QA — stays there after this session. UI and role-dependent ACs deferred.

---

### Results: 3 passed, 1 blocked

| TC | Key | Result |
| --- | --- | --- |
| GET /api/v1/workspaces — HTTP 200, shape correct | BK-136 | PASSED |
| GET unauthenticated — 401 | BK-139 | PASSED |
| Active memberships filter — DB cross-validation | BK-140 | PASSED |
| role field absent — BLOCKER 1 confirmed | BK-141 | BLOCKED |

---

### Critical: role field missing from API response

TC04 confirms ***BLOCKER 1***: `GET /api/v1/workspaces` returns `{id, slug, name, owner*user*id, plan, created*at}` — no `role` field. The field exists in the `workspace*members` table (DB) but is not exposed by the endpoint.

***Impact******:*** AC 1 and AC 4 are untestable until Dev adds the role join to the endpoint. All role-label outlines (P-01, P-02, P-05) remain blocked.

***BLOCKER 2*** also confirmed via DB schema: no `active*workspace*id` column exists anywhere in the schema — active workspace concept has no data contract.

---

### Blockers to QA sign-off

1. Dev extends GET /api/v1/workspaces to return `role` per workspace (CRITICAL)
2. PO defines data contract for "active workspace" indicator (MEDIUM)
3. BK-87 Settings Hub ships — UI/navigation path confirmed (LOW)

ATP field updated. ATR field updated with this session's partial results.
4 TCs created (BK-136, BK-139, BK-140, BK-141), all linked to BK-89.

---

### Carlos Alberto Chiavassa - 6/12/2026, 7:07:23 PM

## PO Decisions — BK-89: TMS-Workspace | View the workspaces I belong to

Recorded 2026-06-12.

### Decision 1 — Display layout per workspace entry

Each workspace entry displays:

- ***Title******:*** workspace name
- ***Subtitle******:*** role label (e.g. "Owner", "Admin", "Member", "Viewer")

### Decision 2 — Active workspace indicator

The currently active workspace is visually distinguished by:

- A ***"Activo" badge*** on the workspace entry
- A ***differentiated visual border*** (distinct from inactive entries)

This resolves BLOCKER 2: the "active workspace" concept will be communicated client-side via a dedicated UI treatment. Dev to confirm the data contract (API field, localStorage, or session) needed to drive this indicator.

### Decision 3 — Read-only surface

This story is ***read-only***. The Workspaces section does not include:

- Leave workspace actions
- Workspace switching controls
- Member management controls

Any such actions belong to separate stories.

---


_Synced from Jira by sync-jira-issues_
