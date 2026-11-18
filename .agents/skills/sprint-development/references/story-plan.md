# Story implementation plan

Stage 1 turns one Story and its Acceptance Test Plan into the plan a developer follows in Stage 2. You write the plan in the session, push it to the Story's Jira field, sync it back and read the materialized file. Only the block between the `plan-body` markers is published, so everything outside it is guidance for the author.

## Jira fields and tools

Jira field ids differ per workspace, so this skill never carries them. Each field resolves at runtime through `{{jira.<slug>}}` against the catalog in `.agents/jira-required.yaml`; the slug-to-id map is `.agents/jira-fields.json`, filled by `bun run jira:sync-fields`. When a slug does not exist in the target workspace, the catalog declares the fallback and `bun run jira:check` warns.

This workflow uses two slugs:

- `{{jira.acceptance_test_plan}}` is the Story-level Textarea holding the acceptance scenarios the implementation must cover. This workflow only reads it.
- `{{jira.spec_implementation_plan}}` is the Story-level Textarea where this workflow publishes the technical plan.

Every Jira read or write is written as `[ISSUE_TRACKER_TOOL]` pseudo-code, and the runtime picks the tool from the table in `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). The operation-to-tool matrix is in `.agents/skills/product-management/references/jira-operations.md`, and the two known rich-text (ADF) publishing bugs are in `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

## Inputs

- Story: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md`
- Acceptance Test Plan (ATP), a planning-stage artifact. Read it in full, always through the sync, never with `view`. It branches on the modality resolved in planning:
  1. jira-native: the ATP lives in `{{jira.acceptance_test_plan}}` on the Story. Run `bun run jira:sync-issues get <STORY_KEY> --include-comments`, then read `acceptance-test-plan.md` in the Story folder (when the field is absent the sync writes a stub pointing at the fallback comment) and `comments.md` (look for "Test Case", "TC-", "Scenario:" or test-case tables).
  2. jira-xray: the ATP is the description of a `Test Plan` issue linked to the Story. Run `bun run jira:sync-issues get <ATP_KEY>`, which writes `.context/PBI/test-plans/TESTPLAN-<ATP_KEY>-<slug>.md`, and read that. Take `<ATP_KEY>` from the "tests" or "is tested by" link in `story.md` or `comments.md`. Use the Test Plan key, never the Story key, because the ATP body is in the Test Plan.
  3. Last fallback: `comments.md` or the issue description, where the `## Acceptance Test Plan` fallback comment lands when the custom field is absent (per `.agents/jira-required.yaml`).
- Feature Implementation Plan: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/feature-implementation-plan.md`, which the sync materializes from the Epic's `{{jira.feature_implementation_plan}}` field.
- Relevant SRS: the matching sections of `.context/SRS/`. Without an SRS, use the business-map sections named in `../SKILL.md` under "Product docs: PRD/SRS or business maps".
- Design system: `DESIGN.md` (tokens and visual personality) and, for stories with UI, `.context/design/master-design-plan.md` §8 (US-to-screen row), then §4 (screen spec), plus the mockup in `.context/designs/` (Critical Rule #14).

Jira is the source of truth for the ATP. Its scenarios are what the implementation has to cover, so each one maps to an implementation step through that step's **Covers** line, and none is skipped. QA always delivers the ATP and the shift-left handoff comment; read both as QA's test intent. A missing ATP does not block: leave QA a comment on the Story and continue.

## Authoring flow

Write the plan in the session, push it to `{{jira.spec_implementation_plan}}` on the Story (or to the fallback comment, per `.agents/jira-required.yaml`), run `bun run jira:sync-issues get <STORY_KEY> --include-comments`, and read the materialized `implementation-plan.md` under `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`. That file is a `[SYNC]` read-only cache, so it is never hand-written. The body follows the skeleton below.

## How to write the plan (these notes are not published)

Copying any of this into the body spends Jira budget (see "Size budget" below) and gives the reviewer nothing.

- Verify before deciding. When the approach uses an external library, check Context7 MCP that the methods and hooks exist in the project's version (Supabase Auth, React Query, Next.js App Router). When the project uses shadcn/ui, search the shadcn MCP before planning a new component (dialog, form, data-table). The plan records the chosen approach, not the lookup.
- Name the test seams in Technical Decisions: the few points where the story will be tested, preferring seams the codebase already has and the highest one that works. Stage 2 hands them to `/unit-testing`, and no test is written at a seam the plan did not name: when the code turns out to need one, add it to the plan first. The plan author, a person or the agent, picks the seams and nobody confirms them; the plan carries the choice.
- ADR promotion. Plan decisions are story-local (which hook, which component, a one-file trade-off). A decision that passes the three-gate test in `agentic-dev-core/references/adr-doctrine.md` §1 (architectural first, then hard to reverse, surprising without context, and a real trade-off) goes to `ADR-NNNN-<slug>.md` in `.context/ADR/`, and the plan keeps only the backlink (`See ADR-NNNN`). The template and lifecycle are in `.context/ADR/README.md`. A decision the human already approved (approved plan, chat answer, decision deck) is written `Accepted` and cites where it was approved. Only a still-open question is `Proposed`.
- Backend types. Components import types where the app already exposes them (greenfield: `@/lib/types`, derived from `{{stack.database.types_path}}`; the app's alias is `{{stack.conventions.import_alias}}`), props are typed with them, mock data matches their shape and Zod schemas use `z.infer<>`. The plan names the types it uses and the ones it creates, and does not paste code.
- UI follows Critical Rule #14 (`AGENTS.md`): the live UI is the reference and the mockup is inspiration, so inspect and reuse existing components and never invent UI. Visual personality (borders, shadows, spacing, hover) and the palette are frozen in `DESIGN.md`, and the plan does not repeat them. An ASCII layout diagram belongs in the plan only when there is no mockup to cite.
- Real copy. Texts come from the vocabulary in `.context/business/domain-glossary.md` and the PRD (`executive-summary.md`, `user-personas.md`), in the product's tone. Without a PRD, use the glossary and the copy the live UI already has. Generic lines such as "Welcome to our platform" or "The best solution for..." say nothing about this product.
- Database. The plan describes schema changes and includes no static SQL. The change is applied during implementation through the DB MCP according to `{{stack.database.migrations_tool}}`, after reading the migration history through the same MCP (`agentic-dev-core/references/db-change-doctrine.md`). A story without database changes does not need the `db` capability. A story that does need it, with no MCP available, stops per `agentic-dev-core/references/mcp-capabilities.md` §4.
- Steps are specific and executable, each with its testing, and carry no time or point estimate (effort is the AI Effort QA set in `story.md`). The last step integrates and runs the full E2E scenario.
- Leave the generic Definition of Done out of the body. It applies to every story and Stages 2 to 4 of `/sprint-development` verify it: code per the plan, all ACs passing, backend types without type errors, `DESIGN.md` personality and domain copy applied, middleware updated for new private routes, unit tests (coverage per `unit-testing/references/test-coverage.md`, where the targets are a floor and not a goal), integration and E2E tests (the ATP's TCs) passing, lint, build and TypeScript clean, code review approved, and a staging deploy with a smoke test on desktop and mobile. The plan lists only this story's own checks, and links what the Epic's Feature Implementation Plan already says.
- Long component specs, API payloads and schema notes that only help implementation go to `.session/sprint-development/<STORY_KEY>/notes.md`, a local working note. This skill never writes a `plan.md` under `.session/` (`agentic-dev-core/references/session-management.md` §13), and nothing the reviewer needs may live only in the notes.
- Omit a section that does not apply instead of publishing it empty. Prefer short lists to tables or panels, because in ADF a table costs several times what the same information costs as a list. A table earns its place when it replaces several parallel lists, and a `[!WARNING]` panel only for a risk that blocks (`../../acli/references/adf-authoring-style.md`).

<!-- plan-body:start -->

# Implementation Plan: STORY-{PROJECT_KEY}-{ISSUE_NUM} - [Story Title]

## Overview

[What gets implemented, in 1-2 sentences.]

**Acceptance Criteria:** [AC 1]; [AC 2]; [AC 3]

## Technical Approach

- **Chosen:** [technical approach]
- **Alternatives:** [A]: [why not]; [B]: [why not]
- **Trade-off:** [what is given up]

## UI/UX

- **Screen:** [§8 row, then §4 spec / mockup path, or "DESIGN.md-only"]
- **Reused components:** [component: use]
- **New components:** [Name (`components/<domain>/<name>.tsx`)]: [purpose; main props]
- **States:** loading [how], empty [message + CTA], error [message + retry], success [view]
- **Validation:** [field]: [rule], message "[text]"
- **Responsive:** mobile [adjustment], tablet [adjustment], desktop [full layout]
- **Copy:** [key texts in domain vocabulary]

## Types

[Backend types it uses (`Mentor` from `@/lib/types`) and the ones it creates, with file.]

## Implementation Steps

### Step 1: [Name]

- **Files:** `[path]`
- **Task:** [what changes]
- **Edge cases:** [case]: [how it is handled]
- **Covers:** [TC-001, AC 2]
- **Testing:** [type]: [what it verifies]

(one step per unit of work; the last one integrates and runs the E2E)

## Technical Decisions

- **[Decision]:** [chosen], because [reason]. Trade-off: [what is given up]. [See ADR-NNNN if promoted]
- **Test seams:** [where the story will be tested: existing seam or new, and why it is the highest that works]

## Dependencies

- [ ] [Prerequisite] [BLOCKER if missing]

## Risks

- **[Risk]** (impact H/M/L): [mitigation]

## AI Effort

**AI Effort:** [Low | Medium | High | undefined] (set by QA in shift-left and read from `story.md`, or from the `## AI Effort` comment in `comments.md` when the field does not exist; the plan does not re-estimate it)

- **If High:** note here (and in the PR description) that the story may be large and may be split. You may split your own work into small stacked PRs (reference: about 200 changed lines and 2 to 5 files per PR), but you still work the whole ticket. This is a notice only and never stops the story.
- **If undefined:** carry on, note it here and, if you like, mention it to QA in the notification comment.

## Story-specific Done

- [ ] [TC-001]: [name] passes
- [ ] [This story's own check]

<!-- plan-body:end -->

## Publishing to Jira

The plan body is published to `{{jira.spec_implementation_plan}}`, and after the sync it is materialized as `implementation-plan.md` under the Story folder in `.context/PBI/` (read-only cache).

| Slug (resolves through jira-required.yaml) | Name | Type | Level |
| --- | --- | --- | --- |
| `{{jira.spec_implementation_plan}}` | Spec Implementation Plan (Dev) | Textarea | Story |

Before writing any rich-text field, read `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

### Size budget

Jira Cloud cuts every rich-text value at 32,767 characters and counts the serialized ADF, not the Markdown. A plan converted to ADF measures several times its Markdown size, and tables, nested lists, panels and code blocks grow the most (measurements: `.context/ADR/ADR-0003-forensic-measurements-ledger.md`). So before publishing, to the field or to the fallback comment, convert and measure the complete body as it will be stored:

```bash
bun .agents/skills/acli/scripts/md-to-adf.ts plan.md plan.adf.json
jq -c . plan.adf.json | wc -m        # must stay at or under 30000
```

Above 30,000, stop before writing. Propose which sections leave the plan and where they go, with what each move saves, and wait for the person's decision. The destinations at this level:

- Long example code leaves the plan: the plan names the file and symbol, and the code lives in the branch and the PR.
- A hard-to-reverse architectural decision goes to an ADR (`.context/ADR/`) and the plan links it.
- Context already in the Epic's Feature Implementation Plan is linked, not repeated.
- A Story that still does not fit is too big: propose splitting it with `/product-management`.

A Jira rejection for length (`CONTENT_LIMIT_EXCEEDED`) is the same stop. Truncating, splitting the plan across two fields or two comments, and stripping the formatting to fit are all off the table, because each one hides lost content from the reviewer. Canonical rule: `.agents/skills/acli/SKILL.md` under "Size budget".

With nobody at the keyboard, a supervised worker sends the proposal to its conductor and waits for the answer. A routine, `/autonomous-delivery` included, applies the destinations above in order of what each saves, reports the call as `DECIDED:` with the option it beat, and publishes the shortened plan. When the plan still does not fit, splitting the Story is a product call: write no value to the field, log the measured sizes in the run's escalation log and report that this Story's plan does not fit (`acli` "With nobody at the keyboard", `agentic-dev-core/references/decision-protocol.md`).

### Steps

1. Check that the Story has the field: confirm the slug `{{jira.spec_implementation_plan}}` resolves to a field present in the workspace (through `.agents/jira-fields.json` and `.agents/jira-required.yaml`).
2. When the field exists, publish the complete plan body to `{{jira.spec_implementation_plan}}` on the Story with `[ISSUE_TRACKER_TOOL]` (custom-field write), and add the label `implementation-plan-ready`.
3. When the field does not exist, resolve the fallback `.agents/jira-required.yaml` declares for the slug `spec_implementation_plan`. When there is no equivalent field either, publish the plan as a structured comment on the Story with `[ISSUE_TRACKER_TOOL]` (create comment), headed `## Spec Implementation Plan (Dev)`:

   ```
   ## Spec Implementation Plan (Dev)

   [complete plan body]
   ```

4. Run `bun run jira:sync-issues get <STORY_KEY> --include-comments` and read the generated `implementation-plan.md` under `.context/PBI/epics/.../stories/.../` (read-only cache). When the field was absent, the sync writes a stub pointing at the fallback comment.

### Done when

- [ ] The plan body is published to `{{jira.spec_implementation_plan}}` on the Story (when the slug resolves to a present field) or to the fallback comment `## Spec Implementation Plan (Dev)`.
- [ ] The body's serialized ADF size was measured before publishing: `{N} / 30,000` (or the stop with the proposal of which sections move).
- [ ] The label `implementation-plan-ready` is on the Story.
- [ ] `bun run jira:sync-issues get <STORY_KEY> --include-comments` ran, and `implementation-plan.md` is materialized and read.
