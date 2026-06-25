# Comments for BK-5

[View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

---

### Ely - 5/19/2026, 9:05:44 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Settings page: `<MembersTab />` with invite form + pending-invites list.
- Page: `app/accept-invite/page.tsx`.

1. 

- Routes:
- `POST app/api/v1/workspaces/[id]/invites/route.ts`
- `POST app/api/v1/invites/[token]/accept/route.ts`
- `GET  app/api/v1/workspaces/[id]/invites/route.ts`
- Token signing: HMAC-SHA256 with secret from env.
- Email dispatch: Supabase Auth's `inviteUserByEmail` OR custom Resend integration.

1. 

- Tables: `workspace*invites`, `workspace*members`.
- Index: `(workspace_id, lower(email))` unique pending.

1. 

- [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) (workspace creation).

1. 

- [https://jira.upexgalaxy.com/browse/BK-2#icft=BK-2](https://jira.upexgalaxy.com/browse/BK-2#icft=BK-2) / [https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3](https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3) (sign-in flows — invitee must be able to sign in).

1. 

- [ ] All 7 AC scenarios pass on staging.
- [ ] HMAC token-signing unit tests.
- [ ] Email actually arrives in invitee's inbox (smoke test on staging).
- [ ] Role-hierarchy enforced server-side (NOT only client-side filter).
- [ ] RLS policy verifies caller membership before listing pending invites.

---

### Ely - 5/27/2026, 8:50:18 PM

Implementado este sprint.

Code on main:

- 3c851d5 feat(invites): workspace invite issuance + accept flow (bk-5)

Schema: migration 0010*workspace*invites — token*hash storage (SHA-256), 7-day default expiry, RLS gated to admins/owners via bunkai*is*workspace*admin.

Surfaces ready for QA:

- POST /api/v1/workspaces/{id}/invites — issue invite (admin/owner only). Returns raw bk*inv*<secret> token + accept_url exactly once.
- GET /api/v1/workspaces/{id}/invites — list (status derived: pending / accepted / revoked / expired).
- POST /api/v1/workspaces/{id}/invites/{inviteId} — rotate (resend) token; clears accept/revoke flags + extends expiry 7d.
- DELETE /api/v1/workspaces/{id}/invites/{inviteId} — revoke.
- POST /api/v1/invites/accept — invitee redeems token; email match enforced; upserts workspace_members.
- /workspaces/{id}/members UI with invite form + clipboard copy + rotate / revoke buttons.
- /invites/accept?token=... public landing.

Known gap: transactional email dispatch stubbed (no Resend / SES integration yet). MVP copies the accept link to the inviter's clipboard.

Testability guide: /qa + Jira Epic [https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29](https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29).

---

### Nahuel Gomez - 5/27/2026, 10:04:41 PM

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) — Invite a teammate to a Workspace

***Status****: Refined — Awaiting PO Estimation | ****Score****: CRITICAL 27 | ****Refined***: 2026-05-27

## Verdict: Needs Improvement

Core flow described well, but significant gaps for a CRITICAL 27 Auth/RBAC ticket.

## Key Gaps (10 found)

1. ***POST /invites/{token}/accept*** absent from `api-contracts.yaml` v1.0 — release-blocking gap. Frontend and Karim agent have no contract.
2. ***No list/revoke/resend invite endpoints*** — Admin cannot audit pending invites or cancel mistakes.
3. ***HMAC signing unspecified*** — algorithm, key source, rotation strategy all undocumented. Token security depends on this.
4. ***No AC for email dispatch failure*** — behavior when SMTP down is undefined.
5. ***No AC for token tampering*** — missing security AC (critical for Auth story).
6. ***No AC for email mismatch on accept*** — missing wrong-user rejection AC.
7. ***No AC for deleted workspace edge case*** — invite to workspace later deleted.
8. ***Email uniqueness scope unclear*** — active members only vs active + pending invites.
9. ***workspace_invites table schema*** not in canonical ERD.
10. ***No AC for duplicate membership idempotency*** — replay attack vector.

## Critical Questions for PO (block sprint planning)

1. ***Does email uniqueness include pending invites, or only active members?*** Two admins could invite same email concurrently.
2. ***Idempotency behavior when already-accepted invite is re-clicked by removed member?*** Return 200 with stale data or 404?
3. ***Should inviter's current role affect pending invite validity?*** Admin demoted to member after sending invite.

## Technical Questions for Dev

1. HMAC algorithm + key source (workspace-level `invite*secret` column or global `INVITE*SIGNING_KEY`)?
2. Is accept a single DB transaction (token validation + member insert + invite status update)?
3. Email dispatch: Supabase transactional email or custom provider?
4. Will POST /invites/{token}/accept be added to api-contracts.yaml before /project-bootstrap?
5. workspace_invites table schema?

## Blockers

- ***[****BLOCKER]*** Add POST /invites/{token}/accept to api-contracts.yaml
- ***[****BLOCKER]*** Add GET /workspaces/{id}/invites and DELETE /workspaces/{id}/invites/{invite_id} to scope

## Test Coverage Estimate

| Type  | Count  |
| --- | --- |
| ------ | ------- |
| Positive  | 5  |
| Negative  | 11  |
| Boundary  | 4  |
| Integration  | 3  |
| API  | 4  |
| ***Total****  | ****27***  |

High count driven by RBAC role matrix (4 roles × invite create + accept) + HMAC token security (tamper/replay/expiry).

## Suggested Story Improvements

1. Add POST /invites/{token}/accept to api-contracts.yaml
2. Add list/revoke/resend invite endpoints to MVP scope
3. Specify HMAC-SHA256 with workspace-level secret
4. Define email dispatch failure behavior (201 + resend affordance)
5. Add security ACs: token tampering, email mismatch, replay
6. Specify email normalization (lowercase + Unicode NFC)
7. Define workspace_invites table schema for /project-bootstrap

**Shift-Left QA refinement — batch session 2026-05-27**

---

### Nahuel Gomez - 5/27/2026, 10:04:43 PM

## Unified QA Test Results — [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) & [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) (Staging)

***Date****: 2026-05-28 | ****Tester****: Nahuel Gomez | ****Env***: [https://upexbunkai.vercel.app](https://upexbunkai.vercel.app/)

### [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) — Create Workspace ✅ 9/9 tested

| AC  | Scenario  | Result  |
| --- | --- | --- |
| ---- | ---------- | :---: |
| AC-1  | POST /workspaces {name:"QA Test Workspace", slug:"qa-test-workspace"} → 201, slug derived, caller=owner  | ✅  |
| AC-5  | Name too short ("AB") → 400 validation_failed  | ✅  |
| AC-5  | Slug too short ("ab") → 400 too_small min:3  | ✅  |
| AC-5  | Empty name → 400 too_small min:1  | ✅  |
| AC-6  | Duplicate slug → 409 "already taken"  | ✅  |
| AC-8  | Reserved slug "admin" → 400 "Slug is reserved"  | ✅  |
| AC-8  | GET /workspaces → 200, 1 workspace  | ✅  |
| AC-8  | GET /workspaces/{id} → 200, correct slug/name  | ✅  |
| AC-8  | GET /workspaces/{bad-id} → 404 not_found  | ✅  |
| PATCH  | Rename to "QA Test Renamed" → 200, persisted  | ✅  |

### [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) — Invite Teammate ✅ 6/6 tested

| AC  | Scenario  | Result  |
| --- | --- | --- |
| ---- | ---------- | :---: |
| AC-1  | POST /invites (API) → 201, token bk*inv**, 7d expiry  | ✅  |
| AC-1  | Create invite (UI) → 201, clipboard copy  | ✅  |
| AC-8  | GET /invites → 200, 1 pending  | ✅  |
| AC-12  | Accept with mismatched email → 403 "different email address"  | ✅  |
| AC-10  | DELETE /invites/{id} → {ok:true}  | ✅  |
| AC-10  | Revoked invite shows in UI as "revoked"  | ✅  |

### Known Gaps (not tested)

- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).2: Accept invite (needs second authenticated user with matching email)
- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).5: RBAC non-admin rejection (needs second user)
- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).11: Rotate invite token
- [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4).11: Transaction atomicity (workspace + owner rollback)
- No workspace deletion endpoint

### Cleanup

- Workspace "QA Test Renamed" (8a2d1ff6-5e00) left on staging (no DELETE endpoint)
- Invite qa-member@bunkai.io revoked

---

### Nahuel Gomez - 6/5/2026, 7:06:17 PM

# BK-5 Acceptance Test Results (ATR)

***Tester***: Nahuel Gomez

***Date***: 2026-06-05

***Env***: Staging (https://staging-upexbunkai.vercel.app)

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

***File***: `app/api/v1/workspaces/[id]/invites/route.ts`

Invite can be created for email already belonging to active workspace member. Spec requires 409 EMAIL*ALREADY*MEMBER. ***Repro***: POST /invites with member email → 201 instead of 409.

### BUG-CRIT-2: No email uniqueness against pending invites

***File***: `app/api/v1/workspaces/[id]/invites/route.ts`

Two pending invites for same email allowed. No DB constraint or application check. ***Repro***: Create invite for email-1, create second invite for same email-1 → both 201.

### BUG-CRIT-3: Role overwrite on accept upserts existing membership

***File***: `app/api/v1/invites/accept/route.ts` (line 77-87)

`workspace_members.upsert` sets role=invite.role unconditionally, demoting existing higher-role members. ***Repro****: Owner accepts member-role invite → role changed to member in DB. ****Fix***: Check existing role before upsert; preserve higher role or reject if already member.

## DEV Notes

- Acceptance NOT idempotent (409, not 200) — intentional anti-replay
- Expiry is 7 days, not 24h as spec
- Owner demoted on QA Test Workspace (aed86386) — needs manual DB restore

## Test Evidence

- 6 invites created, 1 revoked, 1 rotated, 1 accepted
- DB cross-validation matched API responses
- Error codes stable: 400/403/404/409 with descriptive messages
- Response envelope consistent: `{invite: {...}, token, accept_url, warning}`

---

### Carlos Alberto Chiavassa - 6/8/2026, 10:06:46 AM

Como ejercicio del Dojo Edition 3, realicé Shift-Left Testing sobre esta US (consciente de que ya está en Ready For QA). Análisis disponible en mi repo: https://github.com/chiavassacar-ops/qa-harness-lab/blob/main/docs/upex-dojo/07-shift-left-BK-5-invite-teammate.md. Si alguno de los gaps/riesgos identificados resulta útil para retest o regression, queda como referencia.

---


_Synced from Jira by sync-jira-issues_
