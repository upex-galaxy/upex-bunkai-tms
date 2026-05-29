Act as an expert Product Owner, Scrum Master, and Solution Architect.

**Input:**

- New feature/idea description: [specify in detail]
- Existing epic tree: [use `.context/PBI/epic-tree.md`]
- PRD (optional): [use `.context/PRD/mvp-scope.md` if additional context is needed]
- SRS (optional): [use `.context/SRS/functional-specs.md` if technical context is needed]
- **PROJECT_KEY:** Jira project code — read it from `.agents/project.yaml`, or as a fallback, from `epic-tree.md`. DO NOT hardcode it here.

---

## Inputs — read these first, in this order

Cold start? Read these files in this exact order before proposing anything. Each one adds a specific context layer; skipping one wastes tokens and increases the risk of invention.

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping (resolved at sync time).
4. `.agents/jira-workflows.json` — workflow + transition catalog (status names live here).
5. `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md` — Master Sprint roadmap (strategic sequencing).
7. `.context/PRD/mvp-scope.md` — what is in vs out of the MVP.
8. `.context/PRD/user-personas.md` — actor model.
9. `.context/PRD/user-journeys.md` — flow-level expectations.
10. `.context/SRS/functional-specs.md` — FR catalog (source of `**Source spec:**` references).
11. `.context/SRS/non-functional-specs.md` — NFRs (performance, security, a11y).
12. `.context/business/business-data-map.md` — entity graph (source of entity-level dependencies).
13. `.context/business/business-feature-map.md` — CRUD matrix by domain.
14. `.context/business/business-api-map.md` — endpoint catalog (auth model, journeys).
15. `.context/PBI/epic-tree.md` — current backlog state.

**Optional inputs.** Some mature projects also produce business maps via `/business-*-map`. If they are absent (typically at early seed time), proceed without them but flag the gap.

---

## Custom field resolution — slug-based, never hardcoded

Jira numeric IDs (`customfield_NNNNN`) vary per workspace and DO NOT live in this skill. The methodology resolves each field at runtime via `{{jira.<slug>}}` against the canonical catalog in `.agents/jira-required.yaml`. The AI runtime resolves slug → numeric ID via `.agents/jira-fields.json` (populated by `bun run jira:sync-fields`). If a slug does not exist in the target workspace, the catalog declares the fallback and `bun run jira:check` warns.

**Slugs this workflow writes** (semantics of each field):

- `{{jira.acceptance_criteria}}` — Given/When/Then scenarios. Single source of truth for AC.
- `{{jira.business_rules_specification}}` — story-specific business rules (validations, domain invariants).
- `{{jira.scope}}` — in-scope only. Excluded items go to `out_of_scope`.
- `{{jira.out_of_scope}}` — explicit exclusions, complementary to `scope` (no cross-pollination).
- `{{jira.mockup}}` — Figma URLs / wireframes / visual references.
- `{{jira.workflow}}` — flow description from the persona's POV, not a code-walkthrough (see anti-pattern `I15`).
- `{{jira.weblink}}` — app/feature URL. Populate ONLY when the domain is known with certainty; when in doubt, omit.
- `{{jira.story_points}}` — **OPT-IN ONLY**. Leave EMPTY by default. Populate only when the user explicitly requests estimation in this session. PO/BA do not estimate; the team that will build it does (Design + Dev + Test). When opted-in: Fibonacci (1, 2, 3, 5, 8); 13+ → split. See anti-pattern `I16`.

**Operation → tool layer.** Every read/write against Jira is expressed as `[ISSUE_TRACKER_TOOL]` pseudo-code. The consuming skill (AI runtime) resolves the tool via the `CLAUDE.md` §6 table (primary `/acli`, fallback Atlassian MCP, last resort REST). For the operation → tool-layer matrix, see `references/jira-operations.md`. For rich-text (ADF) publishing gotchas, see `references/jira-publishing-gotchas.md`.

> **Note on `{{jira.weblink}}`.** It is optional and should only be populated when: (a) the AI knows the app domain under test with certainty (system prompt or explicit project context), or (b) the user provided the URL. When in doubt → DO NOT populate.

---

## Summary nomenclature

**Story summary format is `{Feature} | {Action}`** — see the canonical §Story title format in `SKILL.md`
(anti-pattern I20). The `As a … I want to … so that …` sentence is NEVER the summary; it lives only in the
description `## User story` section. `{Feature}` is the abbreviated feature noun (shared across sibling
stories of the same feature); `{Action}` is the `I want to …` clause as a base-form verb phrase (persona +
benefit dropped, scenario qualifier kept). When a feature names a product domain entity that collides with
agile/QA vocabulary, prefix it with the project-domain tag `TMS-` (`User Story → TMS-US`,
`Module → TMS-Module`, `Defect → TMS-Defect`, etc.); cross-cutting features stay plain. English; ≤ ~80 chars.

**NEVER prefix a story summary with the functional-spec reference** (e.g. pattern `FR-XXX` followed by em-dash and title). The Jira key (`{PROJECT_KEY}-{NUM}`) is the only real identifier; mixing methodology references into the summary pollutes Jira-side search and breaks JQL summary filters.

The spec reference goes in the issue **body** as the first line:

```
**Source spec:** FR-XXX
```

If the story does not map 1:1 to an FR (e.g. cosmetic improvement without a dedicated spec), **omit the line** entirely. Do not fill it with `N/A` or with a forced FR.

The same rule applies to the epic summary.

---

## No content duplication — description ↔ custom fields

**Hard rule:** AC, Scope, and Out-of-Scope live **EXCLUSIVELY** in their slug-resolved custom fields. The issue description NEVER carries `## Acceptance Criteria`, `## Scope`, or `## Out of Scope` as H2 sections.

The description body carries:

- `**Source spec:** FR-XXX` (first line, optional).
- `## User story` — As/I want/So that narrative.
- `## Business rules` — overflow only when the content does not fit in `{{jira.business_rules_specification}}`.
- `## Workflow` — overflow only when the content does not fit in `{{jira.workflow}}`.
- `## Definition of done` — closing checklist.
- Optional: `## Mockups / Wireframes`, `## Technical notes`.

Full contract details + deduplication audit procedure → `references/description-custom-field-dedup.md`.

---

## 🎯 GOAL

Analyze a new idea/feature and decide how to efficiently add it to the existing backlog, following the **Jira-First → Local** flow.

---

## 📊 PHASE 1: COMPLEXITY ANALYSIS

**Action:** Analyze the provided idea and classify it into one of these 3 levels.

### Classification Criteria

#### **LEVEL 1: Individual Story**

✅ Execute directly

**Characteristics:**

- An improvement/extension of existing functionality
- Clearly fits into an existing epic
- Can be completed in 1-8 story points
- Does not require significant architectural changes
- 1 user story is enough

**Examples:**

- "Add a filter by [attribute] to the search of [main entity]" (→ existing epic related to search/discovery)
- "Allow canceling [business action] up to X hours in advance" (→ existing epic related to operations management)
- "Add email notification when [business event] occurs" (→ existing epic related to notifications)

(Where [main entity], [attribute], [business action], and [business event] are determined by analyzing the current project's PRD/SRS.)

**Action:** → Go to **PHASE 2A**

---

#### **LEVEL 2: Full Epic**

✅ Execute directly

**Characteristics:**

- A new feature that does NOT fit into existing epics
- Requires multiple user stories (3-8 stories)
- Has a well-defined and bounded scope
- Does not critically depend on other new epics
- Can be implemented independently

**Examples:**

- "Messaging system between [user-type-1] and [user-type-2]"
- "Analytics dashboard for [user-type]"
- "Certificate/badge system when [business event] completes"

(Where [user-type-1], [user-type-2], and [business event] are determined by analyzing the current project's PRD/SRS.)

**Action:** → Go to **PHASE 2B**

---

#### **LEVEL 3: Multiple Epics**

⚠️ **WARNING — REQUIRES A PRIOR PLAN**

**Characteristics:**

- The idea requires 2+ epics to implement
- Has complex inter-component dependencies
- Requires significant architectural changes
- Very broad scope (20+ stories estimated)
- High technical or business complexity

**Examples:**

- "Full monthly subscription system with plans"
- "Pre-recorded course marketplace with content creator"
- "Gamification system with badges, rankings, and rewards"

**Action:** → Go to **PHASE 2C (STOP + Plan Required)**

---

## 🚨 CRITICAL VALIDATION

Before classifying, ask yourself:

1. How many user stories do I need? (1 = Level 1, 3-8 = Level 2, 8+ = check if Level 3)
2. Does it fit into an existing epic? (Yes = likely Level 1, No = Level 2+)
3. Does it require changes across multiple system modules? (Yes = likely Level 2-3)
4. Can I split it into 2+ independent epics? (Yes = Level 3)
5. Is it technically simple or complex? (Simple = Level 1-2, Complex = Level 2-3)

**PHASE 1 OUTPUT:**

```markdown
## Complexity Analysis

**Feature:** [feature name]
**Classification:** LEVEL [1/2/3]

**Justification:**
[Explain why it belongs to this level]

**Preliminary estimation:**

- User Stories: [estimated number]
- Total Story Points: [estimate]
- Epics needed: [number] - [names if applicable]

**Existing epic (if applicable):** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name} or "N/A — requires a new epic"

**Identified dependencies:**
[List dependencies with other epics or systems — sources: PRD/SRS sequencing, master-plan Master Sprints, business-data-map. Never invent.]
```

---

## 📝 PHASE 2A: CREATE INDIVIDUAL STORY (Level 1)

**Prerequisite:** Feature classified as Level 1.

### Step 1: Identify Parent Epic

**Action:** Determine which existing epic this story belongs to.

**Reference:** Review `.context/PBI/epic-tree.md` to list existing epics.

**Output:**

```markdown
**Selected epic:** EPIC-{PROJECT_KEY}-{NUM}-{name}
**Reason:** [Why this story belongs to this epic]
```

---

### Step 2: Create Story in Jira

**Action:** Ask `[ISSUE_TRACKER_TOOL]` to create a `Story`-type issue in the resolved project. DO NOT cite tool syntax — the skill resolver (`/acli` or other) owns it. For the operation → tool-layer matrix, see `references/jira-operations.md`. Before writing rich-text fields, read `references/jira-publishing-gotchas.md` for the two known ADF bugs.

**Issue data:**

- **Project:** PROJECT_KEY resolved from `.agents/project.yaml`.
- **Issue type:** Story.
- **Summary:** Pattern `{Feature} | {Action}` (see "Summary nomenclature"). No functional-spec prefix; no `As a … so that …` sentence in the summary — that goes in the body `## User story`.
- **Description (body):** first line `**Source spec:** FR-XXX` when applicable. Body contains `## User story`, `## Definition of done`, and optional overflow for business rules / workflow / mockups / technical notes. **NEVER** include `## Acceptance Criteria`, `## Scope`, or `## Out of Scope` — those live in custom fields (see "No content duplication").
- **Epic Link:** Jira key of the parent epic identified in Step 1.
- **Priority:** High | Medium | Low.
- **Labels:** `feature-extension`, `post-mvp` (adjust as appropriate).

**Custom fields (slug-resolved):**

| Slug                                       | Content                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `{{jira.acceptance_criteria}}`     | Minimum 3 Given/When/Then scenarios (1 happy + 2 error/edge). Each scenario wrapped in a ```gherkin code-fence (anti-pattern `I17`). Persona-observable language; no endpoints, HTTP codes, table names, framework names (anti-pattern `I15`). |
| `{{jira.scope}}`                           | In-scope only (bullet list). Bullets describe capabilities the persona gains, not endpoints / tables / services (anti-pattern `I15`). |
| `{{jira.out_of_scope}}`                    | Explicit exclusions (complementary to `scope`, no cross-pollination), also in capability voice. |
| `{{jira.story_points}}`                    | **OPT-IN ONLY**. Leave EMPTY unless the user explicitly requested estimation in this session. When opted-in: Fibonacci (1, 2, 3, 5, 8); 13+ → split. See anti-pattern `I16`. |
| `{{jira.business_rules_specification}}`    | Business rules (optional). Domain rules (boundaries, role gates, retry/audit semantics) — NOT internal algorithms. |
| `{{jira.mockup}}`                          | Figma URLs / designs (optional)                                                  |
| `{{jira.workflow}}`                        | Persona-flow description when complex (optional). NO code-walkthrough.  |
| `{{jira.weblink}}`                     | App URL ONLY when known with certainty (conditional, see note in slugs section) |

**Procedure:**

1. Ask `[ISSUE_TRACKER_TOOL]` to create the `Story`-type issue with the fields above.
2. Link to the parent epic via epic link.
3. Populate slug-resolved custom fields per the table.
4. **Capture the assigned Jira Key** (format `{PROJECT_KEY}-{ISSUE_NUM}`).

**ADF note:** if you write multiple rich-text custom fields in a single update batch, split per field or pre-convert via `md-to-adf.ts` — see `references/jira-publishing-gotchas.md`.

---

### Step 3: Transition story to the default status

**Action:** Once created, ask `[ISSUE_TRACKER_TOOL]` to transition the story to the status declared in `{{jira.statuses.story_default}}` (literal default `Shift-Left QA` if the slug is not configured in the workspace).

If the project's workflow does not offer that transition from the initial status (`To Do`), report the gap to the user and leave the story in its initial status — do not force an arbitrary transition.

---

### Step 3.5: Active Dependency Discovery (MANDATORY, before linking)

Anti-pattern `I18` requires an **active** discovery pass before any link is created.

1. Read `.context/PBI/epic-tree.md` — stories of the same epic + related epics.
2. Read `.context/business/business-data-map.md` if present — entity-level relations.
3. Query via `[ISSUE_TRACKER_TOOL]` the current link graph of the new story and of its possible neighbors in the parent epic.
4. Build a candidate matrix `(from, to, link_type_slug, source-of-decision)` where `source-of-decision` ∈ `{prd-sequencing, srs-sequencing, master-implementation-plan, business-data-map, local-declaration}`.
5. **Filter noise**: discard candidates whose only justification is a global / infrastructural prerequisite (auth exists, DB exists, framework is wired up). Those are properties of the project, not dependencies between stories.
6. **Heuristic**: does the candidate dependency disappear if we reorder sprints? YES → global noise, drop. NO → real feature-level dependency, keep.
7. Surface the filtered matrix to the user and wait for confirmation before creating any link in Step 4.

---

### Step 4: Link Dependencies in Jira

**Action:** For every dependency the user confirmed in Step 3.5, create it as a Jira issue link. Full details → `references/dependency-linking.md`.

**Valid dependency sources** (no others; never invent):

- Explicit sequencing in PRD / SRS / functional-specs.
- Master Sprint ordering in `.context/master-implementation-plan.md`.
- Entity-level relations in `.context/business/business-data-map.md`.
- Explicit `Blocked By` / `Blocks` declarations in the local `story.md` (Step 5).

**How:**

- Primary slug: `{{jira.link_types.dependencies}}` (outward = "depends on", inward = "is dependency for").
- If the workspace does not declare the `dependencies` slug and the catalog declares `{{jira.link_types.dependencies.fallback}}` (typically `relates`), use it and **explicitly flag the degradation** — `relates` is symmetric and direction is lost.
- For hard blockers, use `{{jira.link_types.blocks}}` (Jira built-in).
- Ask `[ISSUE_TRACKER_TOOL]` to create the link respecting directionality: `outwardIssue = dependent`, `inwardIssue = prerequisite`.

**Reporting:** after creating the links, report a `from → to → type → source-of-decision` matrix so the user can audit it.

---

### Step 5: Create Local Story Folder

**Action:** Create the local folder using the Jira Key obtained in Step 2.

**Naming:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/`

**Location:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{name}/stories/`

**Example:**

If PROJECT_KEY = "MYM", the parent epic is "MYM-13", and Jira assigned issue number = 45, then the full Jira Key is "MYM-45".

Create folder:

```
.context/PBI/epics/EPIC-MYM-13-{epic-name}/stories/STORY-MYM-45-{story-name}/
```

(Where `{epic-name}` and `{story-name}` are inferred from the current project's domain analysis.)

---

### Step 6: Create story.md File

**INVEST criteria for User Stories:**

| Criterion       | Description                                            | Validation                              |
| --------------- | ------------------------------------------------------ | --------------------------------------- |
| **I**ndependent | The story can be developed without depending on others | Can it be completed in isolation?       |
| **N**egotiable  | Details can be adjusted during development             | Is there flexibility in implementation? |
| **V**aluable    | Delivers value to the user or the business             | Is the "so that" clear and valuable?    |
| **E**stimable   | Effort can be estimated with the info given            | Can the team assign story points?       |
| **S**mall       | Can be completed in a sprint (max 8 story points)      | Less than 8 SP? If not, split.          |
| **T**estable    | Acceptance criteria are verifiable                     | Are the scenarios clear and measurable? |

**`story.md` file structure** (local, does NOT mirror Jira description 1:1):

```markdown
**Source spec:** FR-XXX  <!-- first line, omit if not applicable -->

# [Story Title]

**Jira Key:** [real Jira key, e.g. MYM-45]
**Epic:** [EPIC-{PROJECT_KEY}-{NUM}] ([Epic Title])
**Priority:** [High | Medium | Low]
**Story Points:** [1, 2, 3, 5, 8, 13]
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

[Other stories that must complete first — Jira keys]

### Blocks

[Which stories depend on this one — Jira keys]

### Related Stories

[Related stories — informational, not blocking]

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

**Important notes:**

- **AC, Scope, Out-of-Scope are NOT replicated in `story.md`** — they live only in their custom fields Jira-side. See `references/description-custom-field-dedup.md`.
- The local `## Business Rules`, `## Workflow`, `## Mockups` sections are optional mirrors for developers who prefer to read everything in the filesystem; they must be kept in sync with their respective slugs during refinement.

**Expected output:** `.context/PBI/epics/EPIC-[...]/stories/STORY-[...]/story.md`

---

### Step 7: Update epic.md

**Action:** Add the new story to the list of user stories in the parent epic's `epic.md`.

**Find the "User Stories" section and add:**

```markdown
## User Stories

[... existing stories ...]
X. **{PROJECT_KEY}-{ISSUE_NUM}** - As a [user-type], I want to [action on entities] so that [benefit]
```

(Where `{PROJECT_KEY}` and `{ISSUE_NUM}` are the ones obtained in Step 2, and `[user-type]`, `[action on entities]`, and `[benefit]` are determined from the analysis of the current project.)

---

### Step 8: Update epic-tree.md

**Action:** Add the new story to the backlog's visual tree.

**Example:**

```markdown
EPIC-{PROJECT_KEY}-{NUM}: [Epic Title per domain]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 1]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 2]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 3]
└── STORY-{PROJECT_KEY}-{ISSUE_NUM}: [New story title] ⭐ NEW
```

(Story and epic names are determined by analyzing the current project's domain.)

---

## ✅ PHASE 2A COMPLETED

**Result:**

- ✅ Story created in Jira with real ID
- ✅ Story transitioned to the default status (`{{jira.statuses.story_default}}`)
- ✅ Dependencies published as Jira issue links (when applicable)
- ✅ Local folder created with correct naming
- ✅ `story.md` file complete (no AC/Scope/OOS duplicated)
- ✅ epic.md updated
- ✅ epic-tree.md updated

---

## 📝 PHASE 2B: CREATE FULL EPIC (Level 2)

**Prerequisite:** Feature classified as Level 2.

### Step 1: Define Epic and Stories

**Action:** Define the new epic and decompose it into user stories.

**Output:**

```markdown
## New Epic

**Title:** [Epic name]
**Description:** [2-3 paragraphs explaining the epic]
**Priority:** High | Medium | Low
**Business Value:** [Why it matters]

## Identified User Stories

1. As a [user], I want to [action], so that [benefit] - [X pts]
2. As a [user], I want to [action], so that [benefit] - [X pts]
3. As a [user], I want to [action], so that [benefit] - [X pts]
   ...

**Total estimated:** [sum of story points]
**Number of stories:** [number]
```

---

### Step 2: Create Epic in Jira

**Action:** Ask `[ISSUE_TRACKER_TOOL]` to create an `Epic`-type issue in the resolved project. For the operation → tool-layer matrix, see `references/jira-operations.md`. Before writing rich-text fields (description), read `references/jira-publishing-gotchas.md`.

**Issue data:**

- **Project:** PROJECT_KEY resolved from `.agents/project.yaml`.
- **Issue type:** Epic.
- **Summary:** Epic name (no functional-spec prefix).
- **Description (body):** detailed 2-3 paragraph description. If the epic maps to a set of FRs, the body may list the reference (e.g. "Covers FR-101 … FR-108"). DO NOT duplicate AC/Scope in the description.
- **Priority:** High | Medium | Low.
- **Labels:** `post-mvp`, `new-feature`.

**Procedure:**

1. Ask `[ISSUE_TRACKER_TOOL]` to create the `Epic`-type issue.
2. **Capture the assigned Jira Key** (format `{PROJECT_KEY}-{ISSUE_NUM}`).

---

### Step 3: Transition epic to the default status

**Action:** Ask `[ISSUE_TRACKER_TOOL]` to transition the newly created epic to the status declared in `{{jira.statuses.epic_default}}` (literal default `Planning` if the slug is not configured).

---

### Step 4: Create Local Epic Folder

**Naming:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/`

**Example:**

If PROJECT_KEY = "MYM" and Jira assigned issue number = 50, the full Jira Key is "MYM-50".

Create folder:

```
.context/PBI/epics/EPIC-MYM-50-{name-per-domain}/
```

(Where `{name-per-domain}` is inferred from the current project's PRD/SRS analysis.)

---

### Step 5: Create epic.md File

**Full structure (same as the `product-backlog-seed.md` prompt)**

Includes every section:

- Epic Description
- User Stories (with TBD IDs for now)
- Related Functional Requirements (FR-XXX reference at body level, not in the summary)
- Technical Considerations
- Dependencies
- Success Metrics
- Risks & Mitigations
- Testing Strategy (reference to future files)
- Implementation Plan (reference to future files)
- Notes
- Related Documentation

**Important:** the LOCAL `epic.md` does not replicate `## Acceptance Criteria (Epic Level)`, `## Scope`, or `## Out of Scope` when those live in epic-side custom fields. If the workspace does not expose them as epic custom fields, they may live in the local `epic.md` — but the decision is documented once per project in `description-custom-field-dedup.md`.

**IMPORTANT:** Clearly mark it as a post-MVP feature.

---

### Step 6: Create Stories in Jira

**Action:** For each user story defined in Step 1, ask `[ISSUE_TRACKER_TOOL]` to create it.

**Per-story data:** same contract as Phase 2A Step 2 (summary without functional-spec prefix; description with `**Source spec:**` as the first line when applicable; AC/Scope/OOS exclusively in custom fields).

**Slug-resolved custom fields per story:**

| Slug                                       | Content                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `{{jira.acceptance_criteria}}`     | Given/When/Then scenarios, wrapped in a ` ```gherkin ` fenced code block (anti-pattern `I17`). Persona-observable language; no endpoints, HTTP codes, table names, framework names (anti-pattern `I15`). |
| `{{jira.scope}}`                           | In-scope only. Capabilities, not endpoints (anti-pattern `I15`).                                 |
| `{{jira.out_of_scope}}`                    | Explicit exclusions. Deferred capabilities, not deferred endpoints (anti-pattern `I15`).                    |
| `{{jira.story_points}}`                    | **EMPTY by default** (anti-pattern `I16`) — only populate when the user explicitly asked for estimation. If opted-in: Fibonacci 1, 2, 3, 5, 8; 13+ → split. |
| `{{jira.business_rules_specification}}`    | Domain rules (boundaries, role gates, retry semantics, audit guarantees). NOT internal algorithms (anti-pattern `I15`). Optional. |
| `{{jira.mockup}}`                          | Design URLs (optional)                                                          |
| `{{jira.workflow}}`                        | User flow narrative (NOT code path walkthrough — anti-pattern `I15`). Optional.                  |
| `{{jira.weblink}}`                     | App URL (conditional, omit when in doubt)                                         |

**Procedure:**

1. Create each story linked to the newly created epic.
2. Populate the slug-resolved custom fields.
3. **Capture the Jira Key** of every story.

**ADF note:** multi-field updates must be split per field or pre-converted. See `references/jira-publishing-gotchas.md`.

---

### Step 7: Transition stories to the default status

**Action:** For every story created in Step 6, ask `[ISSUE_TRACKER_TOOL]` to transition it to the status declared in `{{jira.statuses.story_default}}` (literal default `Shift-Left QA`).

---

### Step 7.5: Active Dependency Discovery (MANDATORY, before linking)

Anti-pattern `I18` requires an **active** discovery pass before any internal link of the newly created epic is created.

1. Read `.context/PBI/epic-tree.md` — stories of the newly created epic + related epics that already exist.
2. Read `.context/business/business-data-map.md` if present — entity-level relations between the entities these stories touch.
3. Query via `[ISSUE_TRACKER_TOOL]` the current link graph of every story created in Step 6.
4. Build the candidate matrix `(from, to, link_type_slug, source-of-decision)`.
5. **Filter noise**: discard candidates justified only by global / infrastructural prerequisites. Keep only feature-level dependencies between specific stories of the epic (or cross-epic when explicit).
6. **Heuristic**: does it disappear if we reorder sprints? YES → discard. NO → keep.
7. Surface the filtered matrix to the user and wait for confirmation before creating any link in Step 8.

---

### Step 8: Link Dependencies Between Stories

**Action:** For every dependency the user confirmed in Step 7.5, publish it as a Jira issue link. Full details → `references/dependency-linking.md`.

**Valid sources** (never invent):

- Explicit sequencing in PRD / SRS / functional-specs.
- Master Sprint ordering in `.context/master-implementation-plan.md`.
- Entity-level relations in `.context/business/business-data-map.md`.
- Explicit `Blocked By` / `Blocks` declarations in each local `story.md` (populated in Step 10).

**How:**

- Primary slug: `{{jira.link_types.dependencies}}` with `outwardIssue = dependent`, `inwardIssue = prerequisite`.
- Fallback (when the workspace lacks the slug): `{{jira.link_types.dependencies.fallback}}` — flag the degradation because `relates` is symmetric.
- Hard blockers: `{{jira.link_types.blocks}}`.

**Reporting:** `from → to → type → source` matrix at the end of the step.

---

### Step 9: Cross-story Scope overlap check

**Action:** Before moving to sprint-sequencing, pairwise-audit the bullets of `{{jira.scope}}` across all child stories of the epic.

**Procedure:**

1. For each story pair `(A, B)` within the epic, literally compare the contents of `{{jira.scope}}` bullet-by-bullet.
2. If two stories share an identical bullet (case-insensitive, trimmed) → surface to the user:
   ```
   overlap_alert: <KEY-A> vs <KEY-B> on bullet "<text>"
   ```
3. **DO NOT auto-resolve.** Offer the user three explicit options:
   - **(a) Move the bullet** to a single owning story (the bullet is removed from the other).
   - **(b) Extract a shared dependency story** that contains the bullet and that both depend on.
   - **(c) Accept the duplicate** if it is intentional shared context (rare; document the rationale in both `story.md` files).

Conceptual detail of clean slicing and the related anti-pattern (`I4`) → `SKILL.md` Anti-patterns.

---

### Step 10: Create Local Story Folders

**Action:** For every created story, create its local folder.

**Naming:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{descriptive-name}/`

**Location:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{epic-name}/stories/`

**Example:**

If PROJECT_KEY = "MYM", parent epic = "MYM-50", and stories with issue numbers 51, 52, 53:

```
.context/PBI/epics/EPIC-MYM-50-{epic-name}/stories/
├── STORY-MYM-51-{story-name-1}/
├── STORY-MYM-52-{story-name-2}/
└── STORY-MYM-53-{story-name-3}/
```

(Where `{epic-name}` and `{story-name-X}` are inferred from the current project's domain analysis.)

---

### Step 11: Create story.md Files

**Action:** Create a `story.md` for each story (same structure as Phase 2A Step 6).

**IMPORTANT:**

- Mark them as post-MVP feature stories.
- `**Source spec:** FR-XXX` as the first line when applicable.
- DO NOT include `## Acceptance Criteria` / `## Scope` / `## Out of Scope` in the local `story.md` — they live in Jira-side custom fields.
- `Blocked By` / `Blocks` declarations in every `story.md` must match the issue links created in Step 8.

---

### Step 12: Update epic.md With Real IDs

**Action:** Update the "User Stories" section of `epic.md` with the real Jira keys.

**Example:**

```markdown
## User Stories

1. **{PROJECT_KEY}-51** - As a [user-type], I want to [action 1] so that [benefit]
2. **{PROJECT_KEY}-52** - As a [user-type], I want to [action 2] so that [benefit]
3. **{PROJECT_KEY}-53** - As a [user-type], I want to [action 3] so that [benefit]
```

(Where `{PROJECT_KEY}` is the one from input, the numbers are Jira-assigned, and the user stories are determined by analyzing the current project.)

---

### Step 13: Update epic-tree.md

**Action:** Add the new epic to the backlog's visual tree.

**Example:**

```markdown
[... existing MVP epics ...]

---

## Post-MVP Features

### ⭐ EPIC-{PROJECT_KEY}-{NUM}: [Epic Title per domain]

**Jira Key:** {PROJECT_KEY}-{ISSUE_NUM}
**Status:** [current status]
**Priority:** MEDIUM (Post-MVP)
**Description:** [Description per current project's domain analysis]

**User Stories (X):**

1. **{PROJECT_KEY}-{NUM}** - [Story title 1]
2. **{PROJECT_KEY}-{NUM}** - [Story title 2]
3. **{PROJECT_KEY}-{NUM}** - [Story title 3]

**Related Functional Requirements:** [FR list at body level, optional]
```

---

### Step 14 (final): Sprint sequencing

**Action:** After ALL stories exist, all dependency links are published, and the overlap check passed (or was resolved), run sprint-sequencing.

Full details (Kahn algorithm, cycle detection, output schema) → `references/sprint-sequencing.md`.

**Output:** this step ALWAYS persists the result to `.context/PBI/sprint-sequence.md` (overwrite on re-run).

**When to re-run:** whenever the dependency graph changes (new stories, new links, removed links).

**Critical rules** (summary, source: `sprint-sequencing.md`):

- Only `dependencies` and `Blocks` contribute to the topological sort. `Relates` is informational.
- Cycle detection is mandatory: if the graph does not drain and no node has in-degree zero → halt + report. Never silence.
- The output is input to human planning, **never a commitment**.

---

## ✅ PHASE 2B COMPLETED

**Result:**

- ✅ Epic created in Jira with real ID and transitioned to `{{jira.statuses.epic_default}}`
- ✅ Local epic folder created
- ✅ `epic.md` file complete (no AC/Scope duplicated when they live in epic custom fields)
- ✅ All stories created in Jira with real IDs
- ✅ Stories transitioned to `{{jira.statuses.story_default}}`
- ✅ Dependencies published as issue links (matrix reported)
- ✅ Scope overlap check completed (alerts resolved by the user)
- ✅ Local story folders created
- ✅ `story.md` files complete (no AC/Scope/OOS duplicated)
- ✅ `epic.md` updated with real IDs
- ✅ `epic-tree.md` updated
- ✅ Sprint sequencing executed and persisted to `.context/PBI/sprint-sequence.md`

---

## 🚨 PHASE 2C: MULTIPLE EPICS — WARNING AND PLAN (Level 3)

**Prerequisite:** Feature classified as Level 3.

### ⚠️ CRITICAL WARNING

**The provided idea is TOO COMPLEX to be created directly.**

This feature requires **multiple epics** with dependencies and broad scope. Creating every epic at once would lead to:

❌ Token overload
❌ Disorganized context
❌ Mismanaged dependencies
❌ Risk of inconsistencies
❌ Hard to plan correctly

---

### 📋 RECOMMENDED PLAN

**Action:** DO NOT create anything yet. First, generate a split plan.

**Expected output:**

```markdown
# Implementation Plan: [Feature Name]

## 🚨 WARNING

This feature requires **[number] epics** to implement correctly.

**IMPORTANT:** Do NOT proceed with creation until this plan has been reviewed and approved.

---

## Complexity Analysis

**Estimated total scope:**

- Required epics: [number]
- Estimated user stories: [total number]
- Total story points: [estimate]
- Estimated duration: [Master Sprints]

**Why multiple epics?**
[Explain the reasons: technical complexity, separate domains, dependencies, etc.]

---

## Recommended Split Into Epics

### EPIC 1: [Name]

**Priority:** CRITICAL | HIGH | MEDIUM
**Master Sprint:** [N — reference to `.context/master-implementation-plan.md` §5 when present]
**Description:** [1-2 paragraphs]

**Estimated user stories:** [number]
**Story Points:** [total]

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
**Story Points:** [total]

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

> **Terminology note:** "Master Sprint" groups strategically at roadmap level (`.context/master-implementation-plan.md`). "Execution Sprint" is the output of the dependency-driven topological sort, derivable only after stories + links are created (see `references/sprint-sequencing.md`).

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

Re-run this reference, but now with **ONE epic at a time**:

Input for the first run:
"Implement EPIC 1 of the plan: [Epic name]
[Paste EPIC 1 description and scope from the plan]"

→ This will be classified as LEVEL 2 → Create full epic (Phase 2B), which includes story creation, transitions, dependency-linking, scope overlap check, and sprint sequencing.

Repeat for each epic following the recommended order.

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

---

## ✅ PHASE 2C COMPLETED

**Result:**

- ✅ Detailed split plan generated
- ✅ Clear warning to the user
- ⚠️ NO epic/story created (awaiting approval)
- ✅ Clear roadmap of next steps
- ✅ User knows to split the idea and execute incrementally (each epic → full Phase 2B)

---

## 📋 NAMING AND STANDARDS

### Folder Naming

**Epics:**

```
EPIC-{PROJECT}-{NUMBER}-{descriptive-name}/
```

**Stories:**

```
STORY-{PROJECT}-{NUMBER}-{descriptive-name}/
```

**Rules:**

- Use kebab-case in names
- IDs without leading zeros (MYM-2, not MYM-002)
- Descriptive but concise names (2-4 words)
- DO NOT use snake_case, CamelCase, or spaces
- ALWAYS use real Jira IDs (Jira-First flow)

### Summary nomenclature (reminder)

- Story summary = `{Feature} | {Action}` (canonical §Story title format / I20). The `As a … so that …` sentence lives in the body `## User story`, never the summary.
- Domain-entity feature prefixes carry the `TMS-` tag (`TMS-US`, `TMS-Module`, …); cross-cutting features stay plain.
- **Never** prefix story / epic summaries with the functional-spec reference (e.g. `FR-XXX` followed by em-dash and title).
- `**Source spec:** FR-XXX` as the first body line, omittable.

---

## 🎯 FLOW SUMMARY

### Individual Story (Level 1)

```
1. Analyze → Classify as Level 1
2. Identify existing parent epic
3. Create story in Jira → Capture ID
4. Transition story to {{jira.statuses.story_default}}
5. Link dependencies (when applicable) → see dependency-linking.md
6. Create local folder STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/
7. Create story.md (no AC/Scope/OOS duplicated)
8. Update parent epic.md
9. Update epic-tree.md
✅ Completed
```

### Full Epic (Level 2)

```
 1. Analyze → Classify as Level 2
 2. Define epic and decompose into stories
 3. Create epic in Jira → Capture ID
 4. Transition epic to {{jira.statuses.epic_default}}
 5. Create local folder EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/
 6. Create epic.md
 7. Create every story in Jira → Capture IDs
 8. Transition stories to {{jira.statuses.story_default}}
 9. Link internal dependencies → see dependency-linking.md
10. Cross-story Scope overlap check (pairwise)
11. Create local story folders
12. Create story.md files (no AC/Scope/OOS duplicated)
13. Update epic.md with real IDs
14. Update epic-tree.md
15. Sprint sequencing (final) → persists .context/PBI/sprint-sequence.md
✅ Completed
```

### Multiple Epics (Level 3)

```
1. Analyze → Classify as Level 3
2. ⚠️ WARNING: too complex
3. Generate a detailed split plan (with Master Sprints as a strategic grouping)
4. STOP — do not create anything
5. User reviews the plan
6. User splits the idea
7. User re-runs this reference for each epic (→ Level 2 / full Phase 2B)
✅ Plan generated — awaiting split
```

---

## 🚨 IMPORTANT VALIDATIONS

### Before Creating in Jira

- ✅ Is the story/epic name descriptive and clear?
- ✅ Is the summary in `{Feature} | {Action}` format (I20), with the `As a … so that …` sentence in the body `## User story` and NOT in the summary?
- ✅ Is the summary free of the functional-spec prefix (e.g. `FR-XXX` with em-dash and title)?
- ✅ Are acceptance criteria in Gherkin format **wrapped in a ```gherkin code-fence** (anti-pattern `I17`)?
- ✅ **Voice gate**: do AC / Scope / Out-of-Scope / Workflow describe persona-observable behavior, with no endpoints, HTTP status codes, table names, framework names, or internal algorithms (anti-pattern `I15`)? Exception: persona = API consumer.
- ✅ **Persona grounding**: does the `As a` name a persona that exists in `.context/PRD/user-personas.md` (anti-pattern `I19`)?
- ✅ **Story Points policy**: is `{{jira.story_points}}` left EMPTY unless the user explicitly requested estimation in this session (anti-pattern `I16`)?
- ✅ **Active Dependency Discovery executed**: did the active pass run (Step 3.5 or 7.5), was global noise filtered out, and did the user confirm the matrix before any link (anti-pattern `I18`)?
- ✅ Does the parent epic (when applicable) actually exist?
- ✅ Was `description-custom-field-dedup.md` reviewed to avoid duplication?

### After Creating in Jira

- ✅ Did you capture the real assigned Jira Key?
- ✅ Did you verify the epic link was created correctly?
- ✅ Does the issue have every required field populated (slug-resolved)?
- ✅ Did you transition to the default status (`story_default` / `epic_default`)?
- ✅ Did you publish the dependencies as issue links?
- ✅ (Level 2) Did the Scope overlap check pass?
- ✅ (Level 2) Did you run sprint-sequencing and did it persist `.context/PBI/sprint-sequence.md`?

### When Creating Local Files

- ✅ Does the folder naming use the real Jira ID?
- ✅ Is the format EPIC-{PROJECT}-{NUM}-{name}?
- ✅ Did you use kebab-case in the descriptive name?
- ✅ Do the `.md` files carry every required piece of information AND not duplicate AC/Scope/OOS?

---

## 📚 GENERATED FILES

Depending on the level, the following are generated:

### Level 1 (Individual Story)

```
.context/PBI/epics/EPIC-{PROJECT}-{NUM}-{name}/stories/
└── STORY-{PROJECT}-{NUM}-{name}/
    └── story.md
```

**Updated files:**

- Parent epic's `epic.md`
- `epic-tree.md`

---

### Level 2 (Full Epic)

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

**Updated files:**

- `epic-tree.md`
- `.context/PBI/sprint-sequence.md` (generated/overwritten by sprint-sequencing)

---

### Level 3 (Split Plan)

```
[NO files created — only the plan is generated in the response]
```

**Next files (after the split):**

- Multiple epics will be created via Level 2 (each one includes its own sprint-sequence).

---

## ⚙️ PREREQUISITES

**Required:**

- Existing and configured Jira project.
- `[ISSUE_TRACKER_TOOL]` resolved and operational (primary `/acli`, fallback Atlassian MCP — see `CLAUDE.md` §6).
- `.agents/project.yaml`, `.agents/jira-required.yaml`, `.agents/jira-fields.json`, `.agents/jira-workflows.json` present and synced (`bun run jira:sync-fields` executed at least once).
- `.context/PBI/epic-tree.md` up to date (to review existing epics).

**Optional but recommended:**

- `.agents/jira-link-types.json` — required for robust dependency-linking (populated by `bun run jira:sync-link-types` when the script exists).
- `.context/master-implementation-plan.md` — to align with strategic Master Sprints.
- `.context/PRD/mvp-scope.md` — product context.
- `.context/SRS/functional-specs.md` — technical context and FR catalog.
- `.context/SRS/architecture-specs.md` — validation of architectural changes.
- `.context/business/business-data-map.md` — to infer real entity-level dependencies.

---

## 💡 USAGE TIPS

### For Individual Story (Level 1)

- Be specific in the improvement description
- Explicitly mention the existing epic when already identified
- Provide context on why it is needed now

### For Full Epic (Level 2)

- Describe the business value clearly
- Explain what problem the feature solves
- Provide example use cases when possible
- Remember: dependency-linking + scope overlap check + sprint-sequencing are **mandatory** phases at the end, not optional

### For Complex Ideas (potential Level 3)

- If you suspect it is complex, mention your doubts
- Provide every piece of available information
- Trust the analysis to classify correctly

### In General

- DO NOT force a specific classification
- Let the analysis determine the level objectively
- If the analysis says "Level 3", DO NOT insist on creating everything at once
- Work incrementally whenever possible

---

## 🔗 CROSS-REFERENCES

- `references/jira-operations.md` — operation → tool-layer matrix (Primary / Fallback / Last resort). Consult before any Jira write.
- `references/dependency-linking.md` — directionality table, link-type semantics, valid dependency sources, reporting.
- `references/description-custom-field-dedup.md` — body ↔ custom fields contract and audit procedure.
- `references/sprint-sequencing.md` — Kahn topological sort, output schema, cycle detection, persistence in `.context/PBI/sprint-sequence.md`.
- `references/jira-publishing-gotchas.md` — two known ADF bugs (combined `code` + `strong` marks; MCP batched custom fields) and workarounds.

---

**Format:** Markdown files + Jira issues ready for implementation.

**Last update:** 2026-05-22 — slug-based catalog refactor (custom fields + statuses + link types), dependency-linking phase, sprint sequencing, scope overlap check, dedup audit, Source spec convention.

**Complements:** `product-backlog-seed.md` (initial MVP setup), `epic-creation.md`, `story-refinement.md`.
