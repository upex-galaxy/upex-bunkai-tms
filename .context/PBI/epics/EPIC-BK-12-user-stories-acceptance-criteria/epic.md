# EPIC: User Stories & Acceptance Criteria

**Jira Key:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 0

---

## Description

# EPIC BK-12 — User Stories & Acceptance Criteria

Maps PRD EPIC-BK-003 (US 3.1..3.4) and SRS FR-007..FR-009.

Authoring layer above the Project/Module hierarchy. Members capture business intent as ***User Stories (US)****, break each US into discrete ****Acceptance Criteria (AC)***, and one-way-import existing Stories from Jira. US and AC bodies are Markdown so content stays rich for humans and readable for AI agents.

## Wave

***Wave 2.5*** — User Stories + Acceptance Criteria. Bridges Wave 2 (Module hierarchy) and Wave 3 (ATC Library). Adds the US → AC chain that ATCs and Tests will later anchor to, plus the Markdown editor and the one-way Jira import path. See `.context/master-implementation-plan.md` §5.

## Scope

- US 3.1 — Create/edit/delete User Story anchored to a Module (`FR-007`).
- US 3.2 — Attach one or more Acceptance Criteria to a US with ordered position (`FR-008`).
- US 3.3 — One-way Jira import: pull US + heuristic AC extraction by JQL (`FR-009`).
- US 3.4 — Markdown editor + sanitized render path for US.description and AC.description.

## Out of scope (MVP)

- Bidirectional Jira sync (status push / field sync) — Phase 3.
- AC ordering via drag-handle UI — MVP uses integer `position` field, drag UX deferred.
- GitHub Issues / Linear import — Phase 3.

## Business rules

- A User Story MUST belong to one Module; the Module MUST belong to the caller's Workspace.
- An Acceptance Criterion MUST belong to one User Story (no orphans).
- `external_id` (Jira issue key) MUST match `^[A-Z]+-\d+$` and is unique within Project.
- A User Story can be marked `ready*to*test` ONLY when it has at least 1 AC.
- Jira import is idempotent on `external_id` — re-running the same JQL never duplicates rows.

## Stories

- ***BK-14*** — User Story CRUD anchored to Module (FR-007).
- ***BK-15*** — Acceptance Criterion CRUD with position rebalance and `ready*to*test` gating (FR-008).
- ***BK-16*** — Markdown editor + sanitized render path for US/AC bodies (US 3.4, supports FR-007 and FR-008).
- ***BK-17*** — Async one-way Jira import by JQL with ADF → Markdown conversion and idempotency on `external_id` (FR-009).

## Stack notes

MVP runs on the built stack: ***Next.js 15 App Router**** (API routes under `app/api/`) plus ****Supabase*** (Postgres 16, RLS, Auth, Realtime, Storage). The Jira import worker runs as a Supabase Edge Function on a cron schedule — no separate queue infrastructure for MVP. Markdown editor uses `react-markdown` + `remark-gfm` + `rehype-sanitize`; server-side sanitization through `sanitize-html`.

## Related documentation

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-003.
- SRS: `.context/SRS/functional-specs.md` § FR-007, FR-008, FR-009.
- Business data map: `.context/business/business-data-map.md` (entities `user*stories`, `acceptance*criteria`).
- API contract: `.context/SRS/api-contracts.yaml` (paths `/user-stories`, `/acceptance-criteria`, `/imports`).
- Master plan: `.context/master-implementation-plan.md` §5 Wave 3 (this epic is the bridging Wave 2.5).

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-14](https://upexgalaxy67.atlassian.net/browse/BK-14) | TMS-US | Manage user stories anchored to a module | - | Medium | Shift-Left QA |
| [BK-15](https://upexgalaxy67.atlassian.net/browse/BK-15) | TMS-AC | Manage criteria under a user story | - | Medium | Shift-Left QA |
| [BK-16](https://upexgalaxy67.atlassian.net/browse/BK-16) | Markdown Editor | Write and preview Markdown safely | - | Medium | Shift-Left QA |
| [BK-17](https://upexgalaxy67.atlassian.net/browse/BK-17) | Jira Import | Pull Jira issues by JQL | - | Medium | Ready For Dev |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:46.775Z_
