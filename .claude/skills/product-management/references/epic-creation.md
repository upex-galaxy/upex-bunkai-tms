# Epic Creation

> **Purpose**: Create a well-formed epic — naming, structure, decomposition into stories, and the `epic.md` template that lives alongside the Jira issue.
> **Use when**: A new feature is too big for a single story (3+ stories needed) or you are seeding a brand-new product backlog.
> **Companion references**:
>
> - `product-backlog-seed.md` — for the very first backlog (multiple epics at once)
> - `add-feature.md` — for adding a feature to an existing backlog (decides if you need an epic)
> - `story-refinement.md` — once the epic is created, refine each story before development
> - `acceptance-criteria.md` / `edge-cases-enumeration.md` — for refined ACs per story

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

### Step 1 — Create the Epic in Jira (MCP)

**Action:** Use the available Atlassian MCP tools to create the epic in Jira.

**Required data:**

- **Project:** `{PROJECT_KEY}`
- **Issue type:** Epic
- **Title (Summary):** Epic name from PRD
- **Description:** Detailed description (2-3 paragraphs)
- **Priority:** High | Medium | Low
- **Labels:** `mvp`, `fase-1` (or `post-mvp`, `new-feature` for additions — adjust as appropriate)

**Instructions:**

1. Use MCP tooling to create an issue of type "Epic" in Jira.
2. Fill in all required fields.
3. **Capture the Issue Number** Jira assigns to the epic.
   - Key format: `{PROJECT_KEY}-{ISSUE_NUM}` (e.g., `MYM-13`, `SHOP-45`, `BLOG-1`)

**Expected result:**

- Epic created in Jira.
- Full Jira Key captured (e.g., `MYM-13`).
- `ISSUE_NUM` extracted for the local folder name.

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

## Epic Documentation (`epic.md` Template)

```markdown
# [Epic Title]

**Jira Key:** [Real Jira key, e.g., MYM-13]
**Status:** [ASSIGNED | IN PROGRESS | DONE]
**Priority:** [CRITICAL | HIGH | MEDIUM | LOW]
**Phase:** [Foundation | Core Features | etc.]

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

- **{{PROJECT_KEY}}-XXX:** [FR description]
- **{{PROJECT_KEY}}-YYY:** [FR description]

See: `.context/SRS/functional-specs.md`

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
- **SRS:** `.context/SRS/functional-specs.md` ({{PROJECT_KEY}}-XXX to {{PROJECT_KEY}}-YYY)
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
