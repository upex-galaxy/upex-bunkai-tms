# BK-36 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

1. 

****Date:***** 2026-07-08 | *****Tester:***** Nahuel Gomez | *****Environment:***** Staging | *****Modality:**** Manual (UI)

—

1. 

[https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34) (Start a run) is deployed. Full abort E2E flow functional.

—

1. 

| Test  | Result  | Evidence  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| AC-1: Create run in Staging env  | ✅ PASS  | Run `5b3f5d94-2f4d-4866-946a-a835b625ae16` created via UI  |
| AC-2: Abort dialog renders with reason field, 0/500 counter  | ✅ PASS  | Abort dialog: "This closes the run and skips every step not yet executed."  |
| AC-3: Abort with valid reason (≥3 chars)  | ✅ PASS  | Reason "QA testing abort flow - environment test" accepted  |
| AC-4: Run transitions to `aborted` state  | ✅ PASS  | Status badge: `aborted`, 100% complete (1/1 steps)  |
| AC-5: Abort reason visible on run detail  | ✅ PASS  | "Abort reason" field shows entered text  |
| AC-6: Pending step auto-skipped on abort  | ✅ PASS  | Step "Validate login returns 200" marked as result of abort  |

—

1. 

- ****Screenshot (pre-abort):**** Attached: bk36-run-before-abort.png
- ****Screenshot (post-abort):**** Attached: bk36-run-aborted.png
- ****Run URL:**** [https://staging-upexbunkai.vercel.app/projects/test-project/runs/5b3f5d94-2f4d-4866-946a-a835b625ae16](https://staging-upexbunkai.vercel.app/projects/test-project/runs/5b3f5d94-2f4d-4866-946a-a835b625ae16)
- ****Test URL:**** [https://staging-upexbunkai.vercel.app/projects/test-project/tests/3aed9873-52bc-463d-b03f-47f64073bcb8](https://staging-upexbunkai.vercel.app/projects/test-project/tests/3aed9873-52bc-463d-b03f-47f64073bcb8)

—

1. 

Allure Report (automated tests): [https://nelgoez.github.io/bunkai-qa-engineering/](https://nelgoez.github.io/bunkai-qa-engineering/)

Related automated test candidates for [https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36](https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36)/abort flow should be prioritized in Stage 5 (test-automation).

—

1. 

- Only 1-ATC test exercised. Multi-ATC test needed for full P-01 outline coverage.
- Abort-reason boundary tests (2-char reject, whitespace-only) not executed in this session.
- Trifuerza DB validation (run_steps.result = 'skipped') not performed in this session.

---
_Synced from Jira by sync-jira-issues_
