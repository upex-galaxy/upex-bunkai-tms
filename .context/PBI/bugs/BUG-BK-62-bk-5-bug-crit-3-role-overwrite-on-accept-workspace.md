# BUG: [BK-5] BUG-CRIT-3: Role overwrite on accept — workspace_members.upsert demotes existing owner/member

**Jira Key:** [BK-62](https://jira.upexgalaxy.com/browse/BK-62)
**Priority:** Medium
**Status:** Closed
**Components:** None
**Severity:** Crítica
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Severity: CRITICAL

## Found during: BK-5 sprint-testing on staging (2026-06-05)

### Repro

1. Owner of workspace creates invite for member role
2. Same owner accepts the member-role invite
3. Owner's role in workspace_members is overwritten to "member"

### Expected

If user is already a member with a higher role, accept should preserve the higher role OR reject the accept.

### Actual

`workspace_members.upsert` in `app/api/v1/invites/accept/route.ts:77-87` sets role=invite.role UNCONDITIONALLY.

```typescript
// Current code (problematic):
const { data: member, error } = await supabase
  .from("workspace_members")
  .upsert({
    workspace_id,
    user_id: authUser.id,
    role: invite.role,  // <-- overwrites EXISTING role
    status: "active",
  }, { onConflict: "workspace*id,user*id" })
  .select()
  .single();
```

### Impact

- DATA INTEGRITY BREACH: Owner accidentally demoted to member
- Staging workspace aed86386 confirmed affected — owner is now member
- Could be exploited for privilege reduction attack

### Fix

Check existing role before upsert. If existing row has higher role, preserve it or return 409 "already a member with higher role".

### Related

- BK-5 (parent story)
- Requires manual DB fix on staging workspace aed86386

---

## 🐞 Actual Result

Owner accepts member-role invite → workspace_members.upsert overwrites owner role to member. Owner demoted from 'owner' to 'member'. Staging workspace aed86386 confirmed affected.

---

## ✅ Expected Result

If user already has higher role in workspace, accept should preserve higher role OR return 409 ALREADY_MEMBER. Should not unconditionally overwrite existing membership.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🚩 Workaround

No workaround via API. Requires manual DB fix on staging workspace aed86386 (owner qa-headless@bunkai.io demoted to member). Fix: check existing role before upsert, preserve higher role.

---

## 🧫 Evidence

## Evidence - BK-62: Role overwrite on accept upsert demotes owner

### Repro: Step 1 - invite (curl)

curl -X POST https://staging-upexbunkai.vercel.app/api/v1/workspaces/aed86386-2ed8-424e-934b-ca7a0ef6af37/invites -H 'content-type: application/json' -d '{"email":"qa-headless@bunkai.io","role":"member"}'

Response: 201, token bk*inv*2rTgTxbLC5R21dcL6WpGX

### Repro: Step 2 - accept (curl)

curl -X POST https://staging-upexbunkai.vercel.app/api/v1/invites/accept -H 'content-type: application/json' -d '{"token":"bk*inv*2rTgTxbLC5R21dcL6WpGX"}'

Response: 201 Accepted

### DB proof: BEFORE accept

SELECT user*id, email, role FROM workspace*members WHERE workspace_id = 'aed86386-2ed8-424e-934b-ca7a0ef6af37' AND email = 'qa-headless@bunkai.io'

Result: role = owner

### DB proof: AFTER accept (BUG)

SELECT user*id, email, role FROM workspace*members WHERE workspace_id = 'aed86386-2ed8-424e-934b-ca7a0ef6af37' AND email = 'qa-headless@bunkai.io'

Result: role = member (DEMOTED from owner)

### Root cause

app/api/v1/invites/accept/route.ts:77-87

workspace*members.upsert({ workspace*id, user*id, role: invite.role, status: "active" }, { onConflict: "workspace*id,user_id" })

upsert sets role=invite.role unconditionally. If user already has owner/admin role, it gets overwritten.

### Impact

Staging workspace aed86386 owner now member. No API for role change. Needs manual DB fix.

### Fix

Check existing role before upsert. If user has higher role, return 409 ALREADY_MEMBER instead of demoting.

---

## Related Issues

- created: [BK-5](https://jira.upexgalaxy.com/browse/BK-5) - TMS-Workspace | Invite a teammate with a role

---

## Metadata

- **Created:** 6/5/2026
- **Updated:** 6/10/2026
- **Reporter:** Nahuel Gomez
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
