# Comments for BK-15

[View in Jira](https://jira.upexgalaxy.com/browse/BK-15)

---

### Ely - 5/19/2026, 9:54:34 PM

1. 🧱 Architect Annotation

1. 

- ****DB****: new table `acceptance*criteria` (id uuid pk, user*story*id uuid fk -> user*stories, title varchar(200), description text, position integer not null, created*at, updated*at, deleted*at). Indexes: `(user*story*id, position) WHERE deleted*at IS NULL` partial unique to enforce sibling-position uniqueness; secondary `(user*story*id, deleted_at)` for list queries.
- ****API surface****: `POST /api/acceptance-criteria`, `GET /api/acceptance-criteria/:id`, `GET /api/user-stories/:us*id/acceptance-criteria`, `PATCH /api/acceptance-criteria/:id` (title/description/position), `DELETE /api/acceptance-criteria/:id`. Plus a guard inside `PATCH /api/user-stories/:id` that blocks `status='ready*to_test'` when `count(active ACs) = 0`.
- ****Position rebalance****: single SQL statement `UPDATE acceptance*criteria SET position = position + 1 WHERE user*story*id = $1 AND position >= $2 AND deleted*at IS NULL` before insert, mirrored `position - 1` on delete/move. Wrap each mutation in a transaction with `SELECT ... FOR UPDATE` on the parent user_story row to serialize concurrent inserts.
- ****Validation****: Zod `AcceptanceCriterionCreateSchema` (title min 3 max 200, description max 50KB), position coerced to positive int, defaulted to `max(siblings.position) + 1` when omitted.
- ****Status guard****: dedicated repository method `canMarkReadyToTest(userStoryId)` returns boolean; called inside the user-story PATCH handler. Returns 409 with code `ac*required*for*ready*to_test`.
- ****Concurrency****: two simultaneous inserts at the same position resolve via the unique constraint — second insert retries with the next free slot or returns 409 (`position*conflict*retry`).

1. 

- Upstream: ****BK-14***** "User Story CRUD" (must exist to anchor ACs). *****BK-7**** "Module hierarchy" indirectly via user*story.module*id.
- Downstream: ****BK-17***** "Jira import" creates ACs via the same write path. *****BK-16**** "Markdown editor" renders the AC description body.
- External: none.

1. 

- [ ] Migration applies cleanly; rollback drops table and partial index
- [ ] OpenAPI surfaces all 5 routes; `bun run api:sync` clean
- [ ] Unit tests: insert at head/middle/tail, delete with shift, ready*to*test guard with zero ACs, ready*to*test guard with >=1 AC, cross-workspace 403
- [ ] Concurrency test: two parallel inserts at same position produce 2 rows with adjacent positions (no duplicate)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: add 3 ACs, reorder via PATCH, verify list order in SPA
- [ ] PR description cross-references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.2
- SRS: `.context/SRS/functional-specs.md` § FR-008
- Business map: `.context/business/business-data-map.md` § acceptance_criteria entity
- API contract: `.context/SRS/api-contracts.yaml` § `/api/acceptance-criteria`

---

### Ely - 6/5/2026, 4:11:06 AM

## Ready For QA — BK-15 Manage acceptance criteria under a user story

***Staging:**** https://staging-upexbunkai.vercel.app  ·  ****PR:**** #14 (merged to staging)  ·  ****Deploy:*** READY

### What shipped (as-built)

Acceptance Criteria CRUD under a User Story, with stable gap-free ordering and a ready-to-test gate.

- Open a project, hover a User Story in the Explorer sidebar, click the ***checklist icon*** (Manage acceptance criteria) to open the panel.
- The panel: numbered ordered list, ***up/down arrows**** to reorder, ****edit**** (title + optional Markdown detail, 50 KB cap, sanitized), ****remove**** (soft-archive), an ****add**** form, and a ****Mark ready to test / Back to draft*** toggle.
- A ***ready*** chip shows on the story row when it is ready*to*test.

### Endpoints

- `POST /api/v1/user-stories/{id}/acceptance-criteria` — add (optional `position`, else tail).
- `GET  /api/v1/user-stories/{id}/acceptance-criteria` — list active, in position order.
- `GET/PATCH/DELETE /api/v1/acceptance-criteria/{id}` — read / edit (title/detail) or reorder (`position`) / soft-archive.
- `PATCH /api/v1/user-stories/{id}` `{status}` — ready-to-test gate (409 `ac*required*for*ready*to_test`).

### AC verification guide

1. ***Add → first***: on a story with no criteria, add one → it is #1.
2. ***Insert preserves order***: with A,B,C, add and move so X sits between A and B → A,X,B,C.
3. ***Reorder, no gaps***: move the last to the top → it becomes #1 and the rest renumber 2,3,… with no gaps.
4. ***Gate***: on a story with zero criteria, click "Mark ready to test" → blocked, amber message "at least one acceptance criterion".
5. ***Title min length***: add with a 2-char title → rejected ("at least 3 characters").
6. ***Remove last reverts***: mark a story (with exactly one criterion) ready to test, then remove that criterion → the story drops back to draft and tells you it needs ≥1 criterion.

### Notes for QA

- Reordering is atomic and gap-free; archived criteria leave no holes.
- Markdown detail renders through the BK-16 sanitized path (no raw HTML execution) — XSS payloads in detail should render inert.
- 403 vs 404: a workspace outsider sees 404; an in-workspace viewer (read-only) sees 403 on writes.
- The ready-to-test gate is race-safe (serialized at the DB level).

---

### maibeth vega - 6/18/2026, 4:13:42 PM

## Acceptance Test Plan (ATP) — BK-15 [Part 1 of 2]

### Story Summary

BK-15 delivers Acceptance Criteria CRUD under a User Story in Bunkai TMS. A workspace member can add, reorder (up/down arrows), edit, and soft-archive criteria. A ready-to-test gate blocks the story status transition when zero active ACs exist; archiving the last active AC auto-reverts the story to `draft`.

### Testing Scope

- ***UI***: AC management panel (add form, numbered list, up/down reorder, inline edit, remove, Mark-ready-to-test / Back-to-draft toggle)
- ***API***: all five endpoints — POST create, GET list, GET single, PATCH edit/reorder, DELETE archive, PATCH user-story status gate
- ***DB***: `acceptance*criteria` rows, `archived*at` stamps, `user_stories.status` column, position contiguity

### Environment

Staging — `https://staging-upexbunkai.vercel.app`

### Shift-Left Reference

`shift-left-refinement.md` — 2026-06-09 (Phases 1–3 completed pre-sprint; SHORT-CIRCUIT applied)

### Behavioral Corrections Applied (Dev comment 2026-06-05)

- Auto-revert on last AC removal: ***CONFIRMED*** — archive RPC auto-reverts story to `draft`
- Reorder: ***up/down arrows only*** (no drag-drop)
- Workspace outsider auth: ***404*** (not 403) — corrected from shift-left assumption; E5, E6 updated
- In-workspace read-only member: ***403*** on writes
- Endpoint prefix: `/api/v1/` confirmed
- XSS in Markdown detail: rendered inert via BK-16 sanitization
- Ready-to-test gate: ***race-safe*** (serialized at DB level)

### Coverage Summary

| Type | Count | Priority Focus |
| --- | --- | --- |
| Positive | 9 | Add first, append, insert, reorder, edit, archive non-last, status transitions |
| Negative | 10 | Validation failures, auth failures (404/403), gate rejection, re-archive 404, edit invalid |
| Boundary | 7 | Title 2/3/200/201 chars, description 51200/51201 bytes, list-edge reorder |
| Integration | 5 | Status auto-revert, active-count exclusion, composite ops, ATC binding cascade, WS isolation |
| API | 5 | Per endpoint contract + exact error code assertions |
| ***Total**** | ****36*** |  |

### Parametrization Groups

| Group | TCs | Shared setup |
| --- | --- | --- |
| `title*boundary*group` | TC-11, TC-12, TC-20, TC-21, TC-22 | Single fresh story; four title values |
| `description*boundary*group` | TC-13, TC-23, TC-24 | Single fresh story; two byte counts |
| `cross*workspace*isolation_group` | TC-16, TC-17, TC-31 | Two isolated workspaces; outsider user |

---

## Test Cases — Part 1 (TC-01 to TC-18)

### [Positive] TC-01: Should add first AC at position 1 when story has no criteria

- ***Related scenario****: Scenario 1.1 | ****Type/Priority/Level****: Positive / Critical / API + UI | ****Parametrized***: No
- ***Preconditions***: Workspace member. User Story with 0 ACs, status `draft`.
- ***Test steps***:
- ***Test data***: `{ "title": "Full refund within 30 days" }`
- ***Post-conditions***: Archive the AC.

---

### [Positive] TC-02: Should append AC at tail when story already has ACs and no position specified

- ***Related scenario****: Scenario 1.2 | ****Type/Priority/Level****: Positive / High / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with ACs at positions 1, 2, 3.
- ***Test steps***:
- ***Test data***: `{ "title": "Notify customer on refund" }`
- ***Post-conditions***: Archive the new AC.

---

### [Positive] TC-03: Should insert AC at a specified position and shift existing ACs forward by 1

- ***Related scenario****: Scenario 2.1 | ****Type/Priority/Level****: Positive / High / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with A(1), B(2), C(3).
- ***Test steps***:
- ***Test data***: `{ "title": "X — inserted AC", "position": 2 }`
- ***Post-conditions***: Archive X.

---

### [Positive] TC-04: Should move AC from bottom to top and re-number remaining ACs

- ***Related scenario****: Scenario 3.1 | ****Type/Priority/Level****: Positive / High / API + UI | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with A(1), B(2), C(3).
- ***Test steps***:

---

### [Positive] TC-05: Should move AC from top to bottom and re-number remaining ACs

- ***Related scenario****: Scenario 3.2 | ****Type/Priority/Level****: Positive / Medium / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with A(1), B(2), C(3).
- ***Test steps***:

---

### [Positive] TC-06: Should allow story status transition to ready*to*test with at least one active AC

- ***Related scenario****: Scenario 4.2 | ****Type/Priority/Level****: Positive / Critical / API + UI | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with 1 active AC and status `draft`.
- ***Test steps***:
- ***Post-conditions***: Revert to `draft` via PATCH.

---

### [Positive] TC-07: Should update an existing AC title within valid bounds ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Scenario E1 | ****Type/Priority/Level****: Positive / High / API | ****Parametrized***: No
- ***NEEDS******_******CONFIRMATION***: Confirm PATCH validates title same as POST; confirm atomic title+position update.
- ***Preconditions***: Workspace member. Active AC titled "Full refund within 30 days".
- ***Test steps***:
- ***Test data***: `{ "title": "Full refund within 14 days" }`

---

### [Positive] TC-08: Should NOT revert story status when a non-last AC is archived

- ***Related scenario****: Scenario 6.2 | ****Type/Priority/Level****: Positive / High / API + DB | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with `ready*to*test`, 3 active ACs.
- ***Test steps***:

---

### [Positive] TC-09: Should add AC to a ready*to*test story without changing its status ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Phase 5 Edge case #15 | ****Type/Priority/Level****: Positive / High / API + DB | ****Parametrized***: No
- ***NEEDS*************CONFIRMATION***: Confirm adding an AC to a `ready*to_test` story does not trigger status change.
- ***Preconditions***: Workspace member. Story with `ready*to*test`, 1 existing AC.
- ***Test steps***:
- ***Post-conditions***: Archive the new AC.

---

### [Negative] TC-10: Should block story status transition to ready*to*test when story has zero active ACs

- ***Related scenario****: Scenario 4.1 | ****Type/Priority/Level****: Negative / Critical / API + UI | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with 0 ACs, status `draft`.
- ***Test steps***:

---

### [Negative] TC-11: Should reject AC creation when title is shorter than 3 characters

- ***Related scenario****: Scenario 5.1 | ****Type/Priority/Level****: Negative / High / API + UI | ****Parametrized***: Yes — `title*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "AB" }`

---

### [Negative] TC-12: Should reject AC creation when title exceeds 200 characters

- ***Related scenario****: Scenario 5.2 | ****Type/Priority/Level****: Negative / High / API | ****Parametrized***: Yes — `title*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "A".repeat(201) }`

---

### [Negative] TC-13: Should reject AC creation when description exceeds 50 KB

- ***Related scenario****: Scenario E3 | ****Type/Priority/Level****: Negative / High / API + UI | ****Parametrized***: Yes — `description*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "Valid title", "description": "A".repeat(51201) }`

---

### [Negative] TC-14: Should reject AC edit when updated title is shorter than 3 characters ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Scenario E2 | ****Type/Priority/Level****: Negative / High / API | ****Parametrized***: No
- ***NEEDS*************CONFIRMATION***: Edit validation behavior inferred; confirm 422 `title*too_short` applies to PATCH.
- ***Preconditions***: Workspace member. Active AC titled "Full refund within 30 days".
- ***Test steps***:
- ***Test data***: `{ "title": "Hi" }`

---

### [Negative] TC-15: Should reject AC edit when updated title exceeds 200 characters ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Negative outline — edit title too long | ****Type/Priority/Level****: Negative / High / API | ****Parametrized***: No
- ***NEEDS******_******CONFIRMATION***: Same as TC-14 — edit validation inferred.
- ***Preconditions***: Workspace member. Active AC.
- ***Test steps***:
- ***Test data***: `{ "title": "A".repeat(201) }`

---

### [Negative] TC-16: Should return 404 when a workspace outsider attempts to create an AC

- ***Related scenario****: Scenario E5 (corrected 403→404) | ****Type/Priority/Level****: Negative / Critical / API | ****Parametrized***: Yes — `cross*workspace*isolation_group`
- ***Correction****: shift-left assumed 403; Dev confirmed outsider sees ****404***.
- ***Preconditions***: User B has no membership in the workspace owning the User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "Outsider AC" }`

---

### [Negative] TC-17: Should return 404 when a workspace outsider attempts to archive an AC

- ***Related scenario****: Scenario E6 (corrected 403→404) | ****Type/Priority/Level****: Negative / Critical / API | ****Parametrized***: Yes — `cross*workspace*isolation_group`
- ***Correction****: shift-left assumed 403; Dev confirmed outsider sees ****404***.
- ***Preconditions***: User B has no membership in the workspace owning the AC.
- ***Test steps***:

---

### [Negative] TC-18: Should return 403 when an in-workspace read-only member attempts to reorder an AC

- ***Related scenario****: Negative outline — 403 on write for read-only member | ****Type/Priority/Level****: Negative / Critical / API | ****Parametrized***: No
- ***Preconditions***: User C is a workspace member with read-only permissions. Story with 2 ACs.
- ***Test steps***:

---

### maibeth vega - 6/18/2026, 4:13:55 PM

## Acceptance Test Plan (ATP) — BK-15 [Part 2 of 2]

## Test Cases — Part 2 (TC-19 to TC-36)

### [Negative] TC-19: Should return 404 when attempting to archive an already-archived AC ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Scenario E7 | ****Type/Priority/Level****: Negative / Medium / API | ****Parametrized***: No
- ***NEEDS******_******CONFIRMATION***: `mapCriterionRpcError` maps P0002 → 404; inferred archived AC triggers not-found.
- ***Preconditions***: Workspace member. AC with `archived_at` already stamped.
- ***Test steps***:

---

### [Boundary] TC-20: Should accept AC title of exactly 3 characters

- ***Related scenario****: Scenario 5.3 | ****Type/Priority/Level****: Boundary / Medium / API | ****Parametrized***: Yes — `title*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "Buy" }`
- ***Post-conditions***: Archive the AC.

---

### [Boundary] TC-21: Should accept AC title of exactly 200 characters

- ***Related scenario****: Scenario 5.4 | ****Type/Priority/Level****: Boundary / Medium / API | ****Parametrized***: Yes — `title*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "A".repeat(200) }`
- ***Post-conditions***: Archive the AC.

---

### [Boundary] TC-22: Should reject AC title of exactly 201 characters

- ***Related scenario****: Negative boundary outline | ****Type/Priority/Level****: Boundary / High / API | ****Parametrized***: Yes — `title*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "A".repeat(201) }`

---

### [Boundary] TC-23: Should accept AC description of exactly 50 KB (51200 bytes)

- ***Related scenario****: Scenario E4 | ****Type/Priority/Level****: Boundary / Medium / API | ****Parametrized***: Yes — `description*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "Valid title", "description": "A".repeat(51200) }`
- ***Post-conditions***: Archive the AC.

---

### [Boundary] TC-24: Should reject AC description of exactly 50 KB + 1 byte (51201 bytes)

- ***Related scenario****: Scenario E3 (boundary assertion) | ****Type/Priority/Level****: Boundary / High / API | ****Parametrized***: Yes — `description*boundary*group`
- ***Preconditions***: Workspace member. Any User Story.
- ***Test steps***:
- ***Test data***: `{ "title": "Valid title", "description": "A".repeat(51201) }`

---

### [Boundary] TC-25: Should handle insert at position 1 (prepend) correctly

- ***Related scenario****: Scenario 2.2 | ****Type/Priority/Level****: Boundary / Medium / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with ACs at positions 1, 2, 3.
- ***Test steps***:
- ***Test data***: `{ "title": "Prepended AC", "position": 1 }`
- ***Post-conditions***: Archive the prepended AC.

---

### [Boundary] TC-26: Should disable or no-op move-up for AC #1 and move-down for last AC ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: Scenario 3.3 | ****Type/Priority/Level****: Boundary / High / UI + API | ****Parametrized***: No
- ***NEEDS******_******CONFIRMATION***: Behavior at list edges not specified. Best guess: buttons disabled/hidden for edge positions.
- ***Preconditions***: Workspace member. Story with 3 ACs at positions 1, 2, 3.
- ***Test steps***:
- ***Expected result***: No position change in DB; UI reflects disabled state at edges.

---

### [Integration] TC-27: Should auto-revert story status to draft when the last active AC is archived

- ***Related scenario****: Scenario 6.1 | ****Type/Priority/Level****: Integration / Critical / API + DB + UI | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with `ready*to*test` and exactly 1 active AC.
- ***Test steps***:

---

### [Integration] TC-28: Should exclude archived ACs from active count used in the ready-to-test gate

- ***Related scenario****: Scenario E8 | ****Type/Priority/Level****: Integration / Critical / API + DB | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with 2 ACs: 1 active, 1 archived.
- ***Test steps***:
- ***Post-conditions***: Revert story to `draft`.

---

### [Integration] TC-29: Should maintain position contiguity after a sequence of insert, move, and archive operations

- ***Related scenario****: Integration outline — composite operations | ****Type/Priority/Level****: Integration / High / API + DB | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with 5 ACs at positions 1–5.
- ***Test steps***:
- ***Expected result***: Active AC positions form a contiguous sequence; no duplicate positions under partial unique index.
- ***Post-conditions***: Archive all test ACs.

---

### [Integration] TC-30: Should preserve ATC bindings (or surface a warning) when a bound AC is archived ***[******NEEDS******_******CONFIRMATION — BLOCKED on BK-18]***

- ***Related scenario****: Integration outline — ATC binding cascade | ****Type/Priority/Level****: Integration / Critical / API + DB | ****Parametrized***: No
- ***NEEDS*************CONFIRMATION***: Blocked on BK-18 (ATC authoring not shipped). Cascade behavior for `atc*acceptance_criteria` on AC soft-archive is undefined. Execute ONLY after BK-18 ships and PO answers Critical Question #3.
- ***Preconditions***: Active AC bound to at least one ATC via `atc*acceptance*criteria`. (Requires BK-18.)
- ***Test steps***:
- ***Expected result***: Per PO answer to Critical Question #3. Either (a) blocked with user-facing error, or (b) archived with binding preserved or cascade-deleted.

---

### [Integration] TC-31: Should enforce workspace isolation — cannot read or mutate ACs from a different workspace

- ***Related scenario****: Integration outline — cross-workspace isolation | ****Type/Priority/Level****: Integration / Critical / API | ****Parametrized***: Yes — `cross*workspace*isolation_group`
- ***Preconditions***: WS-A and WS-B are isolated. User A is a member of WS-A only. AC exists in WS-B.
- ***Test steps***:
- ***Expected result***: All three operations return `404`; DB shows no mutation.

---

### [API] TC-32: Should return active ACs ordered by position ascending on GET list endpoint

- ***Related scenario****: API outline — GET list ordered | ****Type/Priority/Level****: API / High / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. Story with 3 active ACs at positions 1, 2, 3 and 1 archived AC.
- ***Test steps***:
- ***Expected result***: `200` with `[{ position: 1 }, { position: 2 }, { position: 3 }]`; archived AC excluded.

---

### [API] TC-33: Should return a single active AC on GET single endpoint

- ***Related scenario****: API outline — GET single | ****Type/Priority/Level****: API / Medium / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. One active AC.
- ***Test steps***:
- ***Expected result***: `200` with complete AC object; `archived_at: null`.

---

### [API] TC-34: Should return 404 for GET single endpoint when AC is archived ***[******NEEDS******_******CONFIRMATION]***

- ***Related scenario****: API outline — GET returns 404 for archived AC | ****Type/Priority/Level****: API / Medium / API | ****Parametrized***: No
- ***NEEDS******_******CONFIRMATION***: Confirm 404 (not 410 Gone) for an archived AC on GET single.
- ***Preconditions***: Workspace member. AC with `archived_at` stamped.
- ***Test steps***:
- ***Expected result***: `404` (not 410 or 422).

---

### [API] TC-35: Should include user_stories.status in the GET user-story response after BK-15 ships

- ***Related scenario****: API outline — status field in GET response | ****Type/Priority/Level****: API / High / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. User Story with known status.
- ***Test steps***:
- ***Expected result***: `200` with `status` field present and accurate.

---

### [API] TC-36: Should return 409 with exact error code on PATCH user-story when zero ACs exist

- ***Related scenario****: API outline — exact 409 error code | ****Type/Priority/Level****: API / Critical / API | ****Parametrized***: No
- ***Preconditions***: Workspace member. User Story with 0 ACs.
- ***Test steps***:
- ***Expected result***: `409` with `code: "ac*required*for*ready*to_test"` exactly.

---

## Test-Data Strategy

### Static data (use exact values)

| Data point | Value | Rationale |
| --- | --- | --- |
| Title 2 chars (reject) | `"AB"` | Below minimum boundary |
| Title 3 chars (accept) | `"Buy"` | At minimum boundary |
| Title 200 chars (accept) | `"A".repeat(200)` | At maximum boundary |
| Title 201 chars (reject) | `"A".repeat(201)` | One over maximum |
| Description 51200 bytes (accept) | `"A".repeat(51200)` | `MAX*AC*DESCRIPTION_BYTES` exactly |
| Description 51201 bytes (reject) | `"A".repeat(51201)` | One byte over cap |

### Dynamic data (generated per session)

| Entity | Strategy | Notes |
| --- | --- | --- |
| Workspace | Fresh per session | Slug: `test-ws-{timestamp}` |
| Project / Module | Fresh per session | Under test workspace |
| User Story | Fresh per test group | Title: `Test Story {random 6-char suffix}` |
| AC titles (non-boundary) | `faker.lorem.words(3..8)` trimmed to 3–100 chars | Avoid exact boundary values |
| Outsider user | Pre-created; reused across isolation group | No workspace membership |

***Pattern***: Generate + Teardown — all entities created fresh per group; archived/deleted after. No shared mutable state across groups.

---

## Confirmed Behaviors

| Topic | Confirmed behavior | Source |
| --- | --- | --- |
| Auto-revert on last AC removal | Story auto-reverts to `draft`; `user*story*reverted: true` | Dev comment 2026-06-05 |
| Reorder mechanism | Up/down arrows only; no drag-drop | Dev comment + impl plan Slice 5 |
| Workspace outsider auth | 404 (outsider sees resource not found) | Dev comment 2026-06-05 |
| In-workspace read-only auth | 403 on write operations | Dev comment 2026-06-05 |
| Soft-archive | `archived*at` column stamped; `WHERE archived*at IS NULL` = active | Impl plan Slice 1 |
| 409 error code | `ac*required*for*ready*to_test` | Impl plan Slice 4 |
| 422 error code | `validation*failed` + `title*too_short` | Impl plan Slice 2 |
| XSS in Markdown detail | Sanitized via BK-16; renders inert | Dev comment 2026-06-05 |
| Gate concurrency | Race-safe via `SELECT ... FOR UPDATE` at DB level | Dev comment + arch annotation |
| Description byte cap | `MAX*AC*DESCRIPTION_BYTES = 50 KB = 51200 bytes` | Impl plan Slice 2 |
| Position contiguity | Negative-parking trick; partial unique index `(user*story*id, position) WHERE archived_at IS NULL` | Impl plan Slice 1 |

---

## Open Items — NEEDS_CONFIRMATION

| TC | Question | Blocked on |
| --- | --- | --- |
| TC-07 | Confirm PATCH validates title same as POST; confirm atomic title+position update. | Dev |
| TC-09 | Confirm adding AC to `ready*to*test` story does not change its status. | PO / Dev |
| TC-14 | Confirm 422 `title*too*short` applies to PATCH as well as POST. | Dev |
| TC-15 | Confirm 422 title-too-long applies to PATCH. | Dev |
| TC-19 | Confirm 404 (not 410 or 422) for a second DELETE on an already-archived AC. | Dev |
| TC-26 | Confirm UI behavior at list edges: disabled button vs. no-op API call vs. API error. | Dev / PO |
| TC-30 | Define cascade behavior for `atc*acceptance*criteria` when AC is soft-archived. Blocked until BK-18 ships. | PO + BK-18 |
| TC-34 | Confirm 404 (not 410 Gone) for GET single on an archived AC. | Dev |
| Phase 2 Q4 | Confirm archived ACs are hidden from all views and not restorable via current UI. | PO |

---

### maibeth vega - 6/18/2026, 5:34:59 PM

## QA Sign-off — BK-15

***Result***: PASSED WITH ISSUES
***Environment***: Staging — https://staging-upexbunkai.vercel.app
***Date***: 2026-06-18
***QA***: Maibeth

***Coverage***: 28/36 TCs passed (77.8%). All 6 original ACs verified. All Critical and High scenarios passed.

***Defect found (non-blocking)***:

- Description byte cap uses decimal KB (50,000 bytes) instead of binary KiB (51,200 bytes). Medium severity — does not block core AC management flow.

***Under confirmation (pending Dev input)***:

- TC-19: Re-archive returns 409 `already_archived` instead of expected 404 — may be intentional.

***Key behaviors verified***:

- AC add / insert / reorder / soft-archive (gap-free, contiguous)
- Ready-to-test gate (409 with correct error code)
- Auto-revert to draft on last AC removal
- Workspace isolation (outsider 404, read-only member 403)
- Title validation 3-200 chars (422 at boundaries)
- Up/down arrow edge behavior (disabled at list boundaries)
- XSS in Markdown detail rendered inert

***Skipped***: TC-30 (ATC binding cascade — blocked on BK-18)

***Next steps***: file Medium bug for byte cap; await Dev confirmation on TC-19 behavior; proceed to Stage 4 test-documentation.

---

### maibeth vega - 6/18/2026, 5:54:01 PM

Bug found during exploratory testing: BK-143 — AC Management: Description Validation: Byte cap enforces 50,000 bytes (decimal) instead of 51,200 bytes (binary KiB)

---


_Synced from Jira by sync-jira-issues_
