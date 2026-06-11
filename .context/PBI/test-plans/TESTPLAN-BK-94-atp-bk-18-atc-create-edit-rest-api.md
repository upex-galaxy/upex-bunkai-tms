# TEST PLAN: [ATP] BK-18 — ATC create/edit REST API

**Jira Key:** [BK-94](https://jira.upexgalaxy.com/browse/BK-94)
**Status:** Planning
**Components:** None

> Run results / coverage are NOT synced — read those via xray-cli. This file mirrors the issue description.

---

## Description

# ATP — BK-18: ATC create/edit REST API (POST/PATCH /atcs)

> ***INFO:**** Acceptance Test Plan for ****BK-18*** — transactional ATC create + edit REST API. Story is API-only (UI is BK-19). Source of truth for scope, scenarios, and risk triage. Reuses the Shift-Left refined ATP (13 Gherkin scenarios, 2026-05-27). Container issue for `/sprint-testing` Stage 1.

## Scope under test

- `POST /api/v1/atcs` -> ***201*** — create ATC header + ordered steps + assertions, atomically.
- `PATCH /api/v1/atcs/{id}` -> ***200*** — full-replace (PUT-style) edit, version-bumped, cascade child replace.
- ***Auth***: Bearer PAT, scope `atc:write` (read-only token -> 403).
- ***DB integrity***: transactional rollback (zero rows on any failure), slug uniqueness `(project*id, slug)`, monotonic version, `activity*log` events (`atc.created` / `atc.updated`).
- ***OUT***: UI (BK-19), GET (BK-20), DELETE/duplicate (future), `used*in` expansion, real `affected*test_ids` (EPIC-BK-5 — MVP emits `[]`).

## Test environment + data

| Item | Value |
| --- | --- |
| Environment | Staging — `https://staging-upexbunkai.vercel.app/api/v1` |
| Auth | Bearer PAT scope `atc:write` (openapi-testing user; `.env API_TOKEN`) |
| Project | Openapi Test Project — `269850ea-a759-44a1-a45e-3a6187cac5ec` |
| User Story | FSX-45 "Add Support for AmEx CC" — `b1f68acf-855a-4320-95f0-e81df5e948c3` |
| Module (in subtree) | Credit Cards `8da2b639-5e65-4c91-9238-e92d0977d484` (path `billing/credit-cards`) |
| AC for happy path | AC1 `58f143d1-7522-4933-bbc6-2db7d4493436` |
| Cross-subtree module (negative) | `2c4175d7-d449-40f7-abf1-7c7e429c51c7` (project `ae10a3bd-574f-4caf-8076-f19a8e80f5a6`, "BK-9 Module Test Project") |

> ***WARNING:**** ****Test-data gap (Stage 2)***: "Openapi Test Project" has only ONE User Story, so there is no second same-project US whose AC can drive the `ac*outside*user_story` negative cleanly. Workaround: use an AC belonging to a US in a different project (the cross-entity check rejects any AC not under the target US). Stage 2 owns seeding/confirming; do NOT seed at planning time.

## Contract notes (impl is source of truth)

- Step shape: `{ position:int (strictly-increasing from 1), content, input_data?, expected? }`.
- Assertion shape: `{ content }` — ***NO position*** (diverges from the original ATP table; implementation `validation.ts` wins).
- Required POST body: `title` (3..200), `layer` in {UI, API, Unit}, `steps[]` (min 1), `acceptance*criterion*ids[]` (uuid, min 1), `module*id` (uuid), `user*story_id` (uuid). Optional: `assertions[]`, `tags[]` (<=10).
- Error codes: `ac*outside*user*story` (422), `module*outside*project*subtree` (422), `steps*position*invalid` (422), `slug_collision` (409), `conflict` (409 — version mismatch).
- Slug: `<module-slug>/atc-<8 hex>`, immutable, regex `^[a-z0-9-]+\/atc-[a-z0-9]{8}$`.
- PATCH semantics: full-replace; omitted children cleared; empty body `{}` = 200 no-op (no version bump, no event). Optimistic lock via `If-Match: <version>` (absent = skip check; mismatch = 409).

## Risk triage (13 scenarios)

> Impact x likelihood per `acceptance-test-planning.md` §0.2. ATC authoring = HIGH + anchoring moat (master-test-plan §1, INV-1/INV-2); PAT scope = CRITICAL. Distribution: ***P0 = 6, P1 = 5, P2 = 2***.

| Priority | Count | Rationale |
| --- | --- | --- |
| ***P0*** | 6 | Anchoring-moat validation (AC->US, module->subtree), transactional rollback, auth gate (401), scope gate (403), happy-path create |
| ***P1*** | 5 | Contract correctness — PATCH cascade-replace, step-position rules, version conflict, 404, auth-before-DB integration |
| ***P2*** | 2 | Zod boundary rejections (title min, empty steps) |

## Test outlines (drafts — formal Xray Test issues are Stage 4)

> Format: `Should <behavior> <condition>`. Type / Priority / maps-to-AC. Drafts only — full bodies + Xray `Test` issues belong to Stage 4 (`/test-documentation`).

### Happy path

1. ***Should create ATC and return 201 with steps, assertions, slug and version 1 when payload is valid*** — Positive / P0 / AC1, AC2, AC4. POST valid body (title, module Credit Cards, US FSX-45, AC1, layer UI, 3 steps, 1 assertion). Expect 201; `id` uuid; `slug` matches regex; `version`=1; 3 steps positions 1..3; rows in `atcs`/`atc*steps`/`atc*assertions`/`atc*acceptance*criteria`; `atc.created` in `activity_log`.
2. ***Should cascade-replace steps and assertions and bump to version 2 when PATCH replaces children*** — Positive / P1 / AC PATCH semantics. Given ATC v1 (3 steps, 2 assertions); PATCH new title + 2-step array. Expect 200; `version`=2; exactly 2 steps; old children deleted in same txn; `atc.updated` with `affected*test*ids: []`.

### Negative

1. ***Should reject with 422 ac*************outside*************user*************story when AC belongs to a different user story*** — Negative / P0 / cross-entity AC->US (INV-2). POST with US FSX-45 + an AC under a different US. Expect 422 `ac*outside*user*story`; zero rows written.
2. ***Should reject with 422 module*************outside*************project*************subtree when module is in a different project*** — Negative / P0 / cross-entity module->subtree. POST US FSX-45 + cross-project module `2c4175d7...`. Expect 422 `module*outside*project*subtree`.
3. ***Should reject with 401 unauthorized when no Authorization header is sent*** — Negative / P0 / auth gate. POST valid body, no bearer. Expect 401 `unauthorized`.
4. ***Should reject with 403 forbidden when token scope is atc******:******read*** — Negative / P0 / scope gate (escalation surface). POST valid body with `atc:read`-only PAT. Expect 403 `forbidden` ("Missing required capability: atc:write").
5. ***Should reject with 404 not*************found when PATCHing a non-existent ATC id*** — Negative / P1 / 404. PATCH `/atcs/00000000-...0000`. Expect 404 `not*found`.
6. ***Should reject with 422 steps*************position*************invalid when step positions are not strictly increasing*** — Negative / P1 / step rule. POST steps positions [1,3,2]. Expect 422 `steps*position*invalid`; body lists offending positions.
7. ***Should reject with 422 steps*************position*************invalid when step positions do not start at 1*** — Negative / P1 / step rule. POST steps positions [2,3,4]. Expect 422 `steps*position*invalid`.
8. ***Should reject second concurrent PATCH with 409 conflict on stale version*** — Negative / P1 / optimistic lock. Two PATCH with `If-Match: "1"`. First -> 200 v2; second -> 409 `conflict` with current version in body.

### Boundary

1. ***Should reject with 422 validation*************failed when title is below minimum length*** — Boundary / P2 / Zod. POST title "AB" (2 chars). Expect 422 `validation*failed`.
2. ***Should reject with 422 validation*************failed when steps array is empty*** — Boundary / P2 / Zod. POST `steps: []`. Expect 422 `validation*failed`.

### Integration

1. ***Should raise 401 before any DB query when bearer token is invalid or expired*** — Integration / P1 / auth-before-DB. POST valid body with malformed/expired PAT. Expect 401 raised in middleware ahead of any DB read.
2. ***Should write zero rows across all three tables when a cross-entity check fails**** — Integration / P0 / transactional rollback. POST that passes Zod but fails AC->US. Expect 422 and `count(**)` unchanged on `atcs`, `atc*steps`, `atc*assertions`.

> Outlines 13–14 split the ATP's two "Integration" scenarios; the rollback outline (14) is the same assertion family as outline 3 but verified at the DB-count level. 13 distinct ATP scenarios -> 14 draft outlines (rollback gets its own DB-count outline).

## Traceability

- Story ***BK-18*** — ATC create/edit REST API (this ATP's parent).
- Epic ***BK-13*** — ATC Library.
- ATP and ATR (Test Execution) issues link to BK-18 via the "Test" relationship (`is tested by`).
- TC <-> Story links: deferred to Stage 4 (no Xray `Test` issues yet — outlines above are drafts).

## Open questions

1. ***Cross-US AC source*** — confirm in Stage 2 whether to use an out-of-project AC for the `ac*outside*user_story` negative, or seed a second US in "Openapi Test Project". (No same-project second US exists today.)
2. ***Test isolation*** — created ATCs pollute shared staging DB; Stage 2 needs a cleanup pass (delete created rows or tag with a session marker), per BK-15/BK-17 precedent.

---

## Related Issues

- tests: [BK-18](https://jira.upexgalaxy.com/browse/BK-18) - TMS-ATC API | Create and edit ATCs with steps and assertions

---

## Metadata

- **Created:** 6/8/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
