# BK-19 — Spec Compliance Matrix

> PR [#29](https://github.com/upex-galaxy/upex-bunkai-tms/pull/29) · branch `feature/BK-19-atc-builder-create-ui` → `staging`

| AC scenario (Gherkin) | covered_by | evidence | status |
|---|---|---|---|
| Create an ATC with steps + assertions through the builder | review-approved:cavecrew-reviewer | NewAtcEditor `handleSubmit` → POST `/api/v1/atcs` → 201 → redirect to `/projects/{slug}/atcs/{id}`; reviewer confirmed POST body matches BK-18 contract | review-approved |
| An ATC cannot be saved without provenance (US + ≥1 AC) | test:builder-guards.test.ts | `provenanceOk` unit test + Save gated + `PROVENANCE_MESSAGE`; server `ac_outside_user_story` mapped | covered |
| An ATC cannot be saved with no steps | test:builder-guards.test.ts | `hasMinimumSteps` unit test + `STEPS_MESSAGE`; parsed steps count from Monaco markdown | covered |
| A title shorter than the minimum is rejected | test:builder-guards.test.ts | `titleValid` boundary tests (2/3/200/201) + `TITLE_MESSAGE` | covered |
| Adding more than the allowed number of tags is prevented | test:builder-guards.test.ts | `canAddTag` / `tagCapReached` tests (10/11) + `TAG_CAP_MESSAGE` blocks the 11th | covered |

**No uncovered rows.** Happy path is `review-approved` (no committed E2E per sprint-development Gotcha #10); end-to-end manual smoke is deferred to QA on staging (Stage 4 handoff).

## Verification

- `bun test lib/atcs/builder-guards.test.ts` — 10/10 pass
- `bun run types:check` — clean
- `bun run lint:check` — clean
- Static review (cavecrew-reviewer) — no issues
