# BK-498 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-498)

## BK-498 TEST RESULTS

***Tested******:*** 2026-08-21
***Environment******:*** Staging
***Tester******:*** Luis Eduardo Flores Villarroel
***Result******:*** PASSED (15/15 TCs)

### SUMMARY

Verified that all 22 authoring-domain API handlers (Modules, User Stories, Acceptance Criteria, Environments, Milestones, Imports) correctly enforce PAT capability scopes before any database write or read. Tested live against staging using freshly-minted narrow-scope Personal Access Tokens, covering the 4 formal acceptance criteria plus 11 risk-beyond-AC scenarios (unauthenticated requests, revoked tokens, workspace-membership vs capability rejection, browser-session non-regression, and the ratified Imports dual-scope nuance). All 15 test outlines passed with no defects found.

### TEST CASES

| # | Outline | Result |
| --- | --- | --- |
| R1 | Properly-scoped `atc:write` PAT creates a module (AC-01) | PASSED |
| R2 | `atc:read`-only PAT rejected on write, `403`, no DB side effect (AC-03) | PASSED |
| R3 | Unbound `atc:write` PAT succeeds for a real workspace member (AC-07) | PASSED |
| R4 | `atc:read` PAT succeeds reading a non-ATC resource (AC-08a) | PASSED |
| R5 | `atc:write`-only PAT rejected on a read request (read-mirror of AC-03) | PASSED |
| R6 | No `Authorization` header returns `401`, distinct from capability `403` | PASSED |
| R7 | Correctly-scoped PAT rejected with membership-`403`, distinct from capability-`403` | PASSED |
| R8 | Default-scope PAT succeeds on both read and write (non-regression control) | PASSED |
| R9 | Browser session (no PAT) succeeds regardless of PAT scoping (non-regression control) | PASSED |
| R10 | Revoked `atc:write` token returns `401`, distinct from a valid-but-under-scoped `403` | PASSED |
| TC11 | Writes rejected across all 5 remaining families given `atc:read`-only | PASSED |
| TC12 | Writes accepted across all 5 remaining families given `atc:write`-only | PASSED |
| TC13 | Reads accepted across all 5 remaining families given `atc:read`-only | PASSED |
| TC14 | Reads rejected across all 5 remaining families given `atc:write`-only | PASSED |
| TC15 | Full Imports lifecycle (create + poll) succeeds with a dual-scope PAT (positive control) | PASSED |

### CONFIRMED EXPECTED-BEHAVIOR CASES (not findings)

Two results look failure-shaped at first glance but are ratified, correct behavior — called out explicitly so they are never misread as defects:

- ***R7*** returns `403` with reason `"not*a*member"` — a distinct failure surface from R2/R5's capability `403`. Confirms the gate correctly separates "wrong scope" from "not a workspace member" instead of conflating the two.
- ***TC14 (Imports row)*** — a write-only token gets `403` polling `GET /imports/{id}`, and (TC11 row) a read-only token gets `403` on `POST /imports`. This is the deliberate Imports dual-scope split (`POST /imports` = `atc:write`, `GET /imports/{id}` = `atc:read`) ratified by the AI Product Owner on 2026-08-19 — not a regression. TC15 is the positive control proving a dual-scope token completes the full lifecycle end-to-end.

### DB CROSS-VALIDATION

Confirmed both directions of the Definition of Done's "rejected before any change happens" clause via direct staging Postgres reads:

- ***Positive (R1)******:*** the created module row exists in `modules`, matching the `201` response exactly.
- ***Negative (R2, R7, TC11 sweep)******:*** zero side-effect rows across `modules`, `user*stories`, `acceptance*criteria`, `project*environments`, `milestones`, and `import*jobs` for every rejected write — the capability gate structurally rejects before any database write, confirmed empirically, not just by code read.

### TEST DATA

- Project: `BK264 Defect Triage` (workspace `BK-264 QA Sandbox`)
- 4 narrow-scope PATs minted live via cookie session (`atc:write`-only bound, `atc:read`-only bound, `atc:write`-only unbound, `atc:write` revoked)
- Test rows created and left in place per team precedent: 4 `modules`, 1 `user*stories`, 1 `acceptance*criteria`, 1 `project*environments`, 1 `milestones`, 2 `import*jobs` — all under a `QA BK498` / `QA-*` naming prefix with a unix-timestamp suffix

### BUGS FOUND

None.

### OBSERVATIONS

- All 5 session-minted test PATs (4 narrow-scope + 1 auto-minted default from the sign-in call) were revoked at the end of execution — zero leftover test credentials from this session.
- A pre-existing set of un-revoked narrow-scope PATs from a ***prior, unrelated session*** remain in the `BK-264 QA Sandbox` workspace. They are not reusable (only hashes are stored) and are not a security exposure, but flagged for a housekeeping pass outside this ticket's scope.

### RECOMMENDATIONS

- The 15 outlines above (particularly R1-R10 on the Modules anchor and the TC11-TC15 parametrized cross-family sweep) are strong automation candidates for the regression suite once this Story reaches Stage 4 documentation.

---
_Synced from Jira by sync-jira-issues_
