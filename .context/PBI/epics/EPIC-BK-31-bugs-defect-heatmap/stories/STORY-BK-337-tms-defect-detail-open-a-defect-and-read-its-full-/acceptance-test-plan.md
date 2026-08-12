# BK-337 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

> ***WARNING:**** ****Revision 1 — partially superseded on 2026-08-11.*** Four claims in the gap table below were refuted by the Tech Lead's review and retracted by QA after independent verification: G4 and its off-by-one boundary case (a run-linked defect carries ONE step copied verbatim, not a multi-step blob), G6 (the not-found convention is already the shipped invariant, so no existence oracle exists and the HIGH risk rating it justified was inflated), and two premises inside G7 (the notification resolver does not produce a defect URL today, and only one of the three list surfaces excludes archived-module defects). Read the QA correction comment on this ticket before using this document. The Acceptance Criteria field is at revision 2 and is authoritative for what gets built. Revised posture: risk MEDIUM, roughly 30 outlines.

# Shift-Left Refinement (ATP DRAFT) — BK-337

Status: Refined — Awaiting PO Estimation · Mode: Shift-Left pre-sprint · Refined 2026-08-11 · Modality: Jira-native

Refined Acceptance Criteria live in the Acceptance Criteria field. Every claim below was verified against the product repository, not inferred from the Story text.

> ***WARNING:*** Two blockers are data-model gaps, not wording gaps. The Story cannot be estimated honestly until Critical Questions 1 and 2 are answered, because both change its size.

## Story quality verdict

Verdict: SIGNIFICANT ISSUES. Testability: PARTIAL. Risk: HIGH (score 11, plus an authorization-perimeter veto).

Testable as written: no edit or lifecycle controls (AC4), both list cells navigate to the record (AC5), and the header's severity, status, title and module path.

Not testable as written: Expected vs Actual (no data source), numbered steps and the failing-step highlight (no structure, no index), evidence rows (undefined content and open behaviour), "full record exactly as filed" for a standalone defect (collides with the Details panel), every identifier assertion, and the entire negative axis.

## Gaps — 11 found, 2 blocking

| ID | Severity | Gap | Evidence in the product |
| --- | --- | --- | --- |
| G1 | BLOCKER | Expected vs Actual has no storage. AC1 requires it, Scope requires it side by side, and the Story's own Context paragraph enumerates the eight stored fields WITHOUT it. Nearest real value is `run*steps.expected` — run-linked only, and semantically the ATC's expectation, not the reporter's. There is no Actual anywhere. | `0046*bugs.sql:96-121` · `BugFormDialog.tsx` · `0031_runs.sql:172` |
| G2 | BLOCKER | Layer and environment are not defect attributes. `layer` is a column on `atcs`; `environment` is `project*environments`, reached only through a run. A standalone defect has neither by construction. The mockup's environment value is a browser/OS/build string the entity does not model. AC2's "exactly as filed" and the Scope's Details panel cannot both be true. | `0004*atcs.sql:60` · `0032*project*environments_crud.sql` |
| G5 | MAJOR / SECURITY | Evidence URLs are validated with `z.string().url()`, which ACCEPTS `javascript:` and `data:`. Rendering them as anchors on the new page is a stored-XSS vector reachable by any write-role member and clickable by every workspace member. No AC covers it. | `lib/bugs/validation.ts:34-37` · `BugFormDialog.tsx:82-101` |
| G6 | MAJOR / SECURITY | All five ACs are happy paths. Nothing defines unknown id, cross-workspace id, real id under the wrong project slug, malformed id, signed-out visitor, or viewer role. RLS denies the read, but the AC never says the surface must answer 404 rather than 403 — and 403 is a cross-tenant existence oracle. | `0046*bugs.sql` policy · precedent `0063*environment*cross*workspace_404.sql` |
| G3 | MAJOR | No single-defect read leg exists and Scope never names one. The bugs route has POST and list-GET; `[id]/` holds only status and assign, both writes. No read RPC — 0046 ships create/list-project, 0051 adds list. The Story reads as a UI ticket and will be estimated as one. | `app/api/v1/bugs/route.ts:88,232` · `app/api/v1/bugs/[id]/` |
| G4 | MAJOR | Steps are one text blob with no structure and no stored index of the failing step. Run-step positions are 0-based while the mockup displays 1-based — an off-by-one on the highlight. | `0046*bugs.sql:112` · `0031*runs.sql:167-169` |
| G7 | MEDIUM | Defects in archived modules are hidden by every list, filing against an archived module is deliberately still allowed on the run-linked path, and the bug notification ships a deep link. So unreachable-by-navigation defects exist that a notification can still link to. Undecided. | `0051` / `0046` / `0052` inner joins · `0057*bug*notification*deep*link.sql` |
| G8 | MEDIUM | Assignee is stored and the defects list already renders its column, but the Details panel omits it. AC4 forbids the assignment CONTROL, not the data. The developer persona this Story names cannot confirm the defect is theirs. | `0054*bug*assignment_status.sql:78-79` · `BugsListView.tsx:744` |
| G9 | MEDIUM | The Story's Context names "when it was filed or last updated" among the stranded fields; no AC and no Scope line carries `updated*at`. On a read-only record it moves only via BK-264, which arguably makes it the more useful timestamp for a triager. | `0046*bugs.sql` updated_at trigger |
| G10 | LOW | The identifier vocabulary in the ACs and mockup does not exist. Ids are uuids, rendered by the list as an 8-character prefix with the full value on hover; `modules` has no code column. Every identifier assertion is unwritable until this is fixed. | `BugsListView.tsx:775-777` · `lib/bugs/list-view.ts:119` · `0002*projects*modules.sql:109-121` |
| G11 | LOW | AC5's rationale lives only in a Jira comment. A developer reading only the criterion will treat the Run cell as a bug and "fix" it toward the run report. | comment on this ticket, 2026-08-10 |

## Internal contradictions

1. Context vs AC1 — the Context enumerates the eight stored fields and Expected/Actual is not among them; AC1 requires showing them.
2. AC2 vs Scope — a standalone defect shows "its full record exactly as filed", yet the Details panel demands two fields it cannot have.
3. Story motivation vs Scope — justified partly by "a developer who was just assigned one", and assignee is omitted from the record.

## Coverage estimate — 34 outlines

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 9 | Two record shapes by header / body / origin, plus both list entry points |
| Negative | 9 | Authorization and not-found axis, the read-only assertions, the evidence-scheme case |
| Boundary | 7 | Evidence 0 and 10, empty steps, failing step at position 0, module depth 1 and 6, null description |
| Integration | 6 | Orphaned provenance, archived module, notification deep link, status and severity matrices |
| API | 3 | 200 shape, 404 cross-workspace, 401 unauthenticated |

Rationale: the UI is one read-only page, so the count is not driven by surface area. It is driven by the state matrix — run-linked / standalone / orphaned provenance, active or archived module, three entry points, and four reader roles including one from another tenant. Roughly a third of the outlines cover behaviour the Story does not currently specify; that block is the direct output of G6.

## Critical Questions for PO — these block estimation

1. ***Expected vs Actual******:****** cut, capture, or derive?*** Recommendation: cut from this Story and open a separate one to capture at filing time. Deriving from `run_steps.expected` is cheap but silently changes what the field means and leaves standalone defects with an empty panel.
2. ***What do layer and environment show for a standalone defect?*** Recommendation: drop both rows. Neither is a defect attribute today and inventing them here expands the schema by the back door.
3. ***A defect in an archived module******:****** render it, or 404?*** Recommendation: render it. A notification that leads to a dead page is worse than a record unreachable by navigation. Either way the decision belongs in Business Rules.
4. ***What identifier does the record show?*** Recommendation: keep the list's existing treatment (8-character prefix, full value on hover) and rewrite the criteria against it. A readable defect sequence is a schema change plus a backfill — its own Story.

## Technical Questions for Dev

1. How is the steps blob split into numbered items, and is the displayed number 0-based or 1-based? Nothing stores the failing step's index within the blob.
2. Which composer does the read RPC extend? Extending `bunkai*bug*json` keeps list and detail in one shape; a second composer guarantees drift.
3. Does the route re-check `project_id` against the resolved project slug? RLS gates only by workspace.
4. What renders in an evidence row, given only a URL is stored, and what is the open target?
5. Should the filing-time evidence schema be tightened as well as the render path?

## Suggested Story improvements

| Current state | Suggested change |
| --- | --- |
| Scope names the route only | Add the read RPC and `GET /api/v1/bugs/{id}` |
| Criteria use BUG-101 / RUN-451 | Use the real identifier treatment |
| Five happy-path criteria | Add the four negative criteria (E-1 to E-4) |
| "each evidence row can be opened" | Add: only http and https render as links |
| Details panel lists layer and environment | Drop both; add assignee |
| AC2 covers "filed standalone" only | Split into "filed manually" and "origin no longer available" |
| AC5's rationale lives in a comment | Move one clause into Business Rules |

## Risks

| Risk | Likelihood | Impact | Mitigated by |
| --- | --- | --- | --- |
| Cross-tenant defect content readable, or existence inferable through a 403 | Medium | High | Negative outlines E-1 to E-3 plus the API 404 and 401 |
| Stored XSS via a `javascript:` evidence URL | Medium | High | Negative outline on inert non-http links |
| Ships with an empty Expected/Actual panel because G1 was never resolved | High | Medium | Gated at source by Critical Question 1 |
| Off-by-one on the failing-step highlight | High | Medium | Boundary outline: failing step at position 0 |
| Estimate misses the backend leg entirely | High | Medium | Suggested improvement 1, not a test |
| Notification deep link dead-ends on an archived-module defect | Low | Medium | Integration outlines: archived module, deep link |

## Data feasibility

Flagged DATA-FEASIBILITY-RISK at selection and still flagged after refinement. Missing from the entity: `expected`, `actual`. Belonging to a different entity: `layer`, `environment`. Missing structure: per-step records and the failing-step index. Missing metadata: evidence filename, kind and size. Missing contract: the single-defect read endpoint and RPC.

## Recommended testing strategy

Before implementation, get PO answers on questions 1 and 2 — they change the size, not the wording — and settle the 404-not-403 convention with Dev against the in-repo precedent so it is implemented once rather than argued twice.

During implementation, ask Dev to seed the state matrix as fixtures: run-linked, standalone, orphaned run, orphaned ATC, archived module, evidence at 0 and at 10. Six rows created once unblock the entire Integration and Boundary block.

In sprint, run API first, then the negative and authorization block, then the UI positives. Cross-tenant checks need two real sessions in different workspaces; editing a uuid inside one session exercises row-level security only, not the route's own project check.

## Next steps

- PO answers Critical Questions 1 to 4 before sprint planning
- Dev answers Technical Questions 1 to 5 before estimation
- Story enters the sprint at Ready For Dev once estimated
- When the Story reaches Ready For QA, `/sprint-testing` detects the `shift-left-reviewed` label, short-circuits refinement and starts from the 34 outlines above

Full refinement document (Phases 1 to 5, per-outline names, complete edge-case table) is kept as the QA working copy at `.context/PBI/epics/EPIC-BK-31-bugs-defect-heatmap/stories/STORY-BK-337-tms-defect-detail-open-a-defect-and-read-its-full-/shift-left-refinement.md`.

---
_Synced from Jira by sync-jira-issues_
