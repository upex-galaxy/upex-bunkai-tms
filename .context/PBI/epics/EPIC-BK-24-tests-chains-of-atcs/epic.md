# EPIC: Tests (chains of ATCs)

**Jira Key:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 4

---

## Description

## Epic overview

Tests are user-authored chains of ATCs (Atomic Test Components) that the QA Engineer assembles to validate a User Story end-to-end. Where an ATC is the reusable atomic building block (one validation), a Test is the orchestrated sequence — for example, "Test: Add-to-Cart from Empty State" chains the ATCs "open product page", "click add-to-cart", "verify cart counter increments". One ATC edit propagates instantly to every Test that uses it, which is the Bunkai differentiator preserved by this epic.

This epic establishes the Test entity, the transactional API to author and reorder Tests, the expanded read endpoint that returns the full ATC chain in one round-trip (consumed by the Run runner UI and AI executor agents alike), and the Realtime broadcast on chain reorder. After this epic closes, the design-partner can author a 7-ATC Test, see it expand correctly with all step + assertion detail, and reorder its chain via drag-and-drop — the prerequisite for Manual Runs (BK-006).

## Business value

Without Tests, ATCs are isolated reusable assets with no execution context. Tests are the assembly layer that turns the ATC library into runnable validation flows — they are the "what does the user actually run today?" answer. They are also the contract surface for the executor polymorphism (manual / agent / CI), since every Run is a Test instance.

## Master Sprint

Master Sprint 4 of `.context/master-implementation-plan.md` §5 — the first sprint where the design-partner does the actual job (author → execute → report). BK-005 Tests is the author half; BK-006 Manual Runs is the execute half. Together they unlock the activation metric (workspace with ≥1 Run).

## Source FRs

- ***BK-015*** — `POST /tests` transactional creation (header + step skeleton)
- ***BK-016*** — `PATCH /tests/{id}` chain reorder with rebalanced position integers
- ***BK-017*** — `GET /tests/{id}?expand=atcs.steps,atcs.assertions` single-roundtrip expanded read
- ***BK-018*** — Chain reorder step integer rebalance algorithm

See `.context/SRS/functional-specs.md`.

## Dependencies

- ***Requires*** — EPIC BK-13 ATC Library closed (Tests reference existing ATC IDs in the `atc_chain[]`).
- ***Blocks*** — EPIC BK-006 Manual Runs (a Run is a Test instance; Test must exist before a Run can start).

## Exit criteria

- A QA Engineer can author a Test of 7 ATCs in under 2s p95 round-trip.
- The expanded read (`GET /tests/{id}?expand=...`) returns the full chain (steps + assertions) in <500ms p95 for a 7-ATC Test.
- Chain reorder of 10 steps publishes a Realtime broadcast within 100ms of commit.
- Cross-tenant access test: a user from workspace B querying a Test in workspace A receives 0 rows.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27) | As a QA Engineer I want to assemble a Test by chaining ATCs from my workspace so that I can run the validations together when verifying a User Story | 1 | Medium | Shift-Left QA |
| [BK-28](https://upexgalaxy67.atlassian.net/browse/BK-28) | As a QA Engineer I want to reorder the ATCs inside an existing Test so that I can fix the sequence after seeing it does not match the User Story flow | 1 | Medium | Shift-Left QA |
| [BK-32](https://upexgalaxy67.atlassian.net/browse/BK-32) | As a QA Engineer, I want to open a Test and see every chained ATC expanded in order with its steps and assertions so that I can review exactly what will be validated before running it. | 1 | Medium | Shift-Left QA |
| [BK-33](https://upexgalaxy67.atlassian.net/browse/BK-33) | As a QA Engineer, I want to assign tags to a Test, including the reserved smoke, sanity, and regression tags, so that my Tests are grouped and filtered into the right suites. | 1 | Medium | Shift-Left QA |

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/27/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** master-sprint-4, mvp

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:50.902Z_
