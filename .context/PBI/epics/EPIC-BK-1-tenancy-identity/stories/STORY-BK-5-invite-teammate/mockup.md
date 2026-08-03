# BK-5 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

# BK-5 Acceptance Test Plan

***Modality***: jira-native
***Shift-Left***: Short-circuit — refinement 2026-05-27 (<30d)
***Tester***: Nahuel Gomez
***Env***: Staging (https://staging-upexbunkai.vercel.app)
***Date***: 2026-06-05

## Coverage Summary

| Type | Count |
|------|-------|
| Positive | 7 |
| Negative | 11 |
| Boundary | 2 |
| Integration | 3 |
| API | 1 |
| ***Total**** | ****24*** |

## Test Outlines

### Positive

- ***POS-1: Should create invite when owner invites member with valid email*** — ✅ PASSED. 201 returned with invite object, token, accept_url. 7-day expiry.
- ***POS-2: Should create invite when owner invites admin role*** — ✅ PASSED. Owner ≥ admin, 201.
- ***POS-3: Should create invite when owner invites viewer role*** — ✅ PASSED. Owner ≥ viewer, 201.
- ***POS-4: Should default role to member when role field is omitted*** — ✅ PASSED. Zod default applied, invite created with role=member.
- ***POS-5: Should list all invites with derived status*** — ✅ PASSED. GET returns array with pending/revoked status, ordered by created_at desc.
- ***POS-6: Should rotate invite token with extended expiry*** — ✅ PASSED. New token, cleared accept/revoke flags, fresh 7-day expiry.
- ***POS-7: Should revoke invite and return ok*** — ✅ PASSED. Returns {ok:true}, DB sets revoked_at.

### Negative

- ***NEG-1: Should reject invite when email format is invalid*** — ✅ PASSED. 400 validation_failed "Invalid input".
- ***NEG-2: Should reject invite when email is empty*** — ✅ PASSED. 400 validation_failed "Invalid input".
- ***NEG-3: Should reject invite when role is invalid ("superadmin")*** — ✅ PASSED. 400 validation_failed, valid values listed: viewer, member, admin.
- ***NEG-4: Should reject invite when role is "owner"*** — ✅ PASSED. 400 validation_failed. Owner cannot be invited (not in Zod enum).
- ***NEG-5: Should reject invite when email field missing*** — ✅ PASSED. 400 validation_failed.
- ***NEG-6: Should reject invite to non-existent workspace*** — ✅ PASSED. 403 forbidden (RLS blocks since caller is not workspace admin).
- ***NEG-7: Should reject accept when email does not match token*** — ✅ PASSED. 403 "This invite was sent to a different email address."
- ***NEG-8: Should reject accept with garbage/invalid token*** — ✅ PASSED. 404 "Invite token is invalid."
- ***NEG-9: Should reject accept on revoked invite*** — ✅ PASSED. 409 "Invite has been revoked."
- ***NEG-10: Should reject accept on already-accepted invite*** — ✅ PASSED. 409 "Invite has already been accepted."
- ***NEG-11: Should reject accept with empty token*** — ✅ PASSED. 400 too_small (min:8).

### Boundary

- ***BND-1: Should reject email exceeding 254 chars*** — ✅ PASSED. 400 too_big (max:254).
- ***BND-2: Should normalize email to lowercase*** — ✅ PASSED. DB confirms email stored as lowercase.

### Integration / RBAC

- ***INT-1: Should return invites array with correct shape*** — ✅ PASSED. Fields: id, email, role, status, expires*at, created*at, accepted*at, revoked*at.
- ***INT-2: Should enforce RLS on invite listing*** — ✅ PASSED. Member-level user gets empty array (no access to invite list).
- ***INT-3: Should reject invite creation by member-level user*** — ✅ PASSED. 403 "You must be an admin or owner to invite teammates."

### DB Cross-Validation

- ***DB-1: DB records match API responses*** — ✅ PASSED. 6 invites in DB match GET response. Revoked*at timestamps correct. invited*by*user*id consistent.

## Bugs Found

### BUG-CRIT-1: Missing email uniqueness check against active members

***Severity****: CRITICAL | ****Root cause***: Missing check in POST /invites handler
Invite can be created for an email that already belongs to an active workspace member. Spec requires 409 EMAIL*ALREADY*MEMBER.

### BUG-CRIT-2: Missing email uniqueness check against pending invites

***Severity****: HIGH | ****Root cause***: No DB constraint or application check
Two invites for same email (qa-invitee-1@bunkai.io) created successfully — one member, one admin. Both pending.

### BUG-CRIT-3: Role overwrite on accept upserts existing membership

***Severity****: CRITICAL | ****Root cause***: `workspace_members.upsert` in accept handler
Accepting an invite for member role when user is already owner DEmotes existing membership. The upsert `onConflict: workspace*id,user*id` always sets role to invite.role. Fix: only upsert if no existing row, or preserve higher existing role.

### DEV-NOTE-1: Acceptance not idempotent (spec deviation)

Already-accepted invite returns 409, not 200 as story specified. Intentional per code comments — "anti-replay".

### DEV-NOTE-2: Expiry is 7 days, not 24h

Implementation uses 7-day expiry window via DB default. Spec says 24h.

## Test-breaking State

- Workspace aed86386 (QA Test Workspace): Owner demoted to member via BUG-CRIT-3. Created fresh workspace c828d131 for remaining tests. Needs manual DB fix.

---
_Synced from Jira by sync-jira-issues_
