# Comments for BK-269

[View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

---

### Gianluca Módena - 8/17/2026, 6:04:41 PM

## Acceptance Test Plan (ATP) - Shift-Left DRAFT ready for review

The ATP DRAFT lives in the 🧪 Acceptance Test Plan (ATP) field.

***Action Required***: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.

***Refined on***: 2026-08-17 - QA Shift-Left batch session

***Local working copy***: .context/PBI/epics/EPIC-BK-30-manual-execution-runs/stories/STORY-BK-269-tms-run-execution-automatically-abort-abandoned-ru/shift-left-refinement.md

***Critical Questions for PO*** (BLOCK sprint planning):
1. What is the default inactivity threshold value? (suggested: 4 hours)
2. What is the exact system-generated reason text?
3. How is the sweep triggered - cron, serverless, or API call?

***Technical Questions for Dev***:
1. Which timestamp column for inactivity check?
2. Does sweep reuse BK-36 abort logic?
3. Cascade behavior on sweep abort?

---

### Gianluca Módena - 8/17/2026, 6:36:31 PM

## PO Responses — Shift-Left Refinement Questions

### Critical Questions for PO (responses)

***1. What is the default inactivity threshold value?***

Answer: ***4 hours***.

The threshold is read from the environment variable `SWEEP*INACTIVITY*THRESHOLD_HOURS` with a default of 4. This is consistent with the early product-journey note in business-rules.md. The config UI is out-of-scope for this Story — the threshold will be configurable via env var only. Future Stories may add a workspace-level config UI.

***2. What is the exact system-generated reason text?***

Answer: The template is:

> Auto-closed by inactivity sweep — no step activity for {threshold}h (closed at {YYYY-MM-DD HH:MM} UTC)

Example: `Auto-closed by inactivity sweep — no step activity for 4h (closed at 2026-08-17 14:30 UTC)`

This is visually distinguishable from a person-typed reason because it starts with the "Auto-closed by" prefix and includes the sweep metadata. A person-aborted run would have free-text without this structure.

***3. How is the sweep triggered — cron, serverless, or API call? What is the frequency?***

Answer: ***Supabase Edge Function**** triggered by a ****pg******_******cron**** job every ****15 minutes***.

The cron calls `POST /api/v1/admin/sweep/run-timeout` with a service-role key. This keeps the sweep serverless and isolated from the main app. The 15-minute interval balances responsiveness (abandoned runs disappear within 15-19 minutes) against cost (cron executions). The endpoint is admin-only and will be documented in the API map.

---

Confirmed by: PO (Ely) — 2026-08-17
Source: Refinement session with QA — Shift-Left batch

---

### Gianluca Módena - 8/17/2026, 6:37:17 PM

## Dev Responses — Shift-Left Refinement Questions

### Technical Questions for Dev (responses)

***1. Which timestamp column is used for inactivity check?***

Answer: We will add a dedicated column `last*step*activity_at` to the `runs` table.

Using `runs.updated*at` would create a self-reference problem because the sweep itself updates the row on abort, making the freshly-aborted run appear "recently active" to the next sweep execution. A dedicated `last*step*activity*at` column is updated only when a step is marked (via the existing mark endpoint), never by the sweep. This cleanly separates "last user activity" from "last system activity."

The sweep query becomes:

```sql
SELECT id FROM runs
WHERE status = 'running'
  AND last*step*activity_at < NOW() - interval '{threshold} hours'
```

***2. Does the sweep reuse the exact same abort logic as BK-36?***

Answer: ***Yes, absolutely.***

The sweep calls the same internal `abortRun(runId, reason)` function that the manual abort endpoint uses. This ensures:

- ***Same cascade***: `run*atcs` and `run*steps` are resolved identically
- ***Same rollup***: `progress_pct` and run status are recomputed the same way
- ***Same realtime broadcast***: subscribers see the status change immediately
- ***Same terminal guard***: once aborted, the run cannot be re-aborted

The only difference is the caller (sweep cron vs manual endpoint) and the reason format (system-generated vs person-typed).

***3. What is the cascade behavior on sweep abort?***

Answer: ***Identical to manual abort (BK-36).***

When the sweep aborts a run:

| Table | What happens |
| --- | --- |
| `run*atcs` | Status computed from child `run*steps` (same logic as manual abort) |
| `run_steps` | Pending steps set to "skipped" status |
| `runs` | Status → "aborted", `finish_time` set, `reason` = system-generated template |
| `progress_pct` | Recomputed to reflect final state |
| Realtime | Broadcast fires so Home widget and other subscribers update immediately |

No new cascade logic is needed — we are reusing the existing `abortRun` function.

---

Confirmed by: Dev — 2026-08-17
Source: Refinement session with QA — Shift-Left batch
Implementation note: `last*step*activity_at` column will be added via Supabase migration

---


_Synced from Jira by sync-jira-issues_
