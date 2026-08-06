# BK-20 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

## Acceptance Test Results (ATR)

> ***Result***: PASSED (24 / 24 PASS). TC01 re-verified against the corrected contract per the BK-187 decision (comment 12187/12189): the shipped response shape `{id, slug, title, layer, status, module*path}` with `status` as the Execution Status enum is correct as built. `status*dot`/`atc_id` were a specification error, now corrected in FR-011 and `api-contracts.yaml`, not a code defect. Functional search behavior and tenant isolation remain solid; no behaviour was touched.

***Tested****: 2026-06-30 (re-verified 2026-08-06) - ****Environment****: Staging - ****Tester****: Facu Barea (re-verification: BK-187 decision) - ****Modality****: jira-native - ****Surface***: API + DB
***Endpoint***: `GET /api/v1/atcs/search`

## Summary

Project-scoped, workspace-scoped full-text search over ATC `title` + `tags`, ranked by relevance with a 7-day recency tie-break, optionally narrowed by module subtree and/or layer. 24 test cases executed across positive, negative, boundary, security, and integration dimensions. Prefix-match, multi-word AND, subtree recursion, layer filter, limit bounds, validation `422`s, and auth gates all behave correctly. Tenant isolation (workspace + project) is VERIFIED at both API and SQL level - no cross-tenant leak. TC01 initially failed against an unsourced spec expectation (`status*dot`/`atc*id`); BK-187 determined the spec, not the code, was wrong, corrected FR-011 and the API contract, and TC01 is re-verified PASS against the corrected contract.

## Test Cases

| TC | Title | Status |
| --- | --- | --- |
| TC01 | Prefix single-token match returns full item shape | PASS |
| TC02 | Multiple matches ranked by relevance + recency | PASS |
| TC03 | Multi-word query applies AND semantics | PASS |
| TC04 | Zero-match query returns 200 with empty items | PASS |
| TC05 | Tag-only match returns the ATC | PASS |
| TC06 | Module filter includes descendant subtree | PASS |
| TC07 | Sibling modules excluded under subtree filter | PASS |
| TC08 | Recency tie-break ranks newer ATC first | PASS |
| TC09 | Empty query string returns 422 | PASS |
| TC10 | Absent query param returns 422 | PASS |
| TC11 | Whitespace-only query returns 422 | PASS |
| TC12 | Default limit of 20 when omitted | PASS |
| TC13 | limit=50 honored at upper bound | PASS |
| TC14 | limit=0 returns 422 | PASS |
| TC15 | limit=51 returns 422 | PASS |
| TC16 | Workspace isolation hides other tenant's ATC | PASS |
| TC17 | Project outside memberships returns empty items | PASS |
| TC18 | Missing project_id returns 422 | PASS |
| TC19 | Layer filter returns only matching layer | PASS |
| TC20 | Invalid layer enum returns 422 | PASS |
| TC21 | Unauthenticated request returns 401 | PASS |
| TC22 | Token without atc:read scope returns 403 | PASS |
| TC23 | search_tsv trigger reindexes after title PATCH | PASS |
| TC24 | Workspace+project scope clause applied at SQL level | PASS |

***Totals***: 24 executed - 24 PASS - 0 FAIL - Pass rate 100%.

### TC01 re-verification detail (BK-187)

Originally failed against an expected shape (`status*dot` in `{draft, ready, automated, deprecated}`, identifier `atc*id`) that turned out to have no source of authority anywhere in the project — it was invented in a single BK-20 refinement comment (2026-06-01, item T4) that mis-attributed it to the unrelated 8-state Workflow Status (TC) lifecycle. No migration defines any documentation-maturity lifecycle on `atcs` or `tests`, and `status_dot` never appeared in shipped code or schema.

BK-187's decision (comment 12187/12189, AI Product Owner + AI Tech Lead, scored 24/25): uphold the implementation, correct the specification. The actual shipped shape `{id, slug, title, layer, status, module*path}`, with `status` as the Execution Status enum (`pass|fail|blocked|skipped|running|unrun`, default `unrun`), is correct. `functional-specs.md` FR-011 and `api-contracts.yaml` are corrected to match; the domain glossary is amended additively (§3 defines `status*dot` as a presentation affordance for Execution Status, never an API field name; §4 anti-glossary bans it as an ATC lifecycle enum). No code or migration changed.

Expected result, corrected: `GET /api/v1/atcs/search?query=expir&project*id=<P1>` returns 200 with the matching ATC present, item exposing `id, slug, title, layer, status, module*path`. ***TC01******:****** PASS.***

## Security / Tenant Isolation - VERIFIED

| Check | Evidence |
| --- | --- |
| Workspace isolation (identical-title ATC in W1 & W2) | TC16 - only W1 row returned; W2 row absent |
| Project outside caller memberships | TC17 - 200 `{items:[]}`, no leak, no error |
| SQL scope clause | TC24 - `bunkai*search*atcs` RPC enforces `project*id = p*project*id AND wm.user*id = p*actor*user_id AND wm.status='active'` |
| Auth gates | TC21 (401 unauthenticated) + TC22 (403 missing `atc:read` via run:execute-only PAT) |

No cross-tenant leak observed at API or DB level. The CRITICAL risk axis (BK-13 isolation requirement) is clean.

---
_Synced from Jira by sync-jira-issues_
