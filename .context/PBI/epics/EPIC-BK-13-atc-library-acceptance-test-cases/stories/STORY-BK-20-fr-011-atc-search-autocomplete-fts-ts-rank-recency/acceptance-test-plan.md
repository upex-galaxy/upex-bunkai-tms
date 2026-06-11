# BK-20 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

# Shift-Left Refinement: BK-20 — TMS-ATC Search

***Status****: Refined — Awaiting PO Estimation | ****Refined on****: 2026-06-01 | ****Modality***: Jira-native

---

## Critical Analysis

- ***Endpoint***: `GET /api/v1/atcs/search` — params: `query` (req, ≥1 char), `module_id` (opt), `layer` (opt), `limit` (opt, default 20, cap 50)
- ***DB***: `atcs` adds `search*tsv tsvector` + GIN index + trigger `atcs*tsv_trg` (BEFORE INSERT OR UPDATE OF title, tags)
- ***Ranking****: `ts*rank(search*tsv, query) ** exp(-epoch_diff / 604800)` — relevance × 7-day recency decay
- ***FTS****: prefix-aware — `to*tsquery('simple', $1 || ':**')` for single token; `plainto*tsquery` for multi-word
- ***Auth***: `requireAuth()` — cookie OR Bearer PAT
- ***Dependency***: BK-18 schema confirmed. BK-20 adds its own `search_tsv` migration.

***Complexity***: Business logic HIGH (ranking + subtree + security) · Integration MEDIUM · UI LOW (API-only)
***Test effort***: 21 outlines

---

## Refined Acceptance Criteria

### AC1 — Find by title word

- ***S1.1*** (Positive, High): query "expired" → returns ATC titled "Login with expired token". Response includes `atc*id, slug, title, module*path, layer, status_dot`.
- ***S1.2*** (Positive, Medium): query matches multiple titles → all appear, ranked by relevance + recency.
- ***S1.3*** (Negative, High): query matches no ATC → 200 `{items: []`}.

### AC2 — Find by tag

- ***S2.1*** (Positive, High): query "smoke" → returns ATC tagged `["smoke", "login"]`.
- ***S2.2*** (Positive, Medium): tag match but no title match → ATC still appears (weight B).

### AC3 — Module subtree filter — NEEDS PO/DEV CONFIRMATION (recursive confirmed by architect)

- ***S3.1*** (Positive, High): `?module_id=<Payment-id>` → returns ATCs from Payment AND all descendant sub-modules.
- ***S3.2*** (Negative, High): sibling modules excluded when filter active.

### AC4 — Recency ranking

- ***S4.1*** (Positive, High): two ATCs with identical title — one updated today, one 30 days ago — today's ranks first.
- ***S4.2*** (Edge, Medium) — NEEDS PO/DEV CONFIRMATION: text relevance beats recency when relevance differs significantly.

### AC5 — Empty query → no search (resolved: all return 400)

- ***S5.1*** (Negative, High): `?query=` → 400 `validation_failed`
- ***S5.2*** (Negative, High): absent `query` param → 400 `validation_failed`
- ***S5.3*** (Negative, Medium): whitespace-only query → 400 after trim

### AC6 — Workspace isolation (Security, Critical)

- ***S6.1***: Identical ATC title exists in W1 and W2 → W1 user's search returns only W1 ATC. Verified at API + DB level.
- ***S6.2*** — NEEDS PO/DEV CONFIRMATION: injected `?workspace_id=<W2>` ignored; results still scoped to session workspace.

### New ACs from gaps (PO resolved)

- ***SG1*** (Security, Critical): unauthenticated request → 401. `requireAuth()` confirmed.
- ***SG2*** (Boundary): limit not specified → 20 results default.
- ***SG3*** (Boundary): `?limit=100` → at most 50 results.
- ***SG4*** (Functional) — IN scope: `?layer=UI` → only UI-layer ATCs in results.
- ***SG5*** (Functional): zero matches → 200 `{items: []`}, NOT 404.

---

## Test Outlines (DRAFT)

| Type  | Count  |
| --- | --- |
| ------ | ------- |
| Positive  | 5  |
| Negative  | 7  |
| Boundary  | 4  |
| Integration  | 3  |
| Security  | 2  |
| ***Total****  | ****21***  |

***Positive***: title-word match (prefix) · tag match · multi-word AND · module subtree recursive · recency ranking

***Negative***: empty query 400 · absent query 400 · whitespace 400 · no match empty · subtree exclusion · 401 unauth · workspace isolation

***Boundary***: 1-char query · default limit 20 · cap at 50 · limit=0 behavior

***Integration***: trigger fires after title PATCH · module subtree CTE at DB level · workspace scope at service layer (independent of RLS)

***Security***: workspace_id injection ignored · SQL injection via query param (parameterized)

---

## PO Decisions Applied (2026-06-01)

| Topic  | Decision  |
| --- | --- |
| ------- | ---------- |
| FTS semantics  | Prefix: `to*tsquery + :*` (single token) / `plainto*tsquery` (multi-word)  |
| Auth  | `requireAuth()` — cookie OR Bearer PAT  |
| Layer filter  | IN scope BK-20 — AC added (SG4)  |
| `search*tsv` implementation  | Trigger-maintained (`atcs*tsv_trg`)  |
| Non-existent `module_id`  | 200 `{items:[]`} — no 404  |
| `updated_at` constraint  | NOT NULL DEFAULT now() — required in migration  |
| `status_dot`  | `draft / ready / automated / deprecated`  |
| Empty / absent / whitespace query  | All → 400 `validation_failed`  |

---

## Open Items (minor — do not block estimation)

- `limit=0` behavior: 400 or default to 20?
- Invalid `layer` enum (e.g. "Mobile"): 400 or silently ignored?

---

## Story Quality Assessment

***Verdict****: Needs Improvement → resolved to ****Good*** after PO decisions applied.

3 critical issues resolved: FTS prefix semantics · auth model · layer filter scope. 2 minor items remain (non-blocking).

***Recommended testing strategy (post-implementation)***:

- Smoke: `GET /atcs/search?query=login` → 200 with items
- API: verify ranking with controlled `updated_at` test data; verify workspace isolation at DB level
- Integration: confirm `search_tsv` trigger fires after title PATCH; verify GIN index via EXPLAIN ANALYZE
- Security: two-tenant workspace isolation; query param injection test

**Full refinement file:** `.context/PBI/epics/EPIC-BK-13-atc-library-atomic-test-components/stories/STORY-BK-20-tms-atc-search-search-and-autocomplete-atcs/shift-left-refinement.md`

---
_Synced from Jira by sync-jira-issues_
