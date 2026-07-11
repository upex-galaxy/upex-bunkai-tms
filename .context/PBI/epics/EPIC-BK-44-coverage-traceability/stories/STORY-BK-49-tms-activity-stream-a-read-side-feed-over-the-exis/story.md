# TMS-Activity | Stream a read-side feed over the existing activity log

**Jira Key:** [BK-49](https://jira.upexgalaxy.com/browse/BK-49)
**Epic:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44) (Coverage & Traceability)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## User story

As a QA Lead, I want a live feed of what changed across the workspace — who created or edited an item, who ran a test, who filed a defect — so that the team shares quality awareness without narrating it in chat.

---

## QA Refinements (Shift-Left Analysis) - Added 2026-06-29

> Refined Acceptance Criteria live in the Acceptance Criteria field. Full ATP DRAFT lives in the Acceptance Test Plan field.

## Phase 5 - Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Same `created_at` for multiple rows causes unstable ordering | No | High | NEEDS PO/DEV CONFIRMATION - define tie-breaker. |
| 2 | Cross-workspace rows accidentally appear | No | Critical | NEEDS PO/DEV CONFIRMATION - add security AC. |
| 3 | Actor cannot be resolved | No | High | NEEDS PO/DEV CONFIRMATION - define fallback. |
| 4 | Item cannot be resolved, is archived, or is hidden | No | High | NEEDS PO/DEV CONFIRMATION - define fallback/link behavior. |
| 5 | `module.description_updated` payload has no content diff | No | Medium | NEEDS PO/DEV CONFIRMATION - define generic label. |
| 6 | Duplicate ATC appears as `atc.created` | No | Medium | NEEDS PO/DEV CONFIRMATION - decide display label. |
| 7 | Module create does not emit activity | No | Medium | NEEDS PO/DEV CONFIRMATION - keep silent or add writer. |
| 8 | No-op update/reorder/tag/replay has no event | No | Medium | NEEDS PO/DEV CONFIRMATION - persisted-change-only feed. |
| 9 | Feed read fails | No | High | NEEDS PO/DEV CONFIRMATION - add error state. |
| 10 | User reaches final page | Partially | Medium | NEEDS PO/DEV CONFIRMATION - define page-end copy/state. |
| 11 | Story mentions defects but no defect writer exists | Partially | Medium | NEEDS PO/DEV CONFIRMATION - out of MVP unless writer added. |
| 12 | Story says live but MVP says no realtime | Yes | High | NEEDS PO/DEV CONFIRMATION - adjust wording/scope. |

---

### Clarified Business Rules

- BK-49 MVP remains read-side, paginated, newest-first, and workspace-scoped over existing activity_log rows.
- No automatic realtime/polling is assumed for MVP unless PO/Dev explicitly changes scope.
- Defect, Story/AC, import, and run-completion events remain out of MVP unless confirmed writers are added.
- Confirmed silent cases should not create feed entries unless product changes writer behavior.

## Critical Questions for PO

1. ***Should "live feed" be reworded to "activity feed" for BK-49 MVP?***

1. ***Where should the user open the activity feed?***

1. ***Which event types are included in MVP?***

1. ***Should defect activity remain out of scope for BK-49?***

1. ***What exact actor, action, item, and timestamp labels should users see?***

1. ***Can all workspace members view the feed, or only QA Leads/admin roles?***

1. ***What should users see when actor/item references are unavailable?***

1. ***What empty, loading, error, and page-end states are expected?***

---

## Technical Questions for Dev

1. ***What read contract will power the feed******:****** API route, server action, or direct server component query?*** - Blocks API/UI test planning.
2. ***What path/name will the read contract use if it is an API route?**** - Baseline found no `GET /api/v1/activity**` or workspace activity endpoint.
3. ***What response shape will include actor, action, item, timestamp, cursor, and any links?*** - Blocks expected-results mapping.
4. ***What page size and cursor format will be used?*** - Blocks pagination boundary tests.
5. ***What stable tie-breaker should be used with ****`created_at desc`****?*** - Blocks duplicate/skip prevention tests.
6. ***Will the feed resolve actor/item references live, join them server-side, or derive labels from payload only?*** - Blocks fallback and performance-risk testing.
7. ***How should RLS/role failures map to UI errors?*** - Blocks auth/permission negative tests.
8. ***Will a central event taxonomy file be added for labels and payload expectations?*** - Blocks objective label assertions.
9. ***Confirm that implementation will rely on page/component reloads rather than realtime/polling for this MVP.*** - Blocks scope control around automatic updates.

---

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Metadata

- **Created:** 6/1/2026
- **Updated:** 7/8/2026
- **Reporter:** Ely
- **Assignee:** José Andrés Lorca
- **Labels:** new-feature, shift-left-2026-06-29, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
