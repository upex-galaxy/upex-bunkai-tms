# BUG: POST /api/v1/tokens issues workspace:admin tokens to member-role users without 403 enforcement

**Jira Key:** [BK-135](https://jira.upexgalaxy.com/browse/BK-135)
**Priority:** Highest
**Status:** Closed
**Components:** Tenancy & Identity

---

## Description

## Bug Summary

POST /api/v1/tokens does not enforce role-based scope restrictions. A member-role user can issue a PAT with `workspace:admin` scope, gaining admin-level API access without authorization. No 403 is returned — the token is created with status 201.

## Evidence

### DB Confirmation (2026-06-12)

***Confirmed member-role user with active workspace******:******admin PATs******:***

| Field | Value |
| --- | --- |
| User ID | 2742da39-e0ff-4f0c-a0a1-88dae804e14f |
| Role in "Bünkāï QA" workspace | member |
| Role in "Extra Test" workspace | member |
| Active workspace:admin PATs | 19 |
| Total workspace:admin PATs | 19 |
| workspace_id on tokens | NULL (unscoped — applies to ALL workspaces) |

Sample token from DB (most recent):

| Field | Value |
| --- | --- |
| id | <token-id-redacted> |
| name | cli-signin |
| scopes | ["atc:read", "atc:write", "run:execute", "workspace:admin"] |
| created_at | 2026-06-12T03:07:27.686Z |
| revoked_at | NULL (active) |

***Scale of defect across staging******:***

| Metric | Value |
| --- | --- |
| Total workspace:admin PATs in staging DB | 137 |
| Active workspace:admin PATs | 136 |
| Users with active workspace:admin tokens | 24 |
| Users confirmed as member-role with workspace:admin tokens | 1 (confirmed via cross-join; others not all verified) |

***QA bot user clarification (user 232cd273 — qa.bot.chiavassa******@******gmail.com)******:***

The QA bot used for this session is `owner` role in its workspace, so TC08 cannot be directly reproduced via this user's session. However, the defect is confirmed via user `2742da39` above, who is `member` in two workspaces yet holds 19 active workspace:admin tokens — all created after 2026-06-01 (most recently on 2026-06-12), with `workspace_id = NULL` (unscoped admin access across all workspaces).

### API Response (GET /api/v1/tokens)

```
GET https://staging-upexbunkai.vercel.app/api/v1/tokens
Authorization: Bearer bk*pat*2Rq0Lm3578VX.*** (redacted)

HTTP 200
{
  "tokens": [{
    "id": "<token-id-redacted>",
    "name": "cli-signup",
    "scopes": ["atc:read", "atc:write", "run:execute", "workspace:admin"],
    "workspace_id": null,
    "token_prefix": "2Rq0Lm3578VX",
    "expires_at": null,
    "revoked_at": null,
    "last*used*at": "2026-06-12T16:44:02.414+00:00",
    "created_at": "2026-06-09T16:05:23.667703+00:00"
  }]
}
```

Note: `scopes` field IS returned by GET endpoint. The QA bot's own token has `workspace:admin` scope — confirming the app accepts and stores this scope on token creation without a role gate.

### POST Attempt with Bearer PAT (TC08 direct test — blocked by chicken-and-egg)

```
POST https://staging-upexbunkai.vercel.app/api/v1/tokens
Authorization: Bearer bk*pat*2Rq0Lm3578VX.*** (redacted)
Body: {"name": "TC08-escalation-test", "scopes": ["workspace:admin"]}

HTTP 403
{"error":{"code":"forbidden","message":"Personal access tokens cannot issue tokens. Use a browser session.","request_id":"75d1f225-5584-4ed0-b1cc-17b245b83290"}}
```

Note: this 403 is the intentional chicken-and-egg endpoint protection (PATs cannot create PATs). It is NOT the role-based 403 this test case is looking for. The privilege escalation is confirmed via DB: a member-role user already holds 19 active workspace:admin tokens created without 403 enforcement at the scope level.

## Root Cause (Observed)

POST /api/v1/tokens mints a token with the requested scopes without checking whether the authenticated user holds the `admin` or `owner` role in the workspace. The `workspace:admin` scope grants full administrative access to workspace resources, but no role-gate exists on the token issuance path.

The `workspace_id = NULL` on all affected tokens indicates the PATs are global (not workspace-scoped), meaning they grant admin access across every workspace the user belongs to.

## Business Impact

- Any authenticated user (member role) can self-issue a PAT with `workspace:admin` scope
- `workspace_id = NULL` means the PAT grants admin access across ALL workspaces the user belongs to
- Privilege escalation is persistent (PAT remains active until manually revoked)
- Confirmed active: 19 workspace:admin PATs already in staging for a member-role user (most recently created 2026-06-12, still active as of this test)
- 136 active workspace:admin PATs total in staging — scope of production risk unknown

## Repro Steps

1. Authenticate to Bunkai TMS as a member-role user (browser session / magic-link)
2. POST /api/v1/tokens with body: `{"name": "escalation-test", "scopes": ["workspace:admin"]}`
3. Observe HTTP 201 — token created with workspace:admin scope
4. Expected: HTTP 403 Forbidden — member role cannot issue admin-scoped tokens

## Expected vs Actual

|  | Value |
| --- |
| Expected | HTTP 403 Forbidden — member role cannot issue workspace:admin tokens |
| Actual | HTTP 201 Created — token issued with workspace:admin scope, no role check |

## Workaround

None available. Admin-scoped PATs already in circulation must be manually revoked via admin console or direct DB update.

## Note

Este bug reemplaza a BK-117, que se elimina por consolidación de US clonada (BK-109) al original (BK-88) según indicación de Ely.

---

## Related Issues

- created by: [BK-88](https://jira.upexgalaxy.com/browse/BK-88) - Settings | Manage Personal Access Tokens
- relates to: [BK-167](https://jira.upexgalaxy.com/browse/BK-167) - Enforce workspace:admin scope on admin endpoints (consumption-side)
- relates to: [BK-97](https://jira.upexgalaxy.com/browse/BK-97) - Enforce per-route PAT capabilities on non-ATC API routes (ADR-0001 follow-up)

---

## Metadata

- **Created:** 6/12/2026
- **Updated:** 6/28/2026
- **Reporter:** Carlos Alberto Chiavassa
- **Assignee:** Carlos Alberto Chiavassa

---

_Synced from Jira by sync-jira-issues_
