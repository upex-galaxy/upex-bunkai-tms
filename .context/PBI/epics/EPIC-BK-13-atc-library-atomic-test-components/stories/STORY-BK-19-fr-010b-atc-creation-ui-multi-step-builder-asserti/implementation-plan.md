# BK-19 — Implementation Plan (Dev)

> TMS-ATC Builder · ATC **creation** UI · Wave 2 · 5 SP · UI-only
> Author: Dev (sprint-development). Canonical in Jira `spec_implementation_plan`, materialized here.

## Summary

Build the **create** twin of the existing ATC **edit** screen. The ATC builder UI
(`AtcEditor`, `AnchoringPanel`, `StepEditor`, tag/layer chips) already exists wired for
edit at `/projects/[projectSlug]/atcs/[atcId]`. BK-19 adds the create flow:
a new route `/projects/[projectSlug]/atcs/new` rendering a `NewAtcEditor` that reuses the
existing subcomponents, adds a **Module picker** (edit fixes the module; create must choose),
and POSTs to BK-18's `POST /api/v1/atcs`, redirecting to the ATC detail page on 201.

**No DB or API changes.** BK-18 shipped the create contract; read endpoints
(`GET /api/v1/projects/[id]/modules`, `.../modules/[id]/user-stories`,
`.../user-stories/[id]/acceptance-criteria`) all exist. The route's server component loads
project + modules + stories + ACs directly via Supabase (mirrors the edit page).

## Decisions (stale-annotation reconciliation)

The Jira architect annotation predates the actual codebase and is wrong on four points; the
plan follows codebase reality (Critical Rule: SURGICAL CHANGES — match existing style):

| Annotation | Reality / Decision |
|---|---|
| Route `(workspace)/modules/[moduleId]/atcs/new` | `(app)/projects/[projectSlug]/atcs/new` — ATCs are project-scoped; module is an in-form picker |
| RHF + Zod resolver | Codebase forms = `useState` + manual guards + `friendlyError()`. No RHF/Zod client-side |
| `useFieldArray` per-row steps + up/down reorder | Monaco free-text: steps = numbered markdown, assertions = YAML list. Order = line order. (User-confirmed) |
| Build builder from scratch | Reuse via new sibling `NewAtcEditor` — edit page untouched, zero regression. (User-confirmed) |

Single source of truth for limits: import `ATC_TITLE_MIN/MAX`, `MAX_ATC_TAGS`, `ATC_LAYERS`
from `@lib/atcs/validation` (pure zod module, client-safe).

## Files

| File | Action |
|---|---|
| `app/(app)/projects/[projectSlug]/atcs/new/page.tsx` | NEW — server component; loads project + modules + stories + storyAcs (mirror edit page §43-75); 404 if project missing |
| `components/atcs/NewAtcEditor.tsx` | NEW — client; reuses `AnchoringPanel` + `StepEditor` + tag/layer chips; adds Module `<select>`; client guards + POST `/api/v1/atcs`; redirect to `/projects/{slug}/atcs/{atc.id}` on 201 |
| `lib/atcs/builder-guards.ts` | NEW — pure guard helpers (`titleValid`, `canAddTag`, `provenanceOk`, `stepsRequired`) for testability + AC messages |
| `lib/atcs/builder-guards.test.ts` | NEW — unit tests (title 2/3/200/201, tag cap 10/11, 0-step, no-provenance) |
| `app/(app)/projects/[projectSlug]/atcs/new/README.md` | NEW — server-error-code → field-message mapping table (DoD item) |
| `app/(app)/projects/[projectSlug]/page.tsx` | EDIT — replace disabled "New ATC" placeholder button (~L113-119) with `<Link>` to the create route |

## AC scenario → implementation mapping

| Gherkin scenario | Covered by |
|---|---|
| H1 create w/ steps+assertion → saved & chainable | NewAtcEditor POST → 201 → redirect to detail; parseStepsMarkdown/parseAssertionsYaml build body |
| Cannot save without provenance (US + ≥1 AC) | `provenanceOk` guard → message; Save disabled; server `ac_outside_user_story` mapped |
| Cannot save with no steps | `stepsRequired` (parsed steps.length ≥ 1) → message |
| Title < 3 chars rejected | `titleValid` (min `ATC_TITLE_MIN`) → "title must be at least 3 characters" |
| > 10 tags prevented | `canAddTag` (cap `MAX_ATC_TAGS`) blocks 11th + "at most 10 tags" message |

## Tests

- **Committed**: `lib/atcs/builder-guards.test.ts` — pure boundary unit tests.
- **Manual (evidence)**: end-to-end create via dev server — create ATC, land on detail. Documented in Spec Compliance Matrix as `manual:<evidence>`.
- **E2E (Playwright)**: out of scope per sprint-development Gotcha #10; the 5 Gherkin scenarios covered by unit guards + manual smoke.

## Review Workload Forecast

Estimated: ~470 additions + ~6 deletions = ~476 total lines
400-line budget risk: **Medium-High**
Chain strategy: **size-exception** (one cohesive UI slice — route + editor + guards inseparable; precedent BK-15/17/18 single-PR)
Decision needed before apply: **No**

## missing_input

- `feature-implementation-plan.md` absent in EPIC-BK-13 (macro plan). Non-blocking — story well-refined. Flagged for a later pass.
