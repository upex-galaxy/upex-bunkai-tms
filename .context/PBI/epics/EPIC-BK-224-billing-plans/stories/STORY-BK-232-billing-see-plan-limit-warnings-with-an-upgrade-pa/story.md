# Billing | See plan-limit warnings with an upgrade path

**Jira Key:** [BK-232](https://jira.upexgalaxy.com/browse/BK-232)
**Epic:** [BK-224](https://jira.upexgalaxy.com/browse/BK-224) (Billing & Plans)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas (Senior QA Engineer), I want a clear warning when my workspace approaches or hits a plan limit during my normal work, with an obvious path to resolution, so that a billing cap never turns into a confusing dead end in the middle of my flow.

## Context

Elena is not the payer — she is a member (or admin) doing TMS work: creating projects, running tests. When the workspace nears a plan limit she should see a non-blocking heads-up; when it hits the limit she should see a friendly block that explains what happened and routes her by role: owners go straight to the upgrade flow, non-owners are told who the workspace owner is so they can ask. Warnings surface across the whole app wherever a plan-limited resource is created, not only in Settings. Activates when plan limits are visible in the Billing section (plan/usage view live).

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

## Traceability

### Story (1)

- [BK-229](https://jira.upexgalaxy.com/browse/BK-229): Billing | View my workspace plan, seats, and usage _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
