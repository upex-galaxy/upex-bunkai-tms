# BK-88 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

# ATR — [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88): Settings | Manage Personal Access Tokens

***Status:*** PARTIAL FAIL — API-only surface tested; UI surface deferred ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) dependency)
***Session date:*** 2026-06-12
***Tester:*** Carlos Chiavassa
***Environment:*** staging ([https://staging-upexbunkai.vercel.app](https://staging-upexbunkai.vercel.app/))

---

## Execution Scope

| ***Surface**** | ****Status**** | ****Reason*** |
| --- | --- | --- |
| API (POST / GET / DELETE /api/v1/tokens) | Partial — TC08 executed | Cookie session required for POST/DELETE; TC08 confirmed via DB evidence |
| UI (PAT tab in Settings Hub) | Deferred | [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) Settings Hub not shipped (Ready For Dev) |

---

## TC08 — Privilege Escalation ([https://jira.upexgalaxy.com/browse/BK-127#icft=BK-127](https://jira.upexgalaxy.com/browse/BK-127#icft=BK-127))

***Outline:*** POST workspace:admin scope by member-role user → 403 Forbidden
***Result:**** ****FAIL***

|  |  |
|  |
| Expected | HTTP 403 Forbidden — member role cannot issue workspace:admin tokens |
| Actual | HTTP 201 Created — no role check on scope issuance (confirmed via DB) |
| Evidence | 19 active workspace:admin PATs for member-role user (user 2742da39, member in 2 workspaces); workspace_id=NULL (unscoped — admin access across all workspaces); 136 active workspace:admin PATs total across 24 staging users |
| Execution note | POST /api/v1/tokens requires cookie session (chicken-and-egg protection). Bearer PAT returns 403 "Use a browser session." TC08 confirmed via DB cross-join: member-role user holds active workspace:admin tokens with no 403 enforcement on scope issuance. |
| Bug filed | [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135) (severity: crítica, type: security) |

---

## TCs Not Executed (UI-deferred + execution scope)

The following 13 TCs were created in Stage 1 but not executed in this session. They require either:

- ***Cookie session*** (POST/DELETE endpoints): [https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120](https://jira.upexgalaxy.com/browse/BK-120#icft=BK-120), [https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122](https://jira.upexgalaxy.com/browse/BK-122#icft=BK-122), [https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123](https://jira.upexgalaxy.com/browse/BK-123#icft=BK-123), [https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125](https://jira.upexgalaxy.com/browse/BK-125#icft=BK-125), [https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126](https://jira.upexgalaxy.com/browse/BK-126#icft=BK-126), [https://jira.upexgalaxy.com/browse/BK-128#icft=BK-128](https://jira.upexgalaxy.com/browse/BK-128#icft=BK-128), [https://jira.upexgalaxy.com/browse/BK-129#icft=BK-129](https://jira.upexgalaxy.com/browse/BK-129#icft=BK-129), [https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131](https://jira.upexgalaxy.com/browse/BK-131#icft=BK-131), [https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132](https://jira.upexgalaxy.com/browse/BK-132#icft=BK-132), [https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133](https://jira.upexgalaxy.com/browse/BK-133#icft=BK-133)
- ***GET Bearer*** (ready to execute, deferred to full session): [https://jira.upexgalaxy.com/browse/BK-121#icft=BK-121](https://jira.upexgalaxy.com/browse/BK-121#icft=BK-121), [https://jira.upexgalaxy.com/browse/BK-124#icft=BK-124](https://jira.upexgalaxy.com/browse/BK-124#icft=BK-124), [https://jira.upexgalaxy.com/browse/BK-130#icft=BK-130](https://jira.upexgalaxy.com/browse/BK-130#icft=BK-130)
- ***UI surface*** ([https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) dependency): all 17 UI-deferred outlines

---

## Open Defects

| ***Bug**** | ****Summary**** | ****Severity**** | ****Status*** |
| --- | --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135) | POST /api/v1/tokens issues workspace:admin tokens to member-role users without 403 enforcement | Crítica | Open |

---

## Verdict

***PARTIAL — API security gap confirmed.*** [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88) cannot receive QA sign-off until:

1. [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135) is fixed and verified (privilege escalation — workspace:admin scope issuance ungated)
2. Full API execution (POST/DELETE flows) with cookie session
3. UI surface testing after [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) ships

Story remains in ***Ready For Dev***.

---
_Synced from Jira by sync-jira-issues_
