# Epic Tree

_Project: BK_

---

## [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) - Tenancy & Identity

**Status:** Planning | **Stories:** 5 | **Points:** 13

- [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2) Sign up and sign in with email (magic-link) _(5 pts, QA Approved)_
- [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3) Sign up and sign in via OAuth (GitHub / Google) _(8 pts, Ready For Dev)_
- [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4) Create a Workspace _(- pts, Ready For QA)_
- [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5) Invite a teammate to a Workspace with role assignment _(- pts, Ready For QA)_
- [BK-6](https://upexgalaxy67.atlassian.net/browse/BK-6) Switch between Workspaces I belong to _(- pts, Ready For QA)_

## [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) - Project & Module Hierarchy

**Status:** Planning | **Stories:** 4 | **Points:** 5

- [BK-8](https://upexgalaxy67.atlassian.net/browse/BK-8) Create a Project inside a Workspace _(5 pts, Ready For Dev)_
- [BK-9](https://upexgalaxy67.atlassian.net/browse/BK-9) Create Modules (with nested sub-modules) inside a Project _(- pts, Shift-Left QA)_
- [BK-10](https://upexgalaxy67.atlassian.net/browse/BK-10) Rename and soft-delete a Module (with cascade) _(- pts, Shift-Left QA)_
- [BK-11](https://upexgalaxy67.atlassian.net/browse/BK-11) Move a Module to a different parent (with cycle-detection + path rebuild) _(- pts, Shift-Left QA)_

## [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) - User Stories & Acceptance Criteria

**Status:** Planning | **Stories:** 4 | **Points:** 0

- [BK-14](https://upexgalaxy67.atlassian.net/browse/BK-14) User Story CRUD anchored to Module (Markdown body, optional Jira external_id) _(- pts, Shift-Left QA)_
- [BK-15](https://upexgalaxy67.atlassian.net/browse/BK-15) Acceptance Criterion CRUD with position rebalance and ready_to_test gating _(- pts, Shift-Left QA)_
- [BK-16](https://upexgalaxy67.atlassian.net/browse/BK-16) Markdown editor and sanitized render path for User Story and Acceptance Criterion bodies _(- pts, Shift-Left QA)_
- [BK-17](https://upexgalaxy67.atlassian.net/browse/BK-17) Async one-way Jira import by JQL (ADF → Markdown, idempotency on external_id) _(- pts, Ready For Dev)_

## [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) - ATC Library (Atomic Test Components)

**Status:** Planning | **Stories:** 6 | **Points:** 5

- [BK-18](https://upexgalaxy67.atlassian.net/browse/BK-18) ATC create + edit REST API (POST/PATCH /atcs, transactional steps + assertions) _(5 pts, Ready For Dev)_
- [BK-19](https://upexgalaxy67.atlassian.net/browse/BK-19) ATC creation UI (multi-step builder + assertion builder) _(- pts, Shift-Left QA)_
- [BK-20](https://upexgalaxy67.atlassian.net/browse/BK-20) ATC search + autocomplete (FTS + ts_rank + recency decay) _(- pts, Shift-Left QA)_
- [BK-21](https://upexgalaxy67.atlassian.net/browse/BK-21) ATC edit propagation (cascade replace, version bump, affected_test_ids) _(- pts, Shift-Left QA)_
- [BK-22](https://upexgalaxy67.atlassian.net/browse/BK-22) ATC usage report ("Used in N tests") _(- pts, Shift-Left QA)_
- [BK-23](https://upexgalaxy67.atlassian.net/browse/BK-23) ATC duplicate (clone steps + assertions, title suffix "(copy)") _(- pts, Shift-Left QA)_

## [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) - Tests (chains of ATCs)

**Status:** Planning | **Stories:** 4 | **Points:** 4

- [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27) As a QA Engineer I want to assemble a Test by chaining ATCs from my workspace so that I can run the validations together when verifying a User Story _(1 pts, Shift-Left QA)_
- [BK-28](https://upexgalaxy67.atlassian.net/browse/BK-28) As a QA Engineer I want to reorder the ATCs inside an existing Test so that I can fix the sequence after seeing it does not match the User Story flow _(1 pts, Shift-Left QA)_
- [BK-32](https://upexgalaxy67.atlassian.net/browse/BK-32) As a QA Engineer, I want to open a Test and see every chained ATC expanded in order with its steps and assertions so that I can review exactly what will be validated before running it. _(1 pts, Shift-Left QA)_
- [BK-33](https://upexgalaxy67.atlassian.net/browse/BK-33) As a QA Engineer, I want to assign tags to a Test, including the reserved smoke, sanity, and regression tags, so that my Tests are grouped and filtered into the right suites. _(1 pts, Shift-Left QA)_

## [BK-29](https://upexgalaxy67.atlassian.net/browse/BK-29) - Bunkai TMS — Credenciales de Acceso para Testing (DB / API / UI)

**Status:** Backlog | **Stories:** 0 | **Points:** 0

## [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) - Manual Execution & Runs

**Status:** Planning | **Stories:** 6 | **Points:** 6

- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34) As a QA Engineer, I want to start a manual run of a Test in a chosen environment so that I get a fresh step-by-step checklist to execute. _(1 pts, Shift-Left QA)_
- [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35) As a QA Engineer, I want to mark each step pass, fail, or block with notes and evidence so that ATC verdicts and run progress update as I execute. _(1 pts, Shift-Left QA)_
- [BK-36](https://upexgalaxy67.atlassian.net/browse/BK-36) As a QA Engineer, I want to abort a run in progress with a reason so that remaining steps are skipped and the run is closed as aborted. _(1 pts, Shift-Left QA)_
- [BK-37](https://upexgalaxy67.atlassian.net/browse/BK-37) As a QA Engineer, I want to see a Test's past runs newest first, filterable by outcome so that I can compare results and spot flaky areas. _(1 pts, Shift-Left QA)_
- [BK-38](https://upexgalaxy67.atlassian.net/browse/BK-38) As a QA Lead, I want to filter all project runs by date, module, status, and executor type with pass/fail totals so that I can report what we executed quickly. _(1 pts, Shift-Left QA)_
- [BK-39](https://upexgalaxy67.atlassian.net/browse/BK-39) As a QA Engineer, I want to finish a run with a final passed or failed verdict so that any still-pending steps are clearly marked skipped. _(1 pts, Shift-Left QA)_

## [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) - Bugs & Defect Heatmap

**Status:** Planning | **Stories:** 4 | **Points:** 4

- [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40) As a QA Engineer, I want to file a defect from a failing run step with module, severity, steps and evidence pre-filled so that the defect is captured without retyping. _(1 pts, Shift-Left QA)_
- [BK-41](https://upexgalaxy67.atlassian.net/browse/BK-41) As a QA Engineer, I want to list and filter defects by module, status and severity with counts so that I can focus on a given area. _(1 pts, Shift-Left QA)_
- [BK-42](https://upexgalaxy67.atlassian.net/browse/BK-42) As a QA Lead, I want to view a defect heatmap with count and week-over-week trend per module so that I can see at a glance where quality is degrading. _(1 pts, Shift-Left QA)_
- [BK-43](https://upexgalaxy67.atlassian.net/browse/BK-43) As a QA Lead, I want defects filed in Bunkai to sync automatically and one-way to the external tracker so that engineering works them in their existing tool. _(1 pts, Shift-Left QA)_

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:53.840Z_
