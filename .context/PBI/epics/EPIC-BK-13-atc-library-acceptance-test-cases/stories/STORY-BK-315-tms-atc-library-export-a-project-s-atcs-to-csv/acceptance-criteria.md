# BK-315 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-315)

### Original AC1 — Normal export (12 ATCs)

#### Scenario 1.1: Should export one CSV row per ATC with all 7 columns populated for a 12-ATC library (Type: Positive, Priority: Critical)

- ***Given***: Project "Checkout Revamp" has exactly 12 ATCs in its library; requester is an active Member of the workspace
- ***When***: requester triggers "Export as CSV" for that Project
- ***Then***: a CSV file downloads with exactly 12 data rows + 1 header row; every row has non-empty ATC ID, Slug, Title, Module, Layer, Status values (Tags may be empty)

#### Scenario 1.2: Should export exactly one data row when the Project has exactly 1 ATC (Type: Boundary, Priority: High)

- ***Given***: Project has exactly 1 ATC
- ***When***: export is triggered
- ***Then***: CSV has 1 header row + 1 data row — the lower non-empty boundary, distinct from the 0-ATC case (AC2) and the "several" case (AC1's literal 12)

#### Scenario 1.3: Should always emit columns in the fixed order ATC ID, Slug, Title, Module, Layer, Tags, Status (Type: Positive, Priority: High)

- ***Given***: any Project with ≥1 ATC
- ***When***: export is triggered
- ***Then***: header row is exactly `ATC ID,Slug,Title,Module,Layer,Tags,Status` in that order, with no configuration affecting it

#### Scenario 1.4: Should join multiple tags for one ATC into a single Tags cell — ***NEEDS PO/DEV CONFIRMATION*** (delimiter unspecified) (Type: Positive, Priority: Medium)

- ***Given***: an ATC has tags `["smoke", "regression", "critical-path"]`
- ***When***: export is triggered
- ***Then***: the Tags cell contains all 3 tags joined by a single delimiter TBD — inferred candidate: `"smoke; regression; critical-path"` (semicolon-space, chosen so the delimiter itself never forces quoting)

#### Scenario 1.5: Should pass through each valid ATC status value verbatim (Type: Positive, Priority: Low, ***Parametrized***)

- ***Given***: 6 ATCs, one per valid `status` enum value (`pass`, `fail`, `blocked`, `skipped`, `running`, `unrun`)
- ***When***: export is triggered
- ***Then***: each row's Status cell exactly matches its ATC's status — one parameterized outline, 6 data rows (same behavior, only the value varies — collapsed per doctrine's parametrization rule, not exploded into 6 outlines)

### Original AC2 — Empty ATC library

#### Scenario 2.1: Should export a header-only CSV for a Project with zero ATCs (Type: Boundary, Priority: Critical)

- ***Given***: Project has 0 ATCs; requester is an active Member
- ***When***: export is triggered
- ***Then***: CSV downloads with exactly 1 row — the header — and 0 data rows (lower boundary, n=0, distinct from Scenario 1.2's n=1)

#### Scenario 2.2: Should show no error indicator when exporting an empty library (Type: Positive, Priority: Medium)

- ***Given***: same 0-ATC Project as 2.1
- ***When***: export is triggered
- ***Then***: no error toast/banner is rendered; UI treats the empty export as a normal success, not a failure state

### Original AC3 — Access denial (non-disclosure)

#### Scenario 3.1: Should return 404 "Project not found" for a Project in a workspace I am not an active member of (Type: Negative, Priority: Critical)

- ***Given***: requester is authenticated but holds no `workspace_members` row for the target Project's workspace
- ***When***: requester attempts to export that Project's ATC library
- ***Then****: `404` with body ````` — no export produced, no distinguishing detail (****Grounded in precedent***: matches `mapCoverageRpcError`'s confirmed `P0002` handling in the sibling `coverage` endpoint)

#### Scenario 3.2: Should return the identical 404 for a nonexistent Project ID (Type: Negative, Priority: Critical — EP, distinct invalid partition from 3.1)

- ***Given***: the Project ID in the export request does not exist at all
- ***When***: export is attempted
- ***Then***: same `404` / `not_found` / "Project not found." shape as 3.1 — a nonexistent ID and a foreign-workspace ID must be indistinguishable to the caller

#### Scenario 3.3: Should return the identical 404 for a former member removed from the workspace (Type: Negative, Priority: Critical — EP, distinct invalid partition from 3.1/3.2)

- ***Given***: requester previously had an active `workspace_members` row for the Project's workspace but has since been removed/deactivated
- ***When***: export is attempted
- ***Then***: same `404` shape — "was never a member," "no longer exists," and "removed" all collapse into one response

#### Scenario 3.4: Should return 401 for a completely unauthenticated request — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative, Priority: Critical)

- ***Given***: request carries no cookie session and no Bearer PAT
- ***When***: export is attempted against any Project ID (existing or not)
- ***Then***: `401` — distinct from the `404` non-disclosure path used for an authenticated-but-unauthorized caller (3.1–3.3); Story does not state this distinction, inferred from the documented hybrid auth model (`business-api-map.md`)

#### Scenario 3.5: Should not otherwise leak Project existence via response shape or timing across 3.1–3.3 (Type: Negative/Edge, Priority: Medium — Error Guessing security charter)

- ***Given***: the three distinct denial causes in 3.1–3.3
- ***When***: each is attempted independently
- ***Then***: response body, headers, and approximate latency are indistinguishable from one another (time-boxed exploratory charter, not a strict assertion)

### Original AC4 — Special-character escaping in Title

#### Scenario 4.0: Should correctly export a Title containing a comma, a double quote, and a line break combined (Type: Positive, Priority: Critical — literal restatement of original AC4)

- ***Given***: an ATC titled `Login "fails", when\npassword is empty`
- ***When***: export is triggered
- ***Then***: the row opens correctly in a spreadsheet — the Title cell is quoted, the embedded `"` is doubled (`""`), the comma and line break stay inside the quoted cell and do not split columns or rows

#### Scenario 4.1: Should quote a Title containing only a comma (Type: Boundary, Priority: High — EP, isolated single-character class)

- ***Given***: an ATC titled `Login, then verify session`
- ***When***: export is triggered
- ***Then***: Title cell is quoted; comma does not split the column

#### Scenario 4.2: Should quote and double an embedded quote in a Title containing only a double quote (Type: Boundary, Priority: High — EP, isolated single-character class)

- ***Given***: an ATC titled `Click "Submit" button`
- ***When***: export is triggered
- ***Then***: Title cell is quoted; `"` becomes `""` inside the cell

#### Scenario 4.3: Should quote and preserve a Title containing only a line break (Type: Boundary, Priority: High — EP, isolated single-character class)

- ***Given***: an ATC titled `Login fails\nwhen offline`
- ***When***: export is triggered
- ***Then***: Title cell is quoted; the line break is preserved inside the quotes, not stripped or turned into a literal `\n`

#### Scenario 4.4: Should correctly escape a Title AND a joined-Tags cell in the SAME row when both contain special characters — ***NEEDS PO/DEV CONFIRMATION*** (Type: Boundary, Priority: High — Decision Table, interaction not covered by original AC)

- ***Given***: an ATC titled `Order "fails", edge-case` AND tagged with tags whose joined text also contains a comma
- ***When***: export is triggered
- ***Then***: both cells escape independently per RFC4180 without breaking the row's column count — decision table below enumerates the interaction:

| # | Title has special chars? | Tags cell has special chars? | Expected |
| --- | --- | --- | --- |
| 1 | No | No | Baseline — neither cell quoted |
| 2 | Yes | No | Only Title cell quoted (covered by 4.0–4.3) |
| 3 | No | Yes | Only Tags cell quoted (new — not covered by any original AC) |
| 4 | Yes | Yes | ***Both cells quoted independently; row integrity unaffected (this scenario)*** |

#### Scenario 4.5: Should escape a single Tag's own text if it contains a comma, quote, or line break — ***NEEDS PO/DEV CONFIRMATION*** (Type: Boundary, Priority: High)

- ***Given***: an ATC has a tag whose own text is `"urgent, blocker"`
- ***When***: export is triggered
- ***Then***: the joined Tags cell is quoted and the embedded comma/quote is escaped per the same rule as Title — assumes tag free-text permits these characters, which the Story does not confirm

### Original AC5 — Large ATC library

#### Scenario 5.1: Should include every row without truncation for a representative large library (Type: Boundary, Priority: Critical)

- ***Given****: Project has 500 ATCs (representative reading of "several hundred") — ****NEEDS PO/DEV CONFIRMATION*** on whether 500 is the intended representative size
- ***When***: export is triggered
- ***Then***: CSV has exactly 501 rows (1 header + 500 data); no row missing, none truncated

#### Scenario 5.2: Should behave predictably at a very large ATC count — ***NEEDS PO/DEV CONFIRMATION*** (Type: Boundary, Priority: High)

- ***Given***: Project has 5,000+ ATCs
- ***When***: export is triggered
- ***Then***: either succeeds completely, degrades gracefully with a stated limit, or returns an explicit error — Story states no upper bound (Gap #1), so expected behavior is undefined pending PO/Dev answer

#### Scenario 5.3: Should not time out or produce a partial/corrupted file under slow generation — ***NEEDS PO/DEV CONFIRMATION*** (Type: Negative/Edge, Priority: High — Error Guessing anomaly)

- ***Given***: export generation takes an unusually long time (large library or degraded backend)
- ***When***: the client waits for the download
- ***Then***: either completes correctly or fails cleanly with a visible error — never delivers a silently truncated/corrupted CSV; no performance budget stated (Gap #2)

#### Scenario 5.4: Should handle repeated "Export as CSV" triggers without duplicate or stuck downloads — ***NEEDS PO/DEV CONFIRMATION*** (Type: Edge, Priority: Medium — Error Guessing, U5 idempotency)

- ***Given***: user double-clicks "Export as CSV" before the first download completes
- ***When***: both clicks register
- ***Then***: expected: trigger disables while generating, single download fires (Edge case #1 from Phase 2) — not stated in Story

---
_Synced from Jira by sync-jira-issues_
