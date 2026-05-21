# Comments for BK-19

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-19)

---

### Ely - 5/19/2026, 9:57:22 PM

# 🧱 Architect Annotation

## Technical Notes
- Route: `app/(workspace)/modules/[moduleId]/atcs/new/page.tsx` (Next.js App Router). Client component for the form; server component for the outer layout that pre-loads the module.
- Form library: React Hook Form + Zod resolver. The Zod schema mirrors the API request shape exported from `@schemas/atc.types` (single source of truth — no client-only types).
- Step builder: array field with `useFieldArray`, position auto-renumbered on every reorder via `replace()`. Up/down buttons in MVP (DnD deferred).
- Assertion builder: parallel `useFieldArray` section sharing the same UX patterns as steps.
- US/AC pickers: cascading dropdowns. The US picker queries `GET /user-stories?module_id={moduleId}`; selecting a US triggers `GET /acceptance-criteria?user_story_id={id}` and clears any previously-selected AC ids.
- Tag chips: custom controlled component capped at 10. Cap enforced in component state and on submit by Zod.
- Server error mapping: shared utility `mapApiError(errorCode, fields)` translates `ac_outside_user_story`, `module_outside_project_subtree`, `steps_position_invalid`, `title_too_short` into field-level RHF `setError` calls.
- Submit flow: blocks Submit button + shows spinner, calls `POST /atcs`, on 201 redirects to `/atcs/{slug}`, on 422 maps errors and keeps form state.
- No optimistic UI on create — server is the truth.

## Dependencies
- Upstream: **BK-18 ({{PROJECT_KEY}}-010a)** — this story is fully blocked by the API. Without the contract finalized, the form cannot wire.
- Upstream: design tokens from `DESIGN.md` (form spacing, chip styling, segmented control)
- Downstream: BK-21 propagation needs an edit form variant (likely a sibling route `/atcs/{id}/edit`) that reuses these builders; that story may be split or this PR may extract reusable subcomponents.
- External: React Hook Form, Zod, Next.js App Router

## Definition of Done (expanded)
- [ ] Route `/modules/{moduleId}/atcs/new` renders the form
- [ ] All 5 Gherkin scenarios pass as E2E tests (Playwright)
- [ ] Component unit tests for step builder reorder, AC picker cascade, tag chip cap
- [ ] Server error code → field message mapping table documented in `app/(workspace)/modules/[moduleId]/atcs/new/README.md`
- [ ] Lint + typecheck pass
- [ ] Manual smoke: create an ATC end-to-end and verify it appears on detail page
- [ ] Accessibility check: tab order across step builder, assertion builder, and submit; screen reader announces position changes
- [ ] PR description references AC by Gherkin scenario name

## Related Documentation
- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.1, US 4.2)
- SRS: `.context/SRS/functional-specs.md` § {{PROJECT_KEY}}-010 (UI requirements section)
- Design tokens: `DESIGN.md` § Forms, § Chips
- API contract: depends on BK-18 OpenAPI surface


---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:07.569Z_
