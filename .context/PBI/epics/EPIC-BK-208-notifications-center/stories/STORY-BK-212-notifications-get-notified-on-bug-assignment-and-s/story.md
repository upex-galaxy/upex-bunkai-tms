# Notifications | Get notified on bug assignment and status changes

**Jira Key:** [BK-212](https://jira.upexgalaxy.com/browse/BK-212)
**Epic:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208) (Notifications Center)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Sara Iglesias, Full-Stack Developer, I want to be notified when a bug is assigned to me and when the status changes on bugs I reported or am assigned to, so that I pick up new work and follow my bugs without leaving my development flow to check boards.

## Context

Bugs in Bunkai arrive with their test and run context attached — but Sara still has to notice them. This story subscribes her to the two bug moments she cares about: a bug landing on her, and movement on bugs she is involved in (as reporter or assignee). Notifications deliver into the inbox from the sibling inbox story. This story explicitly activates once epic BK-31 Bugs & Defect Heatmap ships the bug entity and its lifecycle; until then there is no event source to subscribe to.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-07-19

Refined Acceptance Criteria live in the Acceptance Criteria field. Full ATP DRAFT lives in the Acceptance Test Plan field.

### Edge Cases Identified

| Edge case | Decision |
| --- | --- |
| Reporter and assignee are the same recipient | Create exactly one notification. |
| Actor is reporter or assignee | Suppress self-notification. |
| Reassignment from one assignee to another | Notify only the new assignee; no removal notification in this Story. |
| Recipient loses project/workspace access | Hide notification or block deep link without leaking bug metadata. |
| Duplicate event delivery/retry | Dedupe by source event id + recipient id. |
| Bug has no run context attached | Link opens bug detail and shows available context only. |

### Clarified Business Rules

- BK-212 is dependency-gated by BK-31 bug lifecycle and BK-209 inbox substrate.
- Recipient set is unique per event; reporter and assignee duplication collapses to one notification.
- Visibility is enforced at inbox read/deep-link time, not only at notification creation.
- Bug status copy uses BK-31 vocabulary; BK-212 does not define its own statuses.

### Critical Questions Answered

- PO: BK-212 can be estimated now, but implementation starts only after BK-31 exposes bug assignment/status-change events.
- Dev: consume `bug.assigned` and `bug.status_changed` with actor, reporter, assignee, status, workspace/project, bug, and run/test context payload.
- Design: row uses bug icon, bug title, assignment/status copy, status transition when available, and BK-31 severity chip style.

### Estimate

- Story Points: 8.
- Rationale: event-recipient logic + dedupe + RBAC visibility + deep-link integration; assumes BK-31 and BK-209 deliver their foundations.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Story (1)

- [BK-209](https://jira.upexgalaxy.com/browse/BK-209): Notifications | View an inbox of workspace events _(Ready For Dev)_

### Epic (1)

- [BK-31](https://jira.upexgalaxy.com/browse/BK-31): Bugs & Defect Heatmap _(Planning)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** new-feature, post-mvp, shift-left-2026-07-19, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
