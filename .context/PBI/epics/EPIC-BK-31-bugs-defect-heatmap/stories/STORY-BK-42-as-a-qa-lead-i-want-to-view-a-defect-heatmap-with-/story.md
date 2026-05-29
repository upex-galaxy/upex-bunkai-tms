# As a QA Lead, I want to view a defect heatmap with count and week-over-week trend per module so that I can see at a glance where quality is degrading.

**Jira Key:** [BK-42](https://upexgalaxy67.atlassian.net/browse/BK-42)
**Epic:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-027

## User story

***As a*** QA Lead
***I want to*** view a defect heatmap showing defect count and week-over-week trend per module over a chosen window
***So that*** I can see at a glance where quality is degrading without reading through every defect

## Definition of done

- [ ] A heatmap shows one cell per module with its defect count over the chosen window
- [ ] Each cell shows a week-over-week trend indicator (rising, falling or flat)
- [ ] The window can be chosen (for example the last 30 days)
- [ ] Modules with more defects are visually emphasized so hotspots stand out
- [ ] A freshly filed defect appears in the heatmap promptly
- [ ] Modules with zero defects in the window are clearly distinguishable from hotspots
- [ ] The module path is shown so the Lead can tell nested modules apart

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

- [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40): As a QA Engineer, I want to file a defect from a failing run step with module, severity, steps and evidence pre-filled so that the defect is captured without retyping. _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:53.839Z_
