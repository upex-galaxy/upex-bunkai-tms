# BK-50 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50](https://jira.upexgalaxy.com/browse/BK-50#icft=BK-50) — Export the assembled chain as a read-only snapshot

***Status***: Refined — Awaiting PO Estimation
***Refined on***: 2026-07-09

## Phase 1 — Critical Analysis

### Business context

Primary persona: QA Lead. Secondary: external auditors/stakeholders. Business value: compliance and audit workflows without granting system access to external parties.

### Technical context

Frontend: new export trigger + snapshot retrieval view. Backend: new export endpoint, no existing PDF/document-generation libraries installed. Depends on [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) chain assembly.

### Story complexity

Business logic: Medium. Integration: Medium (depends on [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45)). Data validation: High (immutability concern). UI: Low-Medium.

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

| ***Type**** | ****Count*** |
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
Integration: RLS/tenant-scoping enforcement, [https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) format changes.

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

Confirmed DATA-FEASIBILITY-RISK: No chain assembly exists ([https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45](https://jira.upexgalaxy.com/browse/BK-45#icft=BK-45) not implemented). No export tooling in codebase.

---

# Acceptance Test Plan — In-Sprint (Stage 1)

***Authored****: 2026-08-09 · ****Environment****: staging · ****Modality****: jira-native · ****QA***: Benjamin Segovia

> ***INFO:*** This section SUPERSEDES the Shift-Left DRAFT above for execution purposes. The DRAFT is retained as the pre-sprint record. All three "Critical Questions for PO" and the storage/retention Dev question it raised were closed by the Option E ratification in comments 12238/12239: a synchronous client-initiated download of a self-contained HTML document, no storage, no retention, no anonymous path. The DRAFT's `DATA-FEASIBILITY-RISK` ("no chain assembly exists") is also stale — BK-45 shipped and is QA Approved.

## 1. What is under test

The Export snapshot action on `/projects/{slug}/traceability?story={id}`, shipped in PR #145 (merge `7b16c0c`, verified ancestor of `origin/staging`). It renders the assembled chain synchronously from BK-45's existing authenticated `GET /api/v1/projects/{id}/traceability` route and hands the browser a self-contained HTML document named `trace-<story>-YYYYMMDD-HHMM.html`.

The deliverable is a ***downloaded file***, not a rendered screen. Every fidelity assertion below is made against the opened file, offline — a screenshot of the toast proves only that a click happened.

## 2. Risk triage

| Axis | Assessment |
| --- | --- |
| Money / billing | Not touched |
| Data integrity | Read-only path; no writes, no migration |
| Auth / tenancy | ***Touched*** — export reuses the RLS-scoped traceability route; cross-workspace non-disclosure is in scope |
| External integration | Not touched |
| State machine | Not touched |
| Calculation | Not touched |

***Risk score******:****** 4 (MEDIUM).*** Driven entirely by the auth/tenancy axis. AC1.2 and E2 are therefore priority items and get exercised on both the browser and the API path.

## 3. Pre-planning code reading (findings that shaped this plan)

- ***The D27 six-value run-state divergence cannot reach the export.*** `lib/traceability/export-snapshot.ts:198` renders the run cell through `runChipLabel()` imported from the shared chain-view mapper, emitted as plain escaped text with no per-state CSS variant. The five-variant chip CSS that D27 flags lives in the mockup and the on-screen component, not here. Verified, not assumed — carried into TC-03 as a confirmation, not as a suspected defect.
- `buildSnapshotFilename`*** owns the ****`.html`**** extension*** — divergence D26, ratified 2026-08-08. Not a finding; TC-23 is a scope guard only.
- ***Filename granularity is one minute*** (`YYYYMMDD-HHMM`). Two exports of the same story inside the same clock minute produce an identical filename. This is a genuine boundary the ticket's own AC2.2 does not address, and it is why TC-14 exists.

## 4. Test case outlines

Priority: ***C****ritical · ****H****igh · ****M****edium · ****L***ow. Technique: EP = equivalence partition, BVA = boundary, ST = state transition, EG = error guessing.

### AC1 — Export an evidence chain

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-01 | Populated story with mixed pass/fail ATCs exports a file containing every AC, ATC, Test, Run and Defect visible on screen | H | EP |
| TC-BK50-02 | Exported document header carries workspace, project and story identity plus the export timestamp | H | EP |
| TC-BK50-03 | All six run states (`pass`/`fail`/`blocked`/`skipped`/`aborted`/`running`) render as readable labels in the file, none blank | H | EP |
| TC-BK50-04 | An ATC bound to two ACs appears under each AC in the file, matching the on-screen no-dedupe rule | M | EP |
| TC-BK50-05 | An ATC with multiple linked defects lists each with ID, title and status | M | EP |
| TC-BK50-06 | Partial coverage — ATCs bound but no run recorded — carries the "awaiting data" placeholder into the file, not a blank cell | H | EP |
| TC-BK50-07 | An uncovered AC (zero ATCs bound) carries its "uncovered" indicator into the file, visually distinct from TC-06's placeholder | H | EP |
| TC-BK50-08 | The file is genuinely self-contained: opened with the network disabled it renders fully, issuing zero external requests | C | EG |
| TC-BK50-09 | A story ID belonging to a foreign workspace is rejected with 404 and no file is produced | C | EG |
| TC-BK50-10 | A nonexistent story ID returns the same response as TC-09, so existence is not disclosed by differential behaviour | C | EG |

### AC2 — Snapshot reflects the moment of export

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-11 | Export at T0, then mutate the live chain; re-opening the T0 file still shows the T0 state | C | ST |
| TC-BK50-12 | The timestamp printed inside the document matches the actual export moment, not the file's open time | H | EP |
| TC-BK50-13 | Two exports in quick succession produce two independent files that each open correctly | M | EP |
| TC-BK50-14 | Two exports of the same story inside the same clock minute — filename is minute-granular, so establish whether the second overwrites, auto-suffixes, or silently replaces the first | M | BVA |

### AC3 — Export an empty chain

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-15 | A story with zero acceptance criteria exports prose stating it had no coverage as of the timestamp, not an empty table | H | EP |
| TC-BK50-16 | A story with ACs but zero ATCs anywhere produces a no-coverage document distinct from TC-15's zero-AC case | H | EP |
| TC-BK50-17 | The no-coverage prose itself carries the export timestamp | M | EP |

### E1 — Snapshot survives source-story deletion

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-18 | After the source story is archived or deleted, a previously downloaded file still opens and renders its full chain | H | ST |

### E2 — No anonymous retrieval path

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-19 | Reaching the traceability/export path signed out redirects to login, with no chain data rendered first | C | EG |
| TC-BK50-20 | The underlying API route returns 401 to an unauthenticated caller | C | EG |
| TC-BK50-21 | Scope guard — no hosted artifact, public link, signed URL or share control exists anywhere on the screen or in the response | H | EG |

### E3 — Clear error when chain assembly is unavailable

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-22 | Chain-assembly failure surfaces a clear error and downloads no partial file — ***PRE-DECLARED BLOCKED, see §5*** | M | EG |

### Scope guards

| TC | Outline | Pri | Tech |
| --- | --- | --- | --- |
| TC-BK50-23 | Downloaded filename matches `trace-<story>-YYYYMMDD-HHMM.html` per ratified divergence D26 | L | EP |

***Total******:****** 23 outlines.*** 6 Critical, 10 High, 6 Medium, 1 Low.

## 5. Pre-declared coverage gap — TC-22 (E3)

TC-22 is declared ***BLOCKED before execution***, by QA decision taken at planning time rather than discovered mid-pass.

***Reason.*** E3 requires the chain-assembly endpoint to fail. The traceability fetch executes server-side under SSR on Vercel, outside the browser context where Playwright's `route()` interception operates, and the application exposes no fault-injection flag or environment variable to force a transient failure. This is the identical constraint that blocked TC-21 on BK-45 in the 2026-08-08 session; nothing in this story's delivery changed it.

***What this does and does not mean.**** The error path is not unverified in absolute terms — the client-side retry mechanism was exercised on BK-45 (TC-22 there, PASSED with caveat) and the export's own automated suite covers the error branch at unit level. What is unverified is the end-to-end assertion that a **live* assembly failure produces a clear message and leaves no partial file on disk.

***Carried to***: Stage 4 regression backlog, flagged for re-attempt if a fault-injection affordance is ever added. This is a tooling gap, not a product gap, and it does not gate sign-off.

## 6. Test data requirements

Reuse the fixtures seeded on staging during the BK-45 session rather than re-seeding — they were deliberately left in place for exactly this.

| Need | For | Availability |
| --- | --- | --- |
| Fully covered story, mixed pass/fail, ≥1 defect | TC-01..05 | Seeded on staging (BK-45 session) — confirm at smoke |
| Story with an aborted run and an in-flight run | TC-03 | Seeded (3 runs: Pass / Blocked / Aborted) — confirm |
| Story with mixed covered/uncovered ACs | TC-06, TC-07 | Seeded — confirm |
| Story with zero ACs | TC-15 | Seeded — confirm |
| Story with ACs but zero ATCs | TC-16 | Seeded — confirm |
| A second workspace the test user cannot read | TC-09 | Seeded — confirm |
| A mutable chain element | TC-11 | Requires a write during the session; identify at Stage 2 |

If a fixture is missing at smoke, recreate it before deep exploration rather than adapting the assertion downward.

## 7. Execution order

1. ***Smoke (Go/No-Go)*** — sign in, reach the traceability screen, confirm the Export control is present and fires a download. A failure here is an environment blocker and stops the pass.
2. ***Priority items first*** — TC-08, TC-09, TC-10, TC-11, TC-19, TC-20. These are the Critical set; any failure among them is a candidate blocking defect.
3. ***Fidelity sweep*** — TC-01..07, TC-12, TC-13.
4. ***Boundary and edge*** — TC-14, TC-15..18, TC-21, TC-23.
5. ***Exploration beyond the outlines*** — large chains, unusual characters in story titles reaching the filename, and the file opened in a second browser.

## 8. Definition of done for this stage

- Every outline above carries an execution verdict, or an explicit BLOCKED with a stated reason.
- Every fidelity verdict is backed by the opened file, not by the download event.
- Evidence lands under the story's `evidence/` folder and its paths are surfaced in the session report.

---
_Synced from Jira by sync-jira-issues_
