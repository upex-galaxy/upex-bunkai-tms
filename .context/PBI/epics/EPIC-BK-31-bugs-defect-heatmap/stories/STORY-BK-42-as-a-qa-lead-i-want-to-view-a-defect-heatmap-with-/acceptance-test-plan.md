# BK-42 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-42)

## Acceptance Test Plan (ATP) Draft - BK-42

> ***WARNING:*** ATP DRAFT only. Formal Test Case creation belongs to /test-documentation.

| ID | Priority | Category | Scenario outline | Precondition | Expected result | Automation hint |
| --- | --- | --- | --- | --- | --- | --- |
| ATP-1 | P0 | Positive | Default heatmap returns active module cells | Authorized project with active modules | One cell per active module; default 30d shown | API + UI |
| ATP-2 | P0 | Positive | Selected-window counts update for 7d/30d/90d | Defects distributed across dates | Counts match selected fixed window | API |
| ATP-3 | P1 | Boundary | Archived modules hidden by default | Active and archived module branches exist | Archived branch absent from default heatmap | API |
| ATP-4 | P1 | Boundary | UTC start boundary included | Defect at exact start_at | Defect counted | API |
| ATP-5 | P1 | Boundary | UTC end boundary excluded | Defect at exact end_at | Defect not counted in current window | API |
| ATP-6 | P0 | Trend | Rising trend | Current week greater than previous week | Direction rising and positive percent | API + UI |
| ATP-7 | P0 | Trend | Falling trend | Current week lower than previous week | Direction falling and negative percent | API + UI |
| ATP-8 | P0 | Trend | Previous zero, current positive | Previous 0, current > 0 | Direction rising, trend percent null/not applicable | API + UI |
| ATP-9 | P1 | Trend | Both weeks zero | Previous 0, current 0 | Direction flat, percent 0 | API + UI |
| ATP-10 | P1 | Trend | Current zero, previous positive | Previous > 0, current 0 | Direction falling, percent -100 | API + UI |
| ATP-11 | P0 | Module hierarchy | Parent rollup includes descendants | Parent and child have defects | Parent count includes child defects | API |
| ATP-12 | P1 | Module hierarchy | Child cell still visible | Parent rollup data exists | Child module has its own cell | UI |
| ATP-13 | P0 | Visual / a11y | Hotspot is not color-only | One module has max count | Count, label/icon, legend communicate hotspot | UI |
| ATP-14 | P1 | Visual / a11y | Trend cue accessible | Trend indicators rendered | Accessible name/text exposes trend | UI |
| ATP-15 | P1 | UX | Duplicate names disambiguated by path | Two nested modules share name | Full paths distinguish cells | UI |
| ATP-16 | P0 | Integration | New defect updates heatmap count | BK-40 defect filing succeeds | Count increases within 5 seconds after stats read | API + integration |
| ATP-17 | P1 | Integration | Freshness metadata updates | Stats refresh occurs | as*of/refreshed*at reflects current stats read | API |
| ATP-18 | P0 | Security | Unauthenticated heatmap request | No valid token | 401, no heatmap data | API |
| ATP-19 | P0 | Security | Cross-project unauthorized request | Valid user without membership | 403, no module/count data | API |
| ATP-20 | P1 | Negative | Unsupported window rejected | Request uses 365d | 400 invalid window error | API |

| Positive | Negative | Boundary | Integration | API | Total |
| --- | --- | --- | --- | --- | --- |
| 5 | 3 | 5 | 2 | 15 | 20 |

Rationale: BK-42 combines API stats, trend math, module hierarchy, visual heatmap behavior, freshness, and aggregate security. Coverage is intentionally heavier than BK-41 because BK-42 adds user-visible visualization and time-window/trend semantics on top of aggregate reads.

---
_Synced from Jira by sync-jira-issues_
