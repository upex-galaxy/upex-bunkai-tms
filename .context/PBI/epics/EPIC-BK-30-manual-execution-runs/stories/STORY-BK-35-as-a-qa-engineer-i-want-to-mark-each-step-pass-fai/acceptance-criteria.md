# BK-35 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-35)

## Refined Acceptance Criteria — BK-35

### AC1 — Mark a pending step as passed, failed, or blocked

***Scenario 1.1******:****** Should mark a pending step as passed with optional note and evidence link***

- ***Given***: An authenticated QA Engineer with project access is viewing an active (in-progress) Run
- ***When***: The engineer marks step #1 as `passed`, with note `"Login redirects correctly"`, and evidence link `"https://s3.example.com/evidence/screenshot-001.png"`
- ***Then***:

***Scenario 1.2******:****** Should mark a pending step as passed with no note or evidence***

- ***Given***: An active Run with a step in `pending` status
- ***When***: The engineer marks step #1 as `passed` without providing a note or evidence link
- ***Then***: The step result is recorded as `passed`; note and evidence link fields are null/empty; no validation error is raised

***Scenario 1.3******:****** Should mark a pending step as failed***

- ***Given***: An active Run with step #2 in `pending` status
- ***When***: The engineer marks step #2 as `failed`
- ***Then***: Step result is `failed`; parent ATC verdict updates to `failed`

***Scenario 1.4******:****** Should mark a pending step as blocked***

- ***Given***: An active Run with all steps in `pending` status
- ***When***: The engineer marks step #1 as `blocked`
- ***Then****: Step result is `blocked`; ATC verdict does NOT resolve while siblings are still `pending` — ****NEEDS PO CONFIRMATION***

---

### AC2 — ATC verdict derivation (8 combinations for a 2-step ATC)

| Step 1 | Step 2 | Expected ATC verdict |
| --- | --- | --- |
| passed | passed | `passed` |
| failed | failed | `failed` |
| blocked | blocked | `blocked` (if no fail) |
| failed | passed | `failed` |
| passed | failed | `failed` |
| blocked | passed | `blocked` (no fail) |
| passed | blocked | `blocked` (no fail) |
| failed | blocked | `failed` (fail overrides) |

***Scenario 2.1***: All steps pass → ATC verdict = `passed`
***Scenario 2.2***: Any step fails → ATC verdict = `failed` regardless of other steps
***Scenario 2.3***: Steps are blocked and no step failed → ATC verdict = `blocked`
***Scenario 2.4***: Steps include failed + blocked → ATC verdict = `failed`

> ***WARNING:**** Partial-resolution verdict (pending steps still present) is ****undefined in the story*** — NEEDS PO CONFIRMATION before these combinations can be asserted.

---

### AC3 — Run progress percentage

***Scenario 3.1***: Progress advances as steps resolve — formula: resolved steps / total steps

- 4-step Run: after 1 resolved → 25%; after 2 → 50%; after all → 100%

***Scenario 3.2***: Progress reaches exactly 100% when the last pending step is marked

> ***WARNING:**** Whether 100% progress auto-triggers BK-39 finish or remains manual — ****NEEDS PO CONFIRMATION***

---

### AC4 — Real-time update for concurrent observers

***Scenario 4.1***: When User A marks a step, User B's open Run page reflects the update (verdict + progress) without a page refresh

> ***WARNING:**** Real-time transport (Supabase Realtime / SSE / polling) and latency SLA are undefined — ****NEEDS DEV CONFIRMATION***

---

### AC5 — Guard: Run already finished or aborted

***Scenario 5.1***: Attempting to mark a step on a `finished` Run → request rejected, clear message, step NOT recorded, run state unchanged

***Scenario 5.2***: Attempting to mark a step on an `aborted` Run → request rejected, clear message, step NOT recorded

> ***WARNING:**** Exact error message text for each guard case — ****NEEDS PO CONFIRMATION***

---

### AC6 — Last-write-wins for repeated step marking

***Scenario 6.1***: Re-marking an already-marked step updates the step result to the new status and recalculates ATC verdict

***Scenario 6.2***: Re-marking a step that changes the ATC outcome (e.g., passed → failed) immediately recalculates the ATC verdict

---

### Open Gaps (NEEDS PO/DEV CONFIRMATION)

- ***Q1*** — ATC verdict while steps remain `pending` (partial resolution)
- ***Q2*** — Exact error message text for finished/aborted run guard
- ***Q3*** — Does 100% progress auto-trigger BK-39 finish, or is it manual?
- ***Q4*** — Authorization: who can mark steps (any member or only the Run executor)?
- ***Q5*** — Real-time transport mechanism and latency SLA
- ***Q6*** — Step result endpoint shape (URL + method + request/response schema)
- ***Q7*** — Step result mutable (UPDATE) or append-only (INSERT)?
- ***Q8*** — Evidence link: URL string or file upload?

---
_Synced from Jira by sync-jira-issues_
