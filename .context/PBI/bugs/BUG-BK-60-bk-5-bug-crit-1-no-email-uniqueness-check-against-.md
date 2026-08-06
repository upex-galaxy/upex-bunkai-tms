# BUG: [BK-5] BUG-CRIT-1: No email uniqueness check against active workspace members in POST /invites

**Jira Key:** [BK-60](https://jira.upexgalaxy.com/browse/BK-60)
**Priority:** Highest
**Status:** Closed
**Components:** Tenancy & Identity

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
