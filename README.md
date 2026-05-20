<div align="center">

<pre>
                  ░█████  ░██████ ░███████░███   ░██░████████░██ ░██████                         
                 ░██  ░██░██      ░██     ░████  ░██   ░██   ░██░██                              
                 ░███████░██  ░███░█████  ░██░██ ░██   ░██   ░██░██                              
  ██████████     ░██  ░██░██   ░██░██     ░██ ░██░██   ░██   ░██░██                              
  ██▀▀▀▀▀▀██     ░██  ░██ ░██████ ░███████░██  ░████   ░██   ░██ ░██████                         
  ██ ◉  ◉ ██     ░░   ░░  ░░░░░░  ░░░░░░░ ░░   ░░░░    ░░    ░░  ░░░░░░                          
  ██   3  ██                                                                                     
  ██████████     ░███████░███   ░██ ░██████ ░██░███   ░██░███████░███████░██████                 
   ██    ██      ░██     ░████  ░██░██      ░██░████  ░██░██     ░██     ░██  ░██                
                 ░█████  ░██░██ ░██░██  ░███░██░██░██ ░██░█████  ░█████  ░██████                 
                 ░██     ░██ ░██░██░██   ░██░██░██ ░██░██░██     ░██     ░██  ░██                
                 ░███████░██  ░████ ░██████ ░██░██  ░████░███████░███████░██  ░██                
                 ░░░░░░░ ░░   ░░░░  ░░░░░░  ░░ ░░   ░░░░ ░░░░░░░ ░░░░░░░ ░░   ░░                 
                               Full-Stack Software Engineer                                      
</pre>

<h3>The dev workflow, but AI runs it.</h3>

<p><i>From PRD to Jira stories to staging deploy. Built for real teams shipping real backlogs — every phase has a skill. You decide what to build.</i></p>

<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-EAB308?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

<br />
<br />

<div align="center">

### Get started in one command

</div>

```bash
bunx create-agentic-dev@latest <your-repo-name>
```

<div align="center">

<sub><b>One command.</b> Downloads · scrubs git history · renames the project · runs <code>bun install</code> · launches the interactive installer. <code>@latest</code> is explicit but optional — <code>bunx</code> resolves the <code>latest</code> dist-tag by default.</sub>

</div>

<br />
<br />

## Prerequisites

Before running `bunx create-agentic-dev@latest` or `bun install && bun run setup`, install the **hard blockers**. The installer detects everything else and prints exact install URLs when something is missing — but front-loading these saves a fail-and-retry loop.

### Hard blockers (installer exits 1 if missing)

| Tool                                                                                                      | Min version | Why                                                                                                                 | Install                                                                                |
| --------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Bun**                                                                                                   | `>= 1.0.0`  | Runtime for every script (`bun install`, `bun run setup`, `bun cli/doctor.ts`, every `bun run …` in `package.json`) | `curl -fsSL https://bun.sh/install \| bash` · [docs](https://bun.sh/docs/installation) |
| **Agent CLI** — [Claude Code](https://docs.claude.com/claude-code) **or** [OpenCode](https://opencode.ai) | latest      | `bun run setup` Step 4 probes `~/.claude/` or `~/.config/opencode/`; exits 1 if neither directory exists            | Claude Code: see official docs · OpenCode: see official docs                           |
| `git`                                                                                                     | any         | Scaffolder runs `git init`; pre-commit hooks (Husky) require git; `/git-flow-master` skill depends on it            | [git-scm.com/downloads](https://git-scm.com/downloads)                                 |
| `tar`                                                                                                     | any         | Scaffolder extracts the template tarball                                                                            | Ships with macOS/Linux. Windows: use Git Bash or WSL                                   |

### Quasi-required (installer warns + offers install)

| Tool          | Min version | Why                                                                                                                              | Install                                                                                                                                                                                              |
| ------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gentle-ai** | `>= 1.26.5` | Installs Engram (MCP-based persistent memory across sessions). Framework still runs without it, but cross-session memory is off. | macOS: `brew install gentle-ai` · Linux: `go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest` (needs Go ≥ 1.22) · [repo](https://github.com/Gentleman-Programming/gentle-ai) |

### Per-skill CLIs (lazy-required — needed when the skill runs, not at setup)

These are **not optional** for the workflow — each one is required by a specific skill. They are non-blocking at setup time because the installer cannot guess which skills you will actually use. Install them up front if you plan to use the whole stack, or lazily when the skill that uses them surfaces a missing-binary error.

| Tool             | Required by                                                                                                          | Install                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `gh`             | `/git-flow-master`, `/sprint-development` (PR ops, deploy hand-off), optional `gh repo create` step in the installer | [cli.github.com](https://cli.github.com/)                                                                                                |
| `acli`           | `/acli`, `/sprint-development`, `/product-management` (Jira / Confluence from terminal)                              | [Atlassian docs](https://developer.atlassian.com/cloud/acli/guides/install-acli/)                                                        |
| `playwright-cli` | `/playwright-cli`, `/sprint-development` (agent-driven browser automation, E2E checks)                               | `bun add -g @playwright/cli@latest`                                                                                                      |
| `supabase`       | `/supabase`, `/supabase-postgres-best-practices`, `/project-bootstrap` (local stack, migrations, type gen)           | [supabase.com/docs/guides/local-development/cli/getting-started](https://supabase.com/docs/guides/local-development/cli/getting-started) |
| `vercel`         | `/deploy-to-vercel`, `/sprint-development` (staging + production deploys)                                            | `bun add -g vercel`                                                                                                                      |
| `resend`         | `/resend-cli` (transactional email development + sending)                                                            | [resend.com/docs/cli](https://resend.com/docs/cli)                                                                                       |
| `jq`             | `/acli` JSON pipelines (`acli ... --json \| jq ...`)                                                                 | [jqlang.org](https://jqlang.org/)                                                                                                        |

### Convenience opt-ins (pure UX, never required)

| Tool     | What it buys you                                                                                                                                                                                                                                                              | Install                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `direnv` | Loads `.env` automatically when you `cd` into the repo, so the bare `claude` / `opencode` binaries see MCP credentials. Without it the project ships `bun claude` / `bun opencode` wrappers (via `dotenv-cli`) that do the same thing — direnv just removes the `bun` prefix. | macOS/Linux: `brew install direnv` / `apt install direnv` · [direnv.net](https://direnv.net/) |

> **Windows users**: skip direnv. The `bun claude` / `bun opencode` wrappers already load `.env` cross-platform with zero setup. direnv on PowerShell needs version 2.37+ and is officially experimental; Git Bash works but at that point the wrapper is simpler. The installer will offer the direnv hook; just decline it.

### MCP credentials (`.env` keys)

`.mcp.json` (Claude Code) and `opencode.jsonc` ship with `${VAR}` / `{env:VAR}` placeholders that read from `.env`. Ten keys back the 5 canonical MCPs (context7 needs none):

```
TAVILY_API_KEY
ATLASSIAN_URL · ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN
SUPABASE_ACCESS_TOKEN · SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
N8N_API_URL · N8N_API_KEY
```

`.env.example` has the full template with per-var comments. Run `bun run setup:doctor` at any time to see which are still missing — it prints `pending_actions[].where` URLs for every credential.

### When the installer tells you something is wrong

| Stage                    | Check depth                                                                                                                       | Behavior                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight (Step 0)       | Version compare — reads `process.versions.bun`, parses semver, requires `>= 1.0.0`. Also checks `node_modules/@inquirer/prompts`. | Hard exit 1 with explicit `Fix:` command before any other step.                                                                                                                                   |
| Step 2 — gentle-ai       | Version compare — runs `gentle-ai version`, parses semver, requires `>= 1.26.5`.                                                  | Missing: prints brew + go install commands + docs URL, asks exit-or-continue. Too old: warns and continues with `gentle-ai update` hint.                                                          |
| Step 4 — agents          | Path probe — checks if `~/.claude/` or `~/.config/opencode/` directory exists.                                                    | Neither found: prints both docs URLs, hard exit 1.                                                                                                                                                |
| Step 11 — per-skill CLIs | PATH probe — runs `which <name>` on POSIX, `where <name>` on Windows. Presence only, no version check.                            | Prints `found` / `missing` table; for missing entries adds `quick:` install command (when cross-platform — e.g. `bun add -g vercel`) + `docs:` URL. Non-blocking.                                 |
| direnv (optional)        | Presence + `.envrc` allow status + shell-rc hook line.                                                                            | Pure convenience nudge — `bun claude` / `bun opencode` wrappers already work without it. If absent, lists `system_install` action with install command; safe to decline (recommended on Windows). |
| `bun run setup:doctor`   | Re-runs everything above + 10 MCP `.env` vars + direnv state.                                                                     | Human-readable or `--json` report. Every `pending_action` carries a `where` hint or URL — re-run any time after partial setup.                                                                    |

> **TL;DR**: install **Bun** + **Claude Code (or OpenCode)** before you run setup. Everything else, the installer points you at when you hit it.

<br />
<br />

## Start here — pick your path

| Goal                                                               | What to read / run                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start a new project — magic command (recommended)**              | `bunx create-agentic-dev@latest <your-repo-name>` — official scaffolder ([npm](https://www.npmjs.com/package/create-agentic-dev))                                                                       |
| **Start a new project — GitHub "Use this template"**               | Click [**Use this template**](https://github.com/upex-galaxy/agentic-dev-boilerplate/generate) → clone your new repo → `bun install && bun run setup` (see [Other ways to start](#other-ways-to-start)) |
| **Contribute to the boilerplate itself**                           | `git clone …` then `bun install && bun run setup` (see [Other ways to start](#other-ways-to-start))                                                                                                     |
| **See the repo's mental model before touching anything** (~30 min) | `bun run onboarding` — opens `docs/onboarding.html` with sidebar nav                                                                                                                                    |
| **Methodology / philosophy / extension guide** (~25 min)           | [`docs/agentic-development-engineering.md`](docs/agentic-development-engineering.md)                                                                                                                    |
| **Troubleshooting the installer**                                  | [`INSTALLER.md`](INSTALLER.md)                                                                                                                                                                          |
| **You're an AI agent**                                             | [`CLAUDE.md`](CLAUDE.md) (operational rules) + [`CONTEXT.md`](CONTEXT.md) (knowledge map)                                                                                                               |

> First-timers, use the scaffolder. It handles tarball download, git scrub, rename, `bun install`, and the interactive installer in one shot. The manual clone is for people hacking on the boilerplate itself.

<br />

## What this is

A starter for teams that want AI agents driving the dev workflow — not just autocomplete in the editor, but the whole loop. Define the product, scaffold the stack, refine the backlog, ship every story, deploy to staging. Ten workflow skills cover the phases. Five slash commands handle the chores around them. The testing half (sprint testing, regression, automation) lives in [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate) — pair them or use one.

<br />

## Scaffold a new project

`create-agentic-dev` is the official scaffolder ([npm](https://www.npmjs.com/package/create-agentic-dev), source in [`packages/create-agentic-dev/`](packages/create-agentic-dev/)). One command, full setup:

```bash
bunx create-agentic-dev@latest <your-repo-name>
cd <your-repo-name>
```

> `@latest` pins the resolution to the npm `latest` dist-tag. `bunx` already defaults to `latest` when no tag is specified, so `bunx create-agentic-dev <your-repo-name>` works identically — `@latest` is just explicit. To pin a specific version, use `bunx create-agentic-dev@1.2.3 <your-repo-name>`.

What it does:

1. Downloads `upex-galaxy/agentic-dev-boilerplate` (latest `main`) as a tarball — no git history.
2. Rewrites `package.json` name + `.agents/project.yaml` `project.name`.
3. Initializes a fresh `git init -b main` with an initial commit.
4. Runs `bun install`.
5. Hands off to `bun run setup` — gentle-ai (Engram only), community skills, `.env` wiring for the 5 MCPs (context7, tavily, atlassian, supabase, n8n), direnv autoload, optional `gh repo create`.

Useful flags (full list in [`packages/create-agentic-dev/README.md`](packages/create-agentic-dev/README.md)):

| Flag                           | Effect                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `--here`                       | Bootstrap into the current directory instead of a new one.      |
| `--template <ref>`             | Pin to a branch / tag / SHA instead of `main`.                  |
| `--template-repo <owner/repo>` | Use a fork instead of `upex-galaxy/agentic-dev-boilerplate`.    |
| `--project-key UPEX`           | Pre-fill the Jira project key (otherwise prompted).             |
| `--no-install` / `--no-setup`  | Skip `bun install` or the interactive installer.                |
| `--non-interactive`            | Auto-pick defaults (also auto-detected when no TTY is present). |

Then continue with the per-project workflow:

```bash
# Optional: open the orientation HTML (~30 min repo tour, single file)
bun run onboarding

# Optional, Claude Code only: configure the statusline in a SEPARATE terminal
bunx -y ccstatusline@latest

# Define what to build (one-time)
/project-foundation    # Constitution, PRD, SRS, Discovery
/design-system         # DESIGN.md (optional — Google Labs spec; paleta, tipografía, tokens)

# Scaffold the codebase (one-time)
/project-bootstrap     # Backend, frontend, OpenAPI, env, auth (reads DESIGN.md if present)

# Manage the backlog (continuous)
/product-management    # Seed backlog, refine stories, AC, edge cases

# Implement (per story)
/sprint-development    # Plan -> Code -> Review -> Deploy
/unit-testing          # Composable mid-flight from sprint-development for TDD
```

> Don't chain `bun run onboarding && bun run setup` — the onboarding server is blocking and the chain deadlocks. Run them as separate steps.

> `bunx -y ccstatusline@latest` is Claude Code-only and optional. Run it from a plain terminal with NO agent running — concurrent TUIs fight over stdin and the configurator silently breaks. OpenCode users skip this: the `opencode-subagent-statusline` plugin is already wired into `opencode.jsonc`.

<br />

## Launching the agent

`.mcp.json` (Claude Code) and `opencode.jsonc` ship with `${VAR}` / `{env:VAR}` placeholders — real values live in `.env`. Launch the agent via one of these so env vars actually load:

```bash
# Cross-platform default (uses dotenv-cli, no extra tooling required):
bun claude            # Claude Code
bun opencode          # OpenCode

# Optional: direnv autoload (any OS with direnv installed)
direnv allow          # one-time per repo (the installer offers to run this)
claude                # direct binary picks up .env from your shell
```

direnv works on macOS / Linux / Windows. On Windows install via `winget install direnv` — Git Bash is recommended; PowerShell support is experimental and requires direnv 2.37+. See [INSTALLER.md § Launching the agent](./INSTALLER.md#launching-the-agent-after-setup) for the per-shell hook lines.

<br />

<details>
<summary><b>Other ways to start</b> — GitHub template flow + manual clone for contributors</summary>

<br />

### Use this template (GitHub)

Prefer to start your project **on GitHub from day one** (your own repo, your own remote, full history under your account)? Use GitHub's native template flow:

1. Click [**Use this template → Create a new repository**](https://github.com/upex-galaxy/agentic-dev-boilerplate/generate) on the boilerplate's GitHub page.
2. Pick owner + name for your new repo, choose visibility, create.
3. Clone YOUR new repo locally:
   ```bash
   git clone https://github.com/<your-org>/<your-repo>.git
   cd <your-repo>
   ```
4. Install + configure:
   ```bash
   bun install
   bun run setup        # gentle-ai (Engram only), community skills, .env wiring, MCPs
   ```
5. (Optional) Rename the project inside the codebase: edit `package.json` → `name`, and `.agents/project.yaml` → `project.name`.

> **The magic command does this better.** `bunx create-agentic-dev@latest <your-repo-name>` does everything the template flow does **plus**: scrubs the upstream git history (so your repo doesn't carry boilerplate commits), auto-rewrites `package.json` name and `.agents/project.yaml` `project.name`, runs `bun install`, runs the interactive installer, and optionally creates the GitHub repo for you via `gh` — all in one command. The template route is a good fit only if you want the GitHub repo created via the web UI before any local work.

### Manual clone (contributors)

Hacking on the boilerplate **itself** (skills, installer, scripts, docs)? Clone the repo directly:

```bash
# 1. Clone the boilerplate
git clone https://github.com/upex-galaxy/agentic-dev-boilerplate.git
cd agentic-dev-boilerplate

# 2. (Optional) Install deps + open the orientation
bun install
bun run onboarding   # opens docs/onboarding.html with sidebar nav
                     # Close the tab + Ctrl-C when done

# 3. Install everything (gentle-ai Engram, community skills, MCPs, env)
bun run setup

# Or, do it manually instead of step 3:
bun install
cp .env.example .env   # then fill in the values
```

> Foundation files (`.agents/`, `scripts/`, `CLAUDE.md`) ship with the repo — no bootstrap step needed. À la carte adoption of individual skills is not supported.

> End-users building a new project should NOT clone manually — use `bunx create-agentic-dev@latest` so git history is scrubbed and the project is renamed automatically.

</details>

<br />

## How it works

Skills auto-trigger when your prompt matches their `description` frontmatter — or you force-load with a slash command (`/sprint-development`). Each skill is a `SKILL.md` plus a `references/` folder. The agent only reads what the current step needs, so context stays lean.

Project values (URLs, project key, Jira fields) live in `.agents/project.yaml` and get injected into prompts via a 4-syntax variable system. Skills are grouped by phase: foundation (one-time setup), management (continuous PM), implementation (per-story dev). The QA companion repo follows the same pattern.

<br />

## Skills

### Workflow skills (auto-trigger)

| Skill                  | Phase          | Purpose                                                                                                                                                                                   |
| ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-dev-core`     | foundation     | Passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills — not invoked directly. |
| `/project-foundation`  | foundation     | Constitution + PRD + SRS + Discovery (one-time at conception)                                                                                                                             |
| `/design-system`       | foundation     | DESIGN.md generation (Google Labs spec) before frontend scaffolding — 5 paths                                                                                                             |
| `/project-bootstrap`   | foundation     | Backend / frontend / OpenAPI / auth / env scaffolding (one-time)                                                                                                                          |
| `/testability-guide`   | foundation+    | In-app `/qa` page ("Software Testability Guide for QA") + tool-agnostic credentials artifact (Jira Epic / Confluence / Notion / MCP / CLI / manual paste). Idempotent re-runs.            |
| `/product-management`  | management     | Backlog seed, story refinement (INVEST), AC (Gherkin), edge cases                                                                                                                         |
| `/sprint-development`  | implementation | Per-story mega-orchestrator: Plan -> Code -> Review -> Staging -> (gated) Production                                                                                                      |
| `/unit-testing`        | implementation | TDD, test naming, mocking patterns, coverage. Composable from `/sprint-development`                                                                                                       |
| `/git-flow-master`     | git            | End-to-end Git operator: branches, commits, push, PR, conflicts, chained-PR planning                                                                                                      |
| `/acli`                | tooling        | Atlassian CLI cookbook for Jira Cloud + Confluence Cloud workflows                                                                                                                        |
| `/agentic-dev-onboard` | onboarding     | Walks new users through the repo's dev flow, MCPs, env vars, workflow skills                                                                                                              |

### Reusable community skills (installed by `bun run setup`)

These aren't committed in this repo. The installer fetches them via `bunx skills add` from upstream community repositories. The exact list lives in `cli/install.ts` — source of truth, changes faster than this README, consult the file directly.

After running `/project-foundation` and `/project-bootstrap`, you can also run `bunx autoskills` to auto-detect your concrete stack and add more.

### Skill tiers (T1–T4)

Every skill belongs to one of three tiers. Each tier has different discovery and load rules. Full contract: [`.claude/skills/agentic-dev-core/references/skill-composition-strategy.md`](.claude/skills/agentic-dev-core/references/skill-composition-strategy.md).

| Tier | What                          | Location                                         | Load behavior                                               |
| ---- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| T1   | Project-owned (this repo)     | `.claude/skills/`                                | Silent — load on trigger                                    |
| T3   | Community project-level       | Installed by `install.ts` `PROJECT_LEVEL_SKILLS` | Silent if matched by category                               |
| T4   | Community user-level (global) | Installed by `install.ts` `USER_LEVEL_SKILLS`    | **ASK** user before load (cross-project, not always wanted) |

Validation: `bun run skills:check` checks tier coherence (orphan categories, tier mismatches, missing sections, stale doc paths).

### Slash commands (utilities)

| Command                       | Purpose                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `/sync-ai-memory`             | Audit + sync README, CLAUDE.md, CONTEXT.md, docs/, and onboarding HTML against current repo state |
| `/business-data-map`          | Generate or update `.context/business/business-data-map.md`                                       |
| `/business-feature-map`       | Generate or update `.context/business/business-feature-map.md`                                    |
| `/business-api-map`           | Generate or update `.context/business/business-api-map.md`                                        |
| `/master-implementation-plan` | Generate or update `.context/master-implementation-plan.md`                                       |

<br />

## Repository structure

```
.claude/
├── skills/         # 11 workflow skills (community skills installed by bun run setup)
└── commands/       # 5 utility slash commands
.agents/
├── project.yaml          # Per-project variables (template)
├── jira-required.yaml    # Custom field + work_type manifest
├── jira-fields.json      # Workspace-resolved field IDs (regenerated per project)
├── jira-workflows.json   # Workspace-resolved workflows / statuses / transitions
└── README.md             # The .agents/ contract
.context/                 # Per-project context (PBI, PRD, SRS, business knowledge)
├── business/             # Constitution (business model, market context) + maps (data, feature, api)
├── PRD/                  # Product Requirements
├── SRS/                  # Software Requirements
└── PBI/                  # Per-epic + per-ticket memory
packages/
└── create-agentic-dev/   # Official npm scaffolder (bunx create-agentic-dev …) — own README + tests
cli/                      # install.ts, update-boilerplate.ts, doctor, helpers consumed by bun scripts
scripts/                  # CLI tooling: lint-vars, jira-sync, etc.
templates/                # Files copied into bootstrapped projects by /project-bootstrap
CLAUDE.md                 # Project memory loaded every AI session
CONTEXT.md                # Context Engineering canonical reference
DESIGN.md                 # Visual identity spec (Google Labs, generated by /design-system)
INSTALLER.md              # Contract for `bun run setup` — what each installer layer does
```

<br />

## Variables system

The `.agents/` directory hosts a 4-syntax variable system used by every skill and command.

| Syntax                         | Purpose                                      | Resolves from                                             |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------- |
| `{{VAR_NAME}}`                 | Static project value (flat or env-scoped)    | `.agents/project.yaml`                                    |
| `{{environments.<env>.<var>}}` | Explicit cross-env reference                 | `.agents/project.yaml` -> `environments.<env>.<var>`      |
| `<<VAR_NAME>>`                 | Session/runtime value (e.g. `<<ISSUE_KEY>>`) | Computed by the calling prompt at runtime                 |
| `{{jira.<slug>}}`              | Jira custom field reference                  | `.agents/jira-required.yaml` + `.agents/jira-fields.json` |

See `.agents/README.md` for the full contract.

**Validation scripts:**

```bash
bun run vars:check          # Every {{VAR}} and {{jira.*}} reference resolves
bun run jira:sync-fields   # Discover Jira custom fields -> .agents/jira-fields.json
bun run jira:check         # Validate jira-required.yaml against jira-fields.json
```

<br />

## Common scripts

```bash
bun run lint:check              # Lint codebase
bun run lint:fix          # Auto-fix lint issues
bun run format:fix            # Format with Prettier
bun run format:check      # Check formatting
bun up                    # Update template from upstream (interactive)
bun up --auto             # Non-interactive / CI mode (safe changes only, exit 0 always)
bun up --dry-run          # Preview what would change without writing anything
bun up --rollback         # Restore from most recent backup
bun run api:sync          # Sync OpenAPI spec + generate types
bun run types:gen         # Regenerate lib/types/supabase.ts from the live Supabase schema
bun run vars:check         # Validate {{VAR}} and {{jira.*}} references
bun run jira:sync-fields  # Sync Jira custom fields -> .agents/jira-fields.json
bun run jira:check        # Validate Jira manifest vs catalog
```

`bun up` ahora corre un sync per-archivo con tracking de SHAs por componente vía `.template/boilerplate.lock.json` (schema v6). Detecta archivos modificados localmente y prompta resolución (`[t]heirs / [m]ine / [s]kip`). El flag `--auto` aplica cambios seguros y salta los diverged — ideal para CI o flujos no-interactivos (siempre exit 0). El flag `--dry-run` simula el sync completo sin escribir nada; `--rollback` restaura desde el directorio de backup más reciente (`.backups/update-{ISO-ts}/`). Requiere git ≥ 2.25 (partial clone). Primera corrida sin `.template/boilerplate.lock.json`: bootstrap automático con bulk sync + escritura inicial del estado v6. Detalle del flujo y schema en el JSDoc header de `cli/update-boilerplate.ts` y vía `bun up --help`.

<br />

## Companion repo

The testing side lives in [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate) — sprint-testing, test-documentation, test-automation, regression-testing. Same `.agents/` variable system, same `agentskills.io` layout. Pair them or use one.

<br />

## Cross-agent compatibility

Skills declare `compatibility: [claude-code, copilot, cursor, codex, opencode]` per the [agentskills.io](https://agentskills.io) spec. Slash triggers are Claude Code specific; other agents auto-activate from the same `description` field. The variable system is agent-agnostic.

<br />

## Future hooks

Room for per-phase model routing, an explicit skill registry, Engram-style cross-session memory, and CI-validated cross-agent portability. Notes in `CLAUDE.md`.

<br />

## License

MIT — see [`LICENSE`](LICENSE).

<br />

## Status

Renamed from `ai-driven-project-starter` to `agentic-dev-boilerplate`.

<br />

---

<div align="center">

<sub><b>You are here</b> — project overview for visitors · <b>Read time</b> ~5 min · <b>Next</b>: <code>bunx create-agentic-dev@latest &lt;your-repo-name&gt;</code> to bootstrap · <code>bun run onboarding</code> for the visual repo tour · <a href="INSTALLER.md"><code>INSTALLER.md</code></a> for installer details.</sub>

</div>
