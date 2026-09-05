# CONTEXT.md — Context Engineering in This Repo

> **Last update**: 2026-09-03
> **Purpose**: Canonical, operational explanation of how `agentic-dev-boilerplate` structures context so AI agents work effectively against it.
> **Audience**: Humans onboarding the repo, and AI agents that need to understand "where things live and why".
> **Companion files**: `README.md` (overview for humans), `AGENTS.md` (operational rules loaded each session on every supported harness; `CLAUDE.md` is a one-line `@AGENTS.md` shim that Claude Code follows to reach it, see §2.1), `docs/agentic-development-engineering.md` (methodology deep dive).

---

## 1. What is Context Engineering?

**Context Engineering** is the practice of structuring information so AI assistants can work effectively on a codebase without re-reading the world every session. Instead of letting the agent crawl the whole repo on every prompt (expensive, slow, lossy), the repo curates _what_ the agent sees, _when_ it sees it, and _why_.

This repo applies Context Engineering as a first-class architectural concern. Every directory, naming convention, and skill exists to support one of three goals: keep the main conversation lean, route the agent to the right artifact for the task, and persist decisions so they survive sessions and compactions.

### Core Principles

| Principle                  | Description                                                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token Efficiency**       | Load only what the current task needs                                                                                                                                                                                                                      |
| **Progressive Loading**    | Start with a summary; pull details on demand                                                                                                                                                                                                               |
| **Context Relevance**      | Different tasks need different context — match scope to need                                                                                                                                                                                               |
| **Single Source of Truth** | One place per fact (project values, Jira fields, branching strategy, etc.)                                                                                                                                                                                 |
| **Skills over prompts**    | Executable workflows live in `.agents/skills/`, never as copy-paste files                                                                                                                                                                                  |
| **Tool-agnostic context**  | `.agents/` holds the shared substrate (instructions, skills, hook emitter, alias manifest) consumed by every supported harness. `.claude/`, `.opencode/` and `.codex/` hold only thin adapters and generated artifacts, never a second copy of the content |

For the theory behind these principles and the broader Agentic Development Engineering philosophy, see `docs/agentic-development-engineering.md`.

---

## 2. Directory Structure (This Project)

```
agentic-dev-boilerplate/
│
├── AGENTS.md                       Project memory: the only instruction body (loaded every session, every harness)
├── CLAUDE.md                       One-line shim (`@AGENTS.md`) so Claude Code reaches it. Generated, never holds prose
├── README.md                       Project overview (humans)
├── CONTEXT.md                      This file — Context Engineering in this repo
├── .mcp.json                       MCP config: Claude Code
├── opencode.jsonc                  MCP config: OpenCode
│
├── .agents/                        Shared, harness-agnostic substrate (agentskills.io layout)
│   ├── project.yaml                {{VAR_NAME}} resolution (SOT for project values)
│   ├── jira-required.yaml          Required Jira custom field manifest
│   ├── jira-fields.json            Workspace-resolved Jira field IDs
│   ├── jira-workflows.json         Workspace-resolved Jira statuses + transitions
│   ├── README.md                   Variable contract docs
│   ├── skills/                     THE skill store: 16 workflow skills + REGISTRY.md, read by all three harnesses
│   ├── hooks/                      personality-reinject.mjs: one emitter, three adapters
│   └── compatibility/              command-aliases.json: source of every generated slash-command wrapper
│
├── .claude/                        Claude Code adapter: settings.json (hook) + generated commands/ + skills alias (gitignored)
├── .opencode/                      OpenCode adapter: plugins/personality-reinject.js + generated commands/
├── .codex/                         Codex adapter: config.toml (MCP) + hooks.json. Shared by CLI and Desktop
│
├── .context/                       Project memory the AI reads
│   ├── README.md                   Index + generator map (who writes what)
│   ├── business/                   Single source of business knowledge (Constitution + Maps)
│   │   ├── business-model.md       /project-foundation Phase 1 — Business Model Canvas
│   │   ├── market-context.md       /project-foundation Phase 1 — Industry, competitors
│   │   ├── legacy-analysis.md      /project-foundation Phase 1 (optional, legacy projects)
│   │   ├── business-data-map.md    Generated on demand by /business-data-map
│   │   ├── business-feature-map.md Generated on demand by /business-feature-map
│   │   ├── business-api-map.md     Generated on demand by /business-api-map
│   │   └── domain-glossary.md      /project-foundation Phase 4 Step 6 — hand-maintained, append-only
│   ├── PRD/                        /project-foundation Phase 2 — Product Requirements
│   ├── SRS/                        /project-foundation Phase 2 — Software Requirements
│   ├── ADR/                        Architecture Decision Records (human + skill authored, append-only)
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

### The `.context/` vs `.agents/skills/` split

This is the load-bearing distinction in the repo. They look adjacent but serve opposite roles:

| Directory                                   | Contains                                                            | When loaded                                                   |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `.context/`                                 | Facts about the system (what exists, how it works)                  | When the AI needs to understand the system                    |
| `.agents/skills/`                           | Workflow instructions (what to do, step by step)                    | Auto-triggered on intent by every harness                     |
| `.claude/commands/` + `.opencode/commands/` | Generated slash-command aliases (`/<name>` → skill + mode)          | When the user explicitly invokes them (Codex: skill directly) |
| `.agents/` (rest)                           | Variable resolution + Jira manifest + hook emitter + alias manifest | Read by linters, skills and the harness adapters at runtime   |
| `docs/`                                     | Learning material for humans                                        | When humans need to learn                                     |
| `AGENTS.md`                                 | Operational rules + project state                                   | Every session, automatically, on every supported harness      |

### 2.1 Host harnesses: one source, three consumers

The repo runs on **Claude Code, OpenCode, and Codex (CLI + Desktop)**. There is exactly one copy of every instruction and every skill. Where the harnesses genuinely differ (MCP file format, hook API, whether slash commands exist at all) each keeps a thin versioned adapter. Nothing is duplicated.

> Visual walkthrough: [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) (Spanish, published page with diagrams; source `packages/pages-home/harnesses.es.html`). Decision record: [`ADR-0002`](.context/ADR/ADR-0002-multi-harness-single-source.md).

| Surface          | Claude Code                                     | OpenCode                                    | Codex CLI + Desktop                      |
| ---------------- | ----------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native)                        | `AGENTS.md` (native)                     |
| **Skills**       | `.claude/skills` **[generated alias]**          | `.agents/skills/` (native)                  | `.agents/skills/` (native)               |
| **Commands**     | `.claude/commands/*.md` **[generated]**         | `.opencode/commands/*.md` **[generated]**   | none: invoke the skill + mode directly   |
| **Hook**         | `.claude/settings.json` → `UserPromptSubmit`    | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` |
| **MCP**          | `.mcp.json`                                     | `opencode.jsonc`                            | `.codex/config.toml`                     |

**Instructions.** `AGENTS.md` is the only instruction body. OpenCode and Codex load it natively. Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline: a documented import rather than a symlink, so it survives a Windows checkout. Writing operational prose into `CLAUDE.md` is structural drift, and `/sync-ai-memory` stops rather than propagating it.

**Skills.** All 16 skills live committed under `.agents/skills/`, and project-level community skills install into the same store. OpenCode and Codex discover that directory natively. Claude Code reaches the same tree through `.claude/skills`, a POSIX symlink (Windows junction) that is **generated and gitignored**: never committed, never hand-edited.

**Commands.** The 8 slash commands carry no workflow body. `.claude/commands/*.md` and `.opencode/commands/*.md` are short wrappers generated from `.agents/compatibility/command-aliases.json`; each names a target skill plus a mode and forwards `$ARGUMENTS` unchanged. Codex has no wrapper layer and invokes the skill directly. A wrapper that grows a body fails the compatibility check as `contains workflow prose`.

**Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude Code and Codex run it as a `UserPromptSubmit` command hook (the Codex adapter ships a POSIX and a PowerShell command); OpenCode imports the constant from a thin plugin. The contract is enforced by `cli/lib/agent-compatibility-contracts.ts`: no absolute personal paths, no duplicated hook file.

**MCP.** The canonical server set is whatever `.mcp.json` declares (`context7`, `tavily`, `supabase`, `n8n` out of the box; Bunkai adds `playwright` and `dbhub`, six servers in all, see `AGENTS.md` §5.5); every server there must exist in the other two configs. Parity is checked semantically: each native format (JSON / JSONC / TOML) is normalized into a common shape and compared on the `.env` variables each server depends on, so a server missing from one host, or present in one host only, is a failure. The four boilerplate-known ids additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only. Codex cannot expand `${VAR}` inside `args`, so `.codex/config.toml` reaches `tavily` over HTTP with `bearer_token_env_var` and passes `supabase` env-only auth.

**Generated versus versioned (hard rule, `AGENTS.md` Critical Rule #19; upstream numbers it #15).** Every bold `[generated]` cell above is output. Edit the source, then regenerate:

| Generated artifact                                  | Its source                                   | Regenerate              |
| --------------------------------------------------- | -------------------------------------------- | ----------------------- |
| `CLAUDE.md` (one-line `@AGENTS.md` shim)            | `AGENTS.md`                                  | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/`                            | `bun run agents:compat` |
| 8 Claude + 8 OpenCode command wrappers              | `.agents/compatibility/command-aliases.json` | `bun run agents:compat` |

`bun run agents:compat:check` validates the whole contract (shim bytes, alias target, both wrapper sets byte-for-byte against the merged manifest, hook adapters, MCP parity). It runs inside `bun run repo:check`, unconditionally in the pre-push hook, and in pre-commit when a harness surface is staged.

**Project-owned commands and the updater.** A project declares its own slash commands in `.agents/compatibility/command-aliases.project.json` (same schema, optional, never synced): upstream aliases first, overlay overrides by `alias` name or adds, `wrapperHosts` from upstream. A wrapper file no manifest produced fails the check by name instead of being ignored. `bun run up` closes with one "Estado por superficie" table (10 rows, `package.json` and `Verificación` included since 8.1) and ONE parity prompt saved to `.agents/prompts/parity-plan.md`: numbered rows with evidence, one per path, each awaiting `keep project | take upstream | merge` before the AI edits anything; `take upstream` is suggested only where the project lacks the content entirely. `--strict` turns compat errors or blocking findings into exit 1; an aborted run prints `Abortado.` and exits 1; `.claude/settings.json` ships once when missing and then sits on the protected watchlist, never overwritten. On the migration run the `.claude/skills` alias waits for the migration commit (`bun run agents:compat` creates it). Since 8.2 the watchlist also holds `.husky/pre-commit` and `.husky/pre-push` plus whatever a project lists under `updater.protected_paths` in `.agents/project.yaml` (never overwritten, delivered once when missing, drift row per upstream change); every `merge` row on a watched file says what to port and what to keep, and the identity files (`project.yaml`, `jira-required.yaml`) compare structure only (`informational` rows).

**Harness-specific facts worth knowing.** Codex loads project `.codex/` config and hooks only in a repository marked trusted, and `bun run setup:doctor` reports that trust as WARN because it is runtime state no file read can verify. Codex Desktop consumes the same repository config as the CLI: no second convention, no extra directory. Engram and caveman are Claude Code plugins; the rules that mention them are no-ops on a host where the plugin is absent. The `Claude-Session:` commit trailer is emitted only when the running harness exposes a transcript pointer; OpenCode and Codex sessions omit it.

---

## 3. Stable File Names (Reference With Confidence)

These files have stable names and locations. Any skill, command, or doc can reference them confidently:

| File                                         | Purpose                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                  | Project memory, loaded every session on every harness (the only instruction body)                                                                           |
| `CLAUDE.md`                                  | One-line shim (`@AGENTS.md`) so Claude Code reaches `AGENTS.md`. Never holds prose of its own                                                               |
| `CONTEXT.md`                                 | This file — Context Engineering canonical map                                                                                                               |
| `README.md`                                  | Project overview for humans                                                                                                                                 |
| `.agents/project.yaml`                       | Project variable values (single source of truth for `{{VAR_NAME}}`)                                                                                         |
| `.agents/jira-required.yaml`                 | Required Jira custom field manifest                                                                                                                         |
| `.agents/jira-fields.json`                   | Workspace-resolved Jira field IDs                                                                                                                           |
| `.context/business/business-data-map.md`     | Entities + business flows (generated by `/business-data-map`)                                                                                               |
| `.context/business/business-feature-map.md`  | Feature inventory (generated by `/business-feature-map`)                                                                                                    |
| `.context/business/business-api-map.md`      | API as journey-enabler (generated by `/business-api-map`)                                                                                                   |
| `.context/business/domain-glossary.md`       | Canonical domain terminology — hand-maintained, append-only; wins over older docs                                                                           |
| `.context/master-implementation-plan.md`     | Prioritized feature roadmap — EPIC/strategy (generated by `/master-implementation-plan`)                                                                    |
| `.context/dev-roadmap.md`                    | Ticket-level dependency execution roadmap — TICKET/sequence (generated by `/dev-roadmap`; subsumes `sprint-sequence.md`)                                    |
| `.context/design/master-design-plan.md`      | Per-screen fidelity specs + US→Screen map (opt-in, generated by `/design-system` screen-mapping; consumed by `/sprint-development` per `AGENTS.md` Rule 14) |
| `.context/designs/<project>/<batch>/`        | Screen-mockup drop zone: `BRIEF.md` (generated design brief) + bundle exported from Claude Design / Open Design                                             |
| `.context/ADR/README.md`                     | ADR convention — when to write one, status lifecycle, index (append-only)                                                                                   |
| `.agents/skills/REGISTRY.md`                 | Compact-rules cache (auto-generated)                                                                                                                        |
| `.agents/skills/<name>/SKILL.md`             | Skill entry point (auto-loaded by trigger words)                                                                                                            |
| `.agents/hooks/personality-reinject.mjs`     | Shared hook emitter; the three harness adapters call into it                                                                                                |
| `.agents/compatibility/command-aliases.json` | Alias manifest: source of every generated slash-command wrapper                                                                                             |

### Skill entry points (most-used)

| Skill                  | When to invoke                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/project-foundation`  | One-time: Constitution → PRD → SRS → Discovery outputs                                                                                                                                                        |
| `/design-system`       | One-time: generate `DESIGN.md` (Google Labs spec) before frontend scaffolding. Re-invocable: opt-in screen-mapping (design briefs → external mockups → `master-design-plan.md`)                               |
| `/project-bootstrap`   | One-time: backend + frontend + OpenAPI + auth + env scaffolding                                                                                                                                               |
| `/testability-guide`   | One-time (re-runs idempotent): in-app `/qa` page + tool-agnostic credentials artifact (Jira Epic / Confluence / Notion / MCP / CLI / manual paste)                                                            |
| `/product-management`  | Continuous: seed backlog, create epics, refine stories (INVEST + AC), sprint reporting                                                                                                                        |
| `/sprint-development`  | Per-story: Plan → Code → Review → Staging → (gated) Production                                                                                                                                                |
| `/unit-testing`        | Standalone or composable mid-flight from `/sprint-development` for TDD slices                                                                                                                                 |
| `/autonomous-delivery` | Scheduled / unattended: audits real state (git is truth), selects genuinely unblocked work, dispatches the owning pipeline skill, reports. Modes: `story` (1 per run), `bug` (up to 3), `discovery` (no code) |
| `/git-flow-master`     | Any git/PR work — auto-detects branching strategy and adapts                                                                                                                                                  |
| `/project-context`     | Business maps + master plan + dev roadmap, one mode per run (`data` · `features` · `api` · `master-plan` · `dev-roadmap`); the slash commands below alias into it                                             |
| `/sync-ai-memory`      | Audit + sync `README.md`, `AGENTS.md`, `CONTEXT.md`, `docs/` and the onboarding HTML; stops on prose in the `CLAUDE.md` shim                                                                                  |
| `/jira-administration` | Jira admin, one mode per run: `components` or `instance-migration`; sealed behind explicit approval                                                                                                           |
| `/acli`                | Atlassian CLI cookbook for Jira Cloud + Confluence Cloud                                                                                                                                                      |
| `/vercel-cli`          | Vercel CLI cookbook: deployment verification (poll commit SHA + `inspect --wait`), env sync, debug, rollback. Auto-loads on `vercel` Bash calls                                                               |
| `/agentic-dev-onboard` | Walk a new user through the repo's dev flow, MCPs, env vars, skills                                                                                                                                           |

### Utility slash commands (transport aliases)

Each command is a generated wrapper (`.claude/commands/`, `.opencode/commands/`) declared in `.agents/compatibility/command-aliases.json`; it names a target skill plus a mode and forwards `$ARGUMENTS`. Codex has no wrapper layer: invoke the skill and mode directly.

| Command                       | Alias of                                        | Purpose                                                                                                                                                |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/sync-ai-memory`             | `sync-ai-memory`                                | Audit + sync `README.md`, `AGENTS.md`, `CONTEXT.md`, `docs/`, and onboarding HTML against current repo state                                           |
| `/business-data-map`          | `project-context` mode `data`                   | Generate/update `.context/business/business-data-map.md`                                                                                               |
| `/business-feature-map`       | `project-context` mode `features`               | Generate/update `.context/business/business-feature-map.md`                                                                                            |
| `/business-api-map`           | `project-context` mode `api`                    | Generate/update `.context/business/business-api-map.md`                                                                                                |
| `/master-implementation-plan` | `project-context` mode `master-plan`            | Generate/update `.context/master-implementation-plan.md` (EPIC/strategy roadmap)                                                                       |
| `/dev-roadmap`                | `project-context` mode `dev-roadmap`            | Generate/update `.context/dev-roadmap.md` (TICKET/sequence roadmap — dependency edges, execution sprints, mockup-gates; subsumes `sprint-sequence.md`) |
| `/jira-instance-migration`    | `jira-administration` mode `instance-migration` | Repoint the repo at a new Atlassian instance (`.agents/project.yaml` + `acli` session) and regenerate the `.agents/` catalogs                          |
| `/jira-components`            | `jira-administration` mode `components`         | Reconcile a Jira project's Components against the app's real modules, plan-first with explicit approval                                                |

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

> Foundation files (`.agents/`, `scripts/`, `AGENTS.md`) ship with the boilerplate — clone the full repo. No bootstrap step. The Claude Code alias (`.claude/skills`) is generated by `bun run setup` / `bun run agents:compat`, not cloned.

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

| Task                  | Load First                                  | Load If Needed                                                             |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| **Develop a feature** | `.context/business/business-data-map.md`    | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/story.md` |
| **Plan a story**      | Story `context.md` + `business-data-map.md` | `PRD/*`, `SRS/*`, relevant skill                                           |
| **Write a unit test** | `/unit-testing` skill                       | Existing tests in repo                                                     |
| **Understand system** | `business-data-map.md` + `PRD/*`            | `SRS/*`, `docs/architectures/`                                             |
| **Use an MCP tool**   | `AGENTS.md` § Tool Resolution               | Specific MCP doc in `docs/setup/`                                          |
| **Define project**    | `/project-foundation`                       | `/design-system`, `/project-bootstrap`                                     |
| **Code review**       | `/sprint-development` (Stage 3) + PR diff   | `compliance-matrix.md` if exists                                           |

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

Tickets are **created in Jira first** (via `/acli` or MCP), and the real Jira ID drives the local artifact name (e.g. `.context/PBI/epics/EPIC-UPEX-200-<epic>/stories/STORY-UPEX-277-empty-states/`). No locally-invented IDs, no rename churn later, perfect 1:1 traceability between the repo and the tracker.

### Spec-Driven Development (SDD) for substantial changes

For changes big enough to need a written spec, the workflow is spec → design → tasks → apply → verify → archive. Each phase is a separate sub-agent with a fresh context window, persisting artifacts via engram (default) or `openspec/` files. The orchestrator never executes — it delegates.

### Orchestration model

The main conversation is a **command center**, not an executor. Sub-agents do the heavy reading, writing, and running. This keeps the main thread's context lean and lets each sub-agent specialize. The 6-component briefing format (`AGENTS.md` § Orchestration Mode) is the contract between orchestrator and sub-agent.

### One source, three harnesses

Instructions and skills exist exactly once (`AGENTS.md`, `.agents/skills/`); Claude Code, OpenCode and Codex each reach them through a generated shim, alias or native discovery, and only the surfaces where hosts genuinely differ (MCP format, hook API, slash-command existence) carry a thin adapter. The alternative, one copy per harness, was tried implicitly (the repo was Claude-only with `.claude/` as the source) and rejected because every duplicated instruction drifts. Rationale, alternatives and the migration path for older projects: [`ADR-0002`](.context/ADR/ADR-0002-multi-harness-single-source.md); wiring: §2.1 above.

### One generator per file under `.context/`

Every file under `.context/` is owned by either a manual editor, a script, or a skill. Files are never hand-edited if a generator exists. This is why `.context/README.md` maintains a "Who generates what" table — if you add a new artifact, add its generator.

**Exception — `.context/ADR/` (append-only, no generator).** Architecture Decision Records are the one `.context/` artifact that is **authored, never regenerated**. A human architect (or an AI workflow drafting for human approval — `/project-foundation` SRS phase, `/sprint-development` Stage 1) writes one per important, hard-to-reverse decision. They are append-only: superseded by a newer ADR that links back, never overwritten or deleted. Do not "re-run an owner" to refresh an ADR — supersede it. See `.context/ADR/README.md` for the when-to-write rule, status lifecycle, and template.

---

## 7. Operational Rules (DO's and DON'Ts)

Curated, repo-specific. The full list of generic rules lives in `AGENTS.md` — this section is the short list of things that go wrong in practice.

### DO

1. **Run `bun run vars:check` after touching any prompt or skill** — validates every `{{VAR}}` and `{{jira.*}}` reference resolves against config.
2. **Read `.context/business/business-data-map.md` before planning a feature** — it's the cheapest way to avoid misunderstanding the domain.
3. **Reference values via `{{VAR_NAME}}` in prompts**, never hardcode URLs/keys/paths.
4. **Treat skills as the workflow source of truth** — if a workflow lives in a doc but not a skill, the doc is wrong.
5. **Save decisions to engram** as you make them (`mem_save`) — they survive sessions and compactions.
6. **Re-run a generator instead of hand-editing** any auto-generated file (e.g. `.agents/skills/REGISTRY.md`, anything under `.context/business/`, and every harness surface: `CLAUDE.md`, `.claude/skills`, `.claude/commands/*.md`, `.opencode/commands/*.md` via `bun run agents:compat`).
7. **Use `/sync-ai-memory` after a major repo change** — keeps `README.md`, `AGENTS.md`, `CONTEXT.md`, `docs/`, and the onboarding HTML in sync.
8. **Run `bun run agents:compat:check` after touching `AGENTS.md`, `.agents/`, `.claude/`, `.opencode/`, `.codex/` or an MCP config** — it is the gate pre-push runs anyway; failing it early is cheaper.

### DON'T

1. **Don't try to invoke `/agentic-dev-core`** — it's a passive reference host, not an invokable command. Foundation files ship with the cloned repo.
2. **Don't create new files under `.context/` without a generator** — they will drift and rot. Add the generator first.
3. **Don't hand-edit `.agents/jira-fields.json` or `.agents/skills/REGISTRY.md`** — both are regenerated by scripts.
4. **Don't load PRD/SRS for simple per-story work** — module-level context is usually enough.
5. **Don't bypass the orchestration model** — main-thread reads of 4+ files are a smell. Delegate.
6. **Don't include AI attribution in commits** (`Co-Authored-By: Claude`, etc.) — commits must look human-authored.
7. **Don't push to `main` without explicit user confirmation.**
8. **Don't conflate `.context/` (facts) with `.agents/skills/` (workflows)** — adding a workflow under `.context/` will not auto-trigger.
9. **Don't write prose into `CLAUDE.md` or hand-edit a generated wrapper** — `CLAUDE.md` is the `@AGENTS.md` shim, `.claude/skills` is an alias, and `.claude/commands/*.md` / `.opencode/commands/*.md` come from the alias manifest. Edit the source and run `bun run agents:compat` (`AGENTS.md` Critical Rule #19).

---

## 8. When to Update This Repo's Context

Use this table to decide what to re-generate after what kind of change.

| Change                                    | Update                                                                                                                           | How                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Project identity (name, key, URLs)        | `.agents/project.yaml`, then `AGENTS.md`                                                                                         | Edit YAML; run `/sync-ai-memory`                                                                                        |
| New MCP added/removed                     | `AGENTS.md` § MCPs, `.mcp.json` + `opencode.jsonc` + `.codex/config.toml` (all three, parity-checked)                            | Edit manually; `bun run agents:compat:check`; run `/sync-ai-memory`                                                     |
| New skill added/removed                   | `.agents/skills/REGISTRY.md`                                                                                                     | `bun run skills:registry` (OpenCode and Codex read the store directly; Claude Code sees it through the generated alias) |
| New or renamed slash command              | `.agents/compatibility/command-aliases.json`, then both wrapper sets                                                             | Edit the manifest; `bun run agents:compat`                                                                              |
| Hook contract text changes                | `.agents/hooks/personality-reinject.mjs`                                                                                         | Edit the emitter; `bun run agents:compat:check`                                                                         |
| Stack/conventions evolve                  | `.agents/skills/<name>/references/`                                                                                              | Edit skill references directly                                                                                          |
| Domain model pivots                       | `.context/business/business-data-map.md`                                                                                         | `/business-data-map`                                                                                                    |
| Feature surface changes                   | `.context/business/business-feature-map.md`                                                                                      | `/business-feature-map`                                                                                                 |
| API auth or topology changes              | `.context/business/business-api-map.md`                                                                                          | `/business-api-map`                                                                                                     |
| Hard-to-reverse architecture decision     | `.context/ADR/ADR-NNNN-<slug>.md` (new file; supersede, never edit)                                                              | Author per `.context/ADR/README.md` (human, or `/project-foundation` SRS / `/sprint-development` Stage 1)               |
| New epic / story refinement               | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/*` (or `.context/PBI/epics/EPIC-<KEY>-<slug>/*` for epic-level) | `/product-management` (authors content in Jira) + `bun run context:hydrate` (pulls the gitignored local cache)          |
| Major rebrand / new visual identity       | `DESIGN.md` at repo root                                                                                                         | `/design-system`                                                                                                        |
| New UI screens need mockups (per feature) | `.context/designs/<project>/<batch>/` (brief + bundle) + `.context/design/master-design-plan.md` (UPSERT)                        | `/design-system` screen-mapping phase (opt-in)                                                                          |
| This file (`CONTEXT.md`) drifts from repo | Update sections that no longer match the filesystem                                                                              | Edit manually or `/sync-ai-memory` if covered                                                                           |

---

## 9. Related Documentation

| File                                                                                         | What you get there                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `README.md`                                                                                  | Project overview for humans (start here for visitors)                                         |
| `AGENTS.md`                                                                                  | Operational context loaded each session, on every supported harness (`CLAUDE.md` is its shim) |
| `.context/ADR/ADR-0002-multi-harness-single-source.md`                                       | Why instructions and skills exist once and how each harness reaches them                      |
| `docs/agentic-development-engineering.md`                                                    | Deep dive on the Agentic Development Engineering philosophy                                   |
| `docs/onboarding.html`                                                                       | Onboarding for new contributors (single-file HTML, served by `bun run onboarding`)            |
| `.context/README.md`                                                                         | Generator map for `.context/` artifacts                                                       |
| `.context/ADR/README.md`                                                                     | Architecture Decision Records — when to write one, status lifecycle, index (append-only)      |
| `.agents/README.md`                                                                          | Variable contract: `{{VAR}}`, `{{jira.*}}`, validation scripts                                |
| `INSTALLER.md`                                                                               | What `bun run setup` configures: gentle-ai, community skills, MCPs, external CLIs, opt-out    |
| `docs/setup/jira-setup-guide.md`                                                             | Jira workspace setup + custom field configuration                                             |
| Sister repo: [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate) | QA-side workflows (sprint testing, automation, regression)                                    |

---

> **You are here**: Context Engineering canonical map — how this repo structures knowledge for AI agents. **Read time**: 15 min. **Next**: [`docs/agentic-development-engineering.md`](docs/agentic-development-engineering.md) for the methodology deep dive.

---

**Maintenance**: If you find yourself in the codebase and notice that this file no longer matches reality, update the affected section directly or run `/sync-ai-memory` if the drift is covered there. The cost of stale context is paid by every future session — keep it honest.
