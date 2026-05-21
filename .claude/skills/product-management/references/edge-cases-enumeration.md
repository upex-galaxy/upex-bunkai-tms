# Edge Cases & Failure Scenarios Enumeration Guide

> **Purpose**: Help Product Managers, Product Owners, and architects systematically discover edge cases at the feature / epic level — _before_ stories are sliced and sprints start — so the team builds for them deliberately rather than discovering them in production.

---

## What Are Edge Cases?

An **edge case** is any scenario that lives at or beyond the boundary of "expected behavior" — empty input, maximum length, simultaneous actions, partial failures, unusual user contexts, network problems, stale state.

Edge cases are not bugs. They are real situations that can happen in production. The question is whether the system has been _designed_ to handle them, or whether you will discover the answer the hard way.

The distinction that matters at PM level:

- **Expected behavior** — what the feature does on the happy and main negative paths
- **Edge case** — a situation outside those paths that still has a defined, intentional response

This guide is about systematically _finding_ edge cases at feature scope, _categorizing_ their criticality, and _deciding_ which ones get promoted to acceptance criteria vs. left as test-level concerns.

---

## Finding Edge Cases Through Business & Architecture Analysis

Edge-case enumeration is most effective when grounded in two perspectives: what the business cannot afford to get wrong, and where the architecture has natural failure points.

### Business Value & Risk Perspective

Start from the value the feature is meant to deliver, then ask what could undermine it.

**Map the business surface:**

- **Key value proposition** — what value does this feature provide to the user? to the business?
- **Success metrics (KPIs)** — which numbers does this feature move? (conversion, retention, revenue, NPS)
- **User personas affected** — primary, secondary, edge personas (admin, support, low-engagement user)
- **Critical user journeys** — which journeys does this feature enable, gate, or change?

**Then ask, deliberately:**

- _What outcome would fail the user?_ (not just an error — a wrong answer they trust)
- _What outcome would fail the business?_ (revenue leakage, compliance breach, reputational damage)
- _Which persona, in which journey, is one mishap away from churning?_

These questions surface edge cases that pure technical analysis misses — e.g., "what if a user starts the flow on web and finishes it on mobile?" or "what if the same record is being edited by two users?"

### Technical Architecture & Integration Points

Architecture defines where the feature touches the world. Every touch point is a potential edge case factory.

**Map the architecture surface:**

- **Frontend** — components to create / modify, pages and routes, state transitions
- **Backend** — APIs, business services, side effects (emails, notifications, audit logs)
- **Database** — tables involved, complex / high-impact queries, integrity rules
- **External services** — third-party APIs (payments, email, SMS, identity)

**Identify integration points (this is where edge cases concentrate):**

- **Internal**: Frontend ↔ Backend API; Backend ↔ Database; Backend ↔ Auth Service
- **External**: System ↔ Payment provider; System ↔ Email service; System ↔ Analytics

**Sketch the data flow:**

```
User → Frontend → API Gateway → Service X → Database
                              ↓
                        External Service
```

For each arrow in that diagram, ask: _what happens if this hop fails, slows down, or returns unexpected data?_ Each answer is one or more edge cases.

### Risk-Driven Edge Case Enumeration

Risks at feature level translate directly into edge cases at scenario level. Walk through three categories.

**Technical risks → edge cases:**

- _"The API can return 500 under load"_ → edge case: user submits, gets 500, retries — does the system de-duplicate?
- _"Database write can succeed while email send fails"_ → edge case: record exists, but no notification — what does the user see next time?
- _"The frontend can drop the websocket connection"_ → edge case: state arrives stale; how does the UI recover?

For each technical risk, capture: impact, likelihood, area affected, and the **specific edge-case scenarios** that would expose it. Those scenarios feed into AC or test plans.

**Business risks → edge cases:**

- _"Pricing rule could be applied incorrectly during a promotion"_ → edge cases: promo expired mid-checkout; user qualifies for two overlapping promos; admin edits price while user has item in cart
- _"User personal data could leak across accounts"_ → edge cases: shared device; session expiry mid-action; email change followed by password reset

For each business risk, link the impact (KPI, user persona affected) to the concrete scenarios that mitigate it.

**Integration risks → edge cases:**

- For every integration point, list the failure modes: timeout, partial response, malformed payload, auth refused, rate-limited, version skew
- Each failure mode is at least one edge case to design for

### Critical Analysis & Questions for Story Refinement

While enumerating, you will surface ambiguities and missing information at the feature level. Capture these explicitly — they often become PO / Dev clarification questions before the work starts:

**Ambiguities** — language in the epic or stories that admits more than one interpretation:

- Document where it appears, the question it raises, and the impact if not clarified
- Each ambiguity often hides one or more edge cases

**Missing information** — facts the team needs to design for an edge case but does not yet have:

- What is missing, why it is needed, what to add to the story or epic
- Without it, edge case behavior cannot be specified

**Suggested improvements** — concrete proposals to tighten the story before implementation:

- Story affected, current state, suggested change, the quality benefit

---

## Common Categories of Edge Cases

Use these categories as a checklist when enumerating. Most features touch most categories; the question is which scenarios within each category matter for _this_ feature.

### Boundary Cases

- Minimum and maximum values (length, count, quantity, date range)
- Zero, one, exactly-at-the-limit, one-over-the-limit
- Empty input, whitespace-only, null vs. missing
- Very long strings (256, 1024, 10000 chars)
- Special characters: quotes, backslashes, emoji, RTL scripts
- Unicode normalization (composed vs. decomposed forms)

### Error & Failure Cases

- Network errors: timeout, DNS failure, connection reset
- Database errors: deadlock, constraint violation, replica lag
- External service errors: 4xx / 5xx, malformed response, auth refused
- Validation errors: at the field level, at the form level, server-side after client-side passed
- Authorization errors: token expired, role changed mid-session, scope insufficient

### Concurrency & State Cases

- Two users editing the same record simultaneously
- Same user double-clicking submit; duplicate API requests
- Out-of-order events: response arrives after the user has moved on
- Stale state: user sees data that has changed server-side
- Optimistic UI rollback when the server rejects

### Performance & Resource Cases

- High volume: 10,000 records in a list, 100 simultaneous operations
- Slow network: 3G, intermittent connectivity, captive portals
- Memory pressure: large file upload, big response payload
- Rate limits: hitting third-party caps, throttling response
- Cold start vs. warm cache; first-time user vs. returning user state

### User-Specific Cases

- Roles and permissions: admin vs. user vs. read-only viewer
- Locale: date format, number format, currency, timezone, RTL languages
- Device: mobile vs. desktop, small viewport, touch vs. mouse
- Accessibility: screen reader, keyboard-only, high-contrast mode, reduced motion
- Returning user with stale local state (cached tokens, old preferences)

---

## Enumerating Edge Cases: Worksheet

A repeatable five-step pass for any feature.

### 1. List the Happy Path

Write the main success scenario in plain language: _the user does X, and the system does Y, and the outcome is Z._ You cannot find edges without first knowing the center.

### 2. Ask "What Could Go Wrong?"

For each step in the happy path, brainstorm failure modes from each category above. Do not filter yet — list everything plausible.

### 3. Check Risks Identified at Epic Level

Cross-reference the technical / business / integration risks already enumerated. Each risk should map to one or more edge-case scenarios. If any risk has no corresponding edge case, you have a coverage gap.

### 4. Review NFRs (Non-Functional Requirements)

NFRs are edge-case generators. For each that applies:

- **Performance NFR** (e.g., page load < 2s) → edge: what happens at p99? Under load? With slow backend?
- **Security NFR** (e.g., passwords hashed with bcrypt) → edge: what about session reuse, replay, CSRF?
- **Usability NFR** (e.g., usable on screen reader) → edge: what about keyboard-only navigation through error states?

Each NFR should produce at least one concrete edge-case scenario the team will design and verify against.

### 5. Enumerate by Category

Go category by category (Boundary, Error, Concurrency, Performance, User-specific) and ask: _for this feature, which scenarios in this category are realistic and important?_ Write them down — even the obvious ones.

The output of the worksheet is a flat list of candidate edge cases ready to be documented and triaged.

---

## Documenting Edge Cases

Each edge case deserves a short, structured note. Keep it lightweight — this is enumeration, not full design.

**Per-edge-case template:**

```
Edge case: <one-line description>

Trigger:           <what causes the system to enter this scenario>
Expected behavior: <what the system should do — or "needs PO confirmation">
Criticality:       High | Medium | Low
Category:          Boundary | Error | Concurrency | Performance | User-specific
Source:            Original story | Discovered during enumeration
Action:            Promote to AC | Test-only concern | Defer (with reason)
```

**Criticality heuristic:**

- **High** — failure leads to data loss, money at risk, security exposure, or breaks a critical user journey
- **Medium** — failure causes user friction, support load, or an obviously bad experience
- **Low** — failure is cosmetic, recoverable on retry, or affects a small subset of edge users

---

## Validating Edge Case Coverage

Per acceptance criterion, run a quick coverage check before the AC is considered "ready":

- [ ] At least one positive scenario covering the typical success path
- [ ] At least one error / validation scenario covering the obvious failure mode
- [ ] Boundary scenarios for every numeric range, length limit, or quantity rule
- [ ] Concurrency scenario if more than one actor or rapid repeat is possible
- [ ] External-failure scenario for every integration point this AC depends on
- [ ] NFR-driven scenario if a performance / security / usability NFR applies

Gaps in this checklist do not necessarily block — but they should be acknowledged and decided, not silent.

---

## Integrating Edge Cases into Story Refinement

Edge-case enumeration produces raw material. The decisions about _what to do with each one_ happen in story refinement.

### 3-Amigos Discussion (Cross-Reference)

Bring the enumerated edge cases into a 3-amigos conversation:

- **PO / PM** — confirms expected behavior for each high-criticality edge case; defers or kills the rest
- **Dev** — validates feasibility, surfaces hidden complexity, proposes a default behavior where the PO has none
- **QA / Tester** — confirms each promoted edge case is verifiable, captures the rest as test-level concerns

For the full 3-amigos protocol, see `story-refinement.md`.

### Updating Story AC: Decision Rule

For each enumerated edge case, apply this rule:

> **High-criticality edge case + clear expected behavior → promote to acceptance criterion**
>
> Otherwise → leave as a test-only concern (out of scope of this skill)

This rule keeps stories focused: AC describes the behaviors the _team and PO_ have explicitly agreed on. Other edge cases still get tested, but not via the AC contract — they live in the test plan.

A few practical notes:

- _"Clear expected behavior"_ means you can write a `Then` clause without "it depends." If you cannot, ask the PO before promoting
- _"High-criticality"_ is the heuristic from above — money, data, security, or critical journey
- Medium-criticality edge cases with _very clear_ expected behavior may also be promoted at PO discretion
- Anything deferred should be documented (with reason) so it is not silently lost

---

## Common Patterns: Edge Cases That Often Slip

Patterns that recur across features regardless of domain. Use this list as a final sanity check.

- **Off-by-one** at boundaries — `<=` vs. `<`, inclusive vs. exclusive ranges
- **Timezone confusion** — server in UTC, user in local, DST transitions, "today" semantics across midnight
- **Decimal precision** — money in floats, rounding inconsistencies between client and server
- **Unicode pitfalls** — counting characters vs. bytes vs. code points; emoji and combining marks
- **Null vs. empty vs. missing** — three different states often collapsed into one
- **Concurrent access** — two writes racing, lost update, last-writer-wins without intent
- **Idempotency** — retried requests creating duplicates; payment double-charges
- **Pagination** — items added / removed mid-pagination; very large page numbers
- **Stale cache** — user sees yesterday's data; cache invalidation lagging behind writes
- **Partial success** — multi-step operation where step 2 of 3 fails; what state is the user left in?
- **Boundary identity** — exactly-zero amounts, expired-just-now sessions, end-of-period transactions
- **Trust boundaries** — client-side validation passes, server-side fails; assumed user role wrong

---

## Related References

- See `acceptance-criteria.md` for AC quality patterns, Gherkin scenario writing, and the AC refinement workflow
- See `story-refinement.md` for the full story-level INVEST checklist and 3-amigos protocol
- See `epic-creation.md` for epic-level scope refinement (the layer above edge-case enumeration)
- For formal test case design, parametrization, fixtures, and automation — out of scope here
