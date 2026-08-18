# BK-212 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-212)

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) — Notifications | Get notified on bug assignment and status changes

***Status***: Refined — Awaiting PO/Dev review in Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-07-19
***Refined by***: QA — Shift-Left batch session
***Modality***: jira-xray configured; Story ATP field used for Shift-Left DRAFT

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: Sara Iglesias, Full-Stack Developer.
- ***Secondary personas***: Elena Vargas, Senior QA Engineer; Mateo Silva, QA Lead, as non-recipient/permission boundary checks.
- ***Business value proposition***: Developers learn about bug ownership and bug lifecycle movement without polling Jira-like boards or QA dashboards.
- ***KPI(s) influenced***: bug pickup latency, retest turnaround time, missed-assignment rate, notification usefulness.
- ***User journey position***: Notifications Center event source for bug lifecycle events; consumed through [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) inbox.

### Technical context

- ***Frontend***: inbox surface belongs to BK-209; this Story should produce notification rows compatible with that surface.
- ***Backend***: requires bug assignment/status-change event source from [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31), notification persistence, recipient resolution, dedupe, and deep-link generation.
- ***External services***: none in scope; email/digest/preferences are explicitly out of scope.
- ***Integration points specific to this Story***: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug lifecycle, [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) notification inbox, workspace/project visibility rules.

### Story complexity

| ***Axis**** | ****Rating**** | ****Why*** |
| --- | --- | --- |
| Business logic | High | Recipient rules differ by event type and must exclude actor/self-notification. |
| Integration | High | Depends on bug lifecycle events and notification inbox substrate. |
| Data validation | Medium | Must dedupe reporter+assignee same person and enforce workspace visibility. |
| UI | Medium | Notification content, unread state, icon/chip, and deep link must be understandable. |

***Estimated test effort***: High for a notification story because most defects hide in recipient matrices, race/dedupe behavior, and visibility rules rather than the happy path.

### Epic-level inheritance

- [https://jira.upexgalaxy.com/browse/BK-208#icft=BK-208](https://jira.upexgalaxy.com/browse/BK-208#icft=BK-208) defines in-app notification inbox, event subscriptions for run/bug lifecycles, preferences, and digest as one ecosystem.
- [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) consumes [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug lifecycle and [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) inbox; it should not invent a standalone notification UI or bug status vocabulary.
- Existing PO ratification says bug status names remain deferred to [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31).

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| ***#**** | ****Location in Story**** | ****Question for PO/Dev/Design**** | ****Impact on testing**** | ****Suggested clarification / role answer*** |
| --- | --- | --- | --- | --- |
| 1 | Dependency note | PO: Can [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) enter dev before [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug lifecycle ships? | Without event source, QA cannot validate assignment/status triggers. | ***PO answer***: No. [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) is Ready for Dev only after [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) exposes bug assignment and status-change events. Until then it stays estimated but dependency-gated. |
| 2 | Business Rules | Dev: What event contract should fire notifications? | QA needs deterministic triggers and idempotency checks. | ***Dev answer***: Consume domain events from [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31): `bug.assigned` and `bug.status_changed`, carrying bug id/title, workspace/project id, previous status, next status, actor id, reporter id, previous assignee id, current assignee id, and run/test context ids. |
| 3 | Business Rules | Dev: How is duplicate delivery prevented when reporter and assignee are the same user? | Could create duplicate inbox rows for one human. | ***Dev answer***: Build recipient set as a unique set before insert; one event produces at most one notification per user/event/bug/status transition. |
| 4 | Scope | Design: What exactly should the notification row show? | QA needs stable assertions for icon/copy/chip/link. | ***Design answer***: Use bug icon; primary text starts with bug title; secondary metadata shows either `Assigned to you` or `Status changed: <old> -> <new>`; severity chip reuses [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug chip once available. |
| 5 | Scope | Dev/PO: What happens if a recipient loses access after notification creation? | Visibility can leak bug existence. | ***Dev/PO answer***: Inbox query must re-check current workspace/project visibility; inaccessible bug notifications are hidden or suppressed, not shown with broken links. |

### Gaps (missing info)

| ***#**** | ****Type**** | ****Why critical**** | ****What to add**** | ****Risk if omitted*** |
| --- | --- | --- | --- | --- |
| 1 | Dependency gate | [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) lifecycle is not implemented in current target repo evidence. | Add readiness note: implementation starts after [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) event source exists. | Dev estimates notification delivery without source events. |
| 2 | Recipient matrix | Current ACs cover examples, not full rule table. | Add recipient decision table for assignment and status change. | Self-notifications or uninvolved-user leaks reach production. |
| 3 | Deep link behavior | Scope says link lands on bug with run context but not fallback if run context is absent. | Define deep link target and fallback. | Notification opens dead/ambiguous page. |
| 4 | Dedupe/idempotency | Business rule says at most one notification per recipient, but idempotency key not specified. | Define uniqueness key per event id + recipient id. | Retries create duplicate inbox rows. |

### Edge cases not in Story

| ***#**** | ****Scenario**** | ****Expected behavior (best guess)**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Reporter and current assignee are same user, teammate changes status | One notification only. | High | Add to AC / test. |
| 2 | Bug reassigned from Sara to Mateo | Mateo receives assignment notification; Sara receives no removal notification. | Medium | Covered by business rule; test. |
| 3 | Actor is also reporter or assignee | Actor receives no notification for their own change. | High | Add to AC / test. |
| 4 | Bug status changes twice quickly | Two distinct notifications preserve chronological status transitions. | Medium | Test if [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) provides event ids/timestamps. |
| 5 | Recipient loses project/workspace access after notification exists | Notification is hidden or deep link is blocked. | Critical | Add to AC / test. |
| 6 | Bug lacks attached run context | Deep link lands on bug detail and shows available context only. | Medium | Needs PO/Dev confirmation. |

### Contradictions

No contradictions found. Existing comment explicitly ratifies that bug status vocabulary is owned by [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31), consistent with Business Rules.

### Testability validation

***Verdict***: Partial

- ACs are good on recipient behavior, but implementation is blocked until [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) exposes bug lifecycle events.
- Deep-link fallback and idempotency key need explicit implementation rules.
- Current target repo evidence shows no notification/bug tables yet; this is expected for post-MVP dependency work, but it increases estimation risk.

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — Notified when a bug is assigned to me

#### Scenario 1.1: Should notify the new assignee when another user assigns a bug to them (Type: Positive, Priority: Critical)

- ***Given***: Elena reports bug `Checkout total rounds incorrectly` with run/test context attached.
- ***When***: Elena assigns that bug to Sara.
- ***Then***:

#### Scenario 1.2: Should notify the new assignee only on reassignment (Type: Positive, Priority: High)

- ***Given***: bug `Checkout total rounds incorrectly` is assigned to Sara.
- ***When***: Elena reassigns the bug to Mateo.
- ***Then***:

### Original AC2 — Notified when a bug I reported changes status

#### Scenario 2.1: Should notify the reporter when someone else changes status (Type: Positive, Priority: Critical)

- ***Given***: Sara reported bug `Session expires during long run`.
- ***When***: Elena moves the bug from `open` to `in progress`.
- ***Then***:

### Original AC3 — Notified when a bug assigned to me changes status

#### Scenario 3.1: Should notify the current assignee when someone else changes status (Type: Positive, Priority: Critical)

- ***Given***: bug `Checkout total rounds incorrectly` is assigned to Sara.
- ***When***: Elena moves that bug back to `open` after retesting.
- ***Then***:

### Original AC4 — No self-notification for my own bug updates

#### Scenario 4.1: Should suppress status notification when actor is the assignee (Type: Negative, Priority: Critical)

- ***Given***: bug `Checkout total rounds incorrectly` is assigned to Sara.
- ***When***: Sara moves the bug to `in progress` herself.
- ***Then***:

#### Scenario 4.2: Should suppress status notification when actor is the reporter (Type: Negative, Priority: High)

- ***Given***: Sara reported bug `Session expires during long run`.
- ***When***: Sara moves that bug to `in progress` herself.
- ***Then***:

### Original AC5 — Uninvolved teammates are not notified

#### Scenario 5.1: Should not notify users who are neither reporter nor assignee (Type: Negative, Priority: Critical)

- ***Given***: Mateo neither reported nor is assigned to bug `Checkout total rounds incorrectly`.
- ***When***: that bug changes status.
- ***Then***:

### New scenarios surfaced from Phase 2 edge cases — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should dedupe reporter and assignee when they are the same recipient (Type: Edge, Priority: Critical)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred from business rule.
- ***Given***: Sara both reported and is assigned to bug `Session expires during long run`.
- ***When***: Elena changes the bug status.
- ***Then***: Sara receives exactly one notification, not two.

#### Scenario E2: Should hide inaccessible bug notifications after access loss (Type: Edge, Priority: Critical)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred from workspace visibility rule.
- ***Given***: Sara had access to the project when a notification was created.
- ***When***: Sara later loses access to that project or workspace.
- ***Then***: Sara no longer sees that notification or cannot open a leaking deep link.

#### Scenario E3: Should keep one notification per source event on retry (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: requires [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) event id or equivalent idempotency key.
- ***Given***: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) emits the same status-change event twice because of a retry.
- ***When***: notification delivery processes both attempts.
- ***Then***: recipient receives one notification for that source event.

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| ***Type**** | ****Count**** | ****Notes*** |
| --- | --- | --- |
| Positive | 4 | Assignment, reassignment, reporter status, assignee status. |
| Negative | 3 | Self-notification suppression and uninvolved teammate exclusion. |
| Boundary | 2 | Reporter=assignee dedupe; access-loss visibility boundary. |
| Integration | 4 | [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) event source, [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) inbox, bug deep link, workspace visibility. |
| API | 4 | Event ingestion/handler, notification write, inbox read, deep-link resolution. |
| ***Total**** | ****17*** | Drives PO/Dev estimation. |

***Rationale***: This is not a simple UI row story. Coverage is driven by recipient decision tables, event-source integration, idempotency, and RBAC visibility. ACs define the floor; risk lives in retry/dedupe/access-loss cases.

### Outline list (NAMES ONLY — preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should notify new assignee when another user assigns a bug*** — Pre: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug exists with run context. Expected: one unread assignee notification with deep link.
- ***Should notify new assignee when bug is reassigned*** — Pre: bug moves from Sara to Mateo. Expected: Mateo notified; Sara not notified for removal.
- ***Should notify reporter when someone else changes bug status*** — Pre: Sara is reporter. Expected: Sara receives status-change notification.
- ***Should notify current assignee when someone else changes bug status*** — Pre: Sara is assignee. Expected: Sara receives status-change notification.

#### Negative

- ***Should suppress notification when reporter changes their own bug status*** — Pre: Sara is reporter and actor. Expected: no Sara notification.
- ***Should suppress notification when assignee changes their own assigned bug status*** — Pre: Sara is assignee and actor. Expected: no Sara notification.
- ***Should not notify teammate outside reporter/assignee audience*** — Pre: Mateo is uninvolved. Expected: no Mateo notification.

#### Boundary

- ***Should create one notification when reporter and assignee are the same user*** — Pre: Sara is both reporter and assignee. Expected: one notification only.
- ***Should hide notification when recipient loses bug visibility*** — Pre: notification exists before access removal. Expected: no leaked notification/deep link after access removal.

#### Integration

- ***Should consume BK-31 bug assignment event with required payload*** — Pre: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) emits `bug.assigned`. Expected: recipient set resolves from event payload.
- ***Should consume BK-31 bug status-change event with old/new status names*** — Pre: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) emits `bug.status_changed`. Expected: notification displays status transition using [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) vocabulary.
- ***Should render BK-212 notifications in BK-209 inbox*** — Pre: notification persisted unread. Expected: inbox shows bug icon/copy/chip/link.
- ***Should deep-link to bug detail with run/test context*** — Pre: bug has attached run context. Expected: link opens bug context, not generic project page.

> ***NOT included here***: parametrization tables, exact test data JSON, full execution steps, or Faker recipes. These land in `/sprint-testing` after implementation exists.

---

## Phase 5 — Edge Cases (DRAFT)

| ***#**** | ****Edge case**** | ****In original Story?**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Reporter and assignee are the same recipient | No, but business rule states one notification per recipient | Critical | Add to AC/test. |
| 2 | Actor is reporter or assignee | Partially | Critical | Add explicit reporter self-change scenario. |
| 3 | Reassignment from one assignee to another | Partially | Medium | Test as assignment subtype. |
| 4 | Recipient loses project/workspace access | Business rule only | Critical | Add to AC/test. |
| 5 | Duplicate event delivery/retry | No | High | Dev must implement idempotency key. |
| 6 | Bug has no run context attached | No | Medium | PO/Dev confirm fallback. |

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- Story is strong on business intent and recipient rules, but implementation remains dependency-gated by [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) and [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209).
- Recipient matrix and idempotency need to be explicit before development to prevent noisy or leaking notifications.
- Current repo evidence has no notification/bug persistence yet, so estimate includes integration uncertainty but assumes dependencies deliver their own foundations.

---

## Critical Questions for PO

> These BLOCK sprint planning unless accepted as the role decisions below.

1. ***Can BK-212 be developed before BK-31 ships the bug lifecycle?***

1. ***What should happen when a bug has no run/test context attached?***

1. ***Should previously assigned users be notified when a bug is reassigned away from them?***

---

## Technical Questions for Dev

> These do not block PO intent, but they define implementation contracts.

1. ***Which event contract powers this Story?*** — Use [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) `bug.assigned` and `bug.status_changed` events with bug id/title, workspace/project id, actor id, reporter id, previous/current assignee, previous/next status, and run/test context ids.
2. ***How do we enforce dedupe/idempotency?*** — Use a unique key of source event id + recipient id. Build the recipient list as a set before insertion.
3. ***Where is visibility enforced?*** — Enforce at write time when resolving recipients and again at inbox read/deep-link time through workspace/project visibility checks.
4. ***What payload does BK-209 inbox need?*** — Notification rows need type, actor, bug id/title, transition metadata, severity display fields when available, recipient id, read state, created timestamp, and deep-link target.

---

## Design Questions / Decisions

1. ***What should the notification row look like?***

1. ***How should status transitions render?***

1. ***How should inaccessible or deleted bug links behave visually?***

---

## Suggested Story Improvements

| ***#**** | ****Current state**** | ****Suggested change**** | ****Benefit*** |
| --- | --- | --- | --- |
| 1 | ACs list examples only | Add recipient decision table for assignment/status/self/involved/uninvolved | Makes audience logic testable. |
| 2 | Dependency note in narrative | Add explicit readiness gate on [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) and [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) | Prevents premature implementation. |
| 3 | Deep link says run context attached | Add fallback when run context is absent or inaccessible | Avoids broken UX. |
| 4 | Dedupe appears only in business rule | Add source event id + recipient id uniqueness rule | Prevents notification spam on retries. |

---

## Data feasibility flags

- ***Entity / fixture missing***: Current repo evidence has no notification persistence or bug domain tables yet.
- ***API contract gap***: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) event payload is not yet present in code evidence.
- ***Required pre-work***: [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) bug lifecycle and [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) inbox substrate must exist before [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) implementation can be tested end-to-end.

---

## Recommended testing strategy

### Pre-implementation

- Confirm [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) event payload and status vocabulary.
- Confirm [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) inbox row contract and deep-link route.
- Add recipient decision table to implementation plan.

### During implementation

- Validate event ingestion, recipient resolution, dedupe/idempotency, and RBAC visibility at API/DB level before UI.
- Cover notification row copy and deep links in UI once [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) is available.

### Post-implementation

- Run cross-workspace visibility checks and retry/double-event checks.
- Add regression candidates for assignment, status change, self-suppression, uninvolved user, reporter=assignee dedupe, and access-loss visibility.

---

## Estimation

***Recommended Story Points***: 8

***Why***: Scope is more than a UI notification row but less than building the full inbox or bug lifecycle. The estimate assumes [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) already provides bug events and [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) already provides inbox persistence/rendering. [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) still owns recipient decision logic, dedupe, event-to-notification mapping, visibility enforcement, and deep-link validation.

***Estimate risk***: If [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31)/[https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) do not provide those contracts before implementation starts, this becomes a 13-point story or should be split.

---
_Synced from Jira by sync-jira-issues_
