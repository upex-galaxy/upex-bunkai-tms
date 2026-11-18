# Edge cases and failure scenarios: enumeration guide

> **Purpose:** help product managers, product owners and architects find edge cases at feature or epic level, before stories are sliced and sprints start, so the team builds for them on purpose instead of meeting them in production.

---

## What edge cases are

An edge case is a scenario at or beyond the boundary of expected behavior: empty input, maximum length, simultaneous actions, partial failures, unusual user contexts, network problems, stale state.

Edge cases are not bugs. They are real situations that can happen in production, and the only question is whether the system was designed to handle them or whether you learn the answer the hard way.

At PM level the distinction is:

- Expected behavior is what the feature does on the happy path and the main negative paths.
- An edge case is a situation outside those paths that still has a defined, intentional response.

This guide covers finding edge cases at feature scope, rating their criticality, and deciding which become acceptance criteria and which stay test-level concerns.

---

## Finding edge cases through business and architecture analysis

Enumeration works best from two angles: what the business cannot afford to get wrong, and where the architecture fails naturally.

### Business value and risk

Start from the value the feature should deliver, then ask what could undermine it.

Map the business surface:

- The value proposition: what the feature gives the user and the business.
- The success metrics (KPIs) it moves, such as conversion, retention, revenue or NPS.
- The personas affected: primary, secondary and edge personas (admin, support, low-engagement user).
- The critical user journeys it enables, gates or changes.

Then ask:

- What outcome would fail the user? Not only an error, but a wrong answer they trust.
- What outcome would fail the business? Revenue leakage, a compliance breach, reputational damage.
- Which persona, in which journey, is one mishap from churning?

These questions surface cases that technical analysis misses, such as a user who starts a flow on web and finishes on mobile, or one record edited by two users at once.

### Technical architecture and integration points

Architecture defines where the feature touches the world, and every touch point can produce edge cases.

Map the architecture surface:

- Frontend: components to create or change, pages and routes, state transitions.
- Backend: APIs, business services, side effects (emails, notifications, audit logs).
- Database: tables involved, complex or high-impact queries, integrity rules.
- External services: third-party APIs for payments, email, SMS and identity.

Integration points are where edge cases concentrate:

- Internal: frontend and backend API, backend and database, backend and auth service.
- External: the system and the payment provider, the email service, analytics.

Sketch the data flow:

```
User → Frontend → API Gateway → Service X → Database
                              ↓
                        External Service
```

For each arrow, ask what happens if that hop fails, slows down or returns unexpected data. Each answer is one or more edge cases.

### Risk-driven enumeration

A risk at feature level translates directly into edge cases at scenario level. Walk three categories.

Technical risks:

- "The API can return 500 under load" gives the case where the user submits, gets a 500 and retries. Does the system de-duplicate?
- "A database write can succeed while the email send fails" gives a record with no notification. What does the user see next time?
- "The frontend can drop the websocket connection" gives stale state on arrival. How does the UI recover?

For each technical risk, capture the impact, the likelihood, the area affected and the specific scenarios that would expose it. Those scenarios feed AC or test plans.

Business risks:

- "A pricing rule could be applied wrongly during a promotion" gives these cases: the promo expires mid-checkout, a user qualifies for two overlapping promos, an admin edits the price while the item is in a cart.
- "Personal data could leak across accounts" gives these cases: a shared device, a session that expires mid-action, an email change followed by a password reset.

For each business risk, link the impact (KPI, persona affected) to the concrete scenarios that mitigate it.

Integration risks: for every integration point, list the failure modes (timeout, partial response, malformed payload, auth refused, rate limit, version skew). Each failure mode is at least one edge case to design for.

### Ambiguities and gaps for story refinement

While enumerating, you will find ambiguities and missing information at feature level. Write them down, because they often become PO and developer questions before work starts.

- Ambiguities are wording in the epic or stories that allows more than one reading. Record where it appears, the question it raises and the impact if left unclear. Each often hides an edge case.
- Missing information is what the team needs to design for an edge case but does not have. Record what is missing, why it is needed and what to add to the story or epic. Without it the behavior cannot be specified.
- Suggested improvements are concrete proposals to tighten a story before implementation: the story affected, its current state, the change and the quality benefit.

---

## Common categories

Use these as a checklist. Most features touch most categories, so the question is which scenarios in each category matter for this feature.

### Boundary cases

- Minimum and maximum values (length, count, quantity, date range).
- Zero, one, exactly at the limit, one over the limit.
- Empty input, whitespace only, null versus missing.
- Very long strings (256, 1024, 10000 characters).
- Special characters: quotes, backslashes, emoji, right-to-left scripts.
- Unicode normalization (composed versus decomposed forms).

### Error and failure cases

- Network errors: timeout, DNS failure, connection reset.
- Database errors: deadlock, constraint violation, replica lag.
- External service errors: 4xx and 5xx, malformed response, auth refused.
- Validation errors at the field level, the form level, and server-side after client-side passed.
- Authorization errors: token expired, role changed mid-session, insufficient scope.

### Concurrency and state cases

- Two users editing the same record at once.
- The same user double-clicking submit, producing duplicate API requests.
- Out-of-order events, such as a response arriving after the user has moved on.
- Stale state, where the user sees data that changed server-side.
- Optimistic UI rollback when the server rejects.

### Performance and resource cases

- High volume: 10,000 records in a list, 100 simultaneous operations.
- Slow networks: 3G, intermittent connectivity, captive portals.
- Memory pressure: a large file upload or a big response payload.
- Rate limits: hitting third-party caps, throttled responses.
- Cold start versus warm cache, first-time versus returning user state.

### User-specific cases

- Roles and permissions: admin, user, read-only viewer.
- Locale: date format, number format, currency, timezone, right-to-left languages.
- Device: mobile versus desktop, small viewport, touch versus mouse.
- Accessibility: screen reader, keyboard only, high contrast, reduced motion.
- A returning user with stale local state (cached tokens, old preferences).

---

## Worksheet

A repeatable five-step pass for any feature.

### 1. List the happy path

Write the main success scenario in plain language: the user does X, the system does Y, the outcome is Z. You cannot find the edges without knowing the center.

### 2. Ask what could go wrong

For each step of the happy path, brainstorm failure modes from each category above. Do not filter yet. List everything plausible.

### 3. Check the risks identified at epic level

Cross-reference the technical, business and integration risks already listed. Each risk should map to at least one edge-case scenario, and a risk with none is a coverage gap.

### 4. Review the NFRs

Non-functional requirements generate edge cases. For each that applies:

- A performance NFR (for example page load under 2s) raises what happens at p99, under load, or with a slow backend.
- A security NFR (for example passwords hashed with bcrypt) raises session reuse, replay and CSRF.
- A usability NFR (for example usable with a screen reader) raises keyboard-only navigation through error states.

Each NFR should yield at least one concrete edge-case scenario the team designs and verifies against.

### 5. Enumerate by category

Go through Boundary, Error, Concurrency, Performance and User-specific, and ask which scenarios in each are realistic and important for this feature. Write down the obvious ones too.

The worksheet's output is a flat list of candidate edge cases, ready to document and triage.

---

## Documenting edge cases

Give each edge case a short, structured note. Keep it light, because this is enumeration and not full design.

```
Edge case: <one-line description>

Trigger:           <what causes the system to enter this scenario>
Expected behavior: <what the system should do, or "needs PO confirmation">
Criticality:       High | Medium | Low
Category:          Boundary | Error | Concurrency | Performance | User-specific
Source:            Original story | Discovered during enumeration
Action:            Promote to AC | Test-only concern | Defer (with reason)
```

Rate criticality like this:

- High: failure causes data loss, puts money at risk, exposes security, or breaks a critical user journey.
- Medium: failure causes user friction, support load or an obviously bad experience.
- Low: failure is cosmetic, recoverable on retry, or affects a small subset of edge users.

---

## Validating coverage

Before an acceptance criterion counts as ready, run this check against it:

- [ ] At least one positive scenario covers the typical success path.
- [ ] At least one error or validation scenario covers the obvious failure mode.
- [ ] Boundary scenarios exist for every numeric range, length limit or quantity rule.
- [ ] A concurrency scenario exists if more than one actor or a rapid repeat is possible.
- [ ] An external-failure scenario exists for every integration point the AC depends on.
- [ ] An NFR-driven scenario exists if a performance, security or usability NFR applies.

A gap in this list does not necessarily block the story, but it is acknowledged and decided, never silent.

---

## Integrating edge cases into story refinement

Enumeration produces raw material. The decision on what to do with each case happens in story refinement.

### Three-amigos discussion

Bring the enumerated cases to a three-amigos conversation:

- PO or PM confirms the expected behavior of each high-criticality case and defers or drops the rest.
- Dev checks feasibility, surfaces hidden complexity, and proposes a default behavior where the PO has none.
- QA or tester confirms each promoted case is verifiable and takes the rest as test-level concerns.

The full protocol is in `story-refinement.md`.

### Updating story AC: the decision rule

> High-criticality edge case with clear expected behavior: promote it to an acceptance criterion.
>
> Anything else: leave it as a test-only concern (outside the scope of this skill).

The rule keeps stories focused. AC describes behaviors the team and the PO have explicitly agreed on. Other edge cases still get tested, but through the test plan and not the AC contract.

Notes on applying it:

- "Clear expected behavior" means you can write a `Then` clause without "it depends". If you cannot, ask the PO before promoting.
- "High-criticality" is the heuristic above: money, data, security or a critical journey.
- A medium-criticality case with very clear expected behavior may also be promoted at the PO's discretion.
- Document anything deferred, with the reason, so it is not lost.

---

## Patterns that often slip

These recur across domains. Use the list as a final check.

- Off-by-one at boundaries: `<=` versus `<`, inclusive versus exclusive ranges.
- Timezone confusion: server in UTC, user in local time, DST transitions, which day it is across midnight.
- Decimal precision: money in floats, rounding differences between client and server.
- Unicode: counting characters versus bytes versus code points, emoji and combining marks.
- Null versus empty versus missing: three states often collapsed into one.
- Concurrent access: two racing writes, a lost update, last-writer-wins that nobody intended.
- Idempotency: retried requests creating duplicates, payment double-charges.
- Pagination: items added or removed mid-pagination, very large page numbers.
- Stale cache: the user sees yesterday's data because invalidation lags behind writes.
- Partial success: step 2 of 3 fails, and the user is left in an unknown state.
- Boundary identity: exactly-zero amounts, sessions that expired a moment ago, end-of-period transactions.
- Trust boundaries: client-side validation passes and server-side fails, or the assumed user role is wrong.

---

## Related references

- `acceptance-criteria.md`: AC quality patterns, Gherkin scenario writing and the AC refinement workflow.
- `story-refinement.md`: the story-level INVEST checklist and the three-amigos protocol.
- `epic-creation.md`: epic-level scope refinement, the layer above edge-case enumeration.
- Formal test case design, parametrization, fixtures and automation are out of scope here.
