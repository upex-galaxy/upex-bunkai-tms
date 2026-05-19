# Product Backlog — Epic Tree

## Overview

- **Total Epics (planned):** 9
- **Total User Stories (planned after INVEST slicing):** ~46
- **Project Code:** BK
- **Jira Project:** Bunkai TMS — https://upexgalaxy67.atlassian.net/jira/software/projects/BK
- **Source of truth:** `.context/PRD/mvp-scope.md` + `.context/SRS/functional-specs.md`
- **Default priority for all stories this session:** Medium
- **Default story points this session:** unset (refined in 3-amigos session later)

> This file is a planning snapshot — only the epics marked **Scheduled (Wave 1)** are created in Jira during the current session. Future waves are listed here so the dependency chain is visible end-to-end.

---

## Epic Hierarchy

### EPIC 1 — Tenancy & Identity  **[Created — Wave 1 — BK-1]**

- **Jira Key:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1)
- **Priority:** Medium (default — refined later)
- **Description:** Account sign-up (email magic-link + OAuth providers), Workspace creation, member invitations with role assignment, and Workspace switching. Owns the multi-tenant boundary that every other entity in Bunkai is scoped under.
- **PRD reference:** EPIC-BK-001 in `mvp-scope.md`
- **FR mapping:** FR-001 … FR-004 in `functional-specs.md`

**User Stories (5 — after slicing US 1.1):**

1. [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2) — Sign up + sign in with email (magic-link)
2. [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3) — Sign up + sign in via OAuth (GitHub / Google)
3. [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4) — Create a Workspace
4. [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5) — Invite teammates by email with role assignment
5. [BK-6](https://upexgalaxy67.atlassian.net/browse/BK-6) — Switch between Workspaces

**Slicing notes:**
- US 1.1 of the PRD bundles email + OAuth → split into two stories (independent integrations, distinct edge cases, distinct providers).
- US 1.2/1.3/1.4 stay atomic.

---

### EPIC 2 — Project & Module Hierarchy  **[Created — Wave 1 — BK-7]**

- **Jira Key:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7)
- **Priority:** Medium
- **Description:** Projects inside a Workspace, Modules (and nested sub-modules) as first-class entities (not folders) under a Project. Includes rename / soft-delete / move with cycle-detection.
- **PRD reference:** EPIC-BK-002 in `mvp-scope.md`
- **FR mapping:** FR-005, FR-006

**User Stories (4 — after slicing US 2.3):**

1. [BK-8](https://upexgalaxy67.atlassian.net/browse/BK-8) — Create a Project inside a Workspace
2. [BK-9](https://upexgalaxy67.atlassian.net/browse/BK-9) — Create Modules (with nested sub-modules)
3. [BK-10](https://upexgalaxy67.atlassian.net/browse/BK-10) — Rename and soft-delete a Module (with cascade)
4. [BK-11](https://upexgalaxy67.atlassian.net/browse/BK-11) — Move a Module to a different parent (with cycle-detection)

**Slicing notes:**
- US 2.3 of the PRD bundles rename / move / delete → split: rename + delete (CRUD-shallow) is independent from move (cycle-detection + path rebuild — the heavy bit).

---

### EPIC 3 — User Stories & Acceptance Criteria  **[Wave 2 — future session]**

- **PRD reference:** EPIC-BK-003 — FR-007, FR-008, FR-009
- **Estimated stories:** 4 (US CRUD, AC CRUD, Jira import, Markdown rendering)
- **Blocked by:** EPIC-BK-001, EPIC-BK-002

### EPIC 4 — ATC Library  **[Wave 2 — future session]**

- **PRD reference:** EPIC-BK-004 — FR-010 … FR-014
- **Estimated stories:** 6 (after slicing — ATC create may split UI from API)
- **Blocked by:** EPIC-BK-003

### EPIC 5 — Tests as ATC Chains  **[Wave 3 — future session]**

- **PRD reference:** EPIC-BK-005 — FR-015 … FR-018
- **Estimated stories:** 4
- **Blocked by:** EPIC-BK-004

### EPIC 6 — Manual Execution + Runs  **[Wave 3 — future session]**

- **PRD reference:** EPIC-BK-006 — FR-019 … FR-024
- **Estimated stories:** 6
- **Blocked by:** EPIC-BK-005

### EPIC 7 — Bugs  **[Wave 4 — future session]**

- **PRD reference:** EPIC-BK-007 — FR-025 … FR-028
- **Estimated stories:** 4
- **Blocked by:** EPIC-BK-006 (file-bug-from-run flow needs Runs)

### EPIC 8 — Views (Tree + Table) & Search  **[Wave 4 — future session]**

- **PRD reference:** EPIC-BK-008 — FR-029 … FR-032
- **Estimated stories:** 4
- **Blocked by:** EPIC-BK-004 (needs ATC tree data to render)

### EPIC 9 — API + CLI Foundation  **[Wave 4 — future session]**

- **PRD reference:** EPIC-BK-009 — FR-033 … FR-036
- **Estimated stories:** 4
- **Blocked by:** EPIC-BK-001 (Bearer-token auth scoped per-Workspace)

---

## Epic Prioritization

### Wave 1 — Foundation (current session)

1. EPIC-BK — Tenancy & Identity
2. EPIC-BK — Project & Module Hierarchy

### Wave 2 — Test Repository (next)

3. EPIC-BK — User Stories & Acceptance Criteria
4. EPIC-BK — ATC Library

### Wave 3 — Execution Loop

5. EPIC-BK — Tests as ATC Chains
6. EPIC-BK — Manual Execution + Runs

### Wave 4 — Closing the MVP

7. EPIC-BK — Bugs
8. EPIC-BK — Views & Search
9. EPIC-BK — API + CLI Foundation

---

## Backlog Conventions

- **Custom fields** (from `.agents/jira-fields.json`):
  - `customfield_10141` — ✅ Acceptance Criteria (Gherkin)
  - `customfield_10142` — Scope ⛳ (In / Out)
  - `customfield_10134` — 🚩 Business Rules Specification
  - `customfield_10161` — 🧬 WORKFLOW
  - `customfield_10186` — Mockup 🎴
  - `customfield_10159` — Weblink (URL) 🌍️
  - `customfield_10035` — Story Points (left empty this session per user request)
- **Labels** applied to every issue this session: `mvp`, `wave-1`
- **Acceptance criteria format:** Gherkin (Scenario / Given / When / Then) — minimum 3 scenarios per story (1 happy path + ≥2 edge / error).
- **Story slicing rule:** INVEST. Split when a PRD-listed US bundles independent integrations, distinct edge surfaces, or exceeds estimated ~8 SP.

---

## Next Steps

1. Create EPIC-BK-001 in Jira → capture key → mkdir `EPIC-BK-{N}-tenancy-identity/` → write `epic.md`.
2. Create the 5 stories of EPIC-BK-001 in Jira → mkdir each `STORY-BK-{N}-{slug}/` → write `story.md`.
3. Update EPIC-BK-001's `epic.md` with real story IDs.
4. Repeat for EPIC-BK-002 (4 stories).
5. Commit `.context/PBI/` + persist a memory observation closing Wave 1.

Future sessions resume from Wave 2 by re-invoking `/product-management` with the `add-feature.md` or `epic-creation.md` reference depending on whether ATC/US epics are added one-by-one or in a batch.
