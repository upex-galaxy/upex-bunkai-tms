# BK-21 — Spec Compliance Matrix

> Dev-authored (non-Jira). Maps each AC scenario to the evidence that proves it.
> Code-level review only — interactive/E2E verification delegated to the shift-left QA owner (Ramiro Majdalani).

| AC scenario (Gherkin) | covered_by | evidence | status |
|---|---|---|---|
| Editing an ATC updates every Test that chains it (no Test edited directly) | review-approved:internal | Reference architecture: Tests read ATC content via `test_steps.atc_id` join, never copy it (0024). Edit touches only `atcs`/`atc_steps`/`atc_assertions` (migration `0035` / `0021`). No `test_steps` write on edit. | review-approved |
| Saving an edit creates a new version of the ATC | review-approved:internal | `version = version + 1` in `bunkai_update_atc` (0035). Unchanged from 0021. | review-approved |
| Save confirmation reports how many Tests were affected | review-approved:internal | API: `affected_test_count` in PATCH response (route.ts) via `bunkai_atc_usage` (0029). UI: `saveAtcAction` returns `affectedTestCount`; `AtcEditor` toast "N Tests updated". | manual |
| Editing an ATC used by no Tests still saves, reports 0 affected | test:lib/atcs/errors.test.ts + review-approved:internal | `array_agg(distinct)` over zero rows → empty array → event `affected_test_ids: []`; route `affected_test_count` 0; toast "no Tests affected". | manual |
| Re-anchoring an ATC to an invalid Module is rejected | exempt:out-of-scope-by-decision | Module/US/slug are immutable on edit (decision Q4, ADR-0009) — re-anchoring Module is not a supported operation, so the "invalid module" path cannot occur. AC anchors validated via existing 45020/45021 raises (`bunkai_update_atc`). | exempt |
| (architect) Version skew → 409 ; insufficient role → 403 | test:lib/atcs/errors.test.ts | Unit tests assert 45022→409 (+ current_version), 42501→403, P0002→404, 45020→422, unknown→500. | covered |
| (architect) `atc.updated` emitted in-tx with affected Test ids | review-approved:internal | `activity_log` INSERT inside `bunkai_update_atc` tx with `to_jsonb(v_affected_ids)` (0035). | review-approved |
| (architect) OpenAPI documents If-Match, 200 shape, 403/404/409/422 | review-approved:internal | `route.openapi.ts` + `.context/SRS/api-contracts.yaml` (`ATCUpdateResult`); `public/openapi.json` regenerated. | review-approved |

## Notes
- `manual` rows = require the QA owner to confirm the rendered confirmation/count on staging (UI + live data) — out of code-review scope per the dev request.
- No `uncovered` rows. The one `exempt` row is justified by ratified contract decision Q4 (immutable anchors), recorded in ADR-0009.
- Adversarial review verdict: GO-WITH-FIXES. 1 BLOCKER adjudicated as FALSE POSITIVE (`to_jsonb` of empty SQL array yields `[]`, not `{}`); 1 MAJOR (usage null-guard) applied; minors dismissed-with-reason.
