# BK-18 — Scope

> Jira field: `customfield_10142` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-18)

- POST /atcs endpoint with full body validation (title, module*id, user*story_id, AC ids, layer, steps[], assertions[], tags[])

- PATCH /atcs/{id} endpoint with partial update + cascade replace of steps/assertions

- Transactional insert/update of atcs + atc*steps + atc*assertions tables

- Slug computation "{module-slug}/{atc-id-padded}"

- Cross-entity validation (AC belongs to US, module in project subtree, layer enum, step positions)

- Event emission: atc.created on POST, atc.updated on PATCH (with affected*test*ids count)

- OpenAPI spec entries for both endpoints with request/response schemas

- Unit + integration tests (cross-entity rules, transaction rollback on failure)

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.123Z_
