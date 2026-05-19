# Business Model — Bunkai

> Product: **Bunkai** (分解) — open-core Test Management System.
> Tagline (working): _"The art of breaking down a kata into its applications."_
> Status: vision locked. MVP scope cut. Stack tentatively Next.js + Supabase for cloud-validation MVP, with a planned migration to a self-hostable Docker Compose distribution.

---

## Problem Statement

Test Management Systems on the market today — **Xray, Zephyr Scale, TestRail, qTest** — are **document vaults with execution glued on top**. They store test cases. They do not enforce engineering discipline. The consequences are universal across QA teams:

1. **Test cases written without structure.** Pasos sueltos, validations unclear, no link to user story or acceptance criterion. The same step (`navigate to /login`) is duplicated across 40 test cases.
2. **Mantenimiento imposible.** When the product changes, nobody knows which tests are still valid. Test repositories rot release by release.
3. **Trazabilidad rota.** A manager asks "qué cubre esta historia?" and nobody can answer with certainty.
4. **Reports lie.** "80% of tests pass" tells you nothing about whether the tests validate what actually matters.
5. **Bug management is delegated to Jira.** TMSs hand off the moment something fails, so bug context (which ATC failed, what was the run state, which module concentrates defects) leaves the QA loop.

The deeper pain: **none of these tools teach QA engineering**. They are bóvedas. They let you do bad QA quickly. They do not push the team toward good practice.

Bunkai attacks the problem **from the data model**, not from the feature list. An ATC without a user story cannot exist. A test without ATCs cannot exist. A bug without a module cannot exist. The structure of the product teaches good QA simply by how it works.

---

## MVP Hypotheses to Validate

1. **QA engineers will adopt a TMS that forces structural traceability** (US → AC → ATC → Test → Run → Bug) instead of treating it as friction. Adoption signal: average ATCs created per user in week 1 > 10; retention week-4 > 40%.
2. **ATCs encadenables (atomic, reusable test components) eliminate duplication enough to justify migrating from Xray/Zephyr.** Adoption signal: ratio `tests / unique ATCs` trends below 1.0 within first 30 days (each ATC reused in >1 test).
3. **Open-source / self-hostable distribution unblocks fintech/healthtech/legaltech buyers that today refuse SaaS TMSs over data sovereignty.** Adoption signal: at least 20 self-hosted installs reported (GitHub stars, Docker Hub pulls, telemetry opt-in) in the first 60 days post-launch.

---

## Business Model Canvas

### 1. Customer Segments

| Segment | Description | Why |
|---|---|---|
| **Indie QA engineers + small QA-led teams** (2–10 QAs) | Power users who feel Xray/Zephyr friction daily | Community evangelists; install self-hosted, write blog posts, recommend at work |
| **Mid-market engineering orgs** (50–500 devs) | Teams running Jira + Xray/Zephyr today, frustrated by maintenance cost | Primary Cloud subscribers |
| **Regulated-industry enterprises** (fintech, healthtech, legaltech) | Teams that legally cannot put specs/test data on a third-party SaaS | Buyers of self-hosted Community + Enterprise license (SSO, audit log, support) |
| **QA-quality-engineering training audience** | Bootcamps, certification programs, Quality Engineering courses (incl. UPEX Galaxy) | Adoption pipeline — students learn QA on Bunkai and bring it to employers |

### 2. Value Propositions

- **Test maintenance becomes one-edit-many-tests.** Edit ATC-001 once; every test that chains it updates.
- **Structural traceability is enforced, not optional.** Every ATC anchors to a User Story + Acceptance Criterion. The product cannot accumulate orphan tests.
- **Three execution modes share one data model.** Manual, agentic (IA), and automated (CI/CD) all produce comparable runs against the same ATCs. A regression report can be alimentado by any mix of the three.
- **Native defect management.** Bugs live inside the test cycle, anchored to module + ATC + run; metrics fall out automatically (heatmap por módulo, tendencias). Optional Jira sync — not delegation.
- **API-first for AI operators.** REST + OpenAPI + CLI mean any external agent (Claude Code, scripts, custom IAs) can drive Bunkai. The intelligence lives outside the app, the app is the operating surface.
- **Open-source + self-hostable.** Data sovereignty is solved by ownership: clients install in their own infra. Removes the security-objection wall that closes SaaS TMS deals in regulated industries.
- **VS Code-feel.** Familiar to developers and testers; tree view + table view + mind-map view as first-class citizens; high density; dark mode first.

### 3. Channels

- **GitHub-led distribution.** Open-source repo + Docker Compose one-liner install. Forks, stars, contributions ARE the funnel.
- **Content-led inbound.** Blog posts and demos from the founder and early adopters. Every "Bankai vs Bunkai" conversation is a marketing event.
- **Conference talks + podcasts.** QA conferences (StarWest, EuroSTAR, QA Latam), DevOps and developer-productivity podcasts.
- **Integration with the UPEX Galaxy "Agentic Quality Engineering" course.** Students operate Bunkai during training and graduate as evangelists.
- **Bunkai Cloud landing page** (`bunkai.io/cloud`) for teams that want the hosted version.

### 4. Customer Relationships

- **Self-serve** for Community (self-hosted) — GitHub issues, Discord, docs.
- **Community-driven support** for hobbyists/indies — Discord + GitHub Discussions.
- **SLA-backed paid support** for Cloud and Enterprise tiers.
- **Co-creation with first 10 design-partners** for the MVP (close feedback loop, named in changelog).

### 5. Revenue Streams

**Open Core model (locked decision per founder conversation; previously listed as `pendiente a iterar` in vision doc — closed now).**

| Tier | Includes | Pricing model |
|---|---|---|
| **Bunkai Community** (self-hosted) | Full core: ATCs, tests, runs, bugs, tree + table + 2D mind-map views, REST API, CLI, basic dashboards | Free, open-source (Apache 2.0 or MIT — TBD before launch) |
| **Bunkai Cloud** | Same code, hosted by Bunkai — no infra work for the customer | Per-seat monthly subscription (price TBD: target ~$20–$30/seat/mo competitive vs Xray) |
| **Bunkai Enterprise** | Cloud or self-hosted + SSO/SAML, audit log, role hierarchy, integraciones enterprise (Jira Data Center, etc.), priority support, SLA | Annual commercial license (price TBD: target $X/org/year) |

Secondary revenue (post-PMF): marketplace for community-contributed integrations / ATC packs / dashboards.

### 6. Key Resources

- **The open-source codebase** (the moat is community trust, not code secrecy).
- **The founder's QA reputation** (UPEX Galaxy, Agentic Quality Engineering training).
- **The `agentic-qa-boilerplate` methodology** (KATA architecture, IQL principles) — Bunkai operationalizes it.
- **The Bunkai brand** (domain `bunkai.io`, defensive `bankai.io`, kanji wordmark).

### 7. Key Activities

- Building and maintaining the open-source core.
- Operating Bunkai Cloud (infra, billing, uptime, security).
- Documentation, examples, tutorials.
- Community management (GitHub issues, Discord, releases).
- Conference + content production.

### 8. Key Partners

- **Hosting / infra**: Vercel (frontend), Supabase (MVP DB), eventually Railway/Fly for self-hosted Cloud edition.
- **Auth**: TBD — Supabase Auth for MVP, migrable a Better Auth for the self-hostable edition.
- **Real-time + jobs**: TBD — Supabase Realtime + Redis (Upstash) for cloud, plain Redis in Docker for self-hosted.
- **Browser automation ecosystem** (Playwright, Cypress, Jest, JUnit) — adapters that import their results into Bunkai runs.
- **Jira (Atlassian)** — bidirectional sync for shops already on Jira; not a hard dependency.
- **UPEX Quality LLC** — initial legal/operational home of the project. Spin-out to a dedicated entity (Bunkai Inc / LLC) once revenue or fundraising justifies it (see `pendientes-a-iterar` below).

### 9. Cost Structure

- **Engineering time** (founder + 1–2 contributors for the MVP).
- **Cloud infra** — Vercel, Supabase, Upstash, Cloudflare R2 (for run evidence, screenshots, video).
- **Domains** — `bunkai.io`, `bankai.io`, optional `bunkai.tech`, `bunkai.qa`, `bunkai.tools`.
- **Auth + ops services** — Sentry, PostHog (also self-hostable so it stays aligned with the open-core ethos).
- **Marketing + conference travel** — once the product is shippable.
- **Legal** — open-source license review, eventual entity spin-out.

---

## Key Metrics (MVP)

- **Activation**: % of new workspaces that create at least 1 module + 1 ATC + 1 test within the first 24 hours.
- **Structural correctness**: % of ATCs that are anchored to a US and an AC (target: 100% — the data model should make this impossible to violate; metric exists to catch import paths or bug-fix loopholes).
- **Reuse ratio**: average tests-per-ATC. Should trend up over time; a flat 1.0 means users are still writing monolithic tests.
- **Three-mode adoption**: % of workspaces using ≥2 of {manual, agentic, automated} execution modes within 30 days.
- **Self-hosted adoption signal**: Docker Compose installs reported (telemetry opt-in) + GitHub stars / week.

---

## Pendientes a iterar (carried forward from vision doc)

- **Licensing**: Apache 2.0 vs MIT for the open-source core. Decide before public launch.
- **Identidad visual final**: logo + brand book. The current DESIGN.md captures palette + tipografía from the Claude Design mockup, but the marca pública needs a logo treatment beyond the wordmark.
- **Entidad legal**: start under UPEX Quality LLC vs spin out a Delaware C-Corp Bunkai Inc from day one. Per AI conversation: bootstrap under UPEX, schedule spin-out as explicit event if fundraising plan emerges in 12–18 months.
- **Integraciones concretas**: Jira (priority 1), GitHub (priority 1 for issues/PR linking), Playwright/Cypress/Jest/JUnit adapters (priority 1 for Mode 3), Linear (priority 2). The full integration matrix is open.
- **Go-to-market detail**: pricing for Cloud + Enterprise, launch sequence, design-partner program.
- **3D mind-map vs 2D-only**: vision doc lists 3D as principal feature; AI conversation downgrades 3D to "alternativa, no principal" because of usability cost. Resolution: 2D in MVP (React Flow), 3D as Phase 3 toggle.
