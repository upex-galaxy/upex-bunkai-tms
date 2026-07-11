# App Shell | Open ATCs and Tests as tabs with a persistent explorer

**Jira Key:** [BK-147](https://jira.upexgalaxy.com/browse/BK-147)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Release
**Priority:** Highest
**Story Points:** 5

---

## Overview

## User story

As a QA Engineer (Elena), I want the project explorer to stay visible while I open ATCs and Tests as tabs inside the workbench, so that I can navigate the whole project like a code editor without losing my place.

## Context

Surfaced during the BK-32 review as a design-level gap: detail views currently open as separate full pages that hide the explorer and the project toolbar, so the reviewer loses navigational context. This story materializes the documented design direction — the master design plan §3 (App Shell, flagged as the highest-priority gap) and divergence D6 (single-page workbench with tabs). It is a presentation-layer change only: it reuses the existing routed detail views (the ATC editor and the BK-32 Test detail view) as the content of workbench tabs, with no backend change.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Story (1)

- [BK-32](https://jira.upexgalaxy.com/browse/BK-32): TMS-Test View | View a test with all chained ATCs expanded _(Ready For Release)_

---

## Metadata

- **Created:** 6/19/2026
- **Updated:** 6/26/2026
- **Reporter:** Ely
- **Assignee:** Nahuel Gomez
- **Labels:** app-shell, from-bk32-review, ux

---

_Synced from Jira by sync-jira-issues_
