# The installer — what `bun run setup` configures

> **Audience**: developers cloning `agentic-dev-boilerplate` for the first time, anyone deciding whether to opt into the gentle-ai ecosystem, or anyone trying to understand which CLI / skill / MCP layer does what.
> **Read time**: 10 minutes.
> **Status**: stable as of 2026-05-11.

This doc is the **contract that `cli/install.ts` implements**. It covers the four installer layers — gentle-ai (~30%), community skills via `bunx skills add` (~25%), locally committed workflow skills (~20%), the canonical MCPs (~15%) — plus the external CLI verification step and the opt-out path.

## Before you run setup — prerequisites

`bun run setup` assumes a few tools already exist on `PATH` and that you've already installed **at least one** AI agent CLI (Claude Code or OpenCode). The unified front-of-house checklist lives in [README → Prerequisites](README.md#prerequisites); this is the same list with installer-flavored detail (exact check location, exact failure message, exact code reference).

### Hard blockers — installer exits 1 if missing

| What                                 | Min version | Checked at                                                                                                                                      | Failure message                                                                                     |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Bun**                              | `>= 1.0.0`  | `cli/doctor.ts --preflight` — runs before `cli/install.ts` loads, because install.ts uses Bun built-ins (`runPreflight()`, `doctor.ts:421-446`) | `✗ Preflight failed: Bun X.Y.Z is older than required 1.0.0`                                        |
| **`node_modules/@inquirer/prompts`** | present     | `cli/doctor.ts --preflight` (`INQUIRER_MARKER`, `doctor.ts:45`)                                                                                 | `✗ Preflight failed: Project dependencies not installed (node_modules/@inquirer/prompts missing).`  |
| **Claude Code or OpenCode**          | any         | `cli/install.ts` Step 4 — `stat ~/.claude` and `stat ~/.config/opencode` (`detectAgents()`, `install.ts:444-460`)                               | `No agents detected. Install Claude Code (~/.claude/) or OpenCode (~/.config/opencode/) and rerun.` |
| **`git` + `tar`**                    | any         | Scaffolder upfront (`packages/create-agentic-dev/src/runners.ts:13-31` for `bun`/`git`; `download.ts:25` for `tar`)                             | `ENVIRONMENT: git is required but not found on PATH.` / `GNU/BSD tar not found on PATH.`            |

### Quasi-required — installer warns and offers install commands

| What          | Min version | Checked at                                                                               | Behavior when missing                                                                                                                                                                                                       |
| ------------- | ----------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gentle-ai** | `>= 1.26.5` | `cli/install.ts` Step 2 — `which gentle-ai` + `gentle-ai version` (`install.ts:385-410`) | `log.warn` + interactive prompt offering to print install commands (`brew install gentle-ai` / `go install …@latest`) and exit. Decline → continues without it. Too old → warns and continues with `gentle-ai update` hint. |

### Per-skill CLIs — lazy-required, non-blocking at setup

`cli/install.ts` Step 11 (`verifyExternalClis()`, `install.ts:929-953`) does a **PATH probe only** — runs `which <name>` on POSIX, `where <name>` on Windows. Presence only, no version check. For each missing entry the installer prints:

- `quick:` line — a cross-platform install command (only when one exists, e.g. `bun add -g vercel` or `bun add -g @playwright/cli@latest`).
- `docs:` line — the upstream install guide URL.

Each entry is required by one or more skills; install them as you need them.

| Tool             | Required by                                                                                                          | Source-of-truth                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `gh`             | `/git-flow-master`, `/sprint-development` (PR ops, deploy hand-off), optional `gh repo create` step in the installer | <https://github.com/cli/cli#installation>                                |
| `acli`           | `/acli`, `/sprint-development`, `/product-management` (Jira / Confluence from terminal)                              | <https://developer.atlassian.com/cloud/acli/guides/install-acli/>        |
| `playwright-cli` | `/playwright-cli`, `/sprint-development` (agent-driven browser automation, E2E checks)                               | <https://playwright.dev/agent-cli/introduction>                          |
| `supabase`       | `/supabase`, `/supabase-postgres-best-practices`, `/project-bootstrap`                                               | <https://supabase.com/docs/guides/local-development/cli/getting-started> |
| `vercel`         | `/vercel-cli`, `/deploy-to-vercel`, `/sprint-development` (staging + production deploys; verification, env sync, debug, rollback)        | <https://vercel.com/docs/cli>                                            |
| `resend`         | `/resend-cli`                                                                                                        | <https://resend.com/docs/cli>                                            |
| `jq`             | `/acli` JSON pipelines (`acli ... --json \| jq ...`)                                                                 | <https://jqlang.org/>                                                    |

### Convenience opt-ins — never required

| Tool     | What it buys you                                                                                                                                                                                                                                         | Check                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `direnv` | Bare `claude` / `opencode` see MCP credentials automatically when you `cd` into the repo. Without it, use the `bun claude` / `bun opencode` wrappers (cross-platform, no setup). The installer offers `direnv allow` and a shell hook — safe to decline. | `cli/install.ts` Step 10 (`detectDirenv()` + offer; `install.ts:880-913`) |

> **Windows users**: skip direnv. PowerShell support is experimental and needs direnv 2.37+; Git Bash works but the `bun claude` wrapper is simpler everywhere. Decline the installer's direnv prompt — the wrappers already load `.env`.

### MCP credentials — 10 env vars filled into `.env`

`.mcp.json` (Claude Code) and `opencode.jsonc` (OpenCode) ship with `${VAR}` / `{env:VAR}` placeholders. The installer resolves required vars by scanning the committed configs (`discoverRequiredEnvVars()`, `install.ts:743-749`) — current list backs the 5 canonical MCPs (context7 needs none):

```
TAVILY_API_KEY
ATLASSIAN_URL · ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN
SUPABASE_ACCESS_TOKEN · SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
N8N_API_URL · N8N_API_KEY
```

Generation is interactive (web logins + 2FA), so the installer cannot do it for you. `.env.example` has the full template with per-var comments. Run `bun run setup:doctor` at any time to see which are still missing — every pending credential carries a `where` URL (Tavily dashboard, Atlassian token page, Supabase project settings, n8n API panel).

### Where to verify your status

`bun run setup:doctor` re-runs every check above (read-only) plus 10 MCP `.env` vars + direnv state. Use it after a partial setup to confirm a fix without re-running the full installer. JSON mode (`--json`) emits `pending_actions[]` with `type` / `target` / `hint` / `where` so an AI agent can iterate the list and pick the right tool per item.

---

## Running setup from an AI agent

Most users today ask an AI (Claude Code, OpenCode, Cursor, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

### `bun run setup:doctor` — read-only health check

The fastest way for an AI to figure out **what's wired and what's missing** without changing anything:

```bash
bun run setup:doctor          # human-readable summary
bun run setup:doctor --json   # machine-readable, parse with jq / agent
```

Exit code: `0` when everything is green, `1` when any pending action remains. JSON shape:

```json
{
  "status": "needs-action",
  "platform": "linux",
  "shell": "/usr/bin/bash",
  "is_tty": true,
  "env_vars": { "TAVILY_API_KEY": "set", "N8N_API_KEY": "missing", ... },
  "direnv": { "installed": true, "version": "2.25.2", "envrc_allowed": true, "hook_in_rc": true, "rc_file": "/home/user/.bashrc" },
  "pending_actions": [
    { "type": "credential", "target": "N8N_API_KEY", "hint": "n8n API key for the n8n MCP server", "where": "n8n instance → Settings → API" },
    { "type": "shell_hook", "target": "~/.bashrc", "hint": "Add direnv hook ...", "where": "eval \"$(direnv hook bash)\"" }
  ]
}
```

`pending_actions[].type` is one of: `credential` · `shell_hook` · `system_install` · `shell_command`. The AI iterates the list and picks the right tool per type:

| type             | Who handles it | How                                                                                                                             |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `credential`     | **User**       | AI asks the user for the value in chat (e.g. "paste your Tavily key from https://app.tavily.com"). Then AI writes it to `.env`. |
| `shell_hook`     | **AI**         | AI appends the `where` line to the `target` rc file with its Edit/Bash tool. Trivial.                                           |
| `system_install` | **User**       | AI shows the `where` command; the user runs it (brew/winget/apt may prompt for admin password).                                 |
| `shell_command`  | **AI**         | AI runs the `target` command via Bash.                                                                                          |

### What an AI **cannot** do (hard limits)

- **Generate API tokens** — Tavily / Atlassian / Supabase / n8n keys all require an interactive web login + 2FA. The user creates and pastes them; the AI never sees the generation flow.
- **Decide business config** — e.g. which Supabase project to target, which n8n instance to use, etc. The AI suggests; the user decides.
- **Execute privileged installs cleanly** — `brew install`, `winget install`, `apt install` may show a sudo/admin prompt that lives outside the agent's terminal. The AI runs the command but the user clicks "allow".

### `bun run setup --non-interactive` (or just `bun run setup` without a TTY)

The installer auto-detects no-TTY (an agent invoking it without a terminal) and silently switches to `--non-interactive`. Prompts skip with their default answer. The closing summary lists pending env vars and next steps — same data the doctor exposes. Use this path when the AI wants to run the full setup batch:

```bash
TAVILY_API_KEY=tvly-... \
  ATLASSIAN_URL=... \
  ATLASSIAN_EMAIL=... \
  ATLASSIAN_API_TOKEN=... \
  SUPABASE_ACCESS_TOKEN=... \
  bun run setup --non-interactive
```

Then `bun run setup:doctor --json` to confirm.

### Skip flags (per-step opt-out)

| Env var                 | Effect                           |
| ----------------------- | -------------------------------- |
| `INSTALL_SKIP_DIRENV=1` | Skip direnv detection / autoload |

---

## Launching the agent after setup

`bun run setup` finishes with two recommended ways to start an agent so MCP env vars (e.g. `TAVILY_API_KEY`, `ATLASSIAN_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `N8N_API_KEY`) get loaded from `.env`:

| Method                                      | Platform                                                                                      | One-time setup                                                                                                                                          | Usage                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **`bun claude` / `bun opencode`** (default) | Windows, macOS, Linux                                                                         | None — `dotenv-cli` is a project devDep                                                                                                                 | `bun claude` from the repo root                       |
| **direnv autoload** (optional)              | macOS, Linux, **Windows** (Git Bash recommended; PowerShell experimental, needs direnv 2.37+) | Install direnv (`brew install direnv` / `apt install direnv` / `winget install direnv`) + add hook to your shell rc, then installer runs `direnv allow` | Just `claude` or `opencode` from anywhere in the repo |

### direnv hook per shell

| Shell      | Line to add                               | File                                             |
| ---------- | ----------------------------------------- | ------------------------------------------------ |
| bash       | `eval "$(direnv hook bash)"`              | `~/.bashrc` (also works for Git Bash on Windows) |
| zsh        | `eval "$(direnv hook zsh)"`               | `~/.zshrc`                                       |
| fish       | `direnv hook fish \| source`              | `~/.config/fish/config.fish`                     |
| PowerShell | `Invoke-Expression "$(direnv hook pwsh)"` | `$PROFILE` (requires direnv 2.37+, experimental) |

`.mcp.json` (Claude Code) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` placeholders. Real values live in `.env` (gitignored). If a server returns 401/403 at first call, the matching env var is missing — see `CLAUDE.md` Critical Reminder #12 (stop, fix `.env`, restart the agent session).

---

## Optional UX upgrades

Two community tools that the closing summary recommends. Both are **user-level** (not installed by `bun run setup`) because they modify your global environment, not this repo. They are recommended, not required.

### caveman — token compression skill

What it does: rewrites how the agent talks. Drops articles, fillers, and pleasantries; keeps technical terms exact; code blocks, errors, and security warnings stay in normal English. Net effect on this repo's defaults: ~65–75% fewer output tokens per turn with no loss of substance.

Why we recommend it: every workflow in this repo (`/sprint-development`, `/project-foundation`, `/design-system`, etc.) emits long status reports. Caveman compresses the conversational part without touching the actionable part.

Install (one-time, user-level, ~30s, requires Node ≥ 18):

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 | iex
```

Levels: `lite` (light trim), **`full`** (this repo's default), `ultra` (max compression), `wenyan` (classical Chinese register). Switch with `/caveman lite|full|ultra|wenyan`.

Revert triggers (EN + ES): `"normal mode"`, `"habla normal"`, `"stop caveman"`, `"speak normally"`, `"be verbose"`, `"más detallado"`. Caveman boundaries are built-in — code, commits, PRs, and security warnings always render in normal English.

Docs: <https://github.com/JuliusBrussee/caveman>

If caveman is **not** installed, `CLAUDE.md` §1 #13 becomes a no-op and the agent writes normal terse output. No errors, no degraded behavior.

### ccstatusline — Claude Code statusline configurator

What it does: a TUI configurator for the Claude Code bottom statusline. Lets you surface model name, token usage, current git branch, context-window utilization, and similar metadata at a glance.

> ⚠️ **Run in a SEPARATE terminal with NO agent active.** ccstatusline is a TUI that grabs stdin. If you launch it while Claude Code or OpenCode is running in the same terminal, the two will fight over input and one will hang. Open a fresh terminal, run the command, configure, exit. Then start the agent.

Install + configure (run anywhere, one-time, ~1 min):

```bash
bunx -y ccstatusline@latest
```

Docs: <https://github.com/sirmalloc/ccstatusline>

Cosmetic upgrade — does not change agent behavior. Skip if you prefer the default statusline.

---

## What is gentle-ai and why this repo uses it

[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is a user-level installer that configures AI agents (Claude Code, OpenCode, Cursor, etc.) with curated capabilities. It does not install agents themselves — it tunes the agents you already have.

This repo treats gentle-ai as the install vehicle for **Engram**, the MCP-based persistent memory layer that survives across sessions and compactions. The `bun run setup` invocation uses `gentle-ai install --preset minimal`, which installs **only** Engram — no SDD bundle, no extra skills.

The integration is **not strict**. If you choose to skip gentle-ai, the repo still works: workflow skills committed locally (`/sprint-development`, `/project-foundation`, etc.) keep functioning, and the canonical MCPs are still configured. What you lose is persistent cross-session memory. Section "How to opt out" below details the trade-off.

---

## What gets installed via gentle-ai

When `bun run setup` runs the gentle-ai branch (Engram only, repeated per agent):

### Engram (MCP component, not a skill)

| Slug     | Type      | What it does                                                                                                |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `engram` | Component | Persistent memory across sessions. Auto-saves decisions, bugs, conventions; auto-recalls on session resume. |

> The installer dispatches a single call per agent:
>
> ```sh
> gentle-ai install --agent <agent> --preset minimal
> ```
>
> `--preset minimal` resolves to the `engram` component only (per gentle-ai's `componentsForPreset(PresetMinimal)` source). Re-runs are idempotent: gentle-ai snapshots existing config files (compressed, deduplicated, last 5 retained) before overwriting them with the current version. There is no `--yes` flag — non-interactive runs inherit a non-TTY stdin, so gentle-ai's internal prompts auto-pick their default answer.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.claude/skills/` and are committed to the repo. They install with the clone — no external installer required.

| Skill                 | Trigger                       | Why it stays local                                                                                                                                                                        |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-dev-core`    | (auto, cited by other skills) | Passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills — not invoked directly. |
| `project-foundation`  | `/project-foundation`         | Constitution + PRD + SRS + Discovery (one-time per product)                                                                                                                               |
| `project-bootstrap`   | `/project-bootstrap`          | Backend + frontend skeleton + features (OpenAPI, auth, env)                                                                                                                               |
| `testability-guide`   | `/testability-guide`          | `/qa` page + tool-agnostic credentials artifact (Jira / Confluence / Notion / MCP / CLI / manual). Idempotent re-runs on stack drift.                                                     |
| `product-management`  | `/product-management`         | Backlog seeding + epic creation + INVEST/AC refinement                                                                                                                                    |
| `sprint-development`  | `/sprint-development`         | Per-story dev loop (mega-orchestrator, 12-step workflow)                                                                                                                                  |
| `unit-testing`        | `/unit-testing`               | TDD slice — composable mid-flight from `/sprint-development`                                                                                                                              |
| `git-flow-master`     | (auto)                        | Branching/commit/push/PR strategy auto-detected per repo                                                                                                                                  |
| `acli`                | (auto)                        | Atlassian CLI wrapper for Jira/Confluence terminal work                                                                                                                                   |
| `vercel-cli`          | (auto on `vercel`)            | Vercel CLI cookbook — deployment verification (poll commit SHA + `inspect --wait`), env var sync, build/runtime log streaming, rollback, `.vercel/` linking. Companion to community `/deploy-to-vercel` |
| `agentic-dev-onboard` | `/agentic-dev-onboard`        | End-to-end onboarding guided tour (pending Phase C)                                                                                                                                       |

These skills evolve with the repo and are versioned in git. The split is intentional: gentle-ai owns the **horizontal** ecosystem (apply across all your repos), this repo owns the **vertical** workflow (specific to `agentic-dev-boilerplate`).

---

## External CLIs (verified, not auto-installed)

Step 11 of `bun run setup` calls `verifyExternalClis()`. The installer **does not install** these — it does a **PATH probe only** (`which <name>` on POSIX, `where <name>` on Windows — presence only, no version check) and prints an install hint (`quick:` line when a cross-platform command exists) plus the official docs URL when something is missing. The verify-only stance is deliberate: these are platform-specific tools whose canonical install path differs by OS, and forcing one path would surprise users on others.

| CLI              | Powers in this repo                                                                             | Quick install (cross-platform only — else use docs) | Official docs                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun`            | General-purpose runtime + package manager — this repo runs on bun (scripts, install.ts, dev)    | — (OS-specific — see docs)                          | <https://bun.com/>                                                       |
| `gh`             | GitHub CLI — `gh repo create`, PR ops, `gh api`. Powers Step 9 of the installer                 | — (OS-specific — see docs)                          | <https://github.com/cli/cli#installation>                                |
| `supabase`       | Local Supabase stack, migrations, type generation (`bun run supabase:types`)                    | — (OS-specific — see docs)                          | <https://supabase.com/docs/guides/local-development/cli/getting-started> |
| `vercel`         | Deploy Next.js frontend to Vercel (staging + production via `/sprint-development` deploy steps) + verification, env sync, debug, rollback via `/vercel-cli` | `bun add -g vercel`                                 | <https://vercel.com/docs/cli>                                            |
| `resend`         | Send transactional email via Resend (used by features that integrate email notifications)       | — (OS-specific — see docs)                          | <https://resend.com/docs/cli>                                            |
| `acli`           | Atlassian CLI for Jira/Confluence terminal workflows — used by the `/acli` skill                | — (OS-specific — see docs)                          | <https://developer.atlassian.com/cloud/acli/guides/install-acli/>        |
| `playwright-cli` | Agent-driven browser automation — used by the `/playwright-cli` skill                           | `bun add -g @playwright/cli@latest`                 | <https://playwright.dev/agent-cli/introduction>                          |
| `jq`             | JSON processor — required by `/acli` skill for parsing `acli ... --json` output                 | — (OS-specific — see docs)                          | <https://jqlang.org/>                                                    |

**Cross-platform package-manager recommendation** (the installer prints the OS-matched one):

- **macOS / Linux** → Homebrew: <https://brew.sh>
- **Windows** → Scoop: <https://scoop.sh>

Once installed, use it to install any missing CLI from the table above. The installer NEVER auto-installs OS-specific tools (Rule 4).

### `playwright-cli` is NOT `@playwright/test`

A subtle bit of confusion lives in the Playwright ecosystem. There are **three different identities** that all use the name "playwright":

1. **`@playwright/test`** — a devDep test runner library, installed per-project. It produces no global binary. `which playwright` finds nothing even when this package is installed.
2. **`@playwright/cli`** — a global agent-driven CLI. Installs as the binary `playwright-cli`. This is what powers the `/playwright-cli` skill in this repo.
3. **`/playwright-cli`** — the local workflow skill in `.claude/skills/playwright-cli/`. It calls the `playwright-cli` binary from `@playwright/cli`.

The installer verifies (2). If you need the test runner (1) for E2E suites, add it per-project: `bun add -D @playwright/test`.

### Why verify and not install?

Three reasons:

1. **Cross-platform install paths differ**. macOS prefers Homebrew, Windows prefers winget/scoop, Linux varies by distro. A single auto-install path would be wrong for most users.
2. **Global installs are user-scoped, not repo-scoped**. Installing `vercel` or `supabase` globally as part of `bun run setup` would leak state outside the repo. The installer is opinionated about staying local.
3. **Verify + point at docs** is the polite alternative. When a CLI is missing, the installer prints the official documentation URL on a continuation line so users can install the way that fits their setup.

---

## Troubleshooting

- **gentle-ai not detected after install** — re-run `bun run setup`. The detector probes `which gentle-ai` plus `gentle-ai version`; if either fails the installer falls back to "skip gentle-ai" branch. Confirm the binary is on PATH (`which gentle-ai` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. `.mcp.json` (Claude) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` expansion; real values live in `.env`. Open `.env`, fill the var, and **restart the agent session** — env vars are read once at MCP-server spawn time. See `CLAUDE.md` Critical Reminder #12.
- **MCPs not loading at all** — confirm you launched the agent via `bun claude` / `bun opencode` (wraps with `dotenv-cli`), or that direnv autoload is active (`direnv status` shows your `.envrc` allowed). Launching `claude` directly without either path means MCP placeholders never get expanded.
- **`direnv allow` produced `dotenv_if_exists: command not found`** — this would mean the `.envrc` is using a newer direnv feature than your version supports. The committed `.envrc` uses portable POSIX loading (works on direnv 2.21+), so if you see this, your `.envrc` has been edited locally — restore it from `git checkout .envrc`.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup.
- **How do I uninstall Engram?** — `gentle-ai uninstall --agent <agent> --components engram --yes` removes Engram for that agent. `gentle-ai uninstall --all --yes` removes everything gentle-ai-managed for every supported agent. Backups are created automatically before uninstall.

---

## How to opt out

If you prefer not to use gentle-ai, the installer accepts a "skip" choice. To make it permanent:

1. Edit `.template/installer.state.json` and set `"gentleAi": { "status": "skipped" }`.
2. Re-run `bun run setup`. The installer detects the skipped state and only configures the canonical MCPs.

What you lose:

- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.

What you keep: every workflow skill committed in this repo (`/sprint-development`, `/project-foundation`, etc.) and the canonical MCPs (Tavily, Context7, Supabase, n8n). The repo is fully usable without gentle-ai — the integration is additive.

---

## See also

- [.scratch/plans/GENTLE-AI-RESEARCH.md](./.scratch/plans/GENTLE-AI-RESEARCH.md) — full research doc on the gentle-ai ecosystem (commands, components, agent matrix)
- [CLAUDE.md § Onboarding](./CLAUDE.md) — quick-start entry point for `bun run setup`
- [README.md](./README.md) — project overview and Quick Start
- [docs/setup/README.md](./docs/setup/README.md) — index of remaining setup guides (Jira, MCPs)

---

> **You are here**: What `bun run setup` configures. **Read time**: 10 min. **Next**: `bun run setup:doctor` to verify your install, or [`README.md`](README.md) to navigate the rest.
