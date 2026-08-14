# BK-264 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

## Acceptance Test Plan (ATP) — BK-264: TMS-Defect Triage | Assign a defect to a workspace member and update its status

### Phase 0 — Triage

> ***NOTE:**** ****Veto******:****** REQUIRE TESTING**** — this story touches ****data integrity on a core entity**** (`bugs.assignee*user*id` + the forward-only status lifecycle, backstopped by the DB-level trigger `bunkai*bugs*check_consistency`) AND ****authorization*** (role-gated who may assign/reassign/unassign/transition, and who may be assigned). Full ATP is mandatory regardless of score.

Risk score (computed anyway, for prioritization and the "extended edge cases" callout):

| Factor | Score | Rationale |
| --- | --- | --- |
| New feature | +3 | Brand-new capability — no prior assignment/status-write existed |
| Dynamic data (API/DB) | +3 | Two new `SECURITY DEFINER` RPCs + 2 new API routes |
| Explicit ACs present | +2 | 10 Gherkin scenarios |
| User-facing | +2 | New controls on `BugsListView.tsx` |
| High effort | +2 | ~4 person-days (Slice 1-4) |
| High priority | +0 | Jira Priority = Medium |
| Multi-component | +1 | DB + API + UI + Activity feed |
| ***Total**** | ****13 — HIGH*** | Full ATP + extended edge cases (per Phase 0.2 table) |

***Data feasibility*** (Discover / Modify / Generate):

| AC | Precondition | Data found? | Pattern | Notes |
| --- | --- | --- | --- | --- |
| AC1 | Open bug, no assignee, Member-role target | No | Generate | Target workspace (`Luis QA Workspace`, id `4c0af193-ccc1-4062-b5dd-03d9f36ba72a`) has zero projects/bugs today (DB-confirmed) — must create project → module → bug fresh |
| AC2-4 | Assigned bug at each status | No | Generate → Modify | Same generated bug, driven through the chain |
| AC5-6 | Bug at a given status, invalid transition attempted | No | Generate | Fresh bug instances per invalid-transition case to keep the audit trail legible |
| AC7 | Non-member email | N/A | Discover | Any syntactically valid, never-invited email works — no seeding needed |
| AC8 | Viewer-role member in workspace | No | Generate | Workspace has 0 non-owner members today (DB-confirmed) — invite-flow required |
| AC9 | Second Member+ identity distinct from AC1's assignee | Partial | Discover + Generate | Reuse the workspace ***owner*** (staging account itself) as the reassignment target — owner qualifies as "at least Member-level access"; avoids needing a 3rd identity |
| AC10 | Assigned bug | No | Modify | Reuses AC1/AC9 bug |

No critical AC is blocked — all patterns resolve to Generate/Modify via the invite-flow plan below (§Test Data).

---

### Phase 1 — Critical Analysis

***Business context.**** Primary personas: Mateo Silva (QA Lead, assigns/reassigns/unassigns), Sara Iglesias (Full-Stack Dev, Member access, drives open→in progress→resolved), Elena Vargas (Senior QA, closes resolved→closed). Business rule confirms status-transition access is ****workspace-wide Member+***, not assignee-specific — so on staging, the single test account (acting as workspace owner, which is ≥ Member) can legally drive ACs 2-4 itself without a second login. Value: gives every defect an owner + a real, auditable lifecycle; direct prerequisite for BK-212 (Notifications) and feeds Bug Heatmap / Recovery-Cycle metrics (assume monotonic forward progression) and the Activity Stream.

***Technical context.***

- Frontend: `BugsListView.tsx` (assignee cell + single-next-stage action button, no dropdown), `BugAssignControl.tsx` (member picker, write-role only).
- Backend: `POST /api/v1/bugs/{id}/assign`, `POST /api/v1/bugs/{id}/status` (`atc:write` scope) → `bunkai*assign*bug` / `bunkai*transition*bug_status` RPCs (`SECURITY DEFINER`, `auth.uid()`-only, no actor param).
- DB: `bugs.assignee*user*id`, extended `bunkai*bugs*check*consistency` trigger (SQLSTATE 45310/45311/45312/45313 backstop), `activity*log*notify*bug_event` trigger (writes the `notifications` row BK-212 will subscribe to).
- Integration point: assign/status write → `activity*log` insert → `activity*log*notify*bug_event` fires → `notifications` insert. This chain is the one PO Decision #5 asks us to capture concretely in Stage 2.

***Story complexity***: Business logic — High (state machine + eligibility decision table + non-spoofable attribution). Integration — Medium (2 new RPCs, 1 extended trigger, activity feed). Data validation — Medium (Zod schemas, 4 distinct SQLSTATEs). UI — Low (2 small controls on an existing surface, no new screen).

***Epic-level inheritance***: FEAT-048 (Epic BK-31) already documents this feature as ✅ Stable/Live post-implementation, confirming forward-only transitions and the notification trigger — no re-derivation needed, cited directly.

---

### Phase 2 — Story Quality Analysis

***Ambiguities.***

- "Reassigning to the same person" — ***resolved, not ambiguous.**** `implementation-plan.md` (Slice 1 edge cases) states explicitly: "repeated identical assign/unassign is a silent no-op (no duplicate `activity_log` row)." `business-rules.md`'s "no member can attribute an assignment... to someone else" is about ****attribution*** (who performed it), not about same-target reassignment. Outline #6 below tests the documented no-op behavior directly — no PO question needed.

***Gaps.***

- No AC covers ***actor-side**** authorization (a Viewer-role member **attempting* to assign/reassign/unassign/change-status). `implementation-plan.md` documents the expected behavior (`forbidden`, 42501) but no Gherkin scenario exercises it. Risk: High — this is the authorization half of the veto trigger. Added as outlines #8 and #17 (risk-beyond-AC, not a PO question — behavior is already documented).
- No AC covers a ***same-status transition attempt**** (e.g. request `in*progress` while already `in*progress`). Neither 45310 (skip) nor 45311 (backward) obviously fits a same-state request, and no source document states the expected SQLSTATE/behavior for this case. ****NEEDS PO/DEV CONFIRMATION.***
- No AC covers assigning to a ***former/inactive member**** (`workspace_members.status != 'active'`) as distinct from "never a member." `implementation-plan.md` implies the same 45312 bucket ("no active row → 45312") but this is inferred, not explicit. ****NEEDS PO/DEV CONFIRMATION*** (low risk — likely correct, but flagged).

***Edge cases not in story*** (added to refined ACs / outlines below):

- Status-change attempted on a `closed` (terminal) bug — implementation plan says it's "naturally caught by the backward/no-path bucket." Outline #16.
- Cross-workspace bug id passed to assign/status routes — non-disclosure boundary (P0002), per implementation plan Decision 1.5. Outline #9.
- DB-level cross-check that `activity*log*notify*bug*event` actually fires a `notifications` row on assignment — required by PO Decision #5 for the BK-212 handoff comment. Outline #20.

***Testability****: ****Yes*** — every AC has concrete Given/When/Then data, verbatim error copy is quoted in the AC text itself, and Code Locations map every scenario to an RPC + SQLSTATE. No blocking testability issues.

---

### Phase 3 — Refined Acceptance Criteria

All 10 original ACs are testable as written (see `acceptance-criteria.md` for the full Gherkin — not reproduced here to avoid duplication; each is referenced below by number). Refinements below apply Phase 3's 1:N explode rule.

| AC | Refinement | Type | Priority |
| --- | --- | --- | --- |
| AC1 | Exploded ×2 (parametrized): assign to a Member-role identity (as given) AND to the workspace Owner (Decision-Table "eligible" rule — owner also holds ≥ Member access) | Positive | P0 |
| AC2-4 | Kept 1:1 — each is a single valid forward transition, `trivially atomic` per-transition (no ranges/branches inside a single hop) | Positive | P0 |
| AC5 (skip) | Exploded ×3 (parametrized, same outcome/SQLSTATE): open→resolved (as given), open→closed, in_progress→closed | Negative / State-Transition | P0 |
| AC6 (backward) | Exploded ×3 (parametrized, same outcome/SQLSTATE): resolved→open (as given), in*progress→open, closed→in*progress | Negative / State-Transition | P0 |
| AC7 | Kept 1:1 — `trivially atomic`, single invalid partition (email never a member) | Negative | P1 |
| AC8 | Kept 1:1 — `trivially atomic`, single invalid partition (role=viewer) | Negative | P1 |
| AC9 | Kept 1:1 as given (Member→Owner reassignment) + 1 new sibling: reassign-to-same-assignee no-op (beyond AC) | Positive / Edge | P1 / P2 |
| AC10 | Kept 1:1 | Positive | P1 |

Beyond-AC additions (Principle 5, risk lives outside the criterion): actor-authorization rejection (×2), same-status re-entrancy (NEEDS CONFIRMATION), inactive-member assignment (NEEDS CONFIRMATION), terminal-state (`closed`) transition attempt, cross-workspace boundary, assign/status independence cross-check, activity-feed attribution wording cross-check, DB notification-trigger cross-check.

---

### Phase 4 — Test Design (Test Outlines)

#### Technique-driven derivation

| Trigger | Technique | Applied to |
| --- | --- | --- |
| Input domain (assignee email/id) | EP | AC1/7/8/9/10 — valid (member/owner) vs. invalid (non-member) vs. invalid (viewer) partitions |
| Status field with legal-next-value depending on current value | State-Transition | `bugs.status` — full 4-state chain, all 3 valid hops + parametrized skip/backward buckets |
| 2+ interacting conditions (assignee role × workspace-membership) | Decision Table | Assignment eligibility — see table below |
| Experience-based risk | Error Guessing | Actor-authorization, cross-workspace boundary, same-status re-entrancy, terminal-state attempt, no-op reassignment |

***State-Transition table*** (`bugs.status`, 4 states, linear forward-only chain):

| From \ Trigger | → in_progress | → resolved | → closed | → open |
| --- | --- | --- | --- | --- |
| ***open*** | ✅ valid (AC2) | ❌ skip (45310) | ❌ skip (45310) | — (no-op N/A, self) |
| ***in******_******progress*** | — (self) | ✅ valid (AC3) | ❌ skip (45310) | ❌ backward (45311) |
| ***resolved*** | ❌ backward (45311) | — (self) | ✅ valid (AC4) | ❌ backward (45311, AC6) |
| ***closed*** | ❌ backward (45311) | ❌ backward (45311) | — (self) | ❌ backward (45311) |

***Decision table*** (assignment eligibility — role × workspace-membership):

| Actor writes | Assignee is workspace member? | Assignee role | Outcome | SQLSTATE |
| --- | --- | --- | --- | --- |
| Member+ actor | Yes (active) | member | ✅ Eligible (AC1) | — |
| Member+ actor | Yes (active) | owner | ✅ Eligible (Decision-Table addition, reused as AC9 target) | — |
| Member+ actor | Yes (active) | viewer | ❌ Rejected (AC8) | 45313 |
| Member+ actor | No (never invited) | n/a | ❌ Rejected (AC7) | 45312 |
| Member+ actor | Yes, but `status != active` | any | ❌ Rejected (beyond-AC, NEEDS CONFIRMATION) | 45312 (inferred) |
| Viewer actor (regardless of assignee) | n/a | n/a | ❌ Forbidden (beyond-AC, actor-side) | 42501 |

#### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 6 | AC1(×2 param rows)/2/3/4/9/10 |
| Negative | 10 | AC5(×3 param)/6(×3 param)/7/8, actor-auth(×2) |
| Boundary / Edge | 4 | same-status, inactive-member, terminal-state, cross-workspace |
| Integration | 2 | independence cross-check, activity-attribution cross-check |
| DB cross-validation | 1 | notification-trigger capture (PO Decision #5) |
| ***Total outlines**** | ****20*** | 10 map 1:1 to the AC floor; 10 are risk-beyond-AC |

Rationale: HIGH risk score + veto-forced Full ATP (data integrity + authorization) justifies the extended edge-case set; the story's own implementation plan already documents most of the beyond-AC behaviors (actor-auth, no-op reassign, terminal-state, boundary P0002), so these are traceable-not-invented additions, not speculative padding.

#### Test outlines

| # | Title | Type | Priority | Level | Precondition | Expected result | Traces to |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Should assign an open defect to an eligible workspace member (parametrized: role=member, role=owner) | Positive | P0 | UI+API | Open bug, no assignee, target holds member or owner role, active | Bug shows target as assignee; activity shows "{actor} assigned this defect to {target}" | AC1 |
| 2 | Should reject assigning a defect to an email outside the workspace | Negative | P1 | API | Open bug, target email never invited | 45312 rejected, verbatim message, assignee stays null, no DB change | AC7 |
| 3 | Should reject assigning a defect to a former/inactive workspace member — NEEDS PO/DEV CONFIRMATION | Negative | P2 | API+DB | Bug open; target has a `workspace_members` row with `status != 'active'` | Expected: 45312 (inferred, not explicit in any source) | beyond-AC |
| 4 | Should reject assigning a defect to a Viewer-role member | Negative | P1 | UI+API | Open bug, target role=viewer, active | 45313 rejected, verbatim message, assignee stays null | AC8 |
| 5 | Should reassign a defect to a different eligible member (Member → Owner) | Positive | P1 | UI+API | Bug assigned to Member-role identity | Assignee flips to Owner identity; prior assignee no longer shown | AC9 |
| 6 | Should silently no-op when reassigning a defect to its current assignee | Edge | P2 | API+DB | Bug already assigned to X | Assignee unchanged; ***no*** new `activity_log` row inserted (verify via DB count before/after) | implementation-plan.md Slice 1 edge cases |
| 7 | Should unassign a defect, returning it to no-owner | Positive | P1 | UI+API | Bug assigned to a member | Assignee shows none; activity shows "{actor} unassigned this defect" | AC10 |
| 8 | Should reject assign/reassign/unassign performed by a Viewer-role actor | Negative | P0 | API | Actor authenticated but role=viewer in the workspace | 403/42501 forbidden; no assignee change | beyond-AC (implementation-plan.md Decision 1.5) |
| 9 | Should return a non-disclosing not-found for assign/status actions on a bug outside the caller's workspace | Negative | P2 | API | Bug id belongs to a different workspace | P0002, same shape as any other not-found (non-disclosure) | beyond-AC (implementation-plan.md Decision 1.4/1.5) |
| 10 | Should move a defect from open to in progress | Positive | P0 | UI+API | Bug assigned, status=open | Status shows in progress; activity shows "{actor} moved this defect to in progress" | AC2 |
| 11 | Should move a defect from in progress to resolved | Positive | P0 | UI+API | Bug assigned, status=in progress | Status shows resolved; activity message per AC | AC3 |
| 12 | Should move a resolved defect to closed by a Member+ actor who is not the assignee | Positive | P0 | UI+API | Bug status=resolved, actor holds Member+ access workspace-wide (not necessarily the assignee) | Status shows closed; activity shows "{actor} closed this defect" | AC4 + business-rules.md (workspace-wide access, not assignee-specific) |
| 13 | Should reject a status transition that skips a stage (parametrized: open→resolved, open→closed, in_progress→closed) | Negative | P0 | API | Bug at the "from" state of each row | 45310 rejected, verbatim "must move to X first" message, status unchanged | AC5 (+2 exploded siblings) |
| 14 | Should reject a status transition that moves backward (parametrized: resolved→open, in*progress→open, closed→in*progress) | Negative | P0 | API | Bug at the "from" state of each row | 45311 rejected, verbatim "cannot move backward" message, status unchanged | AC6 (+2 exploded siblings) |
| 15 | Should reject a same-status transition attempt — NEEDS PO/DEV CONFIRMATION | Negative | P2 | API | Bug at status X, request status=X again | Expected behavior undocumented — probe and report actual (idempotent no-op vs 45310/45311 vs new error) | beyond-AC |
| 16 | Should reject any status-change attempt on a closed (terminal) defect | Negative | P1 | UI+API | Bug status=closed | Rejected (backward/no-path bucket per implementation plan); no forward action button rendered in UI | beyond-AC (implementation-plan.md Risks §1) |
| 17 | Should reject a status-change attempt by a Viewer-role actor | Negative | P0 | API | Actor role=viewer, bug at any non-terminal status | 403/42501 forbidden; status unchanged | beyond-AC |
| 18 | Should verify assignment and status are mutually independent (parametrized: reassign does not alter status; status change does not alter assignee) | Integration | P1 | API+DB | Bug with both an assignee and a mid-chain status | Reassigning leaves `status` untouched; transitioning leaves `assignee*user*id` untouched | business-rules.md rule 5 |
| 19 | Should attribute every assign/status action to the performing member, never another member (parametrized across AC1/2/3/4/9/10) | Positive | P0 | UI+API+DB | Each action performed by a distinct, known actor | Activity row's actor matches `auth.uid()` of the performer, verbatim wording per AC; DB `activity*log.actor*user_id` non-spoofable | business-rules.md rule 3, AC1-4/9/10 |
| 20 | Should write a `notifications` row via `activity*log*notify*bug*event` on assignment (DB cross-validation for BK-212 handoff) | Integration | P0 | DB | After outline #1 executes | Exactly one new `notifications` row exists, shape matching implementation-plan.md Decision 7's payload table; row captured verbatim for the Stage-3 BK-212 comment | PO Decision #5 (test-session-memory.md) |

---

### Phase 5 — Edge case + Test-data summary

***Edge case table***

| Edge case | In original story? | Added to refined AC? | Outline | Priority |
| --- | --- | --- | --- | --- |
| Actor-side Viewer rejection (assign + status) | No | Yes (beyond-AC) | #8, #17 | P0 |
| Same-status re-entrancy | No | Yes, flagged NEEDS CONFIRMATION | #15 | P2 |
| Inactive-member assignment target | No | Yes, flagged NEEDS CONFIRMATION | #3 | P2 |
| Terminal-state (`closed`) transition attempt | No | Yes | #16 | P1 |
| Cross-workspace bug id boundary | No | Yes | #9 | P2 |
| Assign/status independence | Implied by business-rules.md rule 5 | Yes | #18 | P1 |
| Reassign-to-same-assignee no-op | No (resolved by implementation-plan.md) | Yes | #6 | P2 |
| Notification-trigger row capture | No (PO Decision #5) | Yes | #20 | P0 |

***Test-data categories***

| Data type | Count | Purpose | Examples |
| --- | --- | --- | --- |
| Identities | 2 new + 1 reused | Exercise the eligibility decision table | New: 1 Member-role invitee, 1 Viewer-role invitee. Reused: the staging account itself, acting as both Owner (reassignment target, AC4 non-assignee-actor) and QA Lead (assigner) |
| Bugs | 4-5 fresh | One primary bug driven through the full happy-path chain (outlines 1,10,11,12,19,20); separate fresh bugs per skip/backward parametrized row to keep evidence legible | Created via the app's existing bug-filing flow inside `Luis QA Workspace` (workspace currently has 0 projects/bugs — must seed a project + module first) |
| Emails (invalid target) | 1 | AC7 negative case | Any syntactically valid, never-invited address, e.g. `not-a-member+bk264@example.com` |

***Data generation strategy***

- ***Static***: the never-invited email for AC7 (hardcoded, no seeding risk).
- ***Dynamic (invite flow)***: the 2 new identities are onboarded via the app's own `workspace_invites` + auth-signup flow — see Test Data plan below (not raw DB seeding, per PO Decision #2).
- ***Cleanup***: not required — staging is a shared, persistent environment; workspace/bugs/identities created here are additive and do not collide with other seeded data (workspace is a fresh, dedicated QA sandbox).

***Test Data plan — identity onboarding (finalized this session)***

DB recon (targeted, minimal — 1 query against `workspaces`, 1 against `workspace*members`, 1 against `bugs`/`projects`) confirms: the staging test account (`STAGING*USER*EMAIL`) owns workspace ***"Luis QA Workspace"**** (`id = 4c0af193-ccc1-4062-b5dd-03d9f36ba72a`), created 2026-08-13, currently the ****sole member**** (`role=owner`, `status=active`) with ****zero projects/bugs***. No `workspace*invites` row exists yet for this account.

> ***NOTE:**** ****Correction to the prior session's assumption.**** `business-api-map.md` §7 (GAP-5, unresolved, unchanged since June) states invite emails are ****not sent**** — `POST /workspaces/{id}/invites` returns the `accept*url` directly in the response body; `RESEND*API*KEY` is unused by the invite flow. `resend-cli` therefore cannot be used to "receive the invite email" as test-session-memory.md's DB-recon note assumed — there is no such email to receive. `resend-cli` remains necessary, but for a ****different**** step: receiving the mandatory signup ****OTP*** confirmation code (`POST /api/v1/auth/confirm`) when creating the 2 new test identities, since `STAGING*USER_EMAIL`'s domain (`ambuusteln.resend.app`) is a Resend-managed receiving domain and new test identities should reuse it (e.g. `<local-part>@ambuusteln.resend.app`) to stay within the same receivable inbox.

Stage 2 execution checklist:

1. Sign up 2 new identities against the OTP-mandatory flow (`POST /api/v1/auth/signup` → `POST /api/v1/auth/confirm`), using addresses on the same Resend-managed domain as `STAGING*USER*EMAIL` — e.g. `bk264-member@ambuusteln.resend.app` and `bk264-viewer@ambuusteln.resend.app`. Retrieve each OTP via `resend-cli` inbound-email listing/watch against that domain.
2. As the staging owner, call `POST /workspaces/4c0af193-ccc1-4062-b5dd-03d9f36ba72a/invites` twice: `{email: bk264-member@..., role: 'member'}` and `{email: bk264-viewer@..., role: 'viewer'}`. Capture the `accept_url`/token from each API response body directly (no email involved, per GAP-5).
3. Sign in as each new identity and call `POST /api/v1/invites/accept {token}` (or navigate the captured `accept_url` while authenticated as that identity).
4. Verify via `[DB*TOOL]`: `workspace*members` for workspace `4c0af193-...` now has 3 active rows — owner (staging), member (bk264-member), viewer (bk264-viewer).
5. Seed a project + module inside `Luis QA Workspace` (workspace has none today), then file the primary test bug(s) needed for outlines #1/#10/#11/#12/#19/#20 and the skip/backward parametrized bugs for #13/#14.
6. Reuse the staging owner account itself as the AC9/outline-#5/#12 "second member" (reassignment target, and the non-assignee Member+ actor closing the bug) — avoids a 3rd invited identity.

---

### Phase 6 — Traceability

ATP written to Story field `customfield_10067` (`🧪 Acceptance Test Plan (ATP)`, TMS Modality jira-native — no separate Test Plan issue). Label `shift-left-reviewed` intentionally ***not*** added — this story reached Ready For QA "with no shift-left QA phase" by explicit team decision (comments.md), and PO Decision #1 says no action needed there; adding the label here would misrepresent a pre-sprint review that never happened. TCs are not created in this stage (jira-native modality — Stage 4 `test-documentation` creates persistent regression `Test` issues later, selectively).

---

### Phase 7 — Executive Summary

***Story quality***: Good. All 10 ACs are concrete, testable, and traced to a specific RPC + SQLSTATE. Business rules are precise about attribution and workspace-wide Member+ access. The implementation plan pre-answers most "risk-beyond-AC" questions (actor-auth, no-op reassign, terminal-state, boundary non-disclosure) — this ATP cites those answers rather than guessing.

***Key findings***:

1. Target workspace (`Luis QA Workspace`) is empty (no projects/bugs, 1 member) — all test data is Generate-pattern, requiring a short seeding pass in Stage 2 before any AC can execute.
2. The prior session's test-data assumption ("resend-cli receives the invite email") is corrected: GAP-5 confirms invite emails are never sent; `accept_url` comes back in the API response. `resend-cli` is still needed, but for OTP signup confirmation, not invite receipt.
3. Two behaviors have no documented answer anywhere in the story, business rules, or implementation plan: same-status re-entrant transitions (outline #15) and inactive-member assignment (outline #3) — both flagged NEEDS PO/DEV CONFIRMATION, not guessed.

***Critical questions for PO/Dev***:

- What should happen on a same-status transition request (e.g. `in*progress` → `in*progress`)? Silent no-op, or a rejection — and if rejected, which SQLSTATE? (Impact if unanswered: outline #15 executes as an exploratory probe and reports the **actual** behavior rather than asserting an **expected** one.)
- Does assigning to a former/inactive workspace member return the same 45312 as a never-a-member email, or a distinct code? (Impact if unanswered: outline #3 asserts 45312 as a best-guess and flags any mismatch as an observation, not a bug.)

***Risks & mitigation***: HIGH risk score (13) driven by data-integrity + authorization surface, mitigated by the DB-level trigger backstop (tested directly via outlines #13/#14) and by outlines #8/#17 explicitly covering actor-side authorization the ACs are silent on.

***What was done***: ATP written to `customfield_10067`; `acceptance-test-plan.md` materialized via sync; `test-session-memory.md` updated (Test Data plan finalized, Planning checklist ticked, risk score recorded).

***Next steps***: Stage 2 executes the identity-onboarding + data-seeding checklist above, then runs all 20 outlines, capturing the one concrete `notifications` row required for the Stage-3 BK-212 comment (PO Decision #5).

---
_Synced from Jira by sync-jira-issues_
