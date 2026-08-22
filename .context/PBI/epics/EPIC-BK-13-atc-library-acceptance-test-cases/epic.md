# EPIC: ATC Library (Acceptance Test Cases)

**Jira Key:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 42

---

## Description

# EPIC-BK-4 — ATC Library (Acceptance Test Cases)

Maps PRD EPIC-BK-004 (US 4.1..4.6) and SRS FR-010..FR-014.

***Capability***: The reusable testing primitives layer. An ATC (Acceptance Test Case) is a small, named, reusable test fragment anchored to a User Story + ≥1 Acceptance Criterion. Tests are composed by chaining ATCs (see EPIC-BK-5). Editing an ATC propagates to every Test that references it — one-edit-many-tests.

## Wave

***Wave 3*** — ATC Library (Acceptance Test Cases). Bunkai's differentiator — one-edit-many-tests. Authoring layer that Wave 4 (Tests + Manual Runs) chains together. Cannot start before Wave 2 (Project + Module hierarchy) lands. See `.context/master-implementation-plan.md` §5.

## Scope

- US 4.1 + 4.2 — Create ATC anchored to US/AC with steps, assertions, layer, tags (`FR-010`).
- US 4.3 — Search ATCs by name and module via textual autocomplete (`FR-011`).
- US 4.4 — Edit ATC with cascade-propagation to chained Tests; version bump; emit affected*test*ids (`FR-012`).
- US 4.5 — "Used in N tests" report on each ATC (`FR-013`).
- US 4.6 — Duplicate an ATC as starting point for a similar one (`FR-014`).

## Out of Scope (MVP)

- Semantic search via pgvector + embeddings — ships Phase 2 (separate FR).
- ATC parameterization editors (equivalence partitions, boundary values, decision tables, state transitions) — Phase 3.
- Bulk import of ATCs from external test repos — Phase 2.

## Business Rules

- ATC MUST be anchored to one `user*story*id` AND have ≥1 `acceptance*criterion*id`.
- All `acceptance*criterion*ids` MUST belong to the same `user*story*id` (no cross-US AC binding).
- `module_id` of an ATC MUST be the US's module OR a descendant module of the same Project.
- ATC `layer` ∈ `{UI`, `API`, `Unit`} — strict enum.
- Step `position` strictly increasing from 1; assertion `position` same rule.
- ATC edit increments `version` integer; Tests referencing it auto-reflect changes (no copy-on-write).
- ATC slug format: `{module-slug}/{atc-id-padded`} — stable across renames.
- Duplicate creates new ATC row with title suffix `(copy)` unless override provided.

## Stories

- [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) — ATC create + edit REST API (POST/PATCH /atcs, transactional steps + assertions) (FR-010a)
- [https://jira.upexgalaxy.com/browse/BK-19#icft=BK-19](https://jira.upexgalaxy.com/browse/BK-19#icft=BK-19) — ATC creation UI (multi-step + assertion builder) (FR-010b)
- [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20) — ATC search & autocomplete (FTS + rank) (FR-011)
- [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) — ATC edit propagation (cascade + version + affected*test*ids) (FR-012)
- [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) — ATC usage report ("Used in N tests") (FR-013)
- [https://jira.upexgalaxy.com/browse/BK-23#icft=BK-23](https://jira.upexgalaxy.com/browse/BK-23#icft=BK-23) — ATC duplicate (FR-014)

## Related Documentation

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004
- SRS: `.context/SRS/functional-specs.md` § FR-010, FR-011, FR-012, FR-013, FR-014
- Business map: `.context/business/business-data-map.md` (entities: atcs, atc*steps, atc*assertions, test_steps)
- API contract: `.context/SRS/api-contracts.yaml` (paths: /atcs, /atcs/{id}, /atcs/search, /atcs/{id}/usage)

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-18](https://jira.upexgalaxy.com/browse/BK-18) | TMS-ATC API | Create and edit ATCs with steps and assertions | 5 | Medium | Ready For Release |
| [BK-19](https://jira.upexgalaxy.com/browse/BK-19) | TMS-ATC Builder | Build an ATC with ordered steps and assertions | 5 | Medium | Ready For Release |
| [BK-20](https://jira.upexgalaxy.com/browse/BK-20) | TMS-ATC Search | Search and autocomplete ATCs | 5 | Medium | QA Approved |
| [BK-21](https://jira.upexgalaxy.com/browse/BK-21) | TMS-ATC Propagation | Cascade ATC edits to all tests | 5 | Medium | QA Approved |
| [BK-22](https://jira.upexgalaxy.com/browse/BK-22) | TMS-ATC Usage | See a "Used in N tests" report | 3 | Medium | QA Approved |
| [BK-23](https://jira.upexgalaxy.com/browse/BK-23) | TMS-ATC Duplicate | Duplicate an ATC with steps and assertions | 5 | Medium | QA Approved |
| [BK-267](https://jira.upexgalaxy.com/browse/BK-267) | TMS-ATC Library | Browse, search, and filter ATCs across every project | 1 | Medium | ABORTED |
| [BK-315](https://jira.upexgalaxy.com/browse/BK-315) | TMS-ATC Library | Export a Project's ATCs to CSV | 1 | Medium | Ready For Dev |
| [BK-399](https://jira.upexgalaxy.com/browse/BK-399) | TMS-ATC Classification | Classify by test-design technique and priority | - | Medium | Backlog |
| [BK-439](https://jira.upexgalaxy.com/browse/BK-439) | TMS-ATC Library | Browse every ATC in the workspace from one index | 5 | Medium | Backlog |
| [BK-440](https://jira.upexgalaxy.com/browse/BK-440) | TMS-ATC Library | Find an ATC by name as you type | 3 | Medium | Backlog |
| [BK-441](https://jira.upexgalaxy.com/browse/BK-441) | TMS-ATC Library | Narrow the index by Project, Module, layer and anchor | 3 | Medium | Backlog |
| [BK-467](https://jira.upexgalaxy.com/browse/BK-467) | 🚀 TMS-ATC Library | Export a Project's ATCs to CSV | 1 | Medium | Ready For QA |
| [BK-507](https://jira.upexgalaxy.com/browse/BK-507) | TMS-ATC Library | Bulk-edit tags, Module and layer on selected ATCs | - | Medium | Backlog |
| [BK-571](https://jira.upexgalaxy.com/browse/BK-571) | TMS-ATC Library | Archive an ATC and restore it from the archive | - | Medium | Backlog |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
