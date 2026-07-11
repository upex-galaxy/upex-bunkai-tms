# BK-14 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-14)

# BK-14 — Acceptance Test Plan (ATP)

***Strategy******:*** Balanced (API depth + UI breadth)
***Prior API automation******:*** 5 tests existing (all PASSED, 30 Jun)

## API Test Cases (8 new)

### API-01: Create with valid payload

- POST /api/v1/modules/{moduleId}/user-stories
- Body: `{ title: "Refund a paid order", description: "# Heading\n***bold***", external_id: "BK-42" }`
- Expect: 201, response contains user*story with id, title, module*id, external_id normalized
- Covers: AC1 (create), AC3 (Jira key link)

### API-02: Title too short rejected

- POST with title "Re" (2 chars)
- Expect: 422 validation_failed, message "at least 3 characters"
- Covers: AC2

### API-03: Title too long rejected

- POST with title of 201 characters
- Expect: 422 validation_failed, message "at most 200 characters"
- Covers: boundary beyond AC2

### API-04: Description too large rejected

- POST with description > 51200 bytes (50KB + 1)
- Expect: 422 validation_failed
- Covers: risk-beyond-AC (byte cap not in ACs)

### API-05: Malformed Jira key rejected

- POST with external_id "not a key"
- Expect: 422 validation_failed
- Covers: AC4

### API-06: Duplicate Jira key rejected

- POST two stories with external_id "BK-42" in same project
- Second POST: 409 conflict, "already linked"
- Covers: AC5

### API-07: Patch external_id immutable

- PATCH /api/v1/user-stories/{id} with different external_id
- First PATCH (no existing external*id): 200, sets external*id
- Second PATCH (existing non-null external_id): 409
- Covers: AC3 immutability rule (Ely's spec)

### API-08: Soft-delete + restore

- DELETE /api/v1/user-stories/{id} → 200
- GET /api/v1/user-stories/{id} → 200, deleted_at non-null
- GET /api/v1/modules/{moduleId}/user-stories → story NOT in default list
- Covers: AC6

### API-09: Cross-workspace isolation

- Attempt GET on story from another workspace
- Expect: 404 or 403 (RLS enforcement)
- Covers: risk-beyond-AC (security boundary)

## UI Test Cases (4 new)

### UI-01: Create story via form

- Navigate to module view
- Click "New User Story", fill title + Markdown description
- Submit → story appears in list, preview renders ***bold*** as bold
- Covers: AC1 (UX integration)

### UI-02: Short title shows inline error

- Fill title "Re", submit
- Expect: inline validation error "at least 3 characters"
- Covers: AC2 (UX)

### UI-03: Jira key visible on saved story

- Create story with external_id "BK-42"
- Expect: story row shows "BK-42" reference
- Covers: AC3 (UX)

### UI-04: Remove story disappears from list

- Click remove/archive action on a story
- Expect: story removed from list, toast or empty state shown
- Covers: AC6 (UX)

---
_Synced from Jira by sync-jira-issues_
