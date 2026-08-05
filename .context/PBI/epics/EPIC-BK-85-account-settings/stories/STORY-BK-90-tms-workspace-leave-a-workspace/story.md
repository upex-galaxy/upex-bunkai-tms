# TMS-Workspace | Leave a workspace

**Jira Key:** [BK-90](https://jira.upexgalaxy.com/browse/BK-90)
**Epic:** [BK-85](https://jira.upexgalaxy.com/browse/BK-85) (Account & Settings)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a QA Lead (Mateo Silva) I want to leave a workspace I no longer need, so that my account stays scoped to the teams I actually work with.

## QA Refinements (Shift-Left Analysis) — Added 2026-06-10

> Refined Acceptance Criteria live in the `acceptance_criteria` field — the 2 existing scenarios were sharpened in place (refinements, not replacements) and 3 new scenarios were added to fill gaps the original 2 leave open. Every new scenario is flagged ********NEEDS PO/DEV CONFIRMATION**** in the field itself.

### Central finding — the multi-owner gate is the highest-leverage open question

Scenario 2 only describes the SOLE-owner block ("Mateo is the only owner of Acme QA"). It does not say whether the gate is "you are AN owner" (which would also block a co-owner from leaving) or "you are the LAST remaining owner" (which would not). The schema (`workspace_members.role`) does not prevent multiple `owner` rows per workspace. This refinement assumes the gate is count-based ("are you the LAST remaining owner") as New Scenario C — but if the team intends NO co-owner to ever leave without an explicit ownership-transfer step first, this scenario is invalid and a "transfer ownership" sub-flow becomes new, unscoped work that would materially change the story's size beyond its current 3 SP.

### Open Questions for PO / Dev

1. ********Can a workspace have more than one member with ****`role = 'owner'`****, and if so, can any of them leave freely as long as at least one owner remains — or must ownership be transferred/reduced to exactly one other owner first?**** Blocks New Scenario C (co-owner leave) — without an answer this outline cannot be designed or estimated.
2. ********What happens when a user leaves the only workspace they belong to**** — is "leave" blocked (a "must belong to at least one workspace" guard, symmetric to the sole-owner guard), or does the user land on the onboarding/no-workspace flow? Blocks New Scenario A (boundary outline).
3. ********(Dev)**** Should workspace-scoped Personal Access Tokens (`access*tokens` rows where `workspace*id` = the left workspace and `user_id` = the leaving user) be auto-revoked as part of the "leave workspace" transaction, or left as functionally-dead-but-not-formally-revoked rows? Determines whether New Scenario B's "no cascade" claim needs a PAT-revocation caveat.

> Full refinement (Critical Analysis, Story Quality Analysis, Edge Cases, ATP DRAFT outlines, Risks & mitigation) lives in the `acceptance*test*plan` field and the pointer comment below. Local working copy: `.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-90-tms-workspace-leave-a-workspace/shift-left-refinement.md`

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Story (1)

- [BK-89](https://jira.upexgalaxy.com/browse/BK-89): TMS-Workspace | View the workspaces I belong to _(Ready For QA)_

---

## Metadata

- **Created:** 6/7/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** implementation-plan-ready, shift-left-2026-06-10, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
