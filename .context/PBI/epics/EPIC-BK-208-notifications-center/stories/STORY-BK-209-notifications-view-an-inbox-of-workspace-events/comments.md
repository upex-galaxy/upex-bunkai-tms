# Comments for BK-209

[View in Jira](https://jira.upexgalaxy.com/browse/BK-209)

---

### Ely - 7/11/2026, 12:52:24 PM

## PO Ratification — 2026-07-11

- N1 — Notification retention is ratified at 90 days, after which notifications are auto-purged regardless of read state. The Business Rules field already reflects this value; no change needed.
- N2 — The unread badge caps its display at "99+". Already reflected in the Business Rules field; no change needed.

---

### yxsinell acosta zambrano - 7/11/2026, 1:03:44 PM

Trabajo en esta US :nerd: 

---

### yxsinell acosta zambrano - 7/15/2026, 2:58:24 PM

## Acceptance Test Plan (ATP) - Shift-Left DRAFT ready for review

ATP DRAFT lives in the Acceptance Test Plan (ATP) field.

Key Phase 2 findings:

- 34 outline-level ATP checks identified.
- Main blocker: top-bar notification entry point conflicts with current sidebar shell evidence.
- Main risk: notification metadata must not leak inaccessible workspace/entity data.
- PO/Dev/Design questions are included in the ATP field and local refinement artifact.

---

### yxsinell acosta zambrano - 7/16/2026, 1:36:16 AM

## PO Answers - BK-209 Open Questions

***Original Question: ***Should BK-209 count and display notifications for the active workspace only, or across all workspaces?

***Answer: ***Active workspace only. Bunkai already uses active workspace as the operating context; mixing workspaces in one inbox increases confusion and data-leak risk.

***Original Question: ***Should loss of access hide old notifications entirely, or keep redacted rows with no entity metadata?

***Answer: ***Hide them entirely. If the user no longer has access, the product should not reveal that an entity or event exists.

***Original Question: ***What exact copy should appear for deleted or unavailable target entities?

***Answer: ***Use: "This item is no longer available." If the target is inaccessible, do not show entity-specific metadata. If it was deleted but still belongs to an accessible context, the original notification summary may remain.

***Original Question: ***Should retention purge run exactly after 90 days, or can notifications on day 90 remain until the next scheduled cleanup?

***Answer: ***Day 90 remains visible; day 91 is outside retention. The purge can run asynchronously, but UI/API visibility must apply the 90-day filter.

***Original Question: ***Is mark-all-as-read scoped to active workspace only?

***Answer: ***Yes. Mark-all affects only visible notifications in the active workspace. Hidden or inaccessible notifications must not be mutated by that action.

---

### yxsinell acosta zambrano - 7/16/2026, 1:36:16 AM

## Dev Answers - BK-209 Open Questions

***Original Question: ***Will BK-209 create a dedicated notifications table with per-recipient read state, or derive notifications from activity_log plus user-specific state?

***Answer: ***Create dedicated notification storage for recipient delivery and read-state. activity_log can feed events, but it should not be the only source because it does not model personal delivery, read/unread state, retention visibility, or per-recipient copies cleanly.

***Original Question: ***Which endpoint(s) will support list, mark-one-read, and mark-all-read?

***Answer: ***Use GET /api/v1/workspaces/{id}/notifications, POST /api/v1/notifications/{id}/read, and POST /api/v1/workspaces/{id}/notifications/read-all. All must be RBAC/RLS-safe and non-disclosing.

***Original Question: ***What is the route map for deep links by entity type: run, bug, test?

***Answer: ***Run: /projects/{projectSlug}/runs/{runId}. Test: /projects/{projectSlug}/tests/{testId}. Bug: route depends on the BK-31 Bugs & Defect Heatmap implementation; Dev must define the final bug route before this story reaches Ready For QA.

***Original Question: ***How will sibling event producers seed notification test data before they are fully implemented?

***Answer: ***Provide a seed/factory path that creates notifications directly for QA and automated tests. BK-209 should not be blocked by sibling event producers being unfinished.

***Original Question: ***How will retention be implemented: scheduled purge, query filter, or both?

***Answer: ***Both. API queries must filter out notifications older than 90 days, and an async purge can physically remove old rows later. Security and product correctness must not depend on the purge job running exactly on time.

---

### yxsinell acosta zambrano - 7/16/2026, 1:36:17 AM

## Design Answers - BK-209 Open Questions

***Original Question: ***Does the bell belong in a top bar as written, or should the current sidebar/account-menu shell be updated?

***Answer: ***Adapt to the current shell: place the notification entry point in the persistent sidebar near the account/user area or another global sidebar affordance. A top bar would be a broader shell change and should be estimated separately if desired.

***Original Question: ***What are the visual differences for read vs unread rows?

***Answer: ***Unread rows should use a small unread dot, stronger text weight, and subtle surface emphasis. Read rows should remove the dot and use normal text weight/lower emphasis. Do not rely on color alone.

***Original Question: ***What are the approved empty-state illustration and copy?

***Answer: ***Copy: "No notifications yet. Important workspace events will appear here." Illustration is optional for MVP and should match existing empty-state style if available.

***Original Question: ***How should a 400px anchored panel behave on narrow/mobile viewports?

***Answer: ***Desktop uses the anchored panel. Narrow/mobile should use a full-screen sheet/drawer so content remains readable and touch-friendly.

***Original Question: ***Should the panel close after row click, mark-one-read, or mark-all-read?

***Answer: ***Row click closes because it navigates. Mark-one-read does not close. Mark-all-read does not close; it should update the panel state in place.

---

### yxsinell acosta zambrano - 7/16/2026, 1:49:25 AM

## Estimation Rationale — 13 Story Points

BK-209 was estimated as ***13 SP*** because this is not only a visual inbox/bell change. The story defines the minimum notification substrate needed for a safe MVP.

Main drivers:

- ***UI work***: notification entry point, unread badge, anchored panel/drawer, read/unread visual states, empty state, day grouping, responsive behavior.
- ***Per-recipient state***: each user needs their own read/unread state; one user's read action must not affect another user.
- ***Backend/API work***: list notifications, mark one as read, mark all visible notifications as read.
- ***Storage decision***: dedicated notification storage is needed; activity_log can feed events but is not enough for recipient delivery and read state.
- ***Security/RBAC***: notifications must never leak workspace/entity metadata after access is lost or for entities the user cannot access.
- ***Deep links***: notifications must route safely to runs/tests/bugs and handle deleted or unavailable targets without broken navigation.
- ***Retention and boundaries***: 90-day visibility rule and 99+ badge cap must be enforced.
- ***QA setup risk***: sibling event-producing stories are not implemented yet, so Dev must provide a seed/factory path for test data.

Planning note:

- If this were only UI with mocked data, it would be closer to 5 SP, but that would not satisfy the accepted ACs.
- If it included full run/bug event producers, it would likely become 21 SP and should be split.
- Current scope is the inbox substrate + safe user-facing experience, so 13 SP is the balanced estimate.

---

### Ely - 7/30/2026, 1:29:28 PM

Mockup — Notifications inbox (bell + panel). Source: .context/designs/bunkai-test-management-tool/bk-208-notifications/notifications-inbox.html · spec: master-design-plan §4.13



---


_Synced from Jira by sync-jira-issues_
