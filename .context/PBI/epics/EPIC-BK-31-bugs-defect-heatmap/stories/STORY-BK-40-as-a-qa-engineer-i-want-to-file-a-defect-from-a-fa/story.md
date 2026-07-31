# TMS-Defect Filing | File a defect from a failing run step

**Jira Key:** [BK-40](https://jira.upexgalaxy.com/browse/BK-40)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** In Progress
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

# BK-40: TMS-Defect Filing | File a defect from a failing run step

## Metadata Snapshot

- ***Jira key***: BK-40
- ***Status***: 
- ***Source spec***: BK-025
- ***Parent epic/module***: BK Test Repository / TMS Defect Filing
- ***Last updated***: 2026-06-17 shift-left formatting correction

## User Story

As a QA Engineer, I want to file a defect directly from a failing step during a run, with the module, severity, steps-to-reproduce and evidence already filled in from the run context, so that the defect is captured in the moment without me retyping anything I just saw.

## Source & Evidence

- ***Source spec***: BK-025
- ***Evidence used***: BK-40 Jira fields, BK-40 previous shift-left package, BK-39 formatting reference, BK-91 ADF formatter capability reference, expert-panel-review findings.
- ***Evidence labels used***: Jira, Repo, Engram, Inference.

## Original Definition of Done

- ***Report defect action***: appears when a step is marked failed during a run.
- ***Pre-filled defect form***: includes module, executed steps, failing ATC, and captured evidence.
- ***Severity***: can be set to `P1`, `P2`, `P3`, or `P4` before saving.
- ***Standalone filing***: defects can also be filed outside a run from the defects area.
- ***Title validation***: title length is validated from 5 to 200 characters with a clear message when out of range.
- ***Module validation***: module is required and only modules belonging to the current project can be chosen.
- ***Evidence limit***: up to 10 evidence links can be attached; attempting more is blocked with a clear message.
- ***Initial visibility***: filed defect starts in `open` state and is immediately visible in the defects list.

## QA Refinements (Shift-Left Analysis)

Added 2026-06-17 by Shift-Left QA. Full refined ACs live in `✅ Acceptance Criteria (Gherkin)` when the field accepts updates; ATP DRAFT lives in `🧪 Acceptance Test Plan (ATP)` when the field accepts updates. Fallback comments are used only if custom-field publishing is blocked.

### Expert-panel decisions

| Decision | Outcome |
| --- | --- |
| Primary entry path | `Report defect` appears only for failed run steps. |
| Secondary entry path | Standalone defect filing from defects area remains in scope. |
| Defect contract | One TMS-native defect creation contract supports optional run context. |
| Run-linked context | Run, step, ATC, module, executed steps, and evidence references are preserved from the failed-step context. |
| Editable context | User can edit title, severity, reproduction text, and evidence list; run/step/ATC linkage stays non-editable. |
| Permission | Active current-project member with write access can file defects; read-only users cannot. |
| Evidence | Evidence links/references only; file upload is out of scope. |
| Jira sync | Out of scope for BK-40; delegated to downstream sync work. |

### Scope summary

In scope: run-linked defect filing from failed step, standalone defect filing, severity P1/P2/P3/P4, title length validation, current-project module validation, max 10 evidence links, initial `open` state, immediate visibility in defects list.

Out of scope: marking a step failed, defect lifecycle beyond initial `open`, Jira sync/export, file upload evidence, formal test-case creation, automated test implementation.

### Readiness

Ready for estimation after expert-panel refinement. QA recommends 5 SP with confidence 0.82. Re-estimate if Jira sync, file upload, blocked/skipped-step filing, expanded permissions, or BK-35 failed-step contract changes enter scope.

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

### Storys (4)

- [BK-35](https://jira.upexgalaxy.com/browse/BK-35): TMS-Run Execution | Mark each step pass, fail, or block _(Ready For QA)_
- [BK-42](https://jira.upexgalaxy.com/browse/BK-42): TMS-Defect Heatmap | View count and week-over-week trend per module _(Ready For Dev)_
- [BK-41](https://jira.upexgalaxy.com/browse/BK-41): TMS-Defect List | List and filter defects by module, status, severity _(Ready For Dev)_
- [BK-43](https://jira.upexgalaxy.com/browse/BK-43): TMS-Defect Sync | Sync defects one-way to the external tracker _(Ready For Dev)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-06-17, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
