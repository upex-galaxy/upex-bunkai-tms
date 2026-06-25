# Comments for BK-20

[View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

---

### Ely - 5/19/2026, 9:57:26 PM

1. 🧱 Architect Annotation

1. 

- DB tables touched: `atcs` gets a generated `search*tsv tsvector` column (or trigger-maintained, decided at impl plan). GIN index `atcs*search*tsv*idx` on the tsvector column. No new tables.
- Tsvector construction: `setweight(to*tsvector('simple', title), 'A') || setweight(to*tsvector('simple', array*to*string(tags, ' ')), 'B')`. Weight A for title, B for tags.
- Trigger `atcs*tsv*trg` fires BEFORE INSERT OR UPDATE OF title, tags on `atcs` to refresh `search_tsv`. Or use a `GENERATED ALWAYS AS ... STORED` column if Postgres version allows the immutable function constraints (decide in impl plan).
- API surface: `GET /atcs/search` returns 200 with `{ items: [...] }`. Query params: `query` (required, ≥1 char), `module_id` (optional), `layer` (optional enum), `limit` (optional int, default 20, capped 50).
- Ranking SQL: `SELECT ..., ts*rank(search*tsv, plainto*tsquery('simple', $1)) * exp(- EXTRACT(EPOCH FROM (now() - updated*at)) / $decay) AS score`. `$decay` defaults to 7 days in seconds (documented constant in code).
- Module-subtree filter: reuses existing recursive CTE or materialized `module*paths` (depending on Wave 1 implementation). Filter applied as `WHERE module*id IN (SELECT id FROM module_subtree($2))`.
- Workspace scoping at service layer: `WHERE workspace*id = $session.workspace*id` always applied, even if RLS exists (defense in depth).
- Response shape: `{ atc*id, slug, title, module*path, layer, status*dot }`. `module*path` is a denormalized string like `Module A / Submodule B` to avoid a second roundtrip.

1. 

- Upstream: [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) (atcs table must exist with title + tags + updated*at + module*id + workspace_id columns). Wave 1 modules subtree mechanism.
- Downstream: Test composition UI (EPIC-BK-5) consumes this endpoint as the ATC picker autocomplete. The picker debounces user input (~200ms) and renders the result list.
- External: PostgreSQL `tsvector`, `to*tsquery`, `ts*rank`, GIN indexes. No pg_trgm needed for MVP (semantic/fuzzy search deferred to Phase 2).

1. 

- [ ] Migration adds `search_tsv` column + GIN index + trigger (or generated column)
- [ ] Backfill statement populates `search_tsv` for all existing atcs rows
- [ ] OpenAPI entry for `GET /atcs/search` with query schema and response shape
- [ ] `bun run api:sync` passes
- [ ] Unit tests for: empty query rejected, single-word match, multi-word match, recency decay ordering (newer wins on equal text relevance), workspace isolation
- [ ] Integration tests for: module subtree filter, layer filter, limit cap at 50
- [ ] Performance budget documented: search must return < 100ms p95 on a 10k-ATC workspace
- [ ] Lint + typecheck pass

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.3)
- SRS: `.context/SRS/functional-specs.md` § FR-011
- Business map: `.context/business/business-data-map.md` § atcs (search_tsv column)
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/search

---

### Facu Barea - 6/1/2026, 6:18:11 PM

# Shift-Left QA — Open Questions ([https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20))

Raised during the Shift-Left QA refinement pass on 2026-06-01. The following questions must be resolved before sprint planning and estimation. Categorized by audience.

---

## Critical Questions for PO

These block sprint planning until answered.

***Q1 — FTS match semantics: exact-word or prefix (autocomplete)?***

The Workflow section states "suggestions appear and refine as she types", which implies autocomplete / prefix behavior. However, the architect's proposed SQL uses `plainto_tsquery('simple', $1)`, which matches complete tokens only. Typing "expir" will NOT match "expired" with this approach.

Impact if unanswered: Dev implements exact-word FTS while the UX team builds a prefix-style autocomplete — misaligned expectations, rework after sprint.

Suggested resolution: If prefix matching is required for MVP, switch to `to*tsquery('simple', $1 || ':*')` for single-token queries. For multi-word queries, keep `plainto*tsquery`.

***Q2 — Authentication model for GET /atcs/search***

The Story has no AC covering authentication. The endpoint derives `workspace_id` from the caller's session. If called without a valid session or Bearer token, the endpoint has no workspace context and may panic or return unscoped results.

Impact if unanswered: Security test gap; potential 500 or data leak on unauthenticated calls.

Suggested resolution: `requireAuth()` accepting both session cookie (browser users) and Bearer PAT (automation consumers) — consistent with other GET endpoints.

***Q3 — Layer filter: IN or OUT of BK-20?***

The architect's API spec includes `layer` as an optional filter (`?layer=UI|API|Unit`). The Story's Scope and Out-of-Scope sections do not mention it. No AC covers it.

Impact if unanswered: Dev may implement it (following architect spec) with no AC to verify against — or skip it, leaving the picker without a layer filter.

Suggested resolution: Confirm IN scope (add AC) or create a follow-up Story.

---

## Technical Questions for Dev

These do not block PO estimation but block implementation.

***T1 —**** `search_tsv` ****column:**** `GENERATED ALWAYS AS STORED` ****or trigger-maintained?***

The architect note says "decided at impl plan". Generated column requires an IMMUTABLE function — `array*to*string(tags, ' ')` may not qualify. Trigger (`atcs*tsv*trg` BEFORE INSERT OR UPDATE OF title, tags) is the safer path. Confirm choice so QA can write the integration outline (trigger firing test vs computed column test).

***T2 —**** `module_id` ****for non-existent module: 404 or empty results?***

If a caller passes a valid UUID that does not belong to any module in their workspace, should the API return 404 or 200 with `{items: []`}? The recursive CTE returning no rows is indistinguishable from a valid module with no matching ATCs.

***T3 —**** `updated_at` ****null safety***

Confirm `updated*at` has a `NOT NULL DEFAULT now()` constraint in the `atcs` migration. A null `updated*at` makes `EXTRACT(EPOCH FROM (now() - updated_at))` return null, causing the ranking score to be null — undefined sort order.

***T4 —**** `status_dot` ****field in the response shape***

The architect specifies `status*dot` in the response: `{atc*id, slug, title, module*path, layer, status*dot`}. This field is not defined in the ACs or business rules. What values can it take? Is it the ATC's lifecycle status column?

***T5 — Empty, absent, and whitespace-only query handling***

Business rules say "at least 1 character". Confirm the exact HTTP response for each variant:

- `?query=` (empty string) — 400 or 200 empty?
- No `query` param at all — 400 or 200 empty?
- {{?query=   }} (whitespace only) — 400 after trimming?

Knowing the exact error shape lets QA write deterministic negative test cases.

---

**Raised by: QA Shift-Left batch session — 2026-06-01**
**Refinement file:** `.context/PBI/epics/EPIC-BK-13-atc-library-atomic-test-components/stories/STORY-BK-20-tms-atc-search-search-and-autocomplete-atcs/shift-left-refinement.md`

---

### Facu Barea - 6/1/2026, 6:18:16 PM

# PO Decisions — Shift-Left QA Questions ([https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20))

Answers to the QA open questions raised on 2026-06-01. All decisions apply to MVP scope.

---

## PO Decisions

***Q1 — FTS match semantics: prefix matching confirmed for MVP***

Decision: Prefix matching IS required for MVP. The workflow promise ("suggestions refine as she types") is a product commitment, not an aspirational note. Dev must implement prefix-aware FTS.

Implementation: Use `to*tsquery('simple', $1 || ':**')` for single-token queries (one word, no spaces). For multi-word queries (contains a space after trimming), fall back to `plainto*tsquery('simple', $1)` for AND semantics. The distinction is simple to detect: `if (query.trim().includes(' ')) plainto*tsquery else to*tsquery + :**`.

AC update: AC1 and AC2 should be understood as prefix-aware. "Search for 'expir'" must match "expired token". QA to update the refined ACs accordingly.

***Q2 — Authentication model:**** `requireAuth()` ****(cookie OR Bearer)***

Decision: `requireAuth()` — accepts both session cookie (browser users accessing the picker) and Bearer PAT (API consumers, automation scripts). This is the standard pattern for all GET endpoints that serve both the UI and the API surface.

`requireBearerToken()` alone is NOT sufficient — it would break the browser-based ATC picker. `requireAuth()` handles the dual-surface requirement cleanly.

AC to add: "Unauthenticated request to `GET /atcs/search` returns 401 unauthorized." QA to include this in the final refined ACs.

***Q3 — Layer filter: IN scope for BK-20***

Decision: The `layer` filter is IN scope for [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20). Rationale: the architect already defined it in the API contract, the implementation cost is a single optional WHERE clause, and QA engineers searching for ATCs by layer is a core use case (e.g., "show me only UI-layer ATCs in the Login module").

AC to add: "When `?layer=UI` is applied, only ATCs of layer UI appear in results. ATCs of layer API and Unit are excluded."

---

## Dev Decisions (PO alignment)

***T1 — Trigger-maintained**** `search_tsv` ****(not generated column)***

Aligned decision: Trigger-maintained. `GENERATED ALWAYS AS STORED` requires an immutable function — `array*to*string(tags, ' ')` is not immutable by Postgres definition. The trigger approach (`atcs*tsv*trg` BEFORE INSERT OR UPDATE OF title, tags) is correct and already specified by the architect. No change to the technical direction.

***T2 — Non-existent**** `module_id`****: 200 with empty results***

Decision: Return 200 with `{items: []`}. The module subtree CTE returns no rows for an unknown UUID, the WHERE clause matches nothing, and the response is a normal empty result. This avoids exposing module existence to the caller (security by default). No 404.

***T3 —**** `updated_at` ****NOT NULL confirmed***

Decision: The `atcs` migration must include `updated*at TIMESTAMPTZ NOT NULL DEFAULT now()`. This is a required constraint — null `updated*at` breaks the ranking formula. Dev to confirm this is in the migration script before merging.

***T4 —**** `status_dot` ****maps to the ATC lifecycle status***

Decision: `status_dot` is the ATC's `status` column value. Valid values follow the ATC lifecycle: `draft`, `ready`, `automated`, `deprecated` — matching the Test Case workflow states already defined in the project. The field is a string enum in the response. QA to assert this field is present and one of the valid values.

***T5 — Query validation: 400 for empty, absent, and whitespace***

Decision: All three cases return 400 `validation_failed`:

- `?query=` (empty string after no trimming) — 400
- No `query` param — 400 (param is required)
- {{?query=   }} (whitespace only, trimmed to empty) — 400 (trim before validate)

Error body: {{{ "error": "validation_failed", "fields": [{ "field": "query", "message": "must be at least 1 non-whitespace character" }] }}}. Consistent with the existing 422 validation envelope on other endpoints — note this returns 400 (query param validation) not 422 (body schema validation).

---

**Answered by: PO — 2026-06-01**
**All decisions are final for MVP scope. Re-open via a new comment if any decision needs revision before sprint start.**

---

### Facu Barea - 6/1/2026, 6:28:53 PM

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20) — TMS-ATC Search

***Status****: Refined — Awaiting PO Estimation | ****Refined on****: 2026-06-01 | ****Modality***: Jira-native

---

## Phase 1 — Critical Analysis (Summary)

- ***Persona***: Senior QA Engineer searching ATCs to reuse without scrolling module trees
- ***Backend***: `GET /api/v1/atcs/search` (NEW). Params: `query` (req, ≥1 char), `module_id`, `layer`, `limit` (default 20, cap 50)
- ***DB***: `atcs` gains `search*tsv tsvector` + GIN index + trigger `atcs*tsv_trg`
- ***Ranking****: `ts*rank(search*tsv, query) ** exp(-epoch_diff / 604800)` — relevance × 7-day recency decay
- ***Dependency***: [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) schema confirmed (Ready For Dev). [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20) adds its own migration for `search_tsv`

| Axis  | Rating  | Why  |
| --- | --- | --- |
| ------ | -------- | ----- |
| Business logic  | High  | Ranking formula + module subtree recursion + workspace security perimeter  |
| Integration  | Medium  | [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) schema, Wave 1 module_paths, PostgreSQL FTS  |
| Data validation  | Medium  | query ≥1 char, limit 1–50, layer enum  |
| UI  | Low  | API-only Story  |

***Estimated test effort***: 21 outlines

---

## Phase 2 — Story Quality (Key Findings)

***Verdict***: Needs Improvement — 5 ambiguities, 6 gaps, 12 inferred edge cases

***Critical contradiction****: Workflow says "refines as she types" (prefix/autocomplete) but architect SQL uses `plainto*tsquery` (exact-word only). Resolved by PO: prefix matching confirmed — `to*tsquery + :**` for single token.

***Key gaps***:

- No auth AC — `GET /atcs/search` needs `requireAuth()`. Resolved by PO.
- No layer filter AC — confirmed IN scope. Resolved by PO.
- No limit boundary ACs — default 20, cap 50 need explicit ACs.
- No response-shape AC — `module*path`, `status*dot`, `slug` fields unverified.
- No empty-result AC — 200 `{items:[]`} vs 404 must be explicit.

---

## Phase 3 — Refined Acceptance Criteria

### AC1 — Find by title word

***S1.1*** Should return ATC when query matches a word in its title (Positive, High)

- Given: ATC "Login with expired token" in workspace W1
- When: `GET /atcs/search?query=expired` (authenticated)
- Then: 200, items contains that ATC with `atc*id, slug, title, module*path, layer, status_dot`

***S1.2*** Should return multiple ATCs when query matches several titles (Positive, Medium)

- Given: "Login with expired token" and "Expired session redirect" in W1
- When: `GET /atcs/search?query=expired`
- Then: Both ATCs in items, ranked by relevance + recency

***S1.3*** Should return empty items when query matches no ATC (Negative, High)

- When: `GET /atcs/search?query=xyznotfound`
- Then: 200 `{items: []`}

---

### AC2 — Find by tag

***S2.1*** Should return ATC when query matches a tag exactly (Positive, High)

- Given: ATC tagged `["smoke", "login"]`
- When: `GET /atcs/search?query=smoke`
- Then: ATC appears in items (tag match, weight B)

***S2.2*** Should return ATC when query matches tag but not title (Positive, Medium)

- Given: title "Navigate to homepage", tags `["smoke"]`
- When: `GET /atcs/search?query=smoke`
- Then: ATC appears

---

### AC3 — Module subtree filter

***S3.1*** Should include ATCs from selected Module AND all recursive sub-modules (Positive, High) — NEEDS PO/DEV CONFIRMATION

- Given: "Payment" has sub-modules "Payment/Checkout" and "Payment/Refunds", each with an ATC matching "flow"
- When: `GET /atcs/search?query=flow&module_id=<Payment-id>`
- Then: All three subtree ATCs appear (recursive CTE confirmed by architect)

***S3.2*** Should exclude ATCs from sibling modules outside the selected subtree (Negative, High)

- Given: "Login" module ATC and "Payment" module ATC both match "flow"
- When: filter `module_id=<Payment-id>`
- Then: Only Payment-subtree ATC in items; Login ATC excluded

---

### AC4 — Recency ranking

***S4.1*** Should rank more recently updated ATC above equally text-relevant older ATC (Positive, High)

- Given: Two ATCs with identical title "Validate login", one updated today, one 30 days ago
- When: `GET /atcs/search?query=validate`
- Then: Today's ATC ranks first

***S4.2*** Should rank by text relevance first when relevance differs — NEEDS PO/DEV CONFIRMATION (Edge, Medium)

- Given: ATC-A has "login" in title AND tags; ATC-B has "login" only in tags; ATC-B is 1 day newer
- When: `GET /atcs/search?query=login`
- Then: ATC-A ranks above ATC-B (relevance beats recency when significantly different)

---

### AC5 — Empty query no search

***S5.1*** Should return 400 when query is empty string (Negative, High) — PO resolved: 400 for empty/absent/whitespace

- When: `GET /atcs/search?query=`
- Then: 400 `validation_failed`, field: query

***S5.2*** Should return 400 when query param is absent (Negative, High)

- When: `GET /atcs/search` (no query param)
- Then: 400 `validation_failed`

***S5.3*** Should return 400 when query is whitespace only (Negative, Medium)

- When: `GET /atcs/search?query=%20%20%20`
- Then: 400 after trim (treated as empty)

---

### AC6 — Workspace isolation

***S6.1*** Should not return ATCs from another workspace even when title matches (Security, Critical)

- Given: W1 and W2 both have ATC "Login with expired token"
- When: W1 user calls `GET /atcs/search?query=expired`
- Then: Only W1 ATC in items; W2 ATC absent. Verify: `workspace_id` filter in SQL.

***S6.2*** Should scope to session workspace and ignore injected workspace_id param — NEEDS PO/DEV CONFIRMATION (Security, Critical)

- Given: W1 user passes `?workspace_id=<W2-id>`
- Then: Results still scoped to W1; W2 data not returned

---

### New ACs from gaps — NEEDS PO/DEV CONFIRMATION

***SG1*** Should return 401 when called without authentication (Security, Critical) — PO resolved: requireAuth()

- Given: No Authorization header, no session cookie
- When: `GET /atcs/search?query=login`
- Then: 401 unauthorized

***SG2*** Should return default 20 results when limit not specified (Boundary, Medium)

- Given: 50+ ATCs match query
- Then: items has exactly 20 entries

***SG3*** Should cap results at 50 when limit exceeds max (Boundary, Medium)

- Given: 100+ ATCs match; `?limit=100`
- Then: At most 50 items

***SG4*** Should filter to specified layer only when layer param provided (Functional, Medium) — PO resolved: IN scope

- Given: ATCs of layers UI, API, Unit all match "validate"
- When: `?layer=UI`
- Then: Only UI-layer ATCs in items

***SG5*** Should return 200 with empty items when query has no matches (Functional, Medium)

- When: query matches zero ATCs
- Then: 200 `{items: []`}, NOT 404

---

**Part 1 of 2 — See next comment for Phase 4 outlines, Phase 5 edge cases, and open questions**

---

### Facu Barea - 6/1/2026, 6:28:59 PM

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20) — Phases 4–5 + Assessment (Part 2 of 2)

---

## Phase 4 — Test Outlines (DRAFT — names only)

### Coverage estimate

| Type  | Count  |
| --- | --- |
| ------ | ------- |
| Positive  | 5  |
| Negative  | 7  |
| Boundary  | 4  |
| Integration  | 3  |
| Security  | 2  |
| ***Total****  | ****21***  |

Rationale: Three independent complexity axes (ranking algorithm, module subtree recursion, workspace security perimeter) each drive a dedicated test cluster. Security cluster is non-negotiable regardless of risk level.

### Positive

- Should return matching ATC when query matches a word in its title (prefix-aware)
- Should return matching ATC when query matches one of its tags
- Should return ATCs matching a multi-word query (AND semantics across tokens)
- Should include ATCs from selected Module AND all recursive sub-modules when filter applied
- Should rank more recently updated ATC above equally text-relevant older ATC

### Negative

- Should return 200 empty items when query matches no ATCs
- Should return 400 when query is empty string
- Should return 400 when query param is absent
- Should return 400 when query is whitespace only
- Should not include ATCs from modules outside selected subtree when filter active
- Should return 401 when request is unauthenticated
- Should not return ATCs from another workspace even when title matches

### Boundary

- Should accept single-character query as minimum valid input
- Should return 20 results by default when limit not specified
- Should cap results at 50 when limit=100 is requested
- Should handle limit=0 gracefully (400 or default) — NEEDS PO/DEV CONFIRMATION

### Integration

- Should reflect updated title in search results after trigger fires on title change (PATCH → search_tsv updated)
- Should apply module subtree filter using recursive CTE at DB level (verify via EXPLAIN)
- Should apply workspace scoping at service layer independently of RLS (defense in depth)

### Security

- Should not leak content from another workspace via workspace_id param injection
- Should safely handle SQL injection patterns in query param (parameterized query confirmed)

---

## Phase 5 — Edge Cases (DRAFT)

|  | Edge case  | Criticality  | Action  |
| --- | --- | --- |
| --- | ----------- | ------------- | -------- |
| E1  | Partial-word query ("expir" → "expired") — prefix resolved by PO  | Critical  | Resolved: prefix matching confirmed  |
| E2  | Multi-word query ("expired token") — FTS AND semantics  | High  | Add positive test case  |
| E3  | `module_id` for non-existent module  | High  | Resolved by PO: 200 empty, not 404  |
| E4  | `layer` param with invalid enum ("Mobile")  | Medium  | NEEDS PO/DEV CONFIRMATION: 400 or ignored?  |
| E5  | Workspace with 0 ATCs  | Low  | 200 `{items:[]`} — test only  |
| E6  | 10,000+ ATCs — p95 < 100ms budget  | High  | Performance outline — verify GIN index  |
| E7  | `updated_at` null  | High  | Resolved by PO: NOT NULL DEFAULT now() required  |
| E8  | Two ATCs with identical `updated_at`  | Low  | Non-deterministic — don't assert order  |
| E9  | ATC with 10 tags (max) — all indexed  | Medium  | Test only  |
| E10  | Tag match on ATC in other workspace  | Critical  | Workspace isolation must hold for tag matches too  |
| E11  | limit=51 vs limit=50 (cap boundary)  | Medium  | Off-by-one test — cap is ≥50  |
| E12  | `module_path` for top-level module (no separator)  | Low  | Expected: module name only, no "/"  |

---

## Story Quality Assessment

***Verdict***: Needs Improvement

- ***Critical contradiction resolved***: FTS prefix vs exact-word — PO confirmed prefix matching for MVP
- ***Security gap resolved***: Auth model confirmed — `requireAuth()` (cookie + Bearer)
- ***Scope gap resolved***: Layer filter IN scope — AC to add

Remaining open items: `status*dot` field definition, `limit=0` behavior, `layer` invalid enum handling, `module*id` non-existent (resolved as 200 empty by PO).

---

## Decisions Applied (from PO comment 2026-06-01)

| Topic  | Decision  |
| --- | --- |
| ------- | ---------- |
| FTS semantics  | Prefix: `to*tsquery + :*` (1 token) / `plainto*tsquery` (multi-word)  |
| Auth  | `requireAuth()` — cookie OR Bearer PAT  |
| Layer filter  | IN scope [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20) — add AC  |
| `search_tsv`  | Trigger-maintained (not generated column)  |
| Non-existent `module_id`  | 200 `{items:[]`} — no 404  |
| `updated_at`  | NOT NULL DEFAULT now() — mandatory constraint  |
| `status_dot`  | `draft/ready/automated/deprecated`  |
| Empty/absent/whitespace query  | All return 400 `validation_failed`  |

---

## Risks & Mitigation

| Risk  | Likelihood  | Impact  | Covered by  |
| --- | --- | --- | --- |
| ------ | ----------- | -------- | ------------ |
| Workspace isolation breach  | Low  | Critical  | Security-1, Security-2  |
| Ranking null on `updated_at`  | Low  | High  | E7 (constraint confirmed)  |
| Module filter returns flat instead of recursive  | Medium  | Medium  | Positive-4, Integration-2  |
| TSV trigger not fired after PATCH  | Low  | Medium  | Integration-1  |
| Performance on 10k+ ATCs  | Low  | High  | E6 (GIN index required)  |

---

## Next Steps

- PO: confirm `limit=0` behavior and invalid `layer` enum response
- Dev: confirm `status_dot` values and `layer` invalid enum handling
- Sprint planning: story is estimable — PO decisions applied. 5 ambiguities resolved; 2 minor items remain
- When story reaches Ready For QA: `/sprint-testing` will detect `shift-left-reviewed` label and short-circuit Phases 1-3

**Full refinement file:** `.context/PBI/epics/EPIC-BK-13-atc-library-atomic-test-components/stories/STORY-BK-20-tms-atc-search-search-and-autocomplete-atcs/shift-left-refinement.md`

---

### Automation for Jira - 6/20/2026, 9:30:19 AM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/20/2026, 11:36:55 AM

✅ Pull Request is successfully MERGED. Task is Done.

---


_Synced from Jira by sync-jira-issues_
