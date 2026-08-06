# BUG: [BK-17] Staging Jira import fails instantly with jira_unauthorized — ATLASSIAN_* credentials not configured in staging deployment

**Jira Key:** [BK-142](https://jira.upexgalaxy.com/browse/BK-142)
**Priority:** Highest
**Status:** Closed
**Components:** User Stories & Acceptance Criteria

---

## Description

## Summary

Every `POST /api/v1/imports` call on staging returns ***202*** with the correct envelope, but the background worker fails instantly with `errors[0].code = "jira_unauthorized"`. This blocks BK-17 (Async Jira Import by JQL) AC1-AC5 — 21 of 22 ATP outlines cannot be executed on staging.

## Steps to Reproduce

1. Sign in to staging as a project member: `POST /api/v1/auth/signin` (returns session + PAT)
2. `POST /api/v1/imports {project*id, jql}` -> ***202*** `{"import*job_id": "...", "status": "queued"}`
3. Poll `GET /api/v1/imports/{id}` -> ***200***, `status: "failed"`, job completes in ~0.1s with NO observable `running` state:

```json
{
  "errors": [
    { "code": "jira_unauthorized", "message": "Jira credentials are not configured." }
  ]
}
```

## Evidence — 6 consecutive jobs, all identical

| Job ID | started_at (UTC) | Context |
| --- | --- | --- |
| `33905236-...` | 2026-06-15T19:27:56 | Original Stage 2 smoke (TC-POS-01) |
| `d3f02f40-...` | 2026-06-15T20:16:18 | Re-verification retest |
| `59556fdc-...` | 2026-06-15T20:34:35 | After env vars added (scope/redeploy pending) |
| `87303b91-...` | 2026-06-15T20:39:54 | After 1st redeploy |
| `87fbca69-...` | 2026-06-15T20:45:24 | After vars set on Preview scope |
| `e10b673e-...` | 2026-06-15T20:51:08 | After vars set on Production scope + redeploy |

## Root Cause (code-level)

`lib/jira/client.ts:120` — `if (!url || !email || !token) throw new JiraAuthError('Jira credentials are not configured.')`. This branch fires whenever `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API*TOKEN` are falsy/undefined in `process.env` for the staging deployment (`lib/env.ts:36-38`, all declared `z.string().optional()`).

> ***INFO:**** Confirmed NOT a credential-VALUE problem. The same 3 values from the QA repo's local `.env` were tested live against real Jira Cloud: `GET {ATLASSIAN_URL}/rest/api/3/myself` -> ****200 OK***.

## Regression Window

Last successful import job `b4b8e74c-...` completed ***2026-06-05T10****:55:****04Z**** (`imported*count: 2`). Every `import*jobs` row created ****>= 2026-06-09*** fails identically. The window overlaps with the BK-84 (staging auth-gateway) redeploy (2026-06-07..2026-06-09) — possible correlation, not confirmed as same root cause.

## Impact

- ***AC1-AC5 100% blocked*** — none of BK-17's core import behavior (counts, idempotency, component routing, Inbox fallback, chunking) can be verified live.
- AC6 (`jira_unauthorized` on bad creds) is now trivially "passing" for every job, which is not meaningful coverage.

## Suggested Fix

Verify/restore `ATLASSIAN*URL`, `ATLASSIAN*EMAIL`, `ATLASSIAN*API*TOKEN` on the Vercel project + environment scope that serves `staging-upexbunkai.vercel.app`, then redeploy.

---

## Related Issues

- is blocked by: [BK-17](https://jira.upexgalaxy.com/browse/BK-17) - Jira Import | Pull Jira issues by JQL

---

## Metadata

- **Created:** 6/15/2026
- **Updated:** 6/26/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales

---

_Synced from Jira by sync-jira-issues_
