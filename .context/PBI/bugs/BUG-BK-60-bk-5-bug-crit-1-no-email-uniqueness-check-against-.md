# BUG: [BK-5] BUG-CRIT-1: No email uniqueness check against active workspace members in POST /invites

**Jira Key:** [BK-60](https://jira.upexgalaxy.com/browse/BK-60)
**Priority:** Highest
**Status:** Closed
**Components:** Tenancy & Identity
**Severity:** Crítica
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Severity: CRITICAL

## Found during: BK-5 sprint-testing on staging (2026-06-05)

### Repro

POST /api/v1/workspaces/{id}/invites with email of an existing active workspace member → returns 201 instead of 409.

### Expected

Spec (FR-003) requires 409 EMAIL*ALREADY*MEMBER when inviting an email that already belongs to an active workspace member.

### Actual

Invite is created successfully (201) for email that is already a member.

### Root Cause

Missing uniqueness check in `app/api/v1/workspaces/[id]/invites/route.ts` — no query against workspace_members before inserting invite.

### Impact

Security boundary breach: members receive duplicate invite tokens. Could enable privilege escalation if a member accepts a higher-role invite.

### Related

- BK-5 (parent story)
- Blocks QA sign-off

---

## 🐞 Actual Result

POST /api/v1/workspaces/{id}/invites with email of existing active workspace member → 201 Created instead of 409. Invite created for email already in workspace*members (qa-headless@bunkai.io). Token returned: bk*inv_2rTgTxbLC5R21dcL6WpGX.

---

## ✅ Expected Result

409 EMAIL*ALREADY*MEMBER. Message: 'This email already belongs to an active workspace member.' Per FR-003: "email MUST be unique among active workspace members."

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🚩 Workaround

No workaround. Invite must be manually revoked. Fix requires application-level pre-check against workspace_members before inserting invite.

---

## 🧫 Evidence

## Evidence - BK-60: Email uniqueness not checked against active members

### Repro (curl)

curl -X POST https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites -H 'content-type: application/json' -d '{"email":"qa-headless@bunkai.io","role":"member"}'

### Actual (BUG): 201 Created

{ "invite": { "id": "bbb9a656-8f86-4ff4-bd97-2acacfc9d1c1", "workspace*id": "aed86386-2ed8-424e-934b-ca7a0ef6af37", "email": "qa-headless@bunkai.io", "role": "member", "status": "pending" }, "token": "bk*inv*2rTgTxbLC5R21dcL6WpGX", "accept*url": "/invites/accept?token=bk*inv*2rTgTxbLC5R21dcL6WpGX" }

### Expected: 409 Conflict

{ "error": "EMAIL*ALREADY*MEMBER", "message": "qa-headless@bunkai.io is already a member of this workspace" }

### DB proof

SELECT email, role, status FROM workspace*members WHERE workspace*id = 'aed86386-2ed8-424e-934b-ca7a0ef6af37' AND email = 'qa-headless@bunkai.io'

Result: qa-headless@bunkai.io | member | active

### Spec reference

FR-003: "email MUST be unique among active workspace members"

### Root cause

app/api/v1/workspaces/[id]/invites/route.ts: no pre-check against workspace_members before insert

---

## Related Issues

- created: [BK-5](https://jira.upexgalaxy.com/browse/BK-5) - TMS-Workspace | Invite a teammate with a role

---

## Metadata

- **Created:** 6/5/2026
- **Updated:** 6/26/2026
- **Reporter:** Nahuel Gomez
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
