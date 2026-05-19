# Executive Summary — Bunkai PRD

> **Product**: Bunkai (分解) — open-core Test Management System.
> **Tech stack (MVP)**: Next.js 15 (App Router) + Supabase (PostgreSQL, Auth, Realtime, Storage) + Vercel + GitHub Actions.
> **Distribution targets**: (1) Bunkai Cloud (hosted), (2) Bunkai Community self-hosted via Docker Compose (Phase 2 retrofit), (3) Bunkai Enterprise (SSO/SAML/audit) — same code, license-gated features.
> **Source documents**: `.context/business/business-model.md`, `.context/business/market-context.md`.

---

## 1. Problem Statement

Existing Test Management Systems (Xray, Zephyr Scale, TestRail, qTest) are **document vaults with execution glued on top**. Their data model treats each test case as a monolithic blob of free-form steps stored in a folder. The consequences are universal across QA teams:

- Steps are duplicated across dozens of tests (`navigate to /login` copied into 40 places). A URL change is a 40-file edit.
- Traceability between User Story, Acceptance Criterion, Test, Run, and Bug is "a free-text field if you remember to fill it". Nobody fills it. The link rots.
- Reports show "80% passing" without telling anybody what those 80% actually validate.
- Bugs are delegated to Jira the moment something fails. Defect context (module, failing ATC, run state) escapes the QA loop.
- Regulated industries (fintech, healthtech, legaltech) cannot put their test data into a third-party SaaS — they either pay enterprise licensing for Data Center editions or build internal hacks.

**The deeper problem**: today's TMSs are neutral. They let bad QA happen efficiently. They do not push teams toward engineering discipline.

## 2. Solution Overview

Bunkai is a TMS whose **data model enforces structure** so good QA is the path of least resistance, not an upsell.

Core MVP features (the 30% that differentiates Bunkai from "another CRUD of test cases"):

- **ATCs (Atomic Test Components)** — reusable, atomic units of verification, mandatory-anchored to a User Story + Acceptance Criterion, scoped to a Module. The library of ATCs becomes the team's most valuable artifact.
- **Tests = ordered chains of ATCs**, not free-form step lists. Edit ATC-001 once; every test that uses it updates. Duplication is structurally impossible.
- **Workspace → Project → Module hierarchy** for multi-tenant data and feature partitioning. Module is a first-class entity with its own metrics, not a folder name.
- **Tree view (file-explorer style) + Table view** as equal-citizen views over the same data. (Mind-map / graph view ships Phase 2; 3D toggle Phase 3.)
- **Manual execution** in MVP — step-by-step runner with pass/fail/block, evidence notes, bug reporting in-place.
- **Native bug management** anchored to Module + ATC + Run. Optional Jira sync (not delegation).
- **REST API + OpenAPI spec + minimal CLI** — designed so external operators (AIs, scripts, CI) can drive Bunkai. Foundation for the agentic and CI/CD execution modes that ship Phase 2.
- **Aesthetic**: VS Code-inspired — dark mode default, high information density, monospace where IDs live, command palette, kanji wordmark.

## 3. Success Metrics (MVP)

| Category | Metric | Target |
|---|---|---|
| **Adoption** | Workspaces that complete activation (≥1 Module + ≥1 ATC + ≥1 Test + ≥1 Run in first 24h) | ≥60% of new sign-ups |
| **Engagement** | Avg ATCs created per active workspace in week 1 | >10 |
| **Engagement** | Tests-per-ATC ratio (reuse) at day 30 | <1.0 (each ATC reused in >1 test) |
| **Retention** | Week-4 retention of new workspaces | >40% |
| **Structural correctness** | % of ATCs anchored to a US + AC (data-model guarantee, monitored as canary) | 100% |
| **Distribution signal** | GitHub stars within 60 days of open-source launch | >500 |
| **Distribution signal** | Docker Compose installs reported via opt-in telemetry within 60 days | >20 |

KPIs above are MVP-cycle targets. Business KPIs (paying Cloud workspaces, Enterprise license deals, ARR) live in the Business Model doc and are tracked post-MVP.

## 4. Target Users (brief — full personas in `user-personas.md`)

| Persona | One-liner | Primary pain |
|---|---|---|
| **Elena — Senior QA Engineer / Quality Engineer** | The protagonist user; lives in the tool daily; writes ATCs and runs tests | Maintenance cost of duplicated steps; broken trazabilidad in current TMS |
| **Mateo — QA Lead / Quality Engineering Manager** | Plans coverage, reads dashboards, presents to stakeholders | Cannot answer "what does sprint X cover?" without an hour of manual work |
| **Sara — Developer collaborating with QA** | Opens Bunkai occasionally to check what's covered, link tests to user stories, see bug context | Switches between Jira, Xray, GitHub PR, console logs — needs one place to see "is my feature tested?" |

(A fourth persona — **Karim, an autonomous AI test agent** — is documented in `user-personas.md` because Bunkai's API surface makes it a real and intentional consumer.)

## 5. Non-goals for MVP

- Mind-map / graph view of relationships (Phase 2).
- 3D mind-map (Phase 3).
- Semantic search of ATCs via pgvector (Phase 2).
- Agentic execution mode end-to-end protocol (Phase 2 — API surface lands in MVP).
- Automated execution import adapters for Playwright/Cypress/Jest/JUnit (Phase 2).
- SSO/SAML, audit log, role hierarchy (Phase 3 — Enterprise).
- Self-hosted Docker Compose distribution (Phase 2 — MVP validates the model on Cloud).
- Native parameterization UI editors (decision tables, equivalence partitions) (Phase 3).
- Marketplace for community-contributed ATC packs (post-PMF).
