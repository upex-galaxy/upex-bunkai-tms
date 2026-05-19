# Market Context — Bunkai

> Industry: developer tools / engineering productivity, Test Management System (TMS) subcategory.
> Positioning: open-core, self-hostable, structurally-opinionated TMS for QA engineering teams that resent the bóvedas-de-documentos approach of Xray/Zephyr/TestRail/qTest.

---

## Competitive Landscape

### Top 3 (4) direct competitors

| Competitor | Strengths | Weaknesses / gaps Bunkai exploits |
|---|---|---|
| **Xray (Atlassian Marketplace)** | Deep Jira integration, mature, enterprise-known, large user base in regulated industries | Test cases are monolithic — no ATC concept. Reuse impossible without copy-paste. Bug delegation to Jira (no native lifecycle). SaaS-locked or Data Center licensing only; no open-source self-host path. UI is dated. No agentic execution mode. |
| **Zephyr Scale / Zephyr Squad** | Established Jira marketplace presence, decent reporting | Same monolithic-test problem. Same bug-delegation pattern. Cloud-only SaaS (Smartbear). Worse extensibility than Xray. No agentic / no API-first story. |
| **TestRail (Gurock / Idera)** | Standalone (no Jira dependency required), known for reporting + dashboards | Monolithic test cases. Bug management is minimal — still delegated. Closed-source SaaS or self-hosted commercial license. No open-source distribution. Workflow is rigid. |
| **qTest / Tricentis qTest** | Enterprise-grade, deep Tricentis ecosystem integrations | Heavyweight, expensive, enterprise-sales-led — wrong shape for indie / mid-market QA. Same monolithic-test problem. Closed-source. |

### Adjacent / indirect

- **Playwright / Cypress / Jest reporters** — solve only the automated-test reporting side. Not a TMS; do not manage manual or agentic runs.
- **Notion / Confluence + spreadsheets** — what teams use when they refuse the cost/friction of a proper TMS. Surprisingly common; Bunkai's free Community edition targets exactly this audience.
- **Behave / Cucumber / Gherkin tools** — solve specification, not management. Compatible, not competitive.
- **Allure / ReportPortal** — focused on reporting + aggregation. ReportPortal is open-source and self-hostable; closest open-source neighbor, but it is a reporting backend, not a TMS.

### Bunkai's differentiation (the why-now)

1. **ATC as a reusable, atomic, anchored unit** — no competitor offers this as a first-class data-model primitive. Xray/Zephyr/TestRail treat steps as fields inside a test, not as entities.
2. **Three execution modes (manual + agentic + automated) on one model** — no competitor supports the agentic mode as a first-class citizen, and none unifies the three streams in one regression report.
3. **API + CLI designed for AI operators** — competitors offer APIs but as afterthoughts. Bunkai's API is the surface, not a side door.
4. **Open-source + self-hostable** — solves the regulated-industry data-sovereignty objection that closes Xray/Zephyr deals.
5. **Filosofía editorial** — Bunkai teaches QA engineering by structure (mandatory traceability, mandatory module anchoring, native defect categorization). Competitors are neutral tools that let bad practice persist.
6. **VS Code-first ergonomics** — high density, file-tree primary view, command palette, dark-mode default. Built for the developer + tester who already lives in VS Code.

---

## Market Opportunity

### Size (orders of magnitude — speculative; refine before fundraising)

- **TAM** (Total Addressable Market — global software-testing-tools market): ~USD 50B+ by 2030 (broad category includes execution, automation, performance, security; sources: industry trackers like Gartner, MarketsAndMarkets — figures vary widely, treat as directional).
- **SAM** (test management tools specifically): roughly low-single-digit billions USD; concentrated in Xray, Zephyr, TestRail, qTest.
- **SOM** (initial reachable): low-tens-of-millions USD if Bunkai captures the indie / mid-market segment frustrated by Xray pricing + monolithic tests, plus the regulated-industry self-hosted niche.

> **Confidence**: low — these are speculative ranges. Replace with bottom-up sizing (per-seat × seats × penetration) once the design-partner cohort gives real data.

### Growth tendencies

- **QA-as-engineering-discipline** is gaining vocabulary (Quality Engineering, Shift-left, Shift-right) — buyers increasingly value tools that enforce discipline, not just store documents.
- **AI in QA** is rising fast — agentic test execution and AI-driven test authoring are no longer fringe. Tools that natively expose API surfaces for IAs to operate will leapfrog the SaaS incumbents that bolted AI as a chatbot.
- **Open-source dev tools** have repeatedly displaced closed SaaS incumbents in adjacent categories (Sentry, PostHog, Plane vs Jira/Linear, Grafana vs Datadog at the dashboard layer). The pattern is proven; the question is execution.
- **Data sovereignty pressure** in fintech, healthtech, legaltech, government — EU AI Act, US sector regulations — pushes regulated buyers toward self-hostable tooling. Existing TMS incumbents cannot pivot without rebuilding their distribution model.

### Barriers to entry

- **Network effects are mild for TMSs** — favoring a challenger, since incumbents do not lock customers via network value.
- **Switching cost from Xray/Zephyr is real but bounded** — migrations are painful (rewrites of monolithic tests into ATCs) but linear in test count, not exponential. Tooling for one-click import will accelerate.
- **Atlassian Marketplace distribution moat** — Xray and Zephyr benefit hugely from being inside Jira's plugin economy. Bunkai's counter is independence from Jira (Jira becomes optional sync), plus Open-Source-driven distribution that bypasses marketplaces entirely.
- **Trust / brand** — Xray and TestRail have a decade of enterprise references. Bunkai needs design-partner case studies and visible community traction before it can compete on enterprise procurement floors.

---

## Trends & Insights

### Technological

- **Agentic AI is operational, not experimental.** Tools like Claude Code, Cursor, and bespoke QA agents (Playwright-driven) are actually running test suites in production. A TMS that does not treat agents as first-class executors will look prehistoric within 18 months.
- **OpenAPI-as-AI-interface.** AIs read OpenAPI specs natively. A clean OpenAPI surface is now a distribution channel, not just developer ergonomics. Bunkai's API-first posture is timed correctly.
- **pgvector and on-disk embeddings** make semantic search affordable for self-hosted tools. ATC similarity search ("encuentrame ATCs parecidos a 'login con token expirado'") is feasible without an external embeddings API.

### Market / behavioral

- **Shift from "QA team writes tests" to "engineers + QA + AI co-author tests".** Bunkai's editor with autocomplete + semantic ATC search is built for this collaboration mode.
- **Maintenance, not authoring, is the cost driver.** Buyers are realizing that the cost of a test suite is its half-life. Tools that compress maintenance (ATC reuse, one-edit-many-tests) win on TCO arguments.
- **Open-source as procurement-friendly.** Procurement and InfoSec teams that historically blocked SaaS purchases now accept open-source self-hosted tools without the same scrutiny.
- **Developer-experience-first SaaS** (Linear, Vercel, Supabase) has retrained the dev/tester audience to expect speed, density, keyboard-first ergonomics. Xray/Zephyr feel slow and old next to that bar. Bunkai's VS-Code-feel ergonomics is the table stakes, not the differentiator.

---

## Positioning Statement

> For QA and Quality Engineering teams that are tired of TMSs that store documents but do not enforce discipline, Bunkai is an open-source Test Management System whose data model makes good QA inevitable — atomic reusable ATCs anchored to user stories, three unified execution modes (manual, agentic, automated), native defect management, and an API-first surface built for AI operators. Unlike Xray, Zephyr, and TestRail, Bunkai is self-hostable, open-source, and structurally opinionated — the tool teaches quality engineering by how it works.
