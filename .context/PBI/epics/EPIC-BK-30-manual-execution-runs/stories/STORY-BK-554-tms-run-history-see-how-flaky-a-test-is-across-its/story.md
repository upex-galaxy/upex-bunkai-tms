# TMS-Run History | See how flaky a test is across its recent runs

**Jira Key:** [BK-554](https://jira.upexgalaxy.com/browse/BK-554)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** Senior QA Engineer
***I want to*** see, on a Test's Run history, how often that Test's verdict has flipped across its recent Runs
***So that*** I can tell a genuinely unstable Test apart from one that simply failed for a while and then got fixed, without reading the whole list and doing the arithmetic in my head

## Definition of done

- [ ] A Test's Run history states how flaky that Test is, next to the all-time outcome totals it already shows
- [ ] The statement names the flip count, the sample it was computed over, and the resulting rate
- [ ] A Test with too few finished Runs says so instead of showing a rate
- [ ] A Test that has never flipped reads as stable, not as an absent signal
- [ ] Aborted Runs are excluded from the rate and the exclusion is visible, not silent
- [ ] The signal does not change when the outcome filter is applied
- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story and an Acceptance Criterion

## Why this story exists

The PRD's US 6.4 states the purpose of Run history in its own words: a QA Engineer wants the full history of Runs for a Test ***"so I can spot flaky tests"***. BK-37 shipped the history — the list, the outcome filter, the all-time totals, the pagination — and left the spotting to the reader's eyes. That is the half of US 6.4 that never shipped.

Reading it by eye does not scale and, worse, it is easy to get wrong in a specific, predictable way. A Test that failed eleven times in a row and has passed ever since is not flaky; it was broken and it was fixed. A Test that alternates pass, fail, pass, fail is flaky and is costing the team more than a red one, because nobody knows which of its results to believe. Both read as "some passes, some fails" in a list of chips, and both produce the same all-time totals. Only the **order** of the outcomes separates them, and order is exactly what a column of chips does not make legible.

This is Elena's second pain point verbatim — reports she does not trust, where a headline percentage says nothing about whether the thing behind it is stable. The signal this story adds is the one number the totals cannot express.

## Current state (verified at `origin/staging@67f76b3`)

- Nothing anywhere in the product computes, stores, or renders a flakiness figure. The word does not appear in a single migration, route, or component.
- BK-37 (***TMS-Run History | View a test's past runs, filterable by outcome***) is the host. Its history reads only terminal Runs, newest-first, and its header already carries an all-time, filter-invariant outcome summary plus a proportional bar — the exact surface a per-Test signal belongs beside.
- BK-442 (***TMS-Run History | Compare a run against the previous run of the same test****) is the nearest neighbour and is a ****different thing****: it is a pairwise, step-grain diff between two named Runs, answering "what changed since last time". This story is a ****rate*** at the Run grain over many Runs, answering "can I believe this Test's result at all". BK-442's own Out Of Scope says it plainly — "flakiness scoring, trend lines, or any statistic computed over more than the two Runs being compared" — so the two stories are complementary by that ticket's own boundary, and neither absorbs the other. They can ship in either order.
- BK-45 and BK-48 (Traceability chain) render only the latest Run result per row, by design. Untouched by this story.
- The project coverage report's contract states it returns no trend and no prior-period delta. Nothing upstream supplies a figure this story could reuse.

## Starting position in the data model

Everything the rate needs is already stored and already indexed. `public.runs` carries `test*id`, `status` (`running | passed | failed | aborted` at the Run grain — note there is no `blocked` at this grain), `environment*id`, `executor*mode`, `started*at` and `finished*at`. `supabase/migrations/0038*run*history.sql` added `runs*test*id*status*started*at*idx` on `(test*id, status, started*at desc, id desc)` and the membership-gated read `bunkai*list*test*runs`, which already pages exactly that ordering and already refuses to treat a `running` Run as history.

So the ordered sequence of a Test's terminal verdicts is a query the database is already shaped for. No new table, no new column, no backfill.

## Notes for the implementing run

- ***Follow the 0038 shape.**** One additive migration, read-only, membership-gated through the same explicit-actor contract, no new authorization surface, reversible by dropping what it adds. The design-plan precedent for this exact shape is §5 ****D30*** (BK-48), which added two jsonb keys to an existing report RPC and was ratified as additive with zero auth-surface change.
- ***The signal is filter-invariant***, like the totals it sits next to and for the same reason: filtering the list to "Failed" would otherwise report a Test as perfectly stable, because every row left on screen has the same verdict.
- ***The rate must be auditable against the rows on screen.*** It walks the same `started_at desc, id desc` order the list already pages by, so a reader can count the flips themselves and get the same answer.
- ***No mockup draws this.*** `bk-30-test-runs-index/test-run-history.html` has no flakiness affordance of any kind. Under Critical Rule #15 this is a spec-only departure that needs a `master-design-plan.md` §5 divergence row and a §8 US→Screen map row before UI work starts — same treatment BK-442 carries as "mockup-gated, unratified". No ADR is expected: additive, read-only, reversible.
- ***The vocabulary is new.**** "Flakiness signal", "flip" and the three bucket names do not exist in `.context/business/domain-glossary.md`. Per that file's §6.1 change protocol the terms must be added there, marked **(not yet shipped)* with this ticket's key, in the same PR that implements them.
- ***Chain edits are deliberately not detected.*** BK-442's own open question shows that pairing a step across a changed chain is unsolved. This signal never pairs steps, so it is unaffected — but that also means a flip caused by an authoring change is reported the same as one caused by the product. Stated, not hidden.

## Edge cases enumerated

| Case | Expected behavior |
| --- | --- |
| Test has zero Runs | The existing "no runs yet" empty state stands; no signal, no zeroed rate |
| Test has exactly one finished Run | Below the minimum sample — states that more Runs are needed and how many |
| Test has 2–4 verdict-bearing Runs | Still below the minimum sample; same message, no rate |
| Every Run passed | Zero flips over a full sample reads as stable |
| Every Run failed | Zero flips reads as stable — consistently red is a broken Test, not a flaky one, and the totals already say it is red |
| Verdicts strictly alternate | Every pair is a flip; the highest bucket |
| One flip only (long red streak then fixed) | One flip out of the pairs in the window — the case the rate exists to keep out of the flaky bucket |
| All Runs in the window are aborted | No verdict-bearing Runs at all; below the minimum sample, with the aborted count disclosed so the emptiness is explained |
| Aborted Runs interleaved with verdicts | Skipped when building the sequence, so a pass either side of an abort is still one adjacent pair; the skipped count is shown |
| An in-progress Run is the most recent | Never participates, consistent with the history list's own rule |
| Runs spread across different Project Environments | One signal across all of them; a Test whose verdict depends on where it ran is not reproducible, which is what the signal claims. A per-environment split is a follow-up |
| The Test's ATC chain changed mid-history | The Run-grain verdict is still comparable, so the window is not invalidated; the story does not claim to attribute the cause |
| Fewer Runs exist than the window size (but at or above the minimum) | The rate is computed over whatever is there and the sample size is stated alongside it |
| Two Runs share an identical start time | Ordered by the same tie-break the history list already uses, so the sequence the reader sees and the sequence the rate walks cannot diverge |

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 8/19/2026
- **Updated:** 8/19/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** discovery-2026-08-19, flakiness, manual-execution-runs

---

_Synced from Jira by sync-jira-issues_
