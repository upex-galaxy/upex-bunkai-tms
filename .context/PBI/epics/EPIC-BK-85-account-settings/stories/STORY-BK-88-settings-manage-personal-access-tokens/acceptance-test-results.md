# BK-88 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

# ATR — BK-88: Settings | Manage Personal Access Tokens

***Status******:*** PARTIAL FAIL — API-only surface tested; UI surface deferred (BK-87 dependency)
***Session date******:*** 2026-06-12
***Tester******:*** Carlos Chiavassa
***Environment******:*** staging (https://staging-upexbunkai.vercel.app)

---

## Execution Scope

| Surface | Status | Reason |
| --- | --- | --- |
| API (POST / GET / DELETE /api/v1/tokens) | Partial — TC08 executed | Cookie session required for POST/DELETE; TC08 confirmed via DB evidence |
| UI (PAT tab in Settings Hub) | Deferred | BK-87 Settings Hub not shipped (Ready For Dev) |

---

## TC08 — Privilege Escalation (BK-127)

***Outline******:*** POST workspace:admin scope by member-role user → 403 Forbidden
***Result******:****** FAIL***

|  |  |
|  |
| Expected | HTTP 403 Forbidden — member role cannot issue workspace:admin tokens |
| Actual | HTTP 201 Created — no role check on scope issuance (confirmed via DB) |
| Evidence | 19 active workspace:admin PATs for member-role user (user 2742da39, member in 2 workspaces); workspace_id=NULL (unscoped — admin access across all workspaces); 136 active workspace:admin PATs total across 24 staging users |
| Execution note | POST /api/v1/tokens requires cookie session (chicken-and-egg protection). Bearer PAT returns 403 "Use a browser session." TC08 confirmed via DB cross-join: member-role user holds active workspace:admin tokens with no 403 enforcement on scope issuance. |
| Bug filed | BK-135 (severity: crítica, type: security) |

---

## TCs Not Executed (UI-deferred + execution scope)

The following 13 TCs were created in Stage 1 but not executed in this session. They require either:

- ***Cookie session*** (POST/DELETE endpoints): BK-120, BK-122, BK-123, BK-125, BK-126, BK-128, BK-129, BK-131, BK-132, BK-133
- ***GET Bearer*** (ready to execute, deferred to full session): BK-121, BK-124, BK-130
- ***UI surface*** (BK-87 dependency): all 17 UI-deferred outlines

---

## Open Defects

| Bug | Summary | Severity | Status |
| --- | --- | --- | --- |
| BK-135 | POST /api/v1/tokens issues workspace:admin tokens to member-role users without 403 enforcement | Crítica | Open |

---

## Verdict

***PARTIAL — API security gap confirmed.*** BK-88 cannot receive QA sign-off until:

1. BK-135 is fixed and verified (privilege escalation — workspace:admin scope issuance ungated)
2. Full API execution (POST/DELETE flows) with cookie session
3. UI surface testing after BK-87 ships

Story remains in ***Ready For Dev***.

---
_Synced from Jira by sync-jira-issues_
