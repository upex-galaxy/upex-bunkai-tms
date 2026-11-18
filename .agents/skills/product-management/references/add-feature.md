# Add a feature to an existing backlog

This workflow takes a new feature idea, sizes it against the backlog, and either creates a story (Level 1), creates an epic with its stories (Level 2), or stops and produces a split plan (Level 3). Jira comes first: every artifact is created in Jira, then the local `.context/PBI/` cache is materialized from it by the sync script.

You work as a Product Owner, Scrum Master and Solution Architect. The input is the feature description, plus whatever of the following the project has:

- The existing epic tree, `.context/PBI/epic-tree.md`.
- The PRD, `.context/PRD/mvp-scope.md`, for product context.
- The SRS, `.context/SRS/functional-specs.md`, for technical context.
- `PROJECT_KEY`, the Jira project code. Read it from `.agents/project.yaml`, and fall back to `epic-tree.md`. Never hardcode it.

When the run has nobody at the keyboard (an `autonomous-delivery` discovery run, a supervised worker, a routine), each step that would wait for a person has its path in "Autonomous runs" below. The rules for deciding in place of a person are in `agentic-dev-core/references/decision-protocol.md`.

---

## Inputs to read first

On a cold start, read these in order before proposing anything. Each adds a context layer, and skipping one raises the risk of invention.

1. `.agents/project.yaml`: project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml`: the canonical slug catalog (fields, statuses, link types).
3. `.agents/jira-fields.json`: slug to numeric custom-field ID, resolved at sync time.
4. `.agents/jira-workflows.json`: workflow and transition catalog (status names live here).
5. `.agents/jira-link-types.json`: slug to workspace link type, when present.
6. `.context/master-implementation-plan.md`: the Master Sprint roadmap (strategic sequencing).
7. `.context/PRD/mvp-scope.md`: what is in and out of the MVP.
8. `.context/PRD/user-personas.md`: the actor model.
9. `.context/PRD/user-journeys.md`: flow-level expectations.
10. `.context/SRS/functional-specs.md`: the FR catalog, the source of `**Source spec:**` references.
11. `.context/SRS/non-functional-specs.md`: performance, security and accessibility requirements.
12. `bun run context:map business-data-context`: the entity graph, the source of entity-level dependencies.
13. `bun run context:map business-feature-context`: the CRUD matrix by domain.
14. `bun run context:map business-api-context`: the endpoint catalog (auth model, journeys).
15. `.context/PBI/epic-tree.md`: current backlog state.

An existing app documented by its business maps has no PRD or SRS. Inputs 7 to 11 then have substitutes, listed in `../SKILL.md` under "Product docs: PRD/SRS or business maps". Write no PRD or SRS to fill them.

Some mature projects also produce business maps through `/project-context` modes `data`, `features` and `api`. When they are absent (typical at early seed time), proceed without them and flag the gap.

---

## Custom field resolution

Jira numeric IDs (`customfield_NNNNN`) differ per workspace, so none of them live in this skill. Each field is written as `{{jira.<slug>}}` and resolved at runtime against `.agents/jira-required.yaml`, with slug to ID mapping in `.agents/jira-fields.json` (filled by `bun run jira:sync-fields`). When a slug is missing from the workspace, the catalog declares the fallback and `bun run jira:check` warns.

The slugs this workflow writes:

- `{{jira.acceptance_criteria}}`: Given/When/Then scenarios. The single source of truth for AC.
- `{{jira.business_rules_specification}}`: story-specific business rules (validations, domain invariants).
- `{{jira.scope}}`: in-scope items only. Exclusions go to `out_of_scope`.
- `{{jira.out_of_scope}}`: explicit exclusions, complementary to `scope`, with no cross-pollination.
- `{{jira.mockup}}`: Figma URLs, wireframes, visual references.
- `{{jira.workflow}}`: the flow from the persona's point of view, not a code walkthrough (anti-pattern `I15`).
- `{{jira.weblink}}`: the app or feature URL. Fill it only when the domain is known with certainty (from the system prompt or explicit project context) or the user supplied the URL. When in doubt, leave it out.
- `{{jira.ai_effort}}`: the PO never sets it. QA sets it in shift-left (Low, Medium or High). `High` only warns the dev, and the PO may propose a split (optional, never a gate). See anti-pattern `I16`.

Every read and write against Jira is written as `[ISSUE_TRACKER_TOOL]` pseudo-code. The consuming skill resolves the tool through the `.agents/instructions/agent-tool-resolution.md` §6 table (primary `/acli`, fallback Atlassian MCP, last resort REST), so cite no tool syntax here. The operation to tool-layer matrix is in `references/jira-operations.md`, and the rich-text (ADF) publishing gotchas are in `references/jira-publishing-gotchas.md`.

---

## Summary nomenclature

A story summary has the form `{Feature} | {Action}` (the canonical "Story title format" in `SKILL.md`, anti-pattern `I20`). The `As a ... I want to ... so that ...` sentence is never the summary. It lives in the description's `## User story` section.

- `{Feature}` is the abbreviated feature noun, shared across sibling stories of the same feature.
- `{Action}` is the `I want to ...` clause as a base-form verb phrase, with persona and benefit dropped and the scenario qualifier kept.
- When a feature names a product domain entity that collides with agile or QA vocabulary, prefix it with the project-domain tag `TMS-` (`User Story` becomes `TMS-US`, `Module` becomes `TMS-Module`, `Defect` becomes `TMS-Defect`). Cross-cutting features stay plain.
- English, about 80 characters at most.

Never prefix a story or epic summary with the functional-spec reference (a pattern like `FR-XXX` followed by a dash and the title). The Jira key (`{PROJECT_KEY}-{NUM}`) is the only real identifier, and a methodology reference in the summary pollutes Jira search and breaks JQL summary filters.

The spec reference goes in the issue body as the first line, `**Source spec:** FR-XXX`. When the story does not map 1:1 to an FR, omit the line entirely. Do not write `N/A` or force an FR.

---

## No content duplication between description and custom fields

AC, Scope and Out-of-Scope live only in their slug-resolved custom fields. The description never carries `## Acceptance Criteria`, `## Scope` or `## Out of Scope` as H2 sections.

The description carries:

- `**Source spec:** FR-XXX` as the first line (optional).
- `## User story`, the As/I want/So that narrative.
- `## Business rules`, overflow only, when the content does not fit in `{{jira.business_rules_specification}}`.
- `## Workflow`, overflow only, when the content does not fit in `{{jira.workflow}}`.
- `## Definition of done`, the closing checklist.
- Optionally `## Mockups / Wireframes` and `## Technical notes`.

The full contract and the deduplication audit are in `references/description-custom-field-dedup.md`.

---

## Phase 1: complexity analysis

Classify the idea into one of three levels.

**Level 1, individual story.** Go to Phase 2A.

- It improves or extends existing functionality and clearly fits an existing epic.
- One user story is enough (QA's AI Effort in shift-left is expected to be Low or Medium, never High).
- It needs no significant architectural change.
- Examples: "Add a filter by [attribute] to the search of [main entity]" (existing search or discovery epic); "Allow canceling [business action] up to X hours in advance" (existing operations epic); "Add email notification when [business event] occurs" (existing notifications epic). Fill the bracketed terms from the project's PRD/SRS.

**Level 2, full epic.** Go to Phase 2B.

- It is a new feature that fits no existing epic and needs 3 to 8 stories.
- Its scope is well defined and bounded, it does not depend critically on other new epics, and it can be implemented independently.
- Examples: "Messaging system between [user-type-1] and [user-type-2]"; "Analytics dashboard for [user-type]"; "Certificate/badge system when [business event] completes". Fill the bracketed terms from the PRD/SRS.

**Level 3, multiple epics.** Go to Phase 2C. This level requires a plan before anything is created.

- It needs 2 or more epics, has complex inter-component dependencies, requires significant architectural change, and is broad (about 20+ stories) and highly complex technically or in business terms.
- Examples: "Full monthly subscription system with plans"; "Pre-recorded course marketplace with content creator"; "Gamification system with badges, rankings, and rewards".

Check the call before you commit to it:

1. How many user stories are needed? One is Level 1, 3 to 8 is Level 2, more than 8 needs a check for Level 3.
2. Does it fit an existing epic? Yes points to Level 1, no to Level 2 or above.
3. Does it change several system modules? Yes points to Level 2 or 3.
4. Can it be split into 2 or more independent epics? Yes means Level 3.
5. Is it technically simple or complex? Simple is Level 1 or 2, complex is Level 2 or 3.

Phase 1 output:

```markdown
## Complexity Analysis

**Feature:** [feature name]
**Classification:** LEVEL [1/2/3]

**Justification:**
[Explain why it belongs to this level]

**Preliminary sizing:**

- User Stories: [estimated number]
- Epics needed: [number] - [names if applicable]

**Existing epic (if applicable):** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name} or "N/A: requires a new epic"

**Identified dependencies:**
[List dependencies with other epics or systems. Sources: PRD/SRS sequencing, master-plan Master Sprints, the data map (`business-data-context`). Never invent.]
```

---

## Open questions before creating anything

Open questions that decide the feature's scope go to an interview. Call the Skill tool with "grilling" and give it the questions. It asks in numbered rounds, each question with a recommended answer, and it skips any question the PRD, SRS or ticket already answers. When an answer settles or contradicts a domain term, the term goes to `.context/business/domain-glossary.md` through the PM change protocol, not from inside this workflow. Answers that stay open go to the story's `## Open questions` comment.

If the `grilling` skill is not installed, ask the same questions as a numbered list, each with your recommended answer, and say in the report that the interview method was missing.

With nobody at the keyboard, follow `grilling` under "With nobody at the keyboard": write each question and its recommended answer into the story's `## Open questions` comment and the run report, take the safest reversible answer, and list it as an assumption the operator can veto. Do not wait.

## Spec from the conversation

When the decisions are already made in the conversation, record them. Do not interview again, and do not add a decision nobody made. A fact in the spec that nobody stated is a defect.

Write the epic description (Phase 2B Step 1) in this order: the problem from the user's side, the solution from the user's side, implementation decisions (modules, interfaces, schema, contracts, no file paths), testing decisions, out of scope, further notes. For testing decisions, name the seams first: prefer existing seams, use the highest one that works, and the fewer the better. Say that good tests check external behavior, and cite prior art in the code. Where the project has adopted delta specs, the same text fills the delta spec (`references/delta-specs.md`) instead of the epic description.

For a Level 1 story, the decided points go to the fields above that own them (business rules, scope, out of scope), never to a new section. When an autonomous run picks the seams itself, it writes them under "Testing decisions" in the description and lists them in the report.

Source: https://github.com/mattpocock/skills (skills/engineering/to-spec), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

---

## Phase 2A: create an individual story (Level 1)

Prerequisite: the feature is classified as Level 1. Write the spec step above first when the conversation has already decided its content.

### Step 1: Identify the parent epic

Review `.context/PBI/epic-tree.md` to list the existing epics and pick the one this story belongs to.

```markdown
**Selected epic:** EPIC-{PROJECT_KEY}-{NUM}-{name}
**Reason:** [Why this story belongs to this epic]
```

### Step 2: Create the story in Jira

Ask `[ISSUE_TRACKER_TOOL]` to create a `Story`-type issue in the resolved project. Before writing rich-text fields, read `references/jira-publishing-gotchas.md` for the two known ADF bugs.

Issue data:

- Project: `PROJECT_KEY` resolved from `.agents/project.yaml`.
- Issue type: Story.
- Summary: `{Feature} | {Action}` (see "Summary nomenclature"). No functional-spec prefix, and no `As a ... so that ...` sentence.
- Description (body): first line `**Source spec:** FR-XXX` when applicable. The body has `## User story`, `## Definition of done`, and optional overflow for business rules, workflow, mockups and technical notes. It never includes `## Acceptance Criteria`, `## Scope` or `## Out of Scope`, which live in custom fields.
- Epic Link: the Jira key of the parent epic from Step 1.
- Priority: High, Medium or Low.
- Labels: `feature-extension`, `post-mvp` (adjust as appropriate).

Custom fields (slug-resolved):

| Slug | Content |
| ---- | ------- |
| `{{jira.acceptance_criteria}}` | Minimum 3 Given/When/Then scenarios (1 happy path, 2 error or edge). Wrap each scenario in a ```gherkin code fence (anti-pattern `I17`). Persona-observable language, with no endpoints, HTTP codes, table names or framework names (anti-pattern `I15`). |
| `{{jira.scope}}` | In-scope bullets only. Each describes a capability the persona gains, not an endpoint, table or service (anti-pattern `I15`). |
| `{{jira.out_of_scope}}` | Explicit exclusions, complementary to `scope`, with no cross-pollination, also in capability voice. |
| `{{jira.ai_effort}}` | Leave empty. QA sets it in shift-left; `High` only warns the dev; a split is an optional PO proposal (anti-pattern `I16`). |
| `{{jira.business_rules_specification}}` | Optional. Domain rules (boundaries, role gates, retry and audit semantics), not internal algorithms. |
| `{{jira.mockup}}` | Optional. Figma URLs and designs. |
| `{{jira.workflow}}` | Optional. The persona flow when it is complex, never a code walkthrough. |
| `{{jira.weblink}}` | Conditional. The app URL, only when known with certainty. |

Procedure:

1. Ask `[ISSUE_TRACKER_TOOL]` to create the `Story`-type issue with the fields above.
2. Link it to the parent epic through the epic link.
3. Populate the slug-resolved custom fields per the table.
4. Capture the assigned Jira key (`{PROJECT_KEY}-{ISSUE_NUM}`).

ADF note: when you write several rich-text custom fields in one update batch, split them per field or pre-convert with `md-to-adf.ts`. See `references/jira-publishing-gotchas.md`.

### Step 3: Transition the story to the default status

Ask `[ISSUE_TRACKER_TOOL]` to move the story to the status in `{{jira.statuses.story_default}}` (the literal default is `Shift-Left QA` when the slug is not configured). If the project's workflow does not offer that transition from the initial status (`To Do`), report the gap and leave the story where it is. Do not force an arbitrary transition.

### Step 3.5: Active dependency discovery (mandatory, before linking)

Anti-pattern `I18` requires an active discovery pass before any link is created.

1. Read `.context/PBI/epic-tree.md` for the stories of the same epic and related epics.
2. Read the data map (`bun run context:map business-data-context`) when it is generated (a placeholder notice means there is no map), for entity-level relations.
3. Query the current link graph of the new story and of its possible neighbors in the parent epic through `[ISSUE_TRACKER_TOOL]`.
4. Build a candidate matrix `(from, to, link_type_slug, source-of-decision)`, where `source-of-decision` is one of `prd-sequencing`, `srs-sequencing`, `master-implementation-plan`, `business-data-context`, `author-intent`.
5. Filter the noise. Discard candidates whose only justification is a global or infrastructural prerequisite (auth exists, the DB exists, the framework is wired up). Those are properties of the project, not dependencies between stories.
6. Apply the heuristic: if the dependency disappears when sprints are reordered, it is global noise, so drop it. If it stays, it is a real feature-level dependency, so keep it.
7. Show the filtered matrix to the user and wait for confirmation before creating any link in Step 4.

### Step 4: Link dependencies in Jira

For every dependency the user confirmed in Step 3.5, create a Jira issue link. Details are in `references/dependency-linking.md`.

Valid dependency sources, and no others:

- Explicit sequencing in the PRD, SRS or functional specs.
- Master Sprint ordering in `.context/master-implementation-plan.md`.
- Entity-level relations in the data map (`bun run context:map business-data-context`).
- Explicit `Blocked By` or `Blocks` dependencies the author stated in this session (`author-intent`).

How:

- The primary slug is `{{jira.link_types.dependencies}}` (outward "depends on", inward "is dependency for").
- When the workspace does not declare the `dependencies` slug and the catalog declares `{{jira.link_types.dependencies.fallback}}` (typically `relates`), use the fallback and flag the degradation explicitly, because `relates` is symmetric and the direction is lost.
- For hard blockers, use `{{jira.link_types.blocks}}` (Jira built-in).
- Respect directionality: `outwardIssue = dependent`, `inwardIssue = prerequisite`.

After creating the links, report a matrix `from, to, type, source-of-decision` so the user can audit it.

### Step 5: Materialize the local story cache

The story already lives in Jira (Step 2 created it, Step 4 linked it). The local `.md` is a read-only cache and is never hand-authored (`.agents/instructions/agent-local-context-pbi.md` §9; `references/jira-operations.md`, "No local authoring"). Materialize it with the sync script:

```
bun run jira:sync-issues get {PROJECT_KEY}-{ISSUE_NUM}
```

This writes the canonical story folder, a `story.md` index, and one Markdown file per non-empty rich-text custom field (`acceptance-criteria.md`, `scope.md`, `out-of-scope.md`, `business-rules.md`, `workflow.md`, `mockup.md`, and so on) under the epic tree. Do not read fields back with `acli view`, because it omits every `customfield_*`.

Canonical location (1:1 epic = module):

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/
```

For example, with `PROJECT_KEY` = "MYM", parent epic "MYM-13" and Jira issue number 45, the full key is "MYM-45" and the sync materializes:

```
.context/PBI/epics/EPIC-MYM-13-{epic-name}/stories/STORY-MYM-45-{story-name}/
```

`{epic-name}` and `{story-name}` are inferred from the project's domain analysis.

### Step 6: Verify the synced `story.md`

`story.md` is materialized by the sync in Step 5. This step is a read-back check: open the synced file and confirm the Jira issue carries clean, INVEST-compliant content. When a field is wrong, fix it in Jira (create or REST PUT per `references/jira-operations.md`) and re-run `bun run jira:sync-issues get <KEY>`. Never edit the local file.

| Criterion | Description | Validation |
| --------- | ----------- | ---------- |
| **I**ndependent | The story can be developed without depending on others | Can it be completed in isolation? |
| **N**egotiable | Details can be adjusted during development | Is there flexibility in implementation? |
| **V**aluable | Delivers value to the user or the business | Is the "so that" clear and valuable? |
| **E**stimable | Enough detail for QA to size it in shift-left | Can QA tell Low, Medium or High from it? |
| **S**mall | Small enough to verify on its own | AI Effort High? A split may be proposed (optional). |
| **T**estable | Acceptance criteria are verifiable | Are the scenarios clear and measurable? |

The synced `story.md` has this shape. It is a read-back reference, not an authoring template:

```markdown
**Source spec:** FR-XXX  <!-- first line, omit if not applicable -->

# [Story Title]

**Jira Key:** [real Jira key, e.g. MYM-45]
**Epic:** [EPIC-{PROJECT_KEY}-{NUM}] ([Epic Title])
**Priority:** [High | Medium | Low]
**AI Effort:** [Low | Medium | High | -]
**Token usage (K):** DTU [n | -] | QTU [n | -]
**Status:** [current status in Jira]
**Assignee:** null
**Type:** Feature Extension (Post-MVP)

---

## User Story

**As a** [specific user type]
**I want to** [clear and concrete action]
**So that** [measurable benefit to the user]

---

## Business Rules

<!-- Mirror of {{jira.business_rules_specification}} (optional, overflow only) -->

- [Business rule 1 that applies to this story]
- [Business rule 2]

---

## Workflow

<!-- Mirror of {{jira.workflow}} (optional, overflow only) -->

[Workflow description when complex]

1. User does X
2. System responds Y
3. User confirms Z

---

## Mockups / Wireframes

<!-- Mirror of {{jira.mockup}} (optional) -->

- [URL to Figma/design if it exists]

---

## Technical Notes

### Frontend

[Components to create/modify]

### Backend

[APIs to create/modify, business logic]

### Database

[Tables/fields to add]
**IMPORTANT:** DO NOT hardcode SQL. Use `[DB_TOOL]`.

### Impact Analysis

[Which parts of the system are affected]

---

## Dependencies

### Blocked By

[Other stories that must complete first, as Jira keys]

### Blocks

[Which stories depend on this one, as Jira keys]

### Related Stories

[Related stories: informational, not blocking]

---

## Definition of Done

- [ ] Code implemented and working
- [ ] Unit tests (coverage > 80%)
- [ ] Integration tests (API + DB)
- [ ] E2E tests
- [ ] Code review approved (2 reviewers)
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] QA testing passed
- [ ] Acceptance criteria validated
- [ ] No critical/high bugs open

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{name}/epic.md`
- **PRD:** `.context/PRD/[relevant-section].md`
- **SRS:** `.context/SRS/functional-specs.md`
```

Notes on the synced file:

- AC, Scope and Out-of-Scope are not replicated in `story.md`. They live in their custom fields Jira-side and sync into their own per-field files (`acceptance-criteria.md`, `scope.md`, `out-of-scope.md`). See `references/description-custom-field-dedup.md`.
- `## Business Rules`, `## Workflow` and `## Mockups` come from their Jira slugs and are emitted by the sync. To change them, edit the Jira field and re-sync.

Synced output: `.context/PBI/epics/EPIC-[...]/stories/STORY-[...]/story.md`, plus the per-field files.

### Step 7: Refresh the parent `epic.md`

`epic.md` is a Jira-mirrored cache. After the story is linked to its parent epic in Jira, refresh the epic's cache so its child-story list shows the new key:

```
bun run jira:sync-issues pull --epic {PROJECT_KEY}-{EPIC_NUM}
```

If the story is missing from the synced list, the fix is in Jira (confirm the Epic Link or parent), then re-sync. Never type the story into `epic.md` by hand.

### Step 8: Refresh `epic-tree.md`

`.context/PBI/epic-tree.md` is regenerated by the sync, so the new story appears under its epic after:

```
bun run jira:sync-issues pull
```

Never append the story to the tree by hand.

### Phase 2A is done when

- The story exists in Jira with its real key and sits in `{{jira.statuses.story_default}}`.
- Confirmed dependencies are published as Jira issue links, when there were any.
- The sync produced the story folder with the canonical name, `story.md` and the per-field files, with no AC, Scope or Out-of-Scope duplicated.
- The parent `epic.md` and `epic-tree.md` are refreshed through the sync.

---

## Phase 2B: create a full epic (Level 2)

Prerequisite: the feature is classified as Level 2. Write the spec step above first when the conversation has already decided its content.

### Step 1: Define the epic and its stories

```markdown
## New Epic

**Title:** [Epic name]
**Description:** [2-3 paragraphs explaining the epic]
**Priority:** High | Medium | Low
**Business Value:** [Why it matters]

## Identified User Stories

1. As a [user], I want to [action], so that [benefit]
2. As a [user], I want to [action], so that [benefit]
3. As a [user], I want to [action], so that [benefit]
   ...

**Number of stories:** [number]
```

### Step 2: Create the epic in Jira

Ask `[ISSUE_TRACKER_TOOL]` to create an `Epic`-type issue in the resolved project. The tool-layer matrix is in `references/jira-operations.md`. Before writing rich-text fields (the description), read `references/jira-publishing-gotchas.md`.

Issue data:

- Project: `PROJECT_KEY` resolved from `.agents/project.yaml`.
- Issue type: Epic.
- Summary: the epic name, with no functional-spec prefix.
- Description (body): 2 to 3 paragraphs. When the epic maps to a set of FRs, the body may list the reference (for example "Covers FR-101 ... FR-108"). Do not duplicate AC or Scope in it.
- Priority: High, Medium or Low.
- Labels: `post-mvp`, `new-feature`.

Create the issue and capture the assigned Jira key (`{PROJECT_KEY}-{ISSUE_NUM}`).

### Step 3: Transition the epic to the default status

Ask `[ISSUE_TRACKER_TOOL]` to move the new epic to the status in `{{jira.statuses.epic_default}}` (the literal default is `Planning` when the slug is not configured).

### Step 4: Local epic folder name

The folder is named `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/`, and the sync in Step 5 creates it. Never `mkdir` it, because the folder is part of the `.context/PBI/` cache (`.agents/instructions/agent-local-context-pbi.md` §9).

For example, with `PROJECT_KEY` = "MYM" and Jira issue number 50, the full key is "MYM-50" and the sync writes:

```
.context/PBI/epics/EPIC-MYM-50-{name-per-domain}/
```

`{name-per-domain}` is inferred from the project's PRD/SRS analysis.

### Step 5: Materialize the epic cache

The epic already lives in Jira (Step 2). `epic.md` is a read-only mirror and is never hand-authored (`.agents/instructions/agent-local-context-pbi.md` §9; `references/jira-operations.md`, "No local authoring"). Materialize it with:

```
bun run jira:sync-issues get {PROJECT_KEY}-{EPIC_NUM}
```

This emits the canonical `.context/PBI/epics/EPIC-{PROJECT_KEY}-{EPIC_NUM}-{slug}/epic.md` index and one file per non-empty epic custom field (for example `feature-implementation-plan.md`, `feature-test-plan.md`). The child-story list starts empty and fills once the stories exist (the re-sync in Step 12).

Epic-level AC, Scope and Out-of-Scope, when present, live in their epic custom fields and sync into their own per-field files, never into `epic.md`. Which content lives in which slot is documented once per project in `description-custom-field-dedup.md`. To mark the epic as post-MVP, use the label and description set in Step 2 in Jira, not an edit to the synced file.

### Step 6: Create the stories in Jira

For each story defined in Step 1, ask `[ISSUE_TRACKER_TOOL]` to create it. The per-story contract is Phase 2A Step 2: a summary without a functional-spec prefix, a description with `**Source spec:**` as the first line when applicable, and AC, Scope and Out-of-Scope exclusively in custom fields.

Slug-resolved custom fields per story:

| Slug | Content |
| ---- | ------- |
| `{{jira.acceptance_criteria}}` | Given/When/Then scenarios in a ` ```gherkin ` fenced code block (anti-pattern `I17`). Persona-observable language, with no endpoints, HTTP codes, table names or framework names (anti-pattern `I15`). |
| `{{jira.scope}}` | In-scope only. Capabilities, not endpoints (anti-pattern `I15`). |
| `{{jira.out_of_scope}}` | Explicit exclusions. Deferred capabilities, not deferred endpoints (anti-pattern `I15`). |
| `{{jira.ai_effort}}` | Empty (anti-pattern `I16`). QA sets it in shift-left; `High` only warns the dev; a split is an optional PO proposal. |
| `{{jira.business_rules_specification}}` | Optional. Domain rules (boundaries, role gates, retry semantics, audit guarantees), not internal algorithms (anti-pattern `I15`). |
| `{{jira.mockup}}` | Optional. Design URLs. |
| `{{jira.workflow}}` | Optional. The user flow narrative, not a code-path walkthrough (anti-pattern `I15`). |
| `{{jira.weblink}}` | Conditional. The app URL, omitted when in doubt. |

Procedure: create each story linked to the new epic, populate the slug-resolved custom fields, and capture the Jira key of every story.

ADF note: split multi-field updates per field or pre-convert them. See `references/jira-publishing-gotchas.md`.

### Step 7: Transition the stories to the default status

For every story created in Step 6, ask `[ISSUE_TRACKER_TOOL]` to move it to the status in `{{jira.statuses.story_default}}` (the literal default is `Shift-Left QA`).

### Step 7.5: Active dependency discovery (mandatory, before linking)

Anti-pattern `I18` requires an active discovery pass before any internal link of the new epic is created.

1. Read `.context/PBI/epic-tree.md` for the stories of the new epic and the related epics that already exist.
2. Read the data map (`bun run context:map business-data-context`) when it is generated (a placeholder notice means there is no map), for entity-level relations between the entities these stories touch.
3. Query the current link graph of every story created in Step 6 through `[ISSUE_TRACKER_TOOL]`.
4. Build the candidate matrix `(from, to, link_type_slug, source-of-decision)`.
5. Filter the noise. Discard candidates justified only by global or infrastructural prerequisites, and keep feature-level dependencies between specific stories of the epic (or across epics when explicit).
6. Apply the heuristic: a dependency that disappears when sprints are reordered is discarded, and one that stays is kept.
7. Show the filtered matrix to the user and wait for confirmation before creating any link in Step 8.

### Step 8: Link dependencies between stories

For every dependency the user confirmed in Step 7.5, publish a Jira issue link. Details are in `references/dependency-linking.md`.

Valid sources, never invented:

- Explicit sequencing in the PRD, SRS or functional specs.
- Master Sprint ordering in `.context/master-implementation-plan.md`.
- Entity-level relations in the data map (`bun run context:map business-data-context`).
- Explicit author-intent `Blocked By` or `Blocks` dependencies surfaced during this session. These become Jira issue links here, then sync back into each `story.md` in Step 10.

How:

- The primary slug is `{{jira.link_types.dependencies}}`, with `outwardIssue = dependent` and `inwardIssue = prerequisite`.
- When the workspace lacks the slug, use `{{jira.link_types.dependencies.fallback}}` and flag the degradation, because `relates` is symmetric.
- For hard blockers, use `{{jira.link_types.blocks}}`.

Finish the step with a `from, to, type, source` matrix.

### Step 9: Cross-story Scope overlap check

Before sprint sequencing, audit the `{{jira.scope}}` bullets of all child stories of the epic pairwise.

1. For each pair of stories `(A, B)` in the epic, compare the contents of `{{jira.scope}}` bullet by bullet, literally.
2. When two stories share an identical bullet (case-insensitive, trimmed), surface it:
   ```
   overlap_alert: <KEY-A> vs <KEY-B> on bullet "<text>"
   ```
3. Do not resolve it automatically. Offer the user three options:
   - (a) Move the bullet to a single owning story, and remove it from the other.
   - (b) Extract a shared dependency story that holds the bullet and that both stories depend on.
   - (c) Accept the duplicate when it is intentional shared context (rare). Document the rationale in a comment on both Jira issues, so it surfaces in the synced caches.

The conceptual detail of clean slicing and the related anti-pattern (`I4`) are in the `SKILL.md` anti-patterns.

### Step 10: Materialize the story caches

Every story already lives in Jira (Step 6) and is linked (Step 8). Materialize the read-only local caches in one pass. The sync creates the canonical folders, `story.md` and the per-field files, and you never create folders or files by hand.

```
bun run jira:sync-issues pull --epic {PROJECT_KEY}-{EPIC_NUM}
```

Use `get <KEY>` per story when you need only a subset. The layout the sync produces:

```
.context/PBI/epics/EPIC-MYM-50-{epic-name}/stories/
├── STORY-MYM-51-{story-name-1}/story.md (+ acceptance-criteria.md, scope.md, ...)
├── STORY-MYM-52-{story-name-2}/story.md (+ per-field files)
└── STORY-MYM-53-{story-name-3}/story.md (+ per-field files)
```

### Step 11: Verify the synced story caches

Read back the materialized `story.md` and per-field files and confirm each reflects the Jira issue you created. This is a check, not an authoring step.

- AC, Scope and Out-of-Scope are not in `story.md`. They sync into `acceptance-criteria.md`, `scope.md` and `out-of-scope.md` from the Jira custom fields.
- `Blocked By` and `Blocks` in each `story.md` must match the issue links created in Step 8. A mismatch means the link is wrong in Jira: fix the link, then re-sync. Never edit the local file.
- Wrong content (a missing source spec, a leaked implementation detail) is fixed in the Jira field (create or REST PUT per `references/jira-operations.md`), then the sync is re-run.

### Step 12: Refresh `epic.md` with the real story IDs

Re-run the epic sync so the materialized `epic.md` User Stories list shows the real child-story keys now linked under the epic:

```
bun run jira:sync-issues pull --epic {PROJECT_KEY}-{EPIC_NUM}
```

If a story is missing from the synced list, the Epic Link or parent is wrong in Jira. Fix it there and re-sync, and never type story keys into `epic.md`.

### Step 13: Refresh `epic-tree.md`

Regenerate the backlog tree so the new epic and its stories appear:

```
bun run jira:sync-issues pull
```

The regenerated `.context/PBI/epic-tree.md` reflects the live Jira backlog graph (epics, child stories, statuses, priorities). Never append the epic to the tree by hand.

### Step 14 (final): Sprint sequencing

Once all stories exist, all dependency links are published, and the overlap check passed or was resolved, run sprint sequencing. The Kahn algorithm, cycle detection and output schema are in `references/sprint-sequencing.md`.

This step delegates the write: it invokes `/project-context dev-roadmap`, which writes the execution-sprint sort to `.context/dev-roadmap.md` §4 and preserves the hand-authored backbone, edges and gates (§2, §3, §5 and §6 are surgically preserved, §4 is overwritten on re-run). Re-run it whenever the dependency graph changes (new stories, new links, removed links).

The rules, summarized from `sprint-sequencing.md`:

- Only `dependencies` and `Blocks` contribute to the topological sort. `Relates` is informational.
- Cycle detection is mandatory. When the graph does not drain and no node has in-degree zero, halt and report. Never silence it.
- The output feeds human planning and is never a commitment.

### Phase 2B is done when

- The epic exists in Jira with its real key, in `{{jira.statuses.epic_default}}`, and its local cache is materialized through the sync.
- Every story exists in Jira with its real key, in `{{jira.statuses.story_default}}`.
- Dependencies are published as issue links, with the matrix reported.
- The scope overlap check is complete, and the user resolved every alert.
- The story caches are synced with no AC, Scope or Out-of-Scope duplicated, and `epic.md` and `epic-tree.md` are re-synced.
- Sprint sequencing ran and wrote `.context/dev-roadmap.md` §4 through `/project-context dev-roadmap`.

---

## Phase 2C: multiple epics, warning and plan (Level 3)

Prerequisite: the feature is classified as Level 3.

The idea is too complex to create directly. It needs several epics with dependencies and a broad scope, and creating them all at once overloads the context, mismanages dependencies and invites inconsistencies. Create nothing yet. Generate a split plan first.

Expected output:

```markdown
# Implementation Plan: [Feature Name]

## Warning

This feature requires **[number] epics** to implement correctly.

**IMPORTANT:** Do NOT proceed with creation until this plan has been reviewed and approved.

---

## Complexity Analysis

**Total scope:**

- Required epics: [number]
- User stories: [total number]
- Estimated duration: [Master Sprints]

**Why multiple epics?**
[Explain the reasons: technical complexity, separate domains, dependencies, etc.]

---

## Recommended Split Into Epics

### EPIC 1: [Name]

**Priority:** CRITICAL | HIGH | MEDIUM
**Master Sprint:** [N, a reference to `.context/master-implementation-plan.md` §5 when present]
**Description:** [1-2 paragraphs]

**Estimated user stories:** [number]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencies:**

- **Requires:** [Epics that must complete first]
- **Blocked by:** [External epics]

**Suggested order:** #1 (implement first)

---

### EPIC 2: [Name]

**Priority:** CRITICAL | HIGH | MEDIUM
**Master Sprint:** [N]
**Description:** [1-2 paragraphs]

**Estimated user stories:** [number]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencies:**

- **Requires:** EPIC 1 completed
- **Blocked by:** [If applicable]

**Suggested order:** #2 (implement after EPIC 1)

---

[... repeat for every required epic ...]

---

## Recommended Implementation Order

### Master Sprint 1: Foundation

1. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}** - [Description] (foundational base)
   - **Why first?** [Reason]

### Master Sprint 2: Core Features

2. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}** - [Description] (main functionality)
   - **Depends on:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}
   - **Why now?** [Reason]

3. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}** - [Description]
   - **Depends on:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}
   - **Why now?** [Reason]

### Master Sprint 3: Enhancements

4. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}** - [Description] (improvements and optimizations)
   - **Depends on:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}, EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}
   - **Why last?** [Reason]

> **Terminology note:** "Master Sprint" groups strategically at roadmap level (`.context/master-implementation-plan.md`). "Execution Sprint" is the output of the dependency-driven topological sort, derivable only after stories and links exist (see `references/sprint-sequencing.md`).

---

## Identified Risks

| Risk     | Impact          | Probability     | Mitigation           |
| -------- | --------------- | --------------- | -------------------- |
| [Risk 1] | High/Medium/Low | High/Medium/Low | [Mitigation plan]    |
| [Risk 2] | High/Medium/Low | High/Medium/Low | [Mitigation plan]    |

---

## Required Architectural Changes

[List significant architectural changes this feature requires]

**Examples:**

- New database table: [name and purpose]
- New backend service: [name and purpose]
- Integration with external API: [which one and why]
- Frontend changes: [main components]

---

## Pending Technical Decisions

Before starting implementation, these decisions must be made:

1. **[Decision 1]**
   - **Options:** [Option A, Option B]
   - **Recommendation:** [Option X because ...]

2. **[Decision 2]**
   - **Options:** [Option A, Option B]
   - **Recommendation:** [Option X because ...]

---

## Next Steps

**Do NOT proceed with epic/story creation yet.**

### Step 1: Review This Plan

- [ ] Review the proposed epic split
- [ ] Validate the implementation order
- [ ] Confirm effort estimates
- [ ] Approve architectural changes

### Step 2: Split the Idea

Once the plan is approved, split the original idea into individual epics.

### Step 3: Execute Incrementally

Re-run this reference with ONE epic at a time.

Input for the first run:
"Implement EPIC 1 of the plan: [Epic name]
[Paste EPIC 1 description and scope from the plan]"

This is classified as Level 2 and creates the full epic (Phase 2B), which includes story creation, transitions, dependency linking, the scope overlap check and sprint sequencing.

Repeat for each epic in the recommended order.

---

## Total Effort Estimate

**Total project:**

- Master Sprints: [number]
- Developers: [recommended number]
- QA: [recommended number]
- Duration: [weeks/months]

**Estimated cost:** [If applicable]

---

## Additional Notes

[Any other relevant information about the feature, business considerations, user impact, etc.]
```

Phase 2C is done when the plan is generated, the warning is visible to the user, and nothing was created in Jira. Each epic of the plan then goes through Phase 2B on its own run.

---

## Naming and standards

Folder naming:

```
EPIC-{PROJECT}-{NUMBER}-{descriptive-name}/
STORY-{PROJECT}-{NUMBER}-{descriptive-name}/
```

- Use kebab-case, with descriptive but concise names (2 to 4 words). No snake_case, CamelCase or spaces.
- IDs have no leading zeros (MYM-2, not MYM-002).
- Always use real Jira IDs (the Jira-first flow).

The summary rules are in "Summary nomenclature". In short: `{Feature} | {Action}`, a `TMS-` prefix only for domain-entity features, no functional-spec prefix on story or epic summaries, and `**Source spec:** FR-XXX` as the omittable first body line.

---

## Checks

Before creating in Jira:

- The story or epic name is descriptive and clear, and the parent epic (when applicable) exists.
- The summary is in `{Feature} | {Action}` form (`I20`), with the `As a ... so that ...` sentence in the body `## User story` and no functional-spec prefix.
- Acceptance criteria are Gherkin wrapped in a ```gherkin code fence (`I17`).
- Voice gate: AC, Scope, Out-of-Scope and Workflow describe persona-observable behavior, with no endpoints, HTTP status codes, table names, framework names or internal algorithms (`I15`). The exception is a persona that is an API consumer.
- Persona grounding: the `As a` names a persona that exists in `.context/PRD/user-personas.md`, or, on a business-maps project, in the glossary or the data map's `access-control` roles (`I19`).
- Effort fields: `{{jira.ai_effort}}`, `{{jira.development_token_usage}}` and `{{jira.quality_token_usage}}` are left empty for QA and the agents to fill (`I16`).
- Active dependency discovery ran (Step 3.5 or 7.5), global noise was filtered out, and the matrix was confirmed before any link (`I18`).
- `description-custom-field-dedup.md` was reviewed to avoid duplication.

After creating in Jira:

- You captured the real Jira key, and the epic link is correct.
- Every required field is populated (slug-resolved), and the status is the default (`story_default` or `epic_default`).
- Dependencies are published as issue links.
- For Level 2, the Scope overlap check passed and sprint sequencing wrote `.context/dev-roadmap.md` §4 through `/project-context dev-roadmap`.

After syncing the local cache (read back, never hand-edit):

- The sync named the folders with the real Jira ID (`EPIC-{PROJECT}-{NUM}-{name}`, kebab-case).
- The synced `.md` files carry every required piece of information without duplicating AC, Scope or Out-of-Scope. A gap is fixed in Jira, then re-synced.

---

## Generated files

`bun run jira:sync-issues` materializes this read-only cache (`.agents/instructions/agent-local-context-pbi.md` §9, never hand-written).

Level 1 (individual story):

```
.context/PBI/epics/EPIC-{PROJECT}-{NUM}-{name}/stories/
└── STORY-{PROJECT}-{NUM}-{name}/
    └── story.md
```

It also updates the parent epic's `epic.md` and `epic-tree.md`.

Level 2 (full epic):

```
.context/PBI/epics/
└── EPIC-{PROJECT}-{NUM}-{name}/
    ├── epic.md
    └── stories/
        ├── STORY-{PROJECT}-{NUM}-{name}/
        │   └── story.md
        ├── STORY-{PROJECT}-{NUM}-{name}/
        │   └── story.md
        └── ...
```

It also updates `epic-tree.md` and `.context/dev-roadmap.md` §4 (produced by invoking `/project-context dev-roadmap`; §2, §3, §5 and §6 are preserved).

Level 3 (split plan):

```
[No files created. The plan is generated in the response.]
```

After the split, each epic is created through Level 2, and each run writes the execution-sprint sort to `.context/dev-roadmap.md` §4 through `/project-context dev-roadmap`.

---

## Prerequisites

Required:

- An existing, configured Jira project.
- `[ISSUE_TRACKER_TOOL]` resolved and operational (primary `/acli`, fallback Atlassian MCP, see `.agents/instructions/agent-tool-resolution.md` §6).
- `.agents/project.yaml`, `.agents/jira-required.yaml`, `.agents/jira-fields.json` and `.agents/jira-workflows.json` present and synced (`bun run jira:sync-fields` run at least once).
- `.context/PBI/epic-tree.md` up to date, so the existing epics can be reviewed.

Optional but recommended:

- `.agents/jira-link-types.json`, needed for robust dependency linking (populated by `bun run jira:sync-link-types` when the script exists).
- `.context/master-implementation-plan.md`, to align with the strategic Master Sprints.
- `.context/PRD/mvp-scope.md` for product context.
- `.context/SRS/functional-specs.md` for technical context and the FR catalog.
- `.context/SRS/architecture-specs.md`, to validate architectural changes.
- `bun run context:map business-data-context`, to infer real entity-level dependencies.

---

## Usage tips

- For a Level 1 story, be specific about the improvement, name the existing epic when it is already identified, and say why it is needed now.
- For a Level 2 epic, describe the business value, the problem it solves and example use cases. Dependency linking, the scope overlap check and sprint sequencing are mandatory phases at the end.
- For an idea that may be Level 3, say so when you suspect it is complex and give every piece of available information.
- Let the analysis pick the level. When it says Level 3, do not insist on creating everything at once, and work one epic at a time.

---

## Autonomous runs

An `autonomous-delivery` discovery run never waits (`autonomous-delivery/SKILL.md`, "Discovery creates, the operator vetoes (no approval gate)"), and the same holds for a supervised worker or a routine with nobody present. Under a person, every step above stays as written. Where this workflow waits for one, the autonomous path is:

| Gate | Autonomous path |
| ---- | --------------- |
| Open questions | See "Open questions before creating anything". |
| Dependency matrix (Step 3.5, Step 7.5) | The sources are documents, so the run confirms its own matrix: it keeps the candidates the PRD, SRS, master plan or data map support and drops the noise. A candidate whose only source is `author-intent` the brief does not state is not linked. The run reports the matrix as a `DECIDED:` line. |
| Scope overlap (Step 9) | Apply option (a) when one story clearly owns the bullet, otherwise option (b). Name the choice and the option it beat in the run report. Option (c) needs a person. |
| Level 3 (Phase 2C) | Generate the plan, create nothing, put the plan in the run report and end with it. That ends the run's work on this feature and is a finished outcome, not a wait. |

The run stops before any outward action its brief does not cover. A routine's delegating brief is the approval source for what it covers, and `agentic-dev-core/references/decision-protocol.md` says what the run decides itself and what it escalates.

---

## Cross-references

- `references/jira-operations.md`: the operation to tool-layer matrix (primary, fallback, last resort). Read it before any Jira write.
- `references/dependency-linking.md`: directionality table, link-type semantics, valid dependency sources, reporting.
- `references/description-custom-field-dedup.md`: the body and custom fields contract, and the audit procedure.
- `references/sprint-sequencing.md`: the Kahn topological sort, the output schema and cycle detection. The result is written through `/project-context dev-roadmap` into `.context/dev-roadmap.md` §4.
- `references/jira-publishing-gotchas.md`: the two known ADF bugs (combined `code` and `strong` marks, MCP batched custom fields) and their workarounds.
- `references/delta-specs.md`: where the spec lands when the project has adopted delta specs.

Complements `product-backlog-seed.md` (initial MVP setup), `epic-creation.md` and `story-refinement.md`.
