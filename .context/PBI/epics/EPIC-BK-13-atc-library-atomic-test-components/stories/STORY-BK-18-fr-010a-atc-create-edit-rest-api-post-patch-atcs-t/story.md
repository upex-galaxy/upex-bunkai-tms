# ATC create + edit REST API (POST/PATCH /atcs, transactional steps + assertions)

**Jira Key:** [BK-18](https://upexgalaxy67.atlassian.net/browse/BK-18)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5

---

## Overview

***Source spec:*** FR-010a

## User Story

As an automation engineer or API consumer, I want a REST API to create and edit ATCs (Atomic Test Components) with their steps and assertions in a single transactional call, so that I can compose reusable test building blocks from CLI tools, scripts, and the UI client.

## Context

Anchors PRD US 4.1 and US 4.2 and implements SRS FR-010 (server surface). The UI form (Story FR-010b, BK-19) and downstream Test composition (EPIC-BK-5) both depend on this contract.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-05-27

> Full ATP DRAFT lives in custom field 🧪 Acceptance Test Plan (ATP) and mirrored as a comment on this issue. This section captures the slices PO + Dev need before estimation.

### 🔍 Refined Acceptance Criteria — summary

13 Gherkin scenarios produced (Happy 2 / Negative 7 / Boundary 2 / Integration 2). Key contract decisions:

1. ***Slug format***: `{module-slug}/atc-{id-first-8-chars}` (lowercase UUID prefix) — deterministic, no sequence dependency.
2. ***PATCH semantics***: Full-replace body (PUT-like), NOT partial merge. Omitted = cleared.
3. ***Version conflict***: Optimistic locking via `If-Match: <version>` header. 409 on mismatch.
4. ***Error codes***: Add `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid` to API*ERROR*CODES map.
5. ***Auth***: `requireBearerToken` + `requireScope('atc:write')` on both endpoints.
6. `bunkai*create*atc`*** RPC***: NEW RPC returning uuid (separate from `bunkai*save*atc` which is UPDATE-only).
7. ***affected*************test*************ids***: Empty array in MVP (`test_steps` table does not exist yet).
8. ***user*************story*************id on PATCH***: Immutable — silently ignored if provided.

### ⚠️ Edge Cases Identified

14 edge cases: 6 High, 5 Medium, 3 Low. Top high-severity:

- POST with invalid PAT (401), insufficient scope (403), PATCH to non-existent (404)
- Concurrent PATCH version conflict (409), slug collision (409)
- POST with module outside project subtree

### ❓ Open Questions — with Senior PO/DEV decisions

1. ***Slug collision handling***: Return 409 — client must retry with different module/title. (Senior PO)
2. ***Event consumers MVP***: Log to event_log table — BK-20/21 consume later. (Senior PO)
3. ***Scope naming***: Single `atc:write` covers both POST and PATCH. (Senior PO)
4. ***bunkai*************create*************atc signature***: Returns uuid, takes p*project*id. Slug computed in PL/pgSQL. (Senior DEV)
5. ***Error code registration***: Add to API*ERROR*CODES map (not inline). (Senior DEV)
6. ***affected*************test*************ids***: Empty [] — test_steps table not yet migrated. (Senior DEV)
7. ***PATCH empty body***: Accept as no-op → 200, no version bump, no event. (Senior DEV)

### 📐 Scope — IN vs OUT

***IN***: POST/PATCH endpoints, bunkai*create*atc RPC, cross-entity validation, slug computation, version bump, auth+scope, optimistic locking, event emission, new error codes, OpenAPI spec, integration tests.
***OUT***: GET (BK-20), DELETE (future), UI form (BK-19), used*in expansion (BK-20), idempotency (future), webhooks (future), granular scopes (future), affected*test_ids with real data (EPIC-BK-5).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** api, atc, backend, mvp, shift-left-2026-05-27, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:50.124Z_
