# BUG: Bearer run creation cannot resolve active workspace

**Jira Key:** [BK-182](https://jira.upexgalaxy.com/browse/BK-182)
**Priority:** Medium
**Status:** Open
**Components:** Manual Execution & Runs
**Severity:** Moderada
**Error Type:** Integration
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

# BK-182 Bug Report

> ***ERROR:***  Bearer run creation cannot resolve active workspace.

> ***WARNING:***  AI/CI/PAT callers cannot create Runs through the public `POST /api/v1/runs` endpoint, even when `/api/v1/me` proves the token belongs to an active workspace member. Cookie-session Run creation works; BK-39 finish behavior works with Bearer on existing Runs.

## Summary

Bearer-authenticated Run creation fails workspace-context resolution in staging. This blocks API-first automation workflows from starting new Runs with a PAT, while browser/cookie workflows can still create Runs and Bearer can finish existing Runs.

## Triage Snapshot

| Field | Value |
| --- | --- |
| Severity | Moderada |
| Priority | Medium |
| Error Type | Integration |
| Environment | Staging |
| Frequency | Siempre |
| Related Story | BK-39 |
| Component | Manual Execution & Runs |
| Root Cause Category | Integration Error |
| Fix Type | Bugfix |

## Repro Steps

| # | Action | Expected |
| --- | --- | --- |
| 1 | Authenticate with a valid Bearer PAT including `run:execute`. | Token is accepted. |
| 2 | Call `GET /api/v1/me`. | Response includes active workspace `545d5efe-a168-4f32-a4be-a148a2fc96db`, role `owner`, scopes `atc:read`, `atc:write`, `run:execute`. |
| 3 | Call `POST /api/v1/runs` with valid `test*id`, `environment*id`, `executor*mode`, `start*token`, and `Idempotency-Key`. | Run is created or a specific authorization/validation error is returned. |
| 4 | Repeat Run creation through cookie-session flow. | Run is created successfully, proving the fixture/test data are valid. |

## Expected Result

Bearer callers with valid workspace membership and `run:execute` should resolve workspace context and create a Run, while still enforcing membership and scope checks.

## Actual Result

`POST /api/v1/runs` returns: `No active workspace could be resolved for this request.`

## Evidence

| Evidence | Result |
| --- | --- |
| `/api/v1/me` with Bearer | Authenticated user `bunkai-staging-user@xenievzoau.resend.app`; active workspace present. |
| `POST /api/v1/runs` with Bearer | Fails with `No active workspace could be resolved for this request.` |
| Cookie-session `POST /api/v1/runs` | Creates Runs successfully for BK-39 fixtures. |
| Bearer finish endpoint | `POST /api/v1/runs/{id}/finish` succeeds on existing Runs with `run:execute`. |

## Workaround

> ***SUCCESS:***  For manual QA validation, create the Run through cookie-session UI/API flow, then validate finish behavior with Bearer on that existing Run. This does not unblock AI/CI/PAT Run creation.

## Developer Notes

- Investigate the active-workspace resolver used by `POST /api/v1/runs` for Bearer/PAT requests.
- Keep membership and `run:execute` enforcement intact; do not bypass workspace authorization.
- Compare with the finish endpoint path, which accepted Bearer `run:execute` on existing Runs during BK-39.

## Source Alignment

| Source | Applied Practice |
| --- | --- |
| Atlassian bug report guidance | Explicit severity, environment, steps, expected result, actual result. |
| BrowserStack / QA best practices | Repro from known state, observed vs expected, evidence and environment included. |
| BK board examples from Ely/Nahuel | `Repro`, `Expected`, `Actual`, `Root Cause`, `Impact`, `Related` sections kept concise and actionable. |

---

## 🐞 Actual Result

`POST /api/v1/runs` with a valid Bearer PAT returns `No active workspace could be resolved for this request.` This happens even after `/api/v1/me` confirms an active workspace, role, and `run:execute` scope for the same token.

---

## ✅ Expected Result

Bearer callers with valid workspace membership and `run:execute` should resolve active workspace context and create a Run, while still enforcing membership and scope checks.

---

## 🔍 Root Cause

**Category:** Integration Error

---

## 🚩 Workaround

> ***SUCCESS:***  Manual QA can create the Run through cookie-session UI/API flow, then use Bearer to validate finish behavior on the existing Run. This does not unblock AI/CI/PAT Run creation.

---

## 🧫 Evidence

## Evidence attachments - BK-182

| Evidence | Attachment | Result |
| --- | --- | --- |
| Bearer `/api/v1/me` active workspace | `BK-182-step02-bearer-me-active-workspace.png` | HTTP 200; active workspace `545d5efe-a168-4f32-a4be-a148a2fc96db`; role `owner`; scopes include `run:execute`. |
| Bearer `POST /api/v1/runs` workspace-resolution failure | `BK-182-step03-bearer-run-creation-fails.png` | HTTP 422 `validation_failed`: `No active workspace could be resolved for this request.` |

***Classification******:*** QA-formal product defect represented operationally as Jira issue type `Bug`.

***Scope note******:*** Existing bug report/description unchanged; attachments and inline evidence comment added only.

---

## Related Issues

- relates to: [BK-39](https://jira.upexgalaxy.com/browse/BK-39) - TMS-Run Execution | Finish a run with a final verdict

---

## Metadata

- **Created:** 6/25/2026
- **Updated:** 7/6/2026
- **Reporter:** jesusgpythondev
- **Assignee:** Ely
- **Labels:** bk-39-follow-up, pat, run-creation, workspace-resolution

---

_Synced from Jira by sync-jira-issues_
