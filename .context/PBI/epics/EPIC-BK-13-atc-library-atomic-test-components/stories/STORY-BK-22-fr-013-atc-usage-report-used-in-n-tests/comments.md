# Comments for BK-22

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-22)

---

### Ely - 5/19/2026, 9:57:34 PM

# 🧱 Architect Annotation

## Technical Notes
- DB tables touched: READ-ONLY against `test_steps` and `tests`. Existing index `test_steps(atc_id)` is required for performant queries (verify in BK-20/BK-21 — likely already added).
- API surface: `GET /atcs/{id}/usage` returns 200 `{ used_in: [...] }`. Returns 404 with error code `atc_not_found` when the ATC belongs to a different workspace (avoids existence leak).
- Query shape: `SELECT ts.test_id, t.slug, t.title, ts.position AS position_in_test FROM test_steps ts JOIN tests t ON t.id = ts.test_id WHERE ts.atc_id = $1 AND t.workspace_id = $session.workspace_id ORDER BY t.slug ASC, ts.position ASC`.
- Multi-position entries: when the same Test references the ATC at multiple positions, the JOIN naturally returns multiple rows. No deduplication.
- Workspace scoping enforced at service layer via WHERE clause. The ATC existence check (`SELECT 1 FROM atcs WHERE id = $1 AND workspace_id = $session.workspace_id`) runs first to decide 404 vs 200.
- No caching in MVP — the query is cheap (indexed FK lookup) and the response is small. Add cache only if profiling shows hot endpoint.

## Dependencies
- Upstream: BK-18 (atcs table exists). EPIC-BK-5 must define `test_steps` and `tests` tables with `atc_id`, `position`, and `slug` columns. Without `test_steps` this endpoint returns empty `used_in[]` always.
- Downstream: ATC detail page UI renders "Used in N tests" widget and deep links to each Test. Delete-ATC flow (future story) will call this endpoint to display a confirmation modal with the impact list.
- External: PostgreSQL only.

## Definition of Done (expanded)
- [ ] OpenAPI entry for `GET /atcs/{id}/usage` with response schema
- [ ] `bun run api:sync` passes
- [ ] Unit tests: empty result, single Test single position, single Test multi-position, multi-Test ordering by slug
- [ ] Integration test: workspace scoping returns 404 (not 403) for cross-workspace lookup
- [ ] Performance budget: < 50ms p95 on ATCs referenced in ≤ 100 Tests
- [ ] Lint + typecheck pass
- [ ] Manual smoke: curl returns expected shape on an ATC with known usage
- [ ] PR description references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.5)
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-013
- Business map: `.context/business/business-data-map.md` § test_steps (FK to atcs.id)
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/{id}/usage


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:08.873Z_
