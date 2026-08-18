# BK-209 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-209)

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) - Notifications | View an inbox of workspace events

***Status***: Refined - Open questions answered  
***Mode***: Shift-Left Phase 2, local artifact only  
***Refined on***: 2026-07-15  
***Parent epic***: [https://jira.upexgalaxy.com/browse/BK-208#icft=BK-208](https://jira.upexgalaxy.com/browse/BK-208#icft=BK-208) - Notifications Center  
***Story status***: Estimation  
***Priority***: Medium  
***Risk level***: HIGH  
***TMS modality***: jira-native, Jira handoff completed

## Source Inputs

- Story cache: `story.md`, `acceptance-criteria.md`, `business-rules.md`, `scope.md`, `out-of-scope.md`, `workflow.md`, `mockup.md`, `comments.md`.
- Project context: `.context/business/business-feature-map.md`, `.context/business/business-data-map.md`, `.context/business/business-api-map.md`, `.context/master-test-plan.md`.
- Session files: `.session/shift-left-testing/2026-07-15-bk-209-notifications-inbox/plan.md`, `candidates.md`.
- Light code evidence: `../upex-bunkai-tms/supabase/migrations/0009*cross*cutting.sql`, `0036*run*abort.sql`, `0037*run*finish.sql`, `app/(app)/layout.tsx`, `components/layout/AppSidebar.tsx`.

---

## Critical Analysis

### Business context

- ***Primary persona affected***: Elena Vargas, Senior QA Engineer.
- ***Business value***: reduces manual polling of runs, bugs, and tests by surfacing actionable workspace events in one inbox.
- ***User journey position***: after login and workspace entry, while Elena works inside a workspace and needs awareness of changes without revisiting dashboards.
- ***KPI influenced***: time-to-awareness for QA events, missed run/bug/test updates, navigation speed to actionable entities.

### Technical context

- ***Frontend***: story asks for a bell in the top bar, but current shell evidence shows a persistent left sidebar and account menu block (`app/(app)/layout.tsx`, `components/layout/AppSidebar.tsx`). This is a Design/PO alignment risk, not a QA rewrite.
- ***Backend / data substrate***: no implemented notifications module was found in provided evidence. Existing `activity_log` records workspace-scoped audit events and is readable by workspace members; it may be a substrate, but personal notification copies and read-state require a separate model or explicit projection.
- ***Event sources***: run finish and abort already emit `activity_log` actions (`run.finished`, `run.aborted`) in migrations `0036` and `0037`. Event generation for notifications belongs to sibling stories and is out of [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) scope.
- ***Security substrate***: workspace membership and RLS are central to all protected flows. Notification visibility must follow the same workspace/entity access rules.

### Story complexity

| ***Axis**** | ****Rating**** | ****Why*** |
| --- | --- | --- |
| Business logic | Medium | Read/unread state, badge count, retention, self-notification exclusion, entity fallback. |
| Integration | High | Depends on workspace membership, entity visibility, run/bug/test links, and later sibling event producers. |
| Data validation | Medium | Counts, 90-day retention, missing/deleted targets, loss of access, per-recipient state. |
| UI | High | Shell placement mismatch, anchored panel, grouping by day, responsive/empty/read states. |
| Security/RBAC | High | Notification metadata can leak inaccessible entities across workspace boundaries. |

***Estimated test effort***: High. The AC floor is 5 scenarios, but real coverage requires security, boundary, state, and integration outlines before sprint estimation.

### Epic-level inheritance

- Notifications Center depends on sibling stories for event generation, preferences, digest email, and future chat mentions.
- [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) should define the inbox surface and read-state behavior only.
- Workspace isolation, RLS, and non-disclosure are inherited from the master test plan as release-critical risks.

---

## Critical Findings

- [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) is a valid Story for extended Shift-Left refinement because it is user-facing, dynamic, workspace-scoped, and security-sensitive.
- The story has a clear MVP boundary: inbox display, badge, read-state, deep links, deleted-entity fallback, empty state.
- Main risk is not rendering rows. Main risk is leaking notification existence or entity metadata after workspace/entity access changes.
- Current code evidence does not show a notifications module. Treat `activity_log`, workspace membership, and run audit events as likely substrate only, not as implementation contract.
- Design currently says top bar, while current app shell is sidebar/account-menu driven. This needs explicit PO/Design resolution before implementation.

---

## Story Quality Analysis

### Ambiguities

| ***#**** | ****Location in Story**** | ****Question for PO/Dev**** | ****Impact on testing**** | ****Suggested clarification*** |
| --- | --- | --- | --- | --- |
| A1 | Context / Business Rules / Mockup | Should the notification entry point stay in a top bar, or adapt to the current sidebar/account-menu shell? | UI locators, responsive behavior, and acceptance screenshots differ. | Design/PO confirm final placement before sprint. |
| A2 | AC1 / Business Rules | Is the badge count workspace-specific for the active workspace only, or global across all Elena's workspaces? | Badge count and panel contents differ after workspace switching. | Use active workspace only unless PO wants cross-workspace inbox. |
| A3 | AC1 / Design intent | What exact row sort tie-breaker applies when multiple notifications share the same timestamp? | Newest-first assertion is ambiguous for same-time events. | Sort by `created_at desc`, then stable `id desc` or server order. NEEDS PO/DEV CONFIRMATION. |
| A4 | AC4 | Which route should each entity type deep-link to: run, bug, test? | Cannot validate navigation target without route contract. | Dev provides route map per entity type. |
| A5 | AC5 / Scope | What user-facing copy appears when the target entity no longer exists or is no longer accessible? | Error assertion cannot be precise. | Define copy and whether this is inline row message, toast, or panel alert. |
| A6 | Empty state design intent | What exact empty-state copy and illustration asset are expected? | UI assertion and visual review remain subjective. | Design provides copy and asset reference. |

### Gaps (missing info)

| ***#**** | ****Type**** | ****Why critical**** | ****What to add**** | ****Risk if omitted*** |
| --- | --- | --- | --- | --- |
| G1 | AC / Security | Notifications can reveal inaccessible run/bug/test metadata. | Add AC for workspace/entity visibility, including loss of access. | Cross-tenant or stale-access data leak. |
| G2 | AC / Business rule | Own actions never notify self, but no AC covers it. | Add AC or explicit non-functional rule validation. | Users see noisy/self-generated inbox items. |
| G3 | AC / Boundary | Badge cap 99+ is ratified but absent from ACs. | Add boundary AC for 0, 99, 100 unread. | Badge overflows or misleads users. |
| G4 | AC / Retention | 90-day retention is ratified but absent from ACs. | Add boundary AC for 89/90/91 days or define purge timing. | Old notifications remain visible or purge too early. |
| G5 | Technical detail | No notification persistence/read-state model is specified. | Dev confirms whether to create notifications table or project from `activity_log`. | Read-state cannot be personal or durable. |
| G6 | Integration | Sibling event producers are out of scope but [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) needs test data. | Define seed/API fixture path for notifications before QA. | In-sprint QA cannot create meaningful inbox states. |

### Contradictions

- Story, business rules, and mockup say the bell is in the top bar beside the account menu.
- Current app shell evidence shows a persistent sidebar layout with account menu in the lower sidebar, not a top bar.
- This is a Design/PO question. Do not silently rewrite the story to sidebar behavior.

### Testability validation

***Verdict***: Partial

- Positive flows are testable from the written ACs.
- Security/RBAC, access loss, badge boundaries, retention boundaries, and empty state need refined ACs or explicit PO/Dev answers.
- No implemented notifications module exists in evidence, so data creation/setup path is a Phase 3 handoff risk.
- Deep-link assertions need an entity-route map before execution.

---

## Refined Acceptance Criteria in Gherkin

### Original AC1 - Open the inbox from the bell

```
Scenario: Show unread badge and open the notification panel for the active workspace
  Given Elena is signed in and her active workspace is "UPEX Galaxy"
  And Elena has 3 unread notifications and 2 read notifications visible in that workspace
  When Elena views the application shell
  Then the notification entry point shows an unread badge with count "3"
  When Elena opens the notification entry point
  Then the notification panel opens
  And it lists only Elena's visible notifications for "UPEX Galaxy" newest-first
  And unread rows are visually distinct from read rows
  And notifications are grouped by day as Today, Yesterday, then calendar dates
```

```
Scenario: Keep notification inbox scoped to the active workspace - NEEDS PO/DEV CONFIRMATION
  Given Elena belongs to workspaces "UPEX Galaxy" and "Bunkai Labs"
  And each workspace has unread notifications for Elena
  When Elena's active workspace is "UPEX Galaxy"
  Then the badge and panel count only notifications visible in "UPEX Galaxy"
  When Elena switches to "Bunkai Labs"
  Then the badge and panel refresh to notifications visible in "Bunkai Labs"
```

```
Scenario: Show empty state when the inbox has no notifications
  Given Elena is signed in to workspace "UPEX Galaxy"
  And Elena has no visible notifications in that workspace
  When Elena opens the notification panel
  Then the panel shows the approved empty-state illustration and copy
  And no unread badge is shown
  And mark-all-as-read is hidden or disabled
```

### Original AC2 - Mark a single notification as read

```
Scenario: Mark one unread notification as read
  Given Elena's inbox shows an unread notification "Run finished: Login regression chain - passed"
  And the unread badge count is "3"
  When Elena marks that notification as read
  Then the notification switches to the read style
  And the unread badge count decreases to "2"
  And other unread notifications remain unread
```

```
Scenario: Keep read state personal per recipient
  Given Elena and Mateo can both access workspace "UPEX Galaxy"
  And both received separate copies of the same run notification
  When Elena marks her notification as read
  Then Elena's copy is read
  And Mateo's copy remains unread
```

### Original AC3 - Mark all notifications as read

```
Scenario: Mark all visible notifications as read
  Given Elena has 12 unread notifications visible in workspace "UPEX Galaxy"
  When Elena uses the mark-all-as-read control in the panel header
  Then every visible notification switches to the read style
  And the unread badge disappears
```

```
Scenario: Mark-all affects only the active workspace - NEEDS PO/DEV CONFIRMATION
  Given Elena has unread notifications in workspaces "UPEX Galaxy" and "Bunkai Labs"
  And Elena's active workspace is "UPEX Galaxy"
  When Elena uses mark-all-as-read
  Then all visible notifications in "UPEX Galaxy" are read
  And notifications in "Bunkai Labs" remain unchanged
```

### Original AC4 - A notification deep-links to its entity

```
Scenario: Deep-link to an accessible run and mark the notification as read
  Given Elena has an unread notification about the run of test "Login regression chain"
  And Elena still has access to that run's workspace and project
  When Elena clicks the notification row
  Then Elena lands on the run detail page
  And the notification is marked as read
  And the badge count decreases by 1
```

```
Scenario: Prevent deep-link navigation to an entity Elena can no longer access
  Given Elena has a notification about a run she could previously access
  And Elena later loses access to that run's workspace or project
  When Elena opens the notification inbox
  Then the notification is hidden from the panel
  And the badge count excludes that notification
```

### Original AC5 - Notification for an entity that no longer exists

```
Scenario: Deleted target stays in inbox with graceful fallback
  Given Elena has an unread notification about a test that was deleted after notification creation
  When Elena clicks the notification
  Then Elena stays in the notification inbox
  And she sees an approved message that the item is no longer available
  And the notification is marked as read
  And no broken route is opened
```

### New business-rule scenarios - NEEDS PO/DEV CONFIRMATION where inferred

```
Scenario: Do not notify a user about their own action
  Given Elena starts or finishes a run in workspace "UPEX Galaxy"
  When notification generation for that event is processed by a sibling story
  Then Elena does not receive a notification copy for her own action
```

```
Scenario: Display unread badge boundary values
  Given Elena has unread notifications in the active workspace
  When the unread count is 0
  Then no badge is shown
  When the unread count is 99
  Then the badge shows "99"
  When the unread count is 100 or more
  Then the badge shows "99+"
```

```
Scenario: Exclude notifications outside the 90-day retention window
  Given Elena has notifications created 89, 90, and 91 days ago
  When the retention purge or visibility filter is applied
  Then notifications older than 90 days are not visible
  And retained notifications keep their existing read/unread state
```

---

## Open Questions for PO / Dev / Design

### PO

1. Should [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) count and display notifications for the active workspace only, or across all workspaces?
2. Should loss of access hide old notifications entirely, or keep redacted rows with no entity metadata?
3. What exact copy should appear for deleted or unavailable target entities?
4. Should retention purge run exactly after 90 days, or can notifications on day 90 remain until the next scheduled cleanup? NEEDS PO/DEV CONFIRMATION
5. Is mark-all-as-read scoped to active workspace only? NEEDS PO/DEV CONFIRMATION

### Dev

1. Will [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) create a dedicated notifications table with per-recipient read state, or derive notifications from `activity_log` plus user-specific state?
2. Which endpoint(s) will support list, mark-one-read, and mark-all-read?
3. What is the route map for deep links by entity type: run, bug, test?
4. How will sibling event producers seed notification test data before they are fully implemented?
5. How will retention be implemented: scheduled purge, query filter, or both?

### Design

1. Does the bell belong in a top bar as written, or should the current sidebar/account-menu shell be updated?
2. What are the visual differences for read vs unread rows?
3. What are the approved empty-state illustration and copy?
4. How should a 400px anchored panel behave on narrow/mobile viewports? NEEDS PO/DEV CONFIRMATION
5. Should the panel close after row click, mark-one-read, or mark-all-read?

---

## Edge Cases Identified

| ***#**** | ****Technique**** | ****Edge case**** | ****Expected behavior**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- | --- |
| E1 | EP | User has no notifications | Empty state, no badge, no misleading loading state. | Medium | Add to AC. |
| E2 | EP | User has read-only notifications | Panel lists rows in read style; no badge. | Medium | Test only. |
| E3 | BVA | Badge count 0 / 1 / 99 / 100 | No badge at 0, exact up to 99, `99+` at 100+. | High | Add to AC. |
| E4 | BVA | Notification age 89 / 90 / 91 days | Retention boundary follows PO-confirmed rule. | High | Ask PO/Dev. |
| E5 | State-Transition | unread -> read via row click | Row becomes read and count decrements once. | High | Add to AC. |
| E6 | State-Transition | read -> mark as read again | No double decrement; state remains read. | High | Test only. |
| E7 | State-Transition | unread -> read via mark-all | All visible unread rows become read. | High | Add to AC. |
| E8 | Decision Table | workspace member + entity accessible | Notification visible and navigable. | Critical | Add to AC. |
| E9 | Decision Table | workspace member + entity deleted | Row remains, fallback message, no broken navigation. | High | Original AC5. |
| E10 | Decision Table | membership revoked or entity no longer accessible | Notification hidden or redacted per PO answer. | Critical | Add to AC. |
| E11 | Pairwise | entity type x read state x target availability | Run/bug/test rows behave consistently across visible/deleted/read/unread combinations. | High | Test reduced matrix. |
| E12 | Error Guessing | Double-click mark-one or mark-all | Idempotent update; badge decrements once. | High | Test only. |
| E13 | Error Guessing | Network failure during read update | UI does not lie about read state; shows retry/error. NEEDS PO/DEV CONFIRMATION | Medium | Ask Dev. |
| E14 | Error Guessing | Same timestamp notifications | Stable deterministic order. NEEDS PO/DEV CONFIRMATION | Medium | Ask Dev. |
| E15 | Error Guessing | Own action would generate event | No self notification copy. | High | Add to AC/business rule. |

---

## ATP DRAFT - Outline Names Only

### Coverage Estimate Counts

| ***Group**** | ****Count**** | ****Notes*** |
| --- | --- | --- |
| Positive | 7 | Core inbox, read, mark-all, deep-link, empty state, grouping. |
| Negative | 6 | Missing access, deleted target, no self-notification, unavailable route, failed update, hidden data. |
| Boundary | 5 | Badge cap and retention day boundaries. |
| Integration | 5 | FE/API/DB, activity substrate, entity links, workspace switch, sibling events. |
| Security-RBAC | 6 | Workspace and entity visibility matrix, access loss, own action exclusion. |
| State-Transition | 5 | unread/read transitions and idempotency. |
| ***Total**** | ****34*** | AC floor plus risk-beyond-AC coverage. |

***Rationale***: This story is HIGH risk because notification metadata can leak protected entity information and because read-state is per-recipient state. Counts include AC conformance plus risk-beyond-AC coverage from EP, BVA, State-Transition, Decision Table, Pairwise, and Error Guessing.

### Positive

- ***Should display unread badge for visible active-workspace notifications*** - Pre: Elena has 3 unread visible notifications. Expected: badge shows `3`.
- ***Should open notification panel with newest-first ordering*** - Pre: mixed read/unread notifications exist. Expected: panel opens and rows sort newest-first.
- ***Should visually distinguish unread rows from read rows*** - Pre: inbox has both states. Expected: unread rows use approved unread style.
- ***Should group notification rows by day*** - Pre: notifications span today, yesterday, and older dates. Expected: groups show Today, Yesterday, then dates.
- ***Should mark one notification as read from row action*** - Pre: one unread row. Expected: row becomes read and badge decrements once.
- ***Should mark all visible notifications as read*** - Pre: 12 unread visible rows. Expected: all visible rows read, badge disappears.
- ***Should show empty state when no visible notifications exist*** - Pre: no visible notifications. Expected: approved empty state and no badge.

### Negative

- ***Should not show notifications for entities Elena cannot access*** - Pre: notification target is outside Elena's accessible scope. Expected: row hidden or redacted per PO answer.
- ***Should hide notifications after Elena loses workspace or entity access*** - Pre: access revoked after notification creation. Expected: notification excluded from badge/panel.
- ***Should not create a notification for Elena's own action*** - Pre: Elena triggers event. Expected: no self notification copy.
- ***Should stay in the inbox when deleted entity deep-link is clicked*** - Pre: target was deleted. Expected: fallback message and no broken route.
- ***Should not decrement badge twice when a read notification is marked read again*** - Pre: row already read. Expected: count unchanged.
- ***Should preserve honest state when read update fails*** - Pre: API/read-state update fails. Expected: UI does not permanently show false read state. NEEDS PO/DEV CONFIRMATION.

### Boundary

- ***Should hide badge when unread count is zero*** - Pre: 0 unread. Expected: no badge.
- ***Should display exact badge count at one unread notification*** - Pre: 1 unread. Expected: badge shows `1`.
- ***Should display exact badge count at ninety-nine unread notifications*** - Pre: 99 unread. Expected: badge shows `99`.
- ***Should cap badge display at ninety-nine plus when count reaches one hundred*** - Pre: 100+ unread. Expected: badge shows `99+`.
- ***Should apply retention boundary around ninety days*** - Pre: notifications at 89/90/91 days. Expected: visibility follows PO-confirmed retention rule.

### Integration

- ***Should persist per-recipient read state after panel refresh*** - Pre: Elena marks a row read. Expected: read state remains after refresh/reopen.
- ***Should keep recipient read state independent across users*** - Pre: Elena and Mateo receive copies of same event. Expected: Elena's read action does not affect Mateo.
- ***Should navigate to run detail from a run notification*** - Pre: accessible run notification. Expected: route opens run detail and row becomes read.
- ***Should navigate to test detail from a test notification*** - Pre: accessible test notification. Expected: route opens test detail and row becomes read. NEEDS PO/DEV CONFIRMATION.
- ***Should update badge and panel after active workspace switch*** - Pre: Elena switches workspace. Expected: inbox reflects new active workspace scope.

### Security-RBAC

- ***Should enforce workspace membership before showing notification metadata*** - Pre: non-member guesses workspace/entity IDs. Expected: no notification data disclosed.
- ***Should enforce entity-level visibility before rendering notification summary*** - Pre: workspace member lacks target entity access. Expected: no leaked summary/link.
- ***Should remove notification visibility immediately after membership loss*** - Pre: Elena is removed from workspace. Expected: badge/panel exclude related notifications.
- ***Should avoid entity-existence disclosure for inaccessible targets*** - Pre: target exists but Elena lacks access. Expected: generic not-found/hidden behavior.
- ***Should scope mark-all-as-read to visible notifications only*** - Pre: hidden/inaccessible notifications exist. Expected: hidden rows are not mutated unless PO/Dev defines otherwise.
- ***Should reject direct API read-state updates for notifications outside Elena's scope*** - Pre: direct request with foreign notification ID. Expected: authorization denial or non-disclosing not found.

### State-Transition

- ***Should transition unread notification to read when row is clicked*** - Pre: unread row. Expected: read state persists and count decrements once.
- ***Should transition unread notification to read when mark-one-read is used*** - Pre: unread row. Expected: same read-state effect without navigation.
- ***Should transition all visible unread notifications to read with mark-all*** - Pre: multiple unread rows. Expected: visible unread rows become read.
- ***Should keep read notification read when mark-all is used*** - Pre: mixed read/unread rows. Expected: read rows stay read and count only reflects unread changes.
- ***Should handle double-submit of mark-all idempotently*** - Pre: mark-all triggered twice quickly. Expected: final state read, no negative count or duplicate side effects.

---

## Coverage Estimate Counts

| ***Coverage axis**** | ****Count*** |
| --- | --- |
| Original ACs covered | 5 / 5 |
| Refined Gherkin scenarios | 13 |
| Inferred scenarios needing PO/DEV confirmation | 5 |
| Edge cases identified | 15 |
| ATP draft outlines | 34 |
| Critical PO questions | 5 |
| Technical Dev questions | 5 |
| Design questions | 5 |

---

## Traceability Map Back to Original ACs and Business Rules

| ***Source**** | ****Refined scenarios / outlines**** | ****Notes*** |
| --- | --- | --- |
| Original AC1 - Open inbox from bell | Active workspace panel, newest-first, unread style, day grouping, empty state, workspace scope | Preserves original intent; entry-point placement remains Design/PO question. |
| Original AC2 - Mark single read | Mark-one-read, personal per-recipient state, idempotent already-read | Adds personal read-state validation from business rules. |
| Original AC3 - Mark all read | Mark-all visible notifications, active workspace scope, idempotent double-submit | Adds scope boundary. |
| Original AC4 - Deep-link to entity | Accessible run/test deep link, mark read on click, route map question | Needs route map for run/bug/test. |
| Original AC5 - Deleted entity fallback | Deleted target fallback, no broken navigation, mark read | Preserves AC and asks copy/channel. |
| Business rule - Personal notification copy | Per-recipient read state and no self-notification | Adds scenarios and security outlines. |
| Business rule - Visibility/security | Workspace/entity access, loss of access, non-disclosure | Critical risk area; must be explicit AC. |
| Business rule - 90-day retention | Retention boundary 89/90/91 days | Ratified in comments; exact purge timing still needs Dev/PO. |
| Business rule - badge cap 99+ | Badge 0/1/99/100+ | Ratified in comments; added boundary outlines. |
| Design intent - day grouping / empty state | Day grouping, empty state, visual read/unread | Needs final asset/copy confirmation. |
| Out of scope - event generation/preferences/email/chat | No event-producer implementation required in [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) | Sibling stories own producers/channels. |

---

## Handoff Notes for Phase 3

- Do not write to Jira until PO/Dev/Design confirm key open questions.
- If publishing later, include the refined ACs, edge cases, and ATP DRAFT in the Story ATP field/comment per jira-native handoff.
- Add `shift-left-reviewed` only after handoff approval, not from this local-only task.
- Implementation should not depend on fully shipped sibling event producers; Dev should provide seed/test hooks for notification rows.
- QA should later validate that `/sprint-testing` short-circuits planning only if Jira content and this local artifact still match the current Story.

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- Story is strong on user intent and MVP boundaries.
- Security/RBAC, retention, badge boundaries, and workspace scope need explicit acceptance coverage.
- Design placement conflicts with current shell evidence and needs PO/Design resolution before implementation.

---

## Assumptions and Blockers

### Assumptions

- Notification inbox is scoped to active workspace only. NEEDS PO/DEV CONFIRMATION.
- `activity_log` is a possible event substrate, not the final notification storage contract. NEEDS PO/DEV CONFIRMATION.
- Read-state is stored per recipient, not inferred globally from the event. Supported by business rule.
- Sibling stories will generate run/bug/test events; [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) only displays and manages inbox state.

### Blockers

- PO/Design must resolve top bar vs current sidebar/account-menu placement.
- Dev must define notification persistence model and API contracts.
- Dev must define target route map for run, bug, and test deep links.
- PO/Dev must define behavior for lost access: hide vs redacted unavailable row.
- Design must provide exact deleted-target and empty-state copy.

---

## Recommended Testing Strategy

### Pre-implementation

- Resolve entry-point placement, workspace scope, route map, lost-access behavior, and exact copy.
- Confirm notification data model and seed/test fixture strategy.
- Add explicit security and boundary ACs before estimation.

### During implementation

- Validate FE state against server source of truth for badge count and read-state.
- Ensure RLS/API authorization prevents notification metadata leaks, not only UI hiding.
- Keep event generation from sibling stories behind test fixtures or seeded rows.

### Post-implementation

- Execute UI/API/DB trifuerza for badge, panel, read-state, deep links, retention, and security matrix.
- Prioritize automation for RBAC visibility, badge boundaries, read-state idempotency, and deleted-target fallback.

---

## Open Questions - Proposed Answers

These answers were prepared from the current business, technical, and design context available during Shift-Left. They are written role-by-role so the team can see the original question and the proposed answer together.

### PO Answers

- Original Question: Should [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) count and display notifications for the active workspace only, or across all workspaces?

Answer: Active workspace only. Bunkai already uses active workspace as the operating context; mixing workspaces in one inbox increases confusion and data-leak risk.

- Original Question: Should loss of access hide old notifications entirely, or keep redacted rows with no entity metadata?

Answer: Hide them entirely. If the user no longer has access, the product should not reveal that an entity or event exists.

- Original Question: What exact copy should appear for deleted or unavailable target entities?

Answer: Use: "This item is no longer available." If the target is inaccessible, do not show entity-specific metadata. If it was deleted but still belongs to an accessible context, the original notification summary may remain.

- Original Question: Should retention purge run exactly after 90 days, or can notifications on day 90 remain until the next scheduled cleanup?

Answer: Day 90 remains visible; day 91 is outside retention. The purge can run asynchronously, but UI/API visibility must apply the 90-day filter.

- Original Question: Is mark-all-as-read scoped to active workspace only?

Answer: Yes. Mark-all affects only visible notifications in the active workspace. Hidden or inaccessible notifications must not be mutated by that action.

### Dev Answers

- Original Question: Will [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) create a dedicated notifications table with per-recipient read state, or derive notifications from activity_log plus user-specific state?

Answer: Create dedicated notification storage for recipient delivery and read-state. activity_log can feed events, but it should not be the only source because it does not model personal delivery, read/unread state, retention visibility, or per-recipient copies cleanly.

- Original Question: Which endpoint(s) will support list, mark-one-read, and mark-all-read?

Answer: Use GET /api/v1/workspaces/{id}/notifications, POST /api/v1/notifications/{id}/read, and POST /api/v1/workspaces/{id}/notifications/read-all. All must be RBAC/RLS-safe and non-disclosing.

- Original Question: What is the route map for deep links by entity type: run, bug, test?

Answer: Run: /projects/{projectSlug}/runs/{runId}. Test: /projects/{projectSlug}/tests/{testId}. Bug: route depends on the [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) Bugs & Defect Heatmap implementation; Dev must define the final bug route before this story reaches Ready For QA.

- Original Question: How will sibling event producers seed notification test data before they are fully implemented?

Answer: Provide a seed/factory path that creates notifications directly for QA and automated tests. [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) should not be blocked by sibling event producers being unfinished.

- Original Question: How will retention be implemented: scheduled purge, query filter, or both?

Answer: Both. API queries must filter out notifications older than 90 days, and an async purge can physically remove old rows later. Security and product correctness must not depend on the purge job running exactly on time.

### Design Answers

- Original Question: Does the bell belong in a top bar as written, or should the current sidebar/account-menu shell be updated?

Answer: Adapt to the current shell: place the notification entry point in the persistent sidebar near the account/user area or another global sidebar affordance. A top bar would be a broader shell change and should be estimated separately if desired.

- Original Question: What are the visual differences for read vs unread rows?

Answer: Unread rows should use a small unread dot, stronger text weight, and subtle surface emphasis. Read rows should remove the dot and use normal text weight/lower emphasis. Do not rely on color alone.

- Original Question: What are the approved empty-state illustration and copy?

Answer: Copy: "No notifications yet. Important workspace events will appear here." Illustration is optional for MVP and should match existing empty-state style if available.

- Original Question: How should a 400px anchored panel behave on narrow/mobile viewports?

Answer: Desktop uses the anchored panel. Narrow/mobile should use a full-screen sheet/drawer so content remains readable and touch-friendly.

- Original Question: Should the panel close after row click, mark-one-read, or mark-all-read?

Answer: Row click closes because it navigates. Mark-one-read does not close. Mark-all-read does not close; it should update the panel state in place.

---
_Synced from Jira by sync-jira-issues_
