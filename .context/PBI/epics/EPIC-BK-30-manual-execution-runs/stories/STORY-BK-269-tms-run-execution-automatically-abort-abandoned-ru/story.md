# TMS-Run Execution | Automatically abort abandoned runs after inactivity

**Jira Key:** [BK-269](https://jira.upexgalaxy.com/browse/BK-269)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 3

---

## Overview

## Overview

## User story

****As a**** QA Lead
****I want to**** have abandoned test runs close themselves automatically once they have sat idle past a threshold
****So that**** the active-run dashboard and the coverage and progress reports built on top of it reflect what is actually happening, not runs someone forgot to finish

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-17

> Refined Acceptance Criteria live in the acceptance_criteria field.

### Edge Cases Identified

| # | Edge case | Criticality | Action |
|---|-----------|-------------|--------|
| 1 | Sweep-step mark race condition | High | NEEDS PO/DEV CONFIRMATION |
| 2 | 0-step run (created but never started) | High | NEEDS PO/DEV CONFIRMATION |
| 3 | Sweep fails mid-batch (server crash) | Medium | Confirm idempotency |
| 4 | Threshold misconfigured to 0 | Low | NEEDS PO/DEV CONFIRMATION |
| 5 | Sweep updates updated*at causing self-reference | High | Confirm sweep uses finish*time |
| 6 | Run blocked status (step blocked) | Medium | Confirm qualifies as inactive |

### Clarified Business Rules

- Sweep reuses existing abort logic from BK-36
- System-generated reason must be visually distinguishable from person-typed reason
- Sweep runs across every workspace in a single pass
- Sweep is safe to run repeatedly (idempotent)

### Critical Questions for PO

1. ***What is the default inactivity threshold value?***
   - Context: Scope says configurable but Out-of-Scope defers choosing the value
   - Impact if unanswered: Cannot design time-based test scenarios
   - Suggested answer: 4 hours (from business-rules.md)

2. ***What is the exact system-generated reason text?***
   - Context: AC7 says reason must be distinguishable
   - Impact if unanswered: Cannot assert exact reason string
   - Suggested answer: 'Automatically closed by sweep after {threshold}h of inactivity'

3. ***How is the sweep triggered — cron, serverless, or API call?***
   - Context: Scope says scheduled sweep but doesn't specify mechanism
   - Impact if unanswered: Cannot trigger sweep manually for testing
   - Suggested answer: Cron job every 15 minutes

### Technical Questions for Dev

1. ***Which timestamp column is used for inactivity check — runs.updated*at or a dedicated last*step*activity*at?***
2. ***Does the sweep reuse the exact same abort logic as BK-36?***
3. ***What is the cascade behavior on sweep abort — same as manual abort?***

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field and the canonical comment below.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Metadata

- **Created:** 8/5/2026
- **Updated:** 8/19/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-08-17, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
