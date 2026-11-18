---
name: product-management
description: "Manages the Jira product backlog after the PRD exists. Use when seeding the backlog, adding a feature or epic, refining a story (INVEST, 3-amigos), its Gherkin AC or edge cases, or reporting and sequencing the sprint. Not for the PRD (project-foundation), screens (design-system) or coding a story (sprint-development)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: management
complementary_categories:
  - issue-tracker
# compact_rules is read verbatim by scripts/build-skill-registry.ts (frontmatter first, no
# truncation). It is the only copy of the invariants; the body points here.
compact_rules: |
  - **I1.** Never hardcode `customfield_NNNNN` IDs in skill or AI output. Resolve them through `{{jira.<slug>}}`.
  - **I2.** Never prefix a story summary with `FR-XXX` and a dash. Put `**Source spec:** FR-XXX` as the first line of the body.
  - **I3.** Never copy AC, Scope or Out-of-Scope content into the description. They live only in their custom fields.
  - **I4.** Never let two stories in the same epic share a literal Scope bullet. Surface it as `overlap_alert` and have it resolved.
  - **I5.** Never invent acceptance criteria, scope items or business rules. The source is the PRD, the SRS, a business map or explicit user input. With no source, report a `gap`, halt that field and continue with the rest.
  - **I6.** Never batch several ADF custom fields in one MCP update call. Split per field, or pre-convert with `md-to-adf.ts`.
  - **I7.** Never nest inline `code` inside `**bold**` markdown headed for ADF. The converter combines incompatible marks and Jira rejects the call with HTTP 400.
  - **I8.** Never create stories without running the dependency-linking phase right after. Local declarations are not enough; the Jira links must exist.
  - **I9.** Never hardcode `acli`, `mcp__atlassian__` or REST URL examples in this skill. Use `[ISSUE_TRACKER_TOOL]` pseudo-code; the tool skill owns the syntax.
  - **I10.** Never use the word "Wave". Say "Sprint" (or "Master Sprint" or "Execution Sprint" when the layer matters).
  - **I11.** Never skip sprint-sequencing after creating several linked stories.
  - **I12.** Never hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Use `{{jira.link_types.<slug>}}`.
  - **I13.** Never use `Relates` for a dependency whose order matters: it is symmetric and loses the direction. Use `Dependencies`, or flag the fallback explicitly as a degradation.
  - **I14.** Never ignore cycle detection in sprint-sequencing. A cycle in the `dependencies` graph is a bug: halt and report.
  - **I15.** Never put implementation surface in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}` or `{{jira.workflow}}`. Implementation surface means API or endpoint paths, HTTP status codes, DB table or column names, error-code identifiers (such as `VALIDATION_ERROR`), framework or library names, transaction or locking patterns, and internal algorithms. Those describe how; AC, Scope and Workflow describe what the persona observes, does or receives, and the how belongs in the impl-plan from `/sprint-development`. `{{jira.business_rules_specification}}` tolerates domain rules (boundaries, role gates, retry semantics, audit guarantees) but not internal algorithms. Exception: when the persona is an API consumer (DevEx, integration agent, headless client), endpoint paths and response shapes are part of their observable experience. Test: if the criterion stays true after a stack swap it is in business voice; if a swap breaks it, rewrite it.
  - **I16.** Never populate `{{jira.ai_effort}}`, `{{jira.development_token_usage}}` or `{{jira.quality_token_usage}}` on create or edit. QA sets AI Effort in shift-left, the dev and QA agents measure the two token fields, and the PO refines the story. A `High` AI Effort is a size warning for the dev, never a gate: the PO may propose splitting the story (clone it, refine both, leave both Ready For Dev), and whoever resolves a split may add one optional label (`split-accepted`, `split-edited` or `split-rejected`; no label is valid), but nobody waits for it. No story points, no planning poker.
  - **I17.** Never write `{{jira.acceptance_criteria}}` as plain text. Wrap every scenario in a fenced ```gherkin code block, on the first create and on every edit or re-format pass, because Jira ADF renders the fence as monospaced, highlighted text and that is the only readable shape for Given/When/Then in the Jira UI. When refining existing AC that was written unfenced, rewrite the whole field to apply the fence.
  - **I18.** Never create or edit a story or epic before an active dependency-discovery pass over the current backlog graph (`.context/PBI/epic-tree.md`, the live Jira link graph and, when generated, the data map from `bun run context:map business-data-context`). The default is that no global or infrastructural dependency becomes a story link: generic prerequisites (auth exists, the DB exists, the framework is set up) are noise. Only feature-level, observable, explicit dependencies become candidate links. The output is a `(from, to, source-of-decision)` matrix, confirmed before any Jira link is written. "Link only if obviously needed" is rejected: discovery is an active step.
  - **I19.** Never use a generic actor ("the user", "the customer", "the system") in the `As a` line of a story. The persona resolves to a named entity in `.context/PRD/user-personas.md` (a business-maps project with no PRD: an actor the domain glossary or the data map's `access-control` section names). When no persona matches, surface a `gap` and never invent one.
  - **I20.** Never write the `As a … I want to … so that …` sentence as the story summary. The summary is `{Feature} | {Action}` (see Story title format) and the full sentence lives only in the description's `## User story` section. Persona and benefit never appear in the title. Domain-entity prefixes that collide with agile or QA vocabulary carry the `TMS-` (project-domain) tag; cross-cutting features stay plain. Epics keep noun-phrase titles (no pipe, no verb).
  - **I21.** Never publish Jira content whose domain entity, process or state names diverge from `.context/business/domain-glossary.md`, and never use a term its anti-glossary bans (use the prescribed replacement). A needed term missing from the glossary is a `gap` for the PM to add through the glossary's change protocol, never a term to invent mid-story.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and never substitute silently (the built-in `WebSearch` or `WebFetch` only when the user chooses it).
metadata:
  kind: workflow
  stage_owner: true
  requires_capabilities: [db]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Product Management

This skill carries the product management lifecycle: a fresh PRD becomes the initial Jira backlog, new features arrive one at a time, epics get a structure, and each story is refined until it is ready for development. Unlike `/project-foundation`, which runs once, this is ongoing work, so invoke it again whenever backlog work comes up.

## Tool abstraction

The skill says what to do at each phase and never hardcodes the how (CLI flags, MCP call shapes, REST endpoints); the tool skill owns that. Every tool interaction is written as `[ISSUE_TRACKER_TOOL]`, `[DB_TOOL]` or `[AUTOMATION_TOOL]`, which resolve through the `AGENTS.md` Tool Resolution table, and the agent loads the matching tool skill (`/acli` for Jira) when it executes. That keeps the methodology intact when the tool changes. `references/jira-operations.md` has the operation-by-operation table.

## When to use

Use it for backlog and refinement work once the foundational PRD/SRS exists:

- a new feature or epic goes into the backlog;
- a story has rough or ambiguous acceptance criteria;
- a story needs INVEST validation or a 3-amigos session before development;
- a feature needs its edge cases and failure modes enumerated;
- the first product backlog is seeded from a fresh PRD.

Each workflow points to the reference that holds its exact protocol.

The skill does not own design and does not wait for it. A story is written, refined and made ready with no mockup; screens come later, per story, when development picks it up and `/sprint-development`'s design gate routes to `/design-system`'s screen phase. Do not defer, block or downgrade a story because its screen is not drawn.

A UI-touching story does owe one thing at creation, where the host project keeps a master design plan: its §8 US→Screen row. The row names the screen the story renders into, or says explicitly that no mockup covers it yet (`🔒 mockup-gated`). It is cheap, the design gate reads it later, and a story created without one reaches development out of compliance. The row is not a mockup, and writing it is not designing.

## Pre-requisites

- Product docs in one of two forms: `.context/PRD/` and `.context/SRS/` from `/project-foundation` (required for workflow A), or, on an existing app, its business maps and domain glossary (a Discovery-only foundation), which is enough for every other workflow. Never write a PRD or SRS to get past this (see "Product docs: PRD/SRS or business maps").
- `.agents/project.yaml` populated with `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}` and `{{ATLASSIAN_URL}}`. They ship with the installed layer; when they are missing the layer is not installed: `bunx create-agentic-dev@latest <name>` for a new project, or `bunx create-agentic-dev@latest --adopt` then `/project-adoption` for an existing app (`agentic-dev-core`, Install model).
- Atlassian tooling reachable for any workflow that writes to Jira: the Atlassian CLI `acli` first, the Atlassian MCP as the fallback.

### Inputs to read first

A cold start reads these in order and stops early when the workflow is small enough that later inputs add no signal.

1. `.agents/project.yaml`: project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml`: the canonical slug catalog (fields, statuses, link types).
3. `.agents/jira-fields.json`: slug to numeric custom-field ID.
4. `.agents/jira-workflows.json`: workflow and transition catalog (which status a created Epic or Story moves to, and the unmapped-status fallback in `agentic-dev-core/references/artifact-lifecycle.md`).
5. `.agents/jira-link-types.json`: slug to workspace link type, when present.
6. `.context/master-implementation-plan.md`: the Master Sprint roadmap.
7. `.context/PRD/mvp-scope.md`: what is in and out of the MVP.
8. `.context/PRD/user-personas.md`: the actor model.
9. `.context/PRD/user-journeys.md`: flow-level expectations.
10. `.context/SRS/functional-specs.md`: the FR catalog, source of `**Source spec:**` references.
11. `.context/SRS/non-functional-specs.md`: performance, security and accessibility requirements.
12. `bun run context:map business-data-context`: the entity graph, source of entity-level dependencies.
13. `bun run context:map business-feature-context`: the CRUD matrix.
14. `bun run context:map business-api-context`: the endpoint catalog (auth model, journey breakdown).
15. `.context/PBI/epic-tree.md`: the current backlog state.

Inputs 12 to 14 often arrive after `/project-context` modes `data`, `features` and `api` have run, so they may be missing at seed time. Proceed without them and put a `missing_input` note in the workflow output so a later refinement pass can fill the gap.

### Product docs: PRD/SRS or business maps

An existing app documented by `/project-foundation`'s Discovery-only path has no PRD or SRS. Its business maps, domain glossary and dev guide are its product docs, and inputs 7 to 11 read as below (map sections by id: `bun run context:map <skill> --section <id>`).

| Need | PRD/SRS project | Business-maps project |
|---|---|---|
| Scope (7) | `.context/PRD/mvp-scope.md` | `business-feature-context` `overview` and `module-<slug>`; what the app does is in scope, a new capability is the user's call |
| Personas (8) | `.context/PRD/user-personas.md` | the actors `.context/business/domain-glossary.md` names, plus the roles in `business-data-context` `access-control` |
| Journeys (9) | `.context/PRD/user-journeys.md` | `business-api-context` `journey-<slug>`, `business-data-context` `flow-<slug>` |
| Functional and non-functional specs (10-11) | `.context/SRS/*.md` | the feature map's modules and the data map's rules; the `**Source spec:**` line cites the map section (`business-feature-context#module-<slug>`) |

Workflow A does not apply to such a project: its backlog grows through B and C. When both sets exist, the PRD/SRS state intent and the maps state what the code does. A disagreement between them is surfaced, never resolved silently.

## Glossary

Two layers share the noun "Sprint". Use the bare word when the layer is obvious and qualify it when it matters.

- A Master Sprint is a strategic or architectural grouping (Master Sprint 1 to 7 is typical) from `.context/master-implementation-plan.md` §5. It is locked at PRD time and rarely changes, and it contains several Execution Sprints.
- An Execution Sprint is an operational, dependency-driven grouping (Execution Sprint 1, 2, 3) that `references/sprint-sequencing.md` produces by topologically sorting the dependency-link graph. It is recomputed whenever stories or links change.

## Composable Skills (auto-resolved at skill entry)

Run this once at skill entry, before any workflow below, following `agentic-dev-core/references/skill-composition-strategy.md`.

1. Read `complementary_categories` from this skill's frontmatter (`issue-tracker`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each matched skill's tier per strategy doc §2.
4. Apply the threshold rule of strategy doc §3.2. T1 and T3 matches load silently and are cached for the session. For a T4 match, ask once, `"Detected <skill> (T4). Apply for this PM workflow? Y/N"`, and cache the answer. With nobody to ask, the strategy doc's "With nobody at the keyboard" table decides.
5. When dispatching subagents (backlog seeding, story refinement, AC enumeration, sprint reporting), inject a `## Composable Skills` block per strategy doc §5.2.

Expected matches (illustrative; the real list depends on what is installed):

| Category        | Likely matches                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `issue-tracker` | `acli` (T1 sister, silent; primary Jira CLI). Atlassian MCP is the fallback declared above, not a skill |

Skip the step only when neither the session skill list nor `.agents/skills/` can be read. Then log `skill_resolution: "fallback-inline"` and `missing: [<categories with no resolution>]` in the result envelope (strategy doc §3.4).

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

Session management covers workflows A, B and C only. The short, single-actor workflows opt out:

| Workflow                          | Session-managed?           |
| --------------------------------- | -------------------------- |
| A: Initial backlog seed           | Yes, scope `seed`          |
| B: Incremental feature            | Yes, scope `<epic-slug>`   |
| C: Epic creation                  | Yes, scope `<epic-slug>`   |
| D: Story refinement               | No (short, non-interruptible) |
| E: AC quality refinement          | No                         |
| F: Edge-case enumeration          | No                         |
| G: Sprint reporting               | No (read-only)             |
| H: Sprint sequencing              | No (one-shot derivation, no scope) |

For D, E, F, G and H, create no `.session/product-management/` directory and skip Phase 0, so nobody expects a session directory for them.

## Phase 0 resume check (A, B and C only, inline)

Before dispatching a subagent or starting workflow A, B or C, run the resume contract from `agentic-dev-core/references/session-management.md` §4.

1. Resolve `<scope>`: `seed` for workflow A, the kebab-case epic identifier from the user's input for B and C.
2. Look for `.session/product-management/<scope>/progress.md`. When it does not exist, go to Phase 1.
3. When it exists, read `plan.md` in full and the last three phase entries of `progress.md`. Show the user the plan's Goal (one sentence), the last completed phase with its timestamp, the next planned phase and any blocking notes. Then offer **resume**, **restart** (archive the directory to `.session/.archive/<YYYY-MM-DD>-product-management-<scope>-aborted/`) or **abort**, and wait. The "Without a person present" part of that section says who answers when nobody is there.

Phase 0 is inline, with no subagent dispatch.

## Phase 1: write `plan.md` (A, B and C only)

Once Phase 0 finds no prior session, write `.session/product-management/<scope>/plan.md` using the schema in `agentic-dev-core/references/session-management.md` §6.

- Frontmatter: `topic_key: session/product-management/<scope>/plan`, `skill: product-management`, `scope: <scope>`, `status: draft`, `capture_prompt: true`.
- Body, with these H2 sections in this order: `## Goal`, `## Inputs` (PRD and SRS paths, Jira project key, existing epic list when it applies), `## Approach`, `## Phase breakdown` (per workflow: A lists the epics to seed, B routes single story, full epic or multi-epic, C decomposes the epic into stories), `## Risks & open questions`, `## Verification checklist`, `## Cross-references` (cite the `.context/PBI/<scope>/` epic and story files).

Draft inline for B and C when the scope is one epic. Use one planner subagent for A when the PRD has five or more epics to seed.

When the plan is written and approved, move `status` from `draft` to `approved` and start the workflow's first execution phase. The approver is the user, or without a person present the conductor, launcher or delegating brief, as `session-management.md` §6 says.

Progress checkpoints, each appended to `.session/product-management/<scope>/progress.md` per `session-management.md` §7: one per epic created (A), per story added (B), and per section of the epic decomposed (C).

## Story title format

The story summary (the Jira title) is not the `As a … I want to … so that …` sentence. That sentence is too long for a board card and buries the action between persona and benefit, so it lives in the description's `## User story` section and the summary is scannable:

```
{Feature} | {Action}
```

- `{Feature}` is one to three words, a Title Case noun phrase: the abbreviated feature name, finer-grained than the epic. The epic is the module, the prefix is the feature inside it. Sibling stories of one feature share the prefix, which is what makes a split traceable.
- ` | ` is a space, a pipe and a space.
- `{Action}` is the `I want to …` clause as a base-form verb phrase. Drop the persona and the benefit, keep scenario qualifiers (`quickly`, `from a failing run step`, `in a chosen environment`). Sentence case, no trailing period, about three to nine words.

The summary is in English (it is a repo artifact), about 80 characters at most because board cards truncate beyond that, with no `FR-` prefix, issue key or spec prefix (I2).

**`TMS-` domain-collision prefix.** When the product under development is itself a test or issue management system, or any tool whose entities share names with agile and QA vocabulary, a feature that names a domain entity collides with the same word at the meta level: a story titled `User Stories | …` could mean the backlog or the product feature. Prefix those entity features with `TMS-` (or the project's equivalent short tag): `User Story` becomes `TMS-US`, `Acceptance Criteria` `TMS-AC`, `Module` `TMS-Module`, `Workspace` `TMS-Workspace`, `Project` `TMS-Project`, `ATC` `TMS-ATC`, `Test` `TMS-Test`, `Run` `TMS-Run`, `Defect` `TMS-Defect`. A sub-feature qualifier stays after the entity (`TMS-ATC Builder`, `TMS-Run Execution`). Cross-cutting features stay plain (`Authentication`, `Markdown Editor`, `Jira Import`).

| Example summary | Description (`## User story`) holds |
|-----------------|-------------------------------------|
| `TMS-Defect Heatmap \| View count and week-over-week trend per module` | As a QA Lead, I want to view a defect heatmap … so that I can see where quality degrades |
| `TMS-Run Execution \| Start a manual run in a chosen environment` | As a QA Engineer, I want to start a manual run … so that I get a fresh checklist |
| `Authentication \| Sign up and sign in via OAuth (GitHub / Google)` | As a visitor, I want to sign in via OAuth … so that I can access the app |

Epics keep noun-phrase module titles, no pipe and no verb (`Tenancy & Identity`, `Bugs & Defect Heatmap`).

## Pre-flight voice & format gate

Run this checklist in working memory right before any `[ISSUE_TRACKER_TOOL]` create or edit that touches `summary`, `description`, `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, `{{jira.business_rules_specification}}` or `{{jira.workflow}}`. A draft that fails an item gets fixed before the write, because publishing and patching afterwards leaves a bad version in the issue history. The rules behind each item are in `compact_rules`.

- [ ] Persona (I19): the `As a` clause names a real entity, not "the user" or "the system". A miss is a `gap`.
- [ ] Voice (I15): no endpoint paths, status codes (`201`, `422`, `403`), table or column names, error-code identifiers (`VALIDATION_ERROR`), framework or library names (`Zod`, `Supabase`, `Next.js`), locking patterns or internal algorithms in AC, Scope, Out of Scope or Workflow (API-consumer personas excepted).
- [ ] AC format (I17): every Gherkin scenario sits in a fenced `gherkin` block, and existing unfenced AC is rewritten in full.
- [ ] ADF structure: where a field's content is naturally parallel data, an option comparison, a hierarchy or a rule-to-boundary grid, structure it per `../acli/references/adf-authoring-style.md` (tables, nested lists, panels) instead of flat prose. The structure has a purpose or it is left out, and the field's own format wins: AC stays fenced Gherkin.
- [ ] Effort fields (I16): the three effort fields are left empty.
- [ ] No duplication (I3): the description has no `## Acceptance Criteria`, `## Scope` or `## Out of Scope` section.
- [ ] Source spec (I2): a story that maps to a single FR starts its description with `**Source spec:** FR-XXX`. With no clean FR, omit the line rather than invent one or write `N/A`.
- [ ] Summary (I2, I20): `{Feature} | {Action}`, no FR or issue-key prefix (the issue key is the only identifier that belongs with the summary), no persona, no benefit.
- [ ] No invention (I5): every AC, Scope item, Out-of-Scope item and business rule traces to a source (PRD, SRS, business map, explicit user input).
- [ ] Glossary (I21): every domain term matches `.context/business/domain-glossary.md` and no anti-glossary term appears. A missing term is a `gap`.

After the write, before the next field or story:

- [ ] AC render (I17): the Jira UI shows the AC field as a monospace block with Gherkin highlighting. Open the issue; when running with nobody present, read the field back and check for the fence.
- [ ] Link direction (I8): after any link created in this step, run the direction check in `references/dependency-linking.md` §Procedure step 6 before calling the operation done.

## Main workflows

### A. Initial backlog seeding (one-time, from a PRD)

With a fresh PRD/SRS and no issues in Jira, create the initial backlog tree (epics and their foundational stories) in Jira, then materialize the local read-only cache under `.context/PBI/` with the sync script. Read `references/product-backlog-seed.md`.

Output: epics and foundational stories under `{{PROJECT_KEY}}`, then `bun run jira:sync-issues pull` writes `.context/PBI/epic-tree.md` and the canonical `.context/PBI/epics/EPIC-<KEY>-<slug>/` tree (epic plus a folder per story). The local `.md` is a read-only cache and is never hand-written. Memory topic keys: `pbi/{epic-slug}/epic` per epic, `pbi/{ticket}/spec` per story (`agentic-dev-core/references/topic-key-conventions.md`).

### B. Incremental feature addition (continuous)

A new feature appears mid-flight (a PO ask, a market opportunity, post-MVP work, customer feedback). The reference first analyzes complexity (single story, full epic or multi-epic) and routes from there. Read `references/add-feature.md`.

Open questions that decide the feature's scope go to an interview. Call the Skill tool with "grilling" and give it the questions. Where it is not installed, ask the same questions as a numbered list, each with your recommended answer, and say the interview method was missing. With nobody present, follow grilling's own "With nobody at the keyboard" lines and write each question with its answer into the story's `## Open questions` comment and the run report. When the conversation has already settled the decisions, record them in the epic description without interviewing again (the spec step in `add-feature.md`).

Output: a new epic or stories appended to the backlog, with the complexity decision documented.

### C. Epic creation (from scratch or from workflow B)

Structure a new epic: naming, scope boundaries, decomposition into stories, traceability back to the PRD goals. Read `references/epic-creation.md`. Draft the stories as tracer bullets and quiz the PM on them before anything is created in Jira (Step 0 there). Nobody present means the quiz runs against yourself, with the questions and your answers written as assumptions in the run report and the epic description.

Output: the epic and its child stories under `{{PROJECT_KEY}}`, then `bun run jira:sync-issues pull --epic <KEY>` writes `.context/PBI/epics/EPIC-<KEY>-<slug>/epic.md` and the child story folders as a read-only cache. Memory topic key `pbi/{epic-slug}/epic` (UPSERT; see `topic-key-conventions.md`).

### D. Story refinement (per story)

A story exists in Jira but is not yet ready for development. Validate INVEST, optionally run a 3-amigos session, check the slicing and confirm the ready-for-development checklist. Read `references/story-refinement.md`.

Open questions that decide the story's scope go through the "grilling" skill the way workflow B describes, with the same fallback and the same nobody-present path.

Output: a refined story with INVEST validated, optional 3-amigos notes appended and the checklist confirmed.

### E. AC quality refinement (per story)

A story has rough acceptance criteria (vague conditions, missing data, no error scenarios, no boundaries) and they need to become concrete Gherkin scenarios. Read `references/acceptance-criteria.md`.

Output: AC in Gherkin with concrete data, error scenarios and boundary scenarios. The scenarios go to `{{jira.acceptance_criteria}}` and unresolved questions go to a structured story comment (`## Open questions`). Re-sync with `bun run jira:sync-issues get <KEY> --include-comments` to read them back (`.agents/instructions/agent-local-context-pbi.md` §9: never hand-write a cache file). Memory topic key `pbi/{ticket}/spec`.

### F. Edge-case enumeration (per feature or epic)

Enumerate failure modes, boundary conditions, integration risks and unusual user paths while designing or refining a feature. The reference also holds the rule for what becomes AC and what stays a test-only concern. Read `references/edge-cases-enumeration.md`.

Output: a catalog of edge cases with criticality and a decision. High criticality with a clearly defined behaviour is promoted into AC as scenarios in `{{jira.acceptance_criteria}}`; the rest is test-only and goes to a structured comment (`## Edge cases (test-only)`) on the story or epic for the QA hand-off. Re-sync to read it back (`agent-local-context-pbi.md` §9). Memory topic key `pbi/{ticket}/edge-cases`.

### G. Sprint reporting (read-only snapshot)

The user wants a development-oriented view of the current sprint and backlog: epics, stories and PRs grouped by status (Blocked, In Progress, In Review, Ready For Dev, Backlog, Done) with metrics and alerts. It is read-only: it changes no Jira state, creates no issue and writes nothing to `.context/`. It gathers state from `[ISSUE_TRACKER_TOOL]` (and `gh` for PRs when useful) and renders a markdown report in the conversation. Read `references/sprint-report.md`.

Output: the inline report (epics, stories, PRs, status summary, per-epic progress, alerts), persisted only if the user asks.

### H. Sprint sequencing (topological execution order)

The user asks what to work on first, for the execution order, or for a sprint plan. Compute the Execution Sprints by topologically sorting the dependency-link graph across the epics and stories in scope. Read `references/sprint-sequencing.md`.

Output: `/project-context dev-roadmap` writes the sort to `.context/dev-roadmap.md` §4 (it also keeps the hand-authored backbone, edges and gates), and this workflow adds an inline summary table. The write is delegated; this workflow authors no file itself.

## Archive (A, B and C only)

When the workflow's verification checklist from `plan.md` passes, the orchestrator archives per `agentic-dev-core/references/session-management.md` §8. It moves `.session/product-management/<scope>/` to `.session/.archive/<YYYY-MM-DD>-product-management-<scope>/` and calls `mem_session_summary` with the archive path, so a later `mem_search` can find its way back. Workflows D to H write no `.session/` directory and have nothing to archive.

## With nobody at the keyboard

`/autonomous-delivery` in `discovery` mode dispatches this skill with no person on the line, and routines and workers can too. The rule is the one in `agentic-dev-core/references/decision-protocol.md`: search the record, follow what is settled, decide the technical calls yourself and write them down. Discovery creates within its cap and the operator vetoes afterwards, so none of the gates below adds a wait.

| Gate | A person is present | A supervised worker | A routine, or discovery mode |
|---|---|---|---|
| T4 skill question | ask once | the briefing's `Skills to load` answers | the delegating brief answers; otherwise inline |
| Phase 0 resume or restart | the user picks | the conductor picks | the brief picks; otherwise resume |
| Plan approval | the user approves | the conductor approves | the brief covers it; otherwise the plan stays `draft` and only reversible work runs |
| Overlap alert (I4), persona gap (I19), missing source (I5) | ask the user | ask the conductor | report the gap, skip that field, continue |
| Dependency matrix (I18) | confirm with the user | the conductor confirms | write the matrix in the report and create only the links the record already supports |
| Grilling and the epic quiz | the person answers | the conductor answers | assumptions go into the run report and the issue |

An epic too big to plan in one session needs a wayfinder map, and that needs people to resolve its decision tickets. A run with nobody present does not chart one: it records "needs a wayfinder map" as a gap in the run report and the escalation log and takes the next candidate.

## Specific tasks: which reference to read

| User intent                                                                                                                        | Read                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| "create initial backlog from PRD" / "seed the product backlog"                                                                     | `references/product-backlog-seed.md`   |
| "add new feature" / "incremental story creation"                                                                                   | `references/add-feature.md`            |
| "create epic" / "epic structure" / "epic vs feature flag"                                                                          | `references/epic-creation.md`          |
| "this epic is too big to plan" / "chart a map" / "wayfinder"                                                                       | `references/epic-creation.md`, "When the epic is too big to plan" |
| "refine this story" / "INVEST" / "ready for development" / "3 amigos" / "story slicing"                                            | `references/story-refinement.md`       |
| "refine AC" / "acceptance criteria quality" / "Gherkin scenarios" / "AC ambiguities"                                               | `references/acceptance-criteria.md`    |
| "enumerate edge cases" / "boundary scenarios" / "failure modes" / "what could go wrong"                                            | `references/edge-cases-enumeration.md` |
| "sprint report" / "sprint status" / "what is in the sprint" / "progress report" / "backlog dashboard"                              | `references/sprint-report.md`          |
| "what do we work on first?" / "execution order" / "sprint plan" / "topological order"                                              | `references/sprint-sequencing.md`      |

## Optional: Delta Specs Pattern

Projects with concurrent devs on the same feature, compliance or audit requirements, or capabilities that need an explicit history of behavioural change can opt into formal change tracking. Instead of editing acceptance criteria in place on each story, you keep:

- source-of-truth specs at `.context/specs/{capability}/{feature}.md`, the canonical, always-current behaviour (RFC 2119 plus Gherkin);
- a delta spec per change at `.context/specs/changes/{ticket}/spec.md`, with `## ADDED Requirements`, `## MODIFIED Requirements` and `## REMOVED Requirements` sections;
- an archive step that merges the delta back into the source of truth when the story closes and moves the change folder to `.context/specs/archive/YYYY-MM-DD-{ticket}/`.

All three live in the committed `.context/specs/` tree, never under the gitignored Jira cache `.context/PBI/` (`.agents/instructions/agent-local-context-pbi.md` §9).

`references/delta-specs.md` has the full pattern: when to adopt it, the requirement format, the copy-full-then-edit rule for MODIFIED requirements, the archive protocol and migration. The default stays in-place AC editing, which has lower overhead and fits solo developers and small teams. Adopt delta specs only when one of the conditions in that reference actually holds, because the overhead is real.

## Hand-offs

When the PM artifacts are ready, the next skills are:

- per-story implementation: `/sprint-development` (planning, code, review, deploy);
- TDD on a single function: `/unit-testing`, composable inside `/sprint-development`;
- formal QA test cases, exploratory testing, automation and regression: out of scope here, handled by a separate QA workflow.

## The invariants

I1 to I21 are the rules this skill holds on every Jira write. They live in the `compact_rules` frontmatter and nowhere else, so there is one copy to keep right. Other files cite them by code.

## Variables consumed

Standard `.agents/project.yaml` variables, resolved at runtime:

- `{{PROJECT_KEY}}`: the Jira project key (for example `MYM`, `UPEX`).
- `{{ISSUE_TRACKER}}`: the issue tracker name (typically `Jira`).
- `{{ATLASSIAN_URL}}`: the workspace URL.

Every Jira-side identifier (custom field, status, link type) goes through slug indirection, with `.agents/jira-required.yaml` as the canonical slug catalog:

- `{{jira.<slug>}}`: custom-field IDs resolved through `.agents/jira-required.yaml` and `.agents/jira-fields.json`. Examples: `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, `{{jira.business_rules_specification}}`, `{{jira.workflow}}`, `{{jira.weblink}}`, `{{jira.mockup}}`.
- `{{jira.statuses.<slug>}}`: default statuses for new items. Examples: `{{jira.statuses.epic_default}}` (default literal `Planning`), `{{jira.statuses.story_default}}` (default literal `Shift-Left QA`).
- `{{jira.link_types.<slug>}}`: link-type names resolved through `.agents/jira-link-types.json`, with the sub-fields `.outward`, `.inward` and `.fallback`. Examples: `{{jira.link_types.dependencies}}`, `{{jira.link_types.dependencies.outward}}` (`depends on`), `{{jira.link_types.dependencies.inward}}` (`is dependency for`), `{{jira.link_types.dependencies.fallback}}` (`relates`).

When these are unset the agentic layer is not installed: `bunx create-agentic-dev@latest <name>` for a new project, or `bunx create-agentic-dev@latest --adopt` then `/project-adoption` for an existing app (`agentic-dev-core`, Install model).

## Notes

- Refinement is continuous, not a one-time gate. Invoke the skill again whenever AC questions come up, edge cases surface during design, or a story is found to break INVEST mid-sprint.
- The 3-amigos protocol is optional. It pays off for stories with `High` AI Effort, integration-heavy stories and anything touching unfamiliar parts of the system.
- Edge cases that do not reach AC are not lost: they live in QA test cases, which are out of scope here.
- For parallel research tasks (competitive analysis on a feature, prior-art review, persona impact study), dispatch with the briefing template at `.agents/skills/agentic-dev-core/references/briefing-template.md`.
