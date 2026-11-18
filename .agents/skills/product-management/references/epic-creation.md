# Epic creation

> **Purpose**: create a well-formed epic (naming, structure, decomposition into stories) in Jira, then materialize the read-only `epic.md` cache with the sync script. `epic.md` is a Jira mirror and is never hand-authored (`.agents/instructions/agent-local-context-pbi.md` §9; `references/jira-operations.md`, section "No local authoring"; `agentic-dev-core/references/acli-integration.md` D9).
> **Use when**: a new feature is too big for a single story (3+ stories) or you are seeding a brand-new product backlog.
> **Companion references**:
>
> - `product-backlog-seed.md`: the very first backlog (several epics at once)
> - `add-feature.md`: adding a feature to an existing backlog (decides whether you need an epic)
> - `story-refinement.md`: refine each story once the epic exists
> - `acceptance-criteria.md` / `edge-cases-enumeration.md`: refined ACs per story
> - `jira-operations.md`: issue tracker pseudo-code (create / transition / link)
> - `dependency-linking.md`: how to link stories via `{{jira.link_types.dependencies}}`
> - `description-custom-field-dedup.md`: keep the description body free of AC / Scope / OOS duplication
> - `sprint-sequencing.md`: Execution Sprint ordering after the decomposition
> - `jira-publishing-gotchas.md`: rich-text field encoding pitfalls (ADF, code blocks, lists)

---

## Inputs: read these first

Read these in order before creating any epic. Skip a file marked **optional** when it does not exist yet.

1. `.agents/project.yaml`: project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml`: canonical slug catalog (fields, statuses, link types).
3. `.agents/jira-fields.json`: slug to numeric custom-field-ID mapping.
4. `.agents/jira-workflows.json`: workflow and transition catalog.
5. `.agents/jira-link-types.json`: slug to workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md`: Master Sprint roadmap (sets the epic's Master Sprint).
7. `.context/PRD/mvp-scope.md`: what is in and out of the MVP.
8. `.context/PRD/user-personas.md`: actor model.
9. `.context/PRD/user-journeys.md`: flow-level expectations.
10. `.context/SRS/functional-specs.md`: FR catalog (source of the `**Source spec:** FR-XXX` line on each child story).
11. `.context/SRS/non-functional-specs.md`: NFRs (performance, security, accessibility).
12. `bun run context:map business-data-context`: entity graph (source of entity-level dependencies). **Optional** at seed time.
13. `bun run context:map business-feature-context`: CRUD matrix. **Optional** at seed time.
14. `bun run context:map business-api-context`: endpoint catalog (auth model, journey breakdown). **Optional** at seed time.
15. `.context/PBI/epic-tree.md`: current backlog state (skip when seeding from scratch).

An existing app documented by its business maps has no PRD or SRS. Inputs 7-11 then have substitutes, listed in `../SKILL.md`, section "Product docs: PRD/SRS or business maps". Do not write a PRD or SRS to fill them.

Items 12-14 arrive after `/project-context` modes `data` / `features` / `api` have run. In a fresh project the maps may not exist yet: proceed without them and re-check dependencies once they are seeded.

---

## What is an epic?

An epic is a body of work that delivers meaningful end-user value and is too large for a single sprint. It groups 3-8 related stories under one Jira parent and one local folder, gives the team a shared narrative ("why are we building this?"), and tracks progress at feature scale rather than task scale.

A good epic is a vertical slice of the product. It crosses backend, frontend, data and (when relevant) infrastructure, and it stops at one coherent capability. If you cannot describe it in two sentences, it is probably two epics.

---

## Identifying when you need an epic

Classify before creating anything in Jira. This is the same rubric as `add-feature.md` Phase 1, summarized for the epic decision:

| Level                    | Signal                                                                                                             | Action                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Story (Level 1)**      | Single change, fits an existing epic, 1-8 SP, no architectural shift                                               | Skip this guide and go to `add-feature.md` Phase 2A                          |
| **Epic (Level 2)**       | New capability, does not fit existing epics, 3-8 stories, scoped, independent, no critical cross-epic dependencies | Continue with this guide                                                     |
| **Multi-Epic (Level 3)** | 2+ epics needed, complex dependencies, architectural changes, 20+ stories estimated                                | Stop and write a plan first, then split into epics and run this guide per epic |

Quick checks before classifying as Level 2:

1. How many stories will it need? (3-8 is Level 2; fewer than 3 is Level 1; more than 8 means revisit, probably Level 3.)
2. Does it fit any existing epic? (No means Level 2.)
3. Does it touch several system modules? (Yes means likely Level 2-3.)
4. Can you split it into 2+ independent epics? (Yes means Level 3.)

---

## Epic vs feature flag

Not every new capability needs a full epic.

| Use a **feature flag** when                                         | Use an **epic** when                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| You want to gate an existing capability (A/B test, gradual rollout) | You are building a capability that does not exist yet              |
| The change is 1-2 stories with a toggle on top                      | The work spans 3+ stories with their own ACs                       |
| You need to ship dark and turn on later                             | You need product-level tracking and stakeholder visibility         |
| Reversibility (instant rollback) is the main concern                | Long-term ownership, success metrics and roadmap placement matter  |

A flag is an implementation tactic for a story; an epic is a product-level container. They are not alternatives, and large epics often ship behind flags, story by story.

---

## Epic sizing and story count

| Dimension       | Target range | Why                                                                                              |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| Story count     | 3-8 stories  | Fewer than 3 is a story; more than 8 should split into several epics                             |
| AI Effort mix   | No `High`    | QA sets it in shift-left; a `High` story only warns the dev; a split is an optional PO proposal  |
| Sprint span     | 2-4 sprints  | Long enough to deliver value, short enough to stay focused                                       |
| Team count      | 1 team       | Multi-team epics carry coordination overhead, so split them                                      |

Above any of these ranges, split before you create the Jira epic.

---

## When the epic is too big to plan

Sizing assumes you can see the whole route. When the work is larger than one session can hold and the route is unclear, planning stories produces fiction: decisions nobody has made yet decide which stories exist. Chart a map first, resolve the open questions one at a time, and cut the stories when the fog clears. Reach for this at Level 3, or at Level 2 when the quick checks above expose unknowns the PRD, SRS and business maps cannot answer.

The map is the epic. Its description holds four sections: the destination (what is true when the epic is done, in the user's words), notes (constraints every later decision needs), decisions so far (one line per closed decision ticket) and not yet specified (open questions with no ticket). Out of scope goes where `description-custom-field-dedup.md` puts it, not in the description body.

To chart it, settle the destination first: Call the Skill tool with "grilling". Then settle the domain terms: Call the Skill tool with "domain-modeling". Where either skill is not installed, ask the same questions inline and say in the report that the method was missing. Grill breadth first to find the fog, meaning the questions whose answers change the shape of the epic, and file a decision ticket for each one you can already state.

A decision ticket is a child of the epic, sized for one session, and typed by how it gets resolved: `research` (facts to gather; give it to a fresh subagent and tell it: Call the Skill tool with "research"; where that skill is not installed, the subagent researches inline and says so), `grilling` (needs a person's answers) or `task` (small work that unblocks a decision). Its issue type is a Task-like type when `.agents/jira-required.yaml` declares one for epic children; otherwise it is a Story carrying the label `decision` plus the ticket type as a second label. It is not a user story, so the persona rule (I19) does not apply, and its summary still follows `{Feature} | {Action}` with the action starting "Decide".

Resolve one ticket per session: write the answer in a comment, add a line to "decisions so far", and move any new question into "not yet specified" or a new ticket. When nothing unspecified is left, write the spec from the decisions (`add-feature.md`) and cut the stories with Step 0 below.

When a skill is not installed, do the same work by hand (questions as a numbered list with your recommended answer, facts gathered yourself) and say once in the report that it was missing. The map still works as a document.

With nobody at the keyboard this section does not run. A map of decision tickets would blow through the `discovery_definitions` cap, and a `grilling` ticket cannot be answered with nobody there. Record "needs a wayfinder map" as a gap in the run report and the escalation log (product category in `agentic-dev-core/references/decision-protocol.md`, a clean stop for that gap only) and take the next candidate.

Source: https://github.com/mattpocock/skills (engineering/wayfinder), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

---

## Epic naming and folder structure

> Lifted from `product-backlog-seed.md`; the same rules apply when adding a single epic.

**Folder format:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/`

Examples from different projects:

Project "MYM" (Jira issued #2 and #13):

- `EPIC-MYM-2-user-authentication-profiles/`
- `EPIC-MYM-13-entity-discovery-search/`

Project "SHOP" (Jira issued #45):

- `EPIC-SHOP-45-payment-processing/`

Project "BLOG" (Jira issued #1):

- `EPIC-BLOG-1-content-management-system/`

Invalid examples:

- `EPIC-001-user-auth/` (missing PROJECT_KEY)
- `EPIC_MYM_2_UserAuth/` (wrong format, it takes hyphens)
- `EPIC-MYM-002-auth/` (no leading zeros, Jira never generates them)
- `EPIC-MYM-2-user-authentication-and-comprehensive-profile-management-system/` (name too long)

Rules for `{descriptive-name}`:

- 2-4 words, kebab-case, lowercase
- Taken from the PRD/SRS domain vocabulary of the current project
- Names the capability, not the implementation (`payment-processing`, not `stripe-integration`)

---

## Creating an epic, step by step

### Step 0: Draft the stories as tracer bullets, then quiz

Do this before Step 1 creates anything in Jira. Cut the stories on paper first (the worksheet below is the place), because a split that is wrong costs far less before the keys exist.

Each story is a tracer bullet: a narrow but complete path through every layer, demonstrable or verifiable on its own, small enough for one fresh session, and declaring which stories block it. Prefactoring comes first as its own story. A wide refactor goes as expand, then migrate in batches sized by blast radius, then contract.

Then quiz the PM. For each story show its title, what blocks it and what it delivers, and ask three things: is the size right, are the blockers real, should anything merge or split? Create nothing in Jira until that is settled, and create blockers first so their keys exist when the links are made.

With nobody at the keyboard there is no quiz. Write the three questions with your own answers as assumptions in the run report and the epic description, create within `discovery_definitions`, create blockers first, and leave the veto to the operator. A person-started run keeps the quiz, and a worker under a conductor sends it to the conductor, who holds the gate.

Source: https://github.com/mattpocock/skills (engineering/to-tickets), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

### Step 1: Create the epic in the issue tracker

Use `[ISSUE_TRACKER_TOOL]` to create the epic. `references/jira-operations.md` has the pseudo-code patterns (create / transition / link). Description fields are rich text, so read `references/jira-publishing-gotchas.md` before publishing the body.

Required data:

- Project: `{{PROJECT_KEY}}`
- Issue type: Epic
- Title (Summary): the epic name from the PRD. Never an `FR-XXX —` prefix
- Description: 2-3 paragraphs, body only, with no AC / Scope / OOS duplication (see `references/description-custom-field-dedup.md`)
- Priority: High | Medium | Low
- Labels: `mvp`, `phase-1` (or `post-mvp`, `new-feature` for additions; adjust as appropriate)

Steps:

1. Invoke `[ISSUE_TRACKER_TOOL]` to create an issue of type "Epic".
2. Fill in every required field.
3. Capture the issue key the tracker assigns, in the format `{{PROJECT_KEY}}-{ISSUE_NUM}` (for example `MYM-13`, `SHOP-45`, `BLOG-1`).

Done when the epic exists in the tracker, the full key is captured, and `ISSUE_NUM` is extracted for the local folder name.

### Step 1b: Transition the epic to its default status

Right after creation, move the epic to its default working status so it appears on the planning board. Use `[ISSUE_TRACKER_TOOL]` with the transition resolved from `{{jira.statuses.epic_default}}` (literal default: `Planning`). `references/jira-operations.md` shows the transition pseudo-code and how to read the workflow catalog. If the slug is unresolved, fall back to the literal `Planning` and flag the missing catalog entry.

Done when the epic has left the tracker's initial creation state for `Planning` (or the workspace-configured equivalent).

### Step 2: Materialize the local epic cache (sync, do not hand-write)

The epic already lives in Jira (Step 1). Its local `epic.md` is a read-only cache and is never hand-authored (`.agents/instructions/agent-local-context-pbi.md` §9; `references/jira-operations.md`, section "No local authoring"; `agentic-dev-core/references/acli-integration.md` D9). Materialize it with the sync script, using the key captured in Step 1:

```
bun run jira:sync-issues get {PROJECT_KEY}-{ISSUE_NUM}
```

This creates the canonical folder and the `epic.md` index, plus one Markdown file per non-empty epic custom field (for example `feature-implementation-plan.md`, `feature-test-plan.md`). The child-story list starts empty and fills once the stories exist and are linked, so re-sync after story decomposition.

Canonical location:

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{domain-name}/epic.md
```

(`{domain-name}` comes from the current project's PRD/SRS, for example `EPIC-MYM-13-entity-discovery-search/`.)

Do not read fields back with `acli` view. Its default projection omits every `customfield_*`, so AC / Scope / plans come back `null` (`agentic-dev-core/references/acli-integration.md` D8). Read details with `bun run jira:sync-issues get <KEY> --include-comments`.

---

## No content duplication

> Applies to the epic body and to every child story. The epic description must not duplicate content that belongs in dedicated custom fields on child stories (Acceptance Criteria, In Scope, Out of Scope). The epic body carries narrative and outcomes; AC / Scope / OOS detail lives on each child story in its own custom field, never inside the description text. `references/description-custom-field-dedup.md` has the full rule and examples, and `references/jira-publishing-gotchas.md` covers rich-text encoding pitfalls for any of these fields.

---

## Epic cache shape (synced `epic.md`, read-back reference only)

> This is not an authoring template. `bun run jira:sync-issues get <KEY>` (Step 2) materializes `epic.md` and overwrites it on every pull. Use the shape below to verify that the synced file reflects the Jira issue. To change content, edit the Jira field (or the `fallback:` comment per `.agents/jira-required.yaml`) and re-sync. Epic-level AC / Scope / Out-of-Scope, when present, live in their epic custom fields and sync into their own per-field files. They are never `## Scope` / `## Acceptance Criteria` H2 sections in `epic.md` (`references/description-custom-field-dedup.md`).

```markdown
# [Epic Title]

**Jira Key:** [Real Jira key, e.g., MYM-13]
**Status:** [current workflow status]
**Priority:** [CRITICAL | HIGH | MEDIUM | LOW]
**Phase:** [Foundation | Core Features | etc.]

---

## Master Sprint

> **Soft contract.** Present only when `.context/master-implementation-plan.md` exists. Omitted for standalone runs (e.g. seeding before `/project-bootstrap`).

**Master Sprint {N}** — {short rationale, 1-2 sentences explaining why this epic belongs to that Master Sprint}. See `.context/master-implementation-plan.md` §5.

---

## Epic Description

[Detailed description of the epic — 2-3 paragraphs, mirrored from the Jira description body]

**Business Value:**
[Why this epic matters]

---

## User Stories

1. **[real key, e.g. MYM-14]** - As a [user], I want to [action] so that [benefit]
2. **[real key, e.g. MYM-15]** - As a [user], I want to [action] so that [benefit]
   ...

> Child-story keys are populated by the sync once the stories are created and linked to the epic in Jira. If a key is missing, fix the Epic Link in Jira and re-sync — never type it here.

---

## Related Functional Requirements

- **FR-XXX:** [FR description]
- **FR-YYY:** [FR description]

See: `.context/SRS/functional-specs.md`.

**Note on FR placement.** At the **epic level**, list the relevant FRs here in the description body. At the **story level**, the `**Source spec:** FR-XXX` line is the FIRST body line of the story description — NEVER embed `FR-XXX —` into the story summary. See `references/description-custom-field-dedup.md` for the description-vs-custom-field boundary.

**Note on titles.** Epic summaries are noun-phrase module titles (no pipe, no verb). Child **story**
summaries use the `{Feature} | {Action}` format (canonical §Story title format in `SKILL.md`, I20): the
epic = module, the story prefix = the abbreviated feature inside that module, and the full
`As a … so that …` sentence lives in the story body `## User story`, never the summary. Domain-entity
feature prefixes carry the `TMS-` tag (`TMS-US`, `TMS-Module`, …).

---

## Technical Considerations

### [Relevant subsection]

[Technical considerations specific to this epic]

### Database Schema

**Tables:**
[List relevant tables with main fields]

**IMPORTANT:** Do NOT hardcode full SQL schema. Use Supabase MCP for the live schema.

### Security Requirements

[Specific security requirements if applicable]

---

## Dependencies

### External Dependencies

[External APIs, services, etc.]

### Internal Dependencies

[Other epics that must complete first]

### Blocks

[Which epics are blocked by this one]

---

## Success Metrics

### Functional Metrics

[Technical success metrics]

### Business Metrics

[Business metrics from the Executive Summary]

---

## Risks & Mitigations

| Risk   | Impact          | Probability     | Mitigation        |
| ------ | --------------- | --------------- | ----------------- |
| [Risk] | High/Medium/Low | High/Medium/Low | [Mitigation plan] |

---

## Testing Strategy

See: refined acceptance criteria + edge cases for the epic — refer to `acceptance-criteria.md` and `edge-cases-enumeration.md` references in this skill.

### Test Coverage Requirements

- **Unit Tests:** [What to cover]
- **Integration Tests:** [What to cover]
- **E2E Tests:** [What to cover]

---

## Implementation Plan

See: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{name}/feature-implementation-plan.md` — synced [SYNC] from the epic's feature-implementation-plan custom field once populated in Jira (authored in Jira during sprint planning, then materialized by `bun run jira:sync-issues get <KEY>`; never hand-written).

### Recommended Story Order

1. [KEY-1] - [Story title] - Foundation
2. [KEY-2] - [Story title] - Core logic
   ...

### Delivery shape

- **Execution Sprints (topological levels):** [N]
- **Stories per level:** [counts]
- Durations and capacity are human-owned and not stated here.

---

## Notes

[Additional notes, special considerations, etc.]

---

## Related Documentation

- **PRD:** `.context/PRD/executive-summary.md`, `.context/PRD/mvp-scope.md`
- **SRS:** `.context/SRS/functional-specs.md` (FR-XXX to FR-YYY)
- **Architecture:** `.context/SRS/architecture-specs.md`
- **API Contracts:** `.context/SRS/api-contracts.yaml`
```

---

## Epic-level acceptance criteria

Epic-level ACs are outcomes, not test scenarios. They state what must be true at the end of the epic for it to count as done:

```markdown
## Acceptance Criteria (Epic Level)

1. ✅ A user can complete the [end-to-end capability] without leaving the product
2. ✅ The capability is integrated with [related existing system]
3. ✅ Success metrics [name them] are measurable in production
4. ✅ All N user stories under this epic are marked Done
```

Story-level ACs (Gherkin Scenario / Given-When-Then) live in each story's `{{jira.acceptance_criteria}}` custom field in Jira and sync into the story's per-field `acceptance-criteria.md` cache, never into `epic.md`. Do not repeat them at the epic level. Refinement details are in `references/acceptance-criteria.md`.

---

## Step N: Link dependencies (after all child stories exist)

Run this after every child story has been created in the tracker, so the keys exist and can be referenced. Linking earlier fails or leaves dangling references.

For each dependency edge surfaced by an active discovery pass, create an issue link in the tracker, then re-sync so the cache reflects the live links. The sources are PRD/SRS sequencing, the Master Sprints in `.context/master-implementation-plan.md`, the entity relations in the data map (`business-data-context`), and explicit author intent from this session (`references/dependency-linking.md`). The synced `epic.md` Dependencies block is read-only context, not an authoring source.

- Use `[ISSUE_TRACKER_TOOL]` with the link type resolved from `{{jira.link_types.dependencies}}`.
- If `{{jira.link_types.dependencies}}` is unresolved in the workspace, degrade to the fallback `{{jira.link_types.dependencies.fallback}}` (literal: `relates`) and flag the degradation in the run report, because `relates` loses direction.
- For "this epic blocks X", use `{{jira.link_types.blocks}}` (directional). For symmetric coupling with no blocker semantics, `relates` is fine.
- Description and comment fields touched during linking are rich text. See `references/jira-publishing-gotchas.md` if you attach a justification comment.

`references/dependency-linking.md` has the full pseudo-code, the slug-resolution algorithm and the degradation handling.

Done when every documented dependency edge has a tracker link and the run report records any fallback use.

---

## Step N+1: Sprint sequencing (last step before handoff)

Run this last, once the epic is decomposed into child stories and the dependency graph is complete (Step N). It is the bridge between epic planning and `/sprint-development`.

Order the child stories into Execution Sprints, with the dependency graph as the main constraint and value and risk as tie-breakers. Invoke `/project-context dev-roadmap` to write the execution-sprint sort to `.context/dev-roadmap.md` §4. That mode also preserves the hand-authored backbone, edges and gates, so this skill delegates the write and does not author the file.

- Sequence stories so none is scheduled before its `{{jira.link_types.dependencies}}` predecessors.
- Group stories into Execution Sprints by topological level only (the sort in `references/sprint-sequencing.md`). Do not fill by capacity: capacity is human-owned and belongs to the sprint-planning meeting that consumes the ordering.
- Cross-reference the epic's Master Sprint from the `Master Sprint` section above.

`references/sprint-sequencing.md` has the full algorithm, the conflict resolution and the exact shape of the §4 schema that `/project-context dev-roadmap` emits into `.context/dev-roadmap.md`.

Done when an Execution-Sprint ordering is persisted for `/sprint-development` to pick up story by story, and any cycle or unresolved dependency was flagged before handoff.

---

## Story decomposition worksheet

> Lifted from `add-feature.md` Phase 2B, Step 1. Capture the breakdown here before opening Jira, and let Step 0 judge it.

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

**Number of stories:** [count]
```

When the worksheet is complete, run the INVEST checklist below on each story before creating it in Jira.

---

## INVEST checklist for stories inside an epic

Each story under an epic must pass INVEST. This is a light pass at epic-creation time; `story-refinement.md` covers the full treatment.

| Criterion       | Check                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| **I**ndependent | Can it be completed without depending on sibling stories?                                 |
| **N**egotiable  | Is there flexibility in the implementation?                                               |
| **V**aluable    | Does the "so that…" clearly state user or business value?                                 |
| **E**stimable   | Can QA tell Low, Medium or High from the story as written?                                |
| **S**mall       | AI Effort `High`? Optionally propose a split before creating (a warning, not a gate)      |
| **T**estable    | Are acceptance criteria verifiable (Gherkin Scenario format)?                             |

For the full INVEST treatment and 3-amigos guidance, see `story-refinement.md`.

---

## Epic success criteria

Before marking an epic ready for development, check that:

- [ ] Classification is confirmed: Level 2 (not a story, not multi-epic)
- [ ] The name follows `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{kebab-name}`
- [ ] The Jira issue exists with a real `ISSUE_NUM` (no `TBD`, no leading zeros)
- [ ] Epic content is set in Jira: description body plus any epic custom fields, on the issue and not in a local file
- [ ] The `epic.md` cache is materialized: `bun run jira:sync-issues get <KEY>` ran, the synced folder exists under `.context/PBI/epics/`, and it reflects the issue (read-back clean, no `[placeholder]`)
- [ ] 3-8 stories are listed in the synced User Stories section, each with a clear "As a / I want / so that"
- [ ] In Scope and Out of Scope are set in the Scope and Out-of-Scope custom fields (they sync into per-field files) and are not duplicated in any description body
- [ ] Epic-level ACs are outcomes, not story-level Gherkin
- [ ] Dependencies (External / Internal / Blocks) are published as Jira links and re-synced into the cache
- [ ] Success metrics are defined (functional and business)
- [ ] Story totals are within 20-40 SP
- [ ] Each story passes INVEST (light check here, full check during refinement)

When all are checked, hand each story to `story-refinement.md` for development-ready preparation.

---

## With nobody at the keyboard

A routine or discovery run creates epics with nobody to answer. Step 0 and the "too big to plan" section carry their own unattended paths. The other two points that wait for a person:

| Point                                  | Person present                     | Nobody there                                                                                       |
| -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Level 3, "stop and write a plan first" | Stop, plan, split into epics       | Record the gap in the run report and escalation log, create nothing for it, take the next candidate |
| Dependency discovery matrix (Step N)   | Show the matrix, confirm the edges | Keep only explicit feature-level edges, list the matrix in the run report, flag each degradation   |

A worker under a conductor hands its questions to the conductor, who holds the gate. Every other decision follows `agentic-dev-core/references/decision-protocol.md`. Keep the work reversible: stop before any push or message that cannot be undone, and say in the report what you assumed.

---

## Related references (in this skill)

- `product-backlog-seed.md`: full backlog seeding flow (several epics at once)
- `add-feature.md`: feature classification flow (Levels 1, 2, 3)
- `story-refinement.md`: refining individual stories before a sprint
- `acceptance-criteria.md`: refined ACs per story
- `edge-cases-enumeration.md`: edge-case discovery per story
- `jira-operations.md`: issue tracker pseudo-code (create / transition / link)
- `dependency-linking.md`: linking stories via `{{jira.link_types.dependencies}}`
- `description-custom-field-dedup.md`: keep the description body free of AC / Scope / OOS duplication
- `sprint-sequencing.md`: Execution Sprint ordering after epic decomposition
- `jira-publishing-gotchas.md`: rich-text encoding pitfalls (ADF, code blocks, lists)
