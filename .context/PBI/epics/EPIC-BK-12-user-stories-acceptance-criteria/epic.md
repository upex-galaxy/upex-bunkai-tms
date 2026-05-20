# EPIC: User Stories & Acceptance Criteria

**Jira Key:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12)
**Priority:** Medium
**Status:** Backlog
**Total Story Points:** 4

---

## Description

# EPIC-BK-3 — User Stories & Acceptance Criteria

Maps PRD EPIC-BK-003 (US 3.1..3.4) and SRS FR-007..FR-009.

Capability: Authoring layer above the Project/Module hierarchy. Members can capture business intent as User Stories (US), break each US into discrete Acceptance Criteria (AC), and one-way-import existing Stories from Jira. US/AC bodies are Markdown so the content stays rich and AI-readable.

## Scope

- US 3.1 — Create/edit/delete User Story anchored to a Module (`FR-007`).
- US 3.2 — Attach one or more Acceptance Criteria to a US with ordered position (`FR-008`).
- US 3.3 — One-way Jira import: pull US + heuristic AC extraction by JQL (`FR-009`).
- US 3.4 — Markdown editor + render path for US.description and AC.description.

## Out of Scope (MVP)

- Bidirectional Jira sync (status pushes / field sync) — Phase 3.
- AC ordering via drag-handle UI (covered as basic input/integer position in MVP — fancier UX deferred).
- GitHub Issues / Linear import — Phase 3.

## Business Rules

- A User Story MUST belong to one Module; Module MUST belong to caller's Workspace.
- An Acceptance Criterion MUST belong to one User Story (no orphans).
- `external_id` (Jira issue key) MUST match `[A-Z]+-\d+` and is unique within Project.
- A User Story can be marked `ready_to_test` ONLY when it has ≥1 AC.
- Jira import is idempotent on `external_id` — re-running JQL never duplicates.

## Stories

- BK-13 — User Story CRUD (FR-007)
- BK-14 — Acceptance Criterion CRUD with position rebalance (FR-008)
- BK-15 — Markdown editor + render for US/AC bodies (US 3.4)
- BK-16 — Jira import (one-way pull, async job) (FR-009)

## Related Documentation

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003
- SRS: `.context/SRS/functional-specs.md` § FR-007, FR-008, FR-009
- Business map: `.context/business/business-data-map.md` (entity: user_stories, acceptance_criteria)
- API contract: `.context/SRS/api-contracts.yaml` (paths: /user-stories, /acceptance-criteria, /imports)


---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-14](https://upexgalaxy67.atlassian.net/browse/BK-14) | FR-007 User Story CRUD anchored to Module with Markdown body and optional Jira external_id | 1 | Medium | Backlog |
| [BK-15](https://upexgalaxy67.atlassian.net/browse/BK-15) | FR-008 Acceptance Criterion CRUD with position rebalance and ready_to_test gating | 1 | Medium | Backlog |
| [BK-16](https://upexgalaxy67.atlassian.net/browse/BK-16) | Markdown editor and sanitized render path for User Story and Acceptance Criterion bodies | 1 | Medium | Backlog |
| [BK-17](https://upexgalaxy67.atlassian.net/browse/BK-17) | FR-009 async one-way Jira import by JQL with ADF to Markdown conversion and idempotency on external_id | 1 | Medium | Backlog |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:04.767Z_
