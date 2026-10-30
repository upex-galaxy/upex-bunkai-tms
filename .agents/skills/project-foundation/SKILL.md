---
name: project-foundation
description: 'Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SRS + API contracts), and Discovery (business data map + API architecture + dev guide). On an existing app (adopted, or code with no PRD/SRS) it runs Discovery only, read from the code: maps + dev guide + domain glossary, never an invented PRD/SRS. Triggers on: `ideando un nuevo producto`, `define el PRD`, `construir la constitución del proyecto`, `mapear arquitectura del sistema`, `definir SRS`, `user personas`, `user journeys`, `MVP scope`, `business data map`, `api architecture discovery`, `project dev guide`, `constituir el proyecto desde cero`, `dev guide and glossary for this existing app`, `documentar la app existente`, `foundation for an adopted app`. Do NOT use for: infrastructure scaffolding (use `/project-bootstrap`), backlog seeding (use `/product-management`), per-story development (use `/sprint-development`), unit testing (use `/unit-testing`), or formal QA workflows (out of scope here).'
license: MIT
compatibility: [claude-code, codex, opencode]
phase: foundation
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the "Anti-patterns" section in the body below.
compact_rules: |
  - **F1.** NEVER rewrite the project Constitution, PRD, or SRS from scratch when prior versions exist under `.context/`. Always UPSERT — preserve existing decisions, surface diffs, refine in place.
  - **F2.** NEVER fabricate user personas, market data, or competitor analysis. If the user has no research, surface the gap as a `[PLACEHOLDER]` open TODO and ask — speculative personas mislead every downstream skill.
  - **F3.** NEVER conflate PRD scope with SRS architecture. PRD answers WHAT and WHY (problem, users, journeys, MVP cut); SRS answers HOW (functional contracts, NFRs, tech stack, API definitions). Cross-contamination breaks traceability.
  - **F4.** NEVER skip Phase 4 Discovery (`/project-context data`, `/project-context features`, `/project-context api`, `project-dev-guide`). Downstream skills (`/product-management`, `/sprint-development`) assume those running-mental-model docs exist.
  - **F5.** NEVER hardcode tool choices (DB engine, hosting provider, auth vendor, framework) in the Constitution. Tool selection lives in SRS architecture — Constitution stays vendor-agnostic so the SRS can change without invalidating the strategic anchor.
  - **F6.** NEVER define personas, problem statements, or KPIs without quoting evidence (user interview, analytics snapshot, stakeholder ask, market data citation). Evidence-free claims look authoritative and mislead the PRD downstream.
  - **F7.** NEVER produce a PRD without an explicit out-of-scope section. Implicit scope boundaries always leak; missing out-of-scope is the #1 source of mid-sprint argumentation.
  - **F8.** NEVER leave the SRS architecture's hard-to-reverse decisions undocumented. Seed the foundational ones as ADRs in `.context/ADR/` (per `agentic-dev-core/references/adr-doctrine.md`) so later sessions don't re-litigate or silently violate them. Status per `adr-doctrine.md` §3 step 4: a decision the human already approved is `Accepted` from the start (cite the approval); only a still-open one is `Proposed`.
  - **F9.** NEVER run Phases 1-3 to manufacture a Constitution, PRD or SRS for an app whose code already exists (`.template/installer.lock.json` → `adopted: true`, or the user asks to document an existing app). Its foundation is Phase 4 Discovery alone, read from the code ("Existing app: Discovery-only foundation"); a missing PRD / SRS there is not a gap to fill.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).
metadata:
  kind: workflow
  stage_owner: true
  requires_capabilities: [db]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Project Foundation — Product definition orchestrator

`project-foundation` orchestrates the one-time, up-front definition of a product: **why** we are building it (Constitution), **what** we are building (Architecture: PRD + SRS), and **how the system maps to its world** (Discovery). It produces the documents every later skill assumes already exist.

It is invoked once per project at inception, before any infrastructure scaffolding (`/project-bootstrap`) or backlog seeding (`/product-management`). Re-invoke individual phases if scope changes substantially mid-project.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md` — used when dispatching subagents to research market data, audit competitors, or interview users.
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-foundation/`, archive on completion.
- `agentic-dev-core/references/adr-doctrine.md` — Phase 3 only: which architectural decisions earn an ADR + how to seed the first batch into `.context/ADR/`.

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a project-foundation workflow. Read in order; stop earlier when the phase you're driving is small enough that later inputs add no signal. Several inputs are optional at inception — surface a `missing_input` note rather than fabricating content.

1. Stakeholder brief or initial PRD draft — whatever the user provides as the seed for this foundation pass (paste, doc link, voice-memo transcript, etc.).
2. `.context/PRD/` — existing PRD outputs if a prior version exists. UPSERT semantics: re-invoking a phase refines what's there; it does NOT rewrite from scratch.
3. `.context/business/` — existing personas, business model, market context if prior research exists. Surface what's there; never invent replacements.
4. Market context / competitor research artifacts the user provides (links, PDFs, analyst notes). Optional but high-leverage for Constitution Phase 1.
5. `.agents/project.yaml` — project identity (project name, key, domain, env URLs). Created or refined as part of this foundation pass when missing.

---

## When to use

Use this skill when:

- A new product/project is being defined from scratch and you need Constitution + PRD + SRS + Discovery artifacts.
- An existing project needs to redefine scope significantly (e.g. pivot, new MVP cut) and the foundation docs must be regenerated.
- A specific section is missing or stale (e.g. user journeys haven't been written yet) — invoke just that phase via the Specific tasks table below.
- An existing app (adopted through `/project-adoption`, or code with no PRD / SRS) needs its foundation: run Phase 4 Discovery only, per "Existing app: Discovery-only foundation" below.

Do NOT use this skill to:

- Scaffold the codebase (backend / frontend / OpenAPI / auth) — that's `/project-bootstrap`.
- Seed the Jira backlog with epics + stories — that's `/product-management`.
- Plan or implement an individual user story — that's `/sprint-development`.
- Set up unit tests — that's `/unit-testing`.
- Run formal QA workflows (test plans, exploratory testing, automation) — out of scope here.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 0.5 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-foundation/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

## Phase 0 — Resume check (MANDATORY, inline)

Before any subagent dispatch and before invoking any phase below, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/project-foundation/progress.md` exists.
2. If it does NOT exist → proceed to Phase 0.5 (write `plan.md`).
3. If it DOES exist:
   1. Read `.session/project-foundation/plan.md` in full.
   2. Read the tail of `.session/project-foundation/progress.md` (last ~3 phase entries).
   3. Surface to the user: plan Goal (one sentence), last completed phase + timestamp, next planned phase, any blocking notes.
   4. Offer three options and WAIT for input: **resume** (jump to the next planned phase) / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-project-foundation-project-aborted/`, then proceed to Phase 0.5 fresh) / **abort** (leave directory untouched, stop).

Phase 0 is inline — no subagent dispatch. The check fires even on first invocation so resume-vs-fresh is deterministic.

## Phase 0.5 — Write `plan.md`

After Phase 0 confirms no prior session exists, write `.session/project-foundation/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6. The plan must capture which sub-deliverables the user picked across Constitution / PRD / SRS / Discovery:

- Frontmatter: `topic_key: session/project-foundation/project/plan`, `skill: project-foundation`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` · `## Approach` · `## Phase breakdown` (Phase 1 Constitution → Phase 2 PRD → Phase 2.5 DESIGN handoff → Phase 3 SRS → Phase 4 Steps 1–6, with dispatch pattern per row) · `## Risks & open questions` · `## Verification checklist` · `## Cross-references`.

**Hand-off note (required in `## Cross-references`)**: Phase 2.5 hands off to the separate `/design-system` skill, which owns its own `.session/design-system/` directory. The Phase 4 sub-steps that delegate to `project-context` modes (`/project-context data`, `/project-context features`, `/project-context api`, `/project-context master-plan`) each manage their own progress checkpoints inline; this skill's `progress.md` records the orchestrator-level "delegated → returned" entries only.

Dispatch: a Single planner subagent is typical when Constitution + PRD inputs are substantial (the orchestrator inline-drafts the plan only when scope is tiny).

After `plan.md` is written and the user approves the scope, transition `status: draft → approved` in the frontmatter and proceed to Phase 1 (Constitution) in the "Phase walkthrough" below.

## Phase walkthrough

The skill covers four sequential phases (1 Constitution → 2 PRD → 3 SRS → 4 Discovery), with the Phase 2.5 hand-off to `/design-system` between PRD and SRS. Each phase has multiple sub-deliverables; read only the references your current task needs.

> **Progress checkpoint**: after each of Phase 1 (Constitution), Phase 2 (PRD), Phase 2.5 (DESIGN handoff return), Phase 3 (SRS), and Phase 4 Steps 1–6 completes, the orchestrator appends a phase entry to `.session/project-foundation/progress.md` per `agentic-dev-core/references/session-management.md` §7.

### 1. Constitution (Why we're building this)

The constitution captures the rationale for the product before any scope decisions are made: the problem worth solving, who it serves, how it monetizes, and the competitive context it lives in. Without this, the PRD has no anchor.

- Read `references/constitution-business-model.md` for the canvas template (problem, solution, value prop, customer segments, channels, revenue model, cost structure, key metrics).
- Read `references/constitution-market-context.md` for industry positioning, competitive analysis, and trends.

Output: `.context/business/business-model.md` and `.context/business/market-context.md` (or wherever your project keeps strategic context).

### 2. Architecture: PRD (Product Requirements Document)

The PRD turns the constitution into a buildable product spec. It defines the problem statement formally, names the target users, slices the MVP, and traces the user journeys end-to-end.

- Read `references/prd-executive-summary.md` for problem statement, solution overview, success KPIs, MVP success metrics.
- Read `references/prd-personas.md` for target users, demographics, jobs-to-be-done, pain points.
- Read `references/prd-mvp-scope.md` for epic breakdown, must-have / should-have / could-have user stories, MVP cut.
- Read `references/prd-user-journeys.md` for happy paths, alternate flows, and edge cases per persona.

Output: `.context/PRD/*.md` files (one per sub-deliverable, or a consolidated `prd.md`).

### 2.5 Design system (Visual identity)

Before closing Architecture and dropping to the SRS, invoke `/design-system` to produce `DESIGN.md` at the project root. This persists the product's visual identity (palette, typography, spacing, components) in a portable format consumable by every downstream agent, and replaces the legacy interactive Q&A buried inside `frontend-setup.md`.

- Hand off to `/design-system` (default path = `npx getdesign` + LLM-matcher driven by Constitution + PRD inputs).
- Skip when `DESIGN.md` already exists at root and the user did not request a rebrand.
- See `.agents/skills/design-system/SKILL.md` for the five available paths (getdesign default, manual gallery, Open Design app, Claude Design handoff, LLM-authored custom).

Why here (post-PRD, pre-SRS): the visual identity co-evolves with product ideation, and some architecture decisions (motion-rich Framer Motion stack vs. plain Tailwind; rich-media stack vs. minimal) flow from the design system. Producing `DESIGN.md` before the SRS lets Phase 3 consume it as input.

Output: `DESIGN.md` at the project root (or the path configured under `design_md_path` in `.agents/project.yaml`).

### 3. Architecture: SRS (Software Requirements Specification)

The SRS turns the PRD into a technical contract: formal functional requirements, non-functional constraints, system architecture decisions, and the API contract. This is the input `/project-bootstrap` consumes to scaffold the codebase.

- Read `references/srs-functional.md` for formal functional requirements (one section per epic, traceable to PRD user stories).
- Read `references/srs-non-functional.md` for performance, security, scalability, reliability, accessibility NFRs.
- Read `references/srs-architecture.md` for system architecture diagram, tech stack rationale, data model, deployment topology.
- Read `references/srs-api-contracts.md` for OpenAPI endpoint definitions per domain.

**Seed the first ADRs.** The architecture phase is where the most hard-to-reverse decisions are made (auth model, data-access pattern, error/response contract, tenancy, deployment topology, framework choices with lock-in). After `srs-architecture.md` is drafted, promote each decision that passes the two-gate test (architectural **and** hard to reverse) into a standalone `ADR-NNNN-<slug>.md` under `.context/ADR/`, then reference them from the architecture doc. Follow `agentic-dev-core/references/adr-doctrine.md` (detection + authoring) and `.context/ADR/README.md` (template + lifecycle). Status: a decision the human already approved (it is in the PRD/SRS they signed off) is written `Accepted`, naming that approval; a still-open one is `Proposed`.

Output: `.context/SRS/*.md` files, plus the seeded `.context/ADR/ADR-NNNN-*.md` records and an updated `.context/ADR/README.md` index.

### 4. Discovery (Codify the system mental model)

Discovery produces the running-mental-model docs every later skill loads at session start: the entity map, the feature inventory, the API map, and a conversational dev guide. Together they make a fresh AI session productive on day one.

Phase 4 is an **orchestrator** with six steps: it delegates to four `project-context` modes (each invocable on its own from any session as `/project-context <mode>`) and runs two steps in-skill, the dev guide (Step 4) and the domain glossary (Step 6). Re-running individual modes later (after schema or feature changes) is the supported maintenance flow.

**Step 1 — Business data map** (entities, business flows, state machines, automatic processes, external integrations):

- Invoke skill `project-context` mode `data`.
- Pointer: `references/business-data-map.md`.
- Output: the data map inside `business-data-context` (`references/business-data-map.html`).

**Step 2 — Business feature map** (feature inventory by domain, CRUD matrix, endpoint catalog, UI component inventory, third-party integrations, feature flags):

- Invoke skill `project-context` mode `features`.
- Soft gate: Step 1 should be done first (the command will surface a warning if the data map (`business-data-context`) is still a placeholder but will not block).
- Output: the feature map inside `business-feature-context` (`references/business-feature-map.html`).

**Step 3 — Business API map** (auth model, critical user journeys traced through API call chains, architecture behind the API, integrations at the API boundary):

- Invoke skill `project-context` mode `api`.
- Pointer: `references/api-architecture.md` (kept under the legacy name for grep-stability; the command writes the API map inside `business-api-context` instead of the legacy `api-architecture.md`).
- Soft gates: Steps 1 and 2 inform but do not block.
- Output: the API map inside `business-api-context` (`references/business-api-map.html`).

**Step 4 — Project dev guide** (conversational onboarding guide for any developer — human or AI — joining the project):

- Read `references/project-dev-guide.md` and execute it in-skill (this one has no `project-context` mode — its content is unique to the foundation flow).
- Hard prerequisite: the data map from Step 1 is generated (`bun run context:map business-data-context` prints sections, not the placeholder notice).
- Output: `.context/business/project-dev-guide.md`.

**Step 5 — Master implementation plan** (bonus: roadmap of all features to build, dependency-cascaded and value-prioritized — the natural synthesis of Steps 1–3):

- Invoke skill `project-context` mode `master-plan`.
- Hard gate: the data map from Step 1 is generated (`bun run context:map business-data-context` prints sections, not the placeholder notice).
- Soft gate: the feature map from Step 2 is generated (`bun run context:map business-feature-context`).
- Output: `.context/master-implementation-plan.md`.
- This step is **recommended but optional**. Skip it if the user has not yet defined product scope (e.g. greenfield where only the constitution exists). Re-invoke later, after `/product-management` has seeded the backlog, to align the master plan with the planned epics.

**Step 6 — Domain glossary** (canonical domain terminology — the single vocabulary every later artifact must speak):

- Runs **once**. Seed it from the PRD (personas, product terms) and the SRS when they exist, the business maps (Steps 1–3), and existing ADRs (an existing app adds the sources listed under "Existing app: Discovery-only foundation").
- Output: `.context/business/domain-glossary.md` with this section structure: §0 read-first clarification of the most-confused term (optional), §1 Core acronyms table (term → expansion → one-line definition), §2 Methodology terms, §3 Product entities (short forms pointing to the data map in `business-data-context` for detail), §4 Anti-glossary (banned/ambiguous terms → correct replacement → why), §5 Change protocol (glossary updated FIRST in the same PR; glossary wins doc conflicts; Jira content must match it).
- Hand-maintained and **append-only** afterwards (like ADRs) — re-running `/project-foundation` NEVER regenerates it. If the file already exists, skip this step with a note.
- Every domain term used later in Jira content, docs, code comments, and UI copy must match this glossary.

**Final Phase 4 outputs:**

- the data map inside `business-data-context` (`references/business-data-map.html`)
- the feature map inside `business-feature-context` (`references/business-feature-map.html`)
- the API map inside `business-api-context` (`references/business-api-map.html`)
- `.context/business/project-dev-guide.md`
- `.context/master-implementation-plan.md` (if Step 5 ran)
- `.context/business/domain-glossary.md` (Step 6; skipped when it already exists)

On successful completion of Phase 4 (Verification checklist from `plan.md` passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/project-foundation/` to `.session/.archive/<YYYY-MM-DD>-project-foundation-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back.

---

## Existing app: Discovery-only foundation

An app whose code already exists has no product to define: its foundation is what the code does, written down. The business maps, the dev guide and the domain glossary ARE its product docs, and `/sprint-development` accepts them in place of a PRD / SRS (its Pre-requisites).

**When it applies**: `.template/installer.lock.json` records `adopted: true` (the same key `project-context` reads), or the user asks to document an existing app that has no `.context/PRD/` / `.context/SRS/` content. A project that has a PRD / SRS keeps the full chain above, unchanged.

**What changes**:

| Phase | Existing app |
|---|---|
| 1 Constitution, 2 PRD, 3 SRS | not run (F9). A team that already holds real product docs may hand them in; nothing is invented to fill a phase |
| 2.5 Design system | not run from here: `DESIGN.md` from the live theme is `/design-system extract`, optional, its own skill |
| 4 Steps 1-3, 5 | the `project-context` modes, which read the code and the `stack:` block (`project-context` → "Stack parameters"). `/project-adoption` hands off `/project-context refresh-all` first: a map that `bun run context:map <skill> --list` already shows generated is not regenerated, only refreshed through its own mode when stale |
| 4 Step 4 dev guide | reverse-engineered: folder layout, conventions and commands come from the app's code, `package.json` and the `stack:` block, never from this boilerplate's defaults |
| 4 Step 6 glossary | seeded from the maps, the code's identifiers, the live UI copy, existing ADRs and the tracker's epic names; skipped when the file exists |

**Capability `db`** is optional on this path: the data map reads the schema per `{{stack.database.schema_source}}` (`migrations` = the files, offline; `{{stack.database.engine}}` = `none` = no database), so a project with no DB MCP or no access to the live database is a Discovery Gap the data map names, never a STOP.

**Inputs**: the seed is the code, not a stakeholder brief; Inputs #1 and #4 above are optional. Phase 0.5 writes the plan with `discovery-only` in `## Approach` and Phase 4 alone in `## Phase breakdown`. **Hand-offs**: `/product-management` for the backlog and `/sprint-development` per story; never `/project-bootstrap` base phases on an existing app.

---

## Specific tasks — which reference to read

| User intent                                                      | Read                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "constitución del proyecto" / "business model canvas"            | `references/constitution-business-model.md`                              |
| "análisis de mercado" / "market context" / "competitivo"         | `references/constitution-market-context.md`                              |
| "executive summary del PRD" / "problem statement" / "KPIs"       | `references/prd-executive-summary.md`                                    |
| "user personas" / "perfiles de usuario" / "target users"         | `references/prd-personas.md`                                             |
| "MVP scope" / "epic breakdown" / "must-have stories"             | `references/prd-mvp-scope.md`                                            |
| "user journeys" / "happy path" / "edge cases" / "flujos"         | `references/prd-user-journeys.md`                                        |
| "design system" / "DESIGN.md" / "paleta" / "branding"            | hand off to `/design-system` (Phase 2.5)                                 |
| "functional requirements" / "SRS funcional" / "FR formales"      | `references/srs-functional.md`                                           |
| "NFR" / "performance/security/scalability" / "no funcional"      | `references/srs-non-functional.md`                                       |
| "system architecture" / "tech stack" / "diagrama de sistema"     | `references/srs-architecture.md`                                         |
| "record an ADR" / "architecture decision record" / "decisión de arquitectura" | `agentic-dev-core/references/adr-doctrine.md` + `.context/ADR/README.md` |
| "API contracts" / "OpenAPI" / "endpoints definition"             | `references/srs-api-contracts.md`                                        |
| "business data map" / "entity model" / "mapa de negocio"         | invoke `/project-context data` (pointer: `references/business-data-map.md`) |
| "business feature map" / "feature inventory" / "CRUD matrix"     | invoke `/project-context features`                                           |
| "API architecture discovery" / "endpoint catalog" / "auth model" | invoke `/project-context api` (pointer: `references/api-architecture.md`)   |
| "project dev guide" / "guía de desarrollo" / "onboarding"        | `references/project-dev-guide.md`                                        |
| "master implementation plan" / "what to build first" / "roadmap" | invoke `/project-context master-plan`                                     |

If the user intent does not match a row exactly, identify the closest phase (Constitution / PRD / SRS / Discovery) and fall back to the most relevant reference, surfacing in the report that no exact match was found.

---

## Subagent dispatch

Phases 1 → 2 → 3 → 4 are **logically sequential** (each phase consumes output from the previous), but sub-deliverables WITHIN a phase are often independent and parallel-friendly:

- **Phase 2 (PRD)**: `prd-personas`, `prd-user-journeys`, `prd-mvp-scope` can run in parallel after `prd-executive-summary` is drafted.
- **Phase 3 (SRS)**: `srs-functional`, `srs-non-functional`, `srs-architecture`, `srs-api-contracts` can run in parallel once the PRD is locked.
- **Phase 4 (Discovery)**: Steps 1–3 run one at a time in the `project-context` dependency order, `data` → `features` → `api` (canonical list: `project-context` SKILL.md → "`refresh-all` dependency order"): `features` and `api` read the data map, and every mode closes its own approval gate before the next starts. Step 4 (`project-dev-guide`) needs only Step 1 and may run alongside Steps 2–3. Step 5 (`/project-context master-plan`) is the synthesis after Steps 1–3. Step 6 (domain glossary, in-skill) seeds from the PRD, the SRS and the maps of Steps 1–3, and closes the phase.

Use the parallel dispatch pattern from `agentic-dev-core/references/dispatch-patterns.md`. Each subagent briefing must follow the 7-component template in `agentic-dev-core/references/briefing-template.md` and cite the specific reference file the subagent must read.

For research-heavy tasks (market sizing, competitor audits, persona interviews) dispatch a single subagent with web/search tools rather than running the research from the main conversation.

---

## Hand-offs

When the foundation is solid, the natural next steps are:

- **Infrastructure scaffolding** → `/project-bootstrap`. Turns the SRS architecture + API contracts into a working backend + frontend skeleton.
- **Seed the product backlog** → `/product-management`. Turns the PRD MVP scope into Jira epics, user stories, and refined acceptance criteria.
- **(Eventually) implement stories** → `/sprint-development`. The per-story planning → code → review → deploy loop, only after `/project-bootstrap` is done.

Foundation output is **not** code — it is documentation. The output is "ready for `/project-bootstrap`", not "ready for production".

---

## Verification

After running any phase, confirm:

- The deliverables for that phase exist at the expected paths under `.context/`.
- Each document follows the structure specified in the corresponding reference file (sections, headings, tables).
- Cross-references are wired: PRD personas appear in user journeys; SRS functional requirements trace to PRD epics; API contracts trace to SRS architecture decisions.
- `bun run vars:check` does not surface new unresolved `{{VAR}}` references introduced by the new docs.

If a section is left as `[PLACEHOLDER]` because the user could not yet answer (e.g. no real user-research data exists), surface it in the report as an open TODO rather than inventing content.

---

## Anti-patterns — NEVER do these

- **F1.** NEVER rewrite the project Constitution, PRD, or SRS from scratch when prior versions exist under `.context/`. Always UPSERT — preserve existing decisions, surface diffs, refine in place.
- **F2.** NEVER fabricate user personas, market data, or competitor analysis. If the user has no research, surface the gap as a `[PLACEHOLDER]` open TODO and ask — speculative personas mislead every downstream skill.
- **F3.** NEVER conflate PRD scope with SRS architecture. PRD answers WHAT and WHY (problem, users, journeys, MVP cut); SRS answers HOW (functional contracts, NFRs, tech stack, API definitions). Cross-contamination breaks traceability.
- **F4.** NEVER skip Phase 4 Discovery (`/project-context data`, `/project-context features`, `/project-context api`, `project-dev-guide`). Downstream skills (`/product-management`, `/sprint-development`) assume those running-mental-model docs exist.
- **F5.** NEVER hardcode tool choices (DB engine, hosting provider, auth vendor, framework) in the Constitution. Tool selection lives in SRS architecture — Constitution stays vendor-agnostic so the SRS can change without invalidating the strategic anchor.
- **F6.** NEVER define personas, problem statements, or KPIs without quoting evidence (user interview, analytics snapshot, stakeholder ask, market data citation). Evidence-free claims look authoritative and mislead the PRD downstream.
- **F7.** NEVER produce a PRD without an explicit out-of-scope section. Implicit scope boundaries always leak; missing out-of-scope is the #1 source of mid-sprint argumentation.
- **F8.** NEVER leave the SRS architecture's hard-to-reverse decisions undocumented. Seed the foundational ones as ADRs in `.context/ADR/` (per `agentic-dev-core/references/adr-doctrine.md`) so later sessions don't re-litigate or silently violate them. Status per `adr-doctrine.md` §3 step 4: a decision the human already approved is `Accepted` from the start (cite the approval); only a still-open one is `Proposed`.
- **F9.** NEVER run Phases 1-3 to manufacture a Constitution, PRD or SRS for an app whose code already exists (`.template/installer.lock.json` → `adopted: true`, or the user asks to document an existing app). Its foundation is Phase 4 Discovery alone, read from the code ("Existing app: Discovery-only foundation"); a missing PRD / SRS there is not a gap to fill.

---

## Notes

- This skill is **one-time per project**. If scope changes significantly mid-project, re-invoke specific phases (e.g. only `references/prd-mvp-scope.md` to re-cut the MVP).
- Several reference files are written in Spanish (preserved from the original prompts). The skill orchestrator (this file) is in English; subagents should mirror the user's language when reporting results.
- This skill consumes `{{PROJECT_NAME}}`, `{{PROJECT_KEY}}`, `{{WEBAPP_DOMAIN}}` from `.agents/project.yaml`. If `.agents/project.yaml` is missing, the agentic layer is not installed: `bunx create-agentic-dev@latest <name>` for a new project, `bunx create-agentic-dev@latest --adopt` then `/project-adoption` for an existing app (`agentic-dev-core` → Install model).
- The discovery step delegates to four `project-context` modes (`/project-context data`, `/project-context features`, `/project-context api`, `/project-context master-plan`) plus two in-skill steps: the dev guide (`references/project-dev-guide.md`) and the domain glossary (Step 6). All are intentionally agnostic of stack and work on either greenfield projects (where they ENCODE decisions) or brownfield projects (where they REVERSE-ENGINEER existing code). Re-invoke an individual command directly when only one artifact needs refreshing — there's no need to re-run the whole foundation.
