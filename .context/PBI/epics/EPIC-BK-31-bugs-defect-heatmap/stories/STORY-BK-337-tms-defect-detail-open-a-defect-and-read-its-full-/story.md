# TMS-Defect Detail | Open a defect and read its full record

**Jira Key:** [BK-337](https://jira.upexgalaxy.com/browse/BK-337)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to open a defect and read its full record, so that I can act on it or hand it off without piecing its context together from memory or the Test Runner history.

## Context

Filing a defect, listing defects, viewing the defect heatmap, assigning a defect, and syncing a defect to an external tracker all exist or are already queued for development, but none of them opens a single defect into a full read. Eight defect fields stored today — description, steps to reproduce, evidence, who filed it, when it was filed or last updated, and the originating ATC and run step — are reachable nowhere in the current UI. A QA engineer who wants to reread a filed defect's own record, or a developer who was just assigned one, has no route to it; the defects list itself renders the Run reference as plain text with no link.

Mockup: `bug-detail.html` in `.context/designs/bunkai-test-management-tool/bk-31-bug-reports/`, spec section §4.6 of `.context/design/master-design-plan.md`.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Story (1)

- [BK-43](https://jira.upexgalaxy.com/browse/BK-43): TMS-Defect Sync | Sync defects one-way to the external tracker _(Ready For Dev)_

---

## Metadata

- **Created:** 8/10/2026
- **Updated:** 8/10/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
