# BK-212 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-212)

# Implementation Plan: STORY-BK-212 - Notifications | Get notified on bug assignment and status changes

## Overview

Sara needs an inbox notification when a bug is assigned to her, and when status changes on a bug she reported or is assigned to. BK-212 is the event-producer half of the Notifications Center (BK-208): it turns two bug-lifecycle moments owned by epic BK-31 (`bug.assigned`, `bug.status_changed`) into rows in the inbox BK-209 builds. BK-212 owns recipient logic, self-suppression, dedupe, visibility, and a thin rendering-vocabulary addition to BK-209's row component. It does not build the inbox, the bug lifecycle, preferences, or the digest.

> ***NOTE:*** Authored while both real dependencies are unbuilt: BK-209 (inbox + `notifications` table) and BK-31's bug-assignment/status-change surface. See Dependencies for a gap in the current codebase beyond what the story text assumes.

***Acceptance Criteria to satisfy******:***

- AC1 assignment (1.1 new assignee, 1.2 reassignment - only new assignee notified)
- AC2 reporter notified on status change by another
- AC3 assignee notified on status change by another
- AC4 no self-notification (4.1 actor=assignee, 4.2 actor=reporter)
- AC5 uninvolved teammates not notified
- E1 reporter=assignee dedupes to one notification
- E2 access-loss hides the notification
- E3 duplicate event delivery yields one notification per source event+recipient

---

## Technical Approach

***Chosen******:*** consume BK-31's bug-lifecycle events off the existing `activity*log` audit table (the codebase's established domain-event bus), via a new `AFTER INSERT` trigger scoped to `entity*type = 'bug' AND action IN ('bug.assigned','bug.status*changed')`. The trigger is `SECURITY DEFINER`, takes zero caller-supplied parameters, resolves the recipient set from the already-committed `bugs` row, membership-checks each candidate against the event's `workspace*id`, and inserts into `notifications` with `(source*event*id, recipient*user*id)` as the unique dedupe key (`source*event*id` = the triggering `activity_log.id`).

Every domain event in this codebase (`bug.filed`, `module.renamed`, `run.aborted`, `run.finished`, ...) is an explicit `insert into activity*log(...)` inside the same `SECURITY DEFINER` mutation function (verified across migrations `0021`, `0023`, `0024`, `0028`, `0030`, `0031`, `0035`-`0037`, `0040`, `0042`, `0046`). `activity*log` already carries `workspace*id`, `actor*user*id`, `entity*type`, `entity_id`, `action`, `payload`. BK-31's future assign/status RPCs will, by the same convention, write these two actions without any coordination with BK-212.

***Alternatives considered******:***

- `AFTER UPDATE` trigger directly on `bugs`, diffing OLD/NEW - rejected: a single UPDATE can change assignee and status together, forcing the trigger to reinvent the intent distinction BK-31's RPC already names; would also fire on severity/description/Jira-sync edits BK-212 must ignore.
- BK-31's RPCs call a BK-212-owned helper inline - rejected: couples BK-31's RPC bodies to BK-212's schema, against the story's own Out-of-Scope boundary ("epic BK-31 owns the bug lifecycle itself").
- Realtime-only push, no persisted row - rejected: BK-209's unread list must survive reload/offline; Realtime (ADR-0010) layers on top of a persisted row, it does not replace it.

---

## RPC Authorization - six-question exercise (ADR-0012 gate)

This story crosses a user boundary by design (the recipient is never the actor).

| # | Question | Answer |
| --- | --- | --- |
| 1 | DEFINER or INVOKER? | DEFINER required: the inserted row has `recipient*user*id <> auth.uid()` by construction. INVOKER would need a standing cross-user INSERT policy on `notifications`, strictly worse than one audited function. |
| 2 | Remove the identity parameter? | Yes - removed entirely. The function is a trigger with zero parameters; identity comes only from already-committed row state, never a client argument. |
| 3 | Actor bind at step 0? | N/A - no parameter exists. The actor identity it reads (`NEW.actor*user*id`) was bound at step 0 of the upstream BK-31 mutation RPC (same pattern `bunkai*create*bug` follows) - a cross-epic contract, flagged under Risks. |
| 4 | Result scoping - what constrains each row? | Nothing is returned to a client (`returns trigger`). Written rows: recipient candidates come only from `bugs.created*by`/`assignee*id` for the one bug in `NEW.entity*id`, actor excluded first, each candidate membership-checked against `NEW.workspace*id` before insert. |
| 5 | Same error as not-found / no disclosure? | N/A - no external caller. A failed-membership candidate is silently skipped, no exception, no signal returned anywhere. |
| 6 | Test proving both properties on the real DB? | DB-integration test: Elena assigns a bug to Sara -> one row for Sara, none for Elena; uninvolved Mateo gets nothing; Sara's membership is revoked before a later status change -> no row for her; the same `activity_log` event replayed twice -> one row via the unique constraint. Real sessions, not mocked RPC calls. |

***Conclusion******:*** `SECURITY DEFINER`, no identity parameter, `crosses*user*boundary = true`, all six answered.

---

## Data model

***Assumed BK-209 ****`notifications`**** baseline*** (reconciliation point - BK-209 planned in parallel): `id`, `workspace*id`, `recipient*user*id`, `event*type` (discriminator, e.g. `bug.assigned`/`bug.status*changed`/`run.finished`), `entity*type` (`bug`/`run`/...), `entity*id`, `payload jsonb`, `read*at` (null=unread), `created_at`.

***BK-212's addition on top******:*** a `source*event*id uuid` column (points at the originating `activity*log.id`) + `unique (source*event*id, recipient*user*id)`. If BK-209 doesn't ship this, BK-212's migration adds it via `ALTER TABLE`. Payload for `bug.assigned`: `{bug*id, bug*title, project*id, severity}` (no old/new assignee - the previous assignee is never notified). Payload for `bug.status*changed`: same plus `old*status`, `new*status` - `old*status` must arrive on `activity_log.payload`; it cannot be recovered from the current `bugs` row. Payload is denormalized at write time (matches the Runs precedent of snapshotting content so later edits never corrupt history).

***Recipient decision table******:***

| Event | Actor | Reporter | Assignee | Recipients (post actor-exclusion) |
| --- | --- | --- | --- | --- |
| bug.assigned | anyone | - | new assignee Z | `{Z}` minus actor |
| bug.status_changed | anyone | X | Y | `DISTINCT({X,Y})` minus actor |
| bug.status_changed | anyone | X | X (same person) | `{X}` minus actor - dedupes to one row (E1), no special-case code |
| bug.status_changed | X (reporter) | X | Y | `{Y}` (X excluded, AC4.2) |
| bug.status_changed | Y (assignee) | X | Y | `{X}` (Y excluded, AC4.1) |
| bug.assigned (reassignment) | anyone | - | was Y, now Z | `{Z}` only - Y gets nothing (AC1.2, ratified) |

---

## UI/UX delta

No new screen (master-design-plan §8: BK-212 renders into BK-209's inbox). Add a bug-event branch to BK-209's row component per §4.13: bug icon, `BUG-xxx`-style mono chip, primary text = `payload.bug*title`, secondary = `Assigned to you` or `Status changed: <old> -> <new>` (fallback `Status changed to <new>` if `old*status` absent), severity chip reusing `components/bugs/BugsListView` styling.

***Deep link gap found******:*** no `bugs/[id]` detail route exists yet (`app/(app)/projects/[projectSlug]/bugs/page.tsx` is list-only; `bug-detail` exists only as a mockup). Until BK-31 ships it, the deep link resolves to the project's bug list with a `?bugId=<id>` query param the future detail route can also honor. A lost-access recipient must resolve to the app's existing permission-safe not-found state, never a distinguishing 404.

## Types & Content

`Notification` type gets a discriminated union on `event_type` narrowing `payload` (`BugAssignedPayload`/`BugStatusChangedPayload`); `lib/database.types.ts` regeneration is generated code, excluded from the workload forecast. New pure helpers in `lib/notifications/bug-events.ts`, unit-testable with plain objects (mirrors `locateRunStepBugContext`'s extraction style in `app/api/v1/bugs/route.ts`). Copy is fixed by the ratified Design decisions - no new copy invented; status vocabulary is always BK-31's, never BK-212's own.

---

## Implementation steps

***Step 1 - Schema******:****** fan-out trigger + idempotency column*** (no static SQL, described only). New migration once BK-31's `assignee*id` and BK-209's `notifications` both exist on staging: add `source*event*id` + unique constraint if missing; new function `bunkai*notify*bug*event()` (`returns trigger`, `security definer`, `set search*path = ''`, zero parameters) - guards on entity*type/action, joins `bugs` on `NEW.entity*id`, builds the recipient set per the table above, membership-checks each candidate against `NEW.workspace*id`, inserts with `on conflict (source*event*id, recipient*user*id) do nothing`; new trigger `bugs*activity*notify after insert on activity_log`. No `authenticated` grant needed - never called directly by a client. Est: 4h.

***Step 2 - Recipient/formatting pure helpers.*** `lib/notifications/bug-events.ts` (new): `resolveBugEventRecipients`, `formatBugEventText`, `buildBugDeepLink` - pure, mirror the SQL decision table for unit coverage. Handles reporter=assignee dedupe, actor exclusion, missing-`old_status` fallback. Est: 3h.

***Step 3 - Inbox row rendering vocabulary.*** Add the bug-event branch to BK-209's row component (exact path TBD by BK-209's plan - coordinate at Stage 2 kickoff). Bug icon + mono chip + severity chip reuse; click -> `buildBugDeepLink`. Est: 2h.

***Step 4 - Read-time visibility (coordination note, no BK-212 code).*** BK-209's inbox read/list query must re-check current membership at read time, not only trust the row exists - Step 1's write-time check alone cannot retroactively hide a row for someone who leaves after it was written. Recorded so it isn't dropped between the two stories' plans. Est: 0h.

***Step 5 - DB-integration tests (ADR-0012 requirement).*** `lib/notifications/bug-events-isolation.test.ts` (new): assignment/reassignment (1.1/1.2), reporter/assignee status-change notify (2.1/3.1), self-suppression both directions (4.1/4.2), uninvolved gets nothing (5.1), reporter=assignee dedupe (E1), access-loss before a later event (E2 write-time half), replayed event yields one row (E3). Real DB, real sessions, per `rpc-authorization.md` §5. Est: 4h.

***Step 6 - Integration.*** Elena assigns a bug to Sara via BK-31's future endpoint -> `activity_log` row -> trigger fires -> `notifications` row -> Sara's inbox shows it -> click lands on the bug (list+`?bugId=` today, detail route once BK-31 ships one). E2E smoke on staging once both dependencies are merged. Est: 2h.

---

## Scenario -> step traceability (every ATP scenario mapped)

| Scenario | Type | Step(s) |
| --- | --- | --- |
| 1.1 New assignee notified | Positive | 1, 5 |
| 1.2 Reassignment - only new assignee | Positive | 1, 5 |
| 2.1 Reporter notified, actor=other | Positive | 1, 5 |
| 3.1 Assignee notified, actor=other | Positive | 1, 5 |
| 4.1 Suppress, actor=assignee | Negative | 1, 2, 5 |
| 4.2 Suppress, actor=reporter | Negative | 1, 2, 5 |
| 5.1 Uninvolved teammate excluded | Negative | 1, 5 |
| E1 Reporter=assignee dedupe | Boundary | 1, 2, 5 |
| E2 Access-loss hides notification | Critical | 1 (write), 4 (read contract), 5 |
| E3 Retry -> one notification | Integration | 1 (unique constraint), 5 |
| Consume bug.assigned payload | Integration | 1 |
| Consume bug.status_changed old/new | Integration | 1, 2 |
| Render in BK-209 inbox | Integration | 3 |
| Deep-link with run/test context | Integration | 2, 3, 6 |

---

## Technical Decisions

> Promotion rule: none of these cross the ADR bar independently - RPC shape is already governed by ADR-0012 (cited, not re-decided); the `activity_log`-as-event-bus choice applies an existing convention, it does not establish a new one.

***D1 - Fan-out trigger on ****`activity*log`****, not on ****`bugs`****.*** Matches every existing domain-event emission pattern and the ATP's own language. Trade-off: depends on BK-31's future RPC writing exactly those two action names with `old*status` in payload - a cross-epic contract, not type-enforced today.

***D2 - No identity parameter on the writer.*** Satisfies the RPC-authorization gate's preferred outcome directly. Trade-off: cannot be dry-run/backfilled without a synthetic `activity_log` row - acceptable since it's never meant to be called directly.

***D3 - Denormalized payload, not a live join at read time.*** Matches the Runs precedent (`run*atcs`/`run*steps` snapshot). Trade-off: a later bug-title edit will not retroactively update a past notification's text - accepted, matches an email subject not updating after the fact.

---

## Dependencies

> ***WARNING:*** Two independent hard blockers. Neither is a formality.

***Blocker 1 - BK-209.*** Blocked on BK-209 landing its `notifications` table + insert contract on staging before Stage 2 begins. Assumed shape above; BK-212 additionally needs `source*event*id` + its unique constraint, added by BK-212's own migration if BK-209 doesn't ship it.

***Blocker 2 - BK-31 (deeper than the story text states).*** Verified against the codebase (2026-08-03): epic BK-31 as currently ticketed (BK-40 file, BK-41 list/filter, BK-42 heatmap, BK-43 Jira sync) contains no story that adds bug assignment or status transitions at all.

- `supabase/migrations/0046*bugs.sql` - the only bug-schema migration - has no `assignee*id` column; `status` is written exactly once at creation (the migration's own comment: "BK-40 never writes any other status").
- No mutation endpoint exists under `app/api/v1/bugs/**` beyond `POST /bugs` (create) and `GET /projects/{id}/bugs` (list) - no PATCH/assign/status route.
- No bug-detail page exists (`bugs/page.tsx` is list-only); `bug-detail` is a mockup only.

Pre-work required before BK-212's Stage 2:

- [ ] A story (new, or an expansion of BK-40/BK-41) adding `bugs.assignee*id` + assign/status-transition RPCs, each writing `activity*log` as `bug.assigned`/`bug.status*changed` with `old*status` in payload.
- [ ] Each such RPC binds its own actor to `auth.uid()` at step 0 before writing `activity*log` (ADR-0012) - BK-212's trigger trusts `activity*log.actor*user*id` as already-authorized; if BK-31 ships it unguarded (a known live pattern elsewhere per ADR-0012's own audit, 16/18 functions), BK-212's actor-exclusion inherits that gap. BK-31's remediation surface, not BK-212's - Stage 2 re-verifies at implementation time.
- [ ] A bug-detail route (or the query-param fallback stays in place).

***Pre-requisitos técnicos******:***

- [ ] BK-209 `notifications` table + insert path merged to staging - BLOCKER.
- [ ] BK-31 `assignee_id` + assign/status RPCs + events with the payload contract above - BLOCKER, currently not even scoped as a Jira story.
- [ ] Mockup: none needed - renders into BK-209's existing screen.

---

## Risks & Mitigations

***R1 - BK-31's actor-bind is out of BK-212's control.*** Impact Medium (identity-integrity only, no tenant-boundary cross per `rpc-authorization.md` §6). Mitigation: Stage 2 re-reads the merged BK-31 migration before writing the trigger; escalate if the bind is missing rather than building on it silently.

***R2 - Payload contract drift (****`old_status`**** in particular).*** Impact Medium (degrades to "Status changed to `<new>`", a safe fallback, not a crash). Mitigation: formatter absorbs it; flag the exact shape to BK-31's Stage 1 plan for reconciliation.

***R3 - Deep-link target doesn't exist yet.*** Impact Low (UX only). Mitigation: query-param fallback documented; revisit once BK-31 ships the detail route.

---

## Estimated Effort

| Step | Time |
| --- | --- |
| 1. Schema - trigger + idempotency column | 4h |
| 2. Recipient/formatting helpers | 3h |
| 3. Inbox row vocabulary | 2h |
| 4. Read-time visibility coordination | 0h |
| 5. DB-integration tests | 4h |
| 6. Integration / E2E smoke | 2h |
| ***Total**** | ****15h*** |

***Story points******:*** 8 (matches `story.md`; re-estimation trigger already ratified - 13 SP or split if BK-31/BK-209 aren't ready at implementation time. Given Blocker 2, that trigger is presently ACTIVE - flagged, not resolved, here).

---

## Definition of Done Checklist

- [ ] Code implemented per this plan (blocked until Dependencies clear)
- [ ] AC1-AC5 + E1-E3 passing
- [ ] Six-question exercise re-verified against the real BK-31 schema at Stage 2
- [ ] `Notification` payload types added, zero `any`
- [ ] Ratified copy used, no placeholder text
- [ ] Unit tests: recipient-set builder, formatter, deep-link builder
- [ ] DB-integration tests against a real database (ADR-0012)
- [ ] Component test: inbox row bug-event branch
- [ ] E2E smoke on staging
- [ ] Review sign-off on the trigger's authorization shape (Stage 3 requirement)
- [ ] Lint/TypeScript clean; deployed to staging, smoke-tested

---

## Review Workload Forecast

Estimated: 480 additions + 105 deletions = 585 total lines
400-line budget risk: High
Chain strategy: pending
Decision trace: n/a (risk High, decision deferred to /git-flow-master at the Stage 2 boundary - not resolved at planning time)
Decided by: n/a
Decision needed before apply: Yes

Notes: new migration (~100 lines) x1.5=150; new `lib/notifications/bug-events.ts` (~50) x1.5=75; new unit test file (~80) x1.5=120; new DB-integration test file (~110) x1.5=165; modified inbox row component (~35) x1.0=35; modified notification types/facade (~15) x1.0=15. Sum=560 x1.2=672, shown conservatively as 585 pending BK-209's actual file layout. Risk stays High either way, consistent with the ATP's own "Estimated test effort: High."

---
_Synced from Jira by sync-jira-issues_
