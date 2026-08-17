# PAT | Enforce capability scopes on read, identity and notification routes

**Jira Key:** [BK-499](https://jira.upexgalaxy.com/browse/BK-499)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 8

---

## Overview

## User story

***As a*** Karim, the autonomous AI test agent that authenticates to Bunkai with a Personal Access Token
***I want to*** have my token's capability scope enforced on reporting reads, runs/tests reads, workspace/membership routes, and identity/notification routes
***So that*** a token minted for one narrow job can never read data or act outside that job's scope, whether by mistake or because the token leaked

## Definition of done

- 27 of the remaining 28 handlers receive a capability posture: reads require `atc:read`; identity/notification routes receive a justified no-capability posture.
- `POST /workspaces` and `DELETE /workspaces/{id}/membership` stay capability-free (bootstrap and self-service-leave rationale — see the AI Tech Lead ruling on BK-262).
- The fixture PAT at `app/api/v1/projects/[id]/traceability/route.test.ts:132` is widened from `['atc:write']` to `['atc:read','atc:write']`.
- The five in-code "no scope requirement" comments this Story's enforcement decision supersedes are updated: `app/api/v1/bugs/route.ts:213`, `app/api/v1/activity/route.ts:13`, `app/api/v1/tests/[id]/runs/route.ts:11`, `app/api/v1/projects/[id]/coverage/route.ts:10`, `app/api/v1/projects/[id]/runs/report/route.ts:14`.
- No database migration.

## Provenance

This Story is one of three successors split from ***BK-262*** ("PAT | Enforce capability scopes on every non-ATC route"), which is `ABORTED` (split, not abandoned). It depends on "PAT | Require every API route to declare its capability posture" (the Foundation slice). The split, its rationale, and the acceptance-criteria allocation — including the corrected AC-08/AC-09 examples — are decided in the AI Product Owner and AI Tech Lead rulings posted on BK-262 on 2026-08-17, under CLAUDE.md Critical Rule #18.

Entry status is `Backlog`, not `Ready For Dev`: verification against live code found this Story's two inherited read criteria illustrating a non-existent endpoint, plus five in-code postures its own enforcement decision supersedes — so QA pulls this Story through its own shift-left pass before dev pickup. This costs nothing on the critical path; it cannot start before the Foundation Story has merged regardless of its status. This Story carries BK-262's `shift-left-2026-08-14` / `shift-left-reviewed` labels forward as provenance of its refinement source.

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

- [BK-497](https://jira.upexgalaxy.com/browse/BK-497): PAT | Require every API route to declare its capability posture _(Ready For Dev)_
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
