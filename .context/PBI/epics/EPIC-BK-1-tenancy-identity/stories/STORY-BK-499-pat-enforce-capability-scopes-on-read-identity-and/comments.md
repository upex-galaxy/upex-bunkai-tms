# Comments for BK-499

[View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

---

### Luis Eduardo Flores Villarroel - 8/21/2026, 7:56:45 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

The ATP DRAFT lives in the Acceptance Test Plan (ATP) field.

Action Required: review ambiguities, answer the 4 Critical Questions for PO and 3 Technical Questions for Dev, confirm edge-case behavior.

Refined on: 2026-08-21 — QA Shift-Left session

Local working copy: `.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-499-pat-enforce-capability-scopes-on-read-identity-and/shift-left-refinement.md`

---

### Luis Eduardo Flores Villarroel - 8/21/2026, 8:16:36 AM

## AI Product Owner & AI Tech Lead Ruling — BK-499 Shift-Left Follow-up

***Date***: 2026-08-21
***Context***: rulings on the 4 Critical Questions for PO and 3 Technical Questions for Dev raised by the 2026-08-21 Shift-Left refinement (`shift-left-refinement.md`, mirrored in the Acceptance Test Plan field).

---

### AI Product Owner Ruling

***Q1 — ****`GET /workspaces/{id}/notifications`****:****** does it require ****`atc:read`****, or stay in "identity and notifications" (no capability)?***

***Ruling***: No capability required. Stays in "identity and notifications".

***Rationale****: the boundary between the "reporting reads" category and the "identity and notifications" category is not "read vs. write" — it is "is this the caller's OWN data, or workspace-shared data visible to any member". `GET /activity` shows the ENTIRE workspace's activity feed (shared, hence `atc:read`-gated). `GET /workspaces/{id}/notifications` shows only the caller's own notification copies (`each recipient reads their own copies`, per the route's own RLS-scoped implementation) — the same personal-data shape as `GET /me` and `GET /notification-preferences`, both already ratified as no-capability. The route's doc comment analogy to `GET /activity` is stale documentation, not a statement of intended posture; the route's own capability-posture marker (`why: 'BK-499 pending — identity and notifications.'`) already reflects the correct classification. ****Action for Dev***: update the doc comment at `app/api/v1/workspaces/[id]/notifications/route.ts:9-16` to remove the misleading "mirrors GET /api/v1/activity" line when implementing.

***Q2 — What capability does ****`POST /workspaces/{id}/projects`**** require?***

***Ruling***: Requires `atc:write`.

***Rationale***: `POST /workspaces` (bootstrap) is capability-free ONLY because it is the sole action a brand-new token can take before any workspace context exists — a narrowly-scoped exception, not a precedent for "creation actions are free". `POST /workspaces/{id}/projects` happens INSIDE an already-existing workspace and is a routine content-creation write, the same shape as `POST /bugs` (run-linked or standalone), which already reuses `atc:write` per Technical Decision 13 rather than minting a new scope. Consistency wins: reuse `atc:write` here too.

***Q3 — Should "capability-free" be corrected to "session-only" for ****`DELETE /workspaces/{id}/membership`**** and ****`POST /me/active-workspace`****?***

***Ruling***: Yes — reword the Definition of Done. No code or behavior change; the shipped code (`assertSessionOnly`) is already correct.

***Rationale****: "capability-free" implies a PAT IS allowed through, just without a scope check. The actual code rejects EVERY Bearer PAT outright, regardless of scope — a categorically stronger and different guarantee. If QA designs the negative test case off the word "capability-free", it will assert the wrong failure reason (missing-scope 403 instead of session-only 403) and could mask a real regression. ****Action for Dev/QA***: the Story's Definition of Done and Acceptance Criteria should describe these two routes as "session-only (PAT rejected outright)", distinct from `POST /workspaces`'s genuine capability-free posture.

***Q4 — Reconcile the DoD's "27 of the remaining 28 handlers" against the 24 handlers found via ****`grep -rl "BK-499 pending" app/api/v1/`**** (21 files)?***

***Ruling***: Adopt the 24-handler / 21-file grep-verified list (reproduced in `shift-left-refinement.md` Phase 1) as the authoritative scope going forward.

***Rationale***: the "27 of 28" figure predates the mechanical `BK-499 pending` markers that BK-497 (the Foundation Story) placed across the codebase — it was written at BK-262 estimation time, before the current code state existed. It is stale, not necessarily wrong, but the grep-verified list is empirically reproducible today and should be Dev's implementation checklist.

---

### AI Tech Lead Ruling

***Q5 (Technical Q1) — Confirm ****`GET /workspaces`**** and ****`GET /workspaces/{id}`**** require ****`atc:read`****.***

***Ruling***: Confirmed. Same treatment as every other read in this Story — no special case.

***Q6 (Technical Q2) — Evaluation order between the capability check and the existing RLS role check (****`role >= member`****) on ****`POST /workspaces/{id}/projects`****.***

***Ruling***: Capability check runs first, unconditionally — this is not a new decision, it is how the `withApiHandler` middleware (delivered by BK-497) already works: `requires: [...]` is evaluated in the wrapper BEFORE the handler body ever executes, so a PAT missing `atc:write` never reaches the RLS-gated `INSERT`. A PAT holding `atc:write` but whose caller is not a workspace member still fails afterward via the existing RLS path (`app/api/v1/workspaces/[id]/projects/route.ts:91-95`, mapped to 403 "must be a member"). This mirrors Business Rule 1's precedent (capability is evaluated independently of, and prior to, any role/membership check).

***Q7 (Technical Q3) — Confirm the no-capability posture for "identity and notifications" applies uniformly to writes, not just reads.***

***Ruling***: Confirmed, uniform across the category (both the 3 read handlers and the 4 write handlers).

***Rationale***: every handler in this category is a "manage your own account state" action (read/write your own notification preferences, mark your own notification read, switch your own active workspace pointer) — none of it is workspace-shared or third-party data. Gating these behind a specific scope adds friction without a real security benefit: a PAT already holding any other capability could reach far more sensitive data than "mark my own notification as read".

---

### Updated Definition of Done (supersedes the original 4 bullets)

- 24 handlers (21 files — see `shift-left-refinement.md` Phase 1 for the full grep-verified list) receive a resolved capability posture:
- `POST /workspaces` stays genuinely capability-free (any PAT with ≥1 scope passes) — the sole bootstrap exception.
- `DELETE /workspaces/{id}/membership` and `POST /me/active-workspace` are ***session-only*** (every Bearer PAT rejected outright, regardless of scope) — NOT "capability-free". Reworded from the original DoD language.
- The fixture PAT at `app/api/v1/projects/[id]/traceability/route.test.ts:132` is widened from `['atc:write']` to `['atc:read','atc:write']` (unchanged from original DoD).
- No database migration (unchanged).

Refined Acceptance Criteria (Phase 3 of `shift-left-refinement.md`) are now fully ratified — the `NEEDS PO/DEV CONFIRMATION` markers on AC4-AC7 are resolved by this ruling.

---


_Synced from Jira by sync-jira-issues_
