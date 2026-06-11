# BK-5 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

# [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) Acceptance Test Results (ATR)

***Tester***: Nahuel Gomez
***Date***: 2026-06-05
***Env***: Staging ([https://staging-upexbunkai.vercel.app](https://staging-upexbunkai.vercel.app/))
***Workspace***: aed86386-2ed8-424e-934b-ca7a0ef6af37 (QA Test Workspace)

## Results Summary

| Category | Passed | Failed | Total |
| --- | --- | --- | --- |
| Positive | 7 | 0 | 7 |
| Negative | 11 | 0 | 11 |
| Boundary | 2 | 0 | 2 |
| Integration/RBAC | 3 | 0 | 3 |
| ***Total**** | ****23**** | ****0**** | ****23*** |

## Verdict: FAILED — GO with defects

3 CRITICAL bugs found. Core invite flow works (create, list, rotate, revoke, accept). RBAC enforcement functional. Email uniqueness broken. Role overwrite on accept is a data-integrity issue.

## CRITICAL Bugs Found

### BUG-CRIT-1: No email uniqueness check against active members

***File***: app/api/v1/workspaces/[id]/invites/route.ts
Invite can be created for email already belonging to active workspace member. Spec requires 409 EMAIL*ALREADY*MEMBER. ***Repro***: POST /invites with member email → 201 instead of 409.

### BUG-CRIT-2: No email uniqueness against pending invites

***File***: app/api/v1/workspaces/[id]/invites/route.ts
Two pending invites for same email allowed. No DB constraint or application check. ***Repro***: Create invite for email-1, create second invite for same email-1 → both 201.

### BUG-CRIT-3: Role overwrite on accept upserts existing membership

***File***: app/api/v1/invites/accept/route.ts (line 77-87)
workspace_members.upsert sets role=invite.role unconditionally, demoting existing higher-role members. ***Repro****: Owner accepts member-role invite → role changed to member in DB. ****Fix***: Check existing role before upsert; preserve higher role or reject if already member.

## DEV Notes

- Acceptance NOT idempotent (409, not 200) — intentional anti-replay
- Expiry is 7 days, not 24h as spec
- Owner demoted on QA Test Workspace (aed86386) — needs manual DB restore

---
_Synced from Jira by sync-jira-issues_
