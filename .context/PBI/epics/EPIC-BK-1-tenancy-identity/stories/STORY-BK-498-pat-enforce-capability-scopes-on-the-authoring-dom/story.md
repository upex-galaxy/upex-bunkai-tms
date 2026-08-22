# PAT | Enforce capability scopes on the authoring domain

**Jira Key:** [BK-498](https://jira.upexgalaxy.com/browse/BK-498)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** QA Approved
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
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (15)

- [BK-556](https://jira.upexgalaxy.com/browse/BK-556): BK-498: TC1: should create module successfully given a PAT scoped exactly atc:write _(Candidate)_
- [BK-557](https://jira.upexgalaxy.com/browse/BK-557): BK-498: TC9: should create module successfully via an authenticated browser session regardless of any PAT scope restriction _(Candidate)_
- [BK-558](https://jira.upexgalaxy.com/browse/BK-558): BK-498: TC10: should return 401 for a revoked atc:write token, distinct from the 403 an under-scoped-but-valid token receives _(Candidate)_
- [BK-559](https://jira.upexgalaxy.com/browse/BK-559): BK-498: TC11: should reject writes across all authoring families given a PAT scoped exactly atc:read _(Candidate)_
- [BK-560](https://jira.upexgalaxy.com/browse/BK-560): BK-498: TC2: should reject module creation with 403 and no side effect given a PAT scoped exactly atc:read _(Candidate)_
- [BK-561](https://jira.upexgalaxy.com/browse/BK-561): BK-498: TC12: should accept writes across all authoring families given a PAT scoped exactly atc:write _(Candidate)_
- [BK-562](https://jira.upexgalaxy.com/browse/BK-562): BK-498: TC3: should create module successfully given an unbound atc:write PAT held by a real workspace member _(Candidate)_
- [BK-564](https://jira.upexgalaxy.com/browse/BK-564): BK-498: TC4: should list user stories successfully given a PAT scoped atc:read _(Candidate)_
- [BK-563](https://jira.upexgalaxy.com/browse/BK-563): BK-498: TC13: should accept reads across all authoring families given a PAT scoped exactly atc:read _(Candidate)_
- [BK-565](https://jira.upexgalaxy.com/browse/BK-565): BK-498: TC5: should reject a read request with 403 given a PAT scoped only atc:write _(Candidate)_
- [BK-566](https://jira.upexgalaxy.com/browse/BK-566): BK-498: TC14: should reject reads across all authoring families given a PAT scoped exactly atc:write (write-only token) _(Candidate)_
- [BK-567](https://jira.upexgalaxy.com/browse/BK-567): BK-498: TC6: should return 401 unauthenticated when no token is presented, distinct from the 403 capability rejection _(Candidate)_
- [BK-569](https://jira.upexgalaxy.com/browse/BK-569): BK-498: TC7: should reject module creation with a membership-403 given a correctly-scoped atc:write PAT whose user is not a workspace member _(Candidate)_
- [BK-568](https://jira.upexgalaxy.com/browse/BK-568): BK-498: TC15: should complete a full import lifecycle (create then poll) successfully given a PAT scoped both atc:write and atc:read _(Candidate)_
- [BK-570](https://jira.upexgalaxy.com/browse/BK-570): BK-498: TC8: should continue succeeding on both read and write given a default-scoped PAT _(Candidate)_

### Storys (2)

- [BK-497](https://jira.upexgalaxy.com/browse/BK-497): PAT | Require every API route to declare its capability posture _(QA Approved)_
- [BK-262](https://jira.upexgalaxy.com/browse/BK-262): PAT | Enforce capability scopes on every non-ATC route _(ABORTED)_

---

## Metadata

- **Created:** 8/17/2026
- **Updated:** 8/20/2026
- **Reporter:** Ely
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** shift-left-2026-08-14, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
