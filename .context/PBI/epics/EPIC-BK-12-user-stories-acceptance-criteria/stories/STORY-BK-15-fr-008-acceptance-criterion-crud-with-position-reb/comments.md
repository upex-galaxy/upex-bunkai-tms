# Comments for BK-15

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-15)

---

### Ely - 5/19/2026, 9:54:34 PM

# 🧱 Architect Annotation

## Technical Notes
- **DB**: new table `acceptance_criteria` (id uuid pk, user_story_id uuid fk -> user_stories, title varchar(200), description text, position integer not null, created_at, updated_at, deleted_at). Indexes: `(user_story_id, position) WHERE deleted_at IS NULL` partial unique to enforce sibling-position uniqueness; secondary `(user_story_id, deleted_at)` for list queries.
- **API surface**: `POST /api/acceptance-criteria`, `GET /api/acceptance-criteria/:id`, `GET /api/user-stories/:us_id/acceptance-criteria`, `PATCH /api/acceptance-criteria/:id` (title/description/position), `DELETE /api/acceptance-criteria/:id`. Plus a guard inside `PATCH /api/user-stories/:id` that blocks `status='ready_to_test'` when `count(active ACs) = 0`.
- **Position rebalance**: single SQL statement `UPDATE acceptance_criteria SET position = position + 1 WHERE user_story_id = $1 AND position >= $2 AND deleted_at IS NULL` before insert, mirrored `position - 1` on delete/move. Wrap each mutation in a transaction with `SELECT ... FOR UPDATE` on the parent user_story row to serialize concurrent inserts.
- **Validation**: Zod `AcceptanceCriterionCreateSchema` (title min 3 max 200, description max 50KB), position coerced to positive int, defaulted to `max(siblings.position) + 1` when omitted.
- **Status guard**: dedicated repository method `canMarkReadyToTest(userStoryId)` returns boolean; called inside the user-story PATCH handler. Returns 409 with code `ac_required_for_ready_to_test`.
- **Concurrency**: two simultaneous inserts at the same position resolve via the unique constraint — second insert retries with the next free slot or returns 409 (`position_conflict_retry`).

## Dependencies
- Upstream: **BK-14** "User Story CRUD" (must exist to anchor ACs). **BK-7** "Module hierarchy" indirectly via user_story.module_id.
- Downstream: **BK-17** "Jira import" creates ACs via the same write path. **BK-16** "Markdown editor" renders the AC description body.
- External: none.

## Definition of Done (expanded)
- [ ] Migration applies cleanly; rollback drops table and partial index
- [ ] OpenAPI surfaces all 5 routes; `bun run api:sync` clean
- [ ] Unit tests: insert at head/middle/tail, delete with shift, ready_to_test guard with zero ACs, ready_to_test guard with >=1 AC, cross-workspace 403
- [ ] Concurrency test: two parallel inserts at same position produce 2 rows with adjacent positions (no duplicate)
- [ ] `bun run lint` + `bun run typecheck` pass
- [ ] Manual smoke: add 3 ACs, reorder via PATCH, verify list order in SPA
- [ ] PR description cross-references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003 / US 3.2
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-008
- Business map: `.context/business/business-data-map.md` § acceptance_criteria entity
- API contract: `.context/SRS/api-contracts.yaml` § `/api/acceptance-criteria`


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:05.358Z_
