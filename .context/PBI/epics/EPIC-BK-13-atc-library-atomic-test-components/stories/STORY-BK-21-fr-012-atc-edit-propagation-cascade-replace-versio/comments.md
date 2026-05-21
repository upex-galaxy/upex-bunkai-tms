# Comments for BK-21

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-21)

---

### Ely - 5/19/2026, 9:57:30 PM

# 🧱 Architect Annotation

## Technical Notes
- DB tables touched: `atcs` (UPDATE + version increment), `atc_steps`/`atc_assertions` (cascade replace within transaction), READ from `test_steps` to compute `affected_test_ids`. Existing index on `test_steps(atc_id)` is required — verify or add.
- API surface: extends `PATCH /atcs/{id}` from BK-18. Adds `If-Match: <version>` header support for optimistic concurrency. Returns 200 `{ atc, version, affected_test_count }` plus `affected_test_ids` in the emitted event payload.
- Transaction shape: BEGIN → `SELECT ... FROM atcs WHERE id = $1 FOR UPDATE` → check `If-Match` version matches → validate cross-entity rules (reuse BK-18 logic) → if layer changed, run policy check against referencing Tests → UPDATE atcs SET ... , version = version + 1 → DELETE FROM atc_steps WHERE atc_id = $1 → DELETE FROM atc_assertions WHERE atc_id = $1 → INSERT new steps/assertions → SELECT array_agg(test_id) FROM test_steps WHERE atc_id = $1 → COMMIT.
- Propagation guarantee: Tests reference ATCs by `atc_id` in `test_steps`. Step content is NEVER copied into `test_steps` at composition time. This is the architectural invariant that makes propagation automatic.
- Event emission: `atc.updated` published after commit with `{ atc_id, version, affected_test_ids[] }`. Consumers (notifications, search index refresh, etc.) subscribe.
- Layer-policy check: query `SELECT t.id, t.layer_policy FROM tests t JOIN test_steps ts ON ts.test_id = t.id WHERE ts.atc_id = $1 AND $new_layer NOT MATCHING t.layer_policy`. If any rows return, abort with 422.
- Role check uses existing session helper; minimum role is `member`.

## Dependencies
- Upstream: **BK-18 ({{PROJECT_KEY}}-010a)** — this story extends the PATCH endpoint defined there. The base validation, transaction shape, and event bus integration come from BK-18.
- Upstream: EPIC-BK-5 must define the `test_steps(atc_id)` foreign key and any layer-policy column on `tests` before propagation can be tested end-to-end.
- Downstream: Notifications epic (out-of-scope) will subscribe to `atc.updated` to email affected Test authors. Search index refresh (BK-20) listens to the same event to update `search_tsv` if title/tags changed.
- External: event bus (same as BK-18).

## Definition of Done (expanded)
- [ ] PATCH endpoint accepts `If-Match` header and returns 409 on mismatch
- [ ] `affected_test_ids` computed inside the same transaction (read consistency)
- [ ] Event payload includes `affected_test_ids[]` — schema documented in `.context/business/events.md`
- [ ] Integration test: edit an ATC and verify a referencing Test sees the change on next GET WITHOUT any test_steps row being modified
- [ ] Integration test: layer change rejected when referencing Test has incompatible policy
- [ ] Unit tests for version skew (409) and insufficient role (403)
- [ ] OpenAPI updated for `If-Match` header and new error codes (`version_conflict`, `layer_breaks_test_policy`)
- [ ] `bun run api:sync` passes
- [ ] PR description references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.4)
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-012
- Business map: `.context/business/business-data-map.md` § atcs (version column) / test_steps (FK to atcs)
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/{id}.patch


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:08.571Z_
