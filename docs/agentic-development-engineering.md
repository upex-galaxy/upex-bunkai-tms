# Agentic Development Engineering

> **Purpose**: The single source of truth for **why** this practice exists and **how to extend it** — the strategy, the architecture, the orchestration model, and the engineering discipline that back every line of code an AI agent commits.
> **Audience**: Engineers, tech leads, product owners, and technical leaders evaluating or adopting this boilerplate. Read this _alongside_ the onboarding HTML, not before it.
> **Scope**: Spec-Driven Development, Context Engineering, agent orchestration with human-in-the-loop, quality gates, and the extension hooks of the framework.
> **Companion**: [`docs/onboarding.html`](onboarding.html) (served by `bun run onboarding`) owns the operational reference — _what exists_ and _how to use it_ (lifecycle, skills catalog, Jira state machine, MCPs, sprint-dev stages, persistent memory). This document owns the _why_ and the _extension hooks_. Read both; they are designed to be complementary, not duplicates.
> **Why "agentic"?** This practice is not "AI as a copilot autocompleting lines." It relies on auto-triggering skills, subagents dispatched for focused tasks, live tool use through MCPs and CLIs, persistent memory across sessions, and checkpointed human supervision. Those are the defining traits of _agentic_ systems — hence the name.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why This Boilerplate Exists](#2-why-this-boilerplate-exists)
3. [Strategy: Spec-Driven, Skills-First, Agentic](#3-strategy-spec-driven-skills-first-agentic)
4. [Glossary: Terms Used Throughout This Document](#4-glossary-terms-used-throughout-this-document)
5. [System Architecture](#5-system-architecture)
6. [Context Engineering: The Knowledge Layer](#6-context-engineering-the-knowledge-layer)
7. [Working with Claude Code: Daily Workflow](#7-working-with-claude-code-daily-workflow)
8. [The Orchestration Model: AI Works, Human Decides](#8-the-orchestration-model-ai-works-human-decides)
9. [Quality Gates: Lint, Types, Tests, Review, Deploy](#9-quality-gates-lint-types-tests-review-deploy)
10. [Anatomy of a Story Session](#10-anatomy-of-a-story-session)
11. [Extending the Framework](#11-extending-the-framework)
12. [Summary of What the Practice Delivers](#12-summary-of-what-the-practice-delivers)

---

## 1. Overview

This repository is not a traditional project starter. It is an **agentic development engineering practice** built on top of Next.js, Supabase, TypeScript, and Bun, orchestrated through Claude Code skills and commands, and backed by a structured knowledge layer that lets AI agents understand the product, the architecture, and the backlog without the developer having to re-explain it every session.

The skills are written in the open SKILL format and are compatible with Claude Code, Copilot, Cursor, Codex, and OpenCode runtimes — Claude Code is the reference implementation used throughout this document.

The practice is organised around a **three-tier lifecycle** that takes a product idea from blank repository all the way to merged code in staging:

```
ONE-TIME FOUNDATION    →    CONTINUOUS MANAGEMENT    →    PER-STORY IMPLEMENTATION
  (Define the product)        (Shape the backlog)            (Ship the code)
```

| Tier                                                   | Owning skill(s)                                                     | Output                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Foundation** (one-time per product)                  | `project-foundation` → `design-system` → `project-bootstrap`        | `.context/business/`, `.context/PRD/`, `.context/SRS/`, `DESIGN.md`, scaffolded backend + frontend                                                        |
| **Testability bridge** (one-time + idempotent re-runs) | `testability-guide`                                                 | In-app `/qa` page ("Software Testability Guide for QA") + tool-agnostic credentials artifact (Jira Epic / Confluence / Notion / MCP / CLI / manual paste) |
| **Management** (continuous)                            | `product-management`                                                | Jira backlog (epics + stories), refined ACs in Gherkin, edge-case enumeration, sprint snapshots                                                           |
| **Implementation** (per story)                         | `sprint-development` (+ optional `unit-testing`, `git-flow-master`) | `implementation-plan.md`, code on a feature branch, PR, code review, merged to staging                                                                    |
| **Spec-Driven Development** (any substantial change)   | `sdd-*` skill bloque (not auto-installed; see §3.1 note)            | Exploration → Proposal → Spec → Design → Tasks → Apply → Verify → Archive                                                                                 |

Every phase is powered by an AI skill, every skill operates with at least one human-in-the-loop checkpoint, and every artefact produced is traceable from the original Jira ticket back to the source PRD requirement that motivated it.

The operational tour of those phases — what each skill does, when each fires, what command to type — lives in [onboarding.html §3 The lifecycle: five phases](onboarding.html) and [§9 Skills catalog](onboarding.html). This document explains the engineering choices behind the lifecycle and how to extend it.

> **QA workflows** (sprint testing, exploratory testing, test automation, regression) live in the sister repo [`agentic-qa-boilerplate`](https://github.com/upex-galaxy/agentic-qa-boilerplate). The two repos are designed as a complementary pair: dev side ships features, QA side validates them.

---

## 2. Why This Boilerplate Exists

Most early-stage product teams start in the same place:

- **Zero structured product definition.** A few Notion docs, a slack thread, maybe a Figma. Nothing the AI can read deterministically.
- **No skill library.** Every prompt is bespoke. Every developer has their own "system prompt." No way to share or version conventions.
- **No persistent memory.** The AI forgets everything between sessions. The same architectural decision is re-explained ten times a week.
- **No orchestration model.** A single chat handles planning, coding, reviewing, deploying — all in one bloated context window. Token cost spikes, hallucinations compound.
- **No backlog discipline.** Stories live in Jira with three-line descriptions and "see the design doc" as acceptance criteria. The AI cannot work from that.

That works until it doesn't. The moment the product handles **real money**, **regulated data**, **multi-tenant isolation**, or just **more than three concurrent developers**, the cost of an undocumented decision explodes. A misread acceptance criterion becomes a production rollback, a security finding, or a customer-data leak.

The goal of this boilerplate is therefore not to "add some AI to a project," but to install — end-to-end — the **infrastructure, knowledge layer, and workflows** that make agentic development engineering possible at all. A team that adopts this repository gets, on day one:

- A three-tier pipeline (foundation → management → implementation) owned by AI skills, with human checkpoints between stages.
- A structured context layer (`.context/`) the AI reads before it acts.
- A Spec-Driven Development (SDD) workflow for any substantial change, with explicit phases (explore → propose → spec → design → tasks → apply → verify → archive).
- A backlog seeded from the PRD with INVEST-validated stories and Gherkin acceptance criteria.
- A per-story dev loop that drives Jira state transitions, plans before it codes, reviews before it merges, and never deploys to production without a human gate.
- Persistent memory (`engram`) that survives sessions and compactions, plus on-disk PBI folders for everything `engram` cannot host.

The rest of this document describes the engineering reasoning behind those choices and the hooks for extending them.

---

## 3. Strategy: Spec-Driven, Skills-First, Agentic

The practice rests on three load-bearing strategic choices.

### 3.1 Spec-Driven Development (SDD) before code

> **Note**: SDD slash commands (`/sdd-*`) are no longer auto-installed. The boilerplate now installs only Engram via `gentle-ai install --preset minimal`. To use SDD, install the bundle manually: `gentle-ai install --agent <agent> --components sdd,skills`.

Code is the last artefact produced, not the first. Before any line of TypeScript is written, the AI walks the project through:

```
Constitution  →  PRD  →  SRS  →  Discovery  →  DESIGN.md  →  Epic  →  Story (with AC)  →  Implementation Plan  →  Code
```

Each artefact is the input contract for the next. The Implementation Plan is the input to Stage 2 of `/sprint-development`. The story's Acceptance Criteria are the input to the Implementation Plan. The PRD is the input to the backlog seed. None of these steps is optional in a regulated or revenue-bearing context.

```
   Cost / Effort to Fix a Misread Requirement
          ▲
          │                                                    ╱
          │                                                 ╱       ← Without specs
          │                                             ╱             (exponential rise)
          │                                         ╱
          │                                     ╱
          │                        inflection
          │                            ●
          │                  ╱──────────────────
          │                ╱                        ← With Spec-Driven Development
          │              ╱                            (small early effort, then flat)
          │            ╱
          ●──────────────────────────────────────────────────▶  SDLC phase
        Constitution    PRD    SRS    Story    Plan   Code   Deploy
         [Strategy]   [Prod]  [Eng]   [AC]   [How]  [Build]  [Ship]
```

The red curve is the trajectory of a team that codes from a Jira description: every misread requirement compounds. The green curve is the trajectory of a team that defines its specs upfront: small repeated investment, then a flat tail.

### 3.2 Skills-first over prompts

Workflows live in `.claude/skills/<name>/SKILL.md`, not in copy-paste prompt files. A skill is:

- **Versioned** — committed to the repo, evolves with the project, reviewed in PRs.
- **Self-documenting** — a `SKILL.md` describes when it triggers, what it does, what references it loads, what it produces.
- **Composable** — `/unit-testing` runs standalone or mid-flight from `/sprint-development`. `/design-system` runs standalone or from `/project-foundation` Phase 2.5.
- **Auto-triggered** — Claude Code matches user intent against the skill description and loads the right skill automatically. No `/<name>` typing required for common phrasings.

Compare to the alternative: a `prompts/` directory full of `.md` files that developers copy into their chat window. There is no versioning of _behavior_, no autocomplete, no composition, no way to enforce that a "test plan" prompt is always run before a "test run" prompt.

### 3.3 Agentic: orchestrator + subagents, not a single chat

A traditional AI workflow looks like this: one chat window, one developer, one giant context, one model reasoning over everything from the PRD to the JSX. The context window inflates, the cost spikes, and hallucinations compound because the AI is doing planning, reading, writing, reviewing, and deploying all in the same thread.

The agentic model is different:

```
                ┌─────────────────────────┐
                │      ORCHESTRATOR       │
                │   "Command Center"      │
                │   Lean, decision-only   │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ Subagent │ ──●→    │ Subagent │ ──●→    │ Subagent │  ──●→ Done
  │   READ   │  👤     │  WRITE   │  👤     │  VERIFY  │   👤
  └──────────┘         └──────────┘         └──────────┘

  ● = Human checkpoint
```

The orchestrator decides. Subagents execute. Each subagent gets a fresh, minimal context and returns a structured report. The orchestrator never reads 50 files inline; it dispatches a subagent that reads them, summarises them, and reports back.

This is the foundational decision behind every architectural choice in this repo. Sections 5 and 8 explore it in depth.

---

## 4. Glossary: Terms Used Throughout This Document

| Term                    | Definition                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Token**               | The unit an AI model reads and writes. Tokens have direct cost and occupy context window space.                                                                          |
| **Context Window**      | The memory available within a single conversation. Everything the AI can "see" right now.                                                                                |
| **MCP**                 | Model Context Protocol. A standard that lets AI tools talk to live systems — database, browser, web search, official library docs.                                       |
| **Skill**               | A reusable AI capability, stored under `.claude/skills/<name>/`. Auto-triggers when the user's intent matches its description.                                           |
| **Command**             | A one-shot utility stored under `.claude/commands/<name>.md`. Invoked explicitly with `/<name>`. No auto-triggering.                                                     |
| **Subagent**            | A specialist worker dispatched by the orchestrator for a focused task (reading, writing, verifying, deploying).                                                          |
| **Orchestrator**        | The main conversation thread that coordinates work. Decides; delegates; synthesises. Does not read or write code inline when delegation makes sense.                     |
| **Engram**              | Persistent memory layer (MCP server) that survives across sessions and compactions. Stores decisions, conventions, bug fixes, discoveries.                               |
| **PRD**                 | Product Requirements Document. Output of `/project-foundation` Phase 2. Defines _what_ we are building.                                                                  |
| **SRS**                 | Software Requirements Specification. Output of `/project-foundation` Phase 3. Defines _how_ the system is structured.                                                    |
| **AC**                  | Acceptance Criterion. The Gherkin-formatted condition a story must satisfy to be considered done. Refined by `/product-management`.                                      |
| **PBI**                 | Product Backlog Item. In this repo, the local folder (`.context/PBI/...`) that stores per-epic and per-story knowledge.                                                  |
| **SDD**                 | Spec-Driven Development. Meta-skill bloque (`sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`).              |
| **INVEST**              | Independent, Negotiable, Valuable, Estimable, Small, Testable. Validation criteria for user stories. Enforced by `/product-management`.                                  |
| **Implementation Plan** | The artefact produced by `/sprint-development` Stage 1. The input contract for Stage 2 (coding).                                                                         |
| **Compact Rules**       | Pre-digested coding standards injected into subagent prompts so they do not have to load and parse a full skill registry on every dispatch.                              |
| **Briefing Template**   | The 6-component format (Goal · Context docs · Skills to load · Exact instructions · Report format · Rules) every subagent dispatch follows.                              |
| **Dispatch Pattern**    | One of Single / Sequential / Parallel / Background. Picked per stage in each skill's `## Subagent Dispatch Strategy` section.                                            |
| **Active Environment**  | The environment URLs and credentials currently in use (local / staging / production). Resolved from `testing.default_env` in `.agents/project.yaml` or session override. |
| **Topic Key**           | The stable identifier under which an artefact is saved in engram (e.g. `pbi/{ticket}/impl-plan`). Documented in `agentic-dev-core/references/topic-key-conventions.md`.  |

---

## 5. System Architecture

The practice is organised in three conceptual tiers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DEVELOPER (Human)                             │
│         Makes decisions · Reviews AI output · Approves merges       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────┐
│                          AI SKILLS LAYER                            │
│                                                                     │
│  Foundation reference host (passive — cited by every workflow)      │
│  ┌──────────────────┐                                               │
│  │ agentic-dev-core │  Briefing template · Dispatch patterns ·      │
│  └──────────────────┘  Orchestration doctrine · Skill composition   │
│                                                                     │
│  Foundation workflow skills (one-time)                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│  │   project-   │ │   design-    │ │   project-   │                 │
│  │  foundation  │ │    system    │ │  bootstrap   │                 │
│  └──────────────┘ └──────────────┘ └──────────────┘                 │
│                                                                     │
│  Management + implementation workflow skills (continuous)           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │   product-   │ │   sprint-    │ │    unit-     │ │ git-flow-    ││
│  │  management  │ │     dev      │ │   testing    │ │    master    ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘│
│                                                                     │
│  SDD meta-skills (any substantial change)                           │
│  sdd-init · sdd-explore · sdd-propose · sdd-spec · sdd-design ·     │
│  sdd-tasks · sdd-apply · sdd-verify · sdd-archive                   │
│                                                                     │
│  Tool / utility skills                                              │
│  acli (Jira CLI) · agentic-dev-onboard (tour)                       │
│                                                                     │
│  Shared Knowledge Layer                                             │
│  Product specs · Design tokens · Discovery docs · Per-ticket memory │
└──────────────────────┬──────────────────┬──────────────────┬────────┘
                       │                  │                  │
              ┌────────▼─────┐   ┌───────▼────────┐  ┌──────▼───────┐
              │ Issue tracker│   │   [DB_TOOL]    │  │   CI / CD    │
              │ (Jira via    │   │ (Supabase MCP) │  │ (Vercel +    │
              │  acli)       │   │                │  │  GitHub Acts)│
              └──────────────┘   └────────────────┘  └──────────────┘
```

### Top tier — the Developer

The human sits on top. The AI never ships anything on its own. Every stage has a checkpoint where a developer reviews, approves, modifies, or rejects the AI's work. Production deploys are _always_ human-gated.

### Middle tier — the AI skills

The skill roster is split by _phase_ (declared in each `SKILL.md` frontmatter as `phase:`):

- **`foundation` (passive reference host)** — `agentic-dev-core` (briefing template, dispatch patterns, orchestration doctrine, skill-composition strategy; loaded on demand by other skills, not invoked directly).
- **`onboarding`** — `agentic-dev-onboard` (guided tour for newcomers).
- **`foundation`** — `project-foundation` (Constitution + PRD + SRS + Discovery), `design-system` (DESIGN.md), `project-bootstrap` (backend + frontend scaffolding).
- **`foundation-extension`** — `testability-guide` (in-app `/qa` page + tool-agnostic credentials artifact for QA testers and AI agents; runs after `project-bootstrap`, idempotent on re-run).
- **`management`** — `product-management` (backlog seed, epic creation, story refinement, AC quality, edge-case enumeration, sprint reporting).
- **`implementation`** — `sprint-development` (per-story mega-orchestrator), `unit-testing` (TDD composable slice), `git-flow-master` (branches, commits, PRs, conflicts).

On top of the project-shipped skills, the boilerplate composes with **two external skill catalogs** installed via `bun run setup`:

- **Reusable community skills** (installed via `bunx skills add` from community repositories): stack-aware skills like `next-best-practices`, `next-cache-components`, `next-upgrade`, `tailwind-css-patterns`, `shadcn`, `react-hook-form`, `zod`, `typescript-advanced-types`, `accessibility`, `seo`, `frontend-design`. These ship the canonical "how to do X in framework Y" knowledge so the project-shipped skills can stay stack-agnostic.
- **User-level skills installed via `bunx skills add`** (cross-cutting, repo-agnostic): `skill-creator`, `find-skills`, `github-actions-docs`, `brainstorming`, `html-ppt`, plus every CLI-companion skill (`supabase`, `supabase-postgres-best-practices`, `deploy-to-vercel`, `resend-cli`, `bun`, `playwright-cli`). These follow the user across every project.
- **Gentle-AI skills** (installed by `gentle-ai install --preset minimal`): the `engram` MCP for persistent memory.

All skills share the **Knowledge Layer** (the `.context/` directory and the engram MCP): product specs, design tokens, discovery docs, per-ticket memory.

### Bottom tier — the systems the AI operates on

- **Issue tracker** — Jira (Stories, Bugs, Epics) accessed via the `acli` skill (official Atlassian CLI). Drives the `Ready For Dev → In Progress → In Review → Ready For QA` state machine.
- **`[DB_TOOL]`** — the Supabase database, accessed through the Supabase MCP. Used for schema exploration, migrations, type generation, and Discovery.
- **`[API_TOOL]`** — the OpenAPI spec, generated by `bun run api:sync`. Used for contract verification and type generation in the frontend.
- **CI / CD** — Vercel for deploys, GitHub Actions for lint/types/tests on PRs. Triggers the staging deploy on merge to `staging`; production deploys are human-gated.

The `[TAG_TOOL]` brackets are not decorative. Every skill in this repo writes tool calls in `[TAG_TOOL]` pseudocode, which resolves against the **Tool Resolution** table in `CLAUDE.md`. Swap the row, swap the backend — no skill edits required.

---

## 6. Context Engineering: The Knowledge Layer

Context Engineering is the discipline of curating the information the AI reads **before** it acts. An AI that reads the right context does not need to guess, and does not hallucinate. An AI that guesses is dangerous in a production-grade system.

The knowledge layer is organised in three tiers, mirroring the scope at which the information is relevant:

```
┌──────────────────────────────────────────────────────────────┐
│  PROJECT LEVEL                                               │
│  Business model · PRD · SRS · API map · Data map · Feature   │
│  map · Design tokens                                         │
│  Example: .context/business/business-feature-map.md tells    │
│  the AI what features exist in THIS codebase.                │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  MODULE / EPIC LEVEL                                         │
│  Module context · Roadmap of stories · Cross-story decisions │
│  Example: .context/PBI/{module}/module-context.md catalogues │
│  the routes, DB tables, and shared types for that module.    │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  STORY / TICKET LEVEL                                        │
│  Acceptance criteria · Implementation plan · Review notes ·  │
│  Compliance matrix · Bug-fix root cause                      │
│  Example: .context/PBI/{module}/UPEX-123-add-login/          │
│  implementation-plan.md is the input contract for coding.    │
└──────────────────────────────────────────────────────────────┘
```

### How it actually looks on disk

```
.context/
├── _framework/                       # Framework infrastructure
│   └── skill-registry.md            #   Compact-rules cache    (scripts/build-skill-registry.ts)
│
├── PRD/                              # Product Requirements (/project-foundation Phase 2)
│   ├── executive-summary.md         #   Problem, KPIs, MVP metrics
│   ├── personas.md                  #   Target users, JTBD
│   ├── mvp-scope.md                 #   Must / should / could-have
│   └── user-journeys.md             #   Happy paths, edge cases
│
├── SRS/                              # Software Requirements (/project-foundation Phase 3)
│   ├── functional.md                #   FRs per epic
│   ├── non-functional.md            #   Perf, security, accessibility
│   ├── architecture.md              #   Stack, data model, deploy topology
│   └── api-contracts.md             #   OpenAPI endpoint definitions
│
├── business/                         # Single source of business knowledge (Constitution + Maps)
│   ├── business-model.md            #   Problem, solution, monetization, segments  (/project-foundation Phase 1)
│   ├── market-context.md            #   Industry, competitors, trends              (/project-foundation Phase 1)
│   ├── legacy-analysis.md           #   Legacy stack + doc-gap analysis (optional) (/project-foundation Phase 1)
│   ├── business-data-map.md         #   Entities, flows, state machines  (/business-data-map)
│   ├── business-feature-map.md      #   Feature inventory + CRUD matrix  (/business-feature-map)
│   └── business-api-map.md          #   Auth model + critical endpoints  (/business-api-map)
│
├── master-implementation-plan.md     # High-level roadmap                (/master-implementation-plan)
│
└── PBI/                              # Per-epic + per-ticket memory
    ├── epic-tree.md                 #   Output of /product-management seed
    └── {module}/
        ├── module-context.md
        ├── ROADMAP.md               #   Stories + dev status
        ├── PROGRESS.md              #   Current progress
        ├── SESSION-PROMPT.md        #   @-loadable session resume
        └── {TICKET-ID}-{title}/
            ├── spec.md              #   AC in Gherkin       (/product-management)
            ├── edge-cases.md        #   Enumeration         (/product-management)
            ├── implementation-plan.md  # Plan              (/sprint-development Stage 1)
            ├── review.md            #   Code review notes   (/sprint-development Stage 3)
            ├── compliance-matrix.md #   AC → code mapping   (/sprint-development Stage 3)
            └── evidence/            #   Screenshots, logs   (gitignored)
```

Plus, at the project root:

- **`DESIGN.md`** — Apache-2.0 spec from Google Labs. The portable visual identity (palette, typography, spacing, components) every AI agent reads. Generated by `/design-system`.
- **`CLAUDE.md`** — operational context loaded every Claude Code session: project identity, behavioral layer, critical reminders, tool resolution, orchestration mode, skills catalog.

The canonical shape is documented in `.context/README.md`. The strategic reasoning behind the three-tier split lives in `CONTEXT.md` at the repo root.

### Cross-skill references

A second knowledge surface exists outside `.context/`: the `agentic-dev-core/references/*.md` files. They host the briefing template, the dispatch patterns decision guide, the orchestration doctrine, the topic-key conventions, the model-routing table, and the skill-resolver protocol. Workflow skills cite these files instead of duplicating the content. They are loaded on demand and form part of the practice's knowledge layer even though they live under `.claude/skills/` rather than `.context/`.

| `agentic-dev-core` reference | Purpose                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `briefing-template.md`       | The 6-component subagent briefing format with concrete examples per dispatch pattern.                        |
| `dispatch-patterns.md`       | Decision table + heuristic for picking Single / Sequential / Parallel / Background.                          |
| `orchestration-doctrine.md`  | Cacheable mirror of `CLAUDE.md` §Orchestration Mode (Subagent Strategy).                                     |
| `model-routing.md`           | Phase → model alias table (opus for foundation, sonnet for impl, haiku for archive).                         |
| `topic-key-conventions.md`   | Stable engram topic keys per artefact (e.g. `pbi/{ticket}/impl-plan`, `sdd/{change}/spec`).                  |
| `skill-resolver.md`          | Skill-resolver protocol: how the orchestrator looks up compact rules and injects them into subagent prompts. |

### Project variables vs runtime credentials

Static project values (`{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, `{{ATLASSIAN_URL}}`, etc.) live in `.agents/project.yaml` — the AI resolves `{{VAR_NAME}}` references against that file once per session. Runtime credentials (`STAGING_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) remain in `.env` and are read at execution time. The two systems are separate by design: `.agents/project.yaml` is committed to the repo, `.env` is gitignored.

Four reference syntaxes coexist across prompts and docs:

| Syntax                         | Purpose                                      | Resolves from                                                                       |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{{VAR_NAME}}`                 | Static project value (flat or env-scoped)    | `.agents/project.yaml`                                                              |
| `{{environments.<env>.<var>}}` | Explicit cross-env reference                 | `.agents/project.yaml` → `environments.<env>.<var>` directly                        |
| `<<VAR_NAME>>`                 | Session/runtime value (e.g. `<<ISSUE_KEY>>`) | Computed by the calling prompt at runtime. Never declared, never persisted.         |
| `{{jira.<slug>}}`              | Jira custom field reference                  | `.agents/jira-required.yaml` (manifest) + `.agents/jira-fields.json` (resolved IDs) |

Validated via `bun run vars:check`, `bun run jira:sync-fields`, and `bun run jira:check`. The full contract lives in `.agents/README.md`.

### Live sources of truth

Static documentation is only half the picture. Before every meaningful action, the AI also pulls from **live** sources: the frontend codebase, backend routes, the Supabase database (via `[DB_TOOL]`), the OpenAPI spec (via `[API_TOOL]`), the Jira tracker (via `acli`), engram memory, and the official documentation MCPs (`context7`, `tavily`, `n8n`). Operational decision rules for which one to reach for — when to pick `context7` vs `tavily` vs `engram`, CLI-first vs MCP-fallback — live in [onboarding.html §12 MCPs available](onboarding.html). The Tool Resolution table in `CLAUDE.md` is the canonical mapping from each `[TAG_TOOL]` pseudocode tag to its concrete implementation.

### Why it matters

When the AI opens a ticket a week after the last session, the context is still there — every AC, every team decision, every architectural choice. There is no re-briefing cost. This is how "zero context loss" is maintained sprint over sprint.

---

## 7. Working with Claude Code: Daily Workflow

The daily workflow is plain English. The developer tells Claude Code what is needed, and the matching skill auto-triggers on description match.

### Example invocations

```text
> implementar UPEX-123
  → Auto-triggers: sprint-development skill (full per-story loop)

> Fix the bug in UPEX-456
  → Auto-triggers: sprint-development skill in bug-fix mode

> agregar feature al backlog: "users can export their data"
  → Auto-triggers: product-management skill (incremental feature)

> create branch for UPEX-789
  → Auto-triggers: git-flow-master skill (branch operation)

> abrí un PR contra staging
  → Auto-triggers: git-flow-master skill (PR operation)

> TDD this function
  → Auto-triggers: unit-testing skill (TDD red-green-refactor)

> rebrand the project
  → Auto-triggers: design-system skill (DESIGN.md regeneration)

> sprint report
  → Auto-triggers: product-management skill workflow G (read-only PM snapshot)

> /sdd-new authentication-rework
  → SDD orchestrator handles: exploration → proposal → spec → design → tasks → apply → verify → archive
```

Auto-triggering is governed by each skill's `description` field, which lists the phrases the skill should respond to. The decision tree in `CLAUDE.md` documents the full mapping. Explicit invocation is also supported — `/sprint-development`, `/product-management`, `/git-flow-master`, and so on — for cases where determinism is preferred over pattern matching.

### What happens on invocation

The skill loads its references, opens the PBI folder for the target ticket (or creates it), pulls context from the live sources listed in §6, searches engram for relevant prior work, and dispatches the first subagent of the stage. Everything that happens next is visible in the transcript.

### Recommended stack

The practice runs on this combination of tools. Each is replaceable, but the combination is what the practice expects out of the box:

| Tool                                | Role                                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| **AI-native terminal** (Warp, etc.) | Terminal with blocks, smart autocomplete.                         |
| **Claude Code**                     | The AI CLI that runs on top — dispatches skills, subagents, MCPs. |
| **VSCode · Cursor · Windsurf**      | Editor — personal preference. Pick one.                           |
| **Git** + **gh CLI**                | Version control and PR operations.                                |
| **Bun**                             | Runtime + package manager.                                        |
| **Vercel**                          | Frontend hosting + preview deploys.                               |
| **Supabase**                        | Database, auth, storage.                                          |
| **Jira (via `acli`)**               | Issue tracker — stories, bugs, epics.                             |

Claude Code is the load-bearing piece — it is the orchestrator that triggers skills, dispatches subagents, and accesses MCPs. Everything else is the developer's working surface around it.

---

## 8. The Orchestration Model: AI Works, Human Decides

This is the most important architectural decision in the practice, and the one most often misunderstood in AI-assisted development: **skills do not run end-to-end autonomously**.

```
                ┌─────────────────────────┐
                │    MAIN AI (Skill)      │
                │    "Command Center"     │
                │    Dispatches work      │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ Subagent │ ──●→    │ Subagent │ ──●→    │ Subagent │  ──●→ Done
  │ PLANNING │  👤     │   IMPL   │  👤     │  REVIEW  │   👤
  └──────────┘         └──────────┘         └──────────┘

  ● = Human checkpoint. The developer reviews, approves, modifies, or vetoes.
      Nothing proceeds without review.
```

### Three guarantees

1. **Every subagent reports back.** No silent work. The orchestrator presents a structured summary at the end of each stage.
2. **The human can stop, redirect, or modify at any checkpoint.** Veto at any gate forces the skill to replan.
3. **Full transcript is logged.** Every decision, every dispatch, every output is auditable after the fact.

### Why the checkpoints exist

AI makes mistakes — misreading an AC, picking the wrong abstraction, breaking an unrelated test. Catching those mistakes **between stages** prevents them from cascading. A wrong decision in Planning that reaches Implementation produces broken code. Caught at the Planning gate, it is a two-minute correction.

This is what gives the practice AI **speed** without losing human **judgment**. The skill does the mechanical work; the engineer does the deciding.

### Delegation rules

The orchestrator follows an explicit cost-aware delegation policy. The decision is _"does this inflate my context without need? If yes → delegate."_

| Action                                       | Inline | Delegate                     |
| -------------------------------------------- | ------ | ---------------------------- |
| Read 1–3 files to decide or verify           | ✅     | —                            |
| Read 4+ files to explore / understand        | —      | ✅                           |
| Read files as preparation for writing        | —      | ✅ (together with the write) |
| Write one file (mechanical, you know what)   | ✅     | —                            |
| Write across multiple files with new logic   | —      | ✅                           |
| Bash for state (`git status`, `gh pr list`)  | ✅     | —                            |
| Bash for execution (`bun test`, `bun build`) | —      | ✅                           |

`delegate (async)` is the default for delegated work. Synchronous task delegation is used only when the next inline action depends on the result.

**Anti-patterns** — these always inflate context without need:

- Reading 4+ files to "understand" the codebase inline → delegate an exploration.
- Writing a feature across multiple files inline → delegate.
- Running tests or builds inline → delegate.
- Reading files as preparation for edits, then editing → delegate the whole thing together.

### Where the doctrine lives

The orchestration model is not improvised per session — it is captured in canonical references that workflow skills load on demand. Engineers and skill authors should know where to look:

- **`CLAUDE.md` §Orchestration Mode** — canonical project-level statement of the strategy (delegation rules, briefing format, error protocol).
- **`agentic-dev-core/references/orchestration-doctrine.md`** — cacheable mirror loaded by subagents that need the full doctrine without re-reading `CLAUDE.md`.
- **`agentic-dev-core/references/briefing-template.md`** — the six-component briefing format every dispatch uses (Goal · Context docs · Skills to load · Exact instructions · Report format · Rules).
- **`agentic-dev-core/references/dispatch-patterns.md`** — decision guide for the four patterns (Single, Sequential, Parallel, Background) and when each applies.
- **`## Subagent Dispatch Strategy`** sections inside each workflow `SKILL.md` (`sprint-development`, `project-foundation`, `project-bootstrap`, `product-management`, etc.) — per-stage tables declaring which steps delegate to subagents and with what pattern.

When a skill writes `Use the dispatch defined in §Subagent Dispatch Strategy: Parallel`, that line is shorthand for the full briefing assembled from the references above. The doctrine is a single source, cited from many places.

### Per-phase model routing

Each skill declares a `phase:` in its `SKILL.md` frontmatter, and the model-routing table in `agentic-dev-core/references/model-routing.md` maps phases to model aliases:

| Phase          | Default model | Reason                       |
| -------------- | ------------- | ---------------------------- |
| orchestrator   | opus          | Coordinates, makes decisions |
| foundation     | opus          | Architectural decisions      |
| planning       | sonnet        | Structured writing           |
| implementation | sonnet        | Coding                       |
| review         | opus          | Critical analysis            |
| archive        | haiku         | Mechanical close-out         |
| default        | sonnet        | Non-classified delegation    |

The orchestrator reads the table once at session start and routes each delegated subagent to the appropriate model — giving deep reasoning where it matters and cheap tokens where it does not.

---

## 9. Quality Gates: Lint, Types, Tests, Review, Deploy

Every change merged to `staging` (and especially every change promoted to `main`) passes through the same gate. There is no "I think it's fine" shipping decision — the verdict is data-driven, owned by `/sprint-development`'s Stage 3 and Stage 4 dispatchers, and enforced by CI.

### The five gates

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│   LINT   │ → │  TYPES   │ → │  TESTS   │ → │  REVIEW  │ → │  DEPLOY  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
   ESLint        tsc           Vitest +        Reviewer       Vercel +
   Prettier      --noEmit      Playwright      subagent +     migrations
                                               human          (gated for
                                                              prod)
```

| Gate   | Command                                  | Owner               | Behavior on red                              |
| ------ | ---------------------------------------- | ------------------- | -------------------------------------------- |
| Lint   | `bun run lint:check`                     | Stage 2 verifier #1 | Auto-fix attempt, then escalate              |
| Types  | `bun run build` or `tsc --noEmit`        | Stage 2 verifier #2 | Surface to impl subagent for fix loop        |
| Tests  | `bun test` (Vitest) + `bun run e2e` (PW) | Stage 2 verifier #3 | Surface to impl subagent for fix loop        |
| Review | Reviewer subagent + developer            | Stage 3             | Fix-and-iterate, max 2 loops, then escalate  |
| Deploy | Vercel + Supabase migrations             | Stage 4 + Stage 5   | Rollback playbook ready; prod is human-gated |

### Pre-flight checklist

Before any push to `main`:

- [ ] Plan presented and approved before coding (skill-internal in `/sprint-development`).
- [ ] Aliases used for imports (`@api/`, `@schemas/`, `@utils/`). No deep relative imports.
- [ ] Credentials read from `.env`, never hardcoded.
- [ ] Unit tests pass (when applicable; see `/unit-testing`).
- [ ] Lint + types green.
- [ ] No AI attribution in commits ("Generated with Claude Code", "Co-Authored-By: Claude" are forbidden).
- [ ] Context loaded progressively (not all at once).
- [ ] Human confirmation before push to `main`.

### Failure protocol

When any gate fails, the orchestrator does NOT auto-fix without approval. It STOPS, reports the failure with full context (which gate, which command, what output), and presents three options: **retry**, **skip-step**, **abort**. The developer decides.

This is the same protocol used in the QA sister repo for test failures — both halves of the agentic engineering practice share the rule: AI works, human decides.

---

## 10. Anatomy of a Story Session

To illustrate how the pieces fit together, here is what a typical story's journey looks like from start to merged code.

Consider a ticket `UPEX-XXX` with a handful of acceptance criteria covering a user-facing feature.

1. **Session Start.** The developer types `implementar UPEX-XXX`. The `sprint-development` skill auto-triggers. The orchestrator searches engram for prior work on this module (`mem_search`), opens the ticket via `acli`, explores the frontend and backend code paths related to the feature, queries the database via the Supabase MCP for relevant schema, and creates the PBI folder for the ticket if it does not exist.

2. **Stage 1 — Planning.** A planner subagent is dispatched (Single pattern, model alias = sonnet). It reads the story, the AC, the module context, and produces `implementation-plan.md`. The plan is presented to the developer with open questions and approved. Jira transitions Ready For Dev → In Progress.

3. **Stage 2 — Implementation.** An implementation subagent picks up the plan and writes code across the listed files. After each batch, three verifiers run in parallel: `bun run lint:check`, `bun run build`, `bun test`. Red → fix loop, max 2 iterations. The developer can opt into a TDD slice via `/unit-testing` for any pure function or complex branching.

4. **Stage 3 — Code Review.** The branch is pushed and a PR is opened via `/git-flow-master` (auto-detected branching strategy chooses the base branch). Jira automatically transitions In Progress → In Review. A reviewer subagent (model alias = opus) walks the AC compliance matrix, the code-standards checklist, and the composition patterns. Output: `review.md` and `compliance-matrix.md` committed in the PR branch.

5. **Stage 4 — Staging Deploy.** PR is merged to `staging`. Vercel deploys the preview. Supabase migrations run (if any). A background subagent watches health and smoke for N minutes. Jira transitions In Review → Ready For QA.

6. **Stage 5 — Production Deploy (gated).** The developer triggers `/sprint-development` Stage 5 explicitly after QA sign-off (from the sister `agentic-qa-boilerplate`) and business approval. Tag, promote, monitor, rollback-ready.

7. **Memory persistence.** Throughout the session, the orchestrator and subagents call `mem_save` on decisions, bug fixes, conventions, and discoveries — tagged with stable topic keys (`pbi/UPEX-XXX/impl-plan`, `pbi/UPEX-XXX/review`, etc.) so the next session can recover them.

Every artefact lives in the PBI folder on disk and in engram. The AI produces the plan, writes the code, opens the PR, runs the deploy. The engineer reviews and approves at each checkpoint.

### Typical timing

| Stage              | Typical duration (small story) | Typical duration (medium story) |
| ------------------ | ------------------------------ | ------------------------------- |
| Session start      | < 1 min                        | 1–2 min                         |
| Stage 1 — Planning | 2–5 min                        | 5–15 min                        |
| Stage 2 — Impl     | 5–20 min                       | 30–60 min                       |
| Stage 3 — Review   | 2–5 min                        | 5–15 min                        |
| Stage 4 — Staging  | < 5 min (Vercel deploy)        | < 5 min                         |
| Stage 5 — Prod     | Gated; depends on schedule     | Gated                           |

These are rough orders of magnitude, not commitments. Exact duration depends on scope, risk, and how many verification loops fire.

The five-stage sprint-development pipeline is described operationally — every Jira transition, every dispatch pattern, every verifier — in [onboarding.html §5 The Jira state machine](onboarding.html) and the hero pipeline diagram. The orchestration rationale behind those stages stays here in §8.

---

## 11. Extending the Framework

The framework is meant to be extended. The hooks are documented and the conventions are stable.

### 11.1 Adding a workflow skill

1. Create `.claude/skills/<name>/SKILL.md` with the standard frontmatter:

```markdown
---
name: <skill-name>
description: '<what it does, what it triggers on, what NOT to use it for>'
license: MIT
compatibility: [claude-code, opencode]
phase: <foundation | onboarding | management | implementation | exploration | proposal | spec | design | tasks | apply | verify | archive>
---
```

2. Document `## When to use`, `## Pre-requisites`, `## Subagent Dispatch Strategy`, `## Main workflow`, and `## Hand-offs`.
3. Cite `agentic-dev-core/references/*.md` in a `## Dependencies` block (do not duplicate the orchestration doctrine, briefing template, or dispatch patterns inline).
4. Put long-form procedures under `.claude/skills/<name>/references/`. Keep `SKILL.md` itself as a router; the references are the meat.
5. Run `bun run skills:registry` to update `.claude/skills/REGISTRY.md` with the new skill's compact rules.

### 11.2 Adding a slash command

1. Create `.claude/commands/<name>.md` with a single-purpose prompt.
2. Document what it produces and when to invoke it.
3. List it in `CLAUDE.md` under the Skills/Commands tables and update `CONTEXT.md` if the command surface changes.

### 11.3 Adding a project variable

1. Add the key to `.agents/project.yaml` (top-level if static, under `environments.<env>` if env-scoped).
2. Update `.agents/README.md` if the contract changes.
3. Run `bun run vars:check` to confirm every reference still resolves.

### 11.4 Adding a Jira custom field

1. Add the slug to `.agents/jira-required.yaml` with expected type, options, and consumers.
2. Run `bun run jira:sync-fields` to populate the workspace catalog.
3. Run `bun run jira:check` to confirm the workspace satisfies the manifest.
4. Reference the field in skills/commands as `{{jira.<slug>}}` — never `customfield_XXXXX`.

### 11.5 Adding a new MCP

1. Configure the MCP server in `.mcp.json` (or `opencode.json` for OpenCode).
2. Add the resolution row to `CLAUDE.md` § Tool Resolution.
3. Document the MCP under `docs/setup/mcp/<mcp-name>.md`.
4. Update the MCP catalog in [onboarding.html §12 MCPs available](onboarding.html) and the `CLAUDE.md` § MCPs Available table.

### 11.6 Adopting Spec-Driven Development (SDD)

The SDD bloque (`sdd-*` skills) is not auto-installed by `bun run setup` (see §3.1 note). Install manually first: `gentle-ai install --agent <agent> --components sdd,skills`. Once installed:

1. Run `/sdd-init` to detect the stack and bootstrap the persistence backend (engram by default).
2. For any substantial change, use `/sdd-new <change-name>` to start the full lifecycle: explore → propose → spec → design → tasks → apply → verify → archive.
3. Each phase has its own model alias (see § per-phase model routing in Section 8). The orchestrator routes each subagent accordingly.

### 11.7 Future hooks (deferred patterns)

The skill architecture leaves room for future enhancements without rework. Documented but not yet implemented:

- **Cross-agent portability.** Each skill declares `compatibility: [claude-code, copilot, cursor, codex, opencode]`. A future CI step could spin up multiple runners to validate cross-agent reliability.
- **Team-shared engram.** A future cross-machine persistent memory layer (sync between developers, team-shared decisions) could plug into the existing topic-key convention.
- **Per-phase autonomous routing.** A future orchestrator could read each skill's `phase:` frontmatter and route to a different model automatically without the developer specifying.
- **Master roadmap.** A future pattern (Pattern 7, currently deferred) would produce a high-level `.context/master-implementation-plan.md` from the business maps and the SRS — see `docs/methodology/` for the deferral rationale.

These hooks are documented but not implemented. Reopen when there is concrete demand.

---

## 12. Summary of What the Practice Delivers

### What ships in this repository

- **A foundation reference host (`agentic-dev-core`)** — passive library that hosts the canonical orchestration doctrine, briefing template, dispatch patterns, model-routing table, topic-key conventions, and skill-resolver protocol cited by every workflow skill. Loaded on demand; not invoked directly. Foundation files (`CLAUDE.md`, `.agents/`, `scripts/`) ship with the cloned repository.
- **A roster of phase-aware AI skills** — auto-triggered by user intent, orchestrated with human-in-the-loop checkpoints. Each tier of the lifecycle has its own skill. The current roster is enumerated in [onboarding.html §9 Skills catalog](onboarding.html).
- **The SDD meta-skill bloque** — explore → propose → spec → design → tasks → apply → verify → archive for any substantial change.
- **A library of utility slash commands** — deterministic, single-purpose, invoked with `/<name>`. The current library is enumerated in [onboarding.html §10 Commands & Scripts](onboarding.html).
- **Live system integrations** — MCPs for the database (Supabase), library docs (context7), web search (tavily), workflow automation (n8n), persistent memory (engram); first-party CLIs for Jira (acli), GitHub (gh), deploys (vercel, supabase), browser automation (playwright).
- **A structured context layer** — project, module, and story-level knowledge, on disk and version-controlled. Contains product specs, design tokens, discovery docs, per-ticket memory, and team guidelines.
- **A portable design system (`DESIGN.md`)** — Apache-2.0 Google Labs spec at the project root. Consumed by `/project-bootstrap` and any AI agent reading the repo.
- **Project variable contract** — `.agents/project.yaml` + `.agents/jira-required.yaml` + auto-generated catalogs, validated by `bun run vars:check` and `bun run jira:check`.
- **Persistent memory (engram + PBI folders)** — sessions resume from the exact point they ended. No context loss between days or developers.
- **A per-story dev loop** — Planning → Implementation → Code Review → Staging → (gated) Production. Drives Jira state transitions automatically. Production is always human-gated.
- **A CI / CD pipeline** — Vercel for deploys, GitHub Actions for lint/types/tests on PRs, Supabase migrations on merge to `staging`.
- **A pre-flight quality gate** — lint + types + tests + review + deploy. Failures stop the line; the developer decides retry / skip / abort.

### The core claim

A development practice that ships features faster, documents every decision, remembers everything across sessions, and never deploys to production without a human gate. Built on the premise that AI handles the mechanical work, and the engineer handles the decisions.

The rest is execution.

---

**Last Updated**: 2026-05-13

**See also**:

- [`docs/onboarding.html`](onboarding.html) — operational reference: lifecycle, Jira state machine, skills catalog, commands, MCPs, cheat sheet (served by `bun run onboarding`).
- `CLAUDE.md` — canonical project memory, Tool Resolution, orchestration mode, skill routing, engram protocol.
- `CONTEXT.md` — strategic reasoning behind the three-tier knowledge layer (repo root).
- `docs/methodology/IQL-methodology.md` — phased lifecycle deep-dive.
- `docs/architectures/supabase-nextjs/` — stack-specific configuration.
- `docs/workflows/` — environments, git-flow, OpenAPI sync, template updates.
- `INSTALLER.md` — what `bun run setup` configures: gentle-ai, community skills, MCPs, external CLIs, opt-out.
- `.claude/skills/agentic-dev-core/SKILL.md` — foundation reference host (passive; shared references cited by other skills).
- `.claude/skills/agentic-dev-core/references/orchestration-doctrine.md` — canonical orchestration doctrine cited by every workflow skill.
- `.claude/skills/project-foundation/SKILL.md` — Constitution + PRD + SRS + Discovery skill internals.
- `.claude/skills/design-system/SKILL.md` — DESIGN.md generation skill internals.
- `.claude/skills/project-bootstrap/SKILL.md` — Infrastructure scaffolding skill internals.
- `.claude/skills/product-management/SKILL.md` — Backlog + refinement skill internals.
- `.claude/skills/sprint-development/SKILL.md` — Per-story dev loop skill internals.
- `.claude/skills/unit-testing/SKILL.md` — TDD slice skill internals.
- `.claude/skills/git-flow-master/SKILL.md` — Git operator skill internals.
- `.claude/skills/vercel-cli/SKILL.md` — Vercel CLI cookbook: deployment verification, env var sync, build/runtime log streaming, rollback, project linking. Companion to community `deploy-to-vercel`.
- `.context/README.md` — canonical context layout.
- `.agents/README.md` — project variable contract and validation scripts.
- Sister repo: [`agentic-qa-boilerplate`](https://github.com/upex-galaxy/agentic-qa-boilerplate) — the QA half of the practice.

---

> **You are here**: Agentic Development Engineering — why this practice exists and how to extend it. **Read time**: 25 min. **Next**: [`docs/onboarding.html`](onboarding.html) (via `bun run onboarding`) for the operational tour, or [`../CONTEXT.md`](../CONTEXT.md) to see how this repo applies the methodology.
