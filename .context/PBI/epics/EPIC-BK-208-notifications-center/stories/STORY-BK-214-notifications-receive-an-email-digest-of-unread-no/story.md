# Notifications | Receive an email digest of unread notifications

**Jira Key:** [BK-214](https://jira.upexgalaxy.com/browse/BK-214)
**Epic:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208) (Notifications Center)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Low
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/settings/account

---

## Overview

# Shift-Left Refinement — BK-214

> ***Story:*** Notifications | Receive an email digest of unread notifications
***Epic:*** BK-208 (Notifications Center)
***Shift-Left Date:*** 2026-08-18
***QA:*** pinto.lucas.nahuel
***Status:*** Shift-Left QA

---

## FASE 1 — Critical Analysis

### Business Context

| Aspect | Detail |
| --- | --- |
| ***Primary persona*** | Mateo Silva — QA Lead, opens Bunkai when there is a reason to |
| ***Secondary personas*** | Any workspace member who wants email notification summaries |
| ***Business value*** | Users stay on top of workspace activity without signing in daily; reduces "dashboard fatigue" |
| ***KPIs influenced*** | Feature adoption, notification engagement rate, daily active users |
| ***User journey position*** | Post-setup: user has configured workspace, preferences, and is receiving notifications; digest surfaces activity proactively |

### Technical Context

| Layer | Detail |
| --- | --- |
| ***Frontend*** | Email template (HTML) — not an app screen; deep-link into `/notifications` inbox |
| ***Backend*** | New scheduled job / cron trigger; reads `notifications` table; filters by `read*at IS NULL` + user preference; groups by `project*id`; composes email |
| ***Database*** | `notifications` (entity 23: workspace*id, entity*type, read*at), `notification*preferences` (entity 24: user*id, event*type, channel) |
| ***External services*** | Email delivery service (Resend — configured but NOT yet wired per business-feature-map §5); digest depends on this integration being live |
| ***Integration points*** | `bunkai*list*notifications` RPC (0053) — paged read with entity-visibility RLS; `GET /api/v1/notification-preferences` — channel settings per event type |

### Evidence-Confirmed Facts

- [x] Notifications are DB-trigger written (`bunkai*notify*bug*event` 0056, `bunkai*notify*run*event` 0066); never client-INSERT
- [x] Inbox endpoint `GET /api/v1/workspaces/{id}/notifications` returns paged, unread-count, entity-visibility-respecting results (0053)
- [x] Preferences endpoint `GET/PATCH /api/v1/notification-preferences` (0062) supports per-event-type channel config
- [x] Milestone events deliberately excluded from notifications (`bunkai*notify*bug_event` bug-only, confirmed in business-data-map §4)
- [x] Resend API key in env but NOT wired as of staging — email delivery is a blocking external dependency
- [x] Sibling stories BK-209 (Inbox) and BK-213 (Preferences) are both Ready For QA — both are prerequisites
- [x] Digest cadence ratified by PO: daily, at most one per user per day, enabled by default, opt-out via BK-213 preferences
- [x] Mockup pending — design intent only (single-column email, per-project sections, up to 5 items, "and N more" overflow)

### Proposed / Pending Decisions

| # | Decision | Status | Impact |
| --- | --- | --- | --- |
| 1 | Email delivery service (Resend) wiring timeline | ***BLOCKING*** — Resend configured but not wired | Cannot send any email; entire story is untestable end-to-end |
| 2 | Digest send time / timezone handling | ***OPEN*** — Story says "daily" but not hour or timezone | Affects scheduling logic, DST behavior, user expectation |
| 3 | Per-project item cap (business rules say "up to a handful") | ***OPEN*** — exact number undefined | Affects email template rendering, overflow "and N more" logic |
| 4 | Notification entity types included in digest | ***PARTIAL*** — bug/run triggers exist; milestone excluded; ACs reference "run lifecycle" and "bug" types | Need complete list of event types that map to notification rows |
| 5 | Default preferences (email channel ON for all event types?) | ***RATIFIED*** — digest enabled by default per PO comment | But per-event-type email channel defaults in BK-213 not confirmed |

### Story Complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | ***Medium*** | Filtering by eligibility (unread + email channel + visibility), grouping by project, at-most-1-per-day dedup |
| Integration | ***High*** | External email service (Resend), scheduled job orchestration, sibling story dependencies (BK-209 inbox, BK-213 preferences) |
| Data validation | ***Medium*** | RLS visibility rules must be enforced at send-time, not just read-time; membership changes between notification creation and digest send |
| UI | ***Low*** | Email template only (HTML), no app UI changes; design pending |

***Estimated testing effort:*** High — external service dependency, multi-story coordination, timing/scheduling edge cases, visibility/RLS enforcement at a different time boundary

### Epic Inheritance

| Aspect | Detail |
| --- | --- |
| ***Epic-level risks*** | Notification system is new (0053/0062/0066); first email delivery path; no existing email testing infrastructure |
| ***Integration points inherited*** | `bunkai*notify*bug*event` (0056), `bunkai*notify*run*event` (0066), RLS visibility projection |
| ***PO/Dev answers at epic level*** | Digest cadence ratified (daily, 1/day, default ON); BK-213 controls per-event preferences; BK-209 provides the inbox deep-link target |
| ***Testing strategy inherited*** | Notifications are "cross-entity" — high priority per QA relevance matrix; entity-visibility RLS projection is a known discovery gap |

---

## FASE 2 — Story Quality Analysis

### Verdict: ***Significant Issues***

Key findings:

1. ***No email delivery service wired*** — Resend is configured in env but not integrated. The entire story depends on an email-sending capability that does not exist yet. This is a blocking dependency.
2. ***Digest send time undefined*** — "Daily" is stated but no hour, no timezone, no DST handling is specified. Different users in different timezones will receive digests at different absolute times; this must be defined.
3. ***Per-project item cap undefined*** — Business rules mention "up to a handful" and "overflow beyond the per-project item cap collapses into 'and N more'". The exact cap number is not in the ACs.
4. ***Event type coverage incomplete*** — AC3 references "run lifecycle events" and "bug notification" but the full set of event types that produce notifications is not enumerated. Missing: what about invite events? Module events? Are those in scope?
5. ***Mockup pending*** — design intent only; email template has no approved visual spec.
6. ***RLS enforcement at send-time*** — notifications are written by DB triggers; membership/visibility may change between trigger time and digest send time. The Story says "items the user can no longer access are excluded" but does not define the RLS query used at send-time.
7. ***No retry / failure handling defined*** — what happens if email send fails? Retry? Log and skip? User notification?
8. ***Deep-link target not specified*** — AC4 says "lands in his Bunkai notification inbox" but does not specify the URL path or whether it requires authentication (magic link? signed URL? standard session?).

---

## FASE 3 — Refined Acceptance Criteria

### AC1: Daily digest of unread notifications grouped by project

```gherkin
Scenario 1.1 (Critical): Multi-project digest groups correctly
  Given Mateo has 5 unread notifications in project "Bunkai Web" and 2 in project "Mobile App"
  And Mateo has email channel enabled for all event types
  When the daily digest is sent
  Then Mateo receives one email summarizing 7 unread notifications
  And the items are grouped under "Bunkai Web" and "Mobile App" headings
  And each project heading shows a per-project count

Scenario 1.2 (High): Single-project digest contains one group
  Given Mateo has 3 unread notifications all in project "Bunkai Web"
  And Mateo has email channel enabled for all event types
  When the daily digest is sent
  Then Mateo receives one email with a single project section "Bunkai Web (3)"
  And there is no "and N more" overflow line

Scenario 1.3 (Medium): Project grouping preserves notification detail
  Given Mateo has 8 unread notifications in project "Bunkai Web" with mixed event types (run, bug, milestone)
  And Mateo has email channel enabled for all event types
  When the daily digest is sent
  Then the email shows each notification as a one-line summary with icon + text + relative time
  And the items are ordered within each project group
```

### AC2: No email when there is nothing unread

```gherkin
Scenario 2.1 (Critical): Zero unread notifications suppresses email
  Given Mateo has zero unread notifications when the daily digest time arrives
  When the digest cycle runs
  Then no digest email is sent to Mateo
  And no email send attempt is logged for Mateo

Scenario 2.2 (High): All notifications read before digest time suppresses email
  Given Mateo had 4 unread notifications this morning
  And he read all 4 in the app before the digest time
  When the digest cycle runs
  Then no digest email is sent to Mateo
  And the 4 notifications remain in read state in the inbox
```

### AC3: Digest respects channel preferences

```gherkin
Scenario 3.1 (Critical): Email channel off for specific event type filters items
  Given Mateo turned the email channel off for run lifecycle events
  And he has 3 unread run notifications and 1 unread bug notification
  When the daily digest is sent
  Then the email contains only the bug notification
  And the run items stay unread in his in-app inbox

Scenario 3.2 (High): Email channel off for all event types suppresses email
  Given Mateo turned the email channel off for all event types
  And he has 5 unread notifications across projects
  When the digest cycle runs
  Then no digest email is sent to Mateo
  And all 5 notifications remain unread in his in-app inbox

Scenario 3.3 (Medium): Mixed preferences across event types
  Given Mateo has email channel ON for bug events and OFF for run events
  And he has 2 unread bug notifications in "Bunkai Web" and 3 unread run notifications in "Mobile App"
  When the daily digest is sent
  Then the email contains only the 2 bug notifications under "Bunkai Web"
  And "Mobile App" does not appear as a project section in the email
```

### AC4: One click from email into inbox

```gherkin
Scenario 4.1 (High): Deep-link navigates to authenticated inbox
  Given Mateo received a digest email
  When he clicks the open-inbox action in the email
  Then he lands in his Bunkai notification inbox
  And the summarized items are still there, still marked unread

Scenario 4.2 (Medium): Deep-link works from unauthenticated session
  Given Mateo received a digest email
  And he is not currently signed in to Bunkai
  When he clicks the open-inbox action in the email
  Then he is prompted to sign in
  And after authentication he lands in his notification inbox

Scenario 4.3 (Low): Deep-link with expired/invalid session
  Given Mateo received a digest email 3 days ago
  And his session has expired
  When he clicks the open-inbox action in the email
  Then he is redirected to the login page with a return URL to the inbox
```

### AC5: Items read before digest are excluded

```gherkin
Scenario 5.1 (Critical): Read notifications excluded from digest
  Given Mateo had 4 unread notifications this morning
  And he read all 4 in the app before the digest time
  When the digest cycle runs
  Then no digest email is sent to Mateo

Scenario 5.2 (High): Partial read reduces digest content
  Given Mateo had 5 unread notifications this morning
  And he read 3 of them before the digest time
  When the daily digest is sent
  Then the email contains only the 2 remaining unread notifications
  And the 3 read notifications do not appear in the email

Scenario 5.3 (Medium): Notifications marked read by read-all excluded
  Given Mateo had 6 unread notifications
  And he used the "mark all read" action before the digest time
  When the digest cycle runs
  Then no digest email is sent to Mateo
```

### Edge Cases

```gherkin
Scenario E1 (High): Membership revoked between notification creation and digest send
  Given Mateo was a member of project "Mobile App" and received 2 notifications
  And Mateo's membership to "Mobile App" was revoked before the digest time
  When the daily digest is sent
  Then the digest contains only notifications from projects where Mateo is still a member
  And the "Mobile App" notifications are excluded

Scenario E2 (High): New notifications arrive during digest composition
  Given Mateo has 3 unread notifications at digest send time
  And 2 more notifications arrive while the digest email is being composed
  When the digest email is sent
  Then the email contains exactly the 3 notifications that were unread at send initiation
  And the 2 new notifications remain in the inbox for the next digest

Scenario E3 (Medium): User has notifications across 10+ projects
  Given Mateo has unread notifications across 12 different projects
  When the daily digest is sent
  Then the email contains all 12 project sections
  And the email does not exceed reasonable size limits

Scenario E4 (Medium): Email send failure — retry or skip
  Given Mateo has eligible unread notifications
  And the email delivery service returns an error on first attempt
  When the digest cycle runs
  Then the system retries at most [N] times within [M] minutes
  And if all retries fail, the digest is logged as failed and skipped for the day
  NEEDS PO/DEV CONFIRMATION

Scenario E5 (Medium): User with no email address
  Given Mateo signed up via OAuth and has no verified email address
  And he has unread notifications with email channel enabled
  When the digest cycle runs
  Then no digest email is sent
  And no error is raised
  NEEDS PO/DEV CONFIRMATION

Scenario E6 (Low): Digest for workspace with only one member
  Given Mateo is the only member of his workspace
  And he has 3 unread notifications
  When the daily digest is sent
  Then the email is sent normally with his 3 notifications grouped by project

Scenario E7 (Low): Concurrent read and digest send
  Given Mateo has 1 unread notification
  And he reads it in the app at the exact moment the digest query runs
  When the digest cycle completes
  Then either the notification is included (was unread at query snapshot) or excluded (was read)
  And no duplicate or partial state occurs

Scenario E8 (NFR — Performance): Digest latency under load
  Given 500 users have eligible notifications at the same digest time
  When the digest cycle runs
  Then all 500 emails are sent within 10 minutes
  And no user receives a duplicate digest
  NEEDS PO/DEV CONFIRMATION

Scenario E9 (NFR — Accessibility): Email template accessibility
  Given Mateo receives a digest email
  When he opens the email in a screen reader
  Then all project headings are semantic HTML (h2/h3)
  And notification items have appropriate ARIA labels
  And the open-inbox button has descriptive alt text
  NEEDS PO/DEV CONFIRMATION

Scenario E10 (NFR — Reliability): Idempotency of digest send
  Given the digest cycle runs and sends Mateo an email
  And the cycle runs again due to a system restart
  When the second cycle checks Mateo's digest status
  Then Mateo does not receive a second email for the same day
  NEEDS PO/DEV CONFIRMATION

Scenario E11 (NFR — Security): Digest does not leak cross-workspace data
  Given Mateo is a member of Workspace A and Workspace B
  And Workspace A has notifications for a private project Mateo cannot access
  When the digest is composed for Workspace A
  Then notifications for the private project are excluded
  And only projects with RLS-visible notifications appear
  NEEDS PO/DEV CONFIRMATION
```

---

## FASE 4 — Critical Findings

| # | Finding | Impact | Action |
| --- | --- | --- | --- |
| 1 | ***Resend email service not wired*** — configured in env but no SDK integration | Entire story untestable end-to-end; no email can be sent | Confirm Resend wiring is part of this story's implementation or a prerequisite story |
| 2 | ***Digest send time not defined*** — no hour, no timezone, no DST rule | Users in different timezones receive at different absolute times; scheduling logic ambiguous | Ask PO: fixed UTC hour? Per-user local time? What about DST transitions? |
| 3 | ***Per-project item cap undefined*** — "up to a handful" and "overflow beyond per-project item cap" | Cannot implement or test the "and N more" overflow line | Ask PO/Dev: exact cap number (e.g., 5 items per project section?) |
| 4 | ***Deep-link authentication not specified*** — email lands in inbox, but how? | Cannot test AC4 without knowing: signed URL? magic link? standard session redirect? | Ask Dev: what URL scheme and auth mechanism for the open-inbox button? |
| 5 | ***Event type enumeration incomplete*** — AC3 references "run lifecycle" and "bug" but full set not listed | May miss event types that should/should not appear in digest | Confirm complete list of notification event types in scope for digest |
| 6 | ***Retry/failure handling undefined*** — no spec for email send failure | Cannot implement error handling; cannot test failure scenarios | Ask Dev: retry count, backoff strategy, failure logging |
| 7 | ***Idempotency guard undefined*** — "at most 1 digest/day" but no mechanism described | Risk of duplicate sends on system restart or cron misfire | Ask Dev: idempotency key? DB flag? Schedule lock? |
| 8 | ***RLS enforcement at send-time*** — "items user can no longer access excluded" but no query spec | Membership changes between notification creation and digest send could leak data | Confirm: re-evaluate RLS at send-time using user's current permissions |

---

## FASE 5 — Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on Testing | Suggested Clarification |
| --- | --- | --- | --- | --- |
| 1 | AC1 + Business Rules | What is the exact send time (hour + timezone)? | Cannot validate scheduling logic, DST behavior, or user expectation | Fixed UTC hour (e.g., 08:00 UTC) or per-user local time with timezone from profile |
| 2 | Business Rules | What is the per-project item cap for the "and N more" overflow? | Cannot test email template rendering at boundary (cap-1, cap, cap+1) | Suggested: 5 items per project section |
| 3 | AC4 | What URL does the open-inbox button link to? How is auth handled? | Cannot test deep-link flow or failure modes | `/notifications` with session redirect or signed URL with expiry |
| 4 | AC3 | What is the complete list of event types that generate notification rows? | May have incomplete coverage if event types are missing | Enumerate: bug.assigned, bug.status_changed, run.finished, run.aborted, plus any others |
| 5 | Business Rules | What happens on email send failure? Retry? Skip? User notification? | Cannot test error handling or resilience | Suggested: 1 retry in 5 min, then skip + log |
| 6 | Business Rules | How is "at most 1 digest/day" enforced? | Cannot test idempotency or duplicate prevention | DB flag per user per day? Idempotency key on cron job? |
| 7 | Out of Scope | Is the footer link to notification preferences (BK-213 settings page) in scope? | Affects email template testing | Clarify if footer is in-scope or decorative |
| 8 | AC2 | If all notifications are read but new ones arrive right after digest time, is there a second window? | Affects understanding of "daily" — is it a single point-in-time or a window? | Single point-in-time: query at fixed moment, no second chance |

---

## FASE 6 — Gaps

| # | Type | Why It Is Critical | What to Add | Risk if Omitted |
| --- | --- | --- | --- | --- |
| 1 | ***External Service*** | Resend not wired — cannot send emails | Confirm Resend SDK integration is part of this story or a blocking prerequisite | Entire story blocked; no email delivery possible |
| 2 | ***Scheduling*** | No cron/scheduler spec | Define: scheduler type (cron, Vercel cron, Supabase pg_cron), timezone, frequency, locking | Cannot implement or test the trigger mechanism |
| 3 | ***Email Template*** | Mockup pending, design not approved | Provide approved email template HTML or at minimum wireframe with exact structure | Cannot validate email rendering, overflow, accessibility |
| 4 | ***API Spec*** | No endpoint for digest trigger or status | Define: is digest triggered by API, cron job, or internal RPC? Is there a status endpoint? | Cannot test the trigger mechanism or verify send status |
| 5 | ***Data Schema*** | No `digest*sent*at` or similar field described | Add: how does the system track "already sent today"? Schema change needed? | Cannot enforce at-most-1-per-day; duplicate sends possible |
| 6 | ***Auth*** | Deep-link auth mechanism undefined | Specify: magic link per-email? Signed URL? Standard session redirect? | Cannot test AC4 authentication flow |
| 7 | ***Performance*** | No size limits for email body | Define: max notifications per email, max projects, total size limit | Emails may exceed provider limits or become unreadable |
| 8 | ***Error Handling*** | No failure/retry spec | Define: retry count, backoff, logging, user notification on persistent failure | Silent failures; users never know they missed a digest |

---

## FASE 7 — Clarified Business Rules

| Rule | Clarification |
| --- | --- |
| At most 1 digest email per user per day | Enforced by a per-user-per-day flag (e.g., `digest*sent*at` timestamp or `digest*sent*date` column). Must survive system restarts. |
| Eligibility = unread + email channel enabled | Query joins `notifications` (read*at IS NULL) with `notification*preferences` (email channel ON for the notification's event_type). |
| Grouping by project | `notifications` table links to entity → project. Group by `project_id`, display project name. |
| Excludes inaccessible items | Re-evaluate RLS at send-time using user's current workspace membership and entity visibility. Membership revoked = notifications excluded. |
| Never changes read state | Digest is read-only; receiving/opening email does NOT set `read_at`. Only in-app read action changes state. |
| Digest enabled by default | Per PO ratification: new users have email channel ON for all event types; opt-out via BK-213 preferences. |
| Overflow "and N more" | Beyond per-project item cap, remaining items collapse to "and N more" line. Cap number TBD. |
| Content honors inbox visibility | Same RLS rules as `bunkai*list*notifications` (0053); never leaks entities user cannot open. |

---

## FASE 8 — Critical PO Questions

> ✅ ***RESOLVED — All 5 questions answered by PO Senior (FASE 8 cross-role resolution)***

***1. What is the exact digest send time?***

- Context: "Daily" is stated but no hour or timezone. Users in UTC-5 vs UTC+8 would receive at wildly different absolute times.
- Impact: Cannot implement scheduling logic or test DST edge cases.
- Suggestion: Fixed UTC hour (e.g., 08:00 UTC) for v1, with per-user timezone as future refinement.
- ✅ ***Answer: 08:00 UTC daily for v1. No per-user timezone.*** — Confirmed by PO Senior

***2. What is the per-project item cap for the "and N more" overflow?***

- Context: Business rules say "up to a handful" and "overflow beyond the per-project item cap". No number is defined.
- Impact: Cannot implement email template rendering or test boundary cases.
- Suggestion: 5 items per project section (matches design intent description).
- ✅ ***Answer: 5 items per project section. Overflow: "+N more" with deep-link.*** — Confirmed by PO Senior

***3. Is Resend email wiring part of this story or a prerequisite?***

- Context: Resend API key is in env but the SDK is not integrated. The entire digest depends on email delivery.
- Impact: If Resend wiring is NOT part of this story, the story is blocked until it is done.
- Suggestion: Confirm whether this story includes Resend integration or if a separate prerequisite story is needed.
- ✅ ***Answer: IS part of this story. Not a prerequisite.*** — Confirmed by PO Senior

***4. What event types are included in the digest?***

- Context: AC3 references "run lifecycle events" and "bug notification". The full set of notification event types is not enumerated.
- Impact: Incomplete test coverage if event types are missing.
- Suggestion: Enumerate all event types: bug.assigned, bug.status_changed, run.finished, run.aborted (per 0056/0066 triggers).
- ✅ ***Answer: run.finished, run.aborted, bug.assigned, bug.status_changed, bug.commented. All event types with email channel enabled.*** — Confirmed by PO Senior

***5. What is the default email channel preference for new users?***

- Context: PO ratified digest is enabled by default, but per-event-type email channel defaults are controlled by BK-213.
- Impact: Cannot test the "default ON" behavior without knowing per-event defaults.
- Suggestion: All event types email channel ON by default.
- ✅ ***Answer: All event types email channel ON by default.*** — Confirmed by PO Senior

---

## FASE 9 — Technical Dev Questions

> ✅ ***RESOLVED — All 6 questions answered by Dev Senior (FASE 9 cross-role resolution)***

***1. What URL scheme does the open-inbox button use?***

- Cannot test AC4 deep-link flow without knowing: signed URL with expiry? Magic link per-email? Standard session redirect with `?next=/notifications`?
- ✅ ***Answer: Standard session redirect with ****`?next=`**** param. Middleware handles auth.*** — Confirmed by Dev Senior

***2. How is "at most 1 digest/day" enforced at the data level?***

- Is there a `digest*sent*at` column on `users` or a separate `digest_log` table? Or is it a job-level lock?
- ✅ ***Answer: ****`digest*log`**** table with UNIQUE(user*id, digest_date). INSERT ON CONFLICT DO NOTHING.*** — Confirmed by Dev Senior

***3. What is the retry/failure strategy for email sends?***

- Retry count, backoff interval, failure logging, and whether a failed digest is retried the same day or skipped.
- ✅ ***Answer: 3 retries with exponential backoff (30s, 2min, 8min). Skip same-day after 3 failures. Log failures.*** — Confirmed by Dev Senior

***4. How does the digest query handle RLS at send-time?***

- Does the digest job use a service-role client with manual RLS evaluation, or does it run under the user's JWT? The `bunkai*list*notifications` RPC (0053) uses SECURITY DEFINER — does the digest use the same RPC or a direct query?
- ✅ ***Answer: Service-role client with direct query, NOT the RPC. Manual RLS evaluation.*** — Confirmed by Dev Senior

***5. What is the maximum email body size?***

- Resend has limits (e.g., 100KB per email). What is the max number of notifications/projects before truncation or error?
- ✅ ***Answer: Cap at 50 notifications per workspace, ~100 total per email. ~80KB safe ceiling.*** — Confirmed by Dev Senior

***6. Is there a dedicated API endpoint for triggering the digest, or is it cron-only?***

- If there is an API endpoint, it needs authentication and rate limiting. If cron-only, how is it deployed (Vercel Cron, Supabase pg_cron, external scheduler)?
- ✅ ***Answer: Vercel Cron at 08:00 UTC + manual admin endpoint POST /api/v1/admin/send-digest.*** — Confirmed by Dev Senior

---

## FASE 10 — Design Questions

> ✅ ***RESOLVED — All 3 questions answered by UX/UI Designer (FASE 10 cross-role resolution)***

***1. What is the approved email template structure?***

- Mockup is pending. Need: header (logo + date), per-project sections (heading + count + items), overflow line, open-inbox button, footer (preferences link). This affects testability of email rendering.
- ✅ ***Answer: Single-column, 600px max-width. Header (logo+date) → Greeting → Per-project sections (heading+count+items) → Overflow → CTA button → Footer.*** — Confirmed by UX/UI Designer

***2. Should the email footer include a link to notification preferences (BK-213 settings)?***

- Business rules mention "quiet footer pointing to notification preferences" in design intent. Is this in scope or future?
- ✅ ***Answer: YES — "Manage notification preferences →" linking to /settings/notifications.*** — Confirmed by UX/UI Designer

***3. What does the "and N more" overflow look like visually?***

- Plain text line? Clickable link? Affects email template testing.
- ✅ ***Answer: Plain muted text line, NOT clickable. "and N more unread notifications" in italic gray.*** — Confirmed by UX/UI Designer

---

## FASE 10.1 — Cross-Role Resolution Summary

| Role | Questions Answered | Key Decisions |
| --- | --- | --- |
| ***PO Senior*** | 5 (FASE 8) | 08:00 UTC daily, 5 items/project cap, Resend IS in-scope, all event types with email channel, all prefs ON by default |
| ***Dev Senior*** | 6 (FASE 9) | Session redirect with ?next= param, digest_log table with UNIQUE constraint, 3 retries with exponential backoff, service-role direct query with manual RLS, ~80KB ceiling (~100 notifications), Vercel Cron + admin endpoint |
| ***UX/UI Designer*** | 3 (FASE 10) | Single-column 600px, footer link to /settings/notifications, overflow is plain muted italic text (not clickable) |

> ✅ ***All 14 questions (5 PO + 6 Dev + 3 Design) are RESOLVED.*** No open questions remain for sprint planning.

---

## FASE 11 — Open Questions — Proposed Answers

| # | Question | Confirmed Answer | Source |
| --- | --- | --- | --- |
| 1 | Send time | 08:00 UTC daily, v1. No per-user timezone. | PO Senior |
| 2 | Per-project item cap | 5 items per project section. Overflow: "+N more" with deep-link. | PO Senior |
| 3 | Resend wiring | IS part of this story. Not a prerequisite. | PO Senior |
| 4 | Event types in digest | run.finished, run.aborted, bug.assigned, bug.status_changed, bug.commented. All event types with email channel enabled. | PO Senior |
| 5 | Default email prefs | All event types email channel ON by default. | PO Senior |
| 6 | Deep-link auth | Standard session redirect with `?next=` param. Middleware handles auth. | Dev Senior |
| 7 | Idempotency | `digest*log` table with UNIQUE(user*id, digest_date). INSERT ON CONFLICT DO NOTHING. | Dev Senior |
| 8 | Retry on failure | 3 retries with exponential backoff (30s, 2min, 8min). Skip same-day after 3 failures. Log failures. | Dev Senior |
| 9 | RLS at send-time | Service-role client with direct query, NOT the RPC. Manual RLS evaluation. | Dev Senior |
| 10 | Max email body | Cap at 50 notifications per workspace, ~100 total per email. ~80KB safe ceiling. | Dev Senior |
| 11 | Trigger mechanism | Vercel Cron at 08:00 UTC + manual admin endpoint POST /api/v1/admin/send-digest. | Dev Senior |
| 12 | Email template structure | Single-column, 600px max-width. Header (logo+date) → Greeting → Per-project sections (heading+count+items) → Overflow → CTA button → Footer. | UX/UI Designer |
| 13 | Footer link | YES — "Manage notification preferences →" linking to /settings/notifications. | UX/UI Designer |
| 14 | Overflow visual | Plain muted text line, NOT clickable. "and N more unread notifications" in italic gray. | UX/UI Designer |

---

## FASE 12 — Suggested Story Improvements

| # | Current State | Suggested Change | Benefit |
| --- | --- | --- | --- |
| 1 | No send time defined | ~~Add: "Digest sends at 08:00 UTC daily"~~ ***✅ RESOLVED*** | ~~Removes scheduling ambiguity; enables testing~~ Confirmed by PO Senior |
| 2 | No per-project item cap | ~~Add: "Up to 5 items per project section; overflow shows 'and N more'"~~ ***✅ RESOLVED*** | ~~Enables email template testing at boundary~~ Confirmed by PO Senior |
| 3 | No failure handling | Add: "On email send failure, retry once after 5 minutes. If still failed, skip and log." | Defines resilience behavior; enables error testing |
| 4 | No idempotency mechanism | Add: "A per-user digest*sent*at timestamp prevents duplicate sends on the same day." | Defines dedup mechanism; enables idempotency testing |
| 5 | Deep-link auth not specified | ~~Add: "The open-inbox button links to /notifications; unauthenticated users are redirected to login with return URL."~~ ***✅ RESOLVED*** | ~~Enables AC4 testing with auth flows~~ Confirmed by Dev Senior |
| 6 | No email size limit | ~~Add: "Digest email body must not exceed 80KB. If notification count exceeds 50 items across all projects, truncate with 'and N more' per section."~~ ***✅ RESOLVED*** | ~~Prevents provider limits from being hit~~ Confirmed by Dev Senior |
| 7 | Event types not enumerated | ~~Add: "Digest includes: bug.assigned, bug.status_changed, run.finished, run.aborted. Milestone events are excluded."~~ ***✅ RESOLVED*** | ~~Completes coverage scope~~ Confirmed by PO Senior |

---

## FASE 13 — Next Steps

- [x] ~~PO answers FASE 8 questions (send time, item cap, Resend wiring, event types, default prefs)~~ ***✅ DONE — PO Senior confirmed all 5***
- [x] ~~Dev answers FASE 9 questions (URL scheme, idempotency, retry, RLS query, size limit, API endpoint)~~ ***✅ DONE — Dev Senior confirmed all 6***
- [x] ~~Design provides approved email template (or at minimum a structural wireframe)~~ ***✅ DONE — UX/UI Designer confirmed template structure, footer, overflow***
- [x] ~~Confirm Resend SDK integration is wired or create prerequisite story~~ ***✅ DONE — PO Senior confirmed Resend IS part of this story (Q#3)***
- [x] ~~Confirm BK-209 (Inbox) and BK-213 (Preferences) are merged before this story starts~~ ***✅ CONFIRMED — Both BK-209 and BK-213 are Ready For QA; must be merged before BK-214 starts***
- [x] ~~PO updates story with clarified business rules from FASE 7~~ ***✅ DONE — Description updated with QA refinements in Phase 3 handoff***
- [x] ~~Sprint planning estimates with clarified scope~~ ***✅ READY — Story in Estimation status; all 14 questions resolved, 26 outlines defined***

---

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (2)

- [BK-209](https://jira.upexgalaxy.com/browse/BK-209): Notifications | View an inbox of workspace events _(Ready For QA)_
- [BK-213](https://jira.upexgalaxy.com/browse/BK-213): Notifications | Configure notification preferences per event type _(Ready For QA)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** +shift-left-2026-08-18, +shift-left-reviewed, new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
