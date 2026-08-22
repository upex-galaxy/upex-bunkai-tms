# BUG: [BK-5] BUG-CRIT-2: No email uniqueness check against pending invites — duplicate invites allowed

**Jira Key:** [BK-61](https://jira.upexgalaxy.com/browse/BK-61)
**Priority:** High
**Status:** Closed
**Components:** Bunkai Invites
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Severity: HIGH

## Found during: [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) sprint-testing on staging (2026-06-05)

### Repro

1. Create invite for qa-invitee-1@bunkai.io with role=member → 201
2. Create second invite for same email qa-invitee-1@bunkai.io with role=admin → 201

Both invites created successfully, two pending invites for same email.

### Expected

Second invite should return 409 "An invite is already pending for this email" or similar.

### Actual

No uniqueness constraint on workspace*invites for (workspace*id, email) — two invites coexist.

### Root Cause

No DB unique constraint on (workspace_id, lower(email)) for pending invites, and no application-level check before insert.

### Impact

- Two admins can race-invite same email concurrently
- Ambiguous: which invite does the invitee see?
- Potential for invitee to accept higher role than intended

### Related

- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) (parent story)
- BUG-CRIT-1

---

## 🐞 Actual Result

Two POST /invites for same email (qa-duplicate@bunkai.io) with different roles (member + admin) both return 201. Two pending invites coexist: invite 684decf8 (member) + invite e2e6b5ca (admin).

---

## ✅ Expected Result

Second request → 409 INVITE*ALREADY*PENDING. Requires uniqueness enforcement on (workspace_id, email) for pending invites.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🚩 Workaround

No workaround. Both invites must be manually revoked. Fix requires UNIQUE partial index on (workspace_id, lower(email)) WHERE status='pending' + app-level pre-check.

---

## 🧫 Evidence

## Evidence - [https://jira.upexgalaxy.com/browse/BK-61#icft=BK-61](https://jira.upexgalaxy.com/browse/BK-61#icft=BK-61): Duplicate pending invites for same email

### Repro: Request 1 (curl)

curl -X POST [https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites](https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites) -H 'content-type: application/json' -d '{"email":"qa-duplicate@bunkai.io","role":"member"}'

Response: 201 Created - invite 684decf8, role=member, status=pending

### Repro: Request 2 - SAME email (curl)

curl -X POST [https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites](https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites) -H 'content-type: application/json' -d '{"email":"qa-duplicate@bunkai.io","role":"admin"}'

Response: 201 Created - invite e2e6b5ca, role=admin, status=pending

### Expected: second request -> 409

{ "error": "INVITE*ALREADY*PENDING", "message": "An invite is already pending for qa-duplicate@bunkai.io" }

### DB proof: 2 rows coexist

SELECT id, email, role, status FROM workspace*invites WHERE workspace*id = 'aed86386-2ed8-424e-934b-ca7a0ef6af37' AND email = 'qa-duplicate@bunkai.io' AND status = 'pending'

Result: 2 rows (both pending, different roles)

### Root cause

No UNIQUE (workspace_id, lower(email)) WHERE status = 'pending' index. No app-level pre-check.

---

## Related Issues

- created: [BK-5](https://jira.upexgalaxy.com/browse/BK-5) - TMS-Workspace | Invite a teammate with a role

---

## Metadata

- **Created:** 6/5/2026
- **Updated:** 8/20/2026
- **Reporter:** Nahuel Gomez
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
