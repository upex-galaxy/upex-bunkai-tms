# BK-27 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

# Acceptance Test Plan: BK-27 — TMS-Test Builder | Assemble a Test by chaining ATCs

********Status*****:*** In-Sprint ATP (Stage 1) — supersedes shift-left DRAFT
********Mode*********:***** Shift-left short-circuit — Phases 1-3 skipped, refined ACs validated unchanged
****Planned*********: 2026-06-15 | *********Modality*****:*** Jira-native
********Implementation****: REAL, merged to `staging` — PR #40 (`54749ba`), route `/projects/{slug}/tests/new`, `POST /api/v1/tests`

---

## Validation note (Phase 0.0)

No drift — 2026-06-06 refined ACs (AC1-AC4 + E1/E2) match the current Story. All 8 PO/Dev questions answered + implemented per the 2026-06-12 Ready-For-QA handoff. NEEDS PO/DEV CONFIRMATION flags resolved:

| Flag | Resolution |
| --- | --- |
| AC1.1 activity*log audit (Gap #4) | ***BUILT.*** Writer absorbed into `bunkai*create_test` RPC; row asserted per successful creation. Now a hard expectation (I2). |
| AC2.1 verbatim copy + server enforcement | `A Test must include at least one ATC.` Enforced via SQLSTATE 45120 -> `chain_empty` (422). |
| AC3 idempotency window/key | `Idempotency-Key` header, scope `(user_id, endpoint, key)`, 24h TTL. UI auto-generates per session; agents must supply. Wired in `POST /api/v1/tests`. |
| AC4.1 non-disclosure status/copy | 404 `not_found`, `One or more selected ATCs are not available in this workspace.` Identical for foreign/archived/nonexistent (SQLSTATE 45122), RLS-collapsed via `.maybeSingle()`. |
| Gap #1 "published ATC" | Dropped. Selectable = any non-archived ATC in the active workspace's project tree. |
| Gap #2 max chain length | No server cap. UI soft cap 100 (`Chains are limited to 100 ATCs in the UI.`). |
| E1 viewer 403 | RPC step 1 (`bunkai*assert*actor*can*write_workspace`) raises 42501 -> 403 for any role below `member`. |
| E2 binding instant | Workspace active ***at save-commit time*** (not form-open); server stamps `tests.workspace_id` from session/body at submit. |

---

## Carried-forward Business Rules

- Idempotency scoped `(user_id, endpoint, key)`, 24h TTL; same key+payload -> replay; same key+different payload -> 409.
- Title: 1-200 chars, trimmed, whitespace-only rejected.
- Duplicates allowed in chain (`test*steps` has `unique(test*id, position)`, not `unique(test*id, atc*id)`).
- `activity*log` row written inside the `bunkai*create*test` transaction; actor = `created*by`.
- Cross-workspace ATC ref -> uniform 404 `not_found` (INV-3), byte-identical for foreign/archived/nonexistent.
- `test*steps.atc*id` is `ON DELETE RESTRICT`.

---

## Phase 4 — Test Design

### Coverage estimate (FINAL)

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 3 | 3-ATC chain order, duplicate-ATC chain, single-ATC minimum. |
| Negative | 5 | Empty chain (API), foreign-workspace ATC, nonexistent ATC id, viewer via API, archived ATC. |
| Boundary | 4 | Title 200/201 chars, whitespace-only title, title trim, missing `Idempotency-Key`. |
| Integration | 4 | RLS cross-workspace SELECT isolation, activity_log row, UI/headless parity, E2 binding instant. |
| API | 3 | Double-submit dedupe (UI), agent retry same key (replay), key-reuse-different-payload 409 / missing `workspace_id` 422. |
| ***Total**** | ****19*** |  |

***Reconciliation****: 10 base scenarios (AC1:2, AC2:3, AC3:2, AC4:1, E1/E2:2) + 9 derived variants (non-disclosure parity x2, missing-key, title-trim, UI/headless parity, key-reuse-409, workspace_id-422) = ****19****, matching the DRAFT's own table + 2026-06-12 "19 ATP TCs"/`compliance-matrix.md`. The "25 (5/6/7/7)" figure in `story.md`'s shift-left summary is a stale unreconciled duplicate — ****19 is authoritative***.

### Parametrization

***Group A — Title boundary*** (covers Scenarios 2.2/2.3 + trim edge case, B1-B3 below):

| Title | Expected |
| --- | --- |
| 200x"A" | 201 Created |
| 201x"A" | 422 `validation_failed`, `Title must be 200 characters or fewer.` |
| `"   "` (whitespace) | 422, title-required after trim |
| `"  Add to Cart  "` | 201, stored as `"Add to Cart"` (trimmed) |

***Group B — Non-disclosure 404 parity*** (N3-N5, INV-3):

| ATC reference | Expected |
| --- | --- |
| Foreign-workspace ATC | 404 `not_found`, `One or more selected ATCs are not available in this workspace.` |
| Nonexistent ATC id (random UUID) | byte-identical to above |
| Archived ATC, same workspace | byte-identical to above |

***Group C — Role gate*** (E1): `viewer` -> 403 `forbidden` (N6, only row executed); `member`/`admin`/`owner` -> 201 (covered by P1, no behavioral diff in RPC's `role in ('member','admin','owner')`).

---

### Outlines (19)

#### P1 — Should create a Test with three ATCs in the selected order

- AC1/1.1 | Positive | High | E2E+API | Not parametrized
- ***Pre***: member+ of `qa-bk8-1780533325`, >=3 selectable ATCs (ATC-1/2/3).
- ***Steps***: 1) Open `/projects/{slug}/tests/new`, verify heading "New Test" + helper text. 2) Title `"Add to Cart from Empty State"`. 3) Select ATC-1, ATC-2, ATC-3 in order. 4) Save -> redirect/appears in Tests list with title. 5) Open Test -> chain shows ATC-1,2,3 in order.
- ***Expected***: 1 `tests` row (workspace=qa-bk8-1780533325, title as above, created*by=actor); 3 `test*steps` rows positions 1-2-3 -> ATC-1/2/3; 1 `activity_log` row (actor, "test created", target=Test, now()).
- ***Test data***: `{"title":"Add to Cart from Empty State","atc_ids":["<ATC-1>","<ATC-2>","<ATC-3>"]}`
- ***Post***: row persists as fixture for I3/I4.

#### P2 — Should persist a chain that references the same ATC twice

- AC1/1.2 | Positive (Edge) | High | E2E+API | Not parametrized
- ***Pre***: same as P1; ATC-1 available.
- ***Steps***: 1) Title `"Duplicate ATC Chain"`. 2) Chain `[ATC-1, ATC-2, ATC-1]`. 3) Save -> created, no de-dup warning. 4) Open -> chain shows ATC-1, ATC-2, ATC-1 (3 entries).
- ***Expected***: `test*steps` has 3 rows: pos1->ATC-1, pos2->ATC-2, pos3->ATC-1 (no `unique(test*id,atc_id)`).
- ***Test data***: `{"title":"Duplicate ATC Chain","atc_ids":["<ATC-1>","<ATC-2>","<ATC-1>"]}`
- ***Post***: `test*steps` count for this test*id == 3.

#### P3 — Should accept a single-ATC chain (minimum valid)

- Derived (chain >=1 boundary) | Positive | Medium | API | Not parametrized
- ***Pre***: member+, >=1 ATC.
- ***Steps***: `POST /api/v1/tests` `{"title":"Single ATC Test","atc*ids":["<ATC-1>"],"workspace*id":"<ws>"}` + `Idempotency-Key: p3-single-<uuid>` -> 201, body `{"test":{...}}` chain length 1.
- ***Expected***: 1 `tests` row, 1 `test_steps` row at position 1.
- ***Post***: none required.

#### N1 — Should block save when no ATC is selected (UI)

- AC2/2.1 | Negative | High | UI | Not parametrized
- ***Pre***: member+, "New Test" open, valid title, 0 ATCs.
- ***Steps***: 1) Title `"Add to Cart from Empty State"`, 0 ATCs. 2) Click Save -> blocked, message `A Test must include at least one ATC.`, form stays open.
- ***Expected***: no `tests` row (row count unchanged).
- ***Test data***: `{"title":"Add to Cart from Empty State","atc_ids":[]}`

#### N2 — Should re-validate empty chain server-side

- AC2/2.1 (server) | Negative | High | API | Not parametrized
- ***Pre***: member+ PAT, `atc:write`.
- ***Steps***: `POST /api/v1/tests` `{"title":"Add to Cart from Empty State","atc*ids":[],"workspace*id":"<ws>"}` + `Idempotency-Key: n2-empty-<uuid>` -> expect 422 `{"error":{"code":"chain_empty","message":"A Test must include at least one ATC."}}`.
- ***Expected***: SQLSTATE 45120 -> `chain_empty`/422; no `tests` row.
- > [!WARNING]
- > `TestCreateBodySchema.atc*ids` is `z.array(...).min(1)` — Zod likely rejects `[]` BEFORE the RPC, yielding `400 bad*request`/Zod-default rather than `422`/`chain_empty`. ***Stage 2******:****** confirm actual response*** and update expected result.

#### N3 — Should reject a chain referencing a foreign-workspace ATC without disclosing existence

- AC4/4.1 (Group B row 1) | Negative/Security | Critical | API+UI | Parametrized
- ***Pre***: member+ of `qa-bk8-1780533325`; ATC-X exists in `qa-bk8b-1780534540` (foreign).
- ***Steps***: `POST /api/v1/tests` `{"title":"Foreign ATC Test","atc*ids":["<ATC-X>"],"workspace*id":"bc75c0d4-6d92-4d3f-a92f-f41e4b1774fe"}` + `Idempotency-Key: n3-foreign-<uuid>` -> 404 `{"error":{"code":"not_found","message":"One or more selected ATCs are not available in this workspace."}}`, no id echoed.
- ***Expected***: SQLSTATE 45122 -> uniform 404; no `tests` row in qa-bk8-1780533325; body byte-identical to N4/N5.

#### N4 — Should reject a chain referencing a wholly-nonexistent ATC id (byte-identical to N3)

- AC4/4.1 parity (Group B row 2) | Negative/Security | Critical | API | Parametrized
- ***Pre***: member+ of qa-bk8-1780533325.
- ***Steps***: `POST /api/v1/tests` `{"title":"Nonexistent ATC Test","atc*ids":["00000000-0000-0000-0000-000000000000"],"workspace*id":"bc75c0d4-6d92-4d3f-a92f-f41e4b1774fe"}` + `Idempotency-Key: n4-nonexistent-<uuid>` -> 404, diff body vs N3 -> byte-identical.
- ***Expected***: proves RLS `.maybeSingle()` collapse, no app-level existence branch.

#### N5 — Should reject a chain referencing an archived ATC in the same workspace (byte-identical to N3/N4)

- AC4 parity, RLS `test*steps*insert` `a.archived_at is null` (Group B row 3) | Negative/Security | High | API | Parametrized
- ***Pre***: an ATC in qa-bk8-1780533325 with `archived_at IS NOT NULL` (seed/archive ATC-3).
- ***Steps***: `POST /api/v1/tests` `{"title":"Archived ATC Test","atc*ids":["<archived-ATC>"],"workspace*id":"bc75c0d4-6d92-4d3f-a92f-f41e4b1774fe"}` + `Idempotency-Key: n5-archived-<uuid>` -> 404, diff vs N3/N4 -> byte-identical.
- ***Expected***: archived ATCs filtered at RLS `test*steps*insert`, collapsing into same non-disclosure response.
- > [!NOTE]
- > Staging has 0 archived ATCs today — seed/archive 1 ATC before execution (Phase 5).

#### N6 — Should reject Test creation by a viewer via the headless API

- E1 (Group C, viewer row) | Negative/Security | High | API | Group C (only viewer row executed)
- ***Pre***: a `role='viewer'`, `status='active'` member of qa-bk8-1780533325, valid PAT.
- ***Steps***: `POST /api/v1/tests` as viewer, valid payload + `Idempotency-Key: n6-viewer-<uuid>` -> 403 `{"error":{"code":"forbidden","message":"You must be a member of this workspace with write access.","details":{"reason":"not*a*member"}}}`.
- ***Expected***: SQLSTATE 42501 -> 403; no `tests` row.
- > [!NOTE]
- > Staging reports all 72 workspaces single-member (owner-only) — provision a `viewer` member before execution (Phase 5).

#### B1 — Should accept a 200-character title and reject a 201-character title

- AC2/2.3 (Group A rows 1-2) | Boundary | Medium | API | Parametrized (Group A)
- ***Pre***: member+, >=1 ATC.
- ***Steps***: `POST /api/v1/tests` per Group A row 1 (200xA) + unique `Idempotency-Key` -> 201, `test.title` = 200-char string. Row 2 (201xA) -> 422 `{"error":{"code":"validation_failed","message":"Title must be 200 characters or fewer."}}`.
- ***Expected***: 200-char persists verbatim; 201-char rejected pre-DB-write.
- > [!NOTE]
- > Stage 2: confirm 422 message matches `lib/tests/errors.ts` 45121 copy vs Zod-default (Zod runs first).

#### B2 — Should reject an empty/whitespace-only title

- AC2/2.2 (Group A row 3) | Boundary/Negative | High | API+UI | Parametrized (Group A)
- ***Pre***: member+, >=1 ATC, title `"   "`.
- ***Steps***: UI — enter `"   "`, select ATC, Save -> validation error, form stays open. API — `POST /api/v1/tests` `{"title":"   ","atc*ids":["<ATC-1>"],"workspace*id":"<ws>"}` + `Idempotency-Key: b2-whitespace-<uuid>` -> 422, message indicates title required (expect `Title is required.` post-trim per Zod `.trim().min(1)`).
- ***Expected***: no `tests` row either path. Stage 2: confirm exact verbatim message.

#### B3 — Should trim leading/trailing whitespace around a valid title

- Derived edge case, resolved by `z.string().trim()` (Group A row 4) | Boundary | Medium | API | Parametrized (Group A)
- ***Pre***: member+, >=1 ATC.
- ***Steps***: `POST /api/v1/tests` `{"title":"  Add to Cart  ","atc*ids":["<ATC-1>"],"workspace*id":"<ws>"}` + `Idempotency-Key: b3-trim-<uuid>` -> 201, `test.title` == `"Add to Cart"` (trimmed) in response and DB.
- ***Expected***: confirms `z.string().trim()` + DB check `title = btrim(title)`.

#### B4 — Should reject `POST /api/v1/tests` when `Idempotency-Key` header is missing

- Derived (`lib/api/idempotency.ts` readKey, header REQUIRED) | Boundary | Medium | API | Not parametrized
- ***Pre***: member+ PAT, valid payload.
- ***Steps****: `POST /api/v1/tests` valid body, ****omit*** `Idempotency-Key` -> 400 `{"error":{"code":"idempotency*key*required","message":"Missing idempotency-key header."}}`.
- ***Expected***: `readKey()` throws before RPC; no `tests` row.

#### I1 — Should isolate Tests across workspaces (RLS SELECT)

- Integration, `tests*select*workspace_member`, INV-3 | Integration | Critical | Integration | Not parametrized
- ***Pre***: P1's Test exists in qa-bk8-1780533325; a 2nd actor with NO membership there.
- ***Steps***: 1) As non-member, query `tests`/`test_steps` for P1's Test -> 0 rows both tables (RLS filters).
- ***Expected***: cross-tenant read returns empty set, not an error.

#### I2 — Should write an activity_log entry on Test creation

- AC1.1 audit (resolved — built) | Integration | High | Integration | Not parametrized
- ***Pre***: P1 (or any successful create) just executed.
- ***Steps***: 1) Query `activity*log` for rows matching P1's Test -> exactly 1 row. 2) Inspect: actor/user*id = `created*by`, action describes "test created", `created*at` ~= Test's `created_at`.
- ***Expected***: 1 row per creation, written atomically with `tests`/`test_steps` inserts (same transaction).

#### I3 — Should produce identical results from UI and headless surfaces

- Integration — shared `bunkai*create*test` RPC | Integration | High | E2E+API | Not parametrized
- ***Pre***: member+ with UI session AND PAT, same user/workspace.
- ***Steps***: 1) Create Test A via UI (`"Parity Test UI"`, chain [ATC-1,ATC-2]). 2) Create Test B via `POST /api/v1/tests` (`"Parity Test API"`, same chain) + `Idempotency-Key: i3-parity-<uuid>` -> 201. 3) Compare chain order, `test*steps` positions, `activity*log` shape -> identical structure/rules both surfaces (e.g. both reject empty chain, both enforce title<=200).
- ***Expected***: no UI-only/API-only validation divergence.

#### I4 — Should bind the Test to the workspace active at save-commit

- E2 | Integration (Edge) | Medium | E2E (UI) | Not parametrized
- ***Pre***: member+ of qa-bk8-1780533325 AND qa-bk8b-1780534540, each with >=1 ATC.
- ***Steps***: 1) Active=qa-bk8-1780533325, open "New Test", title `"Mid-Form Switch Test"`, select an ATC from WS-A. 2) Before Save, switch active workspace to qa-bk8b-1780534540. 3) Save -> document observed behavior.
- ***Expected*** (per Dev Q6): Test binds to qa-bk8b-1780534540 (workspace active at submit); chained ATC from WS-A now fails same-workspace check -> uniform 404 `not*found` (same as N3-N5), since `bunkai*create_test` resolves ATC ids against the workspace bound at submit.
- > [!IMPORTANT]
- > Genuine "observe and document" case — if a row IS created, capture its `workspace_id` as evidence rather than assuming.

#### A1 — Should create exactly one Test on a rapid double-submit (UI)

- AC3/3.1 (TC-12, dev QA-focus #2) | API (via UI) | High | E2E | Not parametrized
- ***Pre***: member+, valid title+ATC ready; UI auto-generates one `Idempotency-Key` per form session.
- ***Steps***: 1) Title `"Double Submit Test"`, select ATC-1. 2) Click Save, then Save again before first response returns (same Idempotency-Key both clicks). 3) Wait for both responses -> 2nd is a replay (cached snapshot, status 201). 4) Tests list shows `"Double Submit Test"` exactly once.
- ***Expected***: 1 `tests` row; 1 `idempotency*keys` row `(user*id,'POST /api/v1/tests',<key>)` status=`succeeded`.

#### A2 — Should dedupe a headless agent retry with the same Idempotency-Key

- AC3/3.2 (TC-16/17, dev QA-focus #3) | API | High | API | Not parametrized
- ***Pre***: member+ PAT, `atc:write`, valid payload.
- ***Steps***: 1) `POST /api/v1/tests` `{"title":"Agent Retry Test","atc*ids":["<ATC-1>"],"workspace*id":"<ws>"}` + `Idempotency-Key: a2-agent-retry-001` -> 201, capture `test.id`. 2) Repeat EXACT same request+key -> same 201, body identical (same `test.id`). 3) Query `tests` for title -> exactly 1 row.
- ***Expected***: 2nd call hits `isReplay=true` (same user/endpoint/key/hash) -> returns snapshot without re-invoking RPC.

#### A3 — Should reject `Idempotency-Key` reuse with a different payload, OR require `workspace_id` for token-authenticated calls

- Derived (`lib/api/idempotency.ts` 409 on hash mismatch) + dev QA-focus #3 (TC-16/17 `workspace_id` 422) | API | Medium/High | API | Not parametrized (2 sub-cases)
- ***Pre***: member+ PAT.
- ***Sub-case A (409)***: 1) `POST /api/v1/tests` `{"title":"Conflict Test A","atc*ids":["<ATC-1>"],"workspace*id":"<ws>"}` + `Idempotency-Key: a3-conflict-001` -> 201. 2) `POST /api/v1/tests` DIFFERENT body (`{"title":"Conflict Test B","atc*ids":["<ATC-2>"],"workspace*id":"<ws>"}`), SAME key -> 409 `{"error":{"code":"conflict","message":"Idempotency-Key reused with a different request payload."}}`. Only "Conflict Test A" exists.
- ***Sub-case B (422, omit workspace*************id)***: `POST /api/v1/tests` `{"title":"No Workspace Id","atc*ids":["<ATC-1>"]}` (no `workspace*id`) + `Idempotency-Key: a4-no-ws-<uuid>` -> 422 `{"error":{"code":"validation*failed","message":"workspace*id is required for token-authenticated calls."}}`. No `tests` or `idempotency*keys` row (fails before `beginIdempotentRequest`).
- ***Expected***: both sub-cases verified independently; no DB change for sub-case B.

---

## Phase 5 — Edge Case + Test-Data Summary

### Edge case table

| Edge case | In Story? | Outline | Priority |
| --- | --- | --- | --- |
| Viewer via headless API | No -> E1 | N6 | High |
| Same ATC twice in chain | Yes (business-rules) | P2 | High |
| Title 200 vs 201 chars | Partly (2.3) | B1 | Medium |
| Title surrounding whitespace (trim) | No (resolved by code) | B3 | Medium |
| Active-workspace switch mid-form | No -> E2 | I4 | Medium |
| Double-submit within window | Yes (business-rules) | A1 | High |
| Agent retry same key | Yes (workflow) | A2 | High |
| Idempotency-Key reuse, diff payload -> 409 | No (derived) | A3 (sub A) | Medium |
| Missing Idempotency-Key -> 400 | No (derived) | B4 | Medium |
| PAT omitting workspace_id -> 422 | No (dev QA-focus) | A3 (sub B) | High |
| Archived ATC -> uniform 404 | No (derived RLS) | N5 | High |
| ATC deleted while in chain (RESTRICT) | No — schema-level, out of execution scope | - | Low |
| Duplicate Test titles, same workspace | No — no uniqueness constraint, not executed | - | Low |

### Test-data categories

| Type | Count | Purpose | Examples |
| --- | --- | --- | --- |
| Valid (same WS) | 3 ATCs in qa-bk8-1780533325 | P1/P2/I3 | ATC-1/2/3 (1 = existing "ATC Example") |
| Valid (cross-WS) | >=1 ATC in qa-bk8b-1780534540 | N3, I4 | ATC-X |
| Invalid (nonexistent) | 1 random UUID | N4 | `00000000-0000-0000-0000-000000000000` |
| Invalid (archived) | 1 ATC `archived_at` set | N5 | archive ATC-3 or seed 4th |
| Boundary (title) | 4 strings | B1-B3 | 200xA, 201xA, `"   "`, `"  Add to Cart  "` |
| Role | 1 `viewer` member | N6 | new `workspace_members` row |
| Idempotency keys | unique per outline | A1-A3, all API | `<outline-id>-<uuid>` |

### Data generation strategy

| Source | Use | Recipe |
| --- | --- | --- |
| Static | verbatim copy, title boundaries | `"A".repeat(200/201)`, generated once, reused |
| Faker | non-assertion titles (P1-P3,I3,A1-A3) | `faker.lorem.words({min:2,max:4})` |
| Faker | N4 id + Idempotency-Key suffixes | `faker.string.uuid()`,  `${outlineId}-${faker.string.uuid()}`  |
| Faker | 2nd auth user for N6 | `faker.internet.email()` |
| Seeded fixtures | ATC-1/2/3, ATC-X, archived-ATC | seeded once pre-Stage 2, read-only reuse |
| Cleanup | none — no delete path in scope | isolation via unique titles/keys per run |

### STAGING DATA GAP — Stage 2 precondition

> ***WARNING:**** Staging has only ****1 ATC total*** ("ATC Example", id `11655bea-f8e4-4d23-8bda-44a463118eae`, workspace `qa-bk8-1780533325`, status `unrun`, not archived). Blocks 6/19 outlines.

| Requirement | Workspace | Current | Needed | Blocks |
| --- | --- | --- | --- | --- |
| >=3 selectable ATCs | qa-bk8-1780533325 (`bc75c0d4-6d92-4d3f-a92f-f41e4b1774fe`) | 1 | 3 | P1, P2, I3 |
| >=1 archived ATC | qa-bk8-1780533325 | 0 | 1 | N5 |
| >=1 ATC (any status) | qa-bk8b-1780534540 (`3fea0e11-ff28-4d84-93bd-fcb0c511561c`) | 0 | 1 | N3, I4 |
| >=1 `viewer` member | qa-bk8-1780533325 | 0 (all 72 WS single-member) | 1 | N6 |

***Stage 2 setup****: 1) +2 ATCs in qa-bk8-1780533325 (reuse "ATC Example"). 2) Archive 1 ATC there (N5). 3) +1 ATC in qa-bk8b-1780534540 (N3/I4). 4) Add `viewer` member to qa-bk8-1780533325 (N6) — needs 2nd Supabase Auth user (`.env` only has one `STAGING*USER***`).

---

## Phase 7 — Final QA Feedback Report

***Story quality***: Good. 2026-06-06 shift-left refinement fully valid — all 8 PO/Dev questions answered + implemented (PR #40, merged to staging 2026-06-12). No drift.

***Key findings***:

1. Activity-log audit gap CLOSED — I2 now a hard expectation, not a confirmation flag.
2. ***19 is authoritative***, not 25 — DRAFT's table + 2026-06-12 "19 ATP TCs"/`compliance-matrix.md` agree; "25" is a stale duplicate.
3. New observation: N2 (empty `atc*ids` via API) may return Zod `400`/default rather than RPC `422`/`chain*empty` (`TestCreateBodySchema.atc_ids.min(1)` runs first). Flagged inline (N2/B1/B2) for Stage 2 confirmation — not a blocker.

***Risks & mitigation***:

| Risk | Likelihood | Impact | Mitigated by |
| --- | --- | --- | --- |
| Staging ATC scarcity blocks 6/19 outlines | High (confirmed) | Medium | Phase 5 seeding plan, run before Stage 2 |
| INV-3 regression on new entity | Low (unit-tested) | Critical | N3-N5 byte-identical check |
| Idempotency replay/conflict unverified live | Medium | Medium | A1-A3 |
| Zod-vs-RPC message mismatch (N2/B1/B2) | Medium | Low | Flagged for Stage 2 observation |

***What was done***: validated shift-left refinement (no drift, all flags resolved); expanded 19 outlines with parametrization, numbered steps, exact JSON test data, DB-state expected results; documented Phase 5 test-data/Faker strategy + staging seeding precondition; wrote full ATP to customfield_10067 (supersedes DRAFT); initialized ATR via fallback comment (no ATR custom field configured in this Jira instance).

***Next steps***: Stage 2 setup (seed ATCs per gap table) is a BLOCKER for P1/P2/I3/N3/N5/N6/I4. No PO/Dev questions remain open — proceed directly to Stage 2 once seeding completes.

---

**Authored by Stage 1 Planning (sprint-testing) — 2026-06-15**

---
_Synced from Jira by sync-jira-issues_
