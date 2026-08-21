# BK-337 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

## Acceptance Test Plan (Final) — BK-337

> Supersedes the Shift-Left DRAFT (2026-08-11). Modality: ***Jira-native****. Risk: ****MEDIUM****. Built directly against Acceptance Criteria ****Revision 2*** (the version PO + Tech Lead closed) — every "BLOCKED on G1/A2/A3" note from the draft is resolved and removed.

### Scope

18 acceptance scenarios from the Acceptance Criteria field (AC1.1-1.4, AC2.1, AC3.1-3.4, AC4.1, AC5.1-5.3, E-1..E-6), plus 3 API-contract checks and one risk-beyond-AC addition (severity/status chip matrix across all 4 statuses and severities) carried over from the Shift-Left coverage estimate.

### Test data — staging fixtures

Seeded directly in the staging DB (`bunkai-qa-auto-ec8c39` workspace + 3 role/tenant fixture workspaces), verified end-to-end through `GET /api/v1/bugs/{id}` before execution began.

| Fixture | Bug id | Project slug |
| --- | --- | --- |
| Run-linked, P1, 6 evidence, assignee set, `run_steps.position=2` | `10000000-0000-4000-8000-000000000011` | `new-project-example-qa2` |
| Standalone, 0 evidence | `10000000-0000-4000-8000-000000000012` | `new-project-example-qa2` |
| Standalone, 10 evidence incl. 1 `javascript:` entry | `10000000-0000-4000-8000-000000000013` | `new-project-example-qa2` |
| Standalone, module archived | `10000000-0000-4000-8000-000000000014` | `new-project-example-qa2` |
| Foreign tenant (no membership row) | `10000000-0000-4000-8000-000000000034` | `bk337-foreign-project-qa` |
| Admin-role membership | `10000000-0000-4000-8000-000000000044` | `bk337-admin-project-qa` |
| Viewer-role membership | `10000000-0000-4000-8000-000000000054` | `bk337-viewer-project-qa` |
| Second project, same main workspace, no bug of its own | — | `bk337-project-b-qa` |

Full manifest incl. module/run/run_step ids: `test-session-memory.md` in the story's PBI folder.

### Outlines

| # | Scenario | Precondition | Priority |
| --- | --- | --- | --- |
| AC1.1 | Full header on a run-linked defect (id prefix, severity+status chips with text, full module path, filed-by/at) | Fixture `...011` | High |
| AC1.2 | Description + steps render, no Expected/Actual block anywhere | Fixture `...011` | High |
| AC1.3 | Origin panel states "Failed at step N" = stored 0-based position + 1 | Fixture `...011` (position 2 -> expect "step 3") | High |
| AC1.4 | Origin panel links to both the ATC and the run | Fixture `...011` | High |
| AC2.1 | "Filed manually" notice, no origin links, Details panel exactly 6 fields | Fixture `...012` | High |
| AC3.1 | Evidence count `6 / 10`, 6 rows | Fixture `...011` | Medium |
| AC3.2 | Evidence `0 / 10`, empty state, panel NOT hidden | Fixture `...012` | Medium |
| AC3.3 | Evidence `10 / 10`, no truncation | Fixture `...013` | Medium |
| AC3.4 | `javascript:` entry renders as inert text, never an anchor; http/https entries carry `rel="noopener noreferrer"` | Fixture `...013` | High / Security |
| AC4.1 | Zero editable fields, zero lifecycle controls, verified at ADMIN role specifically | Fixture `...044` (admin-role workspace) | High |
| AC5.1 | Defects-list Bug cell navigates to the detail record | Fixture `...011` via list page | High |
| AC5.2 | Defects-list Run cell navigates to the SAME record, not the run report | Fixture `...011` via list page | High |
| AC5.3 | Bug notification deep link resolves to the same record, run-linked and standalone alike | Code verification (`entity-routes.ts`) + direct URL nav — no notification-row fixture needed, the app creates notifications at the API layer only | Medium |
| E-1 | 404 (not 403) for a defect in another workspace | Fixture `...034` — ***already verified via API******:****** 404*** | High |
| E-2 | 404 for unknown id, 400 for malformed id | Random uuid / `abc` — ***already verified via API******:****** 404 / 400*** | High |
| E-3 | 404 when the id is real but the URL names a different project | Fixture `...011` opened via `bk337-project-b-qa` slug | High |
| E-4 | Viewer-role member reads the full record, zero controls | Fixture `...054` (viewer-role workspace) | Medium |
| E-5 | Archived-module defect renders in full with an "Archived" tag, not 404 | Fixture `...014` | Medium |
| E-6 | Assignee shown, read-only | Fixture `...011` (assignee = QA owner account) | Medium |
| API-1 | `GET /api/v1/bugs/{id}` returns 200, body matches OpenAPI schema | Fixture `...011` — ***already verified******:****** 200, shape correct*** | High |
| API-2 | `GET /api/v1/bugs/{id}` returns 401 with no credentials | No fixture needed — ***already verified******:****** 401*** | High |
| Risk-beyond-AC | Each of the 4 statuses and 4 severities renders its correct chip + text label, never colour alone | Ad-hoc via UPDATE on a throwaway fixture during execution | Low |

### Deliberately out of scope for this ATP (per PO/Tech Lead rulings — not testable, not a gap)

Expected/Actual panel, `layer`/`environment` Details rows, in-list failing-step highlight, `BUG-101`/`RUN-451`-style identifiers. See `context.md` for the full rationale.

### Traceability note (Jira-native)

No separate Xray `Test` work items are created at this stage — TC outlines only, per the Jira-native modality. Regression-worthy scenarios get promoted into real `Test` issues in Stage 4 (`/test-documentation`), ROI-gated.

---
_Synced from Jira by sync-jira-issues_
