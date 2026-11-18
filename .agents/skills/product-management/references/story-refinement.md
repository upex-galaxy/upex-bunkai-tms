# Story refinement

> **Purpose**: take a raw story (just created in Jira or carried in from the backlog) and refine it until it is Ready for Development: sized, sliced, agreed and unambiguous.
> **Use when**: a story exists but is not ready to enter a sprint. Apply it before the story moves to "In Progress".
> **Companion references**:
>
> - `product-backlog-seed.md` / `add-feature.md`: story creation flows
> - `epic-creation.md`: when a story turns out to be an epic
> - `acceptance-criteria.md`: the deep AC refinement pass (after this guide)
> - `edge-cases-enumeration.md`: the edge-case discovery pass (after this guide)
> - `jira-operations.md`: primary / fallback / last-resort tool-layer decisions for every Jira operation
> - `dependency-linking.md`: publishing Blocked By / Blocks declarations as Jira issue links
> - `description-custom-field-dedup.md`: single-source-of-truth rule for AC / Scope / Out-of-Scope
> - `jira-publishing-gotchas.md`: ADF and MCP pitfalls when writing rich-text fields

---

## Inputs: read these first, in this order

A cold-start refinement loads these files in this sequence. Skip a file only if it is absent (artifacts of a mature project may lag at seed time: flag it and continue).

1. `.agents/project.yaml`: project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml`: canonical slug catalog (custom fields, statuses, link types).
3. `.agents/jira-fields.json`: slug to numeric custom-field-ID mapping.
4. `.agents/jira-workflows.json`: workflow and transition catalog.
5. `.agents/jira-link-types.json`: slug to workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md`: Master Sprint roadmap.
7. `.context/PRD/mvp-scope.md`: what is in and out of the MVP.
8. `.context/PRD/user-personas.md`: actor model (for the `As a` line). With no PRD (existing app), use the glossary's actors and the data map's `access-control` roles (`../SKILL.md` → "Product docs: PRD/SRS or business maps").
9. `.context/PRD/user-journeys.md`: flow-level expectations.
10. `.context/SRS/functional-specs.md`: FR catalog (source of `**Source spec:**` references).
11. `.context/SRS/non-functional-specs.md`: NFRs (performance, security, accessibility).
12. `bun run context:map business-data-context`: entity graph (source of entity-level dependencies).
13. `bun run context:map business-feature-context`: CRUD matrix.
14. `bun run context:map business-api-context`: endpoint catalog (auth model, journey breakdown).
15. `.context/PBI/epic-tree.md`: current backlog state.

Items 12-14 exist in mature projects and arrive after `/project-context` modes `data` / `features` / `api` run. They are soft prerequisites: continue refining with the rest when they are absent.

---

## What makes a good story?

A good story is small enough to verify on its own, written in the user's voice, and unambiguous about "done". It tells one story (one outcome), is testable as a black box, and has its dependencies declared up front. If two engineers read it and picture different things, it is not refined yet.

This guide takes a story from "exists in Jira" to "anyone on the team could pull it into a sprint". The deep AC and edge-case work happens in the companion references, after this pass.

---

## Story scope and sizing

> Lifted from `add-feature.md` Phase 1 (Level 1 criteria). Use this rubric to confirm a story is a story and not a hidden epic.

Work is a single story when:

- it refines or extends existing functionality
- it fits inside one existing epic
- it fits in one story (QA's AI Effort in shift-left is expected to be Low or Medium; `High` only warns, and a split is an optional PO proposal)
- it needs no architectural change
- one user story is enough to express it

Sanity checks before refining:

1. How many stories does this really need? (1: keep refining; 3-8: it is an epic, see `epic-creation.md`; more than 8: multi-epic, stop and plan.)
2. Does it fit an existing epic? (No: consider a new epic.)
3. Does it touch several system modules? (Yes: likely an epic.)
4. Can you split it into 2+ independent stories? (Yes: split now, before refining.)
5. Is it technically simple or complex? (Complex with unknowns: spike first, then refine.)

If any check says "epic", stop, run `epic-creation.md`, and come back per story.

---

## INVEST checklist

Every refined story passes INVEST. It is the gate between "exists" and "ready for development":

| Criterion       | Description                                               | Validation                                          |
| --------------- | --------------------------------------------------------- | --------------------------------------------------- |
| **I**ndependent | Can be developed without depending on other stories       | Can it be completed in isolation?                   |
| **N**egotiable  | Implementation details can be adjusted during development | Is there flexibility in implementation?             |
| **V**aluable    | Delivers value to the user or the business                | Is the "so that…" clear and valuable?               |
| **E**stimable   | Enough detail for QA to size it in shift-left             | Can QA tell Low, Medium or High?                    |
| **S**mall       | Small enough to verify on its own                         | AI Effort High? A split may be proposed (optional). |
| **T**estable    | Acceptance criteria are verifiable                        | Are the Scenarios clear and measurable?             |

The voice check complements INVEST and applies to `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}` and `{{jira.workflow}}`. Ask of each criterion: does it stay true after a stack swap? If endpoint paths, HTTP status codes, table or column names, framework or library names, error-code identifiers or transaction and locking patterns appear, the criterion is implementation and not behavior, so rewrite it from the persona's point of view. The exception is an API-consumer persona (DevEx, integration agent, headless client), for whom the API surface is the UX. See anti-pattern `I15` in `SKILL.md`. The voice check is a hard gate next to INVEST: failing it blocks Ready for Development.

When a criterion (INVEST or voice) fails, the story does not go to development. Refine it further or split it.

Common failures and fixes:

| Failure                                 | Fix                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------- |
| **Independent** fails                   | Resequence with the blocking story, or extract a shared dependency story   |
| **Negotiable** fails (over-prescribed)  | Strip implementation details from the description; keep them in tech notes |
| **Valuable** fails (no clear "so that") | Ask product. If there is no value, do not build it                         |
| **Estimable** fails                     | Run a spike (timeboxed investigation), then re-refine                      |
| **Small** fails (>8 SP)                 | Split, see "Story slicing patterns" below                                  |
| **Testable** fails                      | Rewrite ACs in Gherkin Scenario / Given-When-Then, minimum 3 scenarios     |

---

## Story structure: template and patterns

> Adapted from the `story.md` template in `product-backlog-seed.md`, where the full template lives. This section covers the parts that get refined.
>
> **No content duplication**: the `story.md` body carries narrative and DoD only. Acceptance Criteria, Scope and Out-of-Scope live in their dedicated Jira custom fields (`{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`). `references/description-custom-field-dedup.md` has the full rule and the audit procedure.

The in-file `story.md` body template has a locked shape:

```markdown
**Source spec:** {{FR-XXX | omit if not applicable}}

## User story

**As a** [specific persona from PRD]
**I want to** [single verb + single object]
**So that** [observable benefit]

## Business rules

[Overflow only — keep canonical content in `{{jira.business_rules_specification}}`.]

## Workflow

[Overflow only — keep canonical content in `{{jira.workflow}}`.]

## Definition of done

- [ ] [Project-standard DoD items]

<!-- AC / Scope / Out-of-Scope live exclusively in their dedicated custom fields
     (`{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`).
     See `references/description-custom-field-dedup.md`. -->
```

Rules for the User Story lines:

- **As a** names a real persona or role from the PRD, not "the user".
- **I want to** is one verb and one object. If you write "and", split the story.
- **So that** is a benefit, not a restated feature. "So I can log in" is not a benefit; "so I can resume my session without re-entering credentials" is.

**Title and description split.** The `As a … I want to … so that …` triad lives only in the description body's `## User story` block, never in the Jira summary. The summary uses the `{Feature} | {Action}` format (canonical §Story title format in `SKILL.md`, I20), where `{Action}` is the `I want to …` clause rewritten as a base-form verb phrase, with persona and benefit dropped. When a story's summary still holds the full sentence, shorten it to `{Feature} | {Action}` and make sure the full sentence is in the body. Domain-entity feature prefixes carry the `TMS-` tag (`TMS-US`, `TMS-Module`, …).

**Scope (In / Out) lives in custom fields only.** Be explicit: out-of-scope items are the team's defense against scope creep mid-sprint. Write In-Scope bullets to `{{jira.scope}}` and Out-of-Scope bullets to `{{jira.out_of_scope}}` through `[ISSUE_TRACKER_TOOL]`, and keep them out of the description body. These are rich-text fields, so follow `references/jira-publishing-gotchas.md` (per-field-per-call when batching ADF; no inline `code` inside `**bold**`).

**Acceptance Criteria live in a custom field only.** Write Gherkin Scenarios, at least 3, to `{{jira.acceptance_criteria}}` through `[ISSUE_TRACKER_TOOL]`. Pattern per scenario:

```gherkin
Scenario: [Descriptive name]
  Given [Initial context / clear preconditions]
  When  [Specific user action]
  Then  [Verifiable expected result]
```

The minimum of 3 is one happy path, one validation or error, one edge case. A story with only a happy path is not refined. For deep AC work (negative paths, boundaries, equivalence partitions), hand off to `acceptance-criteria.md` and `edge-cases-enumeration.md` after this pass, and mind `references/jira-publishing-gotchas.md` when publishing.

---

## 3-amigos refinement session

A 3-amigos session aligns Product, Engineering and QA on a story before it enters a sprint. It is optional; run it when the story is genuinely complex.

Run one if any of these apply:

- AI Effort `High` (the story is on the edge of small)
- integration-heavy (an external API, several services, or a shared module)
- a new user-facing flow with no precedent in the product
- ambiguity in the ACs raised by anyone on the team
- a cross-team dependency (another team owns part of the implementation)

One Product representative (PO/PM), one engineer (the likely implementer or tech lead) and one QA representative attend, for 30-45 minutes at most.

Facilitation:

1. Product reads the story aloud (2 min): the user story line and business value, no implementation detail.
2. Everyone walks the happy path (5 min), Given-When-Then, end to end.
3. Engineering surfaces unknowns (10 min): "What does the system do if…?" Capture each as an open question.
4. QA surfaces edge cases (10 min): boundaries, error paths, integration failures.
5. Product decides scope (5 min). Each unknown or edge case is in scope, out of scope (documented in the story), or a new story.
6. Engineering re-estimates (3 min): with the new clarity, is it still 8 SP or less?
7. Everyone confirms Ready (5 min) with the "Ready for Development Checklist" below.

Discussion checklist:

- [ ] Persona is named and real (not "the user")
- [ ] Benefit ("so that…") is observable, not a restatement
- [ ] In Scope / Out of Scope is explicit
- [ ] At least 3 Gherkin Scenarios, each verifiable
- [ ] Edge cases discussed and either covered, deferred (with story link), or out of scope
- [ ] Dependencies (Blocked By / Blocks) named
- [ ] Tech approach has no major unknowns (or a spike is split out)
- [ ] Small enough to verify on its own (QA's AI Effort is Low or Medium; for High, a split was optionally proposed, anti-pattern `I16`)

If any item is unchecked at the end, schedule a follow-up and do not mark the story Ready.

### When open questions decide the scope

A story whose open questions decide its scope can be settled by interview instead of a meeting, or before one so the meeting is shorter. Call the Skill tool with "grilling" and give it the questions. It asks in numbered rounds, each question with a recommended answer, and it does not ask what the PRD, SRS or ticket already answers. When an answer settles or contradicts a domain term, the term goes to `.context/business/domain-glossary.md` through the PM change protocol, not from inside this workflow. Answers that stay open go to the story's `## Open questions` comment.

If the skill is not installed, ask the same questions as a numbered list, each with your recommended answer, and say in the report that the interview method was missing.

With nobody at the keyboard, skip the meeting and use `grilling`'s own unattended path. Write each question and its recommended answer into the story's `## Open questions` comment and the run report, take the safest reversible answer, and list the assumptions so the operator can veto. Do not wait.

---

## Ready for Development checklist

A story is Ready when all of these hold:

- [ ] Jira issue exists with a full key (`{PROJECT_KEY}-{NUM}`, no `TBD`)
- [ ] Local cache synced: `bun run jira:sync-issues get <KEY>` materialized the story folder under its epic (read-only cache, never hand-written: `.agents/instructions/agent-local-context-pbi.md` §9)
- [ ] Jira description populated: no `[placeholder]` left (read back in the synced `story.md`)
- [ ] User story line uses a real persona, a single action and a real benefit
- [ ] Source spec line is the first body line (`**Source spec:** FR-XXX`) when an FR motivates the story, otherwise omitted
- [ ] Scope is populated in `{{jira.scope}}` (in scope) and `{{jira.out_of_scope}}` (exclusions), never in the description body
- [ ] INVEST: all six criteria pass
- [ ] Acceptance Criteria: at least 3 Gherkin Scenarios (happy, error, edge) in `{{jira.acceptance_criteria}}`, each wrapped in a ` ```gherkin ` fenced code block (anti-pattern `I17`)
- [ ] Voice gate passed: AC, Scope, Out-of-Scope and Workflow describe behavior the persona can observe, with no endpoint paths, HTTP status codes, table or column names, framework names or internal algorithms (anti-pattern `I15`). Exception: API-consumer persona
- [ ] Persona grounded: the `As a` line names a persona that exists in `.context/PRD/user-personas.md` (or, with no PRD, in the glossary or the data map's `access-control` roles), with no generic "user" or "system" actors (anti-pattern `I19`)
- [ ] Deduplication audit passed: run the audit in `references/description-custom-field-dedup.md`. The description body has no AC / Scope / OOS H2 sections, and that content lives in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`. A duplicate is stripped from the description, and the custom field stays canonical
- [ ] Effort fields: leave `{{jira.ai_effort}}`, `{{jira.development_token_usage}}` and `{{jira.quality_token_usage}}` empty. QA sets AI Effort in shift-left (`High` only warns the dev, and a split is an optional PO proposal); the agents write the token fields from measured usage (anti-pattern `I16`)
- [ ] Dependency discovery executed: an active pass over the current backlog graph (epic-tree, the Jira link graph and the data map in `business-data-context`) ran before the story was created or edited. The candidate `(from, to, source)` matrix was surfaced to the user, global and infrastructural noise was filtered out, and only explicit feature-level dependencies were kept (anti-pattern `I18`)
- [ ] Dependencies named: Blocked By / Blocks / Related confirmed with the user from the discovery matrix. They live as Jira issue links, and the sync renders them into `story.md`
- [ ] Dependencies published to Jira: see "Dependency-link verification step" below
- [ ] UI touch flagged: a UI-touching story says so and, where a master design plan exists, has its §8 US→Screen row (`SKILL.md`). No mockup is required to be Ready, because screens come later from `/sprint-development`'s design gate
- [ ] Technical notes cover any non-obvious implementation considerations
- [ ] 3-amigos done if triggered (AI Effort High or integration-heavy)
- [ ] Definition of Done is present and project-standard
- [ ] Status transitioned to `{{jira.statuses.story_default}}` (literal default `Shift-Left QA`), see "Status transition step" below

When all are checked, the story can enter a sprint.

### Dependency-link verification step

A dependency agreed in conversation is not enough. It has to exist as a Jira issue link so sprint-sequencing and JQL filters can see it, and the issue links are all that Jira-side automations (sprint-sequencing, board filters, blocked-flag rendering) ever read. For each dependency in the confirmed matrix:

1. Take the confirmed `(from, to)` rows from the dependency discovery matrix.
2. For each declared key, use `[ISSUE_TRACKER_TOOL]` to check whether the Jira issue link already exists on the story (link type `{{jira.link_types.dependencies}}`; direction follows the dependent-to-prerequisite rule in `references/dependency-linking.md`).
3. If a declared dependency has no matching Jira link, create it with `[ISSUE_TRACKER_TOOL]` per `references/dependency-linking.md`, including the directionality and fallback semantics for workspaces that lack the canonical link type.
4. If a Jira link exists with no matching row in the confirmed matrix, surface it to the user for triage. Do not delete it silently.
5. Re-sync (`bun run jira:sync-issues get <KEY>`) and confirm the synced `story.md` lists exactly the confirmed links.

### Status transition step

If the story is not yet at `{{jira.statuses.story_default}}` (literal default `Shift-Left QA`), transition it with `[ISSUE_TRACKER_TOOL]` using the transition resolved from `.agents/jira-workflows.json`. Make this the final action of refinement, since it signals to the team that the story cleared the Ready gate. When the workspace overrides the slug to a non-standard status, the override wins. The safe default applies only when the slug is unset.

---

## Story slicing patterns

When a story is too big (>8 SP), slice it. Some patterns work; some are anti-patterns.

### Vertical slicing (preferred)

Slice by user-visible outcome. Each slice is a thin, end-to-end story that delivers value on its own, a tracer bullet: it cuts a narrow but complete path through every layer, can be demonstrated or verified alone, fits one fresh session, and declares which stories block it.

Example, "User can pay for an order" (originally AI Effort High):

- Story A, "User can pay with a saved card": happy path, single payment method
- Story B, "User can add a new card during checkout": extends A
- Story C, "User sees clear errors on declined payments": error handling

Each slice is shippable on its own, even if the rest never ships. That is the test for a vertical slice.

Two moves keep slices small. Prefactoring comes first, as its own story, when the code needs reshaping before the feature fits. A wide refactor goes as expand, then migrate in batches sized by blast radius, then contract, so every step leaves the system working.

Draft the slices before creating any of them, then quiz the PM on size, blockers and merge or split, and create blockers first. The quiz and its unattended path are in `epic-creation.md` Step 0, and they apply here too when you cut one oversized story into several.

Source: https://github.com/mattpocock/skills (engineering/to-tickets), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

### Horizontal slicing (anti-pattern)

Slicing by technical layer, as in "database first, API next, UI last", is the pattern to avoid. Each slice has no user value, dependencies pile up, integration is deferred to the end, and the team cannot demo anything until the last slice ships.

### Happy path then edges (acceptable when scoped)

When a flow is genuinely large but its edges are well understood:

- Story A, "User completes the happy path of [flow]": main scenario only
- Story B, "User gets correct error handling on [flow]": all error scenarios
- Story C, "[Flow] handles edge cases X, Y, Z": boundaries

This is valid only if Story A is shippable behind a flag (not exposed to real users until B and C ship). Otherwise it is horizontal slicing in disguise.

### Other slicing heuristics

- By workflow step: "create draft" / "submit" / "approve"
- By data variation: "one item" / "bulk items"
- By interface: "via UI" / "via API"
- By role: "as admin" / "as editor"

Pick the one that produces the smallest shippable unit.

---

## Story dependencies and ordering

Dependencies live as Jira issue links (`references/dependency-linking.md`). The sync renders them into the synced `story.md` in this shape (read-only, for reference):

```markdown
## Dependencies

### Blocked By

- {PROJECT_KEY}-X — [Story title] — must complete before this story can start
- {PROJECT_KEY}-Y — [Story title] — required infrastructure

### Blocks

- {PROJECT_KEY}-Z — [Story title] — cannot start until this story ships

### Related Stories

- {PROJECT_KEY}-W — [Story title] — same epic, parallel work
```

Rules:

- **Blocked By** is a hard dependency. The blocked story cannot enter a sprint until the blocker is Done. More than 2 blockers means an integration story is buried somewhere, so extract it.
- **Blocks** is the inverse, recorded for sequencing.
- **Related** is useful context but not a hard dependency. Stories can run in parallel.

When sequencing the epic, foundation stories (auth, schema, base UI) ship first, and feature stories that depend on them ship in the order their `Blocked By` chain allows.

---

## Acceptance Criteria examples (by type)

Well-formed Gherkin Scenarios per story type. Use them as patterns, and refine deeper in `acceptance-criteria.md`.

### Simple CRUD

```gherkin
Scenario: User creates a new note
  Given I am logged in as an authenticated user
  When I submit the new-note form with title "Q3 plan" and body "..."
  Then a new note appears in my notes list
  And the note has the title "Q3 plan"
```

### Validation

```gherkin
Scenario: User cannot create a note with empty title
  Given I am on the new-note form
  When I submit the form with an empty title
  Then I see the error "Title is required"
  And no note is created
```

### Integration

```gherkin
Scenario: Order confirmation email is sent on successful payment
  Given a customer has paid for an order with id 1234
  When the payment provider confirms the charge
  Then an order-confirmation email is queued for the customer
  And the order status changes to "Paid"
```

### Complex logic

```gherkin
Scenario: Discount code applies before tax calculation
  Given my cart total is $100
  And I apply discount code "SAVE10" (10% off, pre-tax)
  When the cart recalculates
  Then the subtotal is $90
  And tax is calculated on $90
```

---

## Common story pitfalls

- "As a user…" is too generic. Name the persona.
- Implementation in the title: "Add Stripe SDK" is a task, not a story. Stories are user-facing.
- No real "so that": "so I can do X" where X is a feature, not a benefit.
- Conjunctions in the action: "I want to log in **and** see my dashboard" is two stories.
- Hidden epics: a story whose AI Effort is High with several outcomes inside. Consider splitting it.
- Only happy-path ACs. The minimum is 3 scenarios (happy, error, edge).
- Skipping INVEST when in a hurry. Every skipped check shows up as rework mid-sprint.
- Missing Out of Scope, which invites scope creep during development.
- Implementation details in the AC. ACs describe what, not how: "the system stores the password hashed with bcrypt" is the wrong layer, and belongs in a tech note.
- UI touch not flagged. The design gate cannot route a story nobody marked as UI-touching, and engineering will guess.

---

## Hand-off

When a story passes the Ready checklist:

1. Hand off to `acceptance-criteria.md` for deep AC refinement (refine each Scenario, add negative paths, boundary conditions, equivalence partitions). Mind `references/jira-publishing-gotchas.md` when writing the deepened AC back to `{{jira.acceptance_criteria}}`.
2. Hand off to `edge-cases-enumeration.md` for systematic edge-case discovery.
3. Confirm the status transition step ran (the story sits at `{{jira.statuses.story_default}}`).
4. Confirm the dependency-link verification step ran (Jira issue links match the local declarations).
5. Once both refinement passes are complete, the story can be pulled into a sprint and moved to "In Progress". Sprint sequencing (`references/sprint-sequencing.md`) can then consume the link graph this story contributes to.

---

## With nobody at the keyboard

Refinement often runs inside a discovery run or a routine. The 3-amigos section has its own unattended path (skip the meeting, interview with `grilling`'s unattended line), and the slice quiz follows `epic-creation.md` Step 0. The other points that wait for a person:

| Point                                      | Person present         | Nobody there                                                                                                  |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Valuable fails (no "so that")              | Ask product            | Leave the story out of Ready, record why in the run report, take the next story                               |
| Dependency matrix confirmed with the user  | Confirm the matrix     | Keep only explicit feature-level edges, publish those, list the whole matrix in the run report for the veto   |
| Jira link with no row in the matrix        | Ask for triage         | Leave the link in place and list it in the run report                                                         |

A worker under a conductor hands the same questions to the conductor, who holds the gate. Everything else follows `agentic-dev-core/references/decision-protocol.md`. A story that cannot honestly pass the checklist stays out of Ready, and the report names the item that stopped it.

---

## Related references (in this skill)

- `product-backlog-seed.md`: initial backlog seeding (the full `story.md` template lives there)
- `add-feature.md`: feature classification and Level 1 story creation
- `epic-creation.md`: when a "story" turns out to be an epic
- `acceptance-criteria.md`: deep AC refinement (next pass)
- `edge-cases-enumeration.md`: systematic edge-case discovery (next pass)
- `jira-operations.md`: Jira operation to tool layer mapping
- `dependency-linking.md`: publishing dependency declarations as Jira links
- `description-custom-field-dedup.md`: single-source-of-truth rule
- `sprint-sequencing.md`: topological ordering of refined stories
- `jira-publishing-gotchas.md`: ADF and MCP pitfalls
