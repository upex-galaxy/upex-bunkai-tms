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
7. [Working with the AI harness: Daily Workflow](#7-working-with-the-ai-harness-daily-workflow)
8. [The Orchestration Model: AI Works, Human Decides](#8-the-orchestration-model-ai-works-human-decides)
9. [Quality Gates: Lint, Types, Tests, Review, Deploy](#9-quality-gates-lint-types-tests-review-deploy)
10. [Anatomy of a Story Session](#10-anatomy-of-a-story-session)
11. [Extending the Framework](#11-extending-the-framework)
12. [Summary of What the Practice Delivers](#12-summary-of-what-the-practice-delivers)

---

## 1. Overview

This repository is not a traditional project starter. It is an **agentic development engineering practice** built on top of Next.js, Supabase, TypeScript, and Bun, orchestrated through agent skills that run on Claude Code, OpenCode and Codex, and backed by a structured knowledge layer that lets AI agents understand the product, the architecture, and the backlog without the developer having to re-explain it every session.

The skills are written in the open SKILL format and run on Claude Code, OpenCode and Codex (CLI + Desktop) from one committed copy under `.agents/skills/`; Claude Code is the reference implementation used throughout this document, and everything it does through a skill applies to the other two harnesses unless stated otherwise.

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
| **Implementation** (per story)                         | `sprint-development` (+ optional `unit-testing`, `git-flow-master`) | `implementation-plan.md`, code on a feature branch, PR, code review, merged and deployed to staging                                                       |
| **Autonomous delivery** (scheduled / unattended runs)  | `autonomous-delivery` (wraps the pipeline skills)                   | Audit of real state (git is truth, the tracker is a hint), selection of genuinely unblocked work, dispatch to the owning pipeline skill, run report       |

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
- A spec-first artefact chain (Constitution → PRD → SRS → story AC → implementation plan) that every change walks before code is written.
- A backlog seeded from the PRD with INVEST-validated stories and Gherkin acceptance criteria.
- A per-story dev loop that drives Jira state transitions, plans before it codes, reviews before it merges, and never deploys to production without a human gate.
- Persistent memory (`engram`) that survives sessions and compactions, plus a gitignored `.context/PBI/` cache — hydrated from Jira on demand (`bun run context:hydrate`) — for anything `engram` should not have to hold in full.

The rest of this document describes the engineering reasoning behind those choices and the hooks for extending them.

---

## 3. Strategy: Spec-Driven, Skills-First, Agentic

The practice rests on three load-bearing strategic choices.

### 3.1 Spec-Driven Development (SDD) before code

> **Note**: `bun setup` wires only Engram, with the engram binary's own `engram setup <agent>`. The optional `sdd-*` skill bundle is not part of the shipped skill set; §11.6 covers adopting it.

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

Workflows live in `.agents/skills/<name>/SKILL.md`, not in copy-paste prompt files. A skill is:

- **Versioned** — committed to the repo, evolves with the project, reviewed in PRs.
- **Self-documenting** — a `SKILL.md` describes when it triggers, what it does, what references it loads, what it produces.
- **Composable** — `/unit-testing` runs standalone or mid-flight from `/sprint-development`. `/design-system` runs standalone or from `/project-foundation` Phase 2.5.
- **Auto-triggered** — the harness (Claude Code, OpenCode or Codex) matches user intent against the skill description and loads the right skill automatically. No `/<name>` typing required for common phrasings.
- **Stored once, read three ways** — `.agents/skills/` is the only skill store. OpenCode and Codex read that tree natively; Claude Code reaches the same files through the generated `.claude/skills` alias (a symlink on POSIX, a junction on Windows, gitignored, regenerated by `bun run agents:compat`). The same rule covers the instruction body: `AGENTS.md` is canonical and `CLAUDE.md` is exactly `@AGENTS.md` plus a newline. Generated surfaces (`CLAUDE.md`, `.claude/skills`) are never hand-edited; `bun run agents:compat:check` is the gate (`AGENTS.md` Critical Rule #15).

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

| Term                    | Definition                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token**               | The unit an AI model reads and writes. Tokens have direct cost and occupy context window space.                                                                                         |
| **Context Window**      | The memory available within a single conversation. Everything the AI can "see" in that conversation.                                                                                               |
| **MCP**                 | Model Context Protocol. A standard that lets AI tools talk to live systems (database, library docs, workflow automation). The project configs declare local servers; web search runs at harness level. |
| **Capability**          | What a skill asks for instead of naming a server: `library-docs`, `web-search`, `db`, `automation-flows`, `diagrams`. Resolved by tool-name suffix; a missing one is a STOP at the point of use (`agentic-dev-core/references/mcp-capabilities.md`). |
| **Skill**               | A reusable AI capability, stored under `.agents/skills/<name>/` and shared by every supported harness. Auto-triggers when the user's intent matches its description.                    |
| **Mode**                | One entry point of a multi-mode skill, listed in its `## Mode routing` section. Invoked as `/<skill> <mode>` on Claude Code, or by naming skill and mode in prose on OpenCode and Codex. No command files exist (ADR-0006). |
| **Subagent**            | A specialist worker dispatched by the orchestrator for a focused task (reading, writing, verifying, deploying).                                                                         |
| **Orchestrator**        | The main conversation thread that coordinates work. Decides; delegates; synthesises. Does not read or write code inline when delegation makes sense.                                    |
| **Engram**              | Persistent memory layer (MCP server) that survives across sessions and compactions. Stores decisions, conventions, bug fixes, discoveries.                                              |
| **PRD**                 | Product Requirements Document. Output of `/project-foundation` Phase 2. Defines _what_ we are building.                                                                                 |
| **SRS**                 | Software Requirements Specification. Output of `/project-foundation` Phase 3. Defines _how_ the system is structured.                                                                   |
| **AC**                  | Acceptance Criterion. The Gherkin-formatted condition a story must satisfy to be considered done. Refined by `/product-management`.                                                     |
| **PBI**                 | Product Backlog Item. In this repo, `.context/PBI/...`: a gitignored cache of Jira, rebuilt with `bun run context:hydrate`.                                                             |
| **SDD**                 | Spec-Driven Development: writing the specs before the code (§3.1). An optional gentle-ai `sdd-*` bundle automates it; it is not shipped (§11.6).                                       |
| **INVEST**              | Independent, Negotiable, Valuable, Estimable, Small, Testable. Validation criteria for user stories. Enforced by `/product-management`.                                                 |
| **Implementation Plan** | The artefact produced by `/sprint-development` Stage 1. The input contract for Stage 2 (coding).                                                                                        |
| **Compact Rules**       | Pre-digested coding standards injected into subagent prompts so they do not have to load and parse a full skill registry on every dispatch.                                             |
| **Briefing Template**   | The 7-component format (Goal · Context docs · Project Standards · Skills to load · Exact instructions · Report format · Rules) every subagent dispatch follows.                                             |
| **Dispatch Pattern**    | One of Single / Sequential / Parallel / Background. Picked per stage in each skill's `## Subagent Dispatch Strategy` section.                                                           |
| **Active Environment**  | The environment URLs and credentials in use for the session (local / staging / production). Resolved from `testing.default_env` in `.agents/project.yaml` or session override.                |
| **Topic Key**           | The stable identifier under which an artefact is saved in engram (e.g. `pbi/{ticket}/impl-plan`). Documented in `agentic-dev-core/references/topic-key-conventions.md`.                 |
| **Supervised worker**   | A persistent agent session, in its own worktree, that a conductor session coordinates through `/orca-orchestration`. Optional: only when the orchestration runtime is reachable (§8). |
| **Worktree**            | A second working directory of the repo on its own branch, so parallel sessions never share uncommitted files. Prepared with `bun run worktree:provision`.                              |

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
│  core (passive reference host, cited by every workflow)             │
│  ┌──────────────────┐                                               │
│  │ agentic-dev-core │  Briefing template · Dispatch patterns ·      │
│  └──────────────────┘  Orchestration doctrine · Skill composition   │
│                                                                     │
│  workflow skills (own a stage of the lifecycle)                     │
│  e.g. project-foundation · design-system · project-bootstrap ·      │
│       product-management · sprint-development · git-flow-master ·   │
│       autonomous-delivery · orca-orchestration                      │
│                                                                     │
│  context skills (hold a synthesized business map, HTML)             │
│  e.g. business-data-context · business-feature-context              │
│                                                                     │
│  utility skills (a CLI's grammar)                                   │
│  e.g. acli (Jira) · vercel-cli (deploy ops)                         │
│                                                                     │
│  Full roster: .agents/skills/REGISTRY.md                            │
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

Every skill declares its kind in `SKILL.md` frontmatter (`metadata.kind`), and `bun run skills:check` gates it:

- **`core`**: `agentic-dev-core`, a passive reference host (briefing template, dispatch patterns, orchestration doctrine, skill-composition strategy, MCP capabilities, artifact lifecycle). Loaded on demand by other skills, never invoked directly.
- **`workflow`**: the skills that own a stage of the lifecycle, from product definition and scaffolding through backlog, per-story delivery, git, PR review, unattended runs, session handoff and multi-session orchestration.
- **`context`**: the `business-*-context` skills, each holding one synthesized business map as HTML, read with `bun run context:map <skill>` and refreshed by `/project-context`.
- **`utility`**: a CLI's grammar (`acli`, `vercel-cli`), auto-loaded when that binary is called (`.agents/instructions/agent-tool-resolution.md` §6.5).

The roster itself is not copied here: `.agents/skills/REGISTRY.md` (built by `bun run skills:registry`) lists every skill with its kind and compact rules, and `.agents/instructions/agent-skills-and-mcps.md` §5 says when each one triggers.

On top of the project-shipped skills, the boilerplate composes with **external skill catalogs** installed via `bun setup`:

- **Community skills** (installed via `bunx skills add`): stack-aware skills that ship the canonical "how to do X in framework Y" knowledge, so the project-shipped skills can stay stack-agnostic; plus CLI companions such as `supabase` and `deploy-to-vercel`. The list is `PROJECT_LEVEL_SKILLS` in `cli/install.ts`; they land in the same `.agents/skills/` store.
- **User-level skills** (cross-cutting, repo-agnostic, they follow the user across every project): the list is `USER_LEVEL_SKILLS` in `cli/install.ts`.
- **Engram** (wired by `engram setup <agent>`): the `engram` MCP for persistent memory.

All skills share the **Knowledge Layer** (the `.context/` directory and the engram MCP): product specs, design tokens, discovery docs, per-ticket memory.

### Bottom tier — the systems the AI operates on

- **Issue tracker** — Jira (Stories, Bugs, Epics) accessed via the `acli` skill (official Atlassian CLI). Drives the `Ready For Dev → In Progress → In Review → Ready For QA` state machine.
- **`[DB_TOOL]`** — the Supabase database, accessed through the Supabase MCP. Used for schema exploration, migrations, type generation, and Discovery.
- **`[API_TOOL]`** — the OpenAPI spec, generated by `bun run api:sync`. Used for contract verification and type generation in the frontend.
- **CI / CD** — Vercel for deploys, GitHub Actions for lint/types/tests on PRs. Which merge triggers the staging deploy depends on the branching strategy in `.agents/project.yaml` → `git_strategy` (the shipped default, `solo-main`, has no `staging` branch); production deploys are human-gated.

The `[TAG_TOOL]` brackets are not decorative. Every skill in this repo writes tool calls in `[TAG_TOOL]` pseudocode, which resolves against the **Tool Resolution** table in `AGENTS.md`. Swap the row, swap the backend — no skill edits required.

---

## 6. Context Engineering: The Knowledge Layer

Context Engineering is the discipline of curating the information the AI reads **before** it acts. An AI that reads the right context does not need to guess, and does not hallucinate. An AI that guesses is dangerous in a production-grade system.

The knowledge layer is organised in three tiers, mirroring the scope at which the information is relevant:

```
┌──────────────────────────────────────────────────────────────┐
│  PROJECT LEVEL                                               │
│  Business model · PRD · SRS · API map · Data map · Feature   │
│  map · Design tokens                                         │
│  Example: the feature map (business-feature-context) tells   │
│  the AI what features exist in THIS codebase.                │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  MODULE / EPIC LEVEL  (Module = Epic, 1:1)                  │
│  Epic scope · Feature plans · Cross-story decisions          │
│  Example: .context/PBI/epics/EPIC-<KEY>-<slug>/ holds        │
│  epic.md plus feature-implementation-plan.md and             │
│  feature-test-plan.md, mirroring epic-level Jira fields.     │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  STORY / TICKET LEVEL                                        │
│  Acceptance criteria · Implementation plan · Review notes ·  │
│  Compliance matrix · Bug-fix root cause                      │
│  Example: .context/PBI/epics/EPIC-<KEY>-<slug>/stories/      │
│  STORY-<KEY>-add-login/implementation-plan.md is the input   │
│  contract for coding.                                        │
└──────────────────────────────────────────────────────────────┘
```

### How it actually looks on disk

```
.context/
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
├── ADR/                              # Architecture Decision Records (append-only, never regenerated)
│   ├── README.md                    #   When-to-write (two-gate) + lifecycle + index
│   ├── ADR-NNNN-template.md         #   Template to copy
│   └── ADR-NNNN-<slug>.md           #   One per hard-to-reverse decision (/project-foundation SRS, /sprint-development Stage 1)
│
├── business/                         # Authored business knowledge (Constitution + glossary)
│   ├── business-model.md            #   Problem, solution, monetization, segments  (/project-foundation Phase 1)
│   ├── market-context.md            #   Industry, competitors, trends              (/project-foundation Phase 1)
│   └── domain-glossary.md           #   Canonical domain terminology     (/project-foundation Phase 4 Step 6; hand-maintained, append-only)
│
├── master-implementation-plan.md     # High-level roadmap                (/project-context master-plan)
├── dev-roadmap.md                    # Ticket-level execution order      (/project-context dev-roadmap)
│
└── PBI/                              # Per-epic + per-ticket memory (Module = Epic, 1:1) — GITIGNORED CACHE; only README.md + templates/ are committed
    ├── README.md                    #   [COMMIT] tier rules + gitignore ladder
    ├── templates/                   #   [COMMIT] skeletons
    ├── epic-tree.md                 #   [SYNC] master index
    ├── bugs/ defects/ improvements/ tests/  # [SYNC] standalone issue types (per work_types registry)
    └── epics/EPIC-<KEY>-<slug>/
        ├── epic.md                  #   [SYNC]
        ├── feature-implementation-plan.md  # [SYNC ← Jira field / stub]
        ├── feature-test-plan.md     #   [SYNC ← Jira field / stub]
        └── stories/STORY-<KEY>-<slug>/
            ├── story.md             #   [SYNC]
            ├── acceptance-criteria.md  # AC                 [SYNC ← Jira field / stub]
            ├── scope.md             #   In-scope            [SYNC ← Jira field / stub]
            ├── out-of-scope.md      #   Out-of-scope        [SYNC ← Jira field / stub]
            ├── business-rules.md    #   Domain rules        [SYNC ← Jira field / stub]
            ├── workflow.md          #   Flow / sequence     [SYNC ← Jira field / stub]
            ├── implementation-plan.md  # Plan               [SYNC ← Jira `spec_implementation_plan` / stub]
            ├── comments.md          #   [SYNC, --include-comments]
            ├── context.md           #   Session context     [LOCAL] disposable
            ├── progress.md          #   Story progress       [LOCAL] disposable
            └── evidence/            #   Screenshots, logs   [LOCAL] disposable
```

The business maps (data, feature, API) are HTML maps inside the `business-data-context`, `business-feature-context` and `business-api-context` skills under `.agents/skills/`; read one with `bun run context:map <slug>`.

The `PBI/` tree is owned by `scripts/sync-jira-issues.ts` and is a **gitignored cache**: everything under `.context/PBI/` is excluded except `README.md` and `templates/`, the only two paths actually tracked in git. Jira is the source of truth; plan history lives in the Jira field's own edit history plus engram, not in git log. `bun run context:hydrate` (`sync-jira-issues pull --include-comments`) rebuilds the whole `[SYNC]` tree from scratch — a fresh clone starts with an almost-empty `PBI/` (just `README.md` and `templates/`), and that is the intended state, not a broken checkout. Detailed CONTENT reads go through the sync — run `bun run jira:sync-issues get <KEY> --include-comments` and read the generated `.md`, never `acli view` (which returns `null` for `customfield_*`). Authoring is Jira-first: write the field (or its fallback comment) → sync → read. Story-level `context.md`, `progress.md`, and `evidence/` are `[LOCAL]`: hand-written, machine-local, disposable — nothing downstream may depend on one existing; durable session state lives under `.session/` and durable evidence goes to Jira.

Plus, at the project root:

- **`DESIGN.md`** — Apache-2.0 spec from Google Labs. The portable visual identity (palette, typography, spacing, components) every AI agent reads. Generated by `/design-system`. An optional opt-in screen-mapping phase extends it with `.context/design/master-design-plan.md` (per-screen specs + US→Screen map): the AI generates portable design briefs, the user produces mockups in Claude Design / Open Design, the bundle returns to `.context/designs/`, and `/sprint-development` builds every UI story against its agreed screen.
- **`AGENTS.md`** — the always-on core of the operational context, loaded every session on Claude Code, OpenCode and Codex: the binding sentence of each critical rule, the behavioral layer, the orchestration core and a router. The rest (tool resolution, the skills catalog, multi-harness wiring, git, the PBI cache) lives in one section per topic under `.agents/instructions/`, read on demand when the router or a hook `ROUTE:` line names it. OpenCode and Codex read it natively; Claude Code reads it through `CLAUDE.md`, a generated one-line `@AGENTS.md` shim that never carries prose of its own.

The canonical shape is documented in `.context/README.md`. The strategic reasoning behind the three-tier split lives in `CONTEXT.md` at the repo root.

### Cross-skill references

A second knowledge surface exists outside `.context/`: the `agentic-dev-core/references/*.md` files. They host the briefing template, the dispatch patterns decision guide, the orchestration doctrine, the topic-key conventions, the model-routing table, and the skill-resolver protocol. Workflow skills cite these files instead of duplicating the content. They are loaded on demand and form part of the practice's knowledge layer even though they live under `.agents/skills/` rather than `.context/`.

| `agentic-dev-core` reference | Purpose                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `briefing-template.md`       | The 7-component subagent briefing format with concrete examples per dispatch pattern.                        |
| `dispatch-patterns.md`       | Decision table + heuristic for picking Single / Sequential / Parallel / Background.                          |
| `orchestration-doctrine.md`  | Cacheable mirror of `AGENTS.md` §Orchestration Mode (Subagent Strategy).                                     |
| `model-routing.md`           | Phase → model alias table (opus for foundation, sonnet for impl, haiku for archive).                         |
| `topic-key-conventions.md`   | Stable engram topic keys per artefact (e.g. `pbi/{ticket}/impl-plan`).                                        |
| `skill-resolver.md`          | Skill-resolver protocol: how the orchestrator looks up compact rules and injects them into subagent prompts. |
| `mcp-capabilities.md`        | Capability vocabulary, tool-name suffix resolution, and the point-of-use STOP when a capability is missing.   |
| `artifact-lifecycle.md`      | Which tracker status every dev artefact lives in, who moves it, and what to do when a status slug is missing. |
| `volatile-facts.md`          | Rule #17: what committed prose may never state (moving counts, mutable lists, dates) and what to name instead. |

The directory listing is the full set; the table above is the part a newcomer meets first.

### Project variables vs runtime credentials

Static project values (`{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, etc.) live in `.agents/project.yaml` — the AI resolves `{{VAR_NAME}}` references against that file once per session. The Atlassian host is a special case, not a `{{VAR_NAME}}`: it lives only in `.agents/project.yaml` → `issue_tracker.atlassian_url`, resolved through the `cli/lib/atlassian-instance.ts` accessor (`bun run jira:url`), and is deliberately absent from `.env` / `.env.example` so a stale local copy can never shadow it. Runtime credentials (`STAGING_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) remain in `.env` and are read at execution time. The two systems are separate by design: `.agents/project.yaml` is committed to the repo, `.env` is gitignored.

Four reference syntaxes coexist across prompts and docs:

| Syntax                         | Purpose                                      | Resolves from                                                                       |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{{VAR_NAME}}`                 | Static project value (flat or env-scoped)    | `.agents/project.yaml`                                                              |
| `{{environments.<env>.<var>}}` | Explicit cross-env reference                 | `.agents/project.yaml` → `environments.<env>.<var>` directly                        |
| `<<VAR_NAME>>`                 | Session/runtime value (e.g. `<<ISSUE_KEY>>`) | Computed by the calling prompt at runtime. Never declared, never persisted.         |
| `{{jira.<slug>}}`              | Jira custom field reference                  | `.agents/jira-required.yaml` (manifest) + `.agents/jira-fields.json` (resolved IDs) |

Validated via `bun run vars:check`, `bun run jira:sync-fields`, and `bun run jira:check`. The full contract lives in `.agents/README.md`.

### Live sources of truth

Static documentation is only half the picture. Before every meaningful action, the AI also pulls from **live** sources: the frontend codebase, backend routes, the Supabase database (via `[DB_TOOL]`), the OpenAPI spec (via `[API_TOOL]`), the Jira tracker (via `acli`), engram memory, official library docs (`[DOCS_TOOL]`) and the web (`[WEB_SEARCH_TOOL]`).

Skills ask for a **capability**, never a server: `library-docs`, `web-search`, `db`, `automation-flows`, `diagrams`. Each resolves by tool-name suffix, whatever prefix the harness gave the server. The project MCP files declare the local servers (whatever `.mcp.json` declares); web search runs at harness level, connected once per machine (Exa first, Tavily second), and never lives in the project files (ADR-0005). When no tool provides a capability, the AI stops at the point of use, names the capability and how to enable it, and waits: no silent fallback. Vocabulary and rules: `agentic-dev-core/references/mcp-capabilities.md`. The Tool Resolution table in `.agents/instructions/agent-tool-resolution.md` §6 is the canonical mapping from each `[TAG_TOOL]` pseudocode tag to its concrete implementation, CLI first and MCP as fallback.

### Why it matters

When the AI opens a ticket a week after the last session, the context is still there — every AC, every team decision, every architectural choice. There is no re-briefing cost. This is how "zero context loss" is maintained sprint over sprint.

---

## 7. Working with the AI harness: Daily Workflow

The daily workflow is plain English, and it is the same on Claude Code, OpenCode and Codex. The developer tells the harness what is needed, and the matching skill auto-triggers on description match.

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

> /project-context data
  → Explicit skill + mode: refreshes the business data map (on OpenCode / Codex: "load project-context, mode data")

> hagamos el handoff
  → Auto-triggers: session-handoff skill (successor session resumes where this one stopped)
```

Auto-triggering is governed by each skill's `description` field, which lists the phrases the skill should respond to. The decision tree in `AGENTS.md` documents the full mapping. Explicit invocation is also supported for cases where determinism is preferred over pattern matching: `/sprint-development`, `/git-flow-master`, or a skill plus a mode (`/project-context dev-roadmap`) on Claude Code; on OpenCode and Codex, name the skill and the mode in prose. A multi-mode skill lists its modes in its own `## Mode routing` section. There are no command files (ADR-0006).

### What happens on invocation

The skill loads its references, opens the PBI folder for the target ticket (or creates it), pulls context from the live sources listed in §6, searches engram for relevant prior work, and dispatches the first subagent of the stage. Everything that happens next is visible in the transcript.

### Recommended stack

The practice runs on this combination of tools. Each is replaceable, but the combination is what the practice expects out of the box:

| Tool                                | Role                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI-native terminal** (Warp, etc.) | Terminal with blocks, smart autocomplete.                                                                                                                                                                       |
| **Claude Code · OpenCode · Codex**  | The AI harness that runs on top — dispatches skills, subagents, MCPs. Pick one; all three read the same `AGENTS.md` and `.agents/skills/`. Open it with its own binary (`claude` / `opencode` / `codex`) or its desktop app. |
| **VSCode · Cursor · Windsurf**      | Editor — personal preference. Pick one.                                                                                                                                                                         |
| **Git** + **gh CLI**                | Version control and PR operations.                                                                                                                                                                              |
| **Bun**                             | Runtime + package manager.                                                                                                                                                                                      |
| **Vercel**                          | Frontend hosting + preview deploys.                                                                                                                                                                             |
| **Supabase**                        | Database, auth, storage.                                                                                                                                                                                        |
| **Jira (via `acli`)**               | Issue tracker — stories, bugs, epics.                                                                                                                                                                           |

The harness is the load-bearing piece — it is the orchestrator that triggers skills, dispatches subagents, and accesses MCPs. Everything else is the developer's working surface around it. Claude Code is the reference harness in this document; the Engram plugin (session hooks) is Claude Code specific, while `engram setup <agent>` wires the Engram MCP server on all three.

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
| Bash for execution (`bun run test`, `bun run types:check`) | — | ✅                     |

`delegate (async)` is the default for delegated work. Synchronous task delegation is used only when the next inline action depends on the result.

**Anti-patterns** — these always inflate context without need:

- Reading 4+ files to "understand" the codebase inline → delegate an exploration.
- Writing a feature across multiple files inline → delegate.
- Running tests or builds inline → delegate.
- Reading files as preparation for edits, then editing → delegate the whole thing together.

### Two executors

One-shot subagents are the default executor: they live inside the turn, read or write or verify, report, and their context is gone. A second, optional executor exists for work that is a whole scope by itself (one story through plan, code and review to an open PR): the **supervised worker**, a persistent agent session in its own worktree and branch that a conductor session coordinates through `/orca-orchestration`, talking to it at any moment in both directions. `/sprint-development` fleet mode runs one worker per story.

It needs the Orca runtime. When the binary or the runtime is missing, the workflow skills stay silent about it and the same work runs on subagents plus the launch lines a human pastes by hand. The conductor keeps every shared-state write (merge, staging deploy, shared-database migration, sprint report) for itself.

Two neighbouring tools are not orchestration. `/session-handoff` hands the whole session to a successor when the context window runs high or the work outlives the session. `/autonomous-delivery` runs the pipeline unattended, on a schedule, with no human on the line.

### Where the doctrine lives

The orchestration model is not improvised per session — it is captured in canonical references that workflow skills load on demand. Engineers and skill authors should know where to look:

- **`AGENTS.md` §Orchestration Mode** — canonical project-level statement of the strategy (delegation rules, briefing format, error protocol).
- **`agentic-dev-core/references/orchestration-doctrine.md`** — cacheable mirror loaded by subagents that need the full doctrine without re-reading `AGENTS.md`.
- **`agentic-dev-core/references/briefing-template.md`** — the seven-component briefing format every dispatch uses (Goal · Context docs · Project Standards · Skills to load · Exact instructions · Report format · Rules).
- **`agentic-dev-core/references/dispatch-patterns.md`** — decision guide for the four patterns (Single, Sequential, Parallel, Background) and when each applies.
- **`## Subagent Dispatch Strategy`** sections inside each workflow `SKILL.md` (`sprint-development`, `project-foundation`, `project-bootstrap`, `product-management`, etc.) — per-stage tables declaring which steps delegate to subagents and with what pattern.

When a skill writes `Use the dispatch defined in §Subagent Dispatch Strategy: Parallel`, that line is shorthand for the full briefing assembled from the references above. The doctrine is a single source, cited from many places.

### Per-phase model routing

Workflow skills carry an advisory `model_preferences` block that maps broad phases (foundation, planning, implementation, review, archive) to a model tier: deep reasoning where it matters, cheap tokens where it does not. The mapping and its rationale live in `agentic-dev-core/references/model-routing.md`; it is advisory, read by dispatchers that pass a model when they launch a subagent.

---

## 9. Quality Gates: Lint, Types, Tests, Review, Deploy

Every change merged to the base branch your `git_strategy` names (and especially every change promoted to `main`) passes through the same gate. There is no "I think it's fine" shipping decision — the verdict is data-driven, owned by `/sprint-development`'s Stage 3 and Stage 4 dispatchers, and enforced by CI.

### The five gates

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│   LINT   │ → │  TYPES   │ → │  TESTS   │ → │  REVIEW  │ → │  DEPLOY  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
   ESLint        tsc           Unit tests      Reviewer       Vercel +
   Prettier      --noEmit                      subagent +     migrations
                                               human          (gated for
                                                              prod)
```

| Gate   | Command                                  | Owner               | Behavior on red                              |
| ------ | ---------------------------------------- | ------------------- | -------------------------------------------- |
| Lint   | `bun run lint:check`                     | Stage 2 verifier #1 | Auto-fix attempt, then escalate              |
| Types  | `bun run types:check`                    | Stage 2 verifier #2 | Surface to impl subagent for fix loop        |
| Tests  | `bun run test`                           | Stage 2 verifier #3 | Surface to impl subagent for fix loop        |
| Review | Reviewer subagent + developer            | Stage 3             | Fix-and-iterate, max 2 loops, then escalate  |
| Deploy | Vercel + Supabase migrations             | Stage 4 + Stage 5   | Rollback playbook ready; prod is human-gated |

The commands above are the names in this repo's `package.json`; a scaffolded app adds its own (a build script, an end-to-end suite). Read `package.json` before quoting one (`AGENTS.md` Critical Rule #10). A deploy counts as done when the deployment for the pushed commit reads `READY`, never because the push or the build request was accepted (Critical Rule #16).

### Pre-flight checklist

Before any push to a protected branch:

- [ ] Plan presented and approved before coding (skill-internal in `/sprint-development`).
- [ ] Imports use the aliases `tsconfig.json` `paths` declares (Next.js `@/`). No deep relative imports.
- [ ] Credentials referenced by variable name (values in `.env`), never hardcoded or printed.
- [ ] Unit tests pass (when applicable; see `/unit-testing`).
- [ ] Lint + types green.
- [ ] No AI attribution in commits ("Generated with Claude Code", "Co-Authored-By: Claude", any harness-branded trailer are forbidden).
- [ ] Every agent-written commit ends with the forensic trailers `Worktree:` then `Session:`, copied from the `AGENT IDENTITY:` line (ADR-0004).
- [ ] Context loaded progressively (not all at once).
- [ ] Push policy resolved from `git_strategy.policy.direct_push_to_protected` (Critical Rule #4): `confirm` asks first, `allowed` pushes without asking, `forbidden` routes through a PR; a missing block behaves as `confirm`.

### Failure protocol

When any gate fails, the orchestrator does NOT auto-fix without approval. It STOPS, reports the failure with full context (which gate, which command, what output), and presents three options: **retry**, **skip-step**, **abort**. The developer decides.

This is the same protocol used in the QA sister repo for test failures — both halves of the agentic engineering practice share the rule: AI works, human decides.

---

## 10. Anatomy of a Story Session

To illustrate how the pieces fit together, here is what a typical story's journey looks like from start to merged code.

Consider a ticket `UPEX-XXX` with a handful of acceptance criteria covering a user-facing feature.

1. **Session Start.** The developer types `implementar UPEX-XXX`. The `sprint-development` skill auto-triggers. The orchestrator searches engram for prior work on this module (`mem_search`), opens the ticket via `acli`, explores the frontend and backend code paths related to the feature, queries the database via the Supabase MCP for relevant schema, and creates the PBI folder for the ticket if it does not exist.

2. **Stage 1 — Planning.** A planner subagent is dispatched (Single pattern, model alias = sonnet). It reads the story, the AC, the module context, and produces `implementation-plan.md`. The plan is presented to the developer with open questions and approved. Jira transitions Ready For Dev → In Progress.

3. **Stage 2 — Implementation.** An implementation subagent picks up the plan and writes code across the listed files. After each batch, three verifiers run in parallel: lint, types and unit tests (`bun run lint:check`, `bun run types:check`, `bun run test` in this repo; the project's `package.json` names its own). Red → fix loop, max 2 iterations. The developer can opt into a TDD slice via `/unit-testing` for any pure function or complex branching.

4. **Stage 3 — Code Review.** The branch is pushed and a PR is opened via `/git-flow-master` (auto-detected branching strategy chooses the base branch). Jira automatically transitions In Progress → In Review. A reviewer subagent (model alias = opus) walks the AC compliance matrix, the code-standards checklist, and the composition patterns. Output: `review.md` and `compliance-matrix.md`, persisted to the gitignored PBI cache and to engram (topic keys `pbi/{ticket}/review`, `pbi/{ticket}/compliance-matrix`) — not committed to the PR branch.

5. **Stage 4 — Staging Deploy.** PR is merged to the base branch the strategy names. Vercel deploys, and the deploy is verified by polling the deployment for the merged commit until it reads `READY`. Supabase migrations run (if any). A background subagent watches health and smoke for N minutes. Jira transitions In Review → Ready For QA.

6. **Stage 5 — Production Deploy (gated).** The developer triggers `/sprint-development` Stage 5 explicitly after QA sign-off (from the sister `agentic-qa-boilerplate`) and business approval. Tag, promote, monitor, rollback-ready.

7. **Memory persistence.** Throughout the session, the orchestrator and subagents call `mem_save` on decisions, bug fixes, conventions, and discoveries — tagged with stable topic keys (`pbi/UPEX-XXX/impl-plan`, `pbi/UPEX-XXX/review`, etc.) so the next session can recover them.

Every artefact is durable in Jira (source of truth, synced into the read-only `.context/PBI/` cache on disk) and in engram — never in git history of the PBI folder itself, which is gitignored by design. The AI produces the plan, writes the code, opens the PR, runs the deploy. The engineer reviews and approves at each checkpoint.

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

New skills are built with `skill-creator` (installed at project level by `cli/install.ts`): it drafts the skill, the test prompts, the evals and the description pass. This repo owns the contract the skill must meet, in `agentic-dev-core/references/skill-scaffold.md`.

1. Create `.agents/skills/<name>/SKILL.md` with the frontmatter the scaffold defines, at minimum:

```markdown
---
name: <skill-name>
description: '<what it does, what it triggers on, what NOT to use it for>'
license: MIT
compatibility: [claude-code, codex, opencode]
compact_rules: |
  - DO: <binding rule>
metadata:
  kind: workflow
---
```

2. A workflow skill also ships `references/` and `evals/evals.json`; a skill that owns stages adds the session banner, `## Phase 0`, a dispatch section built on the 7-component briefing, and a session-close step (the scaffold lists each, per kind).
3. Cite `agentic-dev-core/references/*.md` instead of duplicating the orchestration doctrine, briefing template, or dispatch patterns inline. Keep `SKILL.md` a router; long-form procedures go under `references/`.
4. Run `bun run skills:check` (frontmatter, kind, sections) and `bun run skills:registry` to add the skill's compact rules to `.agents/skills/REGISTRY.md`.
5. Nothing else: Claude Code sees the new folder through the `.claude/skills` alias, OpenCode and Codex read the store directly. If the alias is missing on a fresh clone or worktree, `bun run agents:compat` regenerates it.

### 11.2 Adding a mode to a skill

There are no command files: a skill is invoked by its name plus a mode, on every harness (ADR-0006). A new entry point is a new mode of an existing skill, or a new skill.

1. Add a row to the skill's `## Mode routing` table: the mode name, its trigger phrases, the one reference it loads, and its output.
2. Put the mode's procedure in that reference under `references/`.
3. Users invoke it as `/<skill> <mode>` on Claude Code, or by naming the skill and the mode on OpenCode and Codex. A former command name survives only as a trigger phrase in the skill's `description`.
4. Never add a `.claude/commands/` or `.opencode/commands/` file named like a skill: it would hide the skill's instructions, and `bun run agents:compat:check` refuses it.

### 11.3 Adding a project variable

1. Add the key to `.agents/project.yaml` (top-level if static, under `environments.<env>` if env-scoped).
2. Update `.agents/README.md` if the contract changes.
3. Run `bun run vars:check` to confirm every reference still resolves.

### 11.4 Adding a Jira custom field

1. Add the slug to `.agents/jira-required.yaml` with expected type, options, and consumers.
2. Run `bun run jira:sync-fields` to populate the workspace catalog.
3. Run `bun run jira:check` to confirm the workspace satisfies the manifest.
4. Reference the field in skills as `{{jira.<slug>}}` — never `customfield_XXXXX`.

### 11.5 Adding a new MCP

1. Configure the server in the runtime config of every harness in use (all three in the boilerplate): `.mcp.json` (Claude Code), `opencode.jsonc` (OpenCode) and `.codex/config.toml` (Codex, plus `startup_timeout_sec = 30`). A stdio server that needs `.env` values starts through the `.env` loader on all three, `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <the exact names it reads> -- <server>` (`mcpEnvLoaderArgs` in `cli/lib/agent-compatibility-contracts.ts`), with no `${VAR}` / `{env:}` / `{file:}` / `env_vars` beside it; one that needs no value launches bare. `bun run agents:compat:check` normalizes the three and fails when a server exists in one host only or depends on a different set of `.env` variables. See `docs/mcp/README.md` for the per-host syntax.
2. Decide which **capability** it provides. An existing one (`db`, `library-docs`, …) needs only the server; a new one needs a row in `.agents/instructions/agent-skills-and-mcps.md` §5 "MCPs (decision rules)", in `.agents/instructions/agent-tool-resolution.md` §6 Tool Resolution, and in `agentic-dev-core/references/mcp-capabilities.md`, and the skills that use it declare it in `metadata.requires_capabilities`.
3. Web search never goes in the project files: it is connected per machine, at harness level (ADR-0005).
4. Add the server's variables to `.env.example`, and remember that a missing credential fails silently on every harness (Critical Rule #9): `/mcp` inside a Claude Code session is the check, and a 401/403 is the signal.

### 11.6 Adopting Spec-Driven Development (SDD)

The SDD bloque (`sdd-*` skills) is not auto-installed by `bun setup` (see §3.1 note). Install manually first: `gentle-ai install --agent <agent> --components sdd,skills`. Once installed:

1. Run `/sdd-init` to detect the stack and bootstrap the persistence backend (engram by default).
2. For any substantial change, use `/sdd-new <change-name>` to start the full lifecycle: explore → propose → spec → design → tasks → apply → verify → archive.
3. The bundle sequences and routes its own phases; it composes with this repo's skills but does not replace `/sprint-development` for per-story delivery.

### 11.7 Future hooks (deferred patterns)

The skill architecture leaves room for future enhancements without rework. Documented but not yet implemented:

- **Cross-harness CI.** Each skill declares the harnesses it supports in `compatibility:`. A future CI step could run the same skill on Claude Code, OpenCode and Codex to validate cross-harness reliability.
- **Team-shared engram.** A future cross-machine persistent memory layer (sync between developers, team-shared decisions) could plug into the existing topic-key convention.
- **Per-phase autonomous routing.** A future orchestrator could read each skill's advisory `model_preferences` block and route to a different model automatically without the developer specifying.

These hooks are documented but not implemented. Reopen when there is concrete demand.

---

## 12. Summary of What the Practice Delivers

### What ships in this repository

- **A foundation reference host (`agentic-dev-core`)** — passive library that hosts the canonical orchestration doctrine, briefing template, dispatch patterns, model-routing table, topic-key conventions, and skill-resolver protocol cited by every workflow skill. Loaded on demand; not invoked directly. Foundation files (`AGENTS.md`, `.agents/`, `scripts/`) ship with the cloned repository.
- **A roster of phase-aware AI skills** — auto-triggered by user intent, orchestrated with human-in-the-loop checkpoints. Each tier of the lifecycle has its own skill. The current roster is enumerated in [onboarding.html §9 Skills catalog](onboarding.html).
- **Skills with modes** — a multi-mode skill is invoked by name plus mode (`/project-context data`), the same entry point on every harness; no command files to keep in sync.
- **One source, three harnesses** — `AGENTS.md` + `.agents/skills/` are read natively by OpenCode and Codex and through generated shims by Claude Code; the MCP inventory exists once per host format and is parity-checked. Full wiring in `.agents/instructions/agent-harnesses.md` §5.5.
- **Orchestration and parallel work** — one-shot subagents by default; optional supervised workers in their own worktrees through `/orca-orchestration`; `bun run worktree:provision` and `bun run worktree:audit` for any parallel checkout; `/session-handoff` when a session must continue in a fresh one.
- **Live system integrations** — capabilities resolved through MCPs (the local servers `.mcp.json` declares, plus web search at harness level and engram for memory); first-party CLIs for Jira (acli), GitHub (gh), deploys (vercel, supabase), browser automation (`playwright-cli`).
- **A structured context layer** — project, module, and story-level knowledge, on disk. Project-level docs (product specs, design tokens, discovery docs) are version-controlled; per-ticket memory under `.context/PBI/` is a gitignored cache hydrated from Jira, not a git-tracked artefact.
- **A portable design system (`DESIGN.md`)** — Apache-2.0 Google Labs spec at the project root. Consumed by `/project-bootstrap` and any AI agent reading the repo.
- **Project variable contract** — `.agents/project.yaml` + `.agents/jira-required.yaml` + auto-generated catalogs, validated by `bun run vars:check` and `bun run jira:check`.
- **Persistent memory (engram + Jira, synced on demand into a machine-local `.context/PBI/` cache)** — sessions resume from the exact point they ended. No context loss between days or developers.
- **A per-story dev loop** — Planning → Implementation → Code Review → Staging → (gated) Production. Drives Jira state transitions automatically. Production is always human-gated.
- **A CI / CD pipeline** — Vercel for deploys, GitHub Actions for lint/types/tests on PRs, Supabase migrations on the merge your branching strategy routes to staging.
- **A pre-flight quality gate** — lint + types + tests + review + deploy. Failures stop the line; the developer decides retry / skip / abort.

### The core claim

A development practice that ships features faster, documents every decision, remembers everything across sessions, and never deploys to production without a human gate. Built on the premise that AI handles the mechanical work, and the engineer handles the decisions.

The rest is execution.

---

**See also**:

- [`docs/onboarding.html`](onboarding.html) — operational reference: lifecycle, Jira state machine, skills catalog, commands, MCPs, cheat sheet (served by `bun run onboarding`).
- `AGENTS.md` — always-on L0: the binding sentence of each Critical Rule, the behavioural layer, the orchestration core and the router; the topics it routes to (Tool Resolution, multi-harness wiring, ...) live under `.agents/instructions/`. `CLAUDE.md` is its generated one-line shim.
- `CONTEXT.md` — strategic reasoning behind the three-tier knowledge layer (repo root).
- `docs/methodology/IQL-methodology.md` — phased lifecycle deep-dive.
- `docs/architectures/supabase-nextjs/` — stack-specific configuration.
- `docs/workflows/` — environments, git-flow, OpenAPI sync.
- `INSTALLER.md` — what `bun setup` configures and how its run is shown (phases, the local page, `--headless`): Engram, community skills, MCPs, external CLIs, opt-out.
- `.agents/skills/agentic-dev-core/SKILL.md` — foundation reference host (passive; shared references cited by other skills).
- `.agents/skills/agentic-dev-core/references/orchestration-doctrine.md` — canonical orchestration doctrine cited by every workflow skill.
- `.agents/skills/project-foundation/SKILL.md` — Constitution + PRD + SRS + Discovery skill internals.
- `.agents/skills/design-system/SKILL.md` — DESIGN.md generation skill internals.
- `.agents/skills/project-bootstrap/SKILL.md` — Infrastructure scaffolding skill internals.
- `.agents/skills/product-management/SKILL.md` — Backlog + refinement skill internals.
- `.agents/skills/sprint-development/SKILL.md` — Per-story dev loop skill internals.
- `.agents/skills/unit-testing/SKILL.md` — TDD slice skill internals.
- `.agents/skills/git-flow-master/SKILL.md` — Git operator skill internals.
- `.agents/skills/project-context/SKILL.md` — the context-artifact modes (`data`, `features`, `api`, `master-plan`, `dev-roadmap`, …), listed in its `## Mode routing`.
- `.agents/skills/REGISTRY.md` — every skill with its kind and compact rules (generated by `bun run skills:registry`).
- `.agents/skills/vercel-cli/SKILL.md` — Vercel CLI cookbook: deployment verification, env var sync, build/runtime log streaming, rollback, project linking. Companion to community `deploy-to-vercel`.
- `.context/README.md` — canonical context layout.
- `.agents/README.md` — project variable contract and validation scripts.
- Sister repo: [`agentic-qa-boilerplate`](https://github.com/upex-galaxy/agentic-qa-boilerplate) — the QA half of the practice.

---

> **You are here**: Agentic Development Engineering — why this practice exists and how to extend it. **Read time**: 25 min. **Next**: [`docs/onboarding.html`](onboarding.html) (via `bun run onboarding`) for the operational tour, or [`../CONTEXT.md`](../CONTEXT.md) to see how this repo applies the methodology.
