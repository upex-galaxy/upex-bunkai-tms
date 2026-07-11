# TMS-Defect Heatmap | View count and week-over-week trend per module

**Jira Key:** [BK-42](https://jira.upexgalaxy.com/browse/BK-42)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec******:*** BK-027 / FEAT-033 / FR 7.3

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

## QA Refinements (Shift-Left Analysis)

> ***INFO:*** Shift-left refinement completed for BK-42 on 2026-06-27. Canonical ACs now cover 11 scenarios; ATP Draft covers 20 outline rows.

| Area | Refinement |
| --- | --- |
| Review status | Ready for estimation from QA perspective; Dev start conditional on BK-40 bugs schema and heatmap stats/MV contract. |
| Key contract decisions | Fixed windows 7d/30d/90d; default 30d; subtree rollup; active modules only; 5s freshness; 401/403 auth behavior. |
| High risks covered | WoW ambiguity, aggregate data leak, vague freshness, color-only hotspot cues. |
| QA advisory estimate | 3 SP, confidence 0.70; Jira Story Points remain canonical unless explicitly updated. |
| Split trigger | Split API/stats foundation from UI only if MV/stats substrate is missing at Dev start or scope expands to custom ranges/realtime. |

## Shift-Left Traceability & Bug Status Addendum

> ***NOTE:*** This addendum makes the BK-42 shift-left lineage explicit in Jira. No product bug was found during shift-left because BK-42 is pre-development/spec-only; the findings are dependency/specification gates to resolve before implementation.

| Trace item | Reference | Why it matters | Covered by |
| --- | --- | --- | --- |
| Epic | BK-31 - Bugs & Defect Heatmap | BK-42 contributes the heatmap/dashboard value of the defect epic. | Metadata, Scope, Readiness Gates |
| Source spec | BK-027 / FEAT-033 / FR 7.3 | Defines the defect heatmap by module with count and week-over-week trend. | AC-1 to AC-11, ATP-1 to ATP-20 |
| Upstream dependency | BK-40 - Defect Filing | Heatmap cannot be implemented/tested until defects can be filed and persisted with module_id/severity/status. | AC-10, ATP-16, Dev readiness gate |
| Sibling contract anchor | BK-41 - Defect List/Filter | BK-42 inherits active-module default, subtree/aggregate thinking, and 401/403 aggregate-leak handling. | AC-1, AC-2, AC-11, ATP-3, ATP-18, ATP-19 |
| Technical gate | OpenAPI heatmap schema expansion | Current source schema is too thin; implementation needs window metadata, freshness/as*of, current/previous week counts, trend*direction, nullable trend_pct. | Key Contract Decisions, ATP-6 to ATP-10 |
| Data gate | module*defect*stats / stats substrate | Required for 5-second freshness, trend math, and performance. | AC-10, ATP-16, ATP-17 |
| Security gate | Project membership before aggregate reads | Heatmap counts can leak module/project defect density; unauthorized users must get 403, not fake empty stats. | AC-11, ATP-18, ATP-19 |

| Question | Answer |
| --- | --- |
| Was a product bug found? | No. BK-42 is not implemented yet; no browser/API/DB execution was performed and no implemented behavior failed. |
| Was a report gap found? | Yes. The first Jira-visible mirror was too compact and did not expose the full traceability chain. This addendum fixes that visibility gap. |
| Is the local shift-left package complete? | Yes. Full package includes 11 AC scenarios, 20 ATP rows, risk matrix, dependency map, readiness gates, and QA advisory estimate. |
| Should Jira Story Points change now? | No automatic update. QA advisory remains 3 SP; Jira Story Points stay canonical unless PO/Dev explicitly update them. |
| Should status transition now? | No transition performed. PO/Dev own movement out of Backlog/Estimation. |

Full local package: .context/PBI/epics/EPIC-BK-31-bugs-defect-heatmap/stories/STORY-BK-42-tms-defect-heatmap-view-count-and-week-over-week-t/shift-left-refinement.md

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Story (1)

- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(Ready For Dev)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-06-27, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
