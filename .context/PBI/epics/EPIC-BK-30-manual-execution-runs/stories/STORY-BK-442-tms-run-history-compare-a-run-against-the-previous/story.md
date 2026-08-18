# TMS-Run History | Compare a run against the previous run of the same test

**Jira Key:** [BK-442](https://jira.upexgalaxy.com/browse/BK-442)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

********As a**** Senior QA Engineer
********I want to******** compare a Run against the immediately preceding Run of the same Test
****So that******** I can tell at a glance which failures are new, which were already failing, and which are now fixed, instead of re-reading two Runs side by side

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

## Why this story exists

After a regression pass, Bunkai can say "eleven steps failed". It cannot say which of those eleven were already failing last time and which broke today, nor which previously-failing steps have since been fixed. That delta is the first question anyone asks once a Run finishes, and today it is answered by opening two Runs in two tabs and reading them against each other by eye.

## Current state (verified at `origin/staging`)

- No Run-comparison surface exists anywhere in the product. Nothing renders a delta between two Runs.
- BK-37 (**TMS-Run History | View a test's past runs, filterable by outcome**) is the closest sibling and the natural host: it already lists a Test's terminal Runs newest-first and filtered by outcome. It enumerates Runs individually and computes no relationship between any two of them. This story adds the comparison that history list currently stops short of.
- BK-45 and BK-48 (Traceability chain) render only the latest Run result per row, by design. They are not a comparison surface and are not changed by this story.
- The project coverage endpoint's own contract states explicitly that no trend or prior-period delta is returned. Nothing upstream supplies a delta this story could reuse.

## Starting position in the data model

`run*steps` (`supabase/migrations/0031*runs.sql`, the `run*steps` table) already snapshots each executable step at Run start and carries: `run*atc*id`, `atc*step*id` (provenance only, nullable, `on delete set null`), `position` (0-based, copied verbatim from `atc*steps.position`), `content`, `input*data`, `expected`, `status` (`pending | passed | failed | blocked | skipped`), `note`, `evidence*url`, and `executed*at timestamptz` — which `0042*run*step*mark.sql` sets to `now()` on every step mark. Each `run*atcs` row carries `position`, `atc*title` and its own rolled-up `status`; `run*atcs` is unique on `(run*id, position)` and `run*steps` is unique on `(run*atc_id, position)`.

So the per-step execution timestamp already exists and is populated — no schema addition is needed on that count.

## Open technical question for the implementing run

***How a step in Run A is paired with "the same" step in Run B.*** Two candidate handles exist and neither is unconditionally safe:

- `(run*atcs.position, run*steps.position)` — always present, but silently mispairs every step below an insertion point when the Test's chain or an ATC's step list changed between the two Runs.
- `atc*step*id` — semantically correct, but nullable and set to `NULL` when the source `atc_step` is deleted, so it degrades to nothing on exactly the edits that matter most.

The implementing run must settle the pairing rule, and must decide what the comparison shows when the two Runs are structurally different (a step present in one Run and absent from the other is neither a new failure nor a fix — it needs its own state). This is a pairing-semantics question, not a missing-timestamp question.

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

- **Created:** 8/13/2026
- **Updated:** 8/13/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** discovery-2026-08-13, manual-execution-runs, run-comparison

---

_Synced from Jira by sync-jira-issues_
