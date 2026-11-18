# Feature implementation plan

The macro plan for an Epic that spans several stories (three or more). It records the technical decisions, shared types, UI strategy, dependencies and implementation order that the per-story plans (`story-plan.md`) then build on. You write it in the session, push it to the Epic's Jira field, sync it back and read the materialized file. Only the block between the `plan-body` markers is published, so everything outside it is guidance for the author.

## Jira fields and tools

Jira field ids differ per workspace, so this skill never carries them. Each field resolves at runtime through `{{jira.<slug>}}` against the catalog in `.agents/jira-required.yaml`; the slug-to-id map is `.agents/jira-fields.json`, filled by `bun run jira:sync-fields`. When a slug does not exist in the target workspace, the catalog declares the fallback and `bun run jira:check` warns.

This workflow writes one slug: `{{jira.feature_implementation_plan}}`, the Epic-level Textarea that holds the technical plan.

Every Jira read or write is written as `[ISSUE_TRACKER_TOOL]` pseudo-code, and the runtime picks the tool from the table in `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). The operation-to-tool matrix is in `.agents/skills/product-management/references/jira-operations.md`, and the two known rich-text (ADF) publishing bugs are in `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

## Inputs

- Epic: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/epic.md`
- Full SRS: `.context/SRS/*.md`. Without an SRS, use the business-map sections named in `../SKILL.md` under "Product docs: PRD/SRS or business maps".
- Epic-level acceptance criteria: the AC section of `epic.md`, or `edge-cases-enumeration.md` when it exists (both artifacts of the `product-management` skill).
- Design system, for UI/UX decisions: `DESIGN.md` (tokens and visual personality) and, when it exists, `.context/design/master-design-plan.md` (§2 frozen tokens, §4 screen specs, §8 US-to-screen map).

## Authoring flow

Write the plan in the session, push it to `{{jira.feature_implementation_plan}}` on the Epic (or to the fallback comment, per `.agents/jira-required.yaml`), run `bun run jira:sync-issues get <EPIC_KEY> --include-comments`, and read the materialized `feature-implementation-plan.md` under `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`. That file is a `[SYNC]` read-only cache, so it is never hand-written. The body is Markdown that follows the skeleton below.

## How to write the plan (these notes are not published)

Copying any of this into the body spends Jira budget (see "Size budget" below) and gives the reviewer nothing. A good plan justifies each technical decision, names the shared dependencies, puts the stories in a logical order and pairs each risk with a mitigation.

- Verify before deciding. Before each technical decision, check Context7 MCP for the current API of the candidate libraries (for example React Query against SWR), Supabase MCP when the feature touches Auth, Database or Storage, and the shadcn MCP before planning a custom component (data-table, form and dialog already exist). The plan records the decision and its reason, not the lookup.
- ADR promotion. Feature-level decisions are more likely to be architectural and hard to reverse than a single story's. Each one that passes the three-gate test in `agentic-dev-core/references/adr-doctrine.md` §1 (architectural first, then hard to reverse, surprising without context, and a real trade-off; think auth model, data-access pattern, error contract, tenancy, a framework with lock-in) is recorded as `ADR-NNNN-<slug>.md` in `.context/ADR/`, and the plan keeps only the backlink (`See ADR-NNNN`). The template and lifecycle are in `.context/ADR/README.md`. A decision the human already approved (approved plan, chat answer, decision deck) is written `Accepted` and cites where it was approved. Only a still-open question is `Proposed`.
- Backend types. Every story of the feature imports types from `@/lib/types`, derived from `src/types/supabase.ts`, and helpers that several stories share go to `lib/types.ts` or `lib/<feature>-types.ts`. The plan names entities and helpers with their file and does not paste code.
- UI follows Critical Rule #14 (`AGENTS.md`): inspect and reuse the live components, build against the `.context/design/master-design-plan.md` §4 spec when the screen is in §8, and never invent UI. Visual personality (borders, shadows, spacing, hover) is frozen in `DESIGN.md`, and the plan does not repeat it. The plan does name screens, reused components, new shared components, journeys and global states.
- Real copy. Texts come from the vocabulary in `.context/business/domain-glossary.md` and the PRD (`executive-summary.md`, `user-personas.md`, `mvp-scope.md`), in the product's tone. Without a PRD, use the glossary and the copy the live UI already has. Generic lines such as "Welcome to our platform" or "Manage your resources easily" say nothing about this product. The plan lists the key terms, not a catalog of examples.
- Leave criteria that hold for every feature out of the body (types without errors, build and lint green, critical tests passing, private routes in the middleware, docs up to date). `/sprint-development` verifies them in each story, and the plan lists only criteria that belong to this feature. The detail of one story (files, components, steps) goes to its `story-plan.md`.
- Omit a section that does not apply instead of publishing it empty. Prefer short lists to tables, because in ADF a table costs several times what the same information costs as a list. A table earns its place when it replaces several parallel lists (`../../acli/references/adf-authoring-style.md`).

<!-- plan-body:start -->

# Feature Implementation Plan: EPIC-{PROJECT_KEY}-{ISSUE_NUM} - [Epic Title]

## Overview

[What the feature implements and for whom, in 2-3 sentences.]

- **Stories:** [STORY-KEY: title], [STORY-KEY: title], ...
- **Stack:** [only what the feature uses or changes: frontend, backend, DB, deploy, testing]

## Technical Decisions

### Decision 1: [Name]

- **Options:** [A] / [B] / [C]
- **Chosen:** [option], because [reason]
- **Trade-off:** [what is given up]
- **ADR:** [See ADR-NNNN, or "local to the feature"]

(3-5 decisions, same shape)

## Shared Types

[Backend entities the feature uses and shared helpers, with file. Example: `Mentor`, `MentorInsert` in `lib/types.ts`.]

## UI/UX Strategy

- **Screens:** [screen (master-design-plan §8) and the stories that build it]
- **Reused components:** [component: use in the feature]
- **New shared components:** [Name (`components/<domain>/`): purpose; stories that use it]
- **Journeys:** [flow: Story A, then Story B, then Story C]
- **Global states:** loading [how], empty [message + CTA], error [how it recovers]
- **Domain copy:** [key glossary terms the UI uses]

## Shared Dependencies

- [External dependency or service]: [what for]
- **Env vars:** `VAR_NAME` ([what for])

## Architecture

- **Folders:** [new or changed paths]
- **Patterns:** [pattern]: [where it applies]
- **Libraries:** [library@version]: [what for]

## Implementation Order

1. [STORY-KEY]: [title]. [Why it goes first / what it unblocks]
2. [STORY-KEY]: [title]. [Depends on 1 / can run in parallel]

## Risks & Mitigations

- **[Risk]** (impact H/M/L, likelihood H/M/L): [mitigation]

## Success Criteria

- [ ] [Business criterion specific to this feature]
- [ ] [Performance target, if it applies]

<!-- plan-body:end -->

## Publishing to Jira

The plan body is published to `{{jira.feature_implementation_plan}}` on the Epic, and after the sync it is materialized as `feature-implementation-plan.md` under the Epic folder in `.context/PBI/` (read-only cache).

| Slug (resolves through jira-required.yaml) | Name | Type | Level |
| --- | --- | --- | --- |
| `{{jira.feature_implementation_plan}}` | Feature Implementation Plan (Dev) | Textarea | Epic |

Before writing any rich-text field, read `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

### Size budget

Jira Cloud cuts every rich-text value at 32,767 characters and counts the serialized ADF, not the Markdown. A plan converted to ADF measures several times its Markdown size, and tables, nested lists, panels and code blocks grow the most (measurements: `.context/ADR/ADR-0003-forensic-measurements-ledger.md`). So before publishing, to the field or to the fallback comment, convert and measure the complete body as it will be stored:

```bash
bun .agents/skills/acli/scripts/md-to-adf.ts plan.md plan.adf.json
jq -c . plan.adf.json | wc -m        # must stay at or under 30000
```

Above 30,000, stop before writing. Propose which sections leave the plan and where they go, with what each move saves, and wait for the person's decision. The destinations at this level:

- The detail of one Story (files, components, steps) goes to that Story's `{{jira.spec_implementation_plan}}` (`story-plan.md`).
- A hard-to-reverse architectural decision goes to an ADR (`.context/ADR/`) and the plan links it.
- UI design that is already documented stays in `DESIGN.md` and `.context/design/master-design-plan.md`, and the plan references it.

A Jira rejection for length (`CONTENT_LIMIT_EXCEEDED`) is the same stop. Truncating, splitting the plan across two fields or two comments, and stripping the formatting to fit are all off the table, because each one hides lost content from the reviewer. Canonical rule: `.agents/skills/acli/SKILL.md` under "Size budget".

With nobody at the keyboard, a supervised worker sends the proposal to its conductor and waits for the answer. A routine, `/autonomous-delivery` included, applies the destinations above in order of what each saves, reports the call as `DECIDED:` with the option it beat, and publishes the shortened plan. When the plan still does not fit, write no value to the field, log the measured sizes in the run's escalation log and report that this Epic's plan does not fit (`acli` "With nobody at the keyboard", `agentic-dev-core/references/decision-protocol.md`).

### Steps

1. Check that the Epic has the field: confirm the slug `{{jira.feature_implementation_plan}}` resolves to a field present in the workspace (through `.agents/jira-fields.json` and `.agents/jira-required.yaml`).
2. When the field exists, publish the complete plan body to `{{jira.feature_implementation_plan}}` on the Epic with `[ISSUE_TRACKER_TOOL]` (custom-field write), and add the label `implementation-plan-ready`.
3. When the field does not exist, resolve the fallback `.agents/jira-required.yaml` declares for the slug `feature_implementation_plan` (an equivalent slug, or an instruction to comment). When there is no equivalent field either, publish the plan as a structured comment on the Epic with `[ISSUE_TRACKER_TOOL]` (create comment), headed `## Feature Implementation Plan (Dev)`:

   ```
   ## Feature Implementation Plan (Dev)

   [complete plan body]
   ```

4. Run `bun run jira:sync-issues get <EPIC_KEY> --include-comments` and read the generated `feature-implementation-plan.md` under `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/` (read-only cache). When the field was absent, the sync writes a stub pointing at the fallback comment.

### Done when

- [ ] The plan body is published to `{{jira.feature_implementation_plan}}` on the Epic, or to the fallback comment `## Feature Implementation Plan (Dev)`.
- [ ] The body's serialized ADF size was measured before publishing: `{N} / 30,000` (or the stop with the proposal of which sections move).
- [ ] The label `implementation-plan-ready` is on the Epic.
- [ ] `bun run jira:sync-issues get <EPIC_KEY> --include-comments` ran, and `feature-implementation-plan.md` is materialized and read.
