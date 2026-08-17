# PAT | Require every API route to declare its capability posture

**Jira Key:** [BK-497](https://jira.upexgalaxy.com/browse/BK-497)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5

---

## Overview

## User story

***As a*** Karim, the autonomous AI test agent that authenticates to Bunkai with a Personal Access Token
***I want to*** have every API route handler declare its authentication/capability posture explicitly, so a handler that declares none fails to compile
***So that*** the capability gap this Story closes cannot silently reopen, even before any specific route family gets its own capability decision

## Definition of done

- Every route handler declares its authentication posture explicitly; a handler with no posture fails to compile.
- All 87 exported handlers across 68 route files are migrated to the new posture-declaring shape.
- `AccessTokenScope` (`lib/api/pat.ts:12`) is consolidated into `ALL_CAPABILITIES` (`lib/api/principal.ts:31`).
- The hand-rolled bearer rejection in `app/api/v1/tokens/route.ts:36` and `app/api/v1/tokens/[id]/route.ts:21` is lifted into the gateway as a first-class `cookie-only` posture.
- `GET /api/v1/tokens` (`app/api/v1/tokens/route.ts:111`) receives a declared no-capability posture carrying its existing justification ("Listing is read-only and RLS-scoped to the caller's own tokens") — not the `cookie-only` lift.
- A coverage check enumerates every handler and its posture, fails when a new route appears without one, and explicitly enumerates the two gateway bypassers (`app/api/openapi/route.ts:18`, `app/api/v1/route.ts:21`) so it cannot claim false completeness.
- No behaviour change — every existing gate stays green.
- No database migration.

## Provenance

This Story is one of three successors split from ***BK-262*** ("PAT | Enforce capability scopes on every non-ATC route"), which is `ABORTED` (split, not abandoned). The split, its rationale, and the acceptance-criteria allocation are decided in the AI Product Owner and AI Tech Lead rulings posted on BK-262 on 2026-08-17, under CLAUDE.md Critical Rule #18. This Story carries BK-262's `shift-left-2026-08-14` / `shift-left-reviewed` labels forward as provenance of its refinement source.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

---

## Traceability

### Storys (3)

- [BK-498](https://jira.upexgalaxy.com/browse/BK-498): PAT | Enforce capability scopes on the authoring domain _(Ready For Dev)_
- [BK-499](https://jira.upexgalaxy.com/browse/BK-499): PAT | Enforce capability scopes on read, identity and notification routes _(Backlog)_
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
