# Comments for BK-9

[View in Jira](https://jira.upexgalaxy.com/browse/BK-9)

---

### Ely - 5/19/2026, 9:05:48 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Tree view: `<ModuleTree />` with inline "+ New Module" affordances.

1. 

- Route: `app/api/v1/projects/[id]/modules/route.ts` (POST).
- Path computation: `parent ? parent.path + "/" + slug : "/" + slug`.

1. 

- Tables: `modules` with materialized `path` column.
- Index: GIN or btree on `path` for subtree queries.

1. 

- [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) (need a project).

1. 

- [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) (rename / soft-delete needs existing modules).
- [https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11](https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11) (move needs ≥2 modules to swap parents).
- EPIC-BK-3, [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4), [https://jira.upexgalaxy.com/browse/BK-7#icft=BK-7](https://jira.upexgalaxy.com/browse/BK-7#icft=BK-7), [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) (anchored entities need modules).

1. 

- [ ] All 5 AC scenarios pass on staging.
- [ ] Path materialization verified at DB level on 4-deep subtree.
- [ ] Soft-warning metadata present in 201 responses at depth 4.
- [ ] E2E test: create 4-deep tree via UI.

---

### Luis Eduardo Flores Villarroel - 6/1/2026, 10:36:46 PM

=== Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) ===

***Shift-Left pre-sprint QA refinement completed on 2026-06-02.***

Full ATP DRAFT (25 test outlines) is stored in the ***Acceptance Test Plan*** custom field on this story.

---

## Summary

***Story***: [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) — TMS-Module | Create modules with nested sub-modules
***Mode***: Shift-Left batch grooming
***Refined by***: QA — Shift-Left batch session
***Verdict***: Needs Improvement (story has gaps — see below)

---

## Phase 1 — Key Findings

- ***Complexity***: HIGH — 5–7 SP equivalent (depth state machine × 3 paths, tree integrity, RLS isolation, path materialization, position ordering)
- ***Blocks everything downstream***: Modules are prerequisite for US + ATC authoring — this story unblocks the core product workflow
- ***No write API yet***: `POST /api/v1/modules` does not exist; `Sidebar` is read-only; [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) must create both the endpoint and the UI trigger

---

## Phase 2 — Critical Contradiction

***Depth thresholds****: Business Rules field says "Creating at depth 4 or deeper returns a soft warning." AC4 says warning fires when creating at level 5 (parent at depth 4). Data-map confirms depth 5 = warn, depth 7 = block. ****ACs are authoritative — warning fires when resulting depth = 5 or 6.***

---

## Phase 3 — Refined Acceptance Criteria (key additions)

***PO Answers received 2026-06-02:***

- Warning fires when resulting depth = 5 OR 6 (parent at depth 4+). No warning at depths 1–4.
- Depth enforcement: app layer (early return) + DB constraint (safety net). Error code: `MODULE*DEPTH*EXCEEDED`.
- Description: optional, max 500 chars, Markdown stored, renders in tree view below module name — 3-line truncate + "more" expand. 501+ chars rejected.

***New scenarios added:***

- Scenario E1: Accept name = 80 chars (max boundary)
- Scenario E2: Reject name = 81 chars
- Scenario E3: Reject whitespace-only name
- Scenario E4: Reject viewer-role creation (HTTP 403)
- Scenario E5: Reject cross-project parent*module*id
- Scenario E6: Verify position = last sibling + 1

---

## Phase 4 — Test Coverage Estimate (25 outlines)

| Type  | Count  |
| --- | --- |
| ------ | ------- |
| Positive  | 6  |
| Negative  | 8  |
| Boundary  | 4  |
| Integration  | 4  |
| API  | 3  |
| ***Total****  | ****25***  |

---

## Open Questions for Dev (non-blocking for PO)

1. Implementation pattern: REST `POST /api/v1/modules` or Server Action / Supabase RPC?
2. Position assignment strategy on concurrent sibling creates?
3. Does `POST /api/v1/modules` support `Idempotency-Key` header?
4. Does module creation write to `activity_log`?
5. Does Supabase Realtime broadcast on `modules` INSERT?
6. Exact error message text for AC3 (min name) and AC5 (depth exceeded)?

---

## Story Quality Assessment

***Verdict***: Needs Improvement

- Missing AC: 80-char name upper boundary
- Missing AC: viewer-role authorization gate
- Missing AC: description field (now resolved by PO)
- ACs use paraphrased error messages — exact text still open for AC3 and AC5
- Implementation pattern unspecified — blocks integration test strategy

---

## Risks

| Risk  | Likelihood  | Impact  |
| --- | --- | --- |
| ------ | ----------- | -------- |
| Depth threshold built at wrong level (fires at 4 instead of 5)  | Medium  | High  |
| `path` column not correctly materialized after nested create  | Medium  | High  |
| Module creation not RLS-scoped (cross-workspace access)  | Low  | Critical  |
| Position collision under concurrent creates  | Low  | Medium  |

---

**Full shift-left-refinement.md stored in the Acceptance Test Plan field. Full analysis available in** `.context/PBI/EPIC-BK-7-project-module-hierarchy/stories/STORY-BK-9-.../shift-left-refinement.md`

---

### Luis Eduardo Flores Villarroel - 6/1/2026, 10:51:18 PM

@@Ely está listo el shift-left de esta US, saludos.

---

### Ely - 6/4/2026, 3:19:21 AM

## Ready for QA — BK-9 deployed to staging

***Staging:*** https://staging-upexbunkai.vercel.app
***PR:*** #8 (merged) https://github.com/upex-galaxy/upex-bunkai-tms/pull/8

### What shipped

- POST /api/v1/projects/{id}/modules (project id = UUID, cookie-session auth). Create modules + nest sub-modules.
- Project view: "New Module" (root) + per-node "Add sub-module", create form (name + live slug preview + optional description), module breadcrumb (display names, e.g. Payment / Refunds) on selection.
- New nullable column modules.description (Markdown stored raw, plain render for now; rich editor arrives with BK-16).

### As-built contract (test against THIS — house error code + granular details.reason)

- Success: 201 { module: { id, project*id, parent*module*id, path, name, position, description, created*at }, warning? }. The warning string is present only when resulting depth >= 5 (non-blocking).
- Name shorter than 2 / longer than 80 / no alphanumeric: 422, details.reason name*too*short | name*too*long | name*no*alphanumeric. (Min is 2, not 3.)
- Description over 500 chars: 422, details.reason description*too*long.
- Resulting depth over 6: 422, details.reason depth_exceeded (blocked).
- Duplicate sibling name under same parent: 409, details.reason module*slug*duplicate.
- Parent not in this project: 422, details.reason parent_invalid.
- Non-member / viewer role: 403, details.reason not*a*member. (Viewers also do not see the create controls in the UI.)
- Bad UUID or invalid JSON: 400. Unauthenticated: 401.

### Test focus

- Depth boundaries: create at depth 5 and 6 (created + warning), depth 7 (blocked).
- Name boundaries: 2 chars accepted, 1 char rejected, 81 chars rejected, whitespace-only rejected.
- Cross-workspace: user of WS-A cannot create in a WS-B project.
- Breadcrumb reads parent display names (Payment / Refunds), not slugs.
- Slug auto-derived per parent, unique; duplicate sibling name → 409.

### data-testids

create-module-form, create-module-name, create-module-slug-preview, create-module-description, create-module-submit, create-module-cancel, create-module-modal, create-module-error, module-new-root, module-add-sub-{id}, module-row-{id}, module-breadcrumb.

### Out of scope

Rename / move / delete (BK-10, BK-11), bulk import, drag-drop reorder, per-module permissions, rich Markdown editor (BK-16).

---

### Andrés Daniel Cumare Morales - 6/6/2026, 7:06:14 AM

ATP posted — see sprint testing session BK-9 2026-06-06

---

### Andrés Daniel Cumare Morales - 6/6/2026, 7:07:37 AM

## 🧪 Acceptance Test Plan (ATP) — BK-9

Story: TMS-Module | Create modules with nested sub-modules
Environment: staging | Date: 2026-06-06 | Modality: jira-native | shift-left-reviewed ✓

### Scope

- API: POST /api/v1/projects/{id}/modules
- UI: Create Module form + Sidebar affordances
- DB: path materialization, depth constraint CHECK, UNIQUE (project_id, path)

### Test Cases (25)

| ***TC#**** | ****Title**** | ****Type**** | ****Expected*** |
| --- | --- | --- | --- |
| TC-01 | Create root module | Positive | 201, path=slug(name), position=0 |
| TC-02 | Create sub-module depth 2 | Positive | 201, path=parent/slug, parent*module*id set |
| TC-03 | Create at depth 3 | Positive | 201, no warning |
| TC-04 | Create at depth 4 | Positive | 201, NO warning (threshold>=5) |
| TC-05 | Create at depth 5 — warning | Positive+Integration | 201 + warning string present |
| TC-06 | Create at depth 6 — warning | Positive+Integration | 201 + warning string present |
| TC-07 | Attempt depth 7 — blocked | Negative | 422, reason=depth_exceeded |
| TC-08 | Name = 2 chars (min boundary) | Boundary | 201 |
| TC-09 | Name = 1 char (below min) | Boundary | 422, reason=name*too*short |
| TC-10 | Name = 80 chars (max boundary) | Boundary | 201 |
| TC-11 | Name = 81 chars (above max) | Boundary | 422, reason=name*too*long |
| TC-12 | Whitespace-only name | Negative | 422, reason=name*too*short (after trim) |
| TC-13 | No-alphanumeric name | Negative | 422, reason=name*no*alphanumeric |
| TC-14 | Description = 500 chars (max) | Boundary | 201, description stored |
| TC-15 | Description = 501 chars | Boundary | 422, reason=description*too*long |
| TC-16 | Duplicate sibling name | Negative | 409, reason=module*slug*duplicate |
| TC-17 | Cross-project parent*module*id | Negative | 422, reason=parent_invalid |
| TC-18 | Non-existent parent UUID | Negative | 422, reason=parent_invalid |
| TC-19 | Unauthenticated request | Negative | 401 |
| TC-20 | Invalid JSON body | Negative | 400 |
| TC-21 | Non-UUID project id | Negative | 400 |
| TC-22 | Path materialization in DB | Integration | DB: path segments match depth |
| TC-23 | Slug auto-derived from name | Integration | path segment = slugify(name) |
| TC-24 | Warning payload is string | API contract | response.warning is string, not boolean |
| TC-25 | Position = last sibling + 1 | Integration | position increments correctly |

### Risk Areas

- Depth threshold OFF-BY-ONE — TC-04 (no warn at 4) and TC-05 (warn at 5) are critical
- RLS cross-workspace isolation
- Warning string type (TC-24)
- Client-side validation gap: form submits 1-char name (no client-side min check)

---

### Andrés Daniel Cumare Morales - 6/6/2026, 7:28:46 AM

## 🧪 Acceptance Test Results (ATR) — BK-9

Story: TMS-Module | Create modules with nested sub-modules

Environment: staging | Date: 2026-06-06 | Verdict: ✅ PASSED WITH ISSUES

All 25 functional TCs PASS. 2 UX bugs + 1 improvement filed.

### Test Results (25/25 PASS)

TC-01 ✓ Root module → 201, path materialized, position=0

TC-02 ✓ Sub-module depth 2 → 201, path=login/oauth

TC-03 ✓ Depth 3 → 201, no warning

TC-04 ✓ Depth 4 → 201, NO warning (confirmed — threshold is depth≥5)

TC-05 ✓ Depth 5 → 201 + warning string

TC-06 ✓ Depth 6 → 201 + warning string

TC-07 ✓ Depth 7 → 422 depth_exceeded

TC-08 ✓ Name 2-char min boundary → 201

TC-09 ✓ Name 1-char → 422 name*too*short

TC-10 ✓ Name 80-char max boundary → 201

TC-11 ✓ Name 81-char → 422 name*too*long

TC-12 ✓ Whitespace-only → 422 name*too*short

TC-13 ✓ No-alphanumeric (---) → 422 name*no*alphanumeric

TC-14 ✓ Description 500-char max → 201

TC-15 ✓ Description 501-char → 422 description*too*long

TC-16 ✓ Duplicate sibling → 409 module*slug*duplicate

TC-17 ✓ Cross-project parent → 422 parent_invalid

TC-18 ✓ Non-existent parent UUID → 422 parent_invalid

TC-19 ✓ Unauthenticated → 401

TC-20 ✓ Invalid JSON → 400 bad_request

TC-21 ✓ Non-UUID project ID → 400 bad_request

TC-22 ✓ DB: 6-level path chain verified (login/oauth/google/callback/token/refresh/session)

TC-23 ✓ Slug auto-derived: 'Payment & Billing' → payment-billing

TC-24 ✓ Warning payload is string (not boolean)

TC-25 ✓ Position increments correctly: sibling A=1, B=2

### UI Tests (Playwright, staging, headless Chromium)

UI-01 ✓ module-new-root button visible for authenticated member

UI-02 ✓ Slug preview updates live in create form

UI-03 ✗ BUG: Submit button enabled for 1-char name → filed as BK-68

UI-04 ✓ Success toast 'Module created' fires for depth 1-4 modules

UI-05 ✓ 12 'Add sub-module' affordances visible in module tree

UI-06 ✓ XSS: <script> module name rendered as literal text (no execution)

### Bugs Filed

BK-67 [MEDIUM] Warning toast suppresses success confirmation at depth≥5

BK-68 [LOW] Create form allows 1-char submit — no client-side min-length gate

BK-69 [IMPROVEMENT] Module name stores raw HTML; description IS sanitized — inconsistency with AC edge case

### Notable (non-bug) Findings

• Dev checklist referenced 'warning at depth 4' — code correctly implements depth≥5 (checklist error only)

• Position collision on concurrent siblings: documented as known MVP limitation

• Idempotency-Key: not supported by module endpoint (shift-left open question confirmed)

---

### Andrés Daniel Cumare Morales - 6/14/2026, 4:52:50 PM

## QA Testing Complete - BK-9 (Retest Close-Out)

***Environment******:*** Staging
***Result******:*** PASSED (25/25 TCs) — all linked bugs verified & closed

### Linked Bugs Resolved

- ***BK-67*** [Closed]: Success + deep-nesting warning toasts now both fire at depth>=5; depth 1-4 unaffected.
- ***BK-68*** [Closed]: Create-module form now blocks 1-char names client-side ("Name must be at least 2 characters."), 2+ char names unaffected.
- ***BK-69*** [Closed]: Module name with HTML tags now sanitized (stripped) at storage; UI-06 XSS-safe rendering still holds.

All retest regression checks passed. Story ready for QA Approved.

***Artifacts******:*** ATP/ATR posted 2026-06-06; retest verifications on BK-67/BK-68/BK-69.

---


_Synced from Jira by sync-jira-issues_
