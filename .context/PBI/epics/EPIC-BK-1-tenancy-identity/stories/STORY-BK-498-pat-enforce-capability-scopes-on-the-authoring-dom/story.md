# PAT | Enforce capability scopes on the authoring domain

**Jira Key:** [BK-498](https://jira.upexgalaxy.com/browse/BK-498)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 8

---

## Overview

## User story

***As a*** Karim, the autonomous AI test agent that authenticates to Bunkai with a Personal Access Token
***I want to*** have my token's capability scope enforced on every authoring-domain route (modules, user stories, acceptance criteria, environments, milestones, imports)
***So that*** a token minted for read-only or unrelated work can never create, change or delete authoring content, whether by mistake or because the token leaked

## Definition of done

- All 22 authoring-domain handlers require a capability: writes require `atc:write`, reads require `atc:read`.
- A properly-scoped token succeeds; an under-scoped token is rejected with 403 before any change happens.
- No database migration.

## Provenance

This Story is one of three successors split from ***BK-262*** ("PAT | Enforce capability scopes on every non-ATC route"), which is `ABORTED` (split, not abandoned). It depends on "PAT | Require every API route to declare its capability posture" (the Foundation slice), whose compile-time union this Story's routes must already satisfy. The split, its rationale, and the acceptance-criteria allocation are decided in the AI Product Owner and AI Tech Lead rulings posted on BK-262 on 2026-08-17, under CLAUDE.md Critical Rule #18. This Story carries BK-262's `shift-left-2026-08-14` / `shift-left-reviewed` labels forward as provenance of its refinement source.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

---

## Traceability

### Storys (2)

- [BK-497](https://jira.upexgalaxy.com/browse/BK-497): PAT | Require every API route to declare its capability posture _(In Test)_
- [BK-262](https://jira.upexgalaxy.com/browse/BK-262): PAT | Enforce capability scopes on every non-ATC route _(ABORTED)_

---

## Metadata

- **Created:** 8/17/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** shift-left-2026-08-14, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
