# BK-50 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

# Shift-Left Refinement: BK-50 — Export the assembled chain as a read-only snapshot

***Status***: Refined — Awaiting PO Estimation
***Refined on***: 2026-07-09

## Phase 1 — Critical Analysis

### Business context

Primary persona: QA Lead. Secondary: external auditors/stakeholders. Business value: compliance and audit workflows without granting system access to external parties.

### Technical context

Frontend: new export trigger + snapshot retrieval view. Backend: new export endpoint, no existing PDF/document-generation libraries installed. Depends on BK-45 chain assembly.

### Story complexity

Business logic: Medium. Integration: Medium (depends on BK-45). Data validation: High (immutability concern). UI: Low-Medium.

## Phase 2 — Story Quality Analysis

### Key ambiguities

- Artifact format undefined (file vs in-app view vs DB-copy)
- Immutability mechanism undefined (deep copy vs static document)
- Export permission gate not defined
- External-auditor access model not defined

### Key gaps

- No snapshot storage/retention policy
- No error path for chain-assembly unavailability
- No large-chain behavior defined (sync vs async)
- No explicit RLS re-verification requirement

## Phase 3 — Refined ACs

### Original AC1 — Export an evidence chain

Scenario 1.1 (Positive, High): Should produce snapshot with full chain when QA Lead exports populated story.
Scenario 1.2 (Negative, High): Should reject export when user has no read access.

### Original AC2 — Snapshot reflects moment of export

Scenario 2.1 (Positive, Critical): Should preserve chain state after live changes.
Scenario 2.2 (Positive, Medium): Should produce independent snapshots on concurrent exports.

### Original AC3 — Export empty chain

Scenario 3.1 (Negative/Edge, High): Should state "no coverage" when chain is empty.

### New scenarios surfaced

Scenario E1 (Edge, High): Should keep snapshot accessible after source story deleted.
Scenario E2 (Negative, High): Should reject unauthorized snapshot view via direct link.
Scenario E3 (Negative, Medium): Should display clear error when chain assembly unavailable.

## Phase 4 — Test Outlines (DRAFT)

### Coverage estimate

| Type | Count |
| --- | --- |
| Positive | 3 |
| Negative | 4 |
| Boundary | 2 |
| Integration | 2 |
| ***Total**** | ****11*** |

### Key outlines

Positive: export full chain, concurrent exports, empty chain no-coverage message.
Negative: unauthorized story export, unauthorized snapshot view, chain unavailable error, deleted story export.
Boundary: large chain (500+ entities), chain mutating mid-export.
Integration: RLS/tenant-scoping enforcement, BK-45 format changes.

## Phase 5 — Edge Cases (DRAFT)

10 edge cases identified. Top: snapshot after source story deletion (High), unauthorized access via guessed link (High), chain assembly down (Medium), race condition mid-export (Medium).

## Critical Questions for PO

1. Export artifact format — file or in-app view?
2. Immutability mechanism — deep copy or static document?
3. Access model — who can export and retrieve?

## Technical Questions for Dev

1. Synchronous vs asynchronous export?
2. Snapshot storage/retention policy?
3. RLS re-verification at export time?

## Data feasibility flags

Confirmed DATA-FEASIBILITY-RISK: No chain assembly exists (BK-45 not implemented). No export tooling in codebase.

---
_Synced from Jira by sync-jira-issues_
