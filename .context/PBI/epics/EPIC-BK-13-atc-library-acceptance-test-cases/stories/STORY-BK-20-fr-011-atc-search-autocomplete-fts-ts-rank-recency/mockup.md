# BK-20 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

# BK-20 — Acceptance Test Plan (QA)

> Endpoint: `GET /api/v1/atcs/search` · Modality: Jira-native · Surface: API + DB (no browser UI — the picker lives in EPIC-BK-5).
Reconciled against the REAL implemented contract (OpenAPI). Supersedes the Shift-Left ATP DRAFT on all expected status codes.

## Triage Result

***Risk Score******:****** 8/10 — HIGH.*** Three independent risk axes converge: ranking algorithm (relevance × 7-day recency decay), recursive module subtree, and a hard security perimeter (workspace + project isolation). A single isolation defect leaks cross-tenant test data, which the BK-13 epic classifies as CRITICAL — that alone floors the score at HIGH. No veto applies. Full ATP required.

---

## 1. Test Analysis

***What***: Project-scoped, workspace-scoped full-text search over ATC `title` + `tags`, ranked by FTS relevance with a 7-day recency tie-break, optionally narrowed by a module subtree and/or layer. Powers the autocomplete picker that EPIC-BK-5 consumes.

***Why it matters***: The discovery surface of the ATC Library — sits between ATC creation (BK-18/19) and Test composition (EPIC-BK-5). It is the primary lever for ATC reuse, so correctness of ranking, subtree scoping, and — above all — tenant/project isolation directly drives reuse rate and prevents cross-tenant test-data leakage.

***Risk posture***: HIGH. Security axis is non-negotiable per the BK-13 epic test strategy and is verified at API AND DB level.

---

## 2. Contract reconciliation (vs Shift-Left ATP)

| # | Delta (real contract vs Shift-Left ATP) | Applied |
| --- | --- | --- |
| 1 | Empty/absent/whitespace query: ATP said ***400**** → real ****422*** | TC09–TC11 expect `422 validation_failed`. Ambiguity removed. |
| 2 | `project*id` is ***REQUIRED*** (ATP omitted it) | `project*id` in every positive call. TC18: missing → 422. TC17: project outside memberships → 200 empty. Isolation now project- AND workspace-scoped. |
| 3 | ***403*** (token without `atc:read` scope) — new dimension | TC22 → 403 `ErrorEnvelope`. |
| 4 | Prefix matching CONFIRMED (was "NEEDS CONFIRMATION") | TC01 single-token prefix (`expir`→`expired`); TC03 multi-word AND. |
| 5 | `limit` bounds 1..50 (limit=0 / 51 were open items) | TC12 default 20; TC13 cap 50; TC14 limit=0→422; TC15 limit=51→422. |
| 6 | Zero matches → ***200 ***`{items:[]}` (never 404) | TC04 asserts 200 + empty. No 404 anywhere. |

Schema confirmation (OpenAPI MCP, authoritative): `query` (req, minLength 1), `project*id` (req, uuid), `module*id` (opt, uuid), `layer` (opt enum `UI|API|Unit`), `limit` (opt int 1..50 default 20). Responses 200 / 401 / 403 / 422 — all errors `ErrorEnvelope`. Item shape: `atc*id, slug, title, module*path, layer, status*dot` (status*dot ∈ `draft/ready/automated/deprecated`).

---

## 3. Scope

***In scope***: FTS by title word (prefix-aware single token) and by tag; multi-word AND; module subtree (recursive) filter; layer filter; recency tie-break ranking; required `project*id` scoping; workspace isolation (API + DB); `limit` bounds (default 20, cap 50, reject 0/51); validation 422s (empty/absent/whitespace query, missing/invalid `project*id`, bad `limit`, bad `layer`); auth gates (401 unauth, 403 missing scope); response shape; zero-match 200 `{items:[]}`; integration (tsv trigger after PATCH, recursive CTE, workspace+project SQL clause).

***Out of scope***: search-box/picker UI rendering (EPIC-BK-5); `used*in`/`test*steps` expansion (table not present yet); load/performance p95 budget (follow-up); deep SQL-injection hardening beyond one parameterization smoke check.

---

## 4. Test Cases (24)

Nomenclature: `BK-20: TC#: Validate <core> <conditional>`. Distribution — Positive 6, Negative 6, Boundary 4, Security 5, Integration 3. All positive calls include required `query` + `project_id`.

| TC | Title | Type | Pri | AC | Steps (concise) | Expected | Layer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC01 | Validate prefix single-token match returns the ATC with full item shape | Positive | High | AC1 | `GET ?query=expir&project*id=<P1>` auth | 200; ATC present; item exposes `atc*id, slug, title, module*path, layer, status*dot` | API |
| TC02 | Validate multiple title matches ranked by relevance + recency | Positive | Med | AC1 | `?query=expired&project_id=<P1>` | 200; both ATCs; relevance→recency order | API |
| TC03 | Validate multi-word query applies AND semantics | Positive | Med | AC1/AC2 | `?query=login%20token&project_id=<P1>` | 200; only ATC with BOTH tokens | API |
| TC04 | Validate zero-match query returns 200 with empty items | Negative | High | AC1 | `?query=xyznotfound&project_id=<P1>` | 200 `{items:[]}` (never 404) | API |
| TC05 | Validate tag-only match returns the ATC | Positive | High | AC2 | ATC titled "Navigate to homepage" tagged `["smoke"]`; `?query=smoke&project_id=<P1>` | 200; ATC appears via tag | API |
| TC06 | Validate module filter includes selected module and descendant subtree | Positive | High | AC3 | `?query=flow&project*id=<P1>&module*id=<Payment>` | 200; ATCs from all 3 levels | API+DB |
| TC07 | Validate sibling modules excluded when subtree filter active | Negative | High | AC3 | same call; Login module has matching ATC | 200; Login ATC absent | API+DB |
| TC08 | Validate recency tie-break ranks newer ATC first among equal relevance | Boundary | High | AC4 | two ATCs identical title+tags, `updated*at` today vs ~30d; `?query=validate&project*id=<P1>` | 200; today's ATC first | API+DB |
| TC09 | Validate empty query string returns 422 | Negative | High | AC5 | `?query=&project*id=<P1>` | 422 `validation*failed` | API |
| TC10 | Validate absent query param returns 422 | Negative | High | AC5 | `?project*id=<P1>` | 422 `validation*failed` | API |
| TC11 | Validate whitespace-only query returns 422 | Negative | Med | AC5 | `?query=%20%20%20&project_id=<P1>` | 422 (trim→empty) | API |
| TC12 | Validate default limit of 20 when limit omitted | Boundary | Med | limit rule | ≥21 matches; `?query=login&project_id=<P1>` | 200; exactly 20 items | API |
| TC13 | Validate limit=50 honored at upper bound | Boundary | Med | limit rule | ≥51 matches; `&limit=50` | 200; up to 50, no rejection | API |
| TC14 | Validate limit=0 returns 422 | Boundary | Med | limit rule | `&limit=0` | 422 `validation_failed` | API |
| TC15 | Validate limit=51 returns 422 | Boundary | Med | limit rule | `&limit=51` | 422 `validation_failed` | API |
| TC16 | Validate workspace isolation hides another tenant's identically-titled ATC | Security | Critical | AC6 | W1 & W2 each have identical-title ATC; call as W1 | 200; only W1 ATC; W2 atc_id absent | API+DB |
| TC17 | Validate project outside caller memberships returns empty items | Security | Critical | AC6/Δ2 | `?query=login&project*id=<P*OUT>` | 200 `{items:[]}` (no leak, no error) | API+DB |
| TC18 | Validate missing project*id returns 422 | Negative | High | Δ2 | `?query=login` (no project*id) | 422 `validation_failed` | API |
| TC19 | Validate layer filter returns only matching-layer ATCs | Positive | Med | layer | UI/API/Unit ATCs match "validate"; `&layer=UI` | 200; only `layer=UI` items | API |
| TC20 | Validate invalid layer enum returns 422 | Negative | Med | layer | `&layer=Mobile` | 422 `validation_failed` | API |
| TC21 | Validate unauthenticated request returns 401 | Security | Critical | Auth | no cookie/Bearer | 401 `ErrorEnvelope` | API |
| TC22 | Validate token without atc:read scope returns 403 | Security | Critical | Δ3 | valid credential lacking `atc:read` | 403 missing-scope | API |
| TC23 | Validate search_tsv trigger reindexes after title PATCH | Integration | Med | AC1/index | PATCH title→new token; search new then old | 200 new matches; old no longer matches | API+DB |
| TC24 | Validate workspace+project scope clause applied at SQL level | Integration | High | AC6 defense-in-depth | inspect executed query/EXPLAIN | `WHERE workspace*id=<session> AND project*id=<param>` present regardless of RLS | DB |

---

## 5. Test-data preconditions

- ***P1 in W1**** seeded with: a "expired"-title ATC; ≥2 ATCs sharing a token (ranking); a tag-only ATC (`["smoke"]`, non-matching title); ATCs across UI/API/Unit on a shared token; ****≥51 ATCs*** matching one token (default-20 + cap-50 boundaries).
- ***3-level module subtree*** under P1 (Payment → Checkout/Refunds) + a sibling module (Login) with matching ATCs.
- ***Two identical-title ATCs*** with controlled `updated_at` (today vs ~30 days) for the recency tie-break.
- ***Second workspace W2*** with an ATC duplicating a W1 ATC title (isolation TC16).
- ***P******_******OUT*** — a project outside W1 memberships, with matching ATCs (TC17).
- Credentials from `.env`: `STAGING*USER*EMAIL`/`STAGING*USER*PASSWORD`, a Bearer PAT WITH `atc:read`, and a credential WITHOUT `atc:read` (TC22).

***Execution-time dependencies (flagged for Stage 2, not planning blockers)******:***

1. Second reachable tenant (W2) + P_OUT must be confirmed on staging; absent → TC16 drops to DB-only, TC17 may be unexecutable.
2. `atc:read`-less credential must be obtainable; absent → TC22 unexecutable.
3. Volume seeding (≥51 ATCs) for TC12/TC13 likely via `POST /api/v1/atcs`; confirm write access.
4. DBHub MCP must be probed before DB-layer assertions (TC06/07/08/16/17/23/24).

---

## 6. Recommended execution order (Stage 2)

1. ***Smoke*** — `GET ?query=login&project*id=<P1>` → 200 with items + assert response shape (locks `AtcSearchResult` / `status*dot`).
2. ***API functional*** — TC01–TC05, TC19 (match, tag, multi-word, zero-match, layer).
3. ***API validation/auth*** — TC09–TC11, TC14, TC15, TC18, TC20, TC21, TC22.
4. ***API+DB ranking/subtree*** — TC06, TC07, TC08, TC12, TC13.
5. ***Security isolation (API + DB)*** — TC16, TC17, TC24.
6. ***Integration*** — TC23 (trigger after PATCH).

---

**ATP authored Stage 1 (sprint-testing). Formal Jira **`Test`** issues + ROI are produced at Stage 4 (test-documentation) per project jira-native convention.**

---
_Synced from Jira by sync-jira-issues_
