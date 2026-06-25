# Comments for BK-19

[View in Jira](https://jira.upexgalaxy.com/browse/BK-19)

---

### Ely - 5/19/2026, 9:57:22 PM

1. 🧱 Architect Annotation

1. 

- Route: `app/(workspace)/modules/[moduleId]/atcs/new/page.tsx` (Next.js App Router). Client component for the form; server component for the outer layout that pre-loads the module.
- Form library: React Hook Form + Zod resolver. The Zod schema mirrors the API request shape exported from `@schemas/atc.types` (single source of truth — no client-only types).
- Step builder: array field with `useFieldArray`, position auto-renumbered on every reorder via `replace()`. Up/down buttons in MVP (DnD deferred).
- Assertion builder: parallel `useFieldArray` section sharing the same UX patterns as steps.
- US/AC pickers: cascading dropdowns. The US picker queries `GET /user-stories?module*id={moduleId}`; selecting a US triggers `GET /acceptance-criteria?user*story_id={id}` and clears any previously-selected AC ids.
- Tag chips: custom controlled component capped at 10. Cap enforced in component state and on submit by Zod.
- Server error mapping: shared utility `mapApiError(errorCode, fields)` translates `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid`, `title*too*short` into field-level RHF `setError` calls.
- Submit flow: blocks Submit button + shows spinner, calls `POST /atcs`, on 201 redirects to `/atcs/{slug}`, on 422 maps errors and keeps form state.
- No optimistic UI on create — server is the truth.

1. 

- Upstream: ****BK-18 (FR-010a)**** — this story is fully blocked by the API. Without the contract finalized, the form cannot wire.
- Upstream: design tokens from `DESIGN.md` (form spacing, chip styling, segmented control)
- Downstream: [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) propagation needs an edit form variant (likely a sibling route `/atcs/{id}/edit`) that reuses these builders; that story may be split or this PR may extract reusable subcomponents.
- External: React Hook Form, Zod, Next.js App Router

1. 

- [ ] Route `/modules/{moduleId}/atcs/new` renders the form
- [ ] All 5 Gherkin scenarios pass as E2E tests (Playwright)
- [ ] Component unit tests for step builder reorder, AC picker cascade, tag chip cap
- [ ] Server error code → field message mapping table documented in `app/(workspace)/modules/[moduleId]/atcs/new/README.md`
- [ ] Lint + typecheck pass
- [ ] Manual smoke: create an ATC end-to-end and verify it appears on detail page
- [ ] Accessibility check: tab order across step builder, assertion builder, and submit; screen reader announces position changes
- [ ] PR description references AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.1, US 4.2)
- SRS: `.context/SRS/functional-specs.md` § FR-010 (UI requirements section)
- Design tokens: `DESIGN.md` § Forms, § Chips
- API contract: depends on [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) OpenAPI surface

---

### Automation for Jira - 6/8/2026, 8:57:34 AM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/8/2026, 9:44:18 AM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Ely - 6/8/2026, 9:45:32 AM

BK-19 merged to staging and deployed for QA.

- PR: https://github.com/upex-galaxy/upex-bunkai-tms/pull/29 (merge commit, base staging)
- Test URL: https://staging-upexbunkai.vercel.app/ -> open a project, click 'New ATC'
- Scope: ATC creation builder (UI-only; consumes the BK-18 POST /api/v1/atcs contract)

Suggested smoke (the 5 ACs):
1. Create an ATC with a title, module, layer, >=1 step, 1 assertion, anchored to a User Story + >=1 Acceptance Criterion -> lands on the ATC detail page.
2. Save without a User Story / AC -> blocked with a provenance message.
3. Save with no steps -> blocked.
4. Title 'AB' (2 chars) -> rejected (min 3).
5. Add an 11th tag -> prevented (max 10).

---

### maibeth vega - 6/18/2026, 6:51:23 PM

## Shift-Left QA Refresh — 2026-06-18

ATP DRAFT refreshed (43 outlines). All 10 open questions resolved via PO analysis. No blockers for sprint-testing.

***Top risks to verify first******:***

1. ***CRITICAL — Anchoring moat*** (I-01, I-02, I-03): after creating an ATC via the builder, confirm `GET /atcs/{id}` returns a non-empty `ac*ids` array matching the AC selected in the form. `bunkai*save*atc` RPC accepts empty `ac*ids` at the DB layer — UI gate only.
2. ***HIGH — Cascading picker stale state*** (S-01, S-02): change the User Story after selecting ACs and confirm the AC picker clears completely.
3. ***HIGH — 422 error mapping*** (N-11, N-12, N-13): trigger each server error code and verify field-level errors appear with the correct wording.

***Coverage summary******:**** 8 Positive · 13 Negative · 9 BVA · 8 State/Sequence · 5 Security/Integrity = ****43 outlines***

Full refinement: `.context/PBI/epics/EPIC-BK-13/stories/STORY-BK-19/shift-left-refinement.md`

---

### maibeth vega - 6/18/2026, 11:30:03 PM

## Sprint Testing Results — BK-19: TMS-ATC Builder

***Tester******:*** maibethvega
***Environment******:*** staging (https://staging-upexbunkai.vercel.app)
***Date******:*** 2026-06-18
***Overall Result******:*** PARTIAL PASS

### Summary

| Status | Count |
| --- | --- |
| PASSED | 35 |
| BLOCKED | 8 |
| FAILED | 0 |
| Total | 43 |

### CRITICAL — Anchoring Moat Verdict: PASS

All three CRITICAL TCs passed:

- ***TC-02*** — `acceptance*criterion*ids` non-empty confirmed via GET /api/v1/atcs/{id}
- ***TC-03*** — Linked AC belongs to the User Story selected in the form
- ***TC-04*** — Server returns 422 when `ac_ids` is empty — UI gate is backed by server gate

### Blockers (8 TCs — not FAILED)

8 TCs could not be executed due to:

- Monaco editor does not sync state in Playwright headless (TC-29, TC-30, TC-34)
- Supabase session expiry requires magic-link re-auth in automated context (TC-31, TC-33, TC-40, TC-41)
- No second workspace on staging to test cross-workspace rejection (TC-42)

These are environment/tooling constraints, not feature failures.

### Bugs Filed (3 — all LOW)

- BUG-1: Tag input not disabled at 10-tag maximum — silent failure UX
- BUG-2: `mapApiError` does not handle `validation*failed + too*small` — generic error shown for short title server response
- BUG-3: Module outside subtree returns 404 instead of 422 `module*outside*project_subtree`

None of these are blockers for release. Feature core and CRITICAL flows all passed.

---


_Synced from Jira by sync-jira-issues_
