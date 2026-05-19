# MVP Scope — Bunkai

> Cut: validate the tesis "ATCs encadenables + estructura obligatoria + ejecución manual en vivo" on Bunkai Cloud (Next.js + Supabase) before investing in self-hosted distribution, mind-map view, semantic search, agentic mode, or CI/CD adapters.
> Source: `executive-summary.md`, `user-personas.md`, `business-model.md`, and the vision conversation's "Dentro del MVP" / "Fase 2" / "Fase 3" cuts.

---

## 1. In Scope (Must Have)

7 epics. Each user story is high-level; formal Functional Requirements are mapped 1:1 in `.context/SRS/functional-specs.md`.

### EPIC-BK-001 — Tenancy & Identity

- **US 1.1**: As a new user, I want to sign up with email (or via GitHub / Google OAuth) so I can access Bunkai.
- **US 1.2**: As an authenticated user, I want to create a Workspace (organization) so my team's data is isolated from other tenants.
- **US 1.3**: As a Workspace owner, I want to invite teammates by email and assign them a role (owner / admin / member / viewer) so access is controlled.
- **US 1.4**: As an authenticated user, I want to switch between Workspaces I belong to so I can serve multiple clients/teams.

### EPIC-BK-002 — Project & Module Hierarchy

- **US 2.1**: As a Workspace member, I want to create a Project inside a Workspace so I can keep different applications/products under their own roof.
- **US 2.2**: As a Project member, I want to define Modules (and nested sub-modules) so the test repository is organized by product area (Login, Payment, Dashboard, ...). The Module is a real entity, not a folder name.
- **US 2.3**: As a Project member, I want to rename / move / delete a Module so the structure stays accurate as the product evolves.

### EPIC-BK-003 — User Stories & Acceptance Criteria

- **US 3.1**: As a Project member, I want to create User Stories (US) anchored to a Module so test work has a business context.
- **US 3.2**: As a Project member, I want to attach one or more Acceptance Criteria (AC) to a User Story so each behavior can be tested individually.
- **US 3.3**: As a Project member, I want to import User Stories from Jira (one-way pull in MVP) so I don't re-type what already exists in Jira.
- **US 3.4**: As a Project member, I want to write US and AC in Markdown so the content is rich and AI-readable.

### EPIC-BK-004 — ATC Library (Atomic Test Components)

- **US 4.1**: As a QA, I want to create an ATC anchored to a User Story and at least one AC so every ATC has provenance.
- **US 4.2**: As a QA, I want each ATC to have: title, module, layer (UI / API / Unit), ordered steps, assertions, tags so it is reusable across tests.
- **US 4.3**: As a QA, I want to search ATCs by name and module (textual autocomplete) so I can find what I already wrote.
- **US 4.4**: As a QA, I want to edit an ATC and have every Test that chains it reflect the change automatically so maintenance is a one-edit-many-tests operation.
- **US 4.5**: As a QA, I want to see "Used in N tests" on each ATC so I know its blast radius before editing it.
- **US 4.6**: As a QA, I want to duplicate an ATC as a starting point for a similar one so I don't write boilerplate twice.

> Out of MVP: semantic search of ATCs (pgvector + embeddings) — ships Phase 2.

### EPIC-BK-005 — Tests as ATC Chains

- **US 5.1**: As a QA, I want to create a Test that is an ordered chain of ATCs (not free-form steps) so the data model enforces reuse.
- **US 5.2**: As a QA, I want to drag-reorder ATCs inside a Test so the flow is clear.
- **US 5.3**: As a QA, I want to view a Test in "expanded" mode where every ATC's steps render inline as a single readable script.
- **US 5.4**: As a QA, I want to tag tests as smoke / sanity / regression so I can run subsets later.

### EPIC-BK-006 — Manual Execution + Runs

- **US 6.1**: As a QA, I want to start a Run of a Test by selecting target environment + executor identity (myself) so the run is attributed.
- **US 6.2**: As a QA, I want to step through each ATC's steps one by one marking pass / fail / block with optional notes + evidence (URL or pasted screenshot) so I produce a trustworthy record.
- **US 6.3**: As a QA, I want to abort a Run mid-execution if blocked, with reason captured, so partial data is preserved.
- **US 6.4**: As a QA, I want to see the full history of Runs for a given Test (date, executor, duration, status) so I can spot flaky tests.
- **US 6.5**: As a QA Lead, I want to filter Runs by date range / Module / status across the whole Project so I can read trends.

> Out of MVP: agentic execution (WebSocket protocol for AI executors) — ships Phase 2. CI/CD import (Playwright/Cypress/Jest/JUnit JSON adapters) — ships Phase 2.

### EPIC-BK-007 — Bugs (native defect management)

- **US 7.1**: As a QA, I want to file a Bug from inside a Run with mandatory fields (title, module, severity P1–P4, ATC that failed, steps to reproduce, description) so context is captured at the source.
- **US 7.2**: As a Project member, I want to see all Bugs filtered by Module so I can spot defect concentration.
- **US 7.3**: As a Project member, I want a basic Bug heatmap by Module (count + tendency over time) so dashboards exist from day one.
- **US 7.4**: As a Project member, I want to (optionally) sync a Bug to Jira creating a Jira issue with backlinks both ways so the existing process is not broken.

---

## 2. Additional MVP infrastructure user stories (cross-cutting)

### EPIC-BK-008 — Views (Tree + Table) & Search

- **US 8.1**: As a user, I want a tree view (file-explorer style) of the current Project showing Modules / Sub-modules / User Stories / ATCs / Tests with status dots so I navigate the way I navigate a code repo.
- **US 8.2**: As a user, I want a table view of any entity type (ATCs, Tests, Runs, Bugs) with column-level filters, sort, and bulk-edit (status, tags, module) so I work densely.
- **US 8.3**: As a user, I want a global command palette (Cmd/Ctrl+K) for navigation and primary actions ("create ATC", "go to Run #42", "filter bugs in Payment module") so I never reach for the mouse.
- **US 8.4**: As a user, I want to switch between views without losing filter state so context persists.

> Out of MVP: mind-map / graph view (Phase 2 — React Flow 2D). 3D toggle (Phase 3).

### EPIC-BK-009 — API + CLI Foundation

- **US 9.1**: As an operator (AI / script / CI), I want a REST API published as an OpenAPI 3.1 spec at `/api/openapi.json` so I can introspect the surface.
- **US 9.2**: As an operator, I want Bearer-token auth (workspace-scoped, scoped tokens) with token revocation so I can drive Bunkai non-interactively.
- **US 9.3**: As an operator, I want CRUD endpoints for Modules / US / AC / ATC / Test / Run / Bug so I can build external workflows.
- **US 9.4**: As a Bunkai admin, I want a minimal `bunkai` CLI (`auth login`, `atc list`, `run import`, `run start`) so the command-line is usable from day one.

> Out of MVP: WebSocket bidirectional protocol for agentic runs (Phase 2). GraphQL for the mind-map view (Phase 2 if needed).

---

## 3. Out of Scope (Nice to Have — Phase 2 / 3)

### Phase 2 (post-validation, no later than ~6 months after MVP)

- **Mind-map / graph view** (React Flow 2D) over entities (Module ↔ US ↔ AC ↔ ATC ↔ Test ↔ Bug).
- **Semantic search of ATCs** (pgvector + embeddings) — "encuentra ATCs parecidos a 'login con token expirado'".
- **Agentic execution mode** — WebSocket / SSE protocol for AI executors that report step-by-step in real time.
- **Automated execution import** — JSON adapters for Playwright, Cypress, Jest, JUnit, plus a Bunkai-native JSON schema.
- **Configurable dashboards** — drag-and-drop metric widgets, exportable as PNG/PDF.
- **Self-hosted distribution** — Docker Compose bundle (Postgres + Redis + MinIO + Better Auth) — the open-source community edition.
- **Test Plans** — saved subsets of tests (smoke / sanity / regression) with scheduled runs.

### Phase 3 (post-PMF)

- **3D mind-map** (react-force-graph over Three.js) as a toggle on top of 2D.
- **Native parameterization editors** — UI builders for equivalence partitions, boundary values, decision tables, state transitions.
- **Bidirectional Jira sync** (status pushes + label/field sync), GitHub Issues sync, Linear sync.
- **Bunkai Enterprise features** — SSO/SAML (Okta, Azure AD, Google Workspace), audit log, role hierarchy with custom permissions, Jira Data Center support, priority SLA support.
- **Marketplace** for community-contributed ATC packs, dashboard templates, adapters.
- **In-app pattern teaching** — the app surfaces hints when it detects an opportunity to apply equivalence partitioning, boundary-value analysis, or other techniques on a parameterized ATC.

---

## 4. Success Criteria for MVP

The MVP is "shippable" when:

- [ ] All 9 epics' user stories pass acceptance testing in staging.
- [ ] Authentication + workspace tenancy work end-to-end with at least 2 production-like workspaces (founder + first design-partner).
- [ ] The first design-partner can create a Project, 5 Modules, 20 User Stories, 100 ATCs, 30 Tests, and execute a regression of ≥10 tests manually in one work day.
- [ ] OpenAPI spec is consumed by an external CLI without manual schema patching.
- [ ] The defect heatmap renders correctly with seeded data and updates within 5s of a new Bug.
- [ ] Bug-from-run flow captures all mandatory fields without manual re-entry.
- [ ] Performance NFRs (see `.context/SRS/non-functional-specs.md`) hold under a load test of 500 ATCs, 100 Tests, 20 concurrent users.
- [ ] Documentation (Getting Started, ATC Authoring Guide, API quickstart) is publishable.

Launch conditions for opening Cloud signup beyond design-partners:

- [ ] Adoption metrics from design-partner cohort meet thresholds in `executive-summary.md` §3.
- [ ] No P0/P1 bugs open.
- [ ] Pricing decision locked (per-seat Cloud + Enterprise floor).
- [ ] Status page live.
