# Acceptance Criteria Refinement Guide

> **Purpose**: Help Product Managers, Product Owners, and developers turn vague story-level "what" into concrete, verifiable acceptance criteria (AC) with specific data, scenarios, and edge cases — _before_ code is written.

---

## What Are Acceptance Criteria?

Acceptance criteria are the bridge between a user story and "done". They define the precise, observable behavior the team agrees the system will exhibit when the story is complete.

Good AC answers three questions every reviewer will ask:

- **What state must exist before the action?** (Given)
- **What action does the user or system take?** (When)
- **What outcome must be observable?** (Then)

If any of those three is vague, you do not have AC — you have a wish. The goal of AC refinement is to remove every "it depends" before the work enters a sprint.

---

## Understanding the Story Context

Before refining AC, build a clear picture of where the story sits — both in the user's world and in the technical landscape. AC written without this grounding tend to drift toward the obvious and miss what actually matters.

### Business Value & User Impact

Identify:

- **User persona affected**
  - Primary persona — who uses this feature directly, and how it changes their day
  - Secondary persona — anyone touched downstream (e.g., support, finance, admin)
- **Business value**
  - Value proposition — what the user gets out of it
  - Business impact — which KPI / metric / outcome this contributes to
- **User journey**
  - Which journey is this story part of? Which step?
  - What happens before it? What depends on it after?

If you cannot fill in this paragraph in one or two sentences, the story scope is probably ambiguous — flag it before writing AC.

### Technical Architecture

Map the technical surface so AC can include realistic preconditions and verifiable outcomes:

- **Frontend** — components, pages/routes, state changes the user will observe
- **Backend** — API endpoints invoked, business services involved, side effects
- **Database** — tables / records read or written, key fields, integrity rules
- **External services** — third-party APIs, webhooks, email/SMS, payments
- **Integration points** — every place where data crosses a boundary

Why this matters for AC: a well-written `Then` clause names _the verifiable change_ — a UI element, a status code, a record state. You cannot name those if you do not know where they live.

---

## Story Quality Analysis: Identifying Gaps & Ambiguities

Before refining AC, audit the story as written. Most AC defects begin life as story defects.

### Finding Ambiguities in Stories

Ambiguity is anything that two reasonable readers could interpret differently. Common patterns:

- **Vague verbs**: "the system handles invalid input" — handle how? Reject? Retry? Log? Show a message?
- **Unspecified actors**: "the manager is notified" — by email? In-app? When?
- **Subjective outcomes**: "the page loads quickly" — quickly meaning what? Under what conditions?
- **Hidden assumptions**: "as a returning user" — returning since when? With what state?
- **Either/or without rule**: "if appropriate, the user is shown..." — what makes it appropriate?

For every ambiguity found, capture:

- **Where in the story it appears** (which AC, which sentence)
- **The specific question** that resolves it
- **What you cannot validate** until it is resolved
- **Your suggested clarification** (a strong default beats an open question)

If you find **no** ambiguities, that is itself a finding — say so explicitly: "Story is clear and well-defined."

### Identifying Missing Information

Beyond what is unclear, look for what is simply absent. Critical gaps fall into a few buckets:

- **Missing AC** — a behavior is implied but not stated as a criterion
- **Missing technical detail** — error codes, response shapes, validation rules
- **Missing business rule** — eligibility, ordering, precedence, defaults
- **Missing data context** — what does "valid" mean for this field? What are the boundaries?

Document each gap with:

- **What is missing**
- **Why it is critical** (which AC cannot be written without it)
- **Suggested addition** (concrete proposal, not just a question)
- **Impact if not added** (what risk this introduces — wasted dev cycles, unverifiable AC, customer-visible bug)

### Edge Cases NOT in Original Story

Stories tend to capture the happy path and one or two obvious negatives. Edge cases often slip through. As you read the story, ask explicitly:

- What happens at boundaries? (empty, max length, zero, negative, very large)
- What happens with concurrent or repeated actions?
- What happens on partial failures? (network drop mid-action, timeout, half-saved state)
- What happens when prerequisites are missing or stale? (deleted record, expired session)
- What happens for unusual users? (different role, locale, device, accessibility tooling)

For each edge case found:

- **Scenario** — what triggers it
- **Expected behavior** — your best inference (or "needs PO/Dev confirmation")
- **Criticality** — High, Medium, or Low
- **Action required** — promote to AC, leave as test-only, or ask the PO

> **Decision rule**: If the edge case is high-criticality _and_ you can name a clear expected behavior, promote it to AC. Otherwise, document it as a test-level concern (out of scope of this skill — see the QA boilerplate).

### Clarity & Specificity Validation

A criterion is clear when one engineer reading it once can implement it the same way as another engineer reading it once. Run this checklist:

- [ ] AC names specific values, not vague qualifiers ("min 8 characters" not "secure password")
- [ ] Expected results are concrete and observable (UI element, message text, status code)
- [ ] Test data examples are provided (or pointers to where they live)
- [ ] Error scenarios are spelled out (which errors, what messages, what status codes)
- [ ] Performance / NFR expectations are quantified when applicable (response under 500ms, etc.)
- [ ] No criterion depends on undocumented context ("after the usual setup")

If any item fails, list the specific fix in plain language, e.g.: _"AC2 says 'show an error' — specify the exact text and which field it appears under."_

---

## Refining Acceptance Criteria with Specific Data

Once gaps are filled and ambiguities resolved, convert each AC into one or more concrete scenarios.

### Scenario Definition (Gherkin Format)

Use **Given–When–Then** to keep scenarios concrete and reviewable. Each scenario describes a single behavior.

**Scenario template:**

```
Scenario: <short descriptive name — what behavior is being captured>

Given:
  - <initial state, very specific, with data>
  - <preconditions: who is logged in, what data exists>

When:
  - <user action — specific, with exact data>
  - e.g., User enters email "john@example.com" and clicks "Submit"

Then:
  - <expected result 1 — specific and verifiable>
  - <expected result 2 — with exact data>
  - <system / data changes — which record, which field>
  - <if API: expected status code, e.g., 200 OK>
  - <if API: expected response body shape>
```

The discipline is concrete data: not "valid email" but `"john@example.com"`. Not "an error appears" but `"Email format is invalid"` displayed under the email field. Concrete data forces the team to confront what "valid" actually means.

### Types of Scenarios

Aim for coverage across three kinds of scenario, not just the happy path:

**Happy path (positive):** the typical successful flow, with realistic input.

```
Scenario: Successful login with valid credentials
Given: a registered user with email "user@example.com" and password "Pass1234!"
When:  the user submits the login form with those credentials
Then:  the user is redirected to the dashboard
       and a session cookie "sid" is set on the response
```

**Error / validation (negative):** invalid input, unauthorized access, business-rule violations.

```
Scenario: Login fails with invalid email format
Given: the login page is open
When:  the user submits the form with email "notanemail" and any password
Then:  no request is sent to /auth/login
       and an error "Email format is invalid" appears under the email field
```

**Boundary / edge case:** min/max values, empty input, concurrency, unusual states.

```
Scenario: Password at the minimum allowed length is accepted
Given: a registration form requiring 8+ character passwords
When:  the user submits with a password of exactly 8 characters
Then:  the account is created
       and the response status is 201 Created
```

When an edge case scenario was identified during gap analysis (not in the original story), mark it explicitly as such — for example: `Source: identified during refinement — needs PO confirmation`.

### AC Quality Patterns

**INVEST applied to AC:**

- **Independent** — each AC stands on its own; do not chain them with "and then if AC1, also AC2..."
- **Negotiable** — wording can change in refinement; the _intent_ is fixed
- **Valuable** — each AC ties back to user or business outcome (no busywork criteria)
- **Estimable** — a developer can size the work without further questions
- **Small** — one AC = one verifiable behavior; if it covers three things, split it
- **Testable** — there is a clear pass/fail signal someone can observe

**Specificity standards:**

- Replace qualitative words with quantitative ones (`fast` → `under 500 ms`)
- Replace pronouns and "it" with the named element (`it` → `the error banner above the form`)
- Replace ranges with examples (`a long string` → `a 256-character string`)

**Verifiability standards:** every `Then` clause must reference something a person or test can directly observe — a piece of UI, a response body, a database record, an event emitted. If the only way to know it worked is "trust me, it worked," it is not verifiable.

---

## AC Refinement Workflow

### 3-Amigos Session Guide (Optional)

When a story has more than one or two open questions, a brief 3-amigos conversation usually beats async ping-pong. The roles:

- **PO / PM** — confirms intent, business rules, priorities, edge-case decisions
- **Dev** — confirms feasibility, calls out hidden complexity, proposes implementation-level constraints
- **QA / Tester** — confirms verifiability, surfaces edge cases the others missed

The session output is a refined story with concrete AC, no open questions, and explicit edge-case decisions. Keep it timeboxed (15–30 min for a single story).

When 3-amigos is _not_ needed: the story is small, clear, and the same team has done similar work before. Don't ceremonialize what can be a one-line Slack thread.

### INVEST Criteria Applied to AC

Walk through INVEST one more time after writing scenarios. Common failures:

- **Independent fails** when AC2 says "after AC1" — split into two stories or fold into one AC
- **Small fails** when an AC has multiple `Then` clauses that test different behaviors — split
- **Testable fails** when `Then` references mood, satisfaction, or "good UX" — replace with observable signal

### Ready for Development

Use this checklist as the gate from refinement → sprint:

- [ ] Every AC follows Given–When–Then with concrete data
- [ ] Happy path, at least one error scenario, and known edge cases are covered
- [ ] No AC depends on undocumented context
- [ ] All ambiguities and gaps from analysis are resolved (or explicitly deferred)
- [ ] PO has confirmed expected behavior for non-original edge cases
- [ ] Dev has confirmed AC are estimable without further questions
- [ ] Each AC is independently verifiable

---

## Common AC Pitfalls

- **The Wish List**: AC reads like a feature description, not testable conditions
- **The Implementation Spec**: AC dictates how (use Redux, call endpoint X) instead of what
- **The Vague Outcome**: `Then the user sees feedback` — what feedback? Where? In what state?
- **The Hidden Conjunction**: one AC stuffs three behaviors via "and... and... and..."
- **The Untestable Mood**: AC about "delight", "ease", "intuitive flow" without observable signal
- **The Missing Negative**: only happy-path scenarios; nothing about invalid input or failure modes
- **The Magic Data**: AC references "the usual test user" or "standard data" without saying what that means
- **The Forgotten Boundary**: rules state ranges (1–100) but no AC covers 0, 1, 100, 101

---

## Related References

- See `story-refinement.md` for the full story-level INVEST checklist and 3-amigos protocol applied at the story (not AC) level
- See `edge-cases-enumeration.md` for systematic edge-case discovery at the feature / epic level — useful when refining stories that sit inside a complex feature
- See `epic-creation.md` for epic-level scope and AC patterns
- For formal test case design (Gherkin scenarios → automated tests, parametrization, fixtures) — out of scope here — see the QA boilerplate (`agentic-qa-boilerplate`)
