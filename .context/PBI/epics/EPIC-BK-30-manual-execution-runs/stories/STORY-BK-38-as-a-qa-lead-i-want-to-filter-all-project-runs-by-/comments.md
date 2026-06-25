# Comments for BK-38

[View in Jira](https://jira.upexgalaxy.com/browse/BK-38)

---

### jesusgpythondev - 6/15/2026, 4:29:13 PM

## QA Shift-Left Handoff Mirror

This comment complements the canonical Story description. It does not duplicate the full AC/ATP content; use the description as source of truth.

### Executive Summary

BK-38 is now refined for estimation. The expert panel closed the missing contract decisions for project-scoped Run reporting, filtered pass/fail totals, date semantics, module filtering, executor types, empty states, and data isolation.

### Refinement Delta

| Area | Final decision |
| --- | --- |
| Reporting scope | Project-scoped Runs only; no cross-project rows or totals. |
| Endpoint | `GET /api/v1/projects/{projectId}/runs/report`. |
| Totals | Count only final `passed` and `failed` Runs. Other statuses can appear in rows but not totals. |
| Date filter | Inclusive `started_at` range; UTC storage, Project timezone interpretation. |
| Module filter | Use Run `module_id` snapshot captured at Run creation. |
| Executor type | `human`, `agent`, `ci`. |
| Story points | Expert panel recommends 3 points. |

### ATP Draft Summary

- 8 ATP rows defined in the Story description.
- High-priority QA coverage: full report baseline, combined filters, stale-total prevention, and cross-project isolation.
- Medium-priority QA coverage: date boundaries, clear filters, no-runs empty state.
- Low-priority QA coverage: large Run set / pagination / performance.

### High / Medium Risks

| Risk | Why QA cares | Coverage |
| --- | --- | --- |
| Stale totals after filters | Misleads QA Lead on execution health. | BK-38-ATC-02, BK-38-ATC-03 |
| Cross-project leakage | Security and trust issue in reporting. | BK-38-ATC-07 |
| Date boundary mismatch | Reports may omit or double-count Runs. | BK-38-ATC-04 |
| Module snapshot mismatch | Mutable Test/ATC chains could make reports unstable. | BK-38-ATC-02, BK-38-ATC-07 |

### Dependency Note

BK-38 depends on BK-34 for Run creation and on the future Runs schema/API. Current repo evidence shows Tests exist, but Run reporting tables/API still need implementation.

### Out of Scope for QA on BK-38

- Starting Runs.
- Updating Run step results.
- Aborting/cancelling Runs.
- Defect creation or sync.
- Exports, charts, dashboards, saved views.

### Publication Status

| Item | Status |
| --- | --- |
| Description | Updated with canonical shift-left package. |
| Labels | `shift-left-reviewed`, `shift-left-2026-06-15` applied. |
| Status | Moved to `Shift-Left QA`. |
| Story Points field | Not updated by tool; Jira REST edit returned 404 in this session. Set manually to 3 or retry after REST access is fixed. |
| Dedicated AC/ATP fields | Not updated by tool; content is included in canonical description until REST custom-field edit is available. |

### Ownership Handback

- PO/Delivery: use 3 points unless new scope is added.
- Dev: implement the Run reporting contract in description.
- QA: test filtered totals, empty states, date boundaries, and data isolation first.

---


_Synced from Jira by sync-jira-issues_
