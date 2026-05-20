# EPIC: ATC Library (Atomic Test Components)

**Jira Key:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13)
**Priority:** Medium
**Status:** Backlog
**Total Story Points:** 6

---

## Description

# EPIC-BK-4 — ATC Library (Atomic Test Components)

Maps PRD EPIC-BK-004 (US 4.1..4.6) and SRS FR-010..FR-014.

Capability: The reusable testing primitives layer. An ATC (Atomic Test Component) is a small, named, reusable test fragment anchored to a User Story + ≥1 Acceptance Criterion. Tests are composed by chaining ATCs (see EPIC-BK-5). Editing an ATC propagates to every Test that references it — one-edit-many-tests.

## Scope

- US 4.1 + 4.2 — Create ATC anchored to US/AC with steps, assertions, layer, tags (`FR-010`).
- US 4.3 — Search ATCs by name and module via textual autocomplete (`FR-011`).
- US 4.4 — Edit ATC with cascade-propagation to chained Tests; version bump; emit affected_test_ids (`FR-012`).
- US 4.5 — "Used in N tests" report on each ATC (`FR-013`).
- US 4.6 — Duplicate an ATC as starting point for a similar one (`FR-014`).

## Out of Scope (MVP)

- Semantic search via pgvector + embeddings — ships Phase 2 (separate FR).
- ATC parameterization editors (equivalence partitions, boundary values, decision tables, state transitions) — Phase 3.
- Bulk import of ATCs from external test repos — Phase 2.

## Business Rules

- ATC MUST be anchored to one `user_story_id` AND have ≥1 `acceptance_criterion_id`.
- All `acceptance_criterion_ids` MUST belong to the same `user_story_id` (no cross-US AC binding).
- `module_id` of an ATC MUST be the US's module OR a descendant module of the same Project.
- ATC `layer` ∈ {`UI`, `API`, `Unit`} — strict enum.
- Step `position` strictly increasing from 1; assertion `position` same rule.
- ATC edit increments `version` integer; Tests referencing it auto-reflect changes (no copy-on-write).
- ATC slug format: `{module-slug}/{atc-id-padded}` — stable across renames.
- Duplicate creates new ATC row with title suffix `(copy)` unless override provided.

## Stories

- BK-18 — ATC API create + edit endpoint (POST/PATCH /atcs, transactional steps+assertions) (FR-010a)
- BK-19 — ATC creation UI (multi-step + assertion builder) (FR-010b)
- BK-20 — ATC search & autocomplete (FTS + rank) (FR-011)
- BK-21 — ATC edit propagation (cascade + version + affected_test_ids) (FR-012)
- BK-22 — ATC usage report ("Used in N tests") (FR-013)
- BK-23 — ATC duplicate (FR-014)

## Related Documentation

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004
- SRS: `.context/SRS/functional-specs.md` § FR-010, FR-011, FR-012, FR-013, FR-014
- Business map: `.context/business/business-data-map.md` (entities: atcs, atc_steps, atc_assertions, test_steps)
- API contract: `.context/SRS/api-contracts.yaml` (paths: /atcs, /atcs/{id}, /atcs/search, /atcs/{id}/usage)


---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-18](https://upexgalaxy67.atlassian.net/browse/BK-18) | FR-010a — ATC create+edit REST API (POST/PATCH /atcs, transactional steps+assertions) | 1 | Medium | Backlog |
| [BK-19](https://upexgalaxy67.atlassian.net/browse/BK-19) | FR-010b — ATC creation UI (multi-step builder + assertion builder) | 1 | Medium | Backlog |
| [BK-20](https://upexgalaxy67.atlassian.net/browse/BK-20) | FR-011 — ATC search + autocomplete (FTS + ts_rank + recency decay) | 1 | Medium | Backlog |
| [BK-21](https://upexgalaxy67.atlassian.net/browse/BK-21) | FR-012 — ATC edit propagation (cascade replace, version bump, affected_test_ids) | 1 | Medium | Backlog |
| [BK-22](https://upexgalaxy67.atlassian.net/browse/BK-22) | FR-013 — ATC usage report ("Used in N tests") | 1 | Medium | Backlog |
| [BK-23](https://upexgalaxy67.atlassian.net/browse/BK-23) | FR-014 — ATC duplicate (clone steps + assertions, title suffix "(copy)") | 1 | Medium | Backlog |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:07.000Z_
