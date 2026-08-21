# PAT | Enforce capability scopes on read, identity and notification routes

**Jira Key:** [BK-499](https://jira.upexgalaxy.com/browse/BK-499)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 8

---

## Overview

## User story

***As a*** Karim, the autonomous AI test agent that authenticates to Bunkai with a Personal Access Token
***I want to*** have my token's capability scope enforced on reporting reads, runs/tests reads, workspace/membership routes, and identity/notification routes
***So that*** a token minted for one narrow job can never read data or act outside that job's scope, whether by mistake or because the token leaked

## Definition of done

> Updated 2026-08-21 by the AI Product Owner & AI Tech Lead Ruling (see comment) — supersedes the original 4 bullets below.

- 24 handlers (21 files — full grep-verified list in `shift-left-refinement.md` Phase 1) receive a resolved capability posture:
- `POST /workspaces` stays genuinely capability-free (any PAT with ≥1 scope passes) — the sole bootstrap exception.
- `DELETE /workspaces/{id}/membership` and `POST /me/active-workspace` are ***session-only*** (every Bearer PAT rejected outright, regardless of scope) — corrected from the original "capability-free" wording, which described a different (weaker) guarantee than what the shipped code (`assertSessionOnly`) actually does.
- The fixture PAT at `app/api/v1/projects/[id]/traceability/route.test.ts:132` is widened from `['atc:write']` to `['atc:read','atc:write']`.
- No database migration.

## Provenance

This Story is one of three successors split from ***BK-262*** ("PAT | Enforce capability scopes on every non-ATC route"), which is `ABORTED` (split, not abandoned). It depends on "PAT | Require every API route to declare its capability posture" (the Foundation slice). The split, its rationale, and the acceptance-criteria allocation — including the corrected AC-08/AC-09 examples — are decided in the AI Product Owner and AI Tech Lead rulings posted on BK-262 on 2026-08-17, under CLAUDE.md Critical Rule #18.

Entry status was `Backlog`, not `Ready For Dev`: verification against live code found this Story's two inherited read criteria illustrating a non-existent endpoint, plus five in-code postures its own enforcement decision supersedes — so QA pulled this Story through its own shift-left pass before dev pickup. This Story carries BK-262's `shift-left-2026-08-14` / `shift-left-reviewed` labels forward as provenance of its refinement source.

***2026-08-21 update****: the Shift-Left refinement session identified 4 real ambiguities (see "QA Refinements" below) and all 4 were resolved the same day by the AI Product Owner & AI Tech Lead Ruling comment. Story Points estimated at ****8*** (relative sizing against BK-497 = 5, BK-498 = 8 — see the estimation discussion in this Story's session). Story is now `Ready For Dev`.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-21

> Refined Acceptance Criteria live in the Acceptance Criteria field — all `NEEDS PO/DEV CONFIRMATION` markers RESOLVED as of 2026-08-21 (see "AI Product Owner & AI Tech Lead Ruling" comment).

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | PAT with a completely empty scope array attempting bootstrap | No | Medium | Added to AC (see AC1, Scenario 1.2) |
| 2 | PAT holding atc:write only attempting a read-gated route | No | Medium | Flagged as a boundary outline — behavior TBD by implementation, not blocking |
| 3 | Expired/revoked PAT on any of the 24 routes | No (pre-existing behavior) | Low | Test only — regression check, don't add AC |
| 4 | Browser session hitting a session-only route | No | High | Added to AC (see AC5, Scenario 5.2) |

### Clarified Business Rules

- Business Rule 1: a token missing the required capability is rejected regardless of the underlying user's workspace role — now exercised by AC7.
- Business Rule 2: a browser session always carries the full capability set — never scope-restricted — now exercised by AC6.
- `DELETE /workspaces/{id}/membership` and `POST /me/active-workspace` are session-only (every Bearer PAT rejected outright) — now exercised by AC5, correcting the original "capability-free" wording.

### Critical Questions for PO — ALL RESOLVED 2026-08-21

See the "AI Product Owner & AI Tech Lead Ruling — BK-499 Shift-Left Follow-up" comment for full rationale per question. Summary of rulings:

1. `GET /workspaces/{id}/notifications` → no capability required (identity/notifications bucket).
2. `POST /workspaces/{id}/projects` → requires `atc:write`.
3. `DELETE /workspaces/{id}/membership` / `POST /me/active-workspace` → reworded "capability-free" to "session-only" in this Definition of Done.
4. Handler count → adopted the 24-handler / 21-file grep-verified list as authoritative.

### Technical Questions for Dev — ALL RESOLVED 2026-08-21

See the ruling comment for full rationale. Summary:

1. `GET /workspaces`, `GET /workspaces/{id}` → confirmed `atc:read`.
2. `POST /workspaces/{id}/projects` capability-vs-role evaluation order → capability check first (middleware-level, unconditional), RLS role check second (unchanged existing behavior).
3. Identity/notifications no-capability posture → confirmed uniform across reads and writes.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the Acceptance Test Plan field and the canonical comment. Local working copy: `.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-499-pat-enforce-capability-scopes-on-read-identity-and/shift-left-refinement.md`.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (2)

- [BK-497](https://jira.upexgalaxy.com/browse/BK-497): PAT | Require every API route to declare its capability posture _(QA Approved)_
- [BK-262](https://jira.upexgalaxy.com/browse/BK-262): PAT | Enforce capability scopes on every non-ATC route _(ABORTED)_

---

## Metadata

- **Created:** 8/17/2026
- **Updated:** 8/21/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-08-14, shift-left-2026-08-21, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
