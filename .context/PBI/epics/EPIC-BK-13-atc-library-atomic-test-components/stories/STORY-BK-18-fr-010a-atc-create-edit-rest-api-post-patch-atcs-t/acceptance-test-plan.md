# BK-18 — Acceptance Test Plan (QA)

> Jira field: `customfield_10120` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-18)

# ATC create + edit REST API (POST/PATCH /atcs, transactional steps + assertions)

***Jira Key:*** [BK-18](https://upexgalaxy67.atlassian.net/browse/BK-18)
***Epic:*** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
***Priority:*** Medium
***Story Points:*** -
***Status:*** Shift-Left QA

---

## User Story

********Source spec:**** FR-010a — ATC server surface (REST)

As an automation engineer or API consumer, I want a REST API to create and edit ATCs (Atomic Test Components) with their steps and assertions in a single transactional call, so that I can compose reusable test building blocks from CLI tools, scripts, and the UI client.

Implements ***FR-010a*** — server surface only. UI form is BK-19, downstream Test composition is EPIC-BK-5.

## Acceptance Criteria

```gherkin
Scenario: Create ATC with valid payload
Given an authenticated member of the workspace
And a User Story US-100 in module M-10 with acceptance criteria AC-1 and AC-2
When the user POSTs to /atcs with title "Login with valid email", module*id M-10, user*story*id US-100, acceptance*criterion_ids [AC-1], layer "UI", and 3 steps plus 2 assertions
Then the API returns 201 with the new ATC, its steps, and its assertions
And the slug is "{module-slug}/{atc-id-padded}"
And an atc.created event is emitted

Scenario: Reject ATC when acceptance criteria belong to a different user story
Given an authenticated member
And AC-9 belongs to user story US-200 (not US-100)
When the user POSTs /atcs with user*story*id US-100 and acceptance*criterion*ids [AC-9]
Then the API returns 422 with error code "ac*outside*user_story"
And no row is inserted in atcs, atc*steps, or atc*assertions

Scenario: Reject ATC when module is not in the user story's project subtree
Given a User Story US-100 belongs to project P-1
And module M-99 belongs to project P-2
When the user POSTs /atcs with user*story*id US-100 and module_id M-99
Then the API returns 422 with error code "module*outside*project_subtree"

Scenario: Step positions must be strictly increasing from 1
Given an authenticated member
When the user POSTs /atcs with steps positions [1, 3, 2]
Then the API returns 422 with error code "steps*position*invalid"
And the response body lists the offending positions

Scenario: PATCH /atcs/{id} updates fields and cascade-replaces steps and assertions atomically
Given an existing ATC at version 1 with 3 steps and 1 assertion
When the user PATCHes /atcs/{id} with a new title and a replacement steps array of 2 steps
Then the API returns 200 with version 2
And the old steps and assertions are deleted in the same transaction as the new inserts
And an atc.updated event is emitted with affected*test*ids
```

---

## QA Refinements (Shift-Left Analysis)

> Added 2026-05-27 by Shift-Left QA. Full ATP DRAFT lives in custom field 🧪 Acceptance Test Plan (ATP) and mirrored as a comment on this issue. This section captures the slices PO + Dev need before estimation.

### 🔍 Refined Acceptance Criteria — summary

***13 Gherkin scenarios produced*** (Happy 2 / Negative 7 / Boundary 2 / Integration 2). Key contract decisions:

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| 1 | ***Slug format***: `{module-slug}/atc-{id-first-8-chars}` (lowercase UUID prefix) | uuid prefix is deterministic (no sequence dependency), unique, and readable. 8 chars balances collision safety vs brevity. Matches architect recommendation on BK-2 comment. | Senior DEV |
| 2 | ***PATCH semantics***: Full-replace body (PUT-like), NOT partial merge. `ATCCreate` schema reused. Omitted fields are NOT preserved — they are cleared. | Existing `bunkai*save*atc` RPC replaces children wholesale (no diff). Partial merge would require field-level tracking across 4 tables with no existing infra. If client wants partial, they GET→modify→PATCH. | Senior DEV |
| 3 | ***Version conflict***: Optimistic locking via `If-Match: <version>` header. No version in body. 409 on mismatch. | Industry standard (RFC 7232). Prevents lost updates. The existing RPC unconditionally bumps version; the route handler checks the header before calling the RPC. | Senior DEV |
| 4 | ***Error codes***: Add `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid`, `layer*invalid`, `slug*collision` to `API*ERROR*CODES` map. Wrapped via `ApiError('validation*failed', 422, { code: 'ac*outside*user*story' })`. | The existing 422 flow in `withApiHandler` catches ZodError but NOT semantic validation errors. Semantic errors need explicit `ApiError` throws with domain-specific codes. | Senior QA |
| 5 | ***Auth***: `requireBearerToken` + `requireScope(ctx, 'atc:write')` on both endpoints. `atc:read` tokens are rejected with 403. | Established pattern from tokens routes. Consistent with existing scope model. | Senior QA |
| 6 | `bunkai*create*atc`*** RPC***: CREATE path needs a NEW RPC that returns the new `atc*id` (unlike `bunkai*save*atc` which is void). Signature: `bunkai*create*atc(p*project*id, p*module*id, p*user*story*id, p*title, p*layer, p*tags, p*steps, p*assertions, p*ac*ids) returns uuid`. | `bunkai*save*atc` takes `p*atc*id` (UPDATE only). INSERT needs a different signature — no pre-existing id, needs project*id for RLS + slug. Adding a `p*create*flag` parameter would create an ugly dual-path RPC. A dedicated RPC is cleaner. | Senior DEV |
| 7 | `affected*test*ids`*** (PATCH event)***: Query `test*steps` table joining `atc*id`. Empty array = event still fires (consumers filter by `affected*test*ids.length === 0` if they only care about dependency impact). | The SRS shows `used*in` field on ATC response → `test*steps` links. This is the canonical source. | Senior DEV |
| 8 | ***PATCH ****`user*story*id`**** mutability***: Immutable on PATCH. If client sends `user*story*id`, it is silently ignored (or 422 if different). ACs are bound to the ATC's original user story. | Re-assigning user*story*id would break AC validation (ACs belong to original US). Cascade re-validation is expensive and adds risk. The architect annotation confirms this. | Senior PO + Senior DEV |

### ⚠️ Edge Cases Identified

***14 edge cases catalogued*** (6 High, 5 Medium, 3 Low):

| Sev | Edge Case | Mitigation / Decision |
|-----|-----------|----------------------|
| 🔴 High | POST with invalid PAT (malformed, expired, revoked) | Auth middleware returns 401 `unauthorized` — already tested in tokens routes. |
| 🔴 High | POST with `atc:read` scope (insufficient) | `requireScope` returns 403 `forbidden` — established pattern. |
| 🔴 High | PATCH to non-existent ATC id | 404 `not_found` — same pattern as tokens. |
| 🔴 High | Concurrent PATCH — version conflict (two clients at version 1) | First wins (200 v2), second gets 409 `conflict`. |
| 🔴 High | Slug collision (same project, same slug) | DB UNIQUE `(project*id, slug)` constraint. INSERT raises unique violation → map to 409 `slug*collision`. |
| 🔴 High | POST with `module*id` belonging to different project than `user*story*id` | AC3 covers the positive case. Reject with 422 `module*outside*project*subtree`. |
| 🟡 Medium | POST with empty `steps[]` array | `ATCCreate` schema requires `minItems: 1`. Zod rejects → 422 `validation_failed`. |
| 🟡 Medium | POST with layer value outside enum `{UI, API, Unit}` | Zod enum rejects → 422 `validation_failed`. |
| 🟡 Medium | POST with 11 tags (exceeds max 10) | Zod `maxItems: 10` rejects → 422. |
| 🟡 Medium | PATCH with empty body (no fields changed) | ***Decision***: Accept empty PATCH as no-op → 200 with same version (no bump). RPC not called. | Senior DEV |
| 🟡 Medium | POST with `acceptance*criterion*ids` that are valid UUIDs but don't exist in DB | 422 `ac*outside*user_story` (same code — the query returns empty for non-existent IDs too). |
| 🟢 Low | Title with Unicode/emoji | Existing DB `text` type handles UTF-8. Zod string accepts it. No special handling needed. |
| 🟢 Low | Step content > 2KB | Zod `maxLength: 2048` on step content. |
| 🟢 Low | POST with `acceptance*criterion*ids: []` (empty array) | Zod `minItems: 1` rejects → 422. |

### 📋 Clarified Business Rules

- ***Slug uniqueness***: DB-level UNIQUE `(project*id, slug)`. On collision → 409 `slug*collision`. ATCs in different projects can share slugs.
- ***Version semantics***: Monotonically increasing integer, per-ATC. POST starts at 1, PATCH increments by 1 (unless no-op).
- ***Optimistic locking***: `If-Match: <current_version>` header on PATCH. Absent = skip version check (lenient mode for simple clients). Present & mismatch = 409. The existing RPC unconditionally bumps version — the route handler checks the header first.
- ***Transactional boundary****: One DB transaction per POST/PATCH. Cross-entity validation (AC→US, module→project) runs ****before*** the transaction opens (read-only queries). Steps/assertions INSERT happens inside the transaction. On any failure → rollback, zero rows written.
- ***Event emission***: `atc.created` fires on POST commit. `atc.updated` fires on PATCH commit with `affected*test*ids[]` populated via `test_steps` join. Events are fire-and-forget (after-commit hook). If the event bus is down, the API response is still 200/201 — the event is logged for replay.
- ***RLS***: All table operations go through existing RLS policies (`authenticated` + workspace membership). The RPCs are `security invoker` so RLS evaluates as the API caller.
- ***idempotency***: Not required for MVP. POSTs are not idempotent by nature (each creates a new ATC). PATCH is idempotent (same payload = same result). If idempotency is needed later, add `Idempotency-Key` header — existing `IdempotencyKeySchema` in the codebase covers this.
- ***Soft-delete***: OUT of scope for BK-18. DELETE endpoint will be BK-? (future Story). Status field exists in schema but is not touched by POST/PATCH.
- `used*in`*** field in response***: OUT of scope for BK-18. The GET endpoint (BK-? future) will expand it. POST/PATCH responses return the ATC object without `used*in`.

### ❓ Open Questions for PO / Dev / Design

***For PO (3):***

1. ***Resend / duplicate slug handling****: If slug collision on POST (unlikely but possible with UUID-based slugs), should we auto-retry with a suffix or return 409 for client to rename? ****Decision (Senior PO)***: Return 409 `slug*collision` — client must pick a different `module*id` or the ATC title will produce a different slug. Auto-retry masks the collision and confuses consumers.
2. ***Event consumers****: Who consumes `atc.created` / `atc.updated` in MVP? Are there any downstream systems (audit log, webhook, Analytics) that depend on the event shape NOW vs later? ****Decision (Senior PO)***: MVP consumers = BK-20 (search index), BK-21 (PATCH propagation). Both are in Wave 2. Events can be logged to `event_log` table for now; no external webhook in MVP.
3. ***Scope naming****: Confirm scope name `atc:write` covers both POST and PATCH? Or need separate `atc:create` and `atc:update`? ****Decision (Senior PO)***: Single `atc:write` for both. Granular scopes can be split later if audit requirements demand it — changing from coarse→fine is backward-compatible; the reverse is not.

***For Dev (4):***

1. `bunkai*create*atc`*** RPC signature****: Confirm output: `RETURNS uuid` (the new atc*id)? Input includes `p*project*id` for slug computation + RLS? ****Decision (Senior DEV)***: Yes — `returns uuid`, takes `p*project*id uuid` as first param. Slug computed as `lower(replace(p*title, ' ', '-')) || '/atc-' || substr(gen*random*uuid()::text, 1, 8)` — deterministic from inputs, no sequence dependency. RLS works because `project_id` is in the row.
2. ***Slug computation — pure SQL or app layer?****: The existing RPC is PL/pgSQL. Slug computation should live in the RPC (same transaction, no round-trip). Confirm? ****Decision (Senior DEV)***: Pure PL/pgSQL inside `bunkai*create*atc`. App layer sends title, RPC derives slug. Immutable after create.
3. ***Error code registration****: Add new codes to `API*ERROR*CODES` map or define them inline in route handlers? ****Decision (Senior DEV)***: Add to `API*ERROR*CODES` map for consistency. The map is the canonical registry that OpenAPI spec generation reads.
4. `affected*test*ids`*** query****: Does `test*steps` exist in the schema yet (it's part of EPIC-BK-5 Tests)? Or should the event payload skip this field until that schema migration lands? ****Decision (Senior DEV)***: `test*steps` does NOT exist yet. Emit `affected*test*ids: []` (empty) in MVP. When EPIC-BK-5 adds the table, update the event emission. The field name in the event contract stays the same — consumers handle empty arrays.

***For Design (0):***

No design questions — this is an API-only Story (no UI). The UI counterpart is BK-19.

### 📐 Scope refinement — IN vs OUT of BK-18

***✅ IN BK-18:***

- `POST /api/v1/atcs` endpoint (NEW)
- `PATCH /api/v1/atcs/{id}` endpoint (NEW)
- `bunkai*create*atc` RPC (NEW — returns uuid)
- Cross-entity validation: AC→US belong, module→project subtree
- Step position validation (strictly increasing from 1)
- Bearer auth with `atc:write` scope
- Optimistic locking via `If-Match` header on PATCH
- Slug computation (immutable)
- Version bump on PATCH
- Event emission: `atc.created` / `atc.updated` (fire-and-forget, logged)
- New error codes in `API*ERROR*CODES` map
- OpenAPI spec registration for both endpoints
- Integration tests for transactional rollback + auth gating + cross-entity rules

***🚫 OUT (delegated to other Stories):***

- GET /atcs, GET /atcs/{id} → BK-20 (search/browse)
- DELETE /atcs/{id} → BK-? (future, soft-delete)
- POST /atcs/{id}/duplicate → BK-23
- UI form → BK-19
- `used_in` response expansion → BK-20 or BK-5
- Idempotency-Key support → future (when POST idempotency needed)
- Webhook delivery of events → future
- Granular scopes (`atc:create` vs `atc:update`) → future
- `affected*test*ids` with real data → EPIC-BK-5 (test_steps table)

---

***See custom field 🧪 Acceptance Test Plan (ATP) + Shift-Left comment for the complete refinement (******~******13 test outlines, full Gherkin scenarios, AC↔code reconciliation per divergence).***

---

## Refined Acceptance Criteria (Shift-Left QA pass — 2026-05-27)

> Refined and consolidated by QA during the pre-sprint Shift-Left review. Reconciliation reasoning (AC ↔ code divergences, decisions, edge cases, scope cuts) is captured in the ***🧪 Acceptance Test Plan (ATP)**** field and the ****Shift-Left Refinement*** comment on this issue.

```gherkin
Background:
  Given the workspace has a project P-1 with module M-10 and user story US-100
    And US-100 has acceptance criteria AC-1 and AC-2
    And the caller has a valid Personal Access Token with scope "atc:write"
    And module M-10 is a descendant of P-1's root module

# ---- Happy path ----

Scenario: Successful ATC creation with full payload
  Given a valid PAT with "atc:write" scope
  When the user POSTs /api/v1/atcs with body:
    | title                      | "Login with valid email"           |
    | module_id                  | M-10                               |
    | user*story*id              | US-100                             |
    | acceptance*criterion*ids   | ["AC-1"]                           |
    | layer                      | "UI"                               |
    | tags                       | ["smoke", "login"]                 |
    | steps[0] (position content)| 1, "Navigate to login page"        |
    | steps[1] (position content)| 2, "Enter email test@example.com"  |
    | steps[2] (position content)| 3, "Click submit"                  |
    | assertions[0] (pos content)| 1, "Response time < 2s"            |
  Then the API returns 201
    And the response body has an "id" field (uuid)
    And the response body has "slug" matching regex /^[a-z0-9-]+\/atc-[a-z0-9]{8}$/
    And the response body has "version" = 1
    And the response body has 3 steps with positions 1, 2, 3
    And the response body has 1 assertion with position 1
    And a row exists in atcs matching the returned id
    And 3 rows exist in atc*steps with the returned atc*id
    And 1 row exists in atc*assertions with the returned atc*id
    And 1 row exists in atc*acceptance*criteria with the returned atc_id and AC-1
    And an "atc.created" event is logged

Scenario: Successful PATCH update with cascade-replace
  Given an existing ATC with id ATC-42, version 1, 3 steps (positions 1,2,3), 2 assertions (positions 1,2)
  When the user PATCHes /api/v1/atcs/ATC-42 with body:
    | title    | "Login with valid email (updated)" |
    | steps[0] | position=1, content="New step 1"   |
    | steps[1] | position=2, content="New step 2"   |
    | tags     | ["smoke", "login", "updated"]      |
  Then the API returns 200
    And the response body has "version" = 2
    And the response body has "title" = "Login with valid email (updated)"
    And the response body has exactly 2 steps (old 3 are deleted)
    And the response body has 0 assertions (old 2 are deleted)
    And the DB has exactly 2 rows in atc_steps for ATC-42
    And the DB has 0 rows in atc_assertions for ATC-42
    And an "atc.updated" event is logged with affected*test*ids: []

# ---- Negative path ----

Scenario: Unauthenticated request rejected
  Given no Authorization header
  When the user POSTs /api/v1/atcs with valid payload
  Then the API returns 401
    And the error code is "unauthorized"

Scenario: Insufficient scope rejected
  Given a valid PAT with scope "atc:read" (no "atc:write")
  When the user POSTs /api/v1/atcs with valid payload
  Then the API returns 403
    And the error code is "forbidden"

Scenario: PATCH to non-existent ATC
  When the user PATCHes /api/v1/atcs/00000000-0000-0000-0000-000000000000
  Then the API returns 404
    And the error code is "not_found"

Scenario: AC belongs to different user story
  Given AC-9 belongs to US-200 (not US-100)
  When the user POSTs /api/v1/atcs with user*story*id=US-100 and acceptance*criterion*ids=["AC-9"]
  Then the API returns 422
    And the error code is "ac*outside*user_story"
    And no row is inserted in atcs, atc*steps, atc*assertions (transactional rollback)

Scenario: Module outside user story's project subtree
  Given US-100 belongs to project P-1
    And module M-99 belongs to project P-2 (different project)
  When the user POSTs /api/v1/atcs with user*story*id=US-100 and module_id=M-99
  Then the API returns 422
    And the error code is "module*outside*project_subtree"

Scenario: Step positions not strictly increasing from 1
  When the user POSTs /api/v1/atcs with steps positions [1, 3, 2]
  Then the API returns 422
    And the error code is "steps*position*invalid"
    And the response body lists the offending positions

Scenario: Step positions not starting at 1
  When the user POSTs /api/v1/atcs with steps positions [2, 3, 4]
  Then the API returns 422
    And the error code is "steps*position*invalid"

Scenario: Version conflict on concurrent PATCH
  Given ATC-42 is at version 1
  When two PATCH requests arrive with If-Match: "1"
  Then the first returns 200 with version 2
    And the second returns 409 with error code "conflict"
    And the conflict response includes the current version

# ---- Boundary / edge ----

Scenario: Title below minimum length
  Given an authenticated caller
  When the user POSTs /api/v1/atcs with title "AB" (2 characters)
  Then the API returns 422
    And the error code is "validation_failed"

Scenario: Empty steps array rejected
  Given an authenticated caller
  When the user POSTs /api/v1/atcs with steps: []
  Then the API returns 422
    And the error code is "validation_failed"

# ---- Integration ----

Scenario: Auth middleware integration — bearer token validation
  Given an invalid or expired PAT
  When the user POSTs /api/v1/atcs with valid payload
  Then the API returns 401
    And the error is raised BEFORE any DB query runs

Scenario: Transactional rollback on validation failure
  Given a POST that would pass Zod validation but fail cross-entity check (AC belongs to different US)
  When the user POSTs /api/v1/atcs
  Then the API returns 422
    And SELECT count(*) FROM atcs returns the same count as before the request
    And SELECT count(*) FROM atc_steps returns the same count as before
    And SELECT count(*) FROM atc_assertions returns the same count as before
```

********Markers used:**** all NEEDS PO/DEV CONFIRMATION items are explicitly resolved with Senior PO/DEV decisions inline in §Key Contract Decisions. The AC text above is final with those decisions applied.

---

***Copied from Refined AC by QA — Shift-Left pass 2026-05-27. PO ownership of this field returns after Estimation grooming; any further AC edits must go through PO.***

---

## Business Rules

- acceptance*criterion*ids[] must all belong to the supplied user*story*id (cross-entity check)
- module_id must equal the user story's module OR be a descendant module within the same project (subtree check)
- layer must be one of {UI, API, Unit} — enum constraint at DB and API level
- steps[] positions must be integers, strictly increasing, starting at 1
- tags[] max length is 10; title length 3..200 chars; step content max 2KB Markdown
- slug is computed once on create and is immutable across edits (renames do not change slug)
- version integer is monotonically increasing per ATC; PATCH increments by 1
- PATCH with no changes (empty body) = 200, no version bump, no event
- user*story*id is immutable on PATCH (silently ignored if provided)

---

## Scope

- POST /atcs endpoint with full body validation (title, module*id, user*story_id, AC ids, layer, steps[], assertions[], tags[])
- PATCH /atcs/{id} endpoint with full-replace semantics + cascade replace of steps/assertions
- Transactional insert/update of atcs + atc*steps + atc*assertions tables
- Slug computation "{module-slug}/atc-{id-first-8-chars}"
- Cross-entity validation (AC belongs to US, module in project subtree, layer enum, step positions)
- Bearer PAT auth with scope "atc:write"
- Optimistic locking via If-Match header on PATCH
- Event emission: atc.created on POST, atc.updated on PATCH (with affected*test*ids)
- OpenAPI spec entries for both endpoints with request/response schemas
- Unit + integration tests (cross-entity rules, transaction rollback on failure, auth gating)

---

## Workflow

A member calls POST /atcs with a fully-formed payload (title, module*id, user*story*id, AC ids, layer, steps, assertions, tags). The API layer validates the Zod schema first (synchronous, cheap), then resolves the PAT bearer token and checks atc:write scope. Cross-entity validation runs as read-only queries: ACs belong to US, module is in project subtree. Inside a single DB transaction, bunkai*create*atc inserts the atcs row, bulk-inserts atc*steps + atc*assertions, computes the slug, and returns the new id. On commit, the event bus fires atc.created with the full payload. PATCH /atcs/{id} follows the same path but: checks If-Match version guard, calls bunkai*save*atc (which updates header, delete-then-insert children, bumps version), and emits atc.updated with affected*test_ids.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## References

- [SRS API Contract — ATC paths](https://github.com/upexgalaxy67/upex-bunkai-tms/blob/main/.context/SRS/api-contracts.yaml#L268)
- [Architect Annotation — BK-2 comment](https://upexgalaxy67.atlassian.net/browse/BK-2?focusedCommentId=12473)

---

## Labels

`api`, `atc`, `backend`, `mvp`, `wave-2`

---

## Metadata

- ***Created:*** 5/19/2026
- ***Updated:*** 5/27/2026
- ***Reporter:*** Ely
- ***Assignee:*** Unassigned
- ***Labels:*** api, atc, backend, mvp, wave-2

---

**Synced from Jira by sync-jira-issues**
**Last sync: 2026-05-27**

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.124Z_
