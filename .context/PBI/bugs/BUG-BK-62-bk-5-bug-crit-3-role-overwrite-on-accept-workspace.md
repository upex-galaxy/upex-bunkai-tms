# BUG: [BK-5] BUG-CRIT-3: Role overwrite on accept — workspace_members.upsert demotes existing owner/member

**Jira Key:** [BK-62](https://jira.upexgalaxy.com/browse/BK-62)
**Priority:** Highest
**Status:** Closed
**Components:** Tenancy & Identity

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
