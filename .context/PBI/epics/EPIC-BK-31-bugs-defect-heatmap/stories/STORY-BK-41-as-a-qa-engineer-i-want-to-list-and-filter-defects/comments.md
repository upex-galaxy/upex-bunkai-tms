# Comments for BK-41

[View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

---

### jesusgpythondev - 6/27/2026, 3:52:33 PM




> ***SUCCESS:*** BK-41 is refined and ready for estimation from QA perspective. Current Jira status is Estimation. PO/Dev still own estimation and Ready For Dev.

## QA Handoff Mirror - BK-41

***Executive summary******:*** BK-41 was refined from 7 DoD bullets into 8 Gherkin ACs, 6 contract decisions, and a 16-row ATP outline. Main value: QA can focus on defects in an active module subtree without wading through unrelated defects.

| Refinement Delta | Result |
| --- | --- |
| Contract decisions | 6: aggregates in response, recursive module subtree, live aggregation, bugs:read + RLS, empty-state 200, archived modules hidden by default |
| AC reconciliation | 7 original DoD bullets + 1 expert decision mapped to 8 Gherkin scenarios |
| High risks | 1 High risk: subtree correctness; covered by AC-2 + ATP-2 |
| ATP rows | 16 outline rows: positive, negative, boundary, integration, API |
| Open confirmations | None. Senior PO expert resolved archived-module default as hide-by-default, reversible with future include_archived=true. |

## Key Contract Decisions

| Decision | Evidence |
| --- | --- |
| GET /api/v1/bugs must return data plus aggregates.by*severity and aggregates.by*status | Source FR BK-026 + BK-41 DoD |
| Aggregates count the full filtered set, not only the current page | Expert panel decision |
| Module subtree uses recursive traversal via parent*module*id, not prefix-match on slug path | Repo tree model warning |
| Auth uses PAT scope bugs:read and RLS via project_membership | Repo API pattern |
| Empty state is 200 + [] + zeroed aggregates | UX + QA decision |
| Archived module defects hidden by default | Senior PO expert decision; now mirrored in AC scenario |

## ATP Draft Summary

| Positive | Negative | Boundary | Integration | API | Total |
| --- | --- | --- | --- | --- | --- |
| 6 | 5 | 4 | 2 | 16 | 16 |

## Risk Summary

| Risk | Severity | Coverage |
| --- | --- | --- |
| Subtree traversal correctness at depth 6 | :red_circle: High | AC-2 + ATP-2 |
| Aggregates drift with pagination | :large*orange*circle: Medium | AC-6 + ATP-7 |
| Cross-project IDOR / aggregate leak | :large*orange*circle: Medium | ATP-9 |
| BK-40 schema dependency | :large*orange*circle: Medium | Dev readiness gate |

> ***WARNING:*** Dev readiness is conditional: BK-41 should start after BK-40 ships the bugs schema and POST /bugs contract. BK-41 must not duplicate or own BK-40's migration.

## QA Story Points Recommendation

- Recommendation: 2 SP
- Confidence: 0.70
- Basis: effort=Med; complexity=Med; uncertainty=Low; risk=Low
- Rationale: read-only endpoint, but subtree CTE + aggregates + RLS/IDOR validation make Jira's current 1 SP optimistic.
- Re-estimation triggers: status transitions added to scope; BK-40 schema slips; subtree helper must be built from scratch; aggregates/pagination contract changes.
- Boundary: QA recommendation only; Jira Story Points / Epic / User Story fields remain canonical unless explicitly updated.

## Out of Scope

- Defect filing: BK-40
- Defect heatmap: FR 7.4 / separate Story
- Jira sync: FR 7.5 / separate Story
- Defect lifecycle transitions: future Story

## Publication Status

| Item | Status |
| --- | --- |
| Refined AC field | {status:green | PUBLISHED} |
| Archived-module AC patch | {status:green | PUBLISHED} |
| ATP Draft field | {status:green | PUBLISHED} |
| QA mirror comment | {status:green | UPDATED} |
| Labels | {status:green | APPLIED} |
| Story transition | {status:blue | CURRENTLY ESTIMATION} |

---

### Ely - 7/22/2026, 8:16:49 PM

@@jesusgpythondev Confirmó derivar esta US a @@micaelavirgagarcia para que se encargue del Testing.

---

### Ely - 7/30/2026, 1:28:17 PM

Mockup — Bug Reports index (List/Heatmap views). Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-reports-index.html · spec: master-design-plan §4.6



---


_Synced from Jira by sync-jira-issues_
