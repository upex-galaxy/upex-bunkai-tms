# BK-4 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

# Acceptance Test Plan (ATP) — BK-4

***Story***: Create a Workspace
***Epic***: BK-1 — Tenancy & Identity
***Env***: Staging (`https://staging-upexbunkai.vercel.app`)
***Modality***: Jira-native (ATP → `customfield_10120`)
***Date***: 2026-06-05
***Tester***: QA — Stage 1 Planning (Shift-Left short-circuit active)

---

## Test Analysis

### Risk Triage

| Factor                | Score  | Justification                                                      |
| --------------------- | ------ | ------------------------------------------------------------------ |
| New feature           | +3     | Net-new `POST /api/v1/workspaces` endpoint                         |
| Dynamic data (API/DB) | +3     | Writes to `workspaces` + `workspace_members` via transactional RPC |
| Explicit ACs present  | +2     | 13 refined ACs from Shift-Left batch                               |
| User-facing           | +2     | Onboarding flow entry point                                        |
| High priority         | +1     | MVP wave-1                                                         |
| Multi-component       | +1     | Zod validation → RPC → DB → response fetch                         |
| ***Total****             | ****12**** | ****HIGH*** — Full ATP + extended edge cases                          |

Risk score 12 → HIGH. Shift-Left label `shift-left-2026-05-27` (<30 days) short-circuits Phases 1-3. Proceeding from Phase 4.

### What Changed

Last QA pass (2026-05-28, Nahuel Gomez) on ***prod**** tested 9 scenarios — all passed. This is re-verification on ****staging*** with the same codebase (commit `beae616` on main). Implementation surface:

- `POST /api/v1/workspaces` — Zod validation (`name.trim().min(1).max(80)`, `slug.min(3).max(40)` + regex + reserved-slug guard), RPC `bunkai*bootstrap*workspace`, 409 on slug collision, 201 response
- `GET /api/v1/workspaces` — RLS-filtered / member-filtered list
- `GET /api/v1/workspaces/{id}` — single fetch
- Error envelope: `{ code, message }` + HTTP status

### Implementation-Spec Discrepancies Found

| #   | Spec/comment says                               | Implementation says                                                               | Impact                                                  |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| D1  | Name max 60 (Ciprian) / 100 (LuisEduardo) chars | Name max ***80*** chars (`z.string().max(80)`)                                      | Boundary TC values adjusted                             |
| D2  | Name min 3 chars (multiple comments)            | Name min ***1*** char (`z.string().min(1)`)                                         | Name-too-short at 2 chars no longer fails on name alone |
| D3  | Slug auto-derived serverside                    | Slug is ***client-supplied*** and validated; both `name` and `slug` required        | Negative TCs need missing-slug scenario                 |
| D4  | Slug max 60 chars                               | Slug max ***40*** chars                                                             | Boundary TC adjusted                                    |
| D5  | 201 response `{ workspace*id, slug }`           | 201 response `{ workspace: { id, slug, name, owner*user*id, plan, created*at } }` | Response shape verification adjusted                    |

### Regression Surface

| Adjacent area          | Risk   | Reason                                                             |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| BK-5 Invite Teammate   | MEDIUM | Depends on workspace existing (passes `workspace_id`)              |
| BK-6 Switch Workspace  | LOW    | Depends on ≥2 workspaces                                           |
| GET /workspaces (list) | LOW    | RLS + member join must filter correctly                            |
| PATCH /workspaces/{id} | LOW    | Owner-only validation relies on correct owner in workspace_members |
| Onboarding UI flow     | MEDIUM | Migrated from direct RPC call to REST endpoint                     |

---

## Test Cases

### Coverage Summary

| Type                 | Count  | Notes                                               |
| -------------------- | ------ | --------------------------------------------------- |
| Positive             | 10     | Happy path, boundaries, edge-valid inputs           |
| Negative             | 16     | Validation, auth, protocol errors                   |
| Boundary             | 4      | Exact limits on name/slug length                    |
| Integration/DB       | 3      | Transaction rollback, workspace+members cross-check |
| Regression (prior 9) | 9      | Re-verified from 2026-05-28 pass                    |
| ***Total unique****     | ****23*** | 9 re-verify + 14 new                                |

### Previously-Passed Scenarios (Re-Verify on Staging)

These 9 scenarios passed on prod (2026-05-28). Re-execute on staging to confirm deployment parity.

***BK-4: TC01: Validate workspace created with valid name and slug***

- Type: Positive / Critical / API
- Precondition: Authenticated PAT `bk*pat*ZBOc7TnyHEdA`, no workspace with slug `qa-test-workspace`
- Steps:

  1. POST `/api/v1/workspaces` with `{"name": "QA Test Workspace", "slug": "qa-test-workspace"}`, Authorization: Bearer PAT

- Expected: 201 `{ workspace: { id: uuid, slug: "qa-test-workspace", name: "QA Test Workspace", owner*user*id: uuid, plan: "free", created_at: ISO8601 } }`
- Prior result: ✅

***BK-4: TC02: Validate name too short rejected***

- Type: Negative / High / API
- Steps: POST with `{"name": "AB", "slug": "valid-slug"}`
- Expected: Zod validates `name.trim().min(1)` → ***name passes**** (AB = 2 chars ≥ 1). If slug is valid, this will 201, not 400. ****RECALIBRATED***: the prior test may have omitted slug. With valid slug, 2-char name is accepted.
- Note: Prior test sent payload without slug → failed on missing required field. Implementation requires both fields.

***BK-4: TC03: Validate slug too short rejected***

- Type: Negative / High / API
- Steps: POST with `{"name": "Valid Name", "slug": "ab"}`
- Expected: 400 `{ code: "validation_failed" }` — slug min 3
- Prior result: ✅

***BK-4: TC04: Validate empty name rejected***

- Type: Negative / High / API
- Steps: POST with `{"name": "", "slug": "valid-slug"}`
- Expected: 400 `{ code: "validation_failed" }` — name min 1
- Prior result: ✅

***BK-4: TC05: Validate duplicate slug rejected***

- Type: Negative / Critical / API
- Precondition: Workspace with slug `qa-test-workspace` exists from TC01
- Steps: POST with `{"name": "Another QA", "slug": "qa-test-workspace"}`
- Expected: 409 `{ code: "conflict", message: "Slug \"qa-test-workspace\" is already taken." }`
- Prior result: ✅

***BK-4: TC06: Validate reserved slug rejected***

- Type: Negative / Critical / API
- Steps: POST with `{"name": "Admin Panel", "slug": "admin"}`
- Expected: 400 `{ code: "validation_failed" }` — slug is reserved
- Prior result: ✅

***BK-4: TC07: Validate GET /workspaces returns created workspace***

- Type: Positive / High / API
- Precondition: At least 1 workspace exists for the PAT user
- Steps: GET `/api/v1/workspaces`, Authorization: Bearer PAT
- Expected: 200 `{ workspaces: [...], length ≥ 1 }`
- Prior result: ✅

***BK-4: TC08: Validate GET /workspaces/{id} returns workspace***

- Type: Positive / High / API
- Precondition: Workspace `id` known from TC01
- Steps: GET `/api/v1/workspaces/{id-from-TC01}`
- Expected: 200 `{ id, slug, name, owner*user*id, plan, created_at }` matching TC01
- Prior result: ✅

***BK-4: TC09: Validate GET /workspaces/{bad-id} returns 404***

- Type: Negative / Medium / API
- Steps: GET `/api/v1/workspaces/00000000-0000-0000-0000-000000000000`
- Expected: 404 or error response
- Prior result: ✅

### New Test Cases (Not Covered in Prior Pass)

#### Positive

***BK-4: TC10: Validate name trimmed server-side (leading/trailing spaces)***

- Type: Positive / High / API
- Steps: POST with `{"name": "  Acme   QA  ", "slug": "acme-qa-spaces"}`
- Expected: 201 `{ workspace: { name: "Acme   QA" } }` (trim leading/trailing only, NOT collapse internal spaces — Zod `.trim()` is trim-only)
- Data: name `"  Acme   QA  "`, slug `"acme-qa-spaces"`

***BK-4: TC11: Validate name with 1 character accepted***

- Type: Positive / Boundary / High / API
- Steps: POST with `{"name": "X", "slug": "x-proj"}`
- Expected: 201 — name min 1 char is valid per Zod `.min(1)`
- Data: name `"X"`, slug `"x-proj"`

***BK-4: TC12: Validate name exactly 80 characters accepted***

- Type: Positive / Boundary / High / API
- Steps: POST with name = 80 chars of 'A', valid slug
- Expected: 201
- Data: name `"A".repeat(80)`, slug `"max-name-test-80"`

***BK-4: TC13: Validate slug exactly 3 characters accepted***

- Type: Positive / Boundary / High / API
- Steps: POST with `{"name": "Min Slug", "slug": "abc"}`
- Expected: 201 — slug meets regex `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` (3 chars = start + 1 middle + end)
- Data: name `"Min Slug"`, slug `"abc"`

***BK-4: TC14: Validate slug exactly 40 characters accepted***

- Type: Positive / Boundary / High / API
- Steps: POST with slug = 40 chars matching regex
- Expected: 201
- Data: name `"Max Slug"`, slug `"a".repeat(38) + "bc"` (40 chars, starts/ends alphanumeric)

***BK-4: TC15: Validate name with accent characters accepted***

- Type: Positive / Edge / Medium / API
- Steps: POST with `{"name": "Bünkāï QA", "slug": "bunkai-qa"}`
- Expected: 201 `{ workspace: { name: "Bünkāï QA", slug: "bunkai-qa" } }` — name preserved as-is, slug as sent by client
- Data: name `"Bünkāï QA"`, slug `"bunkai-qa"`

***BK-4: TC16: Validate extra payload fields ignored***

- Type: Positive / Edge / Medium / API
- Steps: POST with `{"name": "Extra Test", "slug": "extra-test", "role": "admin", "plan": "enterprise", "owner_id": "malicious-uuid"}`
- Expected: 201 — extra fields silently ignored, owner from token, slug from payload only
- Data: name `"Extra Test"`, slug `"extra-test"`, extra fields `role`, `plan`, `owner_id`

#### Negative

***BK-4: TC17: Validate missing name field rejected***

- Type: Negative / High / API
- Steps: POST with `{"slug": "no-name-here"}`
- Expected: 400 `{ code: "validation_failed" }` — name is required

***BK-4: TC18: Validate missing slug field rejected***

- Type: Negative / High / API
- Steps: POST with `{"name": "No Slug Provided"}`
- Expected: 400 `{ code: "validation_failed" }` — slug is required

***BK-4: TC19: Validate empty body rejected***

- Type: Negative / High / API
- Steps: POST with empty body `{}`
- Expected: 400 `{ code: "validation_failed" }` — both name and slug required

***BK-4: TC20: Validate name exceeds 80 characters rejected***

- Type: Negative / Boundary / High / API
- Steps: POST with name = 81 chars of 'A', valid slug
- Expected: 400 `{ code: "validation_failed" }` — name max 80
- Data: name `"A".repeat(81)`, slug `"too-long-name"`

***BK-4: TC21: Validate slug without alphanumeric start rejected***

- Type: Negative / Boundary / High / API
- Steps: POST with `{"name": "Bad Slug", "slug": "-bad-start"}`
- Expected: 400 `{ code: "validation_failed" }` — regex requires `^[a-z0-9]`

***BK-4: TC22: Validate slug with trailing hyphen rejected***

- Type: Negative / Boundary / High / API
- Steps: POST with `{"name": "Bad End", "slug": "bad-end-"}`
- Expected: 400 `{ code: "validation_failed" }` — regex requires `[a-z0-9]$`

***BK-4: TC23: Validate slug with uppercase rejected***

- Type: Negative / Edge / Medium / API
- Steps: POST with `{"name": "Upper Slug", "slug": "UPPER-SLUG"}`
- Expected: 400 `{ code: "validation_failed" }` — regex requires lowercase only

***BK-4: TC24: Validate slug exceeds 40 characters rejected***

- Type: Negative / Boundary / High / API
- Steps: POST with slug = 41 chars
- Expected: 400 `{ code: "validation_failed" }` — slug max 40

***BK-4: TC25: Validate malformed JSON rejected***

- Type: Negative / Medium / API
- Steps: POST with unclosed JSON `{"name": "Broken"`
- Expected: 400 `{ code: "bad_request", message: "Request body must be valid JSON." }`

***BK-4: TC26: Validate wrong Content-Type handled***

- Type: Negative / Low / API
- Steps: POST with `Content-Type: text/plain`, body `name=test`
- Expected: 400 or 415 — JSON parsing fails or content-type rejected

***BK-4: TC27: Validate unauthenticated request rejected***

- Type: Negative / Critical / API
- Steps: POST without Authorization header `{"name": "No Auth", "slug": "no-auth"}`
- Expected: 401 `{ code: "unauthorized" }`

#### Integration / DB Cross-Validation

***BK-4: TC28: Validate workspace row persisted in DB***

- Type: Integration / Critical / DB
- Precondition: Workspace created in TC01
- Steps: Query `workspaces` table via DBHub MCP: `SELECT id, slug, name, owner*user*id, plan, created_at FROM workspaces WHERE slug = 'qa-test-workspace'`
- Expected: 1 row matching TC01 response fields

***BK-4: TC29: Validate workspace******_******members row for creator***

- Type: Integration / Critical / DB
- Precondition: TC28 confirmed
- Steps: Query `workspace*members` via DBHub: `SELECT wm.role, wm.status FROM workspace*members wm JOIN workspaces w ON wm.workspace*id = w.id WHERE w.slug = 'qa-test-workspace' AND w.owner*user*id = wm.user*id`
- Expected: 1 row with `role = "owner"`, `status = "active"`

***BK-4: TC30: Validate concurrent creation with same slug — only one wins***

- Type: Integration / Edge / High / API
- Precondition: Fresh unique slug for this test
- Steps: Send 2 simultaneous POST requests with `{"name": "Concurrent", "slug": "<unique-slug>"}`
- Expected: One returns 201, the other returns 409 `{ code: "conflict" }`, exactly 1 row in DB

---

## TC Summary Table

| #    | Scenario                               | Type        | Status Code | Key Fields Verified                                      |
| ---- | -------------------------------------- | ----------- | ----------- | -------------------------------------------------------- |
| TC01 | Valid name + slug → workspace created  | Positive    | 201         | id, slug, name, owner*user*id, plan, created_at          |
| TC02 | Name too short (2 chars, re-verify)    | Negative    | 201/400     | Name min=1 → passes if slug valid; fails if slug missing |
| TC03 | Slug too short (2 chars)               | Negative    | 400         | validation_failed, slug min=3                            |
| TC04 | Empty name                             | Negative    | 400         | validation_failed, name min=1                            |
| TC05 | Duplicate slug                         | Negative    | 409         | conflict, "already taken"                                |
| TC06 | Reserved slug                          | Negative    | 400         | validation_failed, "Slug is reserved"                    |
| TC07 | GET /workspaces list                   | Positive    | 200         | workspaces[] non-empty                                   |
| TC08 | GET /workspaces/{id}                   | Positive    | 200         | id, slug, name, owner*user*id                            |
| TC09 | GET /workspaces/{bad-id}               | Negative    | 404         | error response                                           |
| TC10 | Name trimmed (leading/trailing spaces) | Positive    | 201         | name trimmed, not collapsed                              |
| TC11 | Name 1 char accepted                   | Boundary    | 201         | id, slug, name="X"                                       |
| TC12 | Name exactly 80 chars accepted         | Boundary    | 201         | id, slug                                                 |
| TC13 | Slug exactly 3 chars accepted          | Boundary    | 201         | slug="abc"                                               |
| TC14 | Slug exactly 40 chars accepted         | Boundary    | 201         | slug=40 chars                                            |
| TC15 | Name with accents (Bünkāï)             | Positive    | 201         | name preserved, slug as sent                             |
| TC16 | Extra fields ignored                   | Positive    | 201         | role/plan/owner_id silently dropped                      |
| TC17 | Missing name field                     | Negative    | 400         | validation_failed                                        |
| TC18 | Missing slug field                     | Negative    | 400         | validation_failed                                        |
| TC19 | Empty body `{}`                        | Negative    | 400         | validation_failed                                        |
| TC20 | Name exceeds 80 chars                  | Negative    | 400         | validation_failed, name max=80                           |
| TC21 | Slug starts with hyphen                | Negative    | 400         | validation_failed, regex violation                       |
| TC22 | Slug ends with hyphen                  | Negative    | 400         | validation_failed, regex violation                       |
| TC23 | Slug has uppercase                     | Negative    | 400         | validation_failed, regex violation                       |
| TC24 | Slug exceeds 40 chars                  | Negative    | 400         | validation_failed, slug max=40                           |
| TC25 | Malformed JSON body                    | Negative    | 400         | bad_request                                              |
| TC26 | Wrong Content-Type                     | Negative    | 400/415     | error response                                           |
| TC27 | Unauthenticated request                | Negative    | 401         | unauthorized                                             |
| TC28 | Workspace row in DB                    | Integration | N/A         | id, slug, name, owner*user*id                            |
| TC29 | workspace_members row                  | Integration | N/A         | role="owner", status="active"                            |
| TC30 | Concurrent same-slug creation          | Integration | 201 + 409   | Exactly 1 row persisted                                  |

Total: ***30 TCs*** (9 re-verify + 21 new/expanded)

---

## Risk Justification

***Score: 12 (HIGH)***

- Workspace creation is the ***tenant bootstrap*** — a broken endpoint blocks all downstream epics (BK-5, BK-6, EPIC-BK-2).
- Implementation uses a ***transactional RPC*** (`bunkai*bootstrap*workspace`) — failure modes at the DB layer must be verified.
- ***Discrepancies found*** between spec (comments) and implementation (route.ts): name max 80 not 60, slug is client-supplied not auto-derived, response shape differs. These mismatches increase risk of untested edge cases.
- The ***slug regex*** is strict (`^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`) — client-side slug generation must match. Any divergence produces 400 at submission time.
- No DELETE endpoint — test data cleanup requires DB access. Workspaces from this session will persist on staging.

## Gaps / Notes for Stage 2

1. ***TC02 recalibrated***: prior pass tested name "AB" without slug → 400 (missing field). With valid slug alongside, "AB" as name passes (min=1). Stage 2 should test both: `{name:"AB"}` → 400, and `{name:"AB", slug:"ab-valid"}` → 201.
2. ***Slug derivation is client-side***: there is no server-side sluggification. Test coverage for client-side `slugify()` lives in BK-4's UI E2E test (not in this API-only pass).
3. ***Reserved slug list***: 16 values confirmed from `route.ts`. Test `_next` and `auth` as additional reserved slugs.
4. ***Concurrent creation (TC30)***: requires parallel `curl` calls. May be flaky on staging depending on DB latency.
5. ***Transaction rollback (AC atomicity)***: cannot be directly tested without injecting DB failure. Observation-only: if workspace row exists without matching `workspace_members` row, rollback failed.
6. ***Event emission***: `workspace.created` event is emitted by the RPC. Verification requires realtime subscription — Stage 2 may skip if realtime client not available.
7. ***Custom field RESOLVED***: `acceptance*test*plan` → `customfield_10120`. ATP will be pushed via REST PUT after ADF conversion.

---
_Synced from Jira by sync-jira-issues_
