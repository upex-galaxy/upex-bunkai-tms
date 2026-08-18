# BK-23 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-23)

## Acceptance Test Results (ATR) — BK-23

***Environment******:*** staging (`https://staging-upexbunkai.vercel.app`)
***Result******:*** PASSED — 17/17 applicable TCs

| TC / Check | Verdict |
| --- | --- |
| TC11 / TC10 — custom title via `new_title` | PASSED |
| UI Duplicate action — detail toolbar (BK-185) | PASSED |
| UI Duplicate action — explorer context menu (BK-185) | PASSED |
| TC02 — 0-step ATC duplicate | DESCOPED — structurally impossible (`POST /atcs` with `steps:[]` → `422 validation_failed`) |
| TC03 — 0-assertion ATC duplicate | PASSED |
| AC1 — steps + assertions copied | PASSED |
| AC4 — copy independence (UI-level check) | PASSED |
| TC17 — 404 for non-existent source | PASSED |
| DB leg — AC4 row-level isolation | GAP, non-blocking — `DBHUB_*` unset in `.env`, recommend a DB spot-check once configured |

***Defects verified fixed******:*** BK-184 (field name — `new_title` is the correct, documented contract; `title` is intentionally ignored), BK-185 (UI Duplicate action, both entry points).

***Verdict******:*** GO — QA Approved.

---
_Synced from Jira by sync-jira-issues_
