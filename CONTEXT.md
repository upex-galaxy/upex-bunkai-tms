# CONTEXT.md — Context Engineering in This Repo

> **Last update**: 2026-05-19
> **Purpose**: Canonical, operational explanation of how `agentic-dev-boilerplate` structures context so AI agents work effectively against it.
> **Audience**: Humans onboarding the repo, and AI agents that need to understand "where things live and why".
> **Companion files**: `README.md` (overview for humans), `CLAUDE.md` (operational rules loaded each session), `docs/agentic-development-engineering.md` (methodology deep dive).

---

## 1. What is Context Engineering?

**Context Engineering** is the practice of structuring information so AI assistants can work effectively on a codebase without re-reading the world every session. Instead of letting the agent crawl the whole repo on every prompt (expensive, slow, lossy), the repo curates _what_ the agent sees, _when_ it sees it, and _why_.

This repo applies Context Engineering as a first-class architectural concern. Every directory, naming convention, and skill exists to support one of three goals: keep the main conversation lean, route the agent to the right artifact for the task, and persist decisions so they survive sessions and compactions.

### Core Principles

| Principle                  | Description                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| **Token Efficiency**       | Load only what the current task needs                                      |
| **Progressive Loading**    | Start with a summary; pull details on demand                               |
| **Context Relevance**      | Different tasks need different context — match scope to need               |
| **Single Source of Truth** | One place per fact (project values, Jira fields, branching strategy, etc.) |
| **Skills over prompts**    | Executable workflows live in `.claude/skills/`, never as copy-paste files  |

For the theory behind these principles and the broader Agentic Development Engineering philosophy, see `docs/agentic-development-engineering.md`.

---

## 2. Directory Structure (This Project)

```
agentic-dev-boilerplate/
│
├── CLAUDE.md                       Operational context loaded every Claude Code session
├── README.md                       Project overview (humans)
├── CONTEXT.md                      This file — Context Engineering in this repo
│
├── .claude/
│   ├── skills/                     11 workflow skills (executable workflows)
│   └── commands/                   5 utility slash commands
│
├── .agents/                        Project variable contract (SOT for project values)
│   ├── project.yaml                {{VAR_NAME}} resolution
│   ├── jira-required.yaml          Required Jira custom field manifest
│   ├── jira-fields.json            Workspace-resolved Jira field IDs
│   ├── jira-workflows.json         Workspace-resolved Jira statuses + transitions
│   └── README.md                   Variable contract docs
│
├── .context/                       Project memory the AI reads
│   ├── README.md                   Index + generator map (who writes what)
│   ├── business/                   Single source of business knowledge (Constitution + Maps)
│   │   ├── business-model.md       /project-foundation Phase 1 — Business Model Canvas
│   │   ├── market-context.md       /project-foundation Phase 1 — Industry, competitors
│   │   ├── legacy-analysis.md      /project-foundation Phase 1 (optional, legacy projects)
│   │   ├── business-data-map.md    Generated on demand by /business-data-map
│   │   ├── business-feature-map.md Generated on demand by /business-feature-map
│   │   └── business-api-map.md     Generated on demand by /business-api-map
│   ├── PRD/                        /project-foundation Phase 2 — Product Requirements
│   ├── SRS/                        /project-foundation Phase 2 — Software Requirements
│   └── PBI/                        Per-epic / per-ticket backlog artifacts
│
├── docs/                           Human-facing documentation
│   ├── onboarding.html             Single-file HTML onboarding artifact (served by `bun run onboarding`)
│   ├── agentic-development-engineering.md   Methodology deep dive
│   ├── architectures/              Stack-specific guides (e.g. supabase-nextjs)
│   ├── methodology/                IQL, Jira platform, early/mid/late-game testing notes
│   ├── setup/                      MCP, Jira, gentle-ai setup
│   └── workflows/                  git-flow, environments, OpenAPI sync, template updates
│
├── scripts/                        Build/sync scripts (skill registry, OpenAPI, env validation)
├── cli/                            Installer + template updater
├── templates/                      Templated files copied by the installer
└── package.json                    Bun runtime + npm scripts (lint, format, api:sync, etc.)
```

### The `.context/` vs `.claude/` split

This is the load-bearing distinction in the repo. They look adjacent but serve opposite roles:

| Directory           | Contains                                           | When loaded                                |
| ------------------- | -------------------------------------------------- | ------------------------------------------ |
| `.context/`         | Facts about the system (what exists, how it works) | When the AI needs to understand the system |
| `.claude/skills/`   | Workflow instructions (what to do, step by step)   | Auto-triggered by Claude Code on intent    |
| `.claude/commands/` | Standalone slash commands invoked by `/<name>`     | When the user explicitly invokes them      |
| `.agents/`          | Variable resolution + Jira manifest                | Read by linters and skills at runtime      |
| `docs/`             | Learning material for humans                       | When humans need to learn                  |
| `CLAUDE.md`         | Operational rules + project state                  | Every Claude Code session, automatically   |

---

## 3. Stable File Names (Reference With Confidence)

These files have stable names and locations. Any skill, command, or doc can reference them confidently:

| File                                        | Purpose                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `CLAUDE.md`                                 | Project memory, loaded every Claude Code session                         |
| `CONTEXT.md`                                | This file — Context Engineering canonical map                            |
| `README.md`                                 | Project overview for humans                                              |
| `.agents/project.yaml`                      | Project variable values (single source of truth for `{{VAR_NAME}}`)      |
| `.agents/jira-required.yaml`                | Required Jira custom field manifest                                      |
| `.agents/jira-fields.json`                  | Workspace-resolved Jira field IDs                                        |
| `.context/business/business-data-map.md`    | Entities + business flows (generated by `/business-data-map`)            |
| `.context/business/business-feature-map.md` | Feature inventory (generated by `/business-feature-map`)                 |
| `.context/business/business-api-map.md`     | API as journey-enabler (generated by `/business-api-map`)                |
| `.context/master-implementation-plan.md`    | Prioritized feature roadmap (generated by `/master-implementation-plan`) |
| `.claude/skills/REGISTRY.md`     | Compact-rules cache (auto-generated)                                     |
| `.claude/skills/<name>/SKILL.md`            | Skill entry point (auto-loaded by trigger words)                         |

### Skill entry points (most-used)

| Skill                  | When to invoke                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/project-foundation`  | One-time: Constitution → PRD → SRS → Discovery outputs                                                                                             |
| `/design-system`       | One-time: generate `DESIGN.md` (Google Labs spec) before frontend scaffolding                                                                      |
| `/project-bootstrap`   | One-time: backend + frontend + OpenAPI + auth + env scaffolding                                                                                    |
| `/testability-guide`   | One-time (re-runs idempotent): in-app `/qa` page + tool-agnostic credentials artifact (Jira Epic / Confluence / Notion / MCP / CLI / manual paste) |
| `/product-management`  | Continuous: seed backlog, create epics, refine stories (INVEST + AC), sprint reporting                                                             |
| `/sprint-development`  | Per-story: Plan → Code → Review → Staging → (gated) Production                                                                                     |
| `/unit-testing`        | Standalone or composable mid-flight from `/sprint-development` for TDD slices                                                                      |
| `/git-flow-master`     | Any git/PR work — auto-detects branching strategy and adapts                                                                                       |
| `/acli`                | Atlassian CLI cookbook for Jira Cloud + Confluence Cloud                                                                                           |
| `/vercel-cli`          | Vercel CLI cookbook: deployment verification (poll commit SHA + `inspect --wait`), env sync, debug, rollback. Auto-loads on `vercel` Bash calls    |
| `/agentic-dev-onboard` | Walk a new user through the repo's dev flow, MCPs, env vars, skills                                                                                |

### Utility slash commands

| Command                       | Purpose                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/sync-ai-memory`             | Audit + sync `README.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/`, and onboarding HTML against current repo state |
| `/business-data-map`          | Generate/update `.context/business/business-data-map.md`                                                     |
| `/business-feature-map`       | Generate/update `.context/business/business-feature-map.md`                                                  |
| `/business-api-map`           | Generate/update `.context/business/business-api-map.md`                                                      |
| `/master-implementation-plan` | Generate/update `.context/master-implementation-plan.md` (prioritized roadmap)                               |

---

## 4. Workflow Overview

The repo composes work into three layers, in order of how often each runs:

### One-Time Setup (Foundation)

```
/project-foundation   → Constitution + PRD + SRS + Discovery outputs
/design-system        → DESIGN.md (visual identity, before frontend scaffolding)
/project-bootstrap    → Backend + frontend skeleton + OpenAPI + auth + env
/testability-guide    → /qa page + credentials artifact (after infra is live; idempotent re-runs)
```

> Foundation files (`.agents/`, `scripts/`, `CLAUDE.md`) ship with the boilerplate — clone the full repo. No bootstrap step.

**Output:** Populated `.context/` directories, a `DESIGN.md` at the repo root, and a working dev infrastructure.

### Continuous Product Management

```
/product-management   → Seed backlog, add features, create epics, refine stories
                      → Workflow G: sprint reporting (epics/stories/PRs snapshot)
```

### Per-Story Dev Loop

```
/sprint-development           → Planning → Implementation → Code Review → Staging → (gated) Production
                        └── /unit-testing (composable, optional TDD slice)
/git-flow-master      → Branch, commit, push, PR, conflicts, chained-PR planning (auto-adapts to strategy)
```

### Meta-SDD (Spec-Driven Development) — for substantial changes

When a change is big enough that you'd want a written spec before coding, you can opt into the SDD bloque. **Not installed by `bun run setup`** — that runs `gentle-ai install --preset minimal` which provisions Engram only. To use SDD, install it separately at user-level (e.g. `gentle-ai install sdd` or via the agent's skill manager). Once installed, the `/sdd-*` commands become available:

```
/sdd-init       → Detect stack, bootstrap persistence backend
/sdd-explore    → Investigate an idea; no files yet
/sdd-new        → Start a new change (meta-command, orchestrator-handled)
/sdd-ff         → Fast-forward planning: proposal → spec → design → tasks
/sdd-apply      → Implement tasks, check off as you go
/sdd-verify     → Validate implementation against spec
/sdd-archive    → Close the change, persist final state
/sdd-continue   → Continue next dependency-ready phase
/sdd-onboard    → Guided end-to-end walkthrough
```

> **QA workflows** (sprint testing, exploratory testing, automation, regression) live in the sister repo [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate). The two repos are a complementary pair.

---

## 5. Progressive Loading by Role

The agent should load only what the current step needs. Use this table to decide what to read first.

### By Task

| Task                  | Load First                                  | Load If Needed                                   |
| --------------------- | ------------------------------------------- | ------------------------------------------------ |
| **Develop a feature** | `.context/business/business-data-map.md`    | Module `module-context.md` under `.context/PBI/` |
| **Plan a story**      | Story `context.md` + `business-data-map.md` | `PRD/*`, `SRS/*`, relevant skill                 |
| **Write a unit test** | `/unit-testing` skill                       | Existing tests in repo                           |
| **Understand system** | `business-data-map.md` + `PRD/*`            | `SRS/*`, `docs/architectures/`                   |
| **Use an MCP tool**   | `CLAUDE.md` § Tool Resolution               | Specific MCP doc in `docs/setup/`                |
| **Define project**    | `/project-foundation`                       | `/design-system`, `/project-bootstrap`           |
| **Code review**       | `/sprint-development` (Stage 3) + PR diff   | `compliance-matrix.md` if exists                 |

### By Role

| Role                    | Primary Entry Points                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **Developer**           | `/sprint-development` (+ optional `/unit-testing`); `.context/business/business-data-map.md` |
| **Product / PM**        | `/product-management`, `/project-foundation`; `.context/PRD/`, `.context/business/`          |
| **Architect / Founder** | `/project-foundation`; `.context/business/`, `.context/PRD/`, `.context/SRS/`                |
| **DevOps / Infra**      | `/project-bootstrap`; `bun up --help`, `docs/setup/mcp/`                                     |
| **New contributor**     | `/agentic-dev-onboard`; `docs/onboarding.html` (via `bun run onboarding`)                    |

---

## 6. Architectural Decisions (Why This Repo Works This Way)

These are non-obvious decisions baked into the structure. If you find yourself wanting to "improve" one, read the rationale first.

### Backend before Frontend (during `/project-bootstrap`)

Backend scaffolding runs **before** frontend scaffolding because the backend defines the schemas the frontend consumes. The flow is:

```typescript
// 1. Backend defines schemas (project-bootstrap, step 1)
// schemas/user.ts
export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});

// 2. Backend generates types automatically
export type User = z.infer<typeof userSchema>;

// 3. Frontend imports real types (project-bootstrap, step 2)
import type { User } from '@/lib/types';

const UserCard = ({ user }: { user: User }) => {
  return <div>{user.name}</div>; // zero type errors, no mocks
};
```

**Benefits:** zero type mismatches, frontend consumes real APIs not mocks, backend changes propagate to frontend automatically.

### Manual before Automated testing

Exploratory testing runs **before** test automation in the QA sister repo. The trade-off:

| Aspect      | Exploratory (manual) | Automation (E2E/integration) |
| ----------- | -------------------- | ---------------------------- |
| Speed       | 5–30 minutes         | Hours/days to build          |
| Coverage    | UX + logic bugs      | Logic only                   |
| Investment  | Low                  | High                         |
| Flexibility | Total                | Rigid                        |

**Principle:** automate only what's already been validated manually. Don't pay the automation tax on functionality that's broken or about to change.

### Jira-First workflow

Tickets are **created in Jira first** (via `/acli` or MCP), and the real Jira ID drives the local artifact name (e.g. `.context/PBI/UPEX-277-empty-states/`). No locally-invented IDs, no rename churn later, perfect 1:1 traceability between the repo and the tracker.

### Spec-Driven Development (SDD) for substantial changes

For changes big enough to need a written spec, the workflow is spec → design → tasks → apply → verify → archive. Each phase is a separate sub-agent with a fresh context window, persisting artifacts via engram (default) or `openspec/` files. The orchestrator never executes — it delegates.

### Orchestration model

The main conversation is a **command center**, not an executor. Sub-agents do the heavy reading, writing, and running. This keeps the main thread's context lean and lets each sub-agent specialize. The 6-component briefing format (`CLAUDE.md` § Orchestration Mode) is the contract between orchestrator and sub-agent.

### One generator per file under `.context/`

Every file under `.context/` is owned by either a manual editor, a script, or a skill. Files are never hand-edited if a generator exists. This is why `.context/README.md` maintains a "Who generates what" table — if you add a new artifact, add its generator.

---

## 7. Operational Rules (DO's and DON'Ts)

Curated, repo-specific. The full list of generic rules lives in `CLAUDE.md` — this section is the short list of things that go wrong in practice.

### DO

1. **Run `bun run vars:check` after touching any prompt or skill** — validates every `{{VAR}}` and `{{jira.*}}` reference resolves against config.
2. **Read `.context/business/business-data-map.md` before planning a feature** — it's the cheapest way to avoid misunderstanding the domain.
3. **Reference values via `{{VAR_NAME}}` in prompts**, never hardcode URLs/keys/paths.
4. **Treat skills as the workflow source of truth** — if a workflow lives in a doc but not a skill, the doc is wrong.
5. **Save decisions to engram** as you make them (`mem_save`) — they survive sessions and compactions.
6. **Re-run a generator instead of hand-editing** any auto-generated file (e.g. `.claude/skills/REGISTRY.md`, anything under `.context/business/`).
7. **Use `/sync-ai-memory` after a major repo change** — keeps `README.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/`, and the onboarding HTML in sync.

### DON'T

1. **Don't try to invoke `/agentic-dev-core`** — it's a passive reference host, not an invokable command. Foundation files ship with the cloned repo.
2. **Don't create new files under `.context/` without a generator** — they will drift and rot. Add the generator first.
3. **Don't hand-edit `.agents/jira-fields.json` or `.claude/skills/REGISTRY.md`** — both are regenerated by scripts.
4. **Don't load PRD/SRS for simple per-story work** — module-level context is usually enough.
5. **Don't bypass the orchestration model** — main-thread reads of 4+ files are a smell. Delegate.
6. **Don't include AI attribution in commits** (`Co-Authored-By: Claude`, etc.) — commits must look human-authored.
7. **Don't push to `main` without explicit user confirmation.**
8. **Don't conflate `.context/` (facts) with `.claude/skills/` (workflows)** — adding a workflow under `.context/` will not auto-trigger.

---

## 8. When to Update This Repo's Context

Use this table to decide what to re-generate after what kind of change.

| Change                                    | Update                                              | How                                           |
| ----------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Project identity (name, key, URLs)        | `.agents/project.yaml`, then `CLAUDE.md`            | Edit YAML; run `/sync-ai-memory`              |
| New MCP added/removed                     | `CLAUDE.md` § MCPs Available, `.mcp.json`           | Edit manually; run `/sync-ai-memory`          |
| New skill added/removed                   | `.claude/skills/REGISTRY.md`                        | `bun run skills:registry`                     |
| Stack/conventions evolve                  | `.claude/skills/<name>/references/`                 | Edit skill references directly                |
| Domain model pivots                       | `.context/business/business-data-map.md`            | `/business-data-map`                          |
| Feature surface changes                   | `.context/business/business-feature-map.md`         | `/business-feature-map`                       |
| API auth or topology changes              | `.context/business/business-api-map.md`             | `/business-api-map`                           |
| New epic / story refinement               | `.context/PBI/<epic-or-ticket>/*`                   | `/product-management`                         |
| Major rebrand / new visual identity       | `DESIGN.md` at repo root                            | `/design-system`                              |
| This file (`CONTEXT.md`) drifts from repo | Update sections that no longer match the filesystem | Edit manually or `/sync-ai-memory` if covered |

---

## 9. Related Documentation

| File                                                                                         | What you get there                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `README.md`                                                                                  | Project overview for humans (start here for visitors)                                      |
| `CLAUDE.md`                                                                                  | Operational context loaded each Claude Code session                                        |
| `docs/agentic-development-engineering.md`                                                    | Deep dive on the Agentic Development Engineering philosophy                                |
| `docs/onboarding.html`                                                                       | Onboarding for new contributors (single-file HTML, served by `bun run onboarding`)         |
| `.context/README.md`                                                                         | Generator map for `.context/` artifacts                                                    |
| `.agents/README.md`                                                                          | Variable contract: `{{VAR}}`, `{{jira.*}}`, validation scripts                             |
| `INSTALLER.md`                                                                               | What `bun run setup` configures: gentle-ai, community skills, MCPs, external CLIs, opt-out |
| `docs/setup/jira-setup-guide.md`                                                             | Jira workspace setup + custom field configuration                                          |
| Sister repo: [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate) | QA-side workflows (sprint testing, automation, regression)                                 |

---

> **You are here**: Context Engineering canonical map — how this repo structures knowledge for AI agents. **Read time**: 15 min. **Next**: [`docs/agentic-development-engineering.md`](docs/agentic-development-engineering.md) for the methodology deep dive.

---

**Maintenance**: If you find yourself in the codebase and notice that this file no longer matches reality, update the affected section directly or run `/sync-ai-memory` if the drift is covered there. The cost of stale context is paid by every future session — keep it honest.
