# BK-45 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

## 4. ATP DRAFT — Test Outline

### Coverage Estimate

| Type | Count |
| --- | --- |
| Positive | 10 |
| Negative | 6 |
| Boundary | 3 |
| Integration | 4 |
| ***Total**** | ****23*** |

### Rationale

The count is driven by the 5-layer chain depth. Each layer introduces at least one positive happy-path outline and one "no data" state. The negative suite is relatively lean (6) because the view is read-only — there are no write paths to abuse — but role isolation and cross-workspace leakage must be covered with dedicated tests given the HIGH audit risk of the feature. Boundary tests focus on empty and max-depth chain scenarios. Integration tests cover the join correctness of all 5 entities end-to-end, which carries the highest residual risk given that 3 of the 5 entity types do not yet exist.

### Outlines

#### Positive (10)

1. ***Full 5-layer chain renders without error***

1. ***Multiple ACs each with their own ATCs render as separate segments***

1. ***Chain renders correctly when latest run status is "pass"***

1. ***Chain renders correctly when latest run status is "fail"***

1. ***Chain renders correctly when latest run status is "blocked"***

1. ***"No run yet" state renders correctly (Scenario 2 — existing AC-02)***

1. ***"No coverage" state renders correctly (Scenario 3 — existing AC-03)***

1. ***Partial coverage******:****** mixed ACs (some covered, some not)***

1. ***Viewer-role member can access the traceability view***

1. ***Story with zero ACs shows empty-state for no acceptance criteria***

#### Negative (6)

1. ***Unauthenticated access redirects to login***

1. ***Cross-workspace access returns 403***

1. ***Invalid User Story ID returns 404***

1. ***Traceability view for archived User Story is blocked or flagged***

1. ***Archived ACs do not appear in the chain***

1. ***Run in "running" state does not show misleading result***

#### Boundary (3)

1. ***Story with 1 AC and 1 ATC (minimum populated chain)***

1. ***Story with 0 ACs (empty chain — minimum empty)***

1. ***Story with large AC / ATC count (stress boundary)***

#### Integration (4)

1. ***AC → ATC join correctness******:****** ATC appears under its bound AC only***

1. ***ATC → Test → Run join******:****** latest run selection accuracy***

1. ***Run → Defect join******:****** multiple defects on one run***

1. ***Full 5-layer chain consistency after ATC is rebound to a different AC***

---

## 5. Edge Cases — Extended Scan (HIGH Risk)

| # | Edge Case | Criticality |
| --- | --- | --- |
| EC1 | Unauthenticated user accesses a valid traceability URL | CRITICAL — no auth = data leak risk |
| EC2 | Authenticated cross-workspace user accesses traceability URL (RLS bypass potential) | CRITICAL — tenant isolation; admin Supabase client bypass pattern exists in codebase |
| EC3 | ATC bound to AC in Story A, ATC is reused in a Test that also covers Story B — chain may show wrong story context | HIGH — shared ATC reuse across stories; BK-24 join logic unknown |
| EC4 | All 3 upstream entities (Tests, Runs, Defects) are empty; chain must render gracefully without null pointer errors | HIGH — most probable state at sprint start; chain must not crash |
| EC5 | Run status is running (in-flight) when traceability view is loaded | HIGH — misleading if shown as no-result; UI must handle intermediate state |
| EC6 | Story with 50+ ATC rows (large coverage matrix) causes N+1 query per ATC | HIGH — without a purpose-built join endpoint, naive implementation will be O(N) DB calls per AC |
| EC7 | ATC exists in DB but its parent module has been archived — ATC appears as "ghost" in chain | HIGH — archived_at IS NULL filter exists on ATCs but the module cascade may leave edge records |
| EC8 | Two runs have identical executed*at timestamps (race condition or bulk insert) | HIGH — "latest" sort is non-deterministic; need tiebreaker (e.g., created*at or id) |
| EC9 | Defect linked to a run result that belongs to a different story's chain | HIGH — defect FK points to run, not to story; a QA Lead could see another story's defects if join is not scoped correctly |
| EC10 | Story has ACs in reordered positions (non-sequential, e.g., positions 1, 3, 7) | MEDIUM — chain should render ACs in position order regardless of gaps |
| EC11 | User Story is in draft status (not ready*to*test) — is the traceability view accessible? | HIGH — story lifecycle does not gate this view per current ACs; must confirm — NEEDS PO/DEV CONFIRMATION |
| EC12 | Workspace has an active Jira import job running during traceability load — partial ACs in flux | MEDIUM — import upserts ACs; if mid-import load, chain may show inconsistent AC count |

---

## 6. Open Questions for PO / Dev

### For PO

1. ***(A4 + V1) — Route and entry point***: Where is the traceability view accessible from in the UI? Is it a dedicated route (e.g., /user-stories/{id}/traceability), a panel on the existing story page, or a modal? This directly determines which URL the automated tests navigate to.

1. ***(A2) — "Latest" run definition***: What defines the "latest" run result when multiple runs exist for the same Test? Last executed*at DESC? Last created*at DESC? Is there a tiebreaker when timestamps collide?

1. ***(A3) — Defect link source***: Which entity does a defect link to? run*result*id, run*id, or directly to user*story_id? This determines the join path in the traceability query and is needed before any test outlines for the Defect layer can be finalized.

1. ***(G3 + AC-04) — Partial coverage indicator***: What should the chain show for an AC that has no ATCs? An "uncovered" badge? A dimmed empty row? Confirm exact copy or data-testid to anchor assertions.

1. ***(A7 + AC-05) — Role gate***: Which workspace roles can access the traceability view? All authenticated members (viewer+), or is it restricted to member / admin / owner only?

1. ***(G6 + negative-14) — Archived User Story behavior***: If a QA Lead navigates to the traceability view for a soft-archived story, what should happen? 404, an "archived" banner, or full chain visible read-only?

1. ***(SP Challenge) — Story Points***: BK-45 currently has no SP estimate. Given that the feature requires a 5-entity join endpoint that does not exist, a new UI view/component, and all 3 downstream entity types (Tests, Runs, Defects — BK-24, BK-30, BK-31) are in Planificacion with no schema yet, this story is not ready for sprint planning until its upstream dependencies deliver working schemas. Recommend SP = 5-8 once dependencies are unblocked, or split into:

### For Dev

1. ***(G4 + EC6) — Query strategy for chain assembly***: Will a single SQL JOIN query assemble the full 5-layer chain, or will the frontend make multiple sequential API calls (one per layer)? A naive N+1 approach (one call per ATC to get its Test, one call per Test to get its Run) will have unacceptable latency for stories with 20+ ATCs. Recommend a purpose-built endpoint GET /api/v1/user-stories/{id}/traceability that returns the full chain in one DB join. Confirm approach before test design for integration test outlines (TC-20 to TC-23).

1. ***(A5 + EC3) — ATC deduplication across ACs***: If an ATC is bound to 2 ACs on the same story, does it appear in each AC's chain segment (duplicated) or only once with multi-AC labels? This affects assertion logic in TC-20.

1. ***(EC7) — Ghost ATCs after module archive***: The cascade from bunkai*archive*module*subtree sets archived*at on ATCs. Confirm that the traceability query always filters archived_at IS NULL on ATCs, or whether a recently archived ATC could briefly appear in the chain before the filter propagates.

1. ***(EC8) — Run tiebreaker for "latest"***: If two runs have the same executed_at, what is the tiebreaker for determining the "latest" to display? id DESC? Confirm before implementing TC-21.

---
_Synced from Jira by sync-jira-issues_
