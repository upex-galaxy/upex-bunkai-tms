# Epic Creation

> **Purpose**: Create a well-formed epic — naming, structure, decomposition into stories, and the `epic.md` template that lives alongside the Jira issue.
> **Use when**: A new feature is too big for a single story (3+ stories needed) or you are seeding a brand-new product backlog.
> **Companion references**:
>
> - `product-backlog-seed.md` — for the very first backlog (multiple epics at once)
> - `add-feature.md` — for adding a feature to an existing backlog (decides if you need an epic)
> - `story-refinement.md` — once the epic is created, refine each story before development
> - `acceptance-criteria.md` / `edge-cases-enumeration.md` — for refined ACs per story
> - `jira-operations.md` — issue tracker pseudo-code (create / transition / link)
> - `dependency-linking.md` — how to link stories via `{{jira.link_types.dependencies}}`
> - `description-custom-field-dedup.md` — keep description body free of AC / Scope / OOS duplication
> - `sprint-sequencing.md` — Execution Sprint ordering after the epic decomposition
> - `jira-publishing-gotchas.md` — rich-text field encoding pitfalls (ADF, code blocks, lists)

---

## Inputs — read these first

Before creating any epic, read these in order. Skip files marked **optional** if they do not exist yet.

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping.
4. `.agents/jira-workflows.json` — workflow + transition catalog.
5. `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md` — Master Sprint roadmap (use to set the epic's Master Sprint).
7. `.context/PRD/mvp-scope.md` — what's in vs out of the MVP.
8. `.context/PRD/user-personas.md` — actor model.
9. `.context/PRD/user-journeys.md` — flow-level expectations.
10. `.context/SRS/functional-specs.md` — FR catalog (source of `**Source spec:** FR-XXX` references on each child story).
11. `.context/SRS/non-functional-specs.md` — NFRs (performance, security, accessibility).
12. `.context/business/business-data-map.md` — entity graph (source of entity-level dependencies). **Optional** at seed time.
13. `.context/business/business-feature-map.md` — CRUD matrix. **Optional** at seed time.
14. `.context/business/business-api-map.md` — endpoint catalog (auth model, journey breakdown). **Optional** at seed time.
15. `.context/PBI/epic-tree.md` — current backlog state (skip if seeding from scratch).

**Optional inputs note.** Items 12-14 arrive after `/business-*-map` has been run. In a fresh project, the business maps may not exist yet — proceed without them and re-evaluate dependencies once the maps are seeded.

---

## What Is an Epic?

An epic is a body of work that delivers meaningful end-user value and is too large to complete in a single sprint. It groups 3-8 related user stories under one Jira parent and one local folder, gives the team a shared narrative ("why are we building this?"), and tracks progress at a feature scale rather than a task scale.

A good epic is a vertical slice of product: it crosses backend, frontend, data, and (when relevant) infrastructure — but it stops at one coherent capability. If you cannot describe it in two sentences, it is probably two epics.

---

## Identifying When You Need an Epic

Use this classification before creating anything in Jira. It is the same rubric as `add-feature.md` Fase 1, summarized for the epic decision:

| Level                    | Signal                                                                                                             | Action                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Story (Level 1)**      | Single change, fits an existing epic, 1-8 SP, no architectural shift                                               | Skip this guide — go to `add-feature.md` Fase 2A                             |
| **Epic (Level 2)**       | New capability, does NOT fit existing epics, 3-8 stories, scoped, independent, no critical cross-epic dependencies | Continue with this guide                                                     |
| **Multi-Epic (Level 3)** | 2+ epics needed, complex dependencies, architectural changes, 20+ stories estimated                                | STOP — write a plan first, then split into epics and run this guide per epic |

**Quick checks before classifying as Level 2:**

1. How many user stories will this need? (3-8 → Level 2; <3 → Level 1; >8 → revisit, likely Level 3)
2. Does it fit any existing epic? (No → Level 2)
3. Does it touch multiple system modules? (Yes → likely Level 2-3)
4. Can you split it into 2+ independent epics? (Yes → Level 3)

---

## Epic vs Feature Flag

Not every "new capability" needs a full epic. Use this table to decide:

| Use a **Feature Flag** when…                                        | Use an **Epic** when…                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| You want to gate an existing capability (A/B test, gradual rollout) | You are building a capability that does not exist yet              |
| The change is 1-2 stories with a toggle on top                      | The work spans 3+ stories with their own ACs                       |
| You need to ship dark and turn on later                             | You need product-level tracking and stakeholder visibility         |
| Reversibility (instant rollback) is the main concern                | Long-term ownership, success metrics, and roadmap placement matter |

A flag is an **implementation tactic** for a story. An epic is a **product-level container**. They are not alternatives — large epics often ship behind flags, story-by-story.

---

## Epic Sizing & Story Count

| Dimension              | Target Range | Why                                                            |
| ---------------------- | ------------ | -------------------------------------------------------------- |
| **Story count**        | 3-8 stories  | <3 → it's a story; >8 → split into multiple epics              |
| **Story points total** | 20-40 SP     | Predictable across 2-4 sprints; bigger ranges hide uncertainty |
| **Sprint span**        | 2-4 sprints  | Long enough to deliver value, short enough to stay focused     |
| **Team count**         | 1 team       | Multi-team epics need coordination overhead — split them       |

If you are above any of these ranges, that is a signal to split before you create the Jira epic.

---

## Epic Naming & Folder Structure

> Lifted from `product-backlog-seed.md` — same rules apply when adding a single epic.

**Folder format:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Examples (different projects):**

Project "MYM" (Jira issued #2 and #13):

- `EPIC-MYM-2-user-authentication-profiles/`
- `EPIC-MYM-13-entity-discovery-search/`

Project "SHOP" (Jira issued #45):

- `EPIC-SHOP-45-payment-processing/`

Project "BLOG" (Jira issued #1):

- `EPIC-BLOG-1-content-management-system/`

**Invalid examples:**

- `EPIC-001-user-auth/` (missing PROJECT_KEY)
- `EPIC_MYM_2_UserAuth/` (wrong format — must use hyphens)
- `EPIC-MYM-002-auth/` (no leading zeros — Jira never generates them)
- `EPIC-MYM-2-user-authentication-and-comprehensive-profile-management-system/` (name too long)

**Naming rules for `{nombre-descriptivo}`:**

- 2-4 words, kebab-case, lowercase
- Inferred from PRD/SRS domain vocabulary of the current project
- Describes the capability, not the implementation (e.g., `payment-processing`, not `stripe-integration`)

---

## Creating an Epic: Step-by-Step

### Step 1 — Create the Epic in the issue tracker

**Action:** Use `[ISSUE_TRACKER_TOOL]` to create the epic. See `references/jira-operations.md` for the pseudo-code patterns (create / transition / link). Description fields are rich-text — review `references/jira-publishing-gotchas.md` before publishing the body.

**Required data:**

- **Project:** `{{PROJECT_KEY}}`
- **Issue type:** Epic
- **Title (Summary):** Epic name from PRD (NEVER embed `FR-XXX —` prefix in the summary)
- **Description:** Detailed description (2-3 paragraphs) — body only, no AC / Scope / OOS duplication (see `references/description-custom-field-dedup.md`)
- **Priority:** High | Medium | Low
- **Labels:** `mvp`, `fase-1` (or `post-mvp`, `new-feature` for additions — adjust as appropriate)

**Instructions:**

1. Invoke `[ISSUE_TRACKER_TOOL]` to create an issue of type "Epic".
2. Fill in all required fields.
3. **Capture the Issue Key** the tracker assigns to the epic.
   - Key format: `{{PROJECT_KEY}}-{ISSUE_NUM}` (e.g., `MYM-13`, `SHOP-45`, `BLOG-1`)

**Expected result:**

- Epic created in the tracker.
- Full Issue Key captured (e.g., `MYM-13`).
- `ISSUE_NUM` extracted for the local folder name.

---

### Step 1b — Transition the epic to its default status

**Action:** Right after creation, transition the epic to its default working status so it appears on the planning board.

Use `[ISSUE_TRACKER_TOOL]` with the transition resolved from `{{jira.statuses.epic_default}}` (literal default: `Planning`). See `references/jira-operations.md` for the transition pseudo-code and how to read the workflow catalog. If the slug is unresolved, fall back to the literal `Planning` and flag the missing catalog entry.

**Expected result:** epic moves from the tracker's initial creation state to `Planning` (or the workspace-configured equivalent).

---

### Step 2 — Create the Local Epic Folder

**Action:** Create the folder using the Jira Key obtained in Step 1.

**Naming:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Example:**

If `PROJECT_KEY = "MYM"` and Jira assigned issue number `13`, the full Jira Key is `MYM-13`.

Create:

```
.context/PBI/epics/EPIC-MYM-13-{nombre-segun-dominio}/
```

(Where `{nombre-segun-dominio}` is inferred from the current project's PRD/SRS.)

---

### Step 3 — Create `epic.md`

Use the template in the next section. Place the file at:

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/epic.md
```

This file is the local source of truth for the epic — it mirrors the Jira description but contains the full structured detail (scope, ACs, dependencies, success metrics).

---

## No content duplication

> **Callout — applies to the epic body AND every child story.** The epic description body MUST NOT duplicate content that belongs in dedicated custom fields on child stories (Acceptance Criteria, In Scope, Out of Scope). The epic body carries narrative + outcomes; the AC / Scope / OOS detail lives on each child story in its dedicated custom field, NOT inside the description text. See `references/description-custom-field-dedup.md` for the full rule and examples. Rich-text encoding pitfalls when writing any of these fields: `references/jira-publishing-gotchas.md`.

---

## Epic Documentation (`epic.md` Template)

```markdown
# [Epic Title]

**Jira Key:** [Real Jira key, e.g., MYM-13]
**Status:** [ASSIGNED | IN PROGRESS | DONE]
**Priority:** [CRITICAL | HIGH | MEDIUM | LOW]
**Phase:** [Foundation | Core Features | etc.]

---

## Master Sprint

> **Soft contract.** Include this section only when `.context/master-implementation-plan.md` exists. Omit it for standalone runs (e.g. seeding before `/project-bootstrap`) — the rest of the template stands on its own.

**Master Sprint {N}** — {short rationale, 1-2 sentences explaining why this epic belongs to that Master Sprint}. See `.context/master-implementation-plan.md` §5.

---

## Epic Description

[Detailed description of the epic — 2-3 paragraphs]

**Business Value:**
[Explain the business value — why this epic matters]

---

## User Stories

1. **{PROJECT_KEY}-TBD** - As a [user], I want to [action] so that [benefit]
2. **{PROJECT_KEY}-TBD** - As a [user], I want to [action] so that [benefit]
   ...

**NOTE:** IDs will be updated when the stories are created in Jira (next step).

---

## Scope

### In Scope

- Feature 1
- Feature 2
- ...

### Out of Scope (Future)

- Features NOT included in this epic
- Future enhancements
- ...

---

## Acceptance Criteria (Epic Level)

1. ✅ Epic-level acceptance criterion 1
2. ✅ Epic-level acceptance criterion 2
3. ✅ Epic-level acceptance criterion 3
   ...

---

## Related Functional Requirements

- **FR-XXX:** [FR description]
- **FR-YYY:** [FR description]

See: `.context/SRS/functional-specs.md`.

**Note on FR placement.** At the **epic level**, list the relevant FRs here in the description body. At the **story level**, the `**Source spec:** FR-XXX` line is the FIRST body line of the story description — NEVER embed `FR-XXX —` into the story summary. See `references/description-custom-field-dedup.md` for the description-vs-custom-field boundary.

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

See: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/feature-implementation-plan.md` (created during sprint planning)

### Recommended Story Order

1. [KEY-1] - [Story title] - Foundation
2. [KEY-2] - [Story title] - Core logic
   ...

### Estimated Effort

- **Development:** [X sprints / Y weeks]
- **Testing:** [X sprint / Y weeks]
- **Total:** [X sprints]

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

## Epic-Level Acceptance Criteria

Epic-level ACs are **outcomes**, not test scenarios. They describe what must be true at the end of the epic for it to count as "done":

```markdown
## Acceptance Criteria (Epic Level)

1. ✅ A user can complete the [end-to-end capability] without leaving the product
2. ✅ The capability is integrated with [related existing system]
3. ✅ Success metrics [name them] are measurable in production
4. ✅ All N user stories under this epic are marked Done
```

Story-level ACs (Gherkin Scenario / Given-When-Then) live in each story.md and get further refined in `acceptance-criteria.md`. Do not duplicate them at the epic level.

---

## Step N — Link dependencies (after all child stories exist)

**When:** This phase runs AFTER every child story under the epic has been created in the tracker (so the keys exist and can be referenced). Do not attempt linking before then — it will fail or create dangling references.

**Action:** For each dependency edge surfaced by the Internal Dependencies / Blocks blocks in `epic.md`, create an issue link in the tracker.

- Use `[ISSUE_TRACKER_TOOL]` with the link type resolved from `{{jira.link_types.dependencies}}`.
- If `{{jira.link_types.dependencies}}` is unresolved in the workspace, degrade to the fallback `{{jira.link_types.dependencies.fallback}}` (literal: `relates`) and flag the degradation in the run report — `relates` loses directional semantics.
- For "this epic blocks X" relationships, use `{{jira.link_types.blocks}}` (directional). For symmetric coupling without a blocker semantic, `relates` is acceptable.
- Description / comment fields touched during linking are rich-text — see `references/jira-publishing-gotchas.md` if you attach a justification comment.

See `references/dependency-linking.md` for the full pseudo-code, slug-resolution algorithm, and degradation handling.

**Expected result:** Every documented dependency edge has a corresponding tracker link; the run report records any fallback uses.

---

## Step N+1 — Sprint sequencing (final step before handoff)

**When:** Runs LAST, after the epic is decomposed into child stories and the dependency graph is complete (Step N done). This is the bridge between epic planning and `/sprint-development`.

**Action:** Order the child stories into **Execution Sprints** using the dependency graph as the primary constraint and value / risk as tie-breakers. Persist the ordering to `.context/PBI/sprint-sequence.md`.

- Sequence stories so that no story is scheduled before its `{{jira.link_types.dependencies}}` predecessors.
- Fill each Execution Sprint up to its capacity (story points + count) per the project's sprint rules.
- Cross-reference the epic's Master Sprint context from §`Master Sprint` above.

See `references/sprint-sequencing.md` for the full algorithm, conflict resolution, and the exact shape of `.context/PBI/sprint-sequence.md`.

**Expected result:** A persisted Execution-Sprint ordering ready for `/sprint-development` to pick up story-by-story. Any cycles or unresolved dependencies are flagged before handoff.

---

## Story Decomposition Worksheet

> Lifted from `add-feature.md` Fase 2B, Step 1. Use this worksheet to capture the breakdown before opening Jira.

```markdown
## Nueva Épica

**Title:** [Epic name]
**Description:** [2-3 paragraphs explaining the epic]
**Priority:** High | Medium | Low
**Business Value:** [Why it matters]

## User Stories Identificadas

1. As a [user], I want to [action], so that [benefit] - [X pts]
2. As a [user], I want to [action], so that [benefit] - [X pts]
3. As a [user], I want to [action], so that [benefit] - [X pts]
   ...

**Total estimated:** [sum of story points]
**Number of stories:** [count]
```

After this worksheet is complete, run the INVEST checklist (below) per story before creating them in Jira.

---

## INVEST Checklist for Stories Inside an Epic

Each story under an epic must pass INVEST. This is a lightweight pass at epic-creation time — `story-refinement.md` covers the full INVEST treatment.

| Criterion       | Check                                                         |
| --------------- | ------------------------------------------------------------- |
| **I**ndependent | Can it be completed without depending on sibling stories?     |
| **N**egotiable  | Is there flexibility in the implementation?                   |
| **V**aluable    | Does the "so that…" clearly state user/business value?        |
| **E**stimable   | Can the team assign story points with the info available?     |
| **S**mall       | Under 8 SP? If not, split before creating the Jira story.     |
| **T**estable    | Are acceptance criteria verifiable (Gherkin Scenario format)? |

For the full INVEST treatment + 3-amigos refinement guidance, see `story-refinement.md`.

---

## Epic Success Criteria

Before marking an epic as ready for development, verify:

- [ ] **Classification confirmed:** Level 2 (not a story, not multi-epic)
- [ ] **Naming compliant:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{kebab-name}`
- [ ] **Jira issue created:** Real `ISSUE_NUM` captured (no `TBD`, no leading zeros)
- [ ] **Local folder exists:** under `.context/PBI/epics/`
- [ ] **`epic.md` filled:** all sections populated, no `[placeholder]` left
- [ ] **3-8 stories listed** in the User Stories section, each with a clear "As a / I want / so that"
- [ ] **In Scope / Out of Scope** explicitly separated
- [ ] **Epic-level ACs are outcomes**, not story-level Gherkin
- [ ] **Dependencies mapped:** External / Internal / Blocks
- [ ] **Success metrics defined** (functional + business)
- [ ] **Story totals are within 20-40 SP**
- [ ] **Each story passes INVEST** (lightweight check; full check during refinement)

When all are checked, hand off each story to `story-refinement.md` for development-ready preparation.

---

## Related References (in this skill)

- `product-backlog-seed.md` — full backlog seeding flow (multiple epics at once)
- `add-feature.md` — feature classification flow (Levels 1, 2, 3)
- `story-refinement.md` — refining individual stories before sprint
- `acceptance-criteria.md` — refined ACs per story
- `edge-cases-enumeration.md` — edge case discovery per story
- `jira-operations.md` — issue tracker pseudo-code (create / transition / link)
- `dependency-linking.md` — linking stories via `{{jira.link_types.dependencies}}`
- `description-custom-field-dedup.md` — keep description body free of AC / Scope / OOS duplication
- `sprint-sequencing.md` — Execution Sprint ordering after epic decomposition
- `jira-publishing-gotchas.md` — rich-text encoding pitfalls (ADF, code blocks, lists)
