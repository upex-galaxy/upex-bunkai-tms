# Notifications | View an inbox of workspace events

**Jira Key:** [BK-209](https://jira.upexgalaxy.com/browse/BK-209)
**Epic:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208) (Notifications Center)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to view an inbox of events from my workspaces — with unread state, newest first, and a link into each entity — so that I learn what happened to my runs, bugs, and tests without polling dashboards.

## Context

Today nothing in Bunkai tells Elena that something happened; she discovers outcomes by revisiting pages. This story delivers the delivery surface itself: a bell entry point in the top bar with an unread badge, and a panel listing her notifications newest-first, each deep-linking to the run, bug, or test it is about. What generates those notifications arrives in the sibling stories of this epic (run lifecycle, bug lifecycle); this story activates fully once at least one of those event sources is live.

## QA Refinements (Shift-Left Analysis)

## Critical Findings

- BK-209 is a valid Story for extended Shift-Left refinement because it is user-facing, dynamic, workspace-scoped, and security-sensitive.
- The story has a clear MVP boundary: inbox display, badge, read-state, deep links, deleted-entity fallback, empty state.
- Main risk is not rendering rows. Main risk is leaking notification existence or entity metadata after workspace/entity access changes.
- Current code evidence does not show a notifications module. Treat `activity_log`, workspace membership, and run audit events as likely substrate only, not as implementation contract.
- Design currently says top bar, while current app shell is sidebar/account-menu driven. This needs explicit PO/Design resolution before implementation.

---

## Open Questions for PO / Dev / Design

### PO

1. Should BK-209 count and display notifications for the active workspace only, or across all workspaces?
2. Should loss of access hide old notifications entirely, or keep redacted rows with no entity metadata?
3. What exact copy should appear for deleted or unavailable target entities?
4. Should retention purge run exactly after 90 days, or can notifications on day 90 remain until the next scheduled cleanup? NEEDS PO/DEV CONFIRMATION
5. Is mark-all-as-read scoped to active workspace only? NEEDS PO/DEV CONFIRMATION

### Dev

1. Will BK-209 create a dedicated notifications table with per-recipient read state, or derive notifications from `activity_log` plus user-specific state?
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

| # | Technique | Edge case | Expected behavior | Criticality | Action |
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

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (5)

- [BK-211](https://jira.upexgalaxy.com/browse/BK-211): Notifications | Get notified when a run finishes or is aborted _(Ready For Dev)_
- [BK-212](https://jira.upexgalaxy.com/browse/BK-212): Notifications | Get notified on bug assignment and status changes _(Ready For Dev)_
- [BK-213](https://jira.upexgalaxy.com/browse/BK-213): Notifications | Configure notification preferences per event type _(Ready For Dev)_
- [BK-214](https://jira.upexgalaxy.com/browse/BK-214): Notifications | Receive an email digest of unread notifications _(Backlog)_
- [BK-217](https://jira.upexgalaxy.com/browse/BK-217): Team Chat | Mention a teammate to get their attention _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** new-feature, post-mvp, shift-left-2026-07-15, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
