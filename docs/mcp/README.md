# MCP Configuration

This directory holds **opt-in MCP blocks** the repo does not enable, one template per supported host, plus the DBHub example and the long-form per-host syntax guide. The servers the repo actually runs are not here: they live in the three committed configs below.

## Runtime configs committed in this repo

The boilerplate runs on three harnesses from one source (`AGENTS.md` + `.agents/skills/`, see `.agents/instructions/agent-harnesses.md` §5.5). The MCP inventory is the one surface that genuinely differs per host, so it exists once per format, committed, with the same server set on every host: whatever `.mcp.json` declares. Only LOCAL (stdio) servers are committed; web search is connected at harness level (see [Capabilities](#capabilities-not-server-names)).

| Harness             | Committed config     | How a server gets its `.env` values                     | How to open it                |
| ------------------- | -------------------- | ------------------------------------------------------- | ----------------------------- |
| Claude Code         | `.mcp.json`          | the `.env` loader, `--filter` = the names it reads      | `claude`, or the desktop app  |
| OpenCode            | `opencode.jsonc`     | the same loader, same filter                            | `opencode`                    |
| Codex CLI + Desktop | `.codex/config.toml` | the same loader, same filter, `startup_timeout_sec = 30` | `codex`, or Codex Desktop     |

`bun run agents:compat:check` normalizes the three files into one shape (transport, command, args, url, env vars, enabled) and compares them; a server behind the loader is read as its own command, with its `--filter` as its `.env` dependencies. The canonical set is whatever `.mcp.json` declares: a server missing from another host, present in one host only, or depending on a different set of `.env` variables, fails the check (it runs inside `repo:check` and the pre-push hook). The servers the boilerplate ships (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`) additionally get a strict per-host shape check when the project declares them; a project that declares a different set passes on the generic check alone. `.codex/config.toml` is read only in a repository Codex trusts; `bun run setup:doctor` warns about that.

### Getting `.env` into the MCP servers

- **Every host, every launch:** a stdio server that needs `.env` values starts through the `.env` loader, `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <command>` (`MCP_ENV_LOADER_*` / `mcpEnvLoaderArgs` in `cli/lib/agent-compatibility-contracts.ts`, ADR-0012; the pin equals the `varlock` devDependency). It reads the varlock schema plus `.env` / `.env.local` (or the secret manager the schema names, ADR-0011) from the project root at spawn time, however the harness was launched (terminal, desktop app, a natively launched supervised worker), and hands the server ONLY the names in its filter. `--no-redact-stdout` keeps the JSON-RPC stream byte-intact. A server that needs no value (context7) launches bare.
- **Nothing beside the loader:** no `${VAR}`, `{env:VAR}`, `{file:...}` or `env_vars` for the names the filter delivers. An unset `${VAR}` breaks a desktop launch, and an empty inherited value shadows `.env`. `bun run agents:compat:check` fails on either in the boilerplate and warns downstream with the exact launch to use.
- **Opening the agent:** its own binary in the project folder (`claude`, `opencode`, `codex`) or its desktop app. There is no wrapper script: nothing loads `.env` into the agent's process, so no secret reaches the AI's shell (ADR-0016). A command the agent runs that needs a value runs it through the loader in a subprocess, `bunx varlock run -- sh -c '<command using "$VAR">'`; `bun` scripts load `.env` themselves.
- **An MCP that behaves as if `.env` were ignored:** varlock lets a variable your shell already exports win over `.env`. `bun run vars:env:check` names the variables whose inherited value differs (names and lengths only); `unset` them or open a clean shell.
- **After a `.env` change:** restart the agent session. OpenCode caches the resolved config per directory, so also run `opencode service restart` (or quit every OpenCode session).
- **A worktree** carries its own `.env`; `bun run worktree:provision` copies it and derives nothing from it.
- **Plaintext copies from an older install** (the `env` block of `.claude/settings.local.json`, `.auth/opencode/<VAR>`): no host reads them. `bun run harness:env` retires them (equal to `.env`: deleted; different: moved to `.auth/harness-env-backup/<VAR>` and named), and `bun run harness:env:check` exits 1 while one remains.

### A missing credential fails silently

None of the three hosts refuses to start when a variable is missing. The loader hands the server the variable unset or empty, the server starts, and it dies on its first authenticated call. A value that FAILS the schema stops only the server that needs it: `bunx varlock load --agent` shows which, redacted. So a 401/403 or a mystery tool failure is the signal, not a parse error. Check with `/mcp` inside the session, fix `.env`, then restart the session: values are read when the MCP server spawns (`AGENTS.md` Critical Rule #9).

## Capabilities, not server names

Skills never name a server. They declare a CAPABILITY in `metadata.requires_capabilities` (`library-docs`, `web-search`, `db`, `automation-flows`, `diagrams`) and the AI resolves it by tool-name SUFFIX, whatever prefix the host gave the server: `mcp__context7__query-docs` and a claude.ai connector's `mcp__claude_ai_context7__query-docs` are the same capability. When no tool provides a capability the skill needs, the AI stops at that step, names the capability and how to enable it, and waits: it never swaps in another tool on its own.

- **Web search** (`web-search`) is connected once per machine at harness level (Exa first, Tavily second), never in a project file. The recommended servers and their connect commands are in `cli/lib/harness-level-mcps.ts`; `bun setup` prints them and `bun run setup:doctor` shows what this machine declares.
- **Browser automation** is not an MCP: it is `playwright-cli` named sessions (`.agents/instructions/agent-tool-resolution.md` §6, `[AUTOMATION_TOOL]`).
- **Jira / Confluence** go through `acli` by default; the Atlassian MCP is opt-in ([below](#atlassian-mcp-opt-in)).

Vocabulary, suffixes and the stop procedure: `.agents/skills/agentic-dev-core/references/mcp-capabilities.md`. Why web search stays out of the project files: `.context/ADR/ADR-0005-harness-level-mcps-and-capabilities.md`.

## Files in this directory

| File                         | For                | Format | Holds                                                                                       |
| ---------------------------- | ------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `claude.template.json`       | Claude Code        | JSON   | opt-in blocks for `.mcp.json`, the stdio ones that need values already on the `.env` loader |
| `opencode.template.json`     | OpenCode           | JSON   | opt-in blocks for `opencode.jsonc` (each one `"enabled": false`), same loader               |
| `codex.template.toml`        | Codex CLI + Desktop | TOML  | opt-in blocks for `.codex/config.toml`, the stdio ones that need values already on the `.env` loader |
| `dbhub.example.toml`         | DBHub (SQL)        | TOML   | starting point for a `dbhub.toml`, used by the opt-in `sql` block                           |
| `mcp-configuration-guide.md` | all three hosts    | md     | per-host syntax reference (scopes, CLI commands, remote servers, OAuth)                     |

`bun sync --update-mcp-template <claude|opencode|codex>` refreshes one template from upstream.

## Adding an opt-in server

Never `cp` a template over a committed config: it would replace the parity-checked server set. Copy single blocks instead.

1. Copy the server's block from each of the three templates into `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`. A server added to one host only fails `bun run agents:compat:check`.
2. Replace each `{{VAR}}` (see below). A stdio block that needs secrets already starts through the `.env` loader: its `--filter` lists the exact names the server reads, and those names go in `.env` as they are.
3. Declare the variables in `.env.schema` (`@sensitive` on a secret), add them with an empty value to `.env.example`, and set them in `.env`.
4. Run `bun run agents:compat:check`.
5. Restart the session and confirm the server with `/mcp`.
6. If a skill should use it, give it a capability row in `mcp-capabilities.md` first; a server no skill instructs gets no capability name.

### `{{VAR}}` placeholders

Templates use `{{VARIABLE}}` as a find-and-replace marker, not runtime syntax. A stdio server never carries a secret marker: it reads its secrets through the `.env` loader under their own names. Where a secret sits inside a larger value (`API_HEADERS="Authorization:Bearer <token>"`), the whole value goes in `.env` under the name the server reads.

The one secret marker left is on a REMOTE (HTTP) server, which cannot start through the loader. Replace it with the host-native reference and keep its value in `.env`:

| Host        | `{{POSTMAN_API_KEY}}` becomes                       |
| ----------- | --------------------------------------------------- |
| Claude Code | `${POSTMAN_API_KEY}`                                |
| OpenCode    | `{env:POSTMAN_API_KEY}`                             |
| Codex       | `bearer_token_env_var = "POSTMAN_API_KEY"` (already in the template) |

Those three resolve from the harness's own process environment, which `.env` reaches on no launch. Prefer the server's OAuth login (as the Atlassian remote MCP through `mcp-remote` does). A token-only remote server means you export that ONE variable in the shell before launching, which knowingly puts it in the agent's environment.

Non-secret placeholders (`{{API_BASE_URL}}`, `{{OPENAPI_SPEC_URL}}`, `{{SENTRY_ORG}}`, `{{SENTRY_PROJECT}}`) are pasted as literal values.

Pasting a literal secret into a config is only acceptable in a personal, gitignored copy; nothing in `.gitignore` covers such a file for you.

## Key differences by host

| Feature        | Claude Code    | OpenCode                    | Codex                                                       |
| -------------- | -------------- | --------------------------- | ----------------------------------------------------------- |
| Root key       | `mcpServers`   | `mcp`                       | `mcp_servers`                                               |
| Command        | string + `args` | array                      | string + `args`                                             |
| Literal env    | `env`          | `environment`               | `[mcp_servers.X.env]`                                       |
| Stdio secret   | `.env` loader  | `.env` loader               | `.env` loader                                               |
| Remote secret  | `${VAR}`       | `{env:VAR}`                 | not in the URL: `url` + `bearer_token_env_var`              |
| Remote type    | `type: "http"` | `type: "remote"`            | `url`                                                       |
| Enable/disable | N/A            | `enabled`                   | `enabled`                                                   |

Full syntax per host: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md).

## Security

- **Templates** (this folder) are safe for git: `{{VAR}}` placeholders only.
- **Committed configs** (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) hold variable names only; values live in `.env` (gitignored), and no plaintext copy is written anywhere else.
- **DBHub:** a project that adds it commits `dbhub.toml` with `${VAR}` references only, filled by the `sql` block's loader filter; literal overrides go in `dbhub.local.toml`, which `.gitignore` already covers.

## Atlassian MCP (opt-in)

The Atlassian MCP server is **not enabled by default**: the boilerplate uses `acli` for all Jira and Confluence work. If you need MCP-level access to Atlassian (tools `acli` does not expose), enable it on all three hosts:

1. Copy the `atlassian` block from each template into `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`. It is the same server everywhere, Atlassian's remote MCP through `mcp-remote`, and it launches bare: no `.env` loader, no variable.
2. Run `bun run agents:compat:check`, then restart the session.
3. On the first tool call, `mcp-remote` opens the Atlassian OAuth consent in the browser. It reads neither `ATLASSIAN_EMAIL` nor `ATLASSIAN_API_TOKEN`, so those stay `acli`'s alone.
