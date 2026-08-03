# Account | View my identity, role, and sign out

**Jira Key:** [BK-86](https://jira.upexgalaxy.com/browse/BK-86)
**Epic:** [BK-85](https://jira.upexgalaxy.com/browse/BK-85) (Account & Settings)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a Senior QA Engineer (Elena Vargas) I want to see who I am signed in as and my role in the current workspace, and sign out from anywhere in the app, so that I can confirm I'm in the right account before doing work and safely end my session on a shared machine.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-06-08

> Refined Acceptance Criteria live in the `acceptance_criteria` field — 2 of the 3 existing scenarios were sharpened in place (refinements, not replacements) and 4 new scenarios were added to fill gaps the original 3 leave open. Every new scenario is flagged ***NEEDS PO/DEV CONFIRMATION*** in the field itself.

### Critical finding — this is a "design + build" story, not a "wire up" story

Re-validation of the codebase against the real ACs' "global chrome" / "account affordance" language found that ***no persistent global chrome exists anywhere in the app, even partially***. `app/(app)/layout.tsx` — the one layout shared by every authenticated route — renders only an `AuthProvider` and a bare flex column; `Topbar` is instantiated per-page, not globally, and `/onboarding` and `/workspaces/[id]` render with no topbar at all. The closest analogs (`WorkspaceSwitcher`, `CommandPalette`) each cover one slice of the requirement (workspace name display, `Escape` handling) but neither is global, neither shows the signed-in user's own identity, and neither implements full keyboard/ARIA semantics. This reframes the story from "wire identity/role/sign-out into an existing surface" to "design and build the app's first persistent account-menu primitive, then wire identity/role/sign-out into it" — a materially larger estimation input than the bare user-story line suggests.

### Open Questions for PO / Dev

1. ***What is the deterministic source for "name or initials" (Scenario 1), given the schema has no name field?*** `auth.users` exposes only `email` through `/api/v1/me` — no `display*name`, `full*name`, or `avatar_url` in any of the 8 migrations. This blocks writing even one assertable test for the story's most basic identity-display claim.
2. ***What is the concrete page list for "global chrome" (Scenario 1) / "anywhere in the app" (parent story), given no persistent shell exists today?*** This is simultaneously the central feasibility blocker and the input that determines the size of the "reachable from every page" test outline — without it, "every page" cannot be enumerated into a checklist.
3. ***Does "session ends" (Scenario 2) require server-side invalidation, and is multi-tab/multi-device propagation in scope for this story?*** The answer determines whether ~3 of the new scenarios (server-side cookie invalidation, sign-out failure handling, multi-tab termination) are this-sprint or next-sprint scope — directly tied to the parent story's "safely end my session on a shared machine" framing.

> Full refinement (Critical Analysis, Story Quality Analysis, Edge Cases, Clarified Business Rules, ATP DRAFT outlines) lives in the `acceptance*test*plan` field and the canonical comment below. Local working copy: `.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-86-account-view-my-identity-role-and-sign-out/shift-left-refinement.md`

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Bug (1)

- [BK-176](https://jira.upexgalaxy.com/browse/BK-176): Account Settings: Sign-out: Client-side redirect to /login does not fire after successful server-side sign-out _(Ready For QA)_

### Story (1)

- [BK-87](https://jira.upexgalaxy.com/browse/BK-87): Settings | Open a settings hub and view my account _(Ready For QA)_

---

## Metadata

- **Created:** 6/7/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** shift-left-2026-06-08, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
