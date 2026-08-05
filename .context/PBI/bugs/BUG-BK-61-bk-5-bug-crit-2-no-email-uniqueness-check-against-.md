# BUG: [BK-5] BUG-CRIT-2: No email uniqueness check against pending invites — duplicate invites allowed

**Jira Key:** [BK-61](https://jira.upexgalaxy.com/browse/BK-61)
**Priority:** High
**Status:** Closed
**Components:** Tenancy & Identity

---

## Description

## Severity: HIGH

## Found during: BK-5 sprint-testing on staging (2026-06-05)

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

- BK-5 (parent story)
- BUG-CRIT-1

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
