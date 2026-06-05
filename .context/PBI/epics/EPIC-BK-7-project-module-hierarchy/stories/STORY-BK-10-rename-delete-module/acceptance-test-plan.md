# BK-10 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-10)

## ATP DRAFT — BK-10 | Module Rename & Soft-Delete

***Status:*** Shift-Left reviewed · 28 outlines (DRAFT) · Risk: HIGH · Refined 2026-06-01

***PO answers confirmed:*** min role = member+ (viewer → 403) · error messages specified · archived URL → 404 · sibling uniqueness → 409

| ***Type**** | ****Count**** | ****Focus*** |
| --- | --- | --- |
| Positive | 7 | Happy path rename, leaf delete, cascade delete, listing exclusion, breadcrumb |
| Negative | 8 | Name too short/long/empty/whitespace, viewer denied (403), 404 non-existent, 409 already-archived, sibling collision |
| Boundary | 4 | Name = 2 chars (min), 1 char (min−1), 80 chars (max), 81 chars (max+1) |
| Integration | 5 | 4-deep cascade transaction, rollback on failure, ATC listing filter, full-text search filter, PAT bearer auth |
| API | 4 | PATCH 200, PATCH 422, DELETE 200/204, DELETE 404 |
| ***Total**** | ****28**** | ****HIGH effort — cascade complexity + auth matrix + transaction state machine*** |

### Positive — 7 outlines

- Should update module tree label in place after valid rename
- Should update module description on rename when description field is changed
- Should update all breadcrumbs under renamed module immediately
- Should archive a leaf module with no subtree
- Should cascade archive parent + child module + linked UserStories + ACs + ATCs in single transaction
- Should cascade archive on 4-deep subtree atomically (architect DoD)
- Should exclude archived module and its subtree from default active tree listing

### Negative — 8 outlines

- Should reject rename when name is 1 character (below minimum) → 422 "Module name must be at least 2 characters."
- Should reject rename when name is empty string → 422 "Module name is required."
- Should reject rename when name is whitespace-only → 422 "Module name is required." (server trims)
- Should reject rename when name exceeds 80 characters → 422 "Module name cannot exceed 80 characters."
- Should deny rename to a Workspace viewer role → 403 "Insufficient permissions"
- Should deny delete to a Workspace viewer role → 403 "Insufficient permissions"
- Should return 404 when deleting a non-existent module id
- Should return 409 when deleting an already-archived module — no double-archive

### Boundary — 4 outlines

- Should accept rename when name is exactly 2 characters (min boundary) → 200
- Should reject rename when name is exactly 1 character (min boundary − 1) → 422
- Should accept rename when name is exactly 80 characters (max boundary) → 200
- Should reject rename when name is exactly 81 characters (max boundary + 1) → 422

### Integration — 5 outlines

- Should roll back cascade archive if SQL transaction fails partway through — all rows revert, 0 partial-archive state
- Should exclude archived ATCs from default ATC listing after cascade delete
- Should exclude archived ATCs from full-text search results (tsv filter)
- Should allow rename via PAT bearer token with sufficient scope
- Should validate cascade archive covers UserStories, ACs, ATCs, and all child Modules (zero orphans)

### API — 4 outlines

- PATCH /api/v1/modules/{id} → 200 + updated module object on valid rename
- PATCH /api/v1/modules/{id} → 422 VALIDATION_ERROR on name violation
- DELETE /api/v1/modules/{id} → 200/204 + cascade summary on soft-delete
- DELETE /api/v1/modules/{id} → 404 NOT_FOUND when id does not exist

***Note:**** **Parametrization tables, per-outline test-data JSON, numbered steps, and Faker recipes are deferred to /sprint-testing Stage 1 once the feature ships and reaches Ready For QA.*

---
_Synced from Jira by sync-jira-issues_
