# Story Refinement

> **Purpose**: Take a raw story (just created in Jira or carried in from the backlog) and refine it until it is "Ready for Development" — sized, sliced, agreed upon, and unambiguous.
> **Use when**: A story exists but isn't yet ready to enter a sprint. Apply before pulling into "In Progress".
> **Companion references**:
>
> - `product-backlog-seed.md` / `add-feature.md` — story creation flows
> - `epic-creation.md` — when a story turns out to be an epic instead
> - `acceptance-criteria.md` — for the deep AC refinement pass (after this guide)
> - `edge-cases-enumeration.md` — for the edge-case discovery pass (after this guide)
> - `jira-operations.md` — Primary / Fallback / Last-resort tool-layer decisions for every Jira operation
> - `dependency-linking.md` — publishing Blocked By / Blocks declarations as Jira issue links
> - `description-custom-field-dedup.md` — single-source-of-truth rule for AC / Scope / Out-of-Scope
> - `jira-publishing-gotchas.md` — ADF + MCP pitfalls when writing rich-text fields

---

## Inputs — read these first, in this order

A cold-start refinement needs the following files loaded in this exact sequence. Skip a file only if it is absent (mature-project artifacts may lag at seed time — flag and continue).

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (custom fields + statuses + link types).
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping.
4. `.agents/jira-workflows.json` — workflow + transition catalog.
5. `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md` — Master Sprint roadmap.
7. `.context/PRD/mvp-scope.md` — what is in vs out of the MVP.
8. `.context/PRD/user-personas.md` — actor model (for the `As a` line).
9. `.context/PRD/user-journeys.md` — flow-level expectations.
10. `.context/SRS/functional-specs.md` — FR catalog (source of `**Source spec:**` references).
11. `.context/SRS/non-functional-specs.md` — NFRs (perf, security, a11y).
12. `.context/business/business-data-map.md` — entity graph (source of entity-level dependencies).
13. `.context/business/business-feature-map.md` — CRUD matrix.
14. `.context/business/business-api-map.md` — endpoint catalog (auth model, journey breakdown).
15. `.context/PBI/epic-tree.md` — current backlog state.

Optional inputs (present in mature projects, may be missing at seed time): business maps (12–14) arrive after `/business-*-map` runs; treat as soft prerequisites and continue refining with the rest if absent.

---

## What Makes a Good Story?

A good user story is small enough to ship in one sprint, written in the user's voice, and unambiguous about "done." It tells one story (one outcome), is testable as a black box, and has dependencies declared up front. If two engineers read it and picture different things, it is not refined yet.

This guide gets a story from "exists in Jira" to "anyone on the team could pull it into a sprint." The deep AC and edge-case work happens in the companion references after this pass.

---

## Story Scope & Sizing

> Lifted from `add-feature.md` Fase 1 (Level 1 criteria). Use this rubric to confirm a story is genuinely a story and not a hidden epic.

A piece of work is a single **story** when:

- It is a refinement or extension of existing functionality
- It clearly fits inside one existing epic
- It can complete in 1-8 story points
- It does not require architectural changes
- One user story is enough to express it

**Sanity checks before refining:**

1. How many stories does this really need? (1 → keep refining; 3-8 → it is an epic, see `epic-creation.md`; >8 → multi-epic, STOP and plan)
2. Does it fit an existing epic? (No → consider a new epic instead)
3. Does it touch multiple system modules? (Yes → likely epic)
4. Can you split it into 2+ independent stories? (Yes → split now, before refining)
5. Technically simple or complex? (Complex with unknowns → spike first, then refine)

If any of these flag "epic" — stop, run `epic-creation.md`, and come back per story.

---

## INVEST Checklist

Every refined story must pass INVEST. This is the gate between "exists" and "ready for development":

| Criterion       | Description                                               | Validation                              |
| --------------- | --------------------------------------------------------- | --------------------------------------- |
| **I**ndependent | Can be developed without depending on other stories       | Can it be completed in isolation?       |
| **N**egotiable  | Implementation details can be adjusted during development | Is there flexibility in implementation? |
| **V**aluable    | Delivers value to the user or the business                | Is the "so that…" clear and valuable?   |
| **E**stimable   | Effort can be estimated with the info given               | Can the team assign story points?       |
| **S**mall       | Can complete in one sprint (max 8 story points)           | Under 8 SP? If not, split.              |
| **T**estable    | Acceptance criteria are verifiable                        | Are the Scenarios clear and measurable? |

> **Voice check** (complements INVEST; applies to `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, `{{jira.workflow}}`): does each criterion stay true after a stack swap? If endpoint paths, HTTP status codes, table/column names, framework or library names, error-code identifiers, or transaction/locking patterns appear, the criterion is implementation, not behavior — rewrite from the persona's POV. **Exception**: persona is an API consumer (DevEx, integration agent, headless client) — API surface IS their UX. See anti-pattern `I15` in `SKILL.md`. The Voice check is a hard gate alongside INVEST; failing it blocks Ready-for-Development.

**If a criterion (INVEST or Voice) fails, do NOT proceed to development.** Either refine further or split the story.

Common failures and fixes:

| Failure                                 | Fix                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------- |
| **Independent** fails                   | Resequence with the blocking story; or extract a shared dependency story   |
| **Negotiable** fails (over-prescribed)  | Strip implementation details from the description; keep them in tech notes |
| **Valuable** fails (no clear "so that") | Talk to product — if there is no value, do not build it                    |
| **Estimable** fails                     | Run a spike (timeboxed investigation), then re-refine                      |
| **Small** fails (>8 SP)                 | Split — see "Story Slicing Patterns" below                                 |
| **Testable** fails                      | Rewrite ACs in Gherkin Scenario / Given-When-Then; minimum 3 scenarios     |

---

## Story Structure: Template & Patterns

> Adapted from the `story.md` template in `product-backlog-seed.md`. The full template lives there; this section focuses on the parts that get refined.
>
> **No content duplication**: the body of `story.md` carries narrative + DoD only. Acceptance Criteria, Scope, and Out-of-Scope live exclusively in their dedicated Jira custom fields (`{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`). See `references/description-custom-field-dedup.md` for the full single-source-of-truth rule and audit procedure.

**In-file `story.md` body template** — locked shape:

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

Refinement rules for the User Story line:

- **As a** — name a real persona or role from the PRD (not "the user").
- **I want to** — one verb + one object; if you find yourself writing "and", split the story.
- **So that** — must be a benefit, not a feature restatement. "So I can log in" is not a benefit; "so I can resume my session without re-entering credentials" is.

**Title vs description split.** This `As a … I want to … so that …` triad lives in the description body
`## User story` block ONLY — it is NEVER the Jira **summary**. The summary uses the `{Feature} | {Action}`
format (canonical §Story title format in `SKILL.md`, I20), where `{Action}` is exactly the `I want to …`
clause rewritten as a base-form verb phrase (persona + benefit dropped). When refining a story whose
summary still holds the full sentence, shorten the summary to `{Feature} | {Action}` and ensure the full
sentence is present in the body. Domain-entity feature prefixes carry the `TMS-` tag (`TMS-US`, `TMS-Module`, …).

**Scope (In / Out) — custom-field only.** Be explicit. Out-of-scope items are the team's defense against scope creep mid-sprint. Write In-Scope bullets to `{{jira.scope}}` and Out-of-Scope bullets to `{{jira.out_of_scope}}` via `[ISSUE_TRACKER_TOOL]`. Do NOT duplicate into the description body. When writing these rich-text fields, follow `references/jira-publishing-gotchas.md` (per-field-per-call when batching ADF; no inline `code` inside `**bold**`).

**Acceptance Criteria — custom-field only.** Gherkin Scenario format, **minimum 3 scenarios**, written to `{{jira.acceptance_criteria}}` via `[ISSUE_TRACKER_TOOL]`. Pattern per scenario:

```gherkin
Scenario: [Descriptive name]
  Given [Initial context / clear preconditions]
  When  [Specific user action]
  Then  [Verifiable expected result]
```

The **min-3-scenarios rule**: 1 happy path + 1 validation/error + 1 edge case. Stories with only a happy path are not refined. For deep AC refinement (negative paths, boundaries, equivalence partitions), hand off to `acceptance-criteria.md` and `edge-cases-enumeration.md` after this pass. When publishing AC, mind `references/jira-publishing-gotchas.md`.

---

## 3-Amigos Refinement Session

A 3-amigos session aligns Product, Engineering, and QA on a story before it enters a sprint. It is **optional** — trigger it when the story is genuinely complex.

**Trigger criteria — run a 3-amigos session if any apply:**

- Estimated > 5 SP (story is on the edge of "small")
- Integration-heavy (touches an external API, multiple services, or a shared module)
- New user-facing flow (no precedent in the product)
- Ambiguity in ACs raised by anyone on the team
- Cross-team dependency (another team owns part of the implementation)

**Who attends:** one Product representative (PO/PM), one Engineer (the likely implementer or tech lead), one QA representative. 30-45 minutes maximum.

**Facilitation guide:**

1. **Read the story aloud** (Product, 2 min) — user story line + business value, no implementation detail
2. **Walk the happy path** (everyone, 5 min) — Given-When-Then, end-to-end
3. **Surface unknowns** (Engineering, 10 min) — "What does the system do if…?" Capture each as an open question
4. **Surface edge cases** (QA, 10 min) — boundaries, error paths, integration failures
5. **Decide scope** (Product, 5 min) — for each unknown/edge case: in-scope, out-of-scope (document in story), or new story
6. **Re-estimate** (Engineering, 3 min) — with the new clarity, is this still ≤8 SP?
7. **Confirm Ready** (everyone, 5 min) — run the "Ready for Development Checklist" below

**Discussion checklist:**

- [ ] Persona is named and real (not "the user")
- [ ] Benefit ("so that…") is observable, not a restatement
- [ ] In Scope / Out of Scope is explicit
- [ ] At least 3 Gherkin Scenarios, each verifiable
- [ ] Edge cases discussed and either covered, deferred (with story link), or out-of-scope
- [ ] Dependencies (Blocked By / Blocks) named
- [ ] Tech approach has no major unknowns (or a spike is split out)
- [ ] Estimate confirmed ≤8 SP

If any item is unchecked at the end of the session, schedule a follow-up — do not mark Ready.

---

## Ready for Development Checklist

A story is Ready when **all** of these are true:

- [ ] **Jira issue exists** with full key (`{PROJECT_KEY}-{NUM}`, no `TBD`)
- [ ] **Local folder exists** under the parent epic (`.context/PBI/epics/EPIC-.../stories/STORY-.../`)
- [ ] **`story.md` populated** — no `[placeholder]` left
- [ ] **User story line** uses real persona, single action, real benefit
- [ ] **Source spec line** present as the first body line (`**Source spec:** FR-XXX`) when an FR motivates the story, otherwise omitted
- [ ] **Scope** explicitly populated in `{{jira.scope}}` (in-scope) and `{{jira.out_of_scope}}` (exclusions) — never in the description body
- [ ] **INVEST** — all six criteria pass
- [ ] **Acceptance Criteria** — minimum 3 Gherkin Scenarios (happy + error + edge) in `{{jira.acceptance_criteria}}`, each wrapped in a ` ```gherkin ` fenced code block (anti-pattern `I17`)
- [ ] **Voice gate passed** — AC / Scope / Out-of-Scope / Workflow describe persona-observable behavior; no endpoint paths, HTTP status codes, table/column names, framework names, or internal algorithms appear (anti-pattern `I15`). Exception: API-consumer persona.
- [ ] **Persona grounded** — `As a` line names a persona that exists in `.context/PRD/user-personas.md`; no generic "user" / "system" actors (anti-pattern `I19`).
- [ ] **Deduplication audit passed** — run the dedup audit per `references/description-custom-field-dedup.md`. Confirm the description body excludes AC / Scope / OOS H2 sections and that those contents live in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}` respectively. If a duplicate is found, strip from the description and keep the custom field as canonical.
- [ ] **Story Points** — leave `{{jira.story_points}}` EMPTY by default. Populate ONLY if the user explicitly requested estimation in this session. Estimation belongs to the team that will build the story (Design + Dev + Test), not to the PO/BA. When opted-in: Fibonacci (1, 2, 3, 5, 8); 13+ → split. See anti-pattern `I16`.
- [ ] **Dependency Discovery executed** — active pass over the current backlog graph (epic-tree + Jira link graph + business-data-map) ran BEFORE creation/edit. Candidate `(from, to, source)` matrix surfaced to the user; global/infrastructural noise filtered out; only feature-level explicit dependencies kept. See anti-pattern `I18`.
- [ ] **Dependencies declared locally** — Blocked By / Blocks / Related sections present in `story.md`
- [ ] **Dependencies published to Jira** — see the "Dependency-link verification" step below
- [ ] **Mockups linked** if a UI change (or "N/A — no UI change" stated)
- [ ] **Technical notes** include any non-obvious implementation considerations
- [ ] **3-amigos done** if triggered (>5 SP or integration-heavy)
- [ ] **Definition of Done** present and project-standard
- [ ] **Status transitioned** to `{{jira.statuses.story_default}}` (literal default `Shift-Left QA`) — see the "Status transition" step below

When all are checked, the story can enter a sprint.

### Dependency-link verification step

Local `### Blocked By` / `### Blocks` declarations in `story.md` are not enough — they must exist as Jira issue links so downstream sprint-sequencing and JQL filters see them. For each declared dependency:

1. Re-read the `### Blocked By` and `### Blocks` sections in the local `story.md`.
2. For each declared key, use `[ISSUE_TRACKER_TOOL]` to check whether the corresponding Jira issue link already exists on the story (the link type is `{{jira.link_types.dependencies}}`; direction follows the dependent → prerequisite rule documented in `references/dependency-linking.md`).
3. If a declared dependency has no matching Jira link, create it via `[ISSUE_TRACKER_TOOL]` per `references/dependency-linking.md` — including the directionality + fallback semantics for workspaces missing the canonical link type.
4. If a Jira link exists with no matching local declaration, surface it to the user for triage (do not silently delete).

Anti-pattern: NEVER skip this step on the assumption that the local declarations "speak for themselves." They do not — Jira-side automations (sprint-sequencing, board filters, blocked-flag rendering) only see the issue links.

### Status transition step

If the story is not yet at `{{jira.statuses.story_default}}` (literal default `Shift-Left QA`), transition it via `[ISSUE_TRACKER_TOOL]` using the transition resolved from `.agents/jira-workflows.json`. Run this as the final action of refinement — it signals to the rest of the team that the story has cleared the Ready gate. When the workspace overrides the slug to a non-standard status, the override wins; the methodology applies the safe default only when the slug is unset.

---

## Story Slicing Patterns

When a story is too big (>8 SP), slice it. Some patterns work; some are anti-patterns.

### Vertical Slicing (preferred)

Slice by **user-visible outcome**. Each slice is itself a thin, end-to-end story that delivers value on its own.

Example — "User can pay for an order" (originally 13 SP):

- Story A — "User can pay with a saved card" (5 SP) — happy path, single payment method
- Story B — "User can add a new card during checkout" (3 SP) — extends A
- Story C — "User sees clear errors on declined payments" (3 SP) — error handling

Each slice is shippable on its own, even if the rest never ships. That is the test for a vertical slice.

### Horizontal Slicing (anti-pattern)

Slicing by **technical layer** — "do the database first, the API next, the UI last." Avoid. Each slice has no user value, dependencies pile up, integration is deferred to the end, and the team cannot demo anything until the last slice ships.

### Happy-Path-Then-Edges (acceptable when scoped)

When a flow is genuinely large but the edges are well-understood:

- Story A — "User completes the happy path of [flow]" (5 SP) — main scenario only
- Story B — "User gets correct error handling on [flow]" (3 SP) — covers all error scenarios
- Story C — "[Flow] handles edge cases X, Y, Z" (3 SP) — boundaries

Only valid if Story A is **shippable behind a flag** (i.e., not exposed to real users until B and C ship). Otherwise it becomes horizontal slicing in disguise.

### Other Slicing Heuristics

- **By workflow step** — "create draft" / "submit" / "approve"
- **By data variation** — "one item" / "bulk items"
- **By interface** — "via UI" / "via API"
- **By role** — "as admin" / "as editor"

Pick the one that produces the smallest **shippable** unit.

---

## Story Dependencies & Ordering

Make dependencies explicit in `story.md`:

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

**Rules:**

- **Blocked By** = a hard dependency. The blocked story cannot enter a sprint until the blocker is Done. If you find yourself with >2 blockers, you have an integration story buried somewhere — extract it.
- **Blocks** = the inverse, recorded for sequencing.
- **Related** = useful context but not a hard dependency. Stories can run in parallel.

When sequencing the epic, foundation stories (auth, schema, base UI) ship first; feature stories that depend on them ship in the order their `Blocked By` chain allows.

---

## Acceptance Criteria Examples (by Type)

Examples of well-formed Gherkin Scenarios per story type. Use as patterns; refine deeper in `acceptance-criteria.md`.

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

### Complex Logic

```gherkin
Scenario: Discount code applies before tax calculation
  Given my cart total is $100
  And I apply discount code "SAVE10" (10% off, pre-tax)
  When the cart recalculates
  Then the subtotal is $90
  And tax is calculated on $90
```

---

## Common Story Pitfalls

- **"As a user…"** — too generic. Name the persona.
- **Implementation in the title** — "Add Stripe SDK" is a task, not a story. Stories are user-facing.
- **No real "so that"** — "so I can do X" where X is a feature, not a benefit.
- **Conjunctions in the action** — "I want to log in **and** see my dashboard" — two stories.
- **Hidden epics** — story estimated 13+ SP. Split it.
- **Only happy-path ACs** — at minimum 3 scenarios (happy + error + edge).
- **Skipping INVEST when in a hurry** — every skipped check shows up as rework mid-sprint.
- **Missing Out of Scope** — invites scope creep during development.
- **Implementation details in the AC** — ACs should describe **what**, not **how**. "The system stores the password hashed with bcrypt" — wrong layer; that is a tech note.
- **Mockups missing for UI stories** — engineering will guess, and guesses are usually wrong.

---

## Hand-Off

When a story passes the Ready checklist:

1. Hand off to **`acceptance-criteria.md`** for deep AC refinement (refine each Scenario, add negative paths, boundary conditions, equivalence partitions). Mind `references/jira-publishing-gotchas.md` when writing the deepened AC back to `{{jira.acceptance_criteria}}`.
2. Hand off to **`edge-cases-enumeration.md`** for systematic edge-case discovery.
3. Confirm the Status transition step has executed (story sits at `{{jira.statuses.story_default}}`).
4. Confirm the Dependency-link verification step has executed (Jira issue links match local declarations).
5. Once both refinement passes are complete, the story is ready to be pulled into a sprint and moved to "In Progress". Sprint-sequencing (`references/sprint-sequencing.md`) can now consume the link graph this story contributes to.

---

## Related References (in this skill)

- `product-backlog-seed.md` — initial backlog seeding (full story.md template lives here)
- `add-feature.md` — feature classification + Level 1 story creation
- `epic-creation.md` — when a "story" turns out to be an epic
- `acceptance-criteria.md` — deep AC refinement (next pass)
- `edge-cases-enumeration.md` — systematic edge-case discovery (next pass)
- `jira-operations.md` — Jira operation → tool layer mapping
- `dependency-linking.md` — publishing dependency declarations as Jira links
- `description-custom-field-dedup.md` — single-source-of-truth rule
- `sprint-sequencing.md` — topological ordering of refined stories
- `jira-publishing-gotchas.md` — ADF + MCP pitfalls
