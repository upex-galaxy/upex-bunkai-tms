# Story Refinement

> **Purpose**: Take a raw story (just created in Jira or carried in from the backlog) and refine it until it is "Ready for Development" — sized, sliced, agreed upon, and unambiguous.
> **Use when**: A story exists but isn't yet ready to enter a sprint. Apply before pulling into "In Progress".
> **Companion references**:
>
> - `product-backlog-seed.md` / `add-feature.md` — story creation flows
> - `epic-creation.md` — when a story turns out to be an epic instead
> - `acceptance-criteria.md` — for the deep AC refinement pass (after this guide)
> - `edge-cases-enumeration.md` — for the edge-case discovery pass (after this guide)

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

**If a criterion fails, do NOT proceed to development.** Either refine further or split the story.

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

**The User Story line** — locked format:

```markdown
**As a** [specific user type]
**I want to** [clear, concrete action]
**So that** [measurable user benefit]
```

Refinement rules:

- **As a** — name a real persona or role from the PRD (not "the user")
- **I want to** — one verb + one object; if you find yourself writing "and", split the story
- **So that** — must be a benefit, not a feature restatement. "So I can log in" is not a benefit; "so I can resume my session without re-entering credentials" is.

**Scope (In / Out)** — be explicit. Out-of-scope items are the team's defense against scope creep mid-sprint.

```markdown
### In Scope

- [Functionality included 1]
- [Functionality included 2]

### Out of Scope

- [Functionality NOT included in this story]
- [Items for future iterations]
```

**Acceptance Criteria** — Gherkin Scenario format, **minimum 3 scenarios**:

```markdown
### Scenario 1: [Happy path — descriptive name]

- **Given:** [Initial context / clear preconditions]
- **When:** [Specific user action]
- **Then:** [Verifiable expected result]

### Scenario 2: [Validation/Error — descriptive name]

- **Given:** [Initial context]
- **When:** [Action that triggers an error or validation]
- **Then:** [Expected system behavior]

### Scenario 3: [Edge case — descriptive name]

- **Given:** [Boundary or special context]
- **When:** [User action]
- **Then:** [Expected result]
```

The **min-3-scenarios rule**: 1 happy path + 1 validation/error + 1 edge case. Stories with only a happy path are not refined. For deep AC refinement (negative paths, boundaries, equivalence partitions), hand off to `acceptance-criteria.md` and `edge-cases-enumeration.md` after this pass.

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
- [ ] **Scope** explicitly lists In and Out of Scope
- [ ] **INVEST** — all six criteria pass
- [ ] **Acceptance Criteria** — minimum 3 Gherkin Scenarios (happy + error + edge)
- [ ] **Story Points** estimated (1, 2, 3, 5, 8) and ≤8
- [ ] **Dependencies declared** — Blocked By / Blocks / Related
- [ ] **Mockups linked** if a UI change (or "N/A — no UI change" stated)
- [ ] **Technical notes** include any non-obvious implementation considerations
- [ ] **3-amigos done** if triggered (>5 SP or integration-heavy)
- [ ] **Definition of Done** present and project-standard

When all are checked, the story can enter a sprint.

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

1. Hand off to **`acceptance-criteria.md`** for deep AC refinement (refine each Scenario, add negative paths, boundary conditions, equivalence partitions).
2. Hand off to **`edge-cases-enumeration.md`** for systematic edge-case discovery.
3. Once both refinement passes are complete, the story is ready to be pulled into a sprint and moved to "In Progress".

---

## Related References (in this skill)

- `product-backlog-seed.md` — initial backlog seeding (full story.md template lives here)
- `add-feature.md` — feature classification + Level 1 story creation
- `epic-creation.md` — when a "story" turns out to be an epic
- `acceptance-criteria.md` — deep AC refinement (next pass)
- `edge-cases-enumeration.md` — systematic edge-case discovery (next pass)
