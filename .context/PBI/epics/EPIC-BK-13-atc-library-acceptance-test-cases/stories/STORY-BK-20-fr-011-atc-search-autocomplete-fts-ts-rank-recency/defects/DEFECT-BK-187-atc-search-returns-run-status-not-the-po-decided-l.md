# DEFECT: ATC search returns run-status, not the PO-decided lifecycle status_dot

**Jira Key:** [BK-187](https://jira.upexgalaxy.com/browse/BK-187)
**Related Story:** [BK-20](https://jira.upexgalaxy.com/browse/BK-20) - TMS-ATC Search | Search and autocomplete ATCs
**Priority:** High
**Status:** Open
**Components:** ATC Library (Acceptance Test Cases)

---

## Description

## Summary

`GET /api/v1/atcs/search` returns each result item with a `status` field carrying the run-status enum (`pass` / `fail` / `blocked` / `skipped` / `running` / `unrun`, default `unrun`) and an identifier field named `id`, instead of the PO-decided `status*dot` lifecycle enum (`draft` / `ready` / `automated` / `deprecated`) and the `atc*id` identifier. The prefix-match and multi-word AND search logic work correctly; only the response shape and its semantics diverge from the PO decision.

## Steps to Reproduce

1. Authenticate with a PAT carrying the `atc:read` scope.
2. Call `GET /api/v1/atcs/search?query=login&project_id=4f9f81d0-dcec-466e-9860-173907fd21c7`.
3. Inspect any item in the returned `items[]` array.

## Impact

- The EPIC-BK-5 autocomplete picker consumes this endpoint to surface the ATC reuse / lifecycle signal.
- With run-status instead of lifecycle status, a never-run ATC always reads `unrun`, so the picker cannot present `draft` / `ready` / `automated` / `deprecated` — defeating the discovery and reuse purpose the search exists for.
- The identifier field `id` (vs the contracted `atc_id`) is a second divergence the consumer was not specified against.

## Related Stories

- Source story: ***BK-20*** (this Defect blocks BK-20).
- Downstream consumer: ***EPIC-BK-5*** (autocomplete picker).

## Evidence

- `evidence/stage2-api-results.json` -> `SMOKE.item0`: item keys = `[id, slug, layer, title, status, module_path]`, with `status = "unrun"`.

---

## Related Issues

- blocks: [BK-20](https://jira.upexgalaxy.com/browse/BK-20) - TMS-ATC Search | Search and autocomplete ATCs

---

## Metadata

- **Created:** 6/30/2026
- **Updated:** 7/29/2026
- **Reporter:** Facu Barea
- **Assignee:** Ely
- **Labels:** api, atc-search, defect, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
