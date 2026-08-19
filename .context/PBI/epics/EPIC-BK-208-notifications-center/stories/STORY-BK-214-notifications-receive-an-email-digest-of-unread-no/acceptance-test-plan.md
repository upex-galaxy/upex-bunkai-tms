# BK-214 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-214)

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

> Generated on 2026-08-18 by pinto.lucas.nahuel (QA)
Story: BK-214 — Notifications | Receive an email digest of unread notifications

## FASE 14 — ATP DRAFT (Acceptance Test Plan)

### Coverage Estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 6 | Happy-path digest scenarios across ACs 1-5 |
| Negative | 3 | Suppression scenarios (no unread, all read, all prefs off) |
| Boundary | 5 | Item cap overflow, single project, 10+ projects, partial read, read-all |
| Integration | 4 | Deep-link auth (session, unauthenticated, expired), Resend delivery |
| Security-RBAC | 2 | Membership revoked, cross-workspace visibility |
| State-Transition | 2 | Read state invariant, concurrent read+send |
| Non-Functional | 4 | Performance (500 users), accessibility (email template), idempotency, retry/failure |
| ***Total**** | ****26**** | ****Positive + Negative + Boundary + Integration + Security-RBAC + State-Transition + Non-Functional*** |

### Test Outlines

#### Positive

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| P1 | Multi-project digest groups correctly | Mateo has 5 unread in "Bunkai Web" + 2 in "Mobile App", all email prefs ON | One email with 7 items, grouped under two project headings with per-project counts | PO Senior |
| P2 | Single-project digest | Mateo has 3 unread in one project, email prefs ON | One email with single project section, no overflow | PO Senior |
| P3 | Digest respects channel preferences | Email off for run events; 3 run + 1 bug unread | Email contains only bug notification; run items stay unread | PO Senior |
| P4 | One-click deep-link to inbox | Mateo received digest email, has active session | Click lands in notification inbox; items still unread | PO Senior |
| P5 | Partial read reduces digest | 5 unread, read 3 before digest | Email contains only 2 remaining unread | PO Senior |
| P6 | Read-all suppresses email | 6 unread, mark all read before digest | No email sent | PO Senior |

#### Negative

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| N1 | Zero unread suppresses email | 0 unread at digest time | No email sent, no send attempt logged | PO Senior |
| N2 | All prefs OFF suppresses email | All email channels OFF, 5 unread | No email sent, notifications stay unread | PO Senior |
| N3 | All notifications read before digest | 4 unread, all read before send time | No email sent | PO Senior |

#### Boundary

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| B1 | Per-project item cap overflow | 8 unread in one project (cap = 5) | Email shows 5 items + "and 3 more" line | PO Senior |
| B2 | Exactly at item cap | 5 unread in one project (cap = 5) | Email shows 5 items, no overflow line | PO Senior |
| B3 | One below item cap | 4 unread in one project (cap = 5) | Email shows 4 items, no overflow line | PO Senior |
| B4 | 10+ projects with notifications | Unread across 12 projects | All 12 project sections present; email within size limit | Dev Senior |
| B5 | Mixed event types across projects | Bug + run + other types across 3 projects | Correct grouping; event type filtering applied per-project | Dev Senior |

#### Integration

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| I1 | Deep-link with active session | Mateo has valid session, clicks open-inbox | Lands in /notifications, items visible | Dev Senior |
| I2 | Deep-link without session | Mateo not signed in, clicks open-inbox | Redirected to login with return URL to /notifications | Dev Senior |
| I3 | Deep-link with expired session | Session expired 3 days ago | Redirected to login; after auth, lands in inbox | Dev Senior |
| I4 | Email delivery via Resend | All conditions met, Resend API available | Email received in Mateo's mailbox within 1 minute | Dev Senior |

#### Security-RBAC

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| S1 | Membership revoked excludes notifications | Mateo removed from "Mobile App" project before digest | "Mobile App" notifications excluded from digest | Dev Senior |
| S2 | Cross-workspace visibility enforced | Mateo member of 2 workspaces; private project notifications in workspace A | Digest for workspace A excludes private project notifications | Dev Senior |

#### State-Transition

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| ST1 | Read state never changes by digest | Mateo has 3 unread; digest sent + opened | All 3 remain unread in app; read_at is NULL | Dev Senior |
| ST2 | Concurrent read and digest send | 1 unread notification; read at exact send moment | Either included or excluded; no partial state or duplicate | Dev Senior |

#### Non-Functional

| # | Outline | Preconditions | Expected Result | Confirmed By |
| --- | --- | --- | --- | --- |
| NFR1 | Performance: 500 concurrent users | 500 users with eligible notifications at same time | All 500 emails sent within 10 minutes; no duplicates | Dev Senior |
| NFR2 | Accessibility: email template screen reader | Digest email opened in screen reader | Semantic headings, ARIA labels, descriptive button text | Dev Senior |
| NFR3 | Idempotency: no duplicate digest | Digest sent; cron runs again same day | No second email for same user same day | Dev Senior |
| NFR4 | Retry on email failure | Resend returns error on first attempt | 3 retries with exponential backoff (30s, 2min, 8min); skip same-day after 3 failures; log failures | Dev Senior |

### Traceability Map

| AC Original | Refined Scenarios | Outlines |
| --- | --- | --- |
| AC1: Daily digest grouped by project | 1.1, 1.2, 1.3 | P1, P2, B1, B2, B3, B4, B5 |
| AC2: No email when nothing unread | 2.1, 2.2 | N1, N3 |
| AC3: Respects channel preferences | 3.1, 3.2, 3.3 | P3, N2 |
| AC4: One-click into inbox | 4.1, 4.2, 4.3 | P4, I1, I2, I3 |
| AC5: Items read before digest excluded | 5.1, 5.2, 5.3 | P5, P6, N3 |
| Edge: Membership revoked | E1 | S1 |
| Edge: Notifications during composition | E2 | ST2 |
| Edge: 10+ projects | E3 | B4 |
| Edge: Email failure | E4 | NFR4 |
| Edge: No email address | E5 | (covered by N2 scope) |
| Edge: Single-member workspace | E6 | P2 (equivalent) |
| Edge: Concurrent read | E7 | ST2 |
| NFR: Performance | E8 | NFR1 |
| NFR: Accessibility | E9 | NFR2 |
| NFR: Idempotency | E10 | NFR3 |
| NFR: Cross-workspace security | E11 | S2 |

### Test Impact Summary

| Decision | Impact on Testing |
| --- | --- |
| Resend not wired | Cannot test email delivery end-to-end; mock or stub required for all email tests |
| Send time undefined | Cannot test scheduling; assumed 08:00 UTC for test planning |
| Per-project cap undefined | Cannot test overflow; assumed 5 for test planning |
| Deep-link auth undefined | Cannot test AC4; assumed standard session redirect |
| Mockup pending | Cannot validate email rendering; structural test only |

### Test Data Requirements

- 1 auth user (Mateo) with email address
- 2+ projects with modules
- 10+ notifications across projects (mix of bug.assigned, bug.status_changed, run.finished, run.aborted)
- Notification preferences with email channel ON and OFF for different event types
- Membership in 2+ workspaces (for cross-workspace test)
- Resend API key configured and wired (prerequisite)

### Test Environment Requirements

- Staging environment with Resend integration live
- Access to notification_preferences table to toggle email channels
- Ability to trigger digest manually (API endpoint or cron trigger)
- Email inbox access to verify delivery (or Resend dashboard/logs)

### Entry Criteria

- [ ] BK-209 (Inbox) merged and deployed to staging
- [ ] BK-213 (Preferences) merged and deployed to staging
- [ ] Resend SDK wired and functional (or email delivery mocked)
- [ ] Digest scheduling mechanism implemented
- [ ] Email template approved (or at minimum structural wireframe)

### Exit Criteria

- [ ] All 26 outlines executed
- [ ] P1-P6 pass (positive scenarios)
- [ ] N1-N3 pass (negative suppression)
- [ ] B1-B5 pass (boundary cases)
- [ ] I1-I4 pass (integration — deep-link + email delivery)
- [ ] S1-S2 pass (security — RLS + cross-workspace)
- [ ] ST1-ST2 pass (state transitions)
- [ ] NFR1-NFR4 pass (performance, accessibility, idempotency, retry)
- [ ] No P0/P1 bugs open
- [ ] Email rendering validated across top 3 email clients (Gmail, Outlook, Apple Mail)

### Risk-Based Prioritization

| Priority | Test Outlines | Rationale |
| --- | --- | --- |
| P0 — Must Have | P1, P3, N1, P4, P5, S2, NFR3 | Core business logic: digest grouping, preferences filtering, suppression, deep-link, read-state invariant, idempotency |
| P1 — Should Have | P2, N2, N3, B1, B2, I1, I2, I4, S1, ST1, NFR4 | Important paths: single-project, all-off, read-all, overflow, auth flows, membership revocation, retry |
| P2 — Nice to Have | B3, B4, B5, I3, ST2, NFR1, NFR2, E5, E6 | Edge cases: near-boundary, many projects, expired session, performance, accessibility |

### Open Items for Sprint

- [x] ~~PO confirms send time (hour + timezone)~~ ✅ DONE — 08:00 UTC daily
- [x] ~~PO confirms per-project item cap~~ ✅ DONE — 5 items/section
- [x] ~~PO/Dev confirms Resend wiring scope~~ ✅ DONE — IS part of this story
- [x] ~~Dev defines deep-link URL scheme + auth~~ ✅ DONE — session redirect with ?next=
- [x] ~~Dev defines idempotency mechanism~~ ✅ DONE — digest_log UNIQUE constraint
- [x] ~~Dev defines retry/failure strategy~~ ✅ DONE — 3 retries, exponential backoff
- [x] ~~Design provides email template (or wireframe)~~ ✅ DONE — single-column 600px, footer link, overflow muted
- [x] ~~Dev confirms email size limits~~ ✅ DONE — ~50 per workspace, ~100 total, ~80KB ceiling

### Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigated by Outlines |
| --- | --- | --- | --- | --- |
| 1 | Resend not wired blocks all email testing | High | Critical | I4, NFR4 — mock Resend for test; validate delivery when live |
| 2 | Membership changes between notification creation and digest send leak data | Medium | High | S1, S2 — re-evaluate RLS at send-time |
| 3 | Duplicate digest sent on cron restart | Medium | High | NFR3 — idempotency guard must be implemented |
| 4 | Email exceeds provider size limit with many notifications | Medium | Medium | B4, NFR1 — define max items and truncation |
| 5 | Timezone/DST edge cases cause missed or duplicate sends | Low | Medium | P1 (assumed UTC for v1) — defer timezone handling |
| 6 | Deep-link auth flow fails for unauthenticated users | Medium | Medium | I2, I3 — test session redirect + return URL |

---

---
_Synced from Jira by sync-jira-issues_
