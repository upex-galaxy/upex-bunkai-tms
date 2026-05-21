# Comments for BK-23

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-23)

---

### Ely - 5/19/2026, 9:57:38 PM

# 🧱 Architect Annotation

## Technical Notes
- DB tables touched: `atcs` (INSERT new row), `atc_steps` (bulk INSERT copying source rows), `atc_assertions` (bulk INSERT copying source rows). All within one transaction.
- API surface: `POST /atcs/{source_id}/duplicate` with optional `{ new_title }` body. Returns 201 `{ atc_id }`. Returns 403 on insufficient role, 422 on title validation failure, 404 on cross-workspace source lookup.
- Service flow: BEGIN → `SELECT * FROM atcs WHERE id = $source_id AND workspace_id = $session.workspace_id` (404 if not found) → compute `new_title = $new_title ?? (source.title || ' (copy)')` → validate `new_title` length 3..200 → INSERT new atcs row inheriting `module_id, user_story_id, acceptance_criterion_ids, layer, tags`, `version = 1`, `slug = compute_slug(new_atc_id, module_id)` → INSERT atc_steps from `SELECT position, content, input_data, expected FROM atc_steps WHERE atc_id = $source_id` → INSERT atc_assertions from `SELECT position, content FROM atc_assertions WHERE atc_id = $source_id` → COMMIT.
- Event emission: `atc.created` (NOT `atc.duplicated`) with the full new ATC payload. Downstream consumers (search index, etc.) need no special handling — duplicate looks like a normal create.
- Slug is freshly computed from the new atc_id. Slugs are never cloned.
- No FK link between source and duplicate after creation — they are fully independent rows. Edits to one do not propagate to the other.
- No re-validation of cross-entity rules (AC↔US, module↔project subtree) — the source already passed those rules at its creation time. If the source's relationships have become invalid since (rare, only via admin operations), this is acknowledged as out-of-scope cleanup.

## Dependencies
- Upstream: **BK-18 ({{PROJECT_KEY}}-010a)** — reuses the insert path, slug computation, and event emission. Strongly prefer landing BK-18 first and extracting an internal `createAtc(payload)` service function that this story calls.
- Downstream: ATC list/detail UI gets a "Duplicate" action that calls this endpoint and redirects to the new ATC's detail page.
- External: same event bus as BK-18.

## Definition of Done (expanded)
- [ ] OpenAPI entry for `POST /atcs/{source_id}/duplicate` with optional body and response shape
- [ ] `bun run api:sync` passes
- [ ] Unit tests: default title with `(copy)` suffix, custom new_title overrides, title-too-short rejection, viewer-role rejection, multi-position assertions copied correctly
- [ ] Integration test: edit the duplicate, verify source is unchanged (independence guarantee)
- [ ] Integration test: emitted event is `atc.created` with full payload (not a separate event type)
- [ ] Lint + typecheck pass
- [ ] Manual smoke: duplicate an ATC via curl, verify steps and assertions counts match source
- [ ] PR description references each AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.6)
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-014
- Business map: `.context/business/business-data-map.md` § atcs / atc_steps / atc_assertions
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/{source_id}/duplicate


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:09.145Z_
