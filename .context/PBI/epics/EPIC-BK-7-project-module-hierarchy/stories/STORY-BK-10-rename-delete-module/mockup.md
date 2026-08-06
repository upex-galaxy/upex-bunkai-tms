# BK-10 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-10)

# Acceptance Test Plan — BK-10

***Story:*** TMS-Module | Rename and soft-delete a module
***Tester:*** Jorgelina Abdo
***Environment:*** Staging — https://staging-upexbunkai.vercel.app
***Date:*** 2026-06-07
***TMS Modality:*** jira-native
***Risk Level:*** HIGH
***Short-circuit:*** shift-left-reviewed (2026-06-01) — Phase 4 only

---

## Test Scope

| Type | Count | Focus |
|------|-------|-------|
| Positive | 7 | Happy path rename, leaf delete, cascade delete, listing exclusion |
| Negative | 8 | Validation errors, auth denied (viewer 403), 404/409 on bad IDs |
| Boundary | 4 | Name at exactly 2, 80, 1, 81 characters |
| Integration | 5 | 4-deep cascade transaction, rollback, listing/search filter, PAT auth |
| API | 4 | PATCH 200/422, DELETE 200/404 |
| ***Total**** | ****28**** | ****Risk: HIGH*** |

---

## API Contract (Confirmed)

***PATCH /api/v1/modules/{id}***

- 200: { module } — rename success, path rebuilt
- 400: bad UUID / malformed JSON
- 401: unauthenticated
- 403: viewer role denied
- 404: module not found or archived
- 409 module*slug*duplicate: sibling name collision
- 422 details.reason: name < 2 / empty / whitespace / > 80 chars

***DELETE /api/v1/modules/{id}***

- 200: { archived: { modules, user*stories, acceptance*criteria, atcs } }
- 403: viewer role denied
- 404: module not found
- 409 already_archived: module already soft-deleted

***Cascade targets:*** modules, user*stories, acceptance*criteria, atcs (tests/bugs deferred to Part 2)

---

## Role Matrix (Confirmed)

| Action | viewer | member | admin | owner |
|--------|--------|--------|-------|-------|
| Rename Module | 403 | allowed | allowed | allowed |
| Delete Module | 403 | allowed | allowed | allowed |

---

## Validation Rules (Confirmed)

| Condition | Error |
|-----------|-------|
| Empty / whitespace | "Module name is required." |
| < 2 chars | "Module name must be at least 2 characters." |
| > 80 chars | "Module name cannot exceed 80 characters." |
| Sibling name collision | HTTP 409 "A module with this name already exists in this location." |
| Navigate to archived URL | HTTP 404 "This module has been archived or does not exist." |

---

## Test Outlines

### POSITIVE (7)

***TC-P01*** Should rename module label in place successfully

- Type: Positive | Priority: Critical | Level: UI + API
- Preconditions: member role, existing module in project tree
- Steps: 1. Click pencil icon on module → 2. Clear name, type "Renamed Module" → 3. Confirm → 4. Verify label updated in tree → 5. Verify PATCH returns 200 { module }
- Expected: module name updated, breadcrumb reflects new name, no siblings with same name
- Test data: { name: "Renamed Module", role: "member" }

***TC-P02*** Should update both module name and description simultaneously

- Type: Positive | Priority: High | Level: UI + API
- Preconditions: member role, existing module
- Steps: 1. Open rename dialog → 2. Change name to "Updated Module" → 3. Change description to "New description" → 4. Confirm → 5. Verify PATCH 200 with updated fields
- Expected: both name and description updated in single PATCH call
- Test data: { name: "Updated Module", description: "New description" }

***TC-P03*** Should rebuild breadcrumb path after module rename

- Type: Positive | Priority: High | Level: UI
- Preconditions: member role, module with at least one child
- Steps: 1. Rename parent module → 2. Navigate to child module → 3. Verify breadcrumb shows new parent name
- Expected: breadcrumb correctly reflects renamed ancestor path
- Test data: { parentName: "Renamed Parent", role: "member" }

***TC-P04*** Should soft-delete a leaf module successfully

- Type: Positive | Priority: Critical | Level: UI + API
- Preconditions: member role, leaf module (no children) with linked user stories
- Steps: 1. Click trash icon on leaf module → 2. Confirm deletion → 3. Verify module disappears from active tree → 4. Verify DELETE returns 200 { archived: { modules: 1, user_stories: N, ... } }
- Expected: module archived, linked work archived, excluded from active tree
- Test data: { role: "member", moduleType: "leaf" }

***TC-P05*** Should cascade archive parent module with all child modules and linked work

- Type: Positive | Priority: Critical | Level: UI + API + Integration
- Preconditions: member role, parent module with 2-level subtree + linked user stories + ACs + ATCs
- Steps: 1. Delete parent module → 2. Verify response counts include all entity types → 3. Verify all child modules removed from tree → 4. Verify linked user stories excluded from listings
- Expected: all descendants archived atomically; response: { modules: N, user*stories: M, acceptance*criteria: K, atcs: J }
- Test data: { role: "member", subtreeDepth: 2 }

***TC-P06*** Should archive full 4-deep subtree atomically (Architect DoD)

- Type: Positive | Priority: Critical | Level: Integration
- Preconditions: member role, module tree 4 levels deep with mixed entities at each level
- Steps: 1. Delete root module of 4-deep tree → 2. Verify all 4 levels archived → 3. Verify all linked entities (user*stories, acceptance*criteria, atcs) archived → 4. Verify no active entities remain under deleted root
- Expected: atomic cascade across all 4 levels in single transaction; archived_at set on all rows
- Test data: { depth: 4, entitiesPerLevel: "mixed" }

***TC-P07*** Should exclude archived modules from active module tree listing

- Type: Positive | Priority: High | Level: UI + API
- Preconditions: at least one archived module exists in project
- Steps: 1. Load project module tree → 2. Verify archived module NOT visible in active tree → 3. Verify GET /api/v1/modules returns only non-archived modules by default
- Expected: archived modules excluded from all active listings; include_archived flag (if implemented) can re-include them
- Test data: { hasArchivedModule: true }

---

### NEGATIVE (8)

***TC-N01*** Should reject rename when module name is 1 character

- Type: Negative | Priority: High | Level: UI + API
- Preconditions: member role, existing module
- Steps: 1. Open rename dialog → 2. Enter "A" (1 char) → 3. Submit → 4. Verify 422 response with "Module name must be at least 2 characters."
- Expected: PATCH 422, error message "Module name must be at least 2 characters.", no DB change
- Test data: { name: "A", expectedStatus: 422 }

***TC-N02*** Should reject rename when module name is empty string

- Type: Negative | Priority: Critical | Level: UI + API
- Preconditions: member role, existing module
- Steps: 1. Open rename dialog → 2. Clear name completely → 3. Submit → 4. Verify 422 with "Module name is required."
- Expected: PATCH 422, "Module name is required.", no DB change
- Test data: { name: "", expectedStatus: 422 }

***TC-N03*** Should reject rename when module name is whitespace-only

- Type: Negative | Priority: High | Level: UI + API
- Preconditions: member role, existing module
- Steps: 1. Open rename dialog → 2. Enter "   " (spaces only) → 3. Submit → 4. Verify 422 with "Module name is required."
- Expected: PATCH 422, "Module name is required." (whitespace stripped), no DB change
- Test data: { name: "   ", expectedStatus: 422 }

***TC-N04*** Should reject rename when module name exceeds 80 characters

- Type: Negative | Priority: High | Level: UI + API
- Preconditions: member role, existing module
- Steps: 1. Open rename dialog → 2. Enter 81-char name → 3. Submit → 4. Verify 422 with "Module name cannot exceed 80 characters."
- Expected: PATCH 422, "Module name cannot exceed 80 characters.", no DB change
- Test data: { name: "A".repeat(81), expectedStatus: 422 }

***TC-N05*** Should deny rename to viewer role with HTTP 403

- Type: Negative | Priority: Critical | Level: API
- Preconditions: viewer role user, existing module
- Steps: 1. PATCH /api/v1/modules/{id} with viewer auth token → 2. Verify HTTP 403 response
- Expected: HTTP 403 forbidden, no rename performed
- Test data: { role: "viewer", expectedStatus: 403 }

***TC-N06*** Should deny delete to viewer role with HTTP 403

- Type: Negative | Priority: Critical | Level: API
- Preconditions: viewer role user, existing module
- Steps: 1. DELETE /api/v1/modules/{id} with viewer auth token → 2. Verify HTTP 403 response
- Expected: HTTP 403 forbidden, no archive performed
- Test data: { role: "viewer", expectedStatus: 403 }

***TC-N07*** Should return 404 when deleting non-existent module

- Type: Negative | Priority: High | Level: API
- Preconditions: valid auth, non-existent module UUID
- Steps: 1. DELETE /api/v1/modules/{non-existent-uuid} → 2. Verify HTTP 404 response
- Expected: HTTP 404, module not found error
- Test data: { id: "00000000-0000-0000-0000-000000000000", expectedStatus: 404 }

***TC-N08*** Should return 409 when deleting already-archived module

- Type: Negative | Priority: High | Level: API
- Preconditions: member role, previously archived module with known ID
- Steps: 1. DELETE /api/v1/modules/{already-archived-id} → 2. Verify HTTP 409 with "already_archived" error code
- Expected: HTTP 409 already_archived, idempotent behavior rejected
- Test data: { moduleState: "archived", expectedStatus: 409, errorCode: "already_archived" }

---

### BOUNDARY (4)

***TC-B01*** Should accept module name of exactly 2 characters

- Type: Boundary | Priority: High | Level: UI + API
- Steps: Enter name "AB" → submit → verify PATCH 200 success
- Expected: 200 OK, name saved as "AB"
- Test data: { name: "AB", expectedStatus: 200 }

***TC-B02*** Should reject module name of exactly 1 character

- Type: Boundary | Priority: High | Level: UI + API
- Steps: Enter name "A" → submit → verify PATCH 422
- Expected: 422 "Module name must be at least 2 characters."
- Test data: { name: "A", expectedStatus: 422 }

***TC-B03*** Should accept module name of exactly 80 characters

- Type: Boundary | Priority: High | Level: UI + API
- Steps: Enter 80-char name → submit → verify PATCH 200
- Expected: 200 OK, full 80-char name saved
- Test data: { name: "A".repeat(80), expectedStatus: 200 }

***TC-B04*** Should reject module name of exactly 81 characters

- Type: Boundary | Priority: High | Level: UI + API
- Steps: Enter 81-char name → submit → verify PATCH 422
- Expected: 422 "Module name cannot exceed 80 characters."
- Test data: { name: "A".repeat(81), expectedStatus: 422 }

---

### INTEGRATION (5)

***TC-I01*** Should rollback cascade transaction on partial DB failure

- Type: Integration | Priority: Critical | Level: API + DB
- Preconditions: requires DB-level test injection or forced partial failure scenario
- Steps: Simulate partial cascade failure mid-transaction → verify ALL rows reverted → verify no orphaned archived_at rows remain
- Expected: all-or-nothing transaction; no partial archive state
- Note: May require dev-assisted test environment or mock injection

***TC-I02*** Should exclude archived modules from ATC listing

- Type: Integration | Priority: High | Level: UI + API
- Steps: Archive parent module → navigate to ATC listing view → verify ATCs under archived module not shown in default listing
- Expected: archived ATCs excluded from default results (include_archived=false is default)

***TC-I03*** Should exclude archived modules from full-text search results

- Type: Integration | Priority: Medium | Level: API
- Steps: Archive a module → search for module name via global search → verify no results returned
- Expected: archived modules do not appear in search by default

***TC-I04*** Should rename module with PAT bearer authentication

- Type: Integration | Priority: Medium | Level: API
- Preconditions: valid PAT token with appropriate scope, existing module
- Steps: PATCH /api/v1/modules/{id} with Authorization: Bearer {PAT_TOKEN} → verify 200 success
- Expected: PAT auth works for rename; scope requirement TBD (open question)
- Note: PAT scope for this endpoint is an open question — skip if not testable

***TC-I05*** Should cascade archive all confirmed entity types

- Type: Integration | Priority: Critical | Level: API + DB
- Steps: Delete module with linked user*stories, acceptance*criteria, and atcs → verify response counts for each type → verify archived_at set on all entity rows
- Expected: response: { modules: N, user*stories: M, acceptance*criteria: K, atcs: J }; cascade does NOT include tests/bugs (deferred)

---

### API (4)

***TC-A01*** Should return HTTP 200 with module object on valid PATCH request

- Type: API | Priority: Critical | Level: API
- Steps: PATCH /api/v1/modules/{id} { name: "Valid Name" } with member auth → verify 200 { module }
- Expected: 200 OK, response body contains updated module object with new name and rebuilt path

***TC-A02*** Should return HTTP 422 with details.reason on invalid PATCH request

- Type: API | Priority: High | Level: API
- Steps: PATCH /api/v1/modules/{id} { name: "" } → verify 422 with details.reason in body
- Expected: 422, response contains { details: { reason: "Module name is required." } }

***TC-A03*** Should return HTTP 200 with archived counts on valid DELETE request

- Type: API | Priority: Critical | Level: API
- Steps: DELETE /api/v1/modules/{id} with member auth → verify 200 { archived: { modules, user*stories, acceptance*criteria, atcs } }
- Expected: 200 OK, response body contains per-table archived counts

***TC-A04*** Should return HTTP 404 when DELETE targets non-existent module

- Type: API | Priority: High | Level: API
- Steps: DELETE /api/v1/modules/{invalid-uuid} → verify 404 response
- Expected: 404 not found

---

## Open Questions (from shift-left, unresolved)

1. PAT scope required for PATCH/DELETE — what scope? (atc:write or new scope?)
2. include_archived flag — query param, RLS row filter, or header override?
3. Concurrent rename/delete behavior — last-write-wins or 409?
4. Description field max length on rename?

## Dependency

BK-9 (create module) must be deployed and modules must exist in staging before fixture setup.

---
_Synced from Jira by sync-jira-issues_
