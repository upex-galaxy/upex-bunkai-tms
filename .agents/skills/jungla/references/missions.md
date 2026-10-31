# Proactive missions and recurring duties

When no gank is waiting and no heavy worker is running, the watcher's `PROACTIVE` slot gives you one block of work (routine Phase 2). You take the first mission with `status: ready` in `state.json` `missions` and do **one slice**: one worker, or about an hour of your own reading and writing. A slice ends with a journal line and, when it produced something, a commit, a PR, a Jira item or a channel post.

## Initial backlog (owner deck 2026-10-30)

Copied into `state.json` `missions` on the first day. All approved as "first" except where noted. Nothing here was executed on the night it was written.

| Id | Mission | Status | Notes |
| --- | --- | --- | --- |
| m1 | Fix the broken design | ready | `.context/design/master-design-plan.md`: atoms ~30%, ATC editor ~40%, App Shell ~75%. Live UI first (Bunkai rule LIVE-UI-FIRST). Slice = one screen or one atom family, as a ticket and its PR. |
| m2 | Unblock the ~12 stories waiting for a mockup (🔒) | ready | `/design-system` screen phase per story, then the §8 row AND the `dev-roadmap.md` entry in the same change (`/autonomous-delivery` rule). |
| m3 | Finish the half-built features | ready | Find them with the business feature map and the open epics; one story per slice. |
| m4 | **Stripe** (owner's priority) | ready | First the plan, then BK-231 and BK-233. See § m4 below. |
| m5 | Propose the `staging` -> `main` promotion | ready | None since June. You prepare the release PR body and the risk list; **the final yes is the owner's** (Critical Rule #4). Never push `main`. |
| m6 | Process debt | ready | Orphan migration `0068` (`0068_story_traceability_report.sql`: ledger vs repo). BK-467 and BK-509: **advanced status with no code, verify** (measured 2026-10-31: BK-467 in `QA Approved`, BK-509 in `Ready For Release`, no feature commit with either key on `origin/staging`). G3's code gate already stops BK-467. | <!-- volatile-ok: dated measurement of a live run, kept as evidence -->
| m7 | Wednesday sprint review in the channel | ready from 2026-11-04 (S4 A) | Every Wednesday from 2026-11-04: blocked stories, defects, stories ready, PO decisions taken, so the owners can veto. Posted at the Phase 4 close (routine step 5). |
| spike | Students mentioning the owner to talk "to the developer" | research only, week of 2026-11-02 (S5 A) | Do not enable. Investigate during that week and bring the proposal to the 2026-11-04 sprint review (m7). See § spike below. |

## Recurring duties

These are not missions with an end; they run on their own clock.

- **Student stock (Q2).** Keep about `JUNGLA_STOCK_TARGET` (20) stories open for students (`JUNGLA_STOCK_JQL`), adding about 10 per week: `/autonomous-delivery discovery` within its `discovery_definitions` cap per run, so about one run per weekday. New stories include refinements and refactors (design, features), split into epics and stories per `/product-management`. Students also clone past stories, so not every new story is taken; count, do not guess. Record `stock.last_discovery`.
- **DB audit (D6 B).** Once a day: data that breaks the app on `JUNGLA_SUPABASE_REF` (orphan rows, broken FKs the app assumes, rows that fail a CHECK the code relies on, stuck states). Read-only first; what you change goes to the journal with the exact SQL.
- **DB cleanup.** Weekly or when the audit asks for it: test data students left behind that slows or breaks the app. Never the schema-defining fixtures the tests rely on.
- **G4 sweep.** Once a day (`references/ganks.md` § G4).

## m4 · Stripe plan

The deliverable is a plan in the channel (and a doc under `.context/` if it grows), useful for the owner AND for teaching how to test payment gateways (Stripe, Adyen and others). It answers:

1. How classmates and students validate payments in **test / sandbox mode**: their own Stripe account versus access to the owner's.
2. Whether **one account serves several projects** (Bunkai, SoloQ, others), and how (separate test-mode data, restricted keys, Connect or not).
3. **What strictly needs the owner** (account ownership, KYC, live keys, billing), and what you can do alone.
4. How it becomes a lesson: test cards, webhooks, 3-D Secure, refunds, idempotency, and the equivalent in Adyen.

Use `[DOCS_TOOL]` (Context7) for Stripe's current docs. After the plan: BK-231 and BK-233.

## Spike · "talk to the developer"

Students mention the owner in Jira comments (or Slack) to reach "the developer". The idea: you listen for those mentions and answer as the FDE. Find out, without enabling anything: whether Jira can notify or be polled for mentions of a given account (JQL on comments, webhooks, automation rules), which account you would answer from (the owner's would impersonate; a bot or service account would not), the volume, and the risk (you would be talking to students, which only the tutor does: D1). Research it the week of 2026-11-02 and present the proposal in the Wednesday 2026-11-04 sprint review (m7) for the owners to decide (S5 A).
