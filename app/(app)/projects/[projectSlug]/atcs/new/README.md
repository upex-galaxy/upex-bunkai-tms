# New ATC route — `/projects/[projectSlug]/atcs/new`

BK-19 (FR-010b) — the **create** twin of the ATC edit screen
(`/projects/[projectSlug]/atcs/[atcId]`). Server component loads the project,
its non-archived modules, user stories, and acceptance criteria, then renders
`components/atcs/NewAtcEditor.tsx` (client). On submit it `POST`s the BK-18
contract `POST /api/v1/atcs` (cookie session auth) and redirects to the ATC
detail page on `201`.

## Client guards (pre-submit)

Mirror the BK-18 server limits via `lib/atcs/builder-guards.ts`
(single source of truth = `lib/atcs/validation.ts`):

| Rule | Guard | Message |
|---|---|---|
| Title 3–200 chars | `titleValid` | "Title must be between 3 and 200 characters." |
| Tags ≤ 10 | `canAddTag` / `tagCapReached` | "An ATC can have at most 10 tags." |
| Provenance (US + ≥1 AC) | `provenanceOk` | "An ATC needs a User Story and at least one Acceptance Criterion." |
| ≥ 1 step | `hasMinimumSteps` | "At least one step is required." |
| Module selected | (inline) | "Pick a Module for this ATC." |

## Server error envelope → user message (`friendlyError`)

The form still maps server-side failures (the API is the source of truth):

| `error.details.reason` / `error.code` | HTTP | User message |
|---|---|---|
| `ac_outside_user_story` | 422 | "One or more Acceptance Criteria do not belong to the selected User Story." |
| `module_outside_project_subtree` | 422 | "The Module must be the User Story’s module or a descendant in the same project." |
| `steps_position_invalid` | 422 | "Step numbering must start at 1 and strictly increase." |
| `slug_collision` | 409 | "An ATC with this name already exists — try saving again." |
| `version_conflict` | 409 | "The ATC was modified by another request. Reload and retry." |
| `unauthorized` | 401 | "Your session expired — sign in again." |
| `forbidden` / `not_a_member` | 403 | "You do not have permission to create ATCs." |
| `not_found` | 404 | "The User Story or Module was not found." |

## Authoring formats

- **Steps** — markdown numbered list (`01. …`), one step per line; optional
  `input:` / `expected:` indented sub-lines. Parsed by `parseStepsMarkdown`.
  Step `position` is assigned 1..N from list order on submit.
- **Assertions** — YAML-ish bullet list (`- …`). Parsed by `parseAssertionsYaml`.

## Notes

- Picking a User Story defaults the Module to that story's module when none is
  chosen yet; the user can override to a descendant module.
- No optimistic UI — the server is the source of truth (form state is preserved
  on error so the user can correct and retry).
