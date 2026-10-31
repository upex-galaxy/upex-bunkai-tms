# The installer — what `bun setup` configures

> **Audience**: developers cloning `agentic-dev-boilerplate` for the first time, anyone deciding whether to wire Engram persistent memory, or anyone trying to understand which CLI / skill / MCP layer does what.
> **Read time**: 10 minutes.
> **What changed and when**: [`CHANGELOG.md`](CHANGELOG.md).

This doc is the **contract that `cli/install.ts` implements**. It covers the four installer layers — Engram via `engram setup` (~30%), community skills via `bunx skills add` (~25%), locally committed workflow skills (~20%), the canonical MCPs (~15%) — plus the external CLI verification step, the multi-harness compatibility repair, and the opt-out path.

## Install flow

`bun setup` runs in named phases. On a terminal with a screen it opens a local page (127.0.0.1, a per-run token in the address) that shows the phases as a timeline, explains each step, and asks every question as a card; the terminal keeps printing the whole log. `bun setup --headless` keeps everything in the terminal. Where the page opens and where it does not is under [Where the run is shown](#where-the-run-is-shown) below. The phase list is the header comment of `cli/install.ts`, and `bun setup --help` lists the flags.

Every step stamps `.template/installer.state.json` the moment it ends, so a re-run skips what is done and an interrupted run resumes where it stopped. The step keys keep their earlier names (`agentsSetupRanAt` for the Engram wiring, ...) so state files written by older installers still gate the re-run.

### Preflight

Before any question and any write, `cli/preflight.ts` (Node built-ins only, so it works on a clone with no `node_modules`) checks everything knowable in seconds: the tools, at least one AI agent, the project folder, the network hosts the downloads need, free disk, the template copy and the `.env` permissions. Each row is ok, info, a warning or a block. A block stops the run before anything is written (the page offers "check again"); a warning is shown and the run goes on. `bun setup` runs the gate part first (`package.json` `setup`): when Bun is too old it stops, and when the dependencies are missing it runs `bun install` itself. After a clear or warned checklist the installer asks once whether to start. Which rows block and which warn: [What the preflight checks](#what-the-preflight-checks) below.

### Team

Which AI agents this project works with: Claude Code, OpenCode, Codex (see [Harness detection](#harness-detection-team-phase)). The selection is recorded in `.agents/project.yaml` as `harnesses:`. Team also asks what the Install phase needs, so the downloads can start without waiting for anyone: the user-level community skills (one checkbox per skill, see [What stays local](#what-stays-local-committed-in-this-repo)) and, on Claude Code, whether to add the Engram plugin.

### Install (in the background)

Starts as soon as Team is answered and runs in a background lane ("En segundo plano" in the page) while the next phases ask their questions: `engram setup <agent>` for each selected agent, the project-level and user-level community skills (`bunx skills add`), and the agent compatibility repair (the `.claude/skills` alias, project commands named like a skill moved aside). There are no questions inside this phase; the output of each program streams into its step's log lines.

### Project

Fills `.agents/project.yaml`: identity and environments. This is `agents:setup` absorbed into the run: the page (or the terminal) asks, and `agents-setup --non-interactive` writes. The example of each field is shown as a hint, never written as a value.

### Credentials

Where secret values live (`.env` by default, a secret manager as the advanced option, see [Secret manager](#secret-manager-advanced)), the variables the MCP servers need (see [MCP credentials filled into `.env`](#mcp-credentials-filled-into-env)), the day-0 Atlassian credentials and, optional, the Resend API key (it goes to `.env` only: the `resend` CLI reads `RESEND_API_KEY` on every command, and a stored CLI session stays your own interactive `resend login`, listed in the closing next steps when the CLI is installed). A secret is a masked field; its value goes to `.env` (created with mode 600) and never into the page, the log or the saved summary. "Later" is a valid answer for every one of them.

### Jira

The `acli` session, then one question that picks the catalog source for the whole project (your own Jira workspace, the UPEX-Galaxy standard, or skip; with no Atlassian credentials it recommends the UPEX catalog), then `jira:check`. The status and transition pickers of `jira:sync-workflows` are answered in the same run: the installer calls it with `--plan-json` (prints what is unresolved, writes nothing), asks each mapping as a card, and applies with `--answers <file>`. A rejected login shows a card that says what happened and offers a retry. Details and recovery: [Troubleshooting](#troubleshooting). `INSTALL_SKIP_JIRA=1` skips the whole phase.

### GitHub

Optional: creates the repository with `gh` and pushes, or records an existing remote. It waits for the Install lane, and the push is confirmed with `git ls-remote`.

### Verify and done

The external CLI table (information only, see [External CLIs](#external-clis-verified-not-auto-installed)), the project MCP servers, the agent contract, the state file, and the retirement of plaintext MCP credential copies an older install left (see [Launching the agent after setup](#launching-the-agent-after-setup)).

The run ends with **one report**: tiles for what was done, skipped or warned, failed, and the time, then the next steps, each with its command when it has one (open your agent, `/project-foundation` then `/project-bootstrap`, `bun setup --variables` for the local `.env` and the Vercel push, and whatever is still pending). In a non-interactive run driven by an agent, the first next step names the keys to ask the human for (names only).

### Where the run is shown

`bun setup` and `bun sync` decide once, at start, whether the run opens the page (`cli/lib/ui/env-detect.ts`, first match wins):

| Condition | Where the run is shown |
|---|---|
| `--headless` | terminal only, questions in the terminal |
| `--ui` | the page, even where the rows below say terminal (SSH with a tunnel, a terminal an agent drives while a person watches) |
| `CI`, `GITHUB_ACTIONS` or `BUILD_ID` set | terminal |
| stdin or stdout is not a terminal | terminal |
| an AI agent is the caller (Claude Code, Codex, OpenCode) | terminal |
| SSH without a display | terminal, with a one-line hint about `--ui` and a tunnel |
| Linux without `DISPLAY` / `WAYLAND_DISPLAY` (WSL without WSLg too) | terminal |
| otherwise | the page |

- Inside Orca the page opens as a browser tab bound to the worktree; elsewhere in the system browser. The address is always printed in the terminal.
- The terminal always shows the full log; only the questions move to the page. If no page connects within 10 seconds, the questions go back to the terminal for the rest of the run.
- The page speaks Spanish or English, from `LC_ALL` / `LC_MESSAGES` / `LANG` (Spanish when unsure).
- When a page run ends, a static copy of it is saved under `.session/runs/` (gitignored; the oldest copies are pruned) and the open page shows its path. No secret value reaches the page, the log or that copy.
- `bun sync --auto`, typed by a person on a real terminal, opens a read-only page: no question cards, the deferred items listed in the report. An `--auto` implied by "no terminal" never opens it. `bun setup` has no `--auto`.

The page code lives in `cli/lib/ui/` and is byte-identical in this repo and agentic-qa-boilerplate (only `cli/lib/ui/brand.ts` differs); `scripts/shared-files.json` lists the shared files and `bun run shared:check` fails when one drifts.

---

## Before you run setup — prerequisites

`bun setup` assumes a few tools already exist on `PATH` and that you've already installed **at least one** AI agent: Claude Code, OpenCode or Codex. The unified front-of-house checklist lives in [README → Prerequisites](README.md#prerequisites); this is the same list with installer-flavored detail. The preflight shows every row with the command or URL that fixes it before anything is written, so you can also just run `bun setup` and read it.

### Harness detection (Team phase)

The installer detects all three harnesses and lets you pick which to configure. Everything detected is pre-checked; you untick whatever you do not want. `INSTALL_AGENTS=claude-code,opencode,codex` (any subset) overrides the question, which is also what a non-TTY run falls back to.

| Harness     | Counts as detected when                                                         | Note                                                                                     |
| ----------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/` exists **or** the `claude` binary is on PATH                       |                                                                                          |
| OpenCode    | `~/.config/opencode/` exists **or** the `opencode` binary is on PATH            |                                                                                          |
| Codex       | the `codex` binary is on PATH **or** this repo already has `.codex/config.toml` | Codex Desktop needs no separate entry: it consumes the same repository config as the CLI |

### What the preflight checks

The rows, their thresholds and their messages live in `runSetupPreflight` in `cli/preflight.ts`. `bun cli/preflight.ts --for setup --json` prints the same checklist as JSON (exit 0 clear, 1 warnings, 2 something blocks), for CI and agents. `bun run setup:doctor --preflight` is an alias of the gate part (`bun cli/preflight.ts --for setup --gate`).

| Blocks the run (nothing is written until it is fixed) | Warns and goes on |
| --- | --- |
| **Bun** older than the floor `cli/preflight.ts` enforces, or missing | **acli** missing: the Jira phase is skipped and the report says how to sign in later |
| **`node`** missing: the agent hooks run on Node | **engram** missing or too old: memory is not wired; install it (`brew install gentleman-programming/tap/engram`, or `go install github.com/Gentleman-Programming/engram/v3/cmd/engram@latest`) and re-run `bun setup` |
| **`git`** missing | git identity (`user.email`) unset: only the GitHub phase needs it |
| **No AI agent**: none of Claude Code, OpenCode or Codex (detection rules in the table above) | `gh` missing or not signed in: only the GitHub phase needs it |
| No `package.json` in the folder: run `bun setup` from the project root | a project without the boilerplate's marker (fine when the scaffolder made it); the 1Password CLI, when you pick 1Password |
| Free disk below the block threshold | free disk below the warning threshold |
| A download host that does not answer while its download is still pending (`registry.npmjs.org`, `github.com`, for the community skills) | the Atlassian site of `.agents/project.yaml` does not answer |

Two more rows are information only: a `.agents/project.yaml` that is still the boilerplate's own copy (it is reseeded from the template before anything writes to it), and a `.env` readable by others (its mode is fixed to 600 on the spot). An Engram that is installed but reports no release version (a local or `go install` build) gets one question in Team: try anyway, or skip.

Before the installer even loads, the `--gate` part (the first half of `package.json` `setup`) checks Bun and the dependencies, and runs `bun install` itself when `node_modules` is missing. The scaffolder needs `git` and `tar` on PATH as well (`ensureGitAvailable` in `packages/create-agentic-dev/src/runners.ts`, `downloadTemplate` in `download.ts`).

### Per-skill CLIs — lazy-required, non-blocking at setup

The Verify phase (`verifyExternalClis()` in `cli/install.ts`) does a **PATH probe only**: it runs `which <name>` on POSIX, `where <name>` on Windows. Presence only, no version check. For each missing entry the step logs an install hint (a cross-platform command when one exists, e.g. `bun add -g vercel` or `bun add -g @playwright/cli@latest`), and the closing report lists the upstream install guide URL under "Missing tools".

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

### MCP credentials filled into `.env`

The MCP config of every selected harness names the variables, never their values: each server that needs `.env` values starts through the `.env` loader `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>`, the same on `.mcp.json` (Claude Code), `opencode.jsonc` (OpenCode) and `.codex/config.toml` (Codex), which reads `.env` at spawn time and hands the server only those names. The installer resolves required vars by reading each server's `--filter` in those committed configs (`discoverRequiredEnvVars()`) — the list backs the MCP servers those configs declare and the Atlassian CLI (context7 needs none). Web search is not in it: it runs at harness level and keeps its key outside `.env` (`.context/ADR/ADR-0005-harness-level-mcps-and-capabilities.md`); the installer's closing report names it as a next step, and `bun run setup:doctor` says which ones this machine declares. With the shipped configs the list reads:

```
ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN
SUPABASE_ACCESS_TOKEN
N8N_API_URL · N8N_API_KEY
```

The Atlassian **site host** is deliberately not in that list. The installer asks for it in the Credentials phase and writes it to `.agents/project.yaml` -> `issue_tracker.atlassian_url`, not to `.env` — a hostname is not a secret, it is project identity, and while it sat in `.env` a stale copy inherited from the parent shell shadowed the file in silence. Read it back with `bun run --silent jira:url`.

Generation is interactive (web logins + 2FA), so the installer cannot do it for you. `.env.example` has the full template with per-var comments. Run `bun run setup:doctor` at any time to see which are still missing — every pending credential carries a `where` URL (Atlassian token page, Supabase project settings, n8n API panel).

A value with a `#` must be quoted in `.env` (`PASSWORD="pass#word"`): varlock cuts an unquoted value at the first `#`, where dotenv kept it.

### Secret manager (advanced)

Optional, for a team that shares its secrets in a vault instead of each person's `.env` (`.context/ADR/ADR-0011-secret-manager-advanced-option.md`). `.env` stays the default and comes first in `bun setup`; a non-empty `.env` / `.env.local` value always wins over the vault, so a teammate on plain `.env` keeps working.

1. Install the 1Password desktop app and its CLI `op` (macOS: `brew install 1password-cli`), then enable Settings > Developer > "Integrate with 1Password CLI".
2. Run `bun setup` and pick 1Password in the Credentials phase. Team: a shared vault (`<project>-dev`). Personal plan: your own vault; it works locally, CI cannot read it. The step records `secrets:` in `.agents/project.yaml` and writes `.env.provider.schema` once (committed `op://` references, never values; never overwritten).
3. In the vault, one Password item per variable, titled with the variable NAME. In `.env.provider.schema`, uncomment those lines and leave the keys empty in `.env`.
4. Check, redacted: `bunx varlock load --agent`.
5. CI (team plan): a service account with read access to the vault; its token is the secret `OP_SERVICE_ACCOUNT_TOKEN`, set BESIDE any per-variable secrets a job already passes, never instead. A CI step that reads the vault runs through `varlock run`. Pass a per-variable secret only when the job sets it: an unset GitHub secret renders as `""`, and an empty inherited value wins over the vault.

The vault is read only by processes that go through varlock: every MCP server (the `.env` loader) and `bunx varlock run -- <cmd>`. `source .env` reads `.env` alone, so a key served only by the vault is empty in that shell. `bun run setup:doctor` names the provider, the overlay and the vault item names under "Secret source". Non-interactive: `INSTALL_SECRETS_PROVIDER=1password INSTALL_SECRETS_VAULT=<vault> bun setup --non-interactive`. Other managers varlock supports plug into the same slot (one adapter in `cli/lib/secret-providers.ts`); none ships configured.

### Where to verify your status

`bun run setup:doctor` re-runs every check above (read-only) plus the MCP `.env` vars, the plaintext MCP credential copies an older install left on disk ("Plaintext MCP credential copies"), where secret values come from ("Secret source"), and the multi-harness contract: instructions (`AGENTS.md` present, `CLAUDE.md` is the exact shim), the `.claude/skills` alias, any command that shadows a skill, the hook adapters and MCP parity of the harnesses in use (`harnesses:` in `.agents/project.yaml`; the others read `not used`), and **Codex repository trust**. The trust row is WARN, never FAIL: project `.codex/` config and hooks load only in a repository you have marked trusted, and that is runtime state no file read can verify. Use the doctor after a partial setup to confirm a fix without re-running the full installer. JSON mode (`--json`) emits `pending_actions[]` with `type` / `target` / `hint` / `where` so an AI agent can iterate the list and pick the right tool per item.

---

## Running setup from an AI agent

Many users ask an AI (Claude Code, OpenCode, Codex, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

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
  "env_vars": { "ATLASSIAN_API_TOKEN": "set", "N8N_API_KEY": "missing", ... },
  "pending_actions": [
    { "type": "credential", "target": "N8N_API_KEY", "hint": "n8n API key for the n8n MCP server", "where": "n8n instance → Settings → API" },
    { "type": "shell_command", "target": "bun install", "hint": "Install project dependencies including varlock ..." }
  ]
}
```

`pending_actions[].type` is one of: `credential` · `system_install` · `shell_command`. The AI iterates the list and picks the right tool per type:

| type             | Who handles it | How                                                                                                                             |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `credential`     | **User**       | The AI names the variable and shows the `where` link; the user types the value into `.env` (or the secret manager) in their own terminal, never in the chat. A NON-sensitive value (URL, project key, flag) the AI may write itself with `bun run env:set KEY=value`. Rule: `AGENTS.md` Critical Rule #1, full text in `.agents/instructions/agent-critical-rules.md` §1. |
| `system_install` | **User**       | AI shows the `where` command; the user runs it (brew/winget/apt may prompt for admin password).                                 |
| `shell_command`  | **AI**         | AI runs the `target` command via Bash.                                                                                          |

### What an AI **cannot** do (hard limits)

- **Generate API tokens** — Atlassian / Supabase / n8n keys all require an interactive web login + 2FA. The user creates and pastes them; the AI never sees the generation flow.
- **Decide business config** — e.g. which Supabase project to target, which n8n instance to use, etc. The AI suggests; the user decides.
- **Execute privileged installs cleanly** — `brew install`, `winget install`, `apt install` may show a sudo/admin prompt that lives outside the agent's terminal. The AI runs the command but the user clicks "allow".

### `bun setup --non-interactive` (or just `bun setup` without a TTY)

The installer auto-detects no-TTY (an agent invoking it without a terminal) and silently switches to `--non-interactive`; the run stays in the terminal (see [Where the run is shown](#where-the-run-is-shown)). Every question takes its default answer, and child programs are piped, so their lines appear in the log and nothing waits for a sudo prompt. The closing report lists pending env vars and next steps, the same data the doctor exposes; its first next step names the keys the agent must ask its human for (names only). Use this path when the AI wants to run the full setup batch:

```bash
INSTALL_AGENTS=claude-code,opencode,codex bun setup --non-interactive
```

`INSTALL_AGENTS` is optional: without it the non-interactive run configures every harness it detected. The command line carries no secret: an AI-run command lands in the transcript, so secret values are the human's (typed into `.env` or the secret manager, or passed on a line the human runs in their own terminal) or CI's (Critical Rule #1).

The Atlassian host cannot be passed this way, by design: `agents:setup` refuses to seed `issue_tracker.atlassian_url` from the environment, so a stale inherited value can never overwrite the versioned one on an unattended run. Set it once, interactively:

```bash
bun run agents:setup          # fills .agents/project.yaml
bun run --silent jira:url     # confirm what the tooling resolves
```

Then `bun run setup:doctor --json` to confirm the rest.

### Skip flags (per-step opt-out)

| Env var                                     | Effect                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `INSTALL_AGENTS=claude-code,opencode,codex` | Configure exactly these harnesses (any subset), skipping the selection question |
| `INSTALL_SECRETS_PROVIDER=1password`        | Opt in to the secret manager (default `.env`); pair with `INSTALL_SECRETS_VAULT=<vault>` |
| `INSTALL_SKIP_ENGRAM=1`                     | Treat Engram as skipped: no Engram question, no `engram setup`                |
| `INSTALL_FORCE_ENGRAM=1`                    | Re-run `engram setup` even when the state file says it ran (legacy alias: `INSTALL_FORCE_AGENTS_SETUP=1`) |
| `INSTALL_FORCE_COMMUNITY_SKILLS=1`          | Re-run the community skills install even when the state file says it ran (declined user-level skills stay out) |
| `INSTALL_FORCE_GITHUB_REMOTE=1`             | Re-run the GitHub phase even when a remote is recorded                        |

The header of `cli/install.ts` owns the full list.

---

## Launching the agent after setup

`bun setup` finishes by telling you to open the agent with its own binary (`claude`, `opencode` or `codex` in the project folder) or its desktop app. There is no wrapper: nothing loads `.env` into the agent's process, so no secret reaches the AI's shell (ADR-0016). Each process loads its own config: the MCP servers read their values (e.g. `ATLASSIAN_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `N8N_API_KEY`) through the `.env` loader.

| Method | Platform | One-time setup | Usage |
| --- | --- | --- | --- |
| **`claude` / `opencode` / `codex`, or the desktop app** | Windows, macOS, Linux | None | `claude` from the repo root; its MCP servers read `.env` through the `.env` loader, the session's own shell does not see `.env` |
| **`bunx varlock run -- sh -c '<cmd using "$VAR">'`** | Windows, macOS, Linux | None: `varlock` is a project devDep | One shell command that needs a value (`curl` with a token, a script); `bun` scripts load `.env` themselves |
| **`bun run vars:env:check`** | Windows, macOS, Linux | None | Names a shell-exported variable that differs from `.env` (names and lengths only); run it when an MCP behaves as if `.env` were ignored, because varlock lets the inherited value win |

All three MCP configs are committed with variable names only: every server that needs `.env` values starts through the `.env` loader (`varlock run --filter <its vars>`) on `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` alike. Real values live in `.env` (gitignored). The Verify phase retires the plaintext copies an older install wrote (the `env` block of `.claude/settings.local.json`, `.auth/opencode/<VAR>`): a copy equal to `.env` is deleted, one `.env` does not reproduce is moved to `.auth/harness-env-backup/<VAR>` and named. If a server returns 401/403 at first call, the matching env var is missing — see `AGENTS.md` Critical Rule #9 (stop, fix `.env`, restart the agent session).

---

## Adopt an existing app

A scaffolded project starts from the template. An existing app goes the other way: the tooling is installed into the app's own repository, and nothing the app already has is overwritten. Two layers do it. The install layer is `bunx create-agentic-dev --adopt` (or the updater's `--adopt` run it delegates to), and the understanding layer is the `project-adoption` skill, loaded in an agent session afterwards.

### Preflight: `bunx create-agentic-dev --doctor --preflight`

Read-only. It prints the system checks plus these rows for the current directory; `--adopt` runs the same table first and exits `13` with nothing written when a required row fails.

| Row | Blocks `--adopt` when | Why |
| --- | --- | --- |
| git repository | the directory is not a git repository, or not its root | adoption runs inside the app's own repo and never runs `git init` |
| clean working tree | `git status --porcelain` lists anything | the adoption lands as one reviewable diff |
| install state | `.template/boilerplate.lock.json` exists without `adopted: true` | a scaffolded project updates with `bun sync`; an adopted one makes `--adopt` a no-op |
| gh authenticated | `gh` is missing or logged out | the updater clones the template through it |
| package manager | the lockfile (or `packageManager`) names anything but bun | v1 supports bun apps only; no lockfile is a warning, bun assumed |
| stack family | no `package.json` declaring `next` at the root or under `apps/*` / `packages/*`, or a non-Postgres database (a MySQL, MongoDB or SQLite driver, or a Prisma datasource for one) | v1 supports Next.js on the Postgres family |
| `stack.app_root` | never (warning) | several Next apps in a monorepo: one app per adoption, `project-adoption` asks which |

The scaffolder carries its own small copy of these detections because the published package cannot import the boilerplate; the full stack descriptor lives in `cli/lib/stack-descriptor.ts`, and `project-adoption` writes the `stack:` block from it.

### Install: `bunx create-agentic-dev --adopt`

From the app's repo root:

1. Runs the preflight above.
2. Downloads the template into a temp directory and installs its dependencies there. Nothing is downloaded into the app.
3. Runs that copy's `cli/update-boilerplate.ts --adopt` with the app as the working directory (`--non-interactive` becomes the updater's `--auto`; `--template-repo` reaches it as `UPEX_TEMPLATE_REPO`). The first-run adopt policy is described in [`.agents/instructions/agent-harnesses.md`](.agents/instructions/agent-harnesses.md) §5.5, "UPDATER `--adopt`", and owned by `cli/lib/updater-adopt.ts`. That run follows the same display rules as `bun sync` ([Where the run is shown](#where-the-run-is-shown)): on a terminal with a screen it opens the updater's local page, and the terminal keeps the full log.
4. Deletes the temp directory and prints the next steps.

It never scrubs history, renames the project, runs `git init`, runs `bun install` or `bun setup` inside the app, or touches a database. `--adopt` refuses the greenfield-only inputs (a project name, `--here`, `--project-key`, `--no-git`, `--no-install`, `--no-setup`) and a `--template` other than `main`, because the updater syncs the template's default branch. Exit `32` means the updater's own run failed; its output says why, and whatever it touched is backed up under `.backups/`.

### After the install

1. Review the parity table in the updater's closing report (the page's report card, and the terminal; it saves the rows to `.agents/prompts/parity-plan.md`). Rows marked BLOCKING, such as a script name the app already uses or the pending merge of its instruction files, need a decision before `bun run agents:compat:check` passes.
2. `bun install`, for the tooling `devDependencies` the updater appended to `package.json`.
3. Commit the adoption as one change. `project-adoption` refuses to start on a dirty tree.
4. Open an agent session (`claude`, `opencode` or `codex` in the project folder) and load `project-adoption`. It analyses the app without writing, proposes one plan in `.context/reports/project-adoption-plan.md`, and after your approval fills identity, `stack:`, environments, the tracker catalogs and `updater.protected_paths`, then checks that the app's own build, lint and test scripts still exit as they did before.

`bun setup` is a separate step on an adopted repo: run it after the adoption is committed when you want the machine-level pieces it installs (Engram, community skills, harness detection).

---

## Git strategy setup (agent-driven, before your first push)

The scaffold ships a **default** git strategy (`solo-main`) with `meta.strategy_source: inherited` in `.agents/project.yaml` — a placeholder nobody chose for YOUR project (`packages/create-agentic-dev/src/prepare.ts` resets the provenance stamps on scaffold). Defining it is an explicit step, not an inherited fact: once your project identity is filled in, ask your AI agent:

> **"set up our git strategy"**

That runs git-flow-master's Strategy Setup: it resolves your branching flow (solo-main / main-integration / trunk-based / others), asks the merge + hotfix + protection-policy questions, materializes any long-lived branches, and writes the `git_strategy:` block with `strategy_source: chosen`. Until you do this, the agent will OFFER Strategy Setup on your first git intent — that offer is the signal that this setup is pending, not a bug. At any point, `bun run git:policy verify` reconciles the declared policy against the host's actual branch ruleset (and `apply` writes it — dry run until `--yes`).

---

## Optional UX upgrades

A community tool worth knowing about; the installer neither installs nor lists it. It is **user-level** (not installed by `bun setup`) because it modifies your global environment, not this repo. Recommended, not required.

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

## Engram: persistent memory, wired by `engram setup`

[Engram](https://github.com/Gentleman-Programming/engram) is the MCP-based persistent memory layer that survives across sessions and compactions. `bun setup` wires it with the engram binary's own command, once per selected agent:

```sh
engram setup claude-code --protocol=slim
engram setup opencode
engram setup codex
```

| Slug     | Type      | What it does                                                                                                |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `engram` | Component | Persistent memory across sessions. Auto-saves decisions, bugs, conventions; auto-recalls on session resume. |

`engram setup <agent>` registers the Engram MCP server for that agent and nothing else; re-runs are idempotent. Claude Code gets `--protocol=slim`, so the session protocol arrives through the Engram plugin's hooks instead of a block written into your instructions file. The installer **offers** to install that plugin with one question in the Team phase (default yes; not asked in a non-interactive run), and installs it right after wiring Claude Code in the Install lane; a failure never stops the install:

```sh
claude plugin marketplace add Gentleman-Programming/engram && claude plugin install engram@engram
```

> **Why not gentle-ai.** Earlier versions drove `gentle-ai install --preset minimal`. That preset is not "Engram only": it installs Engram plus the SDD skills, and gentle-ai writes its own orchestrator / agent-routing instructions, hooks and telemetry into your user-level agent config, which compete with this repo's orchestration doctrine (`AGENTS.md` §3). The repo's own workflow skills own the dev workflow, so the installer now talks to the engram binary directly.

The integration is **not strict**. If you skip Engram, the repo still works: workflow skills committed locally (`/sprint-development`, `/project-foundation`, etc.) keep functioning, and the canonical MCPs are still configured. What you lose is persistent cross-session memory. Section "How to opt out" below details the trade-off.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.agents/skills/` and are committed to the repo. They install with the clone — no external installer required. All three harnesses read that one directory (§ Multi-harness layout below); project-level community skills (`bunx skills add`) install into the same store, so there is never a second copy per harness.

| Skill                 | Trigger                                         | Why it stays local                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-dev-core`    | (auto, cited by other skills)                   | Passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills — not invoked directly.               |
| `project-foundation`  | `/project-foundation`                           | Constitution + PRD + SRS + Discovery (one-time per product); Discovery only on an existing app                                                                                                          |
| `design-system`       | `/design-system`                                | DESIGN.md (Google Labs spec, 5 paths) pre-scaffolding + opt-in per-story screen-mapping phase (design briefs → `master-design-plan.md`)                                                                 |
| `project-bootstrap`   | `/project-bootstrap`                            | Backend + frontend skeleton + features (OpenAPI, auth, env)                                                                                                                                             |
| `project-adoption`    | `/project-adoption [check]`                     | Existing app after the updater's `--adopt` install: sealed analysis, plan to approve, then agentic surfaces only (identity, `stack:`, tracker, protected paths) |
| `testability-guide`   | `/testability-guide`                            | `/qa` page + tool-agnostic credentials artifact (Jira / Confluence / Notion / MCP / CLI / manual). Idempotent re-runs on stack drift.                                                                   |
| `product-management`  | `/product-management`                           | Backlog seeding + epic creation + INVEST/AC refinement                                                                                                                                                  |
| `sprint-development`  | `/sprint-development`                           | Per-story dev loop (mega-orchestrator, 12-step workflow)                                                                                                                                                |
| `unit-testing`        | `/unit-testing`                                 | TDD slice — composable mid-flight from `/sprint-development`                                                                                                                                            |
| `autonomous-delivery` | `/autonomous-delivery`                          | Scheduled / unattended delivery runs: audit real state, select genuinely unblocked work, dispatch the owning pipeline skill, report (`story` / `bug` / `discovery` modes)                               |
| `git-flow-master`     | (auto)                                          | Branching/commit/push/PR strategy auto-detected per repo                                                                                                                                                |
| `jira-administration` | `/jira-administration <mode>`                   | Bounded Jira admin workflows, one mode per run (`components`, `instance-migration`), sealed behind explicit approval                                                                                    |
| `project-context`     | `/project-context <mode>`                       | Business maps, master implementation plan, dev roadmap. Modes `data` · `features` · `api` · `master-plan` · `dev-roadmap`; invoke `/project-context <mode>`                                              |
| `acli`                | (auto)                                          | Atlassian CLI wrapper for Jira/Confluence terminal work                                                                                                                                                 |
| `vercel-cli`          | (auto on `vercel`)                              | Vercel CLI cookbook — deployment verification (poll commit SHA + `inspect --wait`), env var sync, build/runtime log streaming, rollback, `.vercel/` linking. Companion to community `/deploy-to-vercel` |
| `agentic-dev-onboard` | `/agentic-dev-onboard`                          | End-to-end onboarding guided tour (pending Phase C)                                                                                                                                                     |

These skills evolve with the repo and are versioned in git. The split is intentional: user-level tools (Engram, user-level community skills) own the **horizontal** layer (apply across all your repos), this repo owns the **vertical** workflow (specific to `agentic-dev-boilerplate`).

The user-level community skills (`USER_LEVEL_SKILLS` in `cli/install.ts`) are asked per skill in the Team phase: one checkbox per skill, all pre-checked. A skill you uncheck is recorded as `declined` in the state file and is not offered again, not even when `INSTALL_FORCE_COMMUNITY_SKILLS=1` or `--sync-skills` forces a re-run; the question card of a later run names the `bunx skills add` line to install it by hand. A non-interactive run installs every skill you have not declined.

### Invoking a skill with a mode

No slash-command files ship ([ADR-0006](.context/ADR/ADR-0006-skill-plus-mode-invocation.md)). A skill is invoked by its own name plus a mode: `/project-context data` or `/jira-administration components` on Claude Code, the skill and mode named in prose on OpenCode and Codex. Each multi-mode skill lists its modes in its `## Mode routing` section; the former command names (`business-data-map`, `dev-roadmap`, `jira-components`, ...) still work as trigger phrases.

---

## Multi-harness layout: one source, three consumers

The installer configures whichever of **Claude Code, OpenCode, and Codex** you selected in the Team phase, but it never duplicates content to do it. There is exactly one copy of every instruction and every skill; where the harnesses genuinely differ (MCP file format, hook API) each keeps a thin versioned adapter.

The agents you select are recorded in `.agents/project.yaml` as `harnesses:` (added to what is already there, never removed), and the installer then offers to delete the files of each harness you left out; the default keeps them. Every compatibility gate (`agents:compat:check`, `setup:doctor`, the installer itself, `bun sync`) checks only the harnesses in that list, so a team on one harness keeps only that harness's files. With `harnesses:` absent or `null` the gates detect the harnesses from the files present. The boilerplate repo itself always checks all three. Decision and details: ADR-0013, `.agents/instructions/agent-harnesses.md`.

| Surface          | Claude Code                                     | OpenCode                                    | Codex CLI + Desktop                      |
| ---------------- | ----------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native)                        | `AGENTS.md` (native)                     |
| **Instruction sections** | `.agents/instructions/` (on demand, via the L0 router) | `.agents/instructions/` (on demand)   | `.agents/instructions/` (on demand)      |
| **Skills**       | `.claude/skills` **[generated alias]**          | `.agents/skills/` (native)                  | `.agents/skills/` (native)               |
| **Commands**     | none: `/<skill> <mode>` (the skill slash)       | none: skill + mode in prose                 | none: skill + mode in prose              |
| **Hook**         | `.claude/settings.json` → `UserPromptSubmit` + `PostToolUse` (doc contracts) | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` + `PostToolUse` (doc contracts) |
| **MCP**          | `.mcp.json`                                     | `opencode.jsonc`                            | `.codex/config.toml`                     |

- **Instructions.** `AGENTS.md` is the always-on core (L0: binding rules, behaviour, orchestration core, a fixed router); each topic lives in its own file under `.agents/instructions/`, read on demand when the router or a hook `ROUTE:` line names it ([ADR-0009](.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md)). OpenCode and Codex load `AGENTS.md` natively; Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline. A documented import rather than a symlink, so it survives a Windows checkout. L0 also imports `package.json` and `.agents/project.yaml` for Claude Code; `bun run instructions:check` keeps L0 under Codex's 32 KiB `project_doc_max_bytes` cut, and three locks keep the split from eroding ([ADR-0014](.context/ADR/ADR-0014-instructions-maintenance-locks.md)): the router table is frozen behind the ADR that decided it (`--accept-router ADR-NNNN` records a new decision), the labelled-prompt router eval runs on every call, and every section ships complete. `bun run instructions:audit` measures, from local transcripts, how often the agent actually reads a section the hook routed.
- **Skills.** Every committed skill lives in `.agents/skills/`, and the community project-level skills install into the same store. Claude Code reaches that tree through `.claude/skills`, a POSIX symlink (Windows junction) that is generated and gitignored: never committed, never hand-edited.
- **Commands.** None ship. A project may keep its own command files under `.claude/commands/` or `.opencode/commands/`; one named like a skill hides that skill's instructions, so the compatibility check fails on it and the repair moves it to `.backups/shadowing-commands/`.
- **Hook.** `.agents/hooks/personality-reinject.mjs` holds the output contract and the `AGENT IDENTITY:` line (the source of the `Worktree:` / `Session:` commit trailers) once. Claude Code and Codex run it as a command hook (`.claude/settings.json` and `.codex/hooks.json`, the latter with a POSIX and a PowerShell command); OpenCode imports the same lines from `.opencode/plugins/personality-reinject.js`. `.agents/hooks/doc-contracts.mjs` is the boilerplate maintainers' edit-time reminder of the documentation contracts (ADR-0017): registered as a `PostToolUse` hook, it stays silent in your project.
- **MCP.** The canonical server set is whatever `.mcp.json` declares (the first declared harness's file when Claude is not in use; local servers only, web search runs at harness level); every server there must exist in the other configs in use. Parity is checked semantically: each native format is normalized before comparison and matched on the `.env` variables each server depends on, so a server missing from one host, or present in one host only, is a failure. The boilerplate-known ids (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`) additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only, so a downstream project may add or drop servers freely. A server that needs `.env` values starts through the `.env` loader on every host and its `--filter` is the dependency set parity compares; a `${VAR}`, `{env:}`, `{file:}` or `env_vars` beside the loader fails the check in the boilerplate and is a warning downstream naming the exact launch. `docs/mcp/*.template.*` stay as opt-in templates for hosts without a runtime adapter (Gemini CLI, Cursor).

### Regenerating and verifying

Bold `[generated]` cells above are output. Edit the source, then regenerate:

| Generated artifact                                  | Its source                                   | Regenerate              |
| --------------------------------------------------- | -------------------------------------------- | ----------------------- |
| `CLAUDE.md` (one-line `@AGENTS.md` shim)            | `AGENTS.md`                                  | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/`                            | `bun run agents:compat` |

You rarely run either command by hand. `bun setup` (in its Install phase) and `bun sync` (after its apply) both call the same repair internally: they create or fix the alias, move any command that shadows a skill to `.backups/shadowing-commands/`, and then re-verify, so a clean install and a routine update both leave the contract satisfied without a manual step. The scaffolder (`create-agentic-dev`) ships nothing generated; the alias appears the first time `bun setup` runs in the new project.

`bun run agents:compat:check` validates the whole contract for the harnesses in use (it prints a `Harnesses checked:` line and one `NOTE:` per skipped harness; shim and alias only with Claude) — shim bytes, alias target, no command named like a skill, hook adapters, MCP parity, eslint block wiring. It runs inside `bun run repo:check`, unconditionally in the pre-push hook, and in pre-commit when a staged path touches `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.opencode/`, `.codex/`, `.mcp.json` or `opencode.jsonc`. `bun run setup:doctor` reports the same surfaces plus **Codex repository trust**, which is runtime state no file read can verify: project `.codex/` config and hooks load only in a repository you have marked trusted, so the doctor reports it as WARN, never FAIL.

### Updating a project created before the multi-harness move

A project scaffolded when instructions lived in `CLAUDE.md` and skills in `.claude/skills/` gets a one-time migration the first time it runs `bun sync`. It happens **before** any component is synced, because the sync alone would be destructive: `CLAUDE.md` is a synced file whose upstream copy is now the one-line shim, and `AGENTS.md` is on the never-synced watchlist, so a plain sync would replace the project's AI memory with a pointer to a file that does not exist.

The migration promotes the project's memory from `CLAUDE.md` to `AGENTS.md` and leaves `CLAUDE.md` as the shim; moves every skill under `.claude/skills/` into `.agents/skills/`, project-authored ones included; and archives (never overwrites) any legacy skill whose name the canonical store already owns. Nothing is deleted: what is not moved is preserved under `.template/pre-agents-migration/` (gitignored). The pass is idempotent, and if a single item cannot be resolved without guessing it refuses in full, before touching anything, rather than applying halfway. A shim found without an `AGENTS.md` beside it is reported as an orphaned shim with a recovery command instead of being synced over.

After that one update, the project works in Claude Code, OpenCode and Codex from the same source. See [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) (one page of the [docs hub](https://upex-galaxy.github.io/agentic-dev-boilerplate/)) for the full picture and [`ADR-0002`](.context/ADR/ADR-0002-multi-harness-single-source.md) for the decision record.

### How a `bun sync` run goes

`bun sync` shows its run the same way `bun setup` does ([Where the run is shown](#where-the-run-is-shown)): a local page on a terminal with a screen, the terminal flow with `--headless`, a read-only page for an explicit `--auto`. `bun sync --help` lists every flag; an unknown flag is refused.

1. **Preflight** (`bun cli/preflight.ts --for up`, same verdicts as setup's): Bun, Node (a warning only), git recent enough, a `gh` session (or a local template clone through `UPEX_TEMPLATE_REPO`), `github.com`, the primary checkout (never a linked worktree), the lock file, free disk. A block stops before anything is written. The cross-harness migration, when one is pending, is one more row of the same run. Then the run starts, with no "shall we start" question. A dirty tree still aborts, naming the dirty files.
2. **Self-update.** When upstream carries a newer updater, it refreshes `cli/` and restarts itself. The page stays the same (same address), shows that it is restarting and then reconnected, and nothing already answered is asked again.
3. **Collect, then apply.** Every question is answered before the first file is written: the areas to sync, the files of each area (each row can show its diff), the new lines of an ignore file, the new `package.json` keys, each synced file the project edited AND upstream changed (decide later, keep mine, or take the new one; in `--auto` it is still overwritten, with a backup in `.backups/`), and each file upstream deleted (one card per file, default keep). Then one apply step writes everything.
4. **Closing report** (below), in the page's report card and in the terminal.

`--force` never asks (it also deletes what upstream removed, with a backup and `--rollback`).

### What every `bun sync` reports

The run ends with a single "Estado por superficie" table: one row per surface (the list is `SURFACE_ORDER` in `cli/lib/updater-parity.ts`), with an ok or warn glyph, shown in the page's report card and printed in the terminal. Below it comes ONE parity prompt, printed and saved to `.agents/prompts/parity-plan.md` (gitignored, single-use; `--dry-run` shows it and does not save it). Each row of the prompt names a surface, a file and concrete evidence: headings added, removed or changed in a watched file plus hunk counts, a server declared in `.mcp.json` but missing from a host, a skill archived under `.template/pre-agents-migration/` because of a name collision, a component held back, an env key that drifted. The prompt tells the AI to present that table and WAIT for a decision per row (`keep project | take upstream | merge`) before editing, then apply only the chosen rows and run tests, types and lint.

Two flags and one watchlist change shape that report. `--strict` exits 1 when the compat check fails or a blocking finding is present, for CI; without it the run warns and exits 0. `.claude/settings.json` is delivered once when the project lacks it (bootstrap-only, like `.codex/`) and is otherwise on the protected watchlist: the updater never overwrites it, so project permissions and hook edits survive (its `permissions.allow` and `permissions.deny` lists and its `hooks` only grow: upstream entries the project lacks are appended, a missing hook command as a new group after the project's own, before the compatibility check runs, so a hook group `agents:compat:check` starts requiring never leaves the project failing its own gates; a deny the project does not want is declined in `updater.declined_denies`, a hook command in `updater.declined_hooks`; `opencode.jsonc` gets a paste row for the deny rules it lacks instead of a write), and any drift from upstream appears as a prompt row (a stale hook command is still caught by `agents:compat:check`). The same holds for `.husky/pre-commit` and `.husky/pre-push` (project gates) and for every path a project lists under `updater.protected_paths` in `.agents/project.yaml`. Every row is one path: a watched file that also breaks a compat contract is one blocking row with both pieces of evidence. The self-update re-exec accepts the dirty `cli/` it just produced, and the lock file plus `.backups/` never count as user dirt, so `--auto` runs unattended without `--force`. A run that applies nothing leaves the tree byte-identical (`git status` clean, the lock untouched). An aborted run, whatever the cause (dirty tree, corrupt lock, failed clone, declined migration or self-update), ends with `Abortado.` and exit 1 rather than a success line.

One more thing on the migration run itself: the `.claude/skills` alias is NOT created in that invocation. The migration unindexes the committed `.claude/skills/*` tree, and git refuses to rewrite index entries behind a symlink, so an alias created right away would break `lint-staged` on the very commit that records the migration. The run prints the next step and repeats it in the closing box: commit the migration, then `bun run agents:compat` creates the alias. The compat check treats the missing alias as expected while that commit is pending (a re-run before it keeps deferring); every other contract is still enforced. `bun run agents:compat:check` and `setup:doctor` print the alias status line (created, OK, deferred until the migration commit, missing) whatever the overall verdict, and group the errors per surface (instructions, alias, commands, hooks, MCP, lint), so "alias pending commit" and "MCP drift" never read as one flat failure.

### Updater safeguards: suggestions, previews, gates and re-runs

Release history of each behaviour below: `CHANGELOG.md` (the `updater 8.x` sections).

- **Never a destructive default.** `take upstream` is suggested only where the project lacks the content entirely. A row naming project-only servers, keys, headings or edits suggests `merge`; an `opencode.jsonc` holding four project servers reads "only here: ... declare them in `.mcp.json` and `.codex/config.toml`, or remove them", still blocking, never "take upstream".
- **`--dry-run` previews with the new updater.** When upstream carries a newer `cli/`, the preview does not write it: the fetched updater runs from the upstream clone against the project (same flags, same cwd) and shows its migration plan, component preview and parity table. Nothing is written and the prompt is not saved (`[dry-run] prompt not saved`). Without a terminal on stdin and no `--auto` / `--interactive`, the run assumes `--auto` and prints one notice instead of hanging.
- **Post-sync gates.** After the apply, the gate scripts `GATE_SCRIPTS` in `cli/update-boilerplate.ts` names run (`ADOPTED_GATE_SCRIPTS` in an adopted app; each under a timeout; a gate that does not finish is skipped with a note; `--no-gates` disables them). A failure becomes a "Verificación" row with the exit code, the first error lines and which of the failing files this run applied, plus a `Gates:` line in the closing box. Informational only: never an abort, never blocking under `--strict`.
- **`package.json` rows.** Every key kept at the project's value while upstream differs is one `package.json` row (`scripts.repo:check: project value kept; upstream differs`), with both values in the saved file, so a non-interactive run keeps the FYI out of the scrollback.
- **Overwritten project edits.** An interactive run asks first ("Collect, then apply" above). A synced file the project had edited (3-way against the lock cursor) and the run overwrote (`--auto`, or "take the new one") gets a `merge` row on Skills or Componentes: `project edit overwritten; backup: .backups/update-<ts>/<path>; N hunks vs applied`, with the full diff in the saved file.
- **Re-run safety.** The run records what it wrote in `.template/last-apply.json` (gitignored, sha256 per path). The next dirty-tree guard exempts a recorded path whose hash still matches, so `bun sync --auto` twice in a row, without committing in between, proceeds as a no-op (the previous prompt file is kept). An unrelated file, or a synced file edited by hand since, still aborts, naming `Commit sugerido` and the prompt path.
- **Host-agnostic `cli/**`.** The synced tests build env objects through `unknown`, and `cli/updater-host-types.test.ts` compiles `cli/**` with a required `NODE_ENV` on `ProcessEnv` (what `next/types/global.d.ts` adds) on every `bun test`.

### Updater safeguards: watched files, the dirty-tree guard and the self-update cursor

- **Converging rows for project-customized synced files.** `.husky/pre-commit` and `.husky/pre-push` are on the protected watchlist (`project gates live here`): delivered once when missing, never overwritten, one drift row per upstream change with the hunks as evidence. A committed merge of a hook survives the next `bun sync --auto` and the row does not come back (marker semantics). The rest of `.husky/` (the `_/` helpers) keeps syncing.
- **`updater.protected_paths`.** A project lists any other synced file it merged by hand under `updater:` in `.agents/project.yaml` (repo-relative file paths, empty by default, documented in `.agents/README.md`). Listed paths join the watchlist at runtime with the same semantics: never overwritten, delivered once when missing, sparse checkout, drift row. A path outside the repo, under `.git`, a directory or a non-string is reported at the start of the run and ignored. The row for an overwritten project edit ends with `add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge`, and the saved prompt repeats it under the row as the YAML to paste. A path just declared gets its upstream marker seeded with no row (one `sin fila esta vez` note); its drift row fires on the next upstream change.
- **Guard scope.** The dirty-tree guard blocks only on uncommitted work the sync would overwrite: a synced component file, an ignore file, `package.json`, a deprecated file. Dirt anywhere else (`tests/`, app code, a protected or bootstrap-only file) is listed as `N ruta(s) con cambios sin commitear fuera de lo que este updater escribe; no bloquean` and never aborts `--auto`.
- **`.context/PBI/` still tracked in git.** One Componentes row (`N tracked path(s) still in git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`); the recipe (tag, `git rm --cached`, commit, resync, push-to-Jira pass) lives in that gitignored file, never in the terminal.
- **Cost signal on every config row.** A watched file with keys (JSON, JSONC, TOML, YAML) or headings (markdown) never gets a bare `merge`: project-only keys plus upstream additions read `port upstream additions only: <keys>; keep project-only key(s): <keys>`; only project-only keys read `keep project`; only upstream additions with nothing else different read `take upstream`; shared keys with different values are named. `tsconfig.json` in a Next.js host says which keys to port and that `jsx`, `lib`, `paths` stay.
- **Browser-profile rows, informational.** A project skill, command or instruction that opens a browser with `--persistent`, or with a `--profile` that is relative or inside the repo, gets one row per file naming each line (each such open leaves a full Chrome profile on disk). The updater never edits the file; `bun run browser:profiles` lists the profiles already left behind.
- **Identity files compare structure only.** `.agents/project.yaml` and `.agents/jira-required.yaml` (bootstrap-only, project-owned) fire an `informational` row listing the keys upstream added (`merge = add the new keys`), and no row at all when only values differ: those are the project's answers to upstream's scaffold, not drift.
- **Self-update cursor from a parent without the env signal.** An older parent updater re-execs the child on `UPEX_UPDATER_REEXEC=1` alone, without `UPEX_UPDATER_SELF_UPDATED`, so nothing tells the child that `cli/` was just written at upstream HEAD. The re-exec child checks for itself: it compares every file the self-update component owns against upstream by blob SHA and settles the cursor there when they all match, same effect as the env signal.
- **Punctuation-insensitive heading comparison.** The parity report's markdown heading diff normalizes separators before comparing: `## Setup — Config` and `## Setup: Config` read as the same heading instead of firing a spurious added/removed pair. Whitespace is collapsed too, so a stray double space never causes a false mismatch.
- **Skills registry regenerated after parity.** `REGISTRY.md` rebuilds after the parity hook runs, not before, so it reflects `.agents/skills/` as every hook left it, parity included. A skill row reporting a project edit overwritten ends with `run bun run skills:registry`, since the registry the sync just wrote was built from the upstream content the overwrite applied, not the project's edit.
- **Silently seeded watched files.** A watched file with no marker yet, whose upstream copy provably has not changed since the project's own lock cursor, is seeded silently too, same treatment as a freshly declared `updater.protected_paths` path but for a different reason: first-run noise on a migrated repo, or a project running per-file marker tracking for the first time, not a new upstream change to review.
- **`Gates: omitidas (...)` line.** A run that skips the gates entirely (`--no-gates`, or nothing applied) says so in the closing box instead of dropping the `Gates:` line: `Gates: omitidas (--no-gates)` or `Gates: omitidas (sin cambios)`.

---

## External CLIs (verified, not auto-installed)

The Verify phase of `bun setup` calls `verifyExternalClis()`. The installer **does not install** these: it does a **PATH probe only** (`which <name>` on POSIX, `where <name>` on Windows; presence only, no version check) and, when something is missing, logs an install hint (a cross-platform command when one exists) and lists the official docs URL in the closing report. The verify-only stance is deliberate: these are platform-specific tools whose canonical install path differs by OS, and forcing one path would surprise users on others.

| CLI              | Powers in this repo                                                                             | Quick install (cross-platform only — else use docs) | Official docs                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun`            | General-purpose runtime + package manager — this repo runs on bun (scripts, install.ts, dev)    | — (OS-specific — see docs)                          | <https://bun.com/>                                                       |
| `gh`             | GitHub CLI — `gh repo create`, PR ops, `gh api`. Powers the GitHub phase of the installer       | — (OS-specific — see docs)                          | <https://github.com/cli/cli#installation>                                |
| `supabase`       | Local Supabase stack, migrations, type generation (`supabase gen types`, wired by `/project-bootstrap`)                    | — (OS-specific — see docs)                          | <https://supabase.com/docs/guides/local-development/cli/getting-started> |
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
3. **`/playwright-cli`** — the community skill installed user-level by `bun setup` (via `bunx skills add`, `cli/install.ts` `USER_LEVEL_SKILLS`). It calls the `playwright-cli` binary from `@playwright/cli`.

The installer verifies (2). If you need the test runner (1) for E2E suites, add it per-project: `bun add -D @playwright/test`.

### Why verify and not install?

Three reasons:

1. **Cross-platform install paths differ**. macOS prefers Homebrew, Windows prefers winget/scoop, Linux varies by distro. A single auto-install path would be wrong for most users.
2. **Global installs are user-scoped, not repo-scoped**. Installing `vercel` or `supabase` globally as part of `bun setup` would leak state outside the repo. The installer is opinionated about staying local.
3. **Verify + point at docs** is the polite alternative. When a CLI is missing, the installer prints the official documentation URL on a continuation line so users can install the way that fits their setup.

---

## Troubleshooting

- **Jira catalogs sync (Jira phase)** — one question picks the catalog source for the whole project: **My own Jira workspace** (credentials checked first, a rejected token shows a card with a retry → `jira:sync-fields --force` + `jira:sync-workflows --force`, whose pickers are answered as cards through `--plan-json` / `--answers`; **requires `Administer` permission**), **UPEX-Galaxy standard** (`--upex --force` downloads the reference catalogs from `upex-galaxy/agentic-dev-boilerplate@main` + `jira:sync-link-types --upex` — no admin, no Jira API), or **Skip for now**. Whatever the choice, the installer then writes an empty `{}` placeholder for any of `.agents/jira-fields.json` / `jira-workflows.json` / `jira-link-types.json` still missing on disk — guaranteeing the SKILL.md-referenced paths exist so `lint-skills` STALE-PATH never fails `repo:check` / the pre-push hook. The `{}` form is treated as "unpopulated", so a later `bun run jira:sync-*` fills it without `--force`.
- **`jira:sync-fields` / `jira:sync-workflows` skipped with "not an Administrator"** — your authenticated Jira user does not have `ADMINISTER` (global) or `ADMINISTER_PROJECTS` (project-scoped) permission. The scripts pre-flight `/rest/api/3/mypermissions` to avoid mid-run 403s. The installer records `state.postInstall.jiraSync* = "skipped-no-admin"` and ends the Jira phase cleanly — repo stays usable (any missing catalog gets a `{}` placeholder, see above). Two recovery paths: (a) ask a Jira admin to run the scripts and commit the resulting `.agents/jira-*.json` to the team repo; (b) re-run `bun setup` (it asks again for every Jira step that is not `completed`) and pick the **UPEX-Galaxy standard** source — or run `bun run jira:sync-fields --upex && bun run jira:sync-workflows --upex` directly to pull the UPEX-standard catalog from `upex-galaxy/agentic-dev-boilerplate@main` (no admin, no Jira API calls — just a GitHub raw fetch).
- **Pre-push rejected — `lint:skills` STALE-PATH: `.agents/jira-fields.json` / `jira-workflows.json` does not exist on disk** — the bootstrap scaffolder prunes those two catalogs from a fresh project, and a no-admin / skipped Jira sync left the SKILL.md-referenced paths dangling. Setup now writes an empty `{}` placeholder for any missing catalog (Jira phase), so a fresh `bun setup` self-heals this. If you hit it on an older project, just create the files: `echo '{}' > .agents/jira-fields.json` and the same for `jira-workflows.json` (then optionally `bun run jira:sync-fields` to populate). The `{}` form is valid JSON, satisfies the lint, and is treated as "unpopulated" so a later sync fills it without `--force`.
- **`--upex` flag** — every `jira:sync-*` script (`fields`, `workflows`, `link-types`) accepts `--upex` to download the UPEX-standard reference JSON from the upstream boilerplate repo. URL is hardcoded per script and pinned to `main`. Bypasses ATLASSIAN_* env vars, `project_key`, `jira-required.yaml` and all Jira REST calls; only network requirement is GitHub raw access. Useful when (a) you have no Jira admin, (b) you want a working catalog without setting up auth, or (c) you want to compare against the canonical UPEX standard before custom-syncing.
- **engram not detected after install** — re-run `bun setup`. The preflight probes `which engram` plus `engram version`; a missing or too-old binary is a warning row with the install command, and if `engram version` prints no release version (a local or `go install` build) the Team phase asks whether to try anyway. Confirm the binary is on PATH (`which engram` should return a path under a Homebrew prefix or `~/go/bin/`).
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. All three MCP configs (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) start their servers through the `.env` loader; real values live in `.env`. A value that fails the schema stops only the server that needs it: `bunx varlock load --agent` shows which, redacted. Open `.env`, fill the var, and **restart the agent session** — env vars are read once at MCP-server spawn time. See `AGENTS.md` Critical Rule #9.
- **MCPs not loading at all** — the launch method is not the cause: a bare binary and a launch with no command line (desktop app, supervised worker) both work, because every MCP server starts through the `.env` loader, whatever launched the harness. Check that the checkout has a `.env` and that the `varlock` devDependency is installed (`bun install`); `bun run harness:env:check` exits 1 while a retired plaintext copy remains.
- **Codex ignores `.codex/config.toml` and the hook never fires** — the repository is not marked trusted. Codex loads project `.codex/` config and hooks only in a trusted repo, and that is runtime state no file check can see. `bun run setup:doctor` reports it on its own WARN line; approve trust in Codex, then restart the session.
- **The skills alias disappeared after an edit** — you probably hand-edited the `.claude/skills` alias. Fix the source instead (`.agents/skills/`), then run `bun run agents:compat`. Verify with `bun run agents:compat:check`.
- **A project command vanished into `.backups/shadowing-commands/`** — it had the name of a repo skill, which hides that skill's instructions. Port anything worth keeping into the skill, or rename the command, then restore it.
- **`agents:compat:check` fails on `CLAUDE.md`** — it holds more than the one-line `@AGENTS.md` shim. Move the prose into the owning skill (or into its instruction section under `.agents/instructions/`) and regenerate.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup. On Claude Code specifically, also confirm the `.claude/skills` alias exists; if a checkout dropped it, `bun run agents:compat` recreates it.
- **How do I uninstall Engram?** — the Claude Code plugin: `claude plugin uninstall engram@engram`. The MCP registration `engram setup <agent>` wrote lives in that agent's user-level config; the [engram agent-setup docs](https://github.com/Gentleman-Programming/engram/blob/main/docs/AGENT-SETUP.md) name the file per agent. Your memories stay in Engram's local store until you delete them.

---

## How to opt out

If you prefer not to use Engram, do not install the binary: the preflight warns and the run goes on without it. To make it permanent for unattended runs, set `INSTALL_SKIP_ENGRAM=1`: the installer then skips detection and `engram setup`, and still configures the canonical MCPs.

What you lose:

- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.

What you keep: every workflow skill committed in this repo (`/sprint-development`, `/project-foundation`, etc.) and the MCP servers `.mcp.json` declares. The repo is fully usable without Engram — the integration is additive.

---

## See also

- [Docs hub](https://upex-galaxy.github.io/agentic-dev-boilerplate/) — the visual start-here page and one deck per workflow skill
- [AGENTS.md](./AGENTS.md) — the always-on core every harness loads, with the router to `.agents/instructions/`; `.agents/instructions/agent-harnesses.md` §5.5 covers the multi-harness contract
- [CONTEXT.md](./CONTEXT.md) — context-engineering strategy and the surface-by-harness map (§2.1)
- [README.md](./README.md) — project overview and Quick Start
- [docs/setup/README.md](./docs/setup/README.md) — index of remaining setup guides (Jira, MCPs)

---

> **You are here**: What `bun setup` configures. **Read time**: 10 min. **Next**: `bun run setup:doctor` to verify your install, or [`README.md`](README.md) to navigate the rest.
