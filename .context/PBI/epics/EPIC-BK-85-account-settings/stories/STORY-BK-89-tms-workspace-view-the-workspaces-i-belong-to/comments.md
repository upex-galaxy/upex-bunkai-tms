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

### Ely - 6/24/2026, 3:47:31 PM

## Promoted to Ready For Dev — open Dev contract to resolve before coding

This story is moving to ***Ready For Dev****. Two Dev-contract items from the shift-left QA session remain ****open*** and must be resolved before coding starts. Recording them here, not deciding them:

1. `GET /api/v1/workspaces` does not return `role` — AC 1 is untestable until the endpoint is extended (AC1/AC4 untestable without it).
2. "Active workspace" concept has no data contract (no DB field, no API field, no session spec defined) — API field vs localStorage vs session still undecided.

---

### Ely - 7/30/2026, 1:28:56 PM

Mockup — Settings — Workspaces (list + roles + active). Source: .context/designs/bunkai-test-management-tool/bk-85-account-settings/settings-workspaces.html · spec: master-design-plan §4.10



---

### Ely - 7/31/2026, 3:32:08 AM

## Dev contract resolved — role field + active-workspace transport

***Decision*** (delegated to AI advisor by the product owner, 2026-07-31, explicit):

***Active-workspace transport***: reuse the EXISTING mechanism, don't introduce a new one. BK-87 (shipped 2026-07-30) already built and shipped this exact thing: the `bk*active*ws` cookie + `resolveActiveWorkspaceId` (`lib/workspaces/active.ts`, `lib/api/workspace-cookie.ts`), already driving `(app)/layout.tsx` and the workspace switcher. This isn't actually an open architectural question anymore — it's precedent already in the codebase. BK-89 reuses it as-is.

`role` on `GET /api/v1/workspaces`: checked the current handler (`app/api/v1/workspaces/route.ts`) — it selects only `id, slug, name, owner*user*id, plan, created*at` from `workspaces`, no `workspace*members` join at all today. Widen it: add a second query to `workspace*members` scoped to the caller's own `user*id` (RLS-safe, same shape BK-87's PR2 already used for its workspace list — manual JS-side join, not a PostgREST embedded-select, matching this repo's established convention), merge in `role` (and `joined*at` if useful) per workspace by `workspace*id`.

Neither of these is a novel decision — both just apply precedent BK-87 already established and shipped a day ago. Low risk, mechanical.

`queue.md` (`avalanche-2026-07`) updated — BK-89 is unblocked, proceed with Stage 1 planning.

---


_Synced from Jira by sync-jira-issues_
