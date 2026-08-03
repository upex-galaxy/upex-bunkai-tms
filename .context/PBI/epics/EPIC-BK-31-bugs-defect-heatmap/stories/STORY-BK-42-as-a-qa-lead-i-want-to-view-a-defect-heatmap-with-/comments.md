# Comments for BK-42

[View in Jira](https://jira.upexgalaxy.com/browse/BK-42)

---

### jesusgpythondev - 6/27/2026, 11:09:15 PM

> ***SUCCESS:*** BK-42 shift-left refinement published. QA/PO/Dev now have a testable contract before implementation.

| Area | Summary |
| --- | --- |
| Readiness | Ready for estimation from QA perspective; Dev start conditional on BK-40 and heatmap stats/MV contract. |
| Refined AC | 11 canonical Gherkin scenarios in the Acceptance Criteria field. |
| ATP Draft | 20 outline rows in the ATP field. |
| Contract decisions | Fixed windows 7d/30d/90d, default 30d, subtree rollup, active modules only, 5s freshness, 401/403 security behavior. |
| High risks | WoW ambiguity, aggregate leak, vague freshness, color-only hotspot cues. |
| QA SP | 3 SP, confidence 0.70. Advisory only; Jira Story Points unchanged. |
| Current Jira status | {status:blue | BACKLOG} - no transition performed. |

> ***WARNING:*** Dev readiness depends on BK-40 shipping the bugs schema / POST bug flow and on a heatmap stats or materialized-view contract. Split API/stats from UI only if that substrate is not ready at Dev start.

---

### jesusgpythondev - 6/27/2026, 11:41:30 PM

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

### Ely - 7/30/2026, 1:28:21 PM

Mockup — Bug Reports index — Heatmap view (BK-42 placement). Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-reports-index.html · spec: master-design-plan §4.6



---


_Synced from Jira by sync-jira-issues_
