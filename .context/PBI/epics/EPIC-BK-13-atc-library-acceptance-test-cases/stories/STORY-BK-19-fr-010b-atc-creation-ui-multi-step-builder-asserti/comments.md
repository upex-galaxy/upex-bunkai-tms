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


_Synced from Jira by sync-jira-issues_
