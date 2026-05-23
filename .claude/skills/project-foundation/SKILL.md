---
name: project-foundation
description: 'Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SRS + API contracts), and Discovery (business data map + API architecture + dev guide). Triggers on: `ideando un nuevo producto`, `define el PRD`, `construir la constitución del proyecto`, `mapear arquitectura del sistema`, `definir SRS`, `user personas`, `user journeys`, `MVP scope`, `business data map`, `api architecture discovery`, `project dev guide`, `constituir el proyecto desde cero`. Do NOT use for: infrastructure scaffolding (use `/project-bootstrap`), backlog seeding (use `/product-management`), per-story development (use `/sprint-development`), unit testing (use `/unit-testing`), or formal QA workflows (out of scope here).'
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: foundation
complementary_categories:
  - creativity
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
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-foundation/`, archive on completion.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any phase below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`creativity`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this foundation work? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents (Constitution, PRD, SRS, Discovery), inject a `## Composable Skills` block per strategy doc §6.2.

Expected matches (illustrative — actual list depends on what the user has installed):

| Category     | Likely matches                                                                      |
| ------------ | ----------------------------------------------------------------------------------- |
| `creativity` | T4 ASK: `brainstorming` — useful for persona generation, user journeys, MVP scoping |

Skip step only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

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

Do NOT use this skill to:

- Scaffold the codebase (backend / frontend / OpenAPI / auth) — that's `/project-bootstrap`.
- Seed the Jira backlog with epics + stories — that's `/product-management`.
- Plan or implement an individual user story — that's `/sprint-development`.
- Set up unit tests — that's `/unit-testing`.
- Run formal QA workflows (test plans, exploratory testing, automation) — out of scope here.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-foundation/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

## Phase 0 — Resume check (MANDATORY, inline)

Before any subagent dispatch and before invoking any phase below, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/project-foundation/progress.md` exists.
2. If it does NOT exist → proceed to Phase 1 (write `plan.md`).
3. If it DOES exist:
   1. Read `.session/project-foundation/plan.md` in full.
   2. Read the tail of `.session/project-foundation/progress.md` (last ~3 phase entries).
   3. Surface to the user: plan Goal (one sentence), last completed phase + timestamp, next planned phase, any blocking notes.
   4. Offer three options and WAIT for input: **resume** (jump to the next planned phase) / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-project-foundation-project-aborted/`, then proceed to Phase 1 fresh) / **abort** (leave directory untouched, stop).

Phase 0 is inline — no subagent dispatch. The check fires even on first invocation so resume-vs-fresh is deterministic.

## Phase 1 — Write `plan.md`

After Phase 0 confirms no prior session exists, write `.session/project-foundation/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6. The plan must capture which sub-deliverables the user picked across Constitution / PRD / SRS / Discovery:

- Frontmatter: `topic_key: session/project-foundation/project/plan`, `skill: project-foundation`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` · `## Approach` · `## Phase breakdown` (Phase 1 Constitution → Phase 2 PRD → Phase 2.5 DESIGN handoff → Phase 3 SRS → Phase 4 sub-steps 1–5, with dispatch pattern per row) · `## Risks & open questions` · `## Verification checklist` · `## Cross-references`.

**Hand-off note (required in `## Cross-references`)**: Phase 2.5 hands off to the separate `/design-system` skill, which owns its own `.session/design-system/` directory. The Phase 4 sub-steps that delegate to standalone commands (`/business-data-map`, `/business-feature-map`, `/business-api-map`, `/master-implementation-plan`) each manage their own progress checkpoints inline; this skill's `progress.md` records the orchestrator-level "delegated → returned" entries only.

Dispatch: a Single planner subagent is typical when Constitution + PRD inputs are substantial (the orchestrator inline-drafts the plan only when scope is tiny).

After `plan.md` is written and the user approves the scope, transition `status: draft → approved` in the frontmatter and proceed to Phase 2 (the existing "Phase walkthrough" below).

## Phase walkthrough

The skill covers three sequential phases. Each phase has multiple sub-deliverables; read only the references your current task needs.

> **Progress checkpoint**: after each of Phase 1 (Constitution), Phase 2 (PRD), Phase 2.5 (DESIGN handoff return), Phase 3 (SRS), and Phase 4 sub-steps 1–5 completes, the orchestrator appends a phase entry to `.session/project-foundation/progress.md` per `agentic-dev-core/references/session-management.md` §7.

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
- See `.claude/skills/design-system/SKILL.md` for the five available paths (getdesign default, manual gallery, Open Design app, Claude Design handoff, LLM-authored custom).

Why here (post-PRD, pre-SRS): the visual identity co-evolves with product ideation, and some architecture decisions (motion-rich Framer Motion stack vs. plain Tailwind; rich-media stack vs. minimal) flow from the design system. Producing `DESIGN.md` before the SRS lets Phase 3 consume it as input.

Output: `DESIGN.md` at the project root (or the path configured under `design_md_path` in `.agents/project.yaml`).

### 3. Architecture: SRS (Software Requirements Specification)

The SRS turns the PRD into a technical contract: formal functional requirements, non-functional constraints, system architecture decisions, and the API contract. This is the input `/project-bootstrap` consumes to scaffold the codebase.

- Read `references/srs-functional.md` for formal functional requirements (one section per epic, traceable to PRD user stories).
- Read `references/srs-non-functional.md` for performance, security, scalability, reliability, accessibility NFRs.
- Read `references/srs-architecture.md` for system architecture diagram, tech stack rationale, data model, deployment topology.
- Read `references/srs-api-contracts.md` for OpenAPI endpoint definitions per domain.

Output: `.context/SRS/*.md` files.

### 4. Discovery (Codify the system mental model)

Discovery produces the running-mental-model docs every later skill loads at session start: the entity map, the feature inventory, the API map, and a conversational dev guide. Together they make a fresh AI session productive on day one.

Phase 4 is now an **orchestrator** — it delegates to four standalone commands (each invocable on its own from any session) plus the one in-skill reference for the dev guide. Re-running individual commands later (after schema or feature changes) is the supported maintenance flow.

**Step 1 — Business data map** (entities, business flows, state machines, automatic processes, external integrations):

- Invoke the `/business-data-map` command.
- Pointer: `references/business-data-map.md`.
- Output: `.context/business/business-data-map.md`.

**Step 2 — Business feature map** (feature inventory by domain, CRUD matrix, endpoint catalog, UI component inventory, third-party integrations, feature flags):

- Invoke the `/business-feature-map` command.
- Soft gate: Step 1 should be done first (the command will surface a warning if `business-data-map.md` is missing but will not block).
- Output: `.context/business/business-feature-map.md`.

**Step 3 — Business API map** (auth model, critical user journeys traced through API call chains, architecture behind the API, integrations at the API boundary):

- Invoke the `/business-api-map` command.
- Pointer: `references/api-architecture.md` (kept under the legacy name for grep-stability; the command writes `business-api-map.md` instead of the legacy `api-architecture.md`).
- Soft gates: Steps 1 and 2 inform but do not block.
- Output: `.context/business/business-api-map.md`.

**Step 4 — Project dev guide** (conversational onboarding guide for any developer — human or AI — joining the project):

- Read `references/project-dev-guide.md` and execute it in-skill (this one has no standalone command — its content is unique to the foundation flow).
- Hard prerequisite: `.context/business/business-data-map.md` from Step 1.
- Output: `.context/business/project-dev-guide.md`.

**Step 5 — Master implementation plan** (bonus: roadmap of all features to build, dependency-cascaded and value-prioritized — the natural synthesis of Steps 1–3):

- Invoke the `/master-implementation-plan` command.
- Hard gate: `.context/business/business-data-map.md` (Step 1).
- Soft gate: `.context/business/business-feature-map.md` (Step 2).
- Output: `.context/master-implementation-plan.md`.
- This step is **recommended but optional**. Skip it if the user has not yet defined product scope (e.g. greenfield where only the constitution exists). Re-invoke later, after `/product-management` has seeded the backlog, to align the master plan with the planned epics.

**Final Phase 4 outputs:**

- `.context/business/business-data-map.md`
- `.context/business/business-feature-map.md`
- `.context/business/business-api-map.md`
- `.context/business/project-dev-guide.md`
- `.context/master-implementation-plan.md` (if Step 5 ran)

On successful completion of Phase 4 (Verification checklist from `plan.md` passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/project-foundation/` to `.session/.archive/<YYYY-MM-DD>-project-foundation-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back.

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
| "API contracts" / "OpenAPI" / "endpoints definition"             | `references/srs-api-contracts.md`                                        |
| "business data map" / "entity model" / "mapa de negocio"         | invoke `/business-data-map` (pointer: `references/business-data-map.md`) |
| "business feature map" / "feature inventory" / "CRUD matrix"     | invoke `/business-feature-map`                                           |
| "API architecture discovery" / "endpoint catalog" / "auth model" | invoke `/business-api-map` (pointer: `references/api-architecture.md`)   |
| "project dev guide" / "guía de desarrollo" / "onboarding"        | `references/project-dev-guide.md`                                        |
| "master implementation plan" / "what to build first" / "roadmap" | invoke `/master-implementation-plan`                                     |

If the user intent does not match a row exactly, identify the closest phase (Constitution / PRD / SRS / Discovery) and fall back to the most relevant reference, surfacing in the report that no exact match was found.

---

## Subagent dispatch

Phases 1 → 2 → 3 → 4 are **logically sequential** (each phase consumes output from the previous), but sub-deliverables WITHIN a phase are often independent and parallel-friendly:

- **Phase 2 (PRD)**: `prd-personas`, `prd-user-journeys`, `prd-mvp-scope` can run in parallel after `prd-executive-summary` is drafted.
- **Phase 3 (SRS)**: `srs-functional`, `srs-non-functional`, `srs-architecture`, `srs-api-contracts` can run in parallel once the PRD is locked.
- **Phase 4 (Discovery)**: Steps 1 (`/business-data-map`) and 2 (`/business-feature-map`) can run in parallel against the same source code / SRS. Step 3 (`/business-api-map`) is parallel-friendly with 1 and 2 (soft gates only). Step 4 (`project-dev-guide`) has a hard prerequisite on Step 1. Step 5 (`/master-implementation-plan`) is the natural synthesis after Steps 1–3 — run it last.

Use the parallel dispatch pattern from `agentic-dev-core/references/dispatch-patterns.md`. Each subagent briefing must follow the 6-component template in `agentic-dev-core/references/briefing-template.md` and cite the specific reference file the subagent must read.

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
- **F4.** NEVER skip Phase 4 Discovery (`/business-data-map`, `/business-feature-map`, `/business-api-map`, `project-dev-guide`). Downstream skills (`/product-management`, `/sprint-development`) assume those running-mental-model docs exist.
- **F5.** NEVER hardcode tool choices (DB engine, hosting provider, auth vendor, framework) in the Constitution. Tool selection lives in SRS architecture — Constitution stays vendor-agnostic so the SRS can change without invalidating the strategic anchor.
- **F6.** NEVER define personas, problem statements, or KPIs without quoting evidence (user interview, analytics snapshot, stakeholder ask, market data citation). Evidence-free claims look authoritative and mislead the PRD downstream.
- **F7.** NEVER produce a PRD without an explicit out-of-scope section. Implicit scope boundaries always leak; missing out-of-scope is the #1 source of mid-sprint argumentation.

---

## Notes

- This skill is **one-time per project**. If scope changes significantly mid-project, re-invoke specific phases (e.g. only `references/prd-mvp-scope.md` to re-cut the MVP).
- Several reference files are written in Spanish (preserved from the original prompts). The skill orchestrator (this file) is in English; subagents should mirror the user's language when reporting results.
- This skill consumes `{{PROJECT_NAME}}`, `{{PROJECT_KEY}}`, `{{WEBAPP_DOMAIN}}` from `.agents/project.yaml`. If `.agents/project.yaml` is missing, clone the full boilerplate — foundation files ship with the repo.
- The discovery step now delegates to four standalone commands (`/business-data-map`, `/business-feature-map`, `/business-api-map`, `/master-implementation-plan`) plus one in-skill reference (`references/project-dev-guide.md`). All are intentionally agnostic of stack and work on either greenfield projects (where they ENCODE decisions) or brownfield projects (where they REVERSE-ENGINEER existing code). Re-invoke an individual command directly when only one artifact needs refreshing — there's no need to re-run the whole foundation.
