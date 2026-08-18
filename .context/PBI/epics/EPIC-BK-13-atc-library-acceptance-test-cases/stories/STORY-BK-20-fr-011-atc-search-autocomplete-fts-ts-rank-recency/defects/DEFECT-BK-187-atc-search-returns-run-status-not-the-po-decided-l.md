# DEFECT: ATC search returns run-status, not the PO-decided lifecycle status_dot

**Jira Key:** [BK-187](https://jira.upexgalaxy.com/browse/BK-187)
**Related Story:** [BK-20](https://jira.upexgalaxy.com/browse/BK-20) - TMS-ATC Search | Search and autocomplete ATCs
**Priority:** High
**Status:** Closed
**Components:** ATC Library (Acceptance Test Cases)
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

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

- Source story: ***BK-20*** (this Defect blocks [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20)).
- Downstream consumer: ***EPIC-BK-5*** (autocomplete picker).

## Evidence

- `evidence/stage2-api-results.json` -> `SMOKE.item0`: item keys = `[id, slug, layer, title, status, module_path]`, with `status = "unrun"`.

---

## 🐞 Actual Result

Response item shape: `{id, slug, title, layer, status, module_path`}.

The `status` field = `unrun` (run-status enum: `pass` / `fail` / `blocked` / `skipped` / `running` / `unrun`). The identifier field is `id`. There is no `status*dot` field and no `atc*id` field.

---

## ✅ Expected Result

Per the PO decision, each search item exposes `status*dot` in `{draft`, `ready`, `automated`, `deprecated`} (the ATC lifecycle status) and an identifier field named `atc*id`, so the EPIC-BK-5 picker can present the reuse / lifecycle signal.

---

## 🧫 Evidence

Raw API dump: `evidence/stage2-api-results.json` -> `SMOKE.item0`.

- `item0*keys` = `[id, layer, module*path, slug, status, title]`
- `item0.status` = `unrun`
- `item0.id` = `c1357f01-a9cb-4112-8d6a-3f1696c45524`

Captured 2026-06-30 on staging via a PAT with the `atc:read` scope.

---

## Related Issues

- blocks: [BK-20](https://jira.upexgalaxy.com/browse/BK-20) - TMS-ATC Search | Search and autocomplete ATCs

---

## Metadata

- **Created:** 6/30/2026
- **Updated:** 8/7/2026
- **Reporter:** Facu Barea
- **Assignee:** Facu Barea
- **Labels:** api, atc-search, defect, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
