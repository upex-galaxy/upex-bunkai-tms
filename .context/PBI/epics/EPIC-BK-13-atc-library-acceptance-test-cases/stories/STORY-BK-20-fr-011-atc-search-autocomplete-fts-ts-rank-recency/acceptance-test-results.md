# BK-20 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

## BK-20 Acceptance Test Results (ATR)

> ***ERROR:**** ****Result******:****** FAILED**** (23 / 24 PASS). One blocking Defect: ****BK-187*** (response-shape). Functional search behavior and tenant isolation are solid; the Story is blocked solely on the result-item `status` semantics.

***Tested******:**** 2026-06-30 - ****Environment******:**** Staging - ****Tester******:**** Facu Barea - ****Modality******:**** jira-native - ****Surface******:*** API + DB
***Endpoint******:*** `GET /api/v1/atcs/search`

## Summary

Project-scoped, workspace-scoped full-text search over ATC `title` + `tags`, ranked by relevance with a 7-day recency tie-break, optionally narrowed by module subtree and/or layer. 24 test cases executed across positive, negative, boundary, security, and integration dimensions. Prefix-match, multi-word AND, subtree recursion, layer filter, limit bounds, validation `422`s, and auth gates all behave correctly. Tenant isolation (workspace + project) is VERIFIED at both API and SQL level - no cross-tenant leak. The single failure is a response-shape divergence from the PO decision, filed as Defect BK-187.

## Test Cases

| TC | Title | Status |
| --- | --- | --- |
| TC01 | Prefix single-token match returns full item shape | FAIL |
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

***Totals******:****** 24 executed - 23 PASS - 1 FAIL - Pass rate 95.8%.***

### TC01 failure detail

The search item is `{id, slug, title, layer, status, module*path}` with `status = "unrun"` (run-status enum: pass/fail/blocked/skipped/running/unrun). The PO decision and ATP expected `status*dot` in {draft, ready, automated, deprecated} (ATC lifecycle) and identifier `atc_id`. Prefix-match logic itself works; the shape and the `status` semantics do not match the PO decision. The EPIC-BK-5 picker would show run-status instead of the reuse/lifecycle signal (a never-run ATC always reads `unrun`). Filed as Defect ***BK-187*** (Severity Mayor / Priority High).

## Security / Tenant Isolation - VERIFIED

| Check | Evidence |
| --- | --- |
| Workspace isolation (identical-title ATC in W1 & W2) | TC16 - only W1 row returned; W2 row absent |
| Project outside caller memberships | TC17 - 200 `{items:[]}`, no leak, no error |
| SQL scope clause | TC24 - `bunkai*search*atcs` RPC enforces `project*id = p*project*id AND wm.user*id = p*actor*user_id AND wm.status='active'` |
| Auth gates | TC21 (401 unauthenticated) + TC22 (403 missing `atc:read` via run:execute-only PAT) |

No cross-tenant leak observed at API or DB level. The CRITICAL risk axis (BK-13 isolation requirement) is clean.

## Observations / Notes

- ***F2 (note, not a ticket)******:*** Search is scoped by ALL active workspace memberships, not the single active workspace. The OpenAPI phrasing ("active workspace memberships") is loose, but the behavior is correct multi-tenant scoping - a foreign-workspace project still correctly returns empty (TC17).
- ***F3 (note, not a ticket)******:*** The TC08 ~30-day backdate could not be constructed on the read-only DB. Recency tie-break was instead proven via the SQL decay function `exp(-age/604800)` plus two rows ~0.5s apart (newer-first confirmed). Full 7-day decay magnitude is a Stage 5 automation follow-up.

## Bugs Found

- ***BK-187*** - ATC search returns run-status, not the PO-decided lifecycle status_dot - Severity Mayor / Priority High. Blocks BK-20.

## Recommendations

- Resolve BK-187 (align result item to `status*dot` lifecycle + `atc*id`) before BK-20 sign-off, since EPIC-BK-5 depends on the reuse signal.
- Strong automation candidates for Stage 4/5: tenant-isolation suite (TC16/TC17/TC24), validation `422` matrix (TC09-TC11, TC14/TC15, TC18, TC20), and the prefix/AND ranking cases (TC01-TC03, TC08).

---
_Synced from Jira by sync-jira-issues_
