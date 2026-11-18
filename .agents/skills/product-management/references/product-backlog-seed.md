# Product backlog seed: the initial backlog from the PRD and SRS

This is the first-touch workflow for a project. It turns a fresh PRD and SRS (written by `/project-foundation`) into the initial backlog tree in the issue tracker: the MVP split into epics, each epic split into INVEST-validated foundational stories. Everything is created in Jira, one epic at a time. Then `bun run jira:sync-issues` materializes the read-only cache under `.context/PBI/`, and the closing artifact is a dependency graph with an execution-sprint sequence.

Use it when the user asks to seed the backlog, create the initial PBI tree or bootstrap the epics from the PRD. It assumes no epics or stories exist yet.

It does not apply to an existing app without a PRD. Such an app has business maps as its product docs (`../SKILL.md`, "Product docs: PRD/SRS or business maps"), there is no MVP to seed, and its backlog grows through add-feature and epic-creation. Never write a PRD just to run this workflow.

The local files are a cache, not a place to write. `epic.md`, `story.md`, `epic-tree.md` and every per-field file mirror Jira and are never hand-written (`.agents/instructions/agent-local-context-pbi.md` §9; `references/jira-operations.md`, "No local authoring"; `agentic-dev-core/references/acli-integration.md` D9). Author the content in Jira (in the field, or in a `fallback:` comment per `.agents/jira-required.yaml`), then sync.

---

## Inputs to read first

Read each input before drafting any backlog content, in this order. Skip an optional input that is not on disk. Stop only when a required input is missing, and say which one.

1. `.agents/project.yaml`: project identity, env URLs, project key, MCP names. Required.
2. `.agents/jira-required.yaml`: the slug catalog (fields, statuses, link types). Required.
3. `.agents/jira-fields.json`: slug to numeric custom-field id for the live workspace. Required.
4. `.agents/jira-workflows.json`: workflow and transition catalog. Required.
5. `.agents/jira-link-types.json`: slug to workspace link type. Optional; without it, degrade as `dependency-linking.md` describes.
6. `.context/master-implementation-plan.md`: the Master Sprint roadmap. Optional; when present it tags each epic with its Master Sprint.
7. `.context/PRD/mvp-scope.md`: what is in and out of the MVP. Required; it sets the epic boundaries.
8. `.context/PRD/user-personas.md`: the actor model. Required; it supplies the "As a <persona>" voice.
9. `.context/PRD/user-journeys.md`: flow-level expectations. Required; it supplies the foundational stories per epic.
10. `.context/SRS/functional-specs.md`: the FR catalog. Required; it supplies the `**Source spec:**` references.
11. `.context/SRS/non-functional-specs.md`: performance, security and accessibility NFRs. Optional; it informs the business-rules content.
12. `bun run context:map business-data-context`: the entity graph. Optional; it shows cross-epic entity dependencies.
13. `bun run context:map business-feature-context`: the CRUD matrix. Optional.
14. `bun run context:map business-api-context`: the endpoint catalog (auth model, journey breakdown). Optional.
15. `.context/PBI/epic-tree.md`: the current backlog. Optional as input and mandatory as output; at seed time it is usually absent and the workflow creates it.

Inputs 11 to 14 come from mature projects. The business maps in particular arrive after `/project-context` modes `data`, `features` and `api` have run. Continue without them, and name their absence in the planning narrative so the user can decide whether to defer the seed until they exist.

---

## Custom field resolution

Custom-field ids differ per workspace (`customfield_10201` in one tenant, `customfield_10141` in another). This skill is workspace-agnostic, so every field is resolved by slug at runtime against `.agents/jira-required.yaml` and the synced `.agents/jira-fields.json`, and numeric ids never appear in the skill content.

The slugs this workflow writes:

- `{{jira.acceptance_criteria}}`: Gherkin scenarios (Given, When, Then), each wrapped in a ` ```gherkin ` fenced code block (anti-pattern `I17`). Persona-observable language only: no endpoint paths, HTTP status codes, table names or framework names (anti-pattern `I15`).
- `{{jira.business_rules_specification}}`: domain rules and validations (boundaries, role gates, retry semantics, audit guarantees), not internal algorithms or implementation patterns (anti-pattern `I15`).
- `{{jira.scope}}`: in-scope bullets only, written as capabilities the persona gains, not endpoints, tables or services (anti-pattern `I15`).
- `{{jira.out_of_scope}}`: explicit exclusions, complementary to `scope`. Deferred capabilities, not deferred endpoints.
- `{{jira.mockup}}`: design references (Figma URLs and the like).
- `{{jira.workflow}}`: the narrative of a non-trivial flow from the persona's point of view, not a code walkthrough (anti-pattern `I15`).
- `{{jira.weblink}}`: the app URL for the story, only when it is known with certainty.
- `{{jira.ai_effort}}`: the PO never sets it. QA sets it in shift-left (Low, Medium or High). `High` only warns the dev, and the PO may propose a split (optional, never a gate). See anti-pattern `I16`.

Field reads and writes go through `[ISSUE_TRACKER_TOOL]`, and the owning tool skill resolves the slug to the numeric id before the call. `references/jira-operations.md` has the routing table.

---

## Summary nomenclature

A story summary is `{Feature} | {Action}`, as defined in the "Story title format" section of `SKILL.md` (anti-pattern I20). The `As a … I want to … so that …` sentence is never the summary. It lives only in the `## User story` section of the description. `{Feature}` is the abbreviated feature noun, shared by sibling stories of the same feature. `{Action}` is the `I want to …` clause as a base-form verb phrase, with persona and benefit dropped. When a feature names a product domain entity that collides with agile or QA vocabulary, prefix it with the project-domain tag `TMS-` (`User Story` becomes `TMS-US`, `Module` becomes `TMS-Module`, `Test` becomes `TMS-Test`). Cross-cutting features stay plain (`Authentication`, `Jira Import`). Summaries are in English and about 80 characters at most.

Never prefix a story summary with `FR-XXX —`. The Jira issue key is the only identifier that belongs in a summary, and the functional-spec reference is methodology metadata that lives in the body, as the first line of the story description:

```
**Source spec:** FR-XXX
```

A story that does not map to a single FR (cross-cutting, infra, technical debt) omits the line, and the workflow never invents an FR identifier. Epic summaries follow the same rule: no `FR-` or `EPIC-` prefix, and identifiers come from the issue key.

---

## No content duplication

The description body and the dedicated custom fields hold disjoint content. Acceptance criteria, scope and out-of-scope live only in their custom fields (`{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`) and never appear as H2 or H3 sections in the description.

The canonical description body has these sections, in order:

1. `**Source spec:** FR-XXX` (first line, optional).
2. `## User story`: the As / I want / So that narrative.
3. `## Business rules`: overflow only, for content that does not fit in `{{jira.business_rules_specification}}`.
4. `## Workflow`: overflow only, for content that does not fit in `{{jira.workflow}}`.
5. `## Definition of done`: the closing checklist.
6. Optional blocks: `Mockup`, `Technical notes`.

The rationale and the audit procedure are in `references/description-custom-field-dedup.md`.

---

## Rich-text gotchas

Every step that writes a Jira rich-text field (description, `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, `{{jira.business_rules_specification}}`, `{{jira.workflow}}`) can hit the ADF-conversion bugs in `references/jira-publishing-gotchas.md`. Read it once before the first write, and apply it in every step below that publishes rich text.

---

## Workflow overview

The seed runs one epic at a time, which keeps token use bounded and the context tight. Jira is written first, and the read-only cache follows.

1. Phase 0: confirm the project key from `.agents/project.yaml`.
2. Phase 1: draft the full epic tree. It is a planning artifact, with no writes.
3. Phase 2: for each epic, repeat:
   - 2.1 create the epic via `[ISSUE_TRACKER_TOOL]` and capture the real issue key;
   - 2.2 transition the epic to its default status (`{{jira.statuses.epic_default}}`, fallback `Planning`);
   - 2.3 create the child stories via `[ISSUE_TRACKER_TOOL]`, INVEST-validated and slug-populated, linked to the epic;
   - 2.4 transition each story to its default status (`{{jira.statuses.story_default}}`, fallback `Shift-Left QA`);
   - 2.5 materialize the epic and its stories into the read-only cache: `bun run jira:sync-issues pull --epic {PROJECT_KEY}-{ISSUE_NUM}`;
   - 2.6 check the epic's stories for overlapping scope.
4. Phase 3: with all epics and stories in place, link the dependencies in Jira, then re-sync.
5. Phase 4: derive the execution-sprint sequence from the dependency graph.

The phases describe what each operation does. The owning tool skill (`/acli` first, MCP as fallback, REST as a last resort, per `references/jira-operations.md`) owns the exact command syntax.

---

## Folder naming in the synced cache

The cache under `.context/PBI/` (materialized by `bun run jira:sync-issues`) uses the real Jira keys assigned at creation. A folder name has four parts:

1. A fixed prefix, `EPIC-` or `STORY-`.
2. `{PROJECT_KEY}` from `.agents/project.yaml` (for example `MYM`, `SHOP`, `BLOG`): uppercase, 2 to 5 characters, no spaces.
3. `{ISSUE_NUM}`, the sequential number Jira returns on create. Neither the AI nor the user controls it, and it has no leading zeros.
4. `{kebab-descriptor}`: two to four words in kebab-case, taken from the PRD/SRS vocabulary.

Epic folders are `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{kebab-descriptor}/`. Story folders are `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{kebab-descriptor}/`, placed under the parent epic's `stories/` directory.

Descriptors are lowercase and hyphen-separated, with no snake_case, CamelCase, spaces or special characters beyond hyphens. IDs never carry leading zeros (`MYM-2`, never `MYM-002`). Long titles belong in the issue summary, not in the folder name.

---

## Phase 0: confirm the project key

This phase locks the Jira project key for the session so every later operation and folder name uses the same identifier. Load it once from `.agents/project.yaml` and keep it for the session.

If the key is missing or malformed, stop and tell the user to fix the manifest. Never guess a key. The check is on format only: 2 to 5 uppercase letters, with no spaces, hyphens or special characters. Whether the key matches the workspace is for `[ISSUE_TRACKER_TOOL]` to find out.

---

## Phase 1: draft the epic tree (planning only, no writes)

The goal is a complete high-level tree of every epic and its foundational stories before anything is written to Jira. The user can then spot scope drift, missing epics or over-decomposed stories before real ticket numbers exist.

This draft is transient. It is not the canonical `.context/PBI/epic-tree.md`, which mirrors Jira and only appears when `bun run jira:sync-issues pull` runs after the epics and stories exist (Phase 3 and the close). Keep the draft in working memory or a scratch note, and do not persist it as `epic-tree.md`. Nothing is written to Jira in this phase.

It draws on inputs 7 to 10 above (MVP scope, personas, journeys, functional specs). It has no Jira keys yet, only placeholders, and mirrors what the synced tree will carry:

```markdown
# Product Backlog — Epic Tree

## Overview

- Total epics: [N]
- Total foundational stories: [N]
- Project key: {PROJECT_KEY from .agents/project.yaml}
- Jira project URL: [from .agents/project.yaml]
- Source PRD: .context/PRD/mvp-scope.md
- Source SRS: .context/SRS/functional-specs.md

---

## Epic hierarchy

### EPIC 1 — [Epic title]

- **Planned Jira key**: {PROJECT_KEY}-TBD
- **Priority**: CRITICAL | HIGH | MEDIUM | LOW
- **Master Sprint** (if known): [from .context/master-implementation-plan.md, else omit]
- **Description**: [1–2 lines]

**Foundational stories (estimated: N)**:

1. {PROJECT_KEY}-TBD — As a [persona], I want to [action], so that [benefit]
2. {PROJECT_KEY}-TBD — As a [persona], I want to [action], so that [benefit]
   ...

---

### EPIC 2 — [Epic title]

...

---

## Provisional sequencing

Phase 1 — Foundation (Master Sprint 1):

1. EPIC 1 — [name]
2. EPIC 2 — [name]

Phase 2 — Core features (Master Sprint 2):

...

---

## Next steps

1. Review this tree with the user — confirm epic count, story breakdown, sequencing.
2. On approval, proceed to Phase 2 per epic.
```

Review the tree with the user and proceed to Phase 2 on approval. With nobody to approve, see "With nobody at the keyboard" below.

---

## Phase 2: per-epic creation loop

Repeat 2.1 to 2.6 for every epic in the draft tree, in the sequencing order from Phase 1.

### 2.1 Create the epic in Jira

Create an Epic-type issue via `[ISSUE_TRACKER_TOOL]` (routing: `references/jira-operations.md`, operation "create issue"). The inputs are:

- Project: `{PROJECT_KEY}` from `.agents/project.yaml`.
- Issue type: `Epic`.
- Summary: the epic title, with no `FR-` or `EPIC-` prefix (the key is the identifier).
- Description: two or three paragraphs on scope, business value and where the epic sits in the Master Sprint roadmap (when `master-implementation-plan.md` is present).
- Priority: `High | Medium | Low`.
- Labels: `mvp`, plus any project-specific labels.

The description is an ADF rich-text field, so apply `references/jira-publishing-gotchas.md` (no `code` marks inside `**bold**`, and one update call per ADF field on existing issues). Capture the real issue key the create call returns (for example `MYM-13`) and keep it in working memory for the next steps.

### 2.2 Transition the epic to its default status

Transition the new epic via `[ISSUE_TRACKER_TOOL]` (routing: `references/jira-operations.md`, operation "transition status") to `{{jira.statuses.epic_default}}`. If the slug is unset in `.agents/jira-required.yaml`, use `Planning`.

Jira's landing status is rarely the operational starting one, and moving the epic right away puts it in the team's real planning column. If the target status does not exist in the workspace's epic workflow, report the gap, leave the epic where it landed, and continue. Never invent a status name.

### 2.3 Create the foundational stories in Jira

Repeat for every story the draft lists under this epic. Create a Story-type issue via `[ISSUE_TRACKER_TOOL]`, linked to the parent epic by epic link (routing: `references/jira-operations.md`, operation "create issue").

Validate each story against INVEST before creating it:

| Criterion       | Question                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| **I**ndependent | Can this story complete without depending on others?                                  |
| **N**egotiable  | Is there flexibility in the implementation?                                           |
| **V**aluable    | Does the "so that" clause carry clear user or business value?                         |
| **E**stimable   | Can QA tell Low, Medium or High from the story as written?                            |
| **S**mall       | AI Effort `High`? Optionally propose a split before creating (a warning, not a gate). |
| **T**estable    | Are the acceptance criteria observable and verifiable?                                |

A story that fails a criterion is split or rewritten before it is created. Never push an INVEST-failing story to Jira to keep the count up.

The inputs to the create call are:

- Project: `{PROJECT_KEY}`.
- Issue type: `Story`.
- Summary: `{Feature} | {Action}` (see "Summary nomenclature"). Never an `FR-XXX —` prefix, never an `As a … so that …` sentence.
- Description body: the `**Source spec:** FR-XXX` line first (if applicable), then a `## User story` section with the full `As a … I want to … so that …` sentence, then the canonical sections from "No content duplication". No AC, Scope or Out-of-Scope H2 sections.
- Epic Link: the parent epic's real key from 2.1.
- Priority: `High | Medium | Low`.
- Labels: `mvp`, plus project-specific ones.
- Custom fields, slug-resolved at the tool layer:
  - `{{jira.acceptance_criteria}}`: at least three Gherkin scenarios (one happy path, two edge or error cases), each in a ` ```gherkin ` fenced code block (anti-pattern `I17`). Persona-observable language only, with no endpoint paths, HTTP status codes, table names or framework names (anti-pattern `I15`).
  - `{{jira.scope}}`: in-scope bullets only, as capabilities the persona gains, not endpoints, DB tables or services (anti-pattern `I15`).
  - `{{jira.out_of_scope}}`: explicit exclusions, also in persona-capability voice.
  - `{{jira.ai_effort}}`: the PO never sets it. QA sets it in shift-left (Low, Medium or High); `High` only warns the dev, and the PO may propose a split (optional, never a gate). See anti-pattern `I16`.
  - `{{jira.business_rules_specification}}`: optional. Domain rules (boundaries, role gates, retry semantics, audit guarantees), not internal algorithms.
  - `{{jira.mockup}}`: optional.
  - `{{jira.workflow}}`: optional. It narrates the persona's flow, not the code's.
  - `{{jira.weblink}}`: only when the app URL is known with certainty (from `.agents/project.yaml` or explicit user input). When in doubt, leave it empty.

Every custom field above is ADF rich text except `{{jira.weblink}}` (a URL string). Apply `references/jira-publishing-gotchas.md`, and split the update into one call per ADF field if your tool layer requires it.

AC, Scope, Out-of-Scope and Business Rules must come from observable evidence: the PRD, SRS, business maps, user journeys or explicit user input. When a field has no source, note the gap in working memory and leave the slug empty rather than invent content.

Capture every story's real issue key, in creation order. The epic's synced `epic.md` child-story list (materialized in 2.5) shows these keys once the stories are linked to the epic in Jira, so it is never typed by hand.

### 2.4 Transition each story to its default status

For every story created in 2.3, transition it via `[ISSUE_TRACKER_TOOL]` (routing: `references/jira-operations.md`, operation "transition status") to `{{jira.statuses.story_default}}`. If the slug is unset, use `Shift-Left QA`.

A story that lands in the workflow's first column hides that it is pre-refinement work for the team to triage, so moving it states that intent. If the target does not exist, report the gap, leave the story where it landed, and continue.

### 2.5 Materialize the epic and story cache

The epic and every story already live in Jira (2.1 and 2.3). One sync pass creates the canonical folders, `epic.md`, every `story.md`, and one Markdown file per non-empty rich-text custom field (`acceptance-criteria.md`, `scope.md`, `out-of-scope.md`, `business-rules.md`, `workflow.md`, `mockup.md`, …). Never create those folders or files by hand (`.agents/instructions/agent-local-context-pbi.md` §9; `agentic-dev-core/references/acli-integration.md` D9).

```
bun run jira:sync-issues pull --epic {PROJECT_KEY}-{ISSUE_NUM}
```

`{ISSUE_NUM}` is the epic key captured in 2.1. The sync produces this layout:

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{kebab-descriptor}/
├── epic.md (+ feature-implementation-plan.md, feature-test-plan.md when populated)
└── stories/
    ├── STORY-{PROJECT_KEY}-{NUM}-{kebab-descriptor}/story.md (+ acceptance-criteria.md, scope.md, out-of-scope.md, …)
    └── ...
```

Then read back: open the synced `epic.md` and `story.md` files and confirm they match the Jira issues you created. The `epic.md` child-story list shows the real linked keys. When a story is missing or a field is wrong, fix it in Jira (correct the Epic Link or parent, or REST PUT the field per `references/jira-operations.md`) and re-run the sync. Never edit the local file. AC, Scope and Out-of-Scope are not in `epic.md` or `story.md`; they sync into their own per-field files from the Jira custom fields (cross-link: `references/description-custom-field-dedup.md`).

### 2.6 Cross-story scope overlap check

Two stories in the same epic that share a literal Scope bullet are badly sliced, and the overlap breaks INVEST-I (independence). Read each child story's `{{jira.scope}}` from the `scope.md` files materialized in 2.5 and compare the bullet lists pairwise. Do not use `acli view`: it returns null for custom fields (`agentic-dev-core/references/acli-integration.md` D8). Detailed reads go through `bun run jira:sync-issues`, per `references/jira-operations.md` (operation "read issue with custom fields").

For every bullet that is literally identical in two stories, report:

```
overlap_alert: <KEY-A> vs <KEY-B> on bullet "<text>"
```

Do not fix it automatically. Offer the user three ways to resolve each overlap:

1. Move: keep the bullet in one owning story and remove it from the other.
2. Extract: create a new shared-dependency story that owns the bullet, and link both original stories to it with `depends on`.
3. Accept: leave the duplicate when it is intentional shared context, and record why.

Wait for the user's decision on each overlap before continuing, and never dedupe silently, because the overlap is a signal that the slicing should be revisited. With nobody to decide, see "With nobody at the keyboard".

---

## Phase 3: link dependencies in Jira

This phase starts when every epic and foundational story from Phase 2 exists in Jira with a real key and is in the synced cache. It publishes the `Blocked by`, `Blocks` and `Related` dependencies as real Jira issue links, so the dependency graph is queryable and sprint sequencing has live data. The dependencies come from the active discovery pass below, which draws on PRD/SRS sequencing, the master plan, the data map (`business-data-context`) and explicit author intent. Once the links exist, a re-sync materializes each story's `## Dependencies` block as read-only cache, never hand-authored.

### Phase 3.0: active dependency discovery (mandatory, before any link write)

Anti-pattern `I18` in `SKILL.md` requires an active discovery pass before any link is created. Linking only what looks obviously needed is not enough. Run it once, before the link-creation loop:

1. Refresh the full backlog tree with `bun run jira:sync-issues pull`, then read the materialized `.context/PBI/epic-tree.md` (the live Jira backlog graph) next to the Phase 1 draft.
2. Read the data map (`bun run context:map business-data-context`) when it is generated (a placeholder notice means there is no map). It holds the entity foreign-key graph.
3. For every epic and story created in Phase 2, query its current Jira link graph via `[ISSUE_TRACKER_TOOL]`, so the pass sees links that already exist.
4. Build a candidate matrix of `(from, to, link_type_slug, source-of-decision)`, where the source is one of `prd-sequencing`, `srs-sequencing`, `master-implementation-plan`, `business-data-context` or `author-intent`.
5. Filter the noise. Drop any candidate whose only justification is a global or infrastructural prerequisite (auth exists, the DB exists, the framework is wired up, observability is set up), because those describe the project as a whole, not one story over another. Keep only feature-level, observable, explicit dependencies between specific work items.
6. Apply the heuristic: if reordering the sprints would make the dependency disappear, it is global noise, so drop it. If it would not, it is a real feature-level dependency, so keep it.
7. Show the filtered matrix to the user and wait for confirmation before writing any link. Never create links automatically. With nobody to confirm, see "With nobody at the keyboard".

### Creating the links

For each confirmed dependency, create an issue link via `[ISSUE_TRACKER_TOOL]` using the slug-resolved link type: `{{jira.link_types.dependencies}}` for hard ordering, `{{jira.link_types.blocks}}` (interchangeable with it, per the catalog), and `{{jira.link_types.relates}}` for informational ties only. Routing is in `references/jira-operations.md` (operation "create link"), and the full procedure and directionality table are in `references/dependency-linking.md`, which also holds the full list of hard rules. The ones that matter here:

- Never invent dependencies. The sources are PRD/SRS sequencing, the master-implementation-plan Master Sprints, the data map's entity relationships and explicit author intent from this session (which become Jira issue links here and sync back into each story's `## Dependencies` block on the next pull). When a dependency is not observable from these inputs, ask the user or skip it.
- Never use the symmetric fallback (`Relates`) for an ordering-sensitive dependency. A symmetric link loses direction, and the topological sort in Phase 4 collapses.
- If `{{jira.link_types.dependencies}}` resolves to its fallback (degraded to `Relates`), tell the user about the degradation before going on.

After linking, show the user a dependency matrix (`from → to → type → source of decision`) to review before sprint sequencing runs. Then re-sync with `bun run jira:sync-issues pull` so each story's `## Dependencies` block reflects the live links. Never hand-append links to a `story.md`.

---

## Phase 4: sprint sequencing (closing artifact)

This phase starts when Phase 3 is complete and every dependency link is published in Jira. It derives an execution-sprint plan (a topological sort of the dependency graph) that answers "which stories can start in parallel?". The plan is an input to the human sprint-planning meeting, never a commitment, and it should be presented that way.

Run Kahn's algorithm over the `dependencies` and `blocks` link graph, as `references/sprint-sequencing.md` describes. Link arrays at scale are read from the cache that `bun run jira:sync-issues pull` materializes (`references/jira-operations.md`, operation "read issues with custom fields (batch)").

Persistence is delegated: invoke `/project-context dev-roadmap` to write the sort to `.context/dev-roadmap.md` §4. That mode keeps the hand-authored backbone, edges and gates (§2, §3, §5, §6) and overwrites §4 on every re-run, because the sort is derived from the live graph and never appended. This phase does not author the file itself.

The hard rules (full list in `references/sprint-sequencing.md`):

- Only `{{jira.link_types.dependencies}}` and `{{jira.link_types.blocks}}` feed the sort. `Relates` is informational and skipped.
- A cycle halts the algorithm and is reported as a methodology bug to fix before sequencing can finish. Never truncate the graph silently.

Phase 4 runs once at the end of the seed, after Phase 3, and again on demand whenever the graph changes (new stories, new links).

---

## With nobody at the keyboard

The confirmation points in this workflow are the Phase 1 tree review, each overlap decision in 2.6, and the Phase 3.0 matrix before links are written. The decision protocol (`agentic-dev-core/references/decision-protocol.md`) says who holds each one.

- A person is present: ask them, as described above.
- A supervised worker: the conductor or launcher holds the gate. Report the draft, the overlap alerts or the matrix to it, and wait for its answer.
- A routine with nobody: the delegating brief is the approval when it covers the decision. When it does not, do the reversible work (the Phase 1 draft, the overlap report, the candidate matrix), stop before any write to Jira, and report what is waiting. In `/autonomous-delivery` discovery mode the dispatch is that brief: create within `discovery_definitions`, record the assumptions, and leave the veto to the operator (`../SKILL.md`, "With nobody at the keyboard").

---

## Closing checklist

When the seed completes, check that:

- [ ] Every epic in the tree exists in Jira with a real key, in `{{jira.statuses.epic_default}}` (or the fallback).
- [ ] Every foundational story exists in Jira with a real key, in `{{jira.statuses.story_default}}` (or the fallback), with AC, Scope and Out-of-Scope populated and INVEST validated.
- [ ] Voice gate: every AC, Scope bullet, Out-of-Scope bullet and Workflow narrative is in persona-observable language, with no endpoint paths, HTTP status codes, DB table or column names, framework names or internal algorithms (anti-pattern `I15`). The API-consumer persona is the exception.
- [ ] Gherkin fence: every scenario in `{{jira.acceptance_criteria}}` is in a ` ```gherkin ` fenced code block (anti-pattern `I17`).
- [ ] Persona grounding: every `As a` line names a persona that exists in `.context/PRD/user-personas.md` (anti-pattern `I19`).
- [ ] Effort fields: `{{jira.ai_effort}}`, `{{jira.development_token_usage}}` and `{{jira.quality_token_usage}}` are empty, because QA and the agents fill them (anti-pattern `I16`).
- [ ] Active dependency discovery ran: Phase 3.0 produced a candidate matrix, global noise was filtered out, and the user confirmed before any link was written (anti-pattern `I18`).
- [ ] Every synced folder maps 1:1 to a real Jira key, and no `TBD` placeholder survives (they exist only in the Phase 1 draft).
- [ ] The scope overlap check ran for every epic, and every overlap was resolved by a user decision.
- [ ] Every `Blocked by` and `Blocks` dependency is a published Jira link, and a final `bun run jira:sync-issues pull` materialized it into the cache.
- [ ] `.context/dev-roadmap.md` §4 exists and reflects the current dependency graph (written in Phase 4 via `/project-context dev-roadmap`; it is not a Jira mirror).
- [ ] `.context/PBI/epic-tree.md` was regenerated by `bun run jira:sync-issues pull` and reflects the live backlog.

---

## Output artifact summary

```
.context/
├── dev-roadmap.md                                  [Phase 4 — written via /project-context dev-roadmap (§4 regenerated, §2/§3/§5/§6 hand-authored)]
└── PBI/
    ├── epic-tree.md                                [SYNC — bun run jira:sync-issues pull]
    └── epics/
        ├── EPIC-{PROJECT_KEY}-{NUM}-{descriptor}/
        │   ├── epic.md                             [SYNC — Phase 2.5]
        │   │   (+ acceptance-criteria.md, scope.md, out-of-scope.md, … per-field [SYNC])
        │   └── stories/
        │       ├── STORY-{PROJECT_KEY}-{NUM}-{descriptor}/
        │       │   └── story.md                    [SYNC — Phase 2.5]
        │       │       (+ acceptance-criteria.md, scope.md, out-of-scope.md, … [SYNC])
        │       └── ...
        └── ...
```

Every file marked `[SYNC]` is a Jira-mirrored read-only cache. `bun run jira:sync-issues` materializes it and overwrites it on each pull, and it is never hand-edited (`agentic-dev-core/references/acli-integration.md` D9). `.context/dev-roadmap.md` is not a Jira mirror: Phase 4 invokes `/project-context dev-roadmap`, which derives §4 from the live graph and leaves §2, §3, §5 and §6 hand-authored.

Later workflows create these, not the seed:

- `acceptance-criteria.md`: refined ACs per story, via `references/acceptance-criteria.md`.
- `edge-cases-enumeration.md`: edge cases per epic or story.
- `implementation-plan.md`: created during sprint development.

---

## Restrictions

- No hardcoded numeric custom-field ids, statuses or link types: all are slug-resolved.
- No literal tool commands (`acli ...`, MCP namespaces, `curl /rest/api/3/...`) in skill content. This is methodology, and the HOW lives in the owning tool skill.
- No SQL hardcoded in `story.md` or `epic.md`. Defer to the database tool layer.
- No `Wave` terminology: use `Sprint` (or `Master Sprint` and `Execution Sprint` when the difference matters).

The other rules (kebab-case folders with real Jira keys, AC, Scope and Out-of-Scope only in custom fields, the source-spec line as the first body line and never a summary prefix, dependencies only from observable inputs) are stated where they apply above.

---

## Prerequisites

Required:

- `.agents/project.yaml` populated with project identity and env URLs.
- `.agents/jira-required.yaml` declares the slugs this workflow writes.
- `.agents/jira-fields.json` synced against the live workspace (`bun run jira:sync-fields`).
- `.agents/jira-workflows.json` synced.
- `.context/PRD/mvp-scope.md`, `.context/PRD/user-personas.md` and `.context/PRD/user-journeys.md`, produced by `/project-foundation`.
- `.context/SRS/functional-specs.md`, produced by `/project-foundation`.
- `[ISSUE_TRACKER_TOOL]` available and authenticated (see `references/jira-operations.md`).

Optional, and the workflow degrades gracefully without them:

- `.agents/jira-link-types.json`: falls back per `references/dependency-linking.md`.
- `.context/master-implementation-plan.md`: Master Sprint tags are omitted on epics when absent.
- The data map (`bun run context:map business-data-context`) and the sibling business maps: when they are placeholders, cross-epic entity dependencies are inferred from the PRD and SRS only.

The output is Jira issues and links published live, the `.context/PBI/` read-only cache materialized by `bun run jira:sync-issues`, and `.context/dev-roadmap.md` written via `/project-context dev-roadmap` (§4 regenerated, §2/§3/§5/§6 hand-authored).
