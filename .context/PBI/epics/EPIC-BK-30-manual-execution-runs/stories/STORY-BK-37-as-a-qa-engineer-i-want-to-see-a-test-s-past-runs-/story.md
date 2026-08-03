# TMS-Run History | View a test's past runs, filterable by outcome

**Jira Key:** [BK-37](https://jira.upexgalaxy.com/browse/BK-37)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec:*** BK-022

## User story

***As a*** QA Engineer
***I want to*** see the history of past Runs for a Test, newest first, filterable by outcome
***So that*** I can compare results over time and spot flaky areas

## Definition of done

- [ ] A Test shows its past Runs ordered newest first
- [ ] Each history entry shows the Run's outcome, environment, executor mode, and when it ran
- [ ] The history can be filtered to show only passed, only failed, or only aborted Runs
- [ ] A Test with no Runs yet shows an empty-state message instead of a blank list
- [ ] Older Runs can be loaded beyond the first page
- [ ] Clearing a filter restores the full newest-first list

---

## QA Refinements (Shift-Left Analysis)

***Full ATP DRAFT***: see the Acceptance Test Plan (ATP) field on this Story.

### Edge Cases Identified

- Outcome filter matches 0 runs — needs a distinct empty message
- Test has exactly the page-size number of runs (no "load more" shown)
- Test has page-size + 1 runs (load-more appends exactly 1)
- Test with only an in-progress Run, 0 terminal Runs
- Two runs sharing the identical "ran at" timestamp (sort tie-break)

### Clarified Business Rules (suggested additions)

- State the page size explicitly (e.g. "beyond the first 50") instead of only an illustrative number in AC4
- Add an explicit rule: in-progress Runs are excluded from "past runs" history; only terminal Runs (passed/failed/aborted) appear

### Open Questions for PO / Dev

1. ***PO*** — Are in-progress ("running") Runs included in "past runs" history, or is history strictly terminal?
2. ***PO*** — Is 50 (from the AC4 example) the actual page-size contract, or just illustrative?
3. ***PO*** — Does the outcome filter stay applied when loading older runs (pagination + filter composition)?
4. ***Dev*** — No GET endpoint exists yet to list/filter/paginate a Test's Runs (`runs/route.ts` is POST-only; `runs/[id]/route.ts` is single-Run GET-only). Needs scoping before implementation.
5. ***Dev*** — What is the tie-break sort key for identical "ran at" timestamps?
6. ***Dev*** — Is "No runs yet for this Test" the only empty-state string, or does a 0-match filter need distinct copy?

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Story (1)

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_

### Tech Debt (1)

- [BK-249](https://jira.upexgalaxy.com/browse/BK-249): TECH-Security | Bind p_actor_user_id to auth.uid() across the bunkai_* explicit-actor RPCs _(To Do)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Carlos Alcala
- **Labels:** shift-left-2026-07-21, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
