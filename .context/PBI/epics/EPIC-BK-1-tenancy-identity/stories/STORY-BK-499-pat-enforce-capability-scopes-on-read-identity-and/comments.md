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

### Ely - 8/21/2026, 4:02:11 PM

## AI Tech Lead — Decision: the `atc:read` gate on `GET /workspaces` is redundant against the ungated `GET /me` payload. Widen the gate, narrow `/me`, or ship as ruled?

***Date***: 2026-08-21
***Raised by***: the Stage 3 adversarial code review on the BK-499 implementation branch. Severity MAJOR, 0 BLOCKER.

### The observation

Ruling Q5 confirmed `atc:read` on `GET /workspaces` and `GET /workspaces/{id}`. Ruling Q7 confirmed no capability on `GET /me`. Both are implemented as ruled. But the two payloads overlap:

| Endpoint | Posture (shipped) | Columns selected from `workspaces` |
| --- | --- | --- |
| `GET /workspaces` | `required: ['atc:read']` | `id, slug, name, owner*user*id, plan, created_at` |
| `GET /workspaces/{id}` | `required: ['atc:read']` | same |
| `GET /me` | `authenticated` (no capability) | `id, slug, name, plan, owner*user*id, created_at` — for EVERY workspace the caller belongs to (`app/api/v1/me/route.ts:52-58`) |

All three are RLS-filtered to the caller's own memberships. So a PAT scoped only `run:execute` is correctly 403'd on `GET /workspaces` and then retrieves the same rows from `GET /me`. The gate is a consistency gate, not a confidentiality gate.

This was not in front of the 2026-08-21 ruling — Q5 and Q7 were answered separately and neither compared the two payloads.

### Alternatives scored

| # | Option | Product value | Consistency with precedent | Cost | Reversibility | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| A | Ship as ruled; record the overlap as follow-up debt | Medium — the scope contract stays uniform ("every workspace-shared read takes `atc:read`"), which is what a client author reads and what the coverage invariant encodes | High — follows the binding ruling verbatim | Zero | n/a | Low. Discloses a known, non-widening gap rather than hiding it |
| B | Drop `atc:read` from the two workspace reads | Low — makes the /me overlap moot, but only by giving up the gate | ***Contradicts ruling Q5 directly*** | Low | Easy | Medium-high. Re-deriving a settled decision inside the implementing story is exactly the failure mode Critical Rule #18 and the decision protocol forbid |
| C | Narrow `GET /me`'s workspace payload in this story | High — makes the gate real | Poor — `/me` is a shipped identity endpoint the app shell and workspace switcher consume | High. Behaviour change to a UI-critical contract, needs its own AC and its own regression pass | Hard once clients depend on the narrower shape | ***High.*** An unratified payload change to the app's identity probe, smuggled into a posture sweep |

### Ruling

***Option A.*** Ship the postures exactly as Q5 and Q7 ruled.

***Rationale.*** The gate is not useless even while the overlap exists: it makes the published scope contract uniform and enforceable, and it is what the coverage invariant and the OpenAPI spec now both state. Closing the overlap means changing what `GET /me` returns — a behaviour change to the endpoint the app shell depends on, which belongs to its own refined story with its own acceptance criteria, not to a mechanical posture sweep. Option B is worse than either: it would resolve the inconsistency by re-deriving a decision this ticket already settled, three days after it was settled, on the strength of an implementation-time observation.

***What ships***: `GET /workspaces` and `GET /workspaces/{id}` require `atc:read`. `GET /me` stays capability-free. No change from the ruling.

***Recorded debt***: `GET /me` returns full workspace rows (`plan`, `owner*user*id`, `created_at`) for every membership, which is more than an identity probe needs. Narrowing it to what the app shell actually consumes would make the `atc:read` gate on the list endpoints load-bearing, and is a candidate follow-up story. It is not filed as a ticket here because the payload question has never been through a shift-left pass and filing it now would create an unrefined ticket — the same reasoning this Story's own Out Of Scope applies to `POST /invites/accept`.

### Also from the same review, for the record

Adjudicated and FIXED on the branch: no executing test for `DELETE /workspaces/{id}/membership`'s session-only 403 (added, aimed at a nonexistent workspace id so a regression cannot delete a real membership row from the shared database); no test of the over-gating direction (added — `GET /me` with a `run:execute`-only PAT must still return 200); three stale comments.

Adjudicated and DISMISSED: "no test asserts a cookie caller passes a `cookie-only` route" — true, and pre-existing since BK-497 (`app/api/v1/tokens/cookie-only-posture.test.ts` has the identical gap); no cookie-session test harness exists in this repo, so closing it is infrastructure work, not this Story. "Posture-rationale comments sit after the final `return`" — that is BK-497's own precedent in `app/api/v1/tokens/[id]/route.ts`; matching it is correct.

Reconciled without code change: AC1's zero-scope scenario cannot be produced at runtime — `0008*access*tokens.sql`'s CHECK requires at least one scope and `POST /api/v1/tokens` enforces `.min(1)`, so the guarantee is held at mint time. A comment on the route now says so, to save QA hunting a 403 no reachable input can produce.

---

### Automation for Jira - 8/21/2026, 4:03:34 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 8/21/2026, 4:03:56 PM

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 8/21/2026, 4:05:00 PM

## Ready For QA — merged to `staging`

***PR***: [#193](https://github.com/upex-galaxy/upex-bunkai-tms/pull/193) · merge commit `f7d3bbc` · ancestry against `origin/staging` verified (exit 0)
***Branch***: `feature/BK-499-enforce-capability-scopes-read-identity-notification`
***Deploy***: Vercel staging check passed on the PR before merge.

Assigned to @@Luis Eduardo Flores Villarroel, who ran the 2026-08-21 shift-left pass on this Story.

### What shipped

All 24 handlers resolved per the 2026-08-21 AI Product Owner & AI Tech Lead ruling. No migration, no UI, no fifth scope value — the `scopes` CHECK in `0008*access*tokens.sql` is untouched and no already-minted token is invalidated.

| Posture | Count |
| --- | --- |
| `atc:read` | 14 reads |
| `atc:write` | 1 (`POST /workspaces/{id}/projects`) |
| session-only (`cookie-only`) | 2 (`POST /me/active-workspace`, `DELETE /workspaces/{id}/membership`) |
| no capability, justified | 7 (6 identity/notification + `POST /workspaces` bootstrap) |

Zero `BK-<n> pending` placeholders remain anywhere under `app/` — a new test now fails if one reappears.

### What QA should know before testing

***The two session-only 403s are NOT missing-scope 403s.*** This is the distinction the shift-left review flagged, and it is now enforced at the gateway rather than in the handler body. A negative case must assert the right one:

| Route | 403 message |
| --- | --- |
| `POST /me/active-workspace` | `Personal access tokens have no switchable active workspace. Pass workspace_id explicitly on each request instead.` |
| `DELETE /workspaces/{id}/membership` | `Personal access tokens cannot leave a workspace. Use a browser session.` |
| any `atc:read`-gated route | `Missing required capability: atc:read` |
| `POST /workspaces/{id}/projects` | `Missing required capability: atc:write` |

Both session-only routes refuse ***every*** Bearer PAT regardless of scope, so a token holding `atc:read` is still refused — that is the correct result, not a bug.

***AC1 Scenario 1.2 (zero-scope token cannot bootstrap) has no reachable fixture.*** A zero-scope token cannot be minted: `0008*access*tokens.sql` requires `array_length(scopes,1) >= 1` and `POST /api/v1/tokens` enforces `.min(1)`. The guarantee is held at mint time, not by a route 403. A comment on `app/api/v1/workspaces/route.ts` records this so nobody hunts a 403 no input can produce.

***Over-gating is the regression to watch, not under-gating.*** The identity and notification routes deliberately require NO capability — `GET /me` must return 200 for a token scoped only `run:execute`. There is now a test for exactly that.

***Published docs are current***: `public/openapi.json` states the scope and declares the 403 for every operation whose posture moved, and `/qa`'s PAT scope table names what `atc:read` and `atc:write` now cover — and, deliberately, what `atc:read` does NOT cover (the personal inbox, preferences, `/me`).

### Verification run before merge

`bun test` 1617 pass / 1 fail · `bun run types:check` clean · `bun run lint:check` 0 errors · `bun run format:check` clean.

The single failure is ***pre-existing and unrelated to this Story***: `lib/runs/start-run.test.ts` ATC-01 (`step*count` expected 1, received 2). Root cause verified — its fixture builds the expected count from an unpaginated `atc*steps` read, that table now holds 6,397 rows, and PostgREST caps an unbounded select, so the fixture under-counts while the RPC counts correctly. A BK-34 test-fixture defect; this branch touches no run-creation path, no RPC and no migration. Filed as separate follow-up.

The capability suites drive REAL exported handlers with REAL minted PATs against the live database, including a genuine production write path (`POST /workspaces/{id}/projects` → 201, row read back through an independent client, paired with a 403 whose row count is unchanged).

### Review adjudication

Independent adversarial review: ***BLOCKER 0 · MAJOR 1 · MINOR 4 · NIT 2 raised; 0 unresolved at merge.*** Four fixed on the branch, one dismissed with a reason, one reconciled without code change. The MAJOR — that the new `atc:read` gate on `GET /workspaces` is redundant against the ungated `GET /me` payload — was adjudicated in the `## AI Tech Lead — Decision` comment above: shipped as ruled, with the `/me` payload narrowing recorded as follow-up debt rather than smuggled into a posture sweep. Full per-finding table in the PR body.

---


_Synced from Jira by sync-jira-issues_
