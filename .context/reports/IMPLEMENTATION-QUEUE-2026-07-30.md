# Implementation Queue — snapshot 2026-07-30

> **Dated photo, not a living doc** (dev-roadmap §6 rule: status goes stale — re-query Jira before
> trusting any status printed here). Structure (dependency edges) comes from `dev-roadmap.md` §3
> and is durable; statuses were read live from Jira on 2026-07-30. Every US below has its mockup
> attached in Jira (inline-image comment) and a spec section in `master-design-plan.md`.
> Consume top-to-bottom with `/sprint-development`, one item at a time.

## Phase 0 — Open defects (fix first; production quality gates everything)

| # | Bug | Prio | Status | Assignee today | Note |
|---|---|---|---|---|---|
| 0.1 | BK-175 Magic-link OTP email has no code-entry field (staging) | Highest | In Review | Benjamin | Already in review — verify/close, don't restart. |
| 0.2 | BK-181 "Request a new code" calls signup instead of resend | High | Open | Benjamin | Auth flow, user-facing. |
| 0.3 | BK-248 POST /api/v1/tests 500 (idempotency insert failed) | Medium | Open | UNASSIGNED | Hits BK-27's endpoint — degrades every test-creation flow; likely quick backend fix. |
| 0.4 | BK-182 Bearer run creation cannot resolve active workspace | Medium | Open | Ely | Blocks CLI/CI run creation (BK-34 surface + future BK-222). |
| 0.5 | BK-176 Sign-out: client redirect to /login does not fire | Low | Open | Andrés | BK-86 scope; cheap fix, aligns with Settings cluster work. |
| 0.6 | BK-118 POST /me/active-workspace returns legacy fields | Low | Open | Ely | Contract cleanup; do together with BK-89's workspace contract work. |

## Phase 1 — Settings cluster (all RFD, mockups ✅, no external gate)

```
BK-87 Settings hub + Account view (2 SP)          ← START HERE
 ├──> BK-88 Manage Personal Access Tokens (5 SP)
 └──> BK-89 View my workspaces (2 SP)              ⚠️ resolve open Dev contract first:
       │                                              add `role` to GET /workspaces +
       │                                              active-workspace transport
       │                                              (pairs naturally with bugs BK-118 + BK-182)
       └──> BK-90 Leave a workspace (5 SP)            server-side sole-owner guard = backend prereq
```

## Phase 2 — Runs tail (epic BK-30; BK-34 gate ✅; parallel-safe among themselves)

```
BK-34 ✅ (shipped)
 ├──> BK-35 Mark step pass/fail/block (5 SP)       RFD (promoted from Estimation)
 ├──> BK-37 Run history per test (3 SP)            RFD · mockup test-run-history
 └──> BK-38 Filter project runs + totals (3 SP)    RFD · mockup test-runs-index
(BK-36 abort ✅ · BK-39 verdict = Ready For Release — out of the queue)
```

Completing Phase 2 closes epic BK-30 → releases the ES4 gate for Phases 3–4.

## Phase 3 — Defects epic BK-31 (all RFD; ES4 gate = BK-30 complete)

```
BK-40 File defect from failing run step (needs live run steps → Phase 2 shipped)
 ├──> BK-41 List/filter defects            (list reads what BK-40 writes)
 │     └──> BK-42 Defect heatmap           (aggregates BK-41's data; mockup = Heatmap toggle in bug-reports-index)
 └──> BK-43 Sync defects to external tracker (one-way, off BK-40's records)
```

## Phase 4 — Coverage & traceability epic BK-44 (ES4 gate; feeds on runs + defects)

```
BK-45 US→bug evidence chain (needs runs + defects data → after Phase 3)
 ├──> BK-50 Export assembled chain          (exports what BK-45 renders)
 └──> (BK-48 chain filters — Shift-Left QA, promote when refinement closes)
BK-46 Untested ACs / coverage surface       (independent of BK-45; needs runs data only)
BK-49 Activity stream read feed             (independent; reads existing activity log)
(BK-47 time-to-green — Estimation, not ready)
```

## Phase 5 — Notifications epic BK-208 (RFD in Jira — VERIFY the promotion was intentional)

```
BK-209 Inbox of workspace events
 ├──> BK-211 Run finished/aborted events    (producer → renders into BK-209 inbox)
 ├──> BK-212 Bug events                     (producer; pairs with Phase 3 data)
 └──> BK-213 Notification preferences       (extends the BK-87 Settings hub → after Phase 1)
(BK-214 email digest — Backlog, stays out)
```

⚠️ These 4 are post-MVP by roadmap but sit `Ready For Dev` in Jira (promotion unexplained as of
this snapshot). If unintentional, demote and delete this phase; if intentional, they queue AFTER
Phases 1–4.

## Parked (do NOT pull)

- **BLOCKED**: BK-20 ATC search (mockup intentionally ahead of story scope) · BK-23 ATC duplicate.
- **Estimation**: BK-35→already promoted; BK-47, BK-205, BK-219.
- **Shift-Left QA**: BK-48.
- **Backlog (post-MVP by design)**: BK-202..207, BK-214..220, BK-225..233 — mockups ready, waiting
  for the post-MVP frontier decision.
- **Not a product US**: BK-188 (QA support summary) — reporting artifact, nothing to implement.

## How to consume

Per item: `/sprint-development` + the Jira key. The skill loads the story folder, its mockup
(now attached in Jira + `.context/designs/bunkai-test-management-tool/bk-*/`), and the
master-design-plan §4 spec. Re-check status in Jira before starting any item (`dev-roadmap.md` §6
queries) — this file does not update itself.
