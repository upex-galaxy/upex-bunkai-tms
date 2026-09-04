# MCP Configuration Templates

This directory contains **pre-configured MCP server templates** for different AI CLI tools, plus the syntax reference for each host's env-var expansion.

## Runtime configs committed in this repo

The boilerplate runs on three harnesses from one source (`AGENTS.md` + `.agents/skills/`, see `AGENTS.md` §5.5). The MCP inventory is the one surface that genuinely differs per host, so it exists once per format, committed, with the same four servers (`context7`, `tavily`, `supabase`, `n8n`):

| Harness             | Committed config     | Env-var syntax                                      | Launcher (loads `.env` first) |
| ------------------- | -------------------- | --------------------------------------------------- | ----------------------------- |
| Claude Code         | `.mcp.json`          | `${VAR}` inside args / env values                   | `bun run claude`              |
| OpenCode            | `opencode.jsonc`     | `{env:VAR}` inside command / environment values     | `bun run opencode`            |
| Codex CLI + Desktop | `.codex/config.toml` | `env_vars = ["VAR"]` / `bearer_token_env_var` by name | `bun run codex`               |

`bun run agents:compat:check` normalizes the three files into one shape (transport, command, args, url, env vars, enabled) and compares them. The canonical set is whatever `.mcp.json` declares: a server missing from another host, present in one host only, or depending on a different set of `.env` variables, fails the check (it runs inside `repo:check` and the pre-push hook). The four servers above additionally get a strict per-host shape check when declared; a project that declares a different set (say `playwright` instead of `n8n`) passes on the generic check alone. Gemini CLI and Cursor have no runtime adapter: they stay template-only below. `.codex/config.toml` is read only in a repository Codex trusts; `bun run setup:doctor` warns about that.

## Available Templates

| File                     | For Tool    | Format | Description                                                                                          |
| ------------------------ | ----------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `claude.template.json`   | Claude Code | JSON   | `.mcp.json` in project root                                                                          |
| `opencode.template.json` | OpenCode    | JSON   | `opencode.jsonc` in project root                                                                     |
| `codex.template.toml`    | Codex CLI   | TOML   | Derived from the committed `.codex/config.toml` (same four servers) plus opt-in extras with `{{VAR}}` |
| `gemini.template.json`   | Gemini CLI  | JSON   | `~/.gemini/settings.json` (template only, no runtime adapter in this repo)                           |
| `dbhub.example.toml`     | DBHub (SQL) | TOML   | `dbhub.toml` in project root                                                                         |

## Variable Format

Templates use `{{VARIABLE}}` as a universal **find-and-replace placeholder** — it's NOT runtime-evaluated syntax. Before using the file, replace every `{{VAR}}` using one of two strategies:

| Strategy                           | Replace `{{VAR}}` with               | Then                                              | Use when                         |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------- | -------------------------------- |
| **A. Literal value** (legacy)      | The real secret directly             | Add the config file to `.gitignore`               | Personal-only config             |
| **B. Native env-var expansion** ⭐ | Tool-native syntax (see table below) | Store the real value in `.env`, commit the config | Team-shared config (recommended) |

### Native env-var syntax (for strategy B)

| Tool        | Syntax                                                                        | Example                       | Missing-var behavior                                          |
| ----------- | ----------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| Claude Code | `${VAR}` / `${VAR:-default}`                                                  | `${API_TOKEN}`                | **Fails to parse the config** (safe)                          |
| OpenCode    | `{env:VAR}`                                                                   | `{env:API_TOKEN}`             | Substitutes empty string (footgun)                            |
| Codex CLI   | `env_vars = ["VAR"]` (stdio) / `bearer_token_env_var = "VAR"` (HTTP), by name | `env_vars = ["API_TOKEN"]`    | Variable is not forwarded; the server fails at auth (401/403) |
| Gemini CLI  | `$VAR` / `${VAR}`                                                             | `$API_TOKEN`                  | Depends on field                                              |

Codex never expands `${VAR}` inside `args` or `env` values, so a placeholder there is passed to the server as literal text. The committed `.codex/config.toml` therefore forwards every secret by name and adapts two servers: `tavily` runs as Streamable HTTP with `bearer_token_env_var = "TAVILY_API_KEY"` (the `mcp-remote` tunnel in `.mcp.json` only exists to put the key in a URL), and `supabase` drops `--access-token` in favour of `SUPABASE_ACCESS_TOKEN` in `env_vars`, which the package reads as its documented fallback. `[mcp_servers.X.env]` tables hold literal settings only. Details in [`mcp-configuration-guide.md`](./mcp-configuration-guide.md) § Codex CLI.

For strategy B, also need a `.env` loader so the agent process has the vars at spawn time:

- Cross-platform: `bun run claude` / `bun run opencode` / `bun run codex` (`dotenv -o -e .env` wrappers in `package.json`; `-o` makes `.env` win over an inherited shell variable)
- Mac/Linux optional: a `.envrc` with `dotenv_if_exists .env` + `direnv allow`

**Working example**: see `.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, and `.env.example` in this repo's root.

Common `{{VAR}}` placeholders found in templates:

- `{{API_BEARER_TOKEN}}` — your API bearer token
- `{{POSTMAN_API_KEY}}` — your Postman API key
- `{{ATLASSIAN_EMAIL}}` / `{{ATLASSIAN_API_TOKEN}}` — Atlassian credentials (one family for Jira + Confluence + acli)
- `{{ATLASSIAN_URL}}` — the Atlassian site host. **Not a `.env` variable**: it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url`. An MCP config cannot run a command, so paste the literal host here; print it with `bun run --silent jira:url`
- `{{TAVILY_API_KEY}}`, `{{SUPABASE_ACCESS_TOKEN}}`, `{{GEMINI_API_KEY}}`, `{{SLACK_MCP_XOXP_TOKEN}}`, `{{DB_USER}}`, `{{DB_PASSWORD}}`

Non-sensitive values (URLs, paths) use real examples from the SoloQ project.

## MCP Servers Included

| Server         | Type   | Description                                 |
| -------------- | ------ | ------------------------------------------- |
| **playwright** | stdio  | E2E browser testing with vision/PDF/tracing |
| **devtools**   | stdio  | Chrome DevTools integration                 |
| **openapi**    | stdio  | REST API testing via OpenAPI spec           |
| **sql**        | stdio  | Database testing via DBHub                  |
| **supabase**   | stdio  | Supabase database management                |
| **shadcn**     | stdio  | shadcn/ui component registry                |
| **context7**   | stdio  | Developer documentation lookup              |
| **tavily**     | remote | Web search                                  |
| **postman**    | remote | API collections & testing                   |
| **sentry**     | remote | Error monitoring                            |
| **vercel**     | remote | Deployment management                       |
| **notion**     | remote | Documentation                               |
| **atlassian**  | stdio  | Jira/Confluence                             |
| **nanobanana** | stdio  | Image generation (Gemini)                   |
| **github**     | remote | Repository management                       |
| **slack**      | stdio  | Team communication                          |

## Quick Start

### 1. Copy Template

**For Claude Code**:

```bash
cp docs/mcp/claude.template.json .mcp.json
```

**For OpenCode**:

```bash
cp docs/mcp/opencode.template.json opencode.jsonc
```

**For Codex CLI**: this repo already ships `.codex/config.toml` with the four canonical servers, so nothing to copy for a project checkout. The template is for the opt-in extras (copy a single `[mcp_servers.X]` block into `.codex/config.toml`) or for a machine-wide config:

```bash
mkdir -p ~/.codex
cp docs/mcp/codex.template.toml ~/.codex/config.toml
```

**For Gemini CLI**:

```bash
mkdir -p ~/.gemini
cp docs/mcp/gemini.template.json ~/.gemini/settings.json
```

### 2. Create DBHub Config (for SQL testing)

```bash
cp docs/mcp/dbhub.example.toml dbhub.toml
# Edit with your database credentials
```

### 3. Replace Variables

Open your config file and replace each `{{VARIABLE}}` placeholder. Pick a strategy:

**Strategy A — literal value (then gitignore the file):**

```json
"API_HEADERS": "Authorization:Bearer {{API_BEARER_TOKEN}}"
```

↓

```json
"API_HEADERS": "Authorization:Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Strategy B — env-var expansion (then commit the file, secrets in `.env`):**

For Claude Code:

```json
"API_HEADERS": "Authorization:Bearer ${API_BEARER_TOKEN}"
```

For OpenCode:

```json
"API_HEADERS": "Authorization:Bearer {env:API_BEARER_TOKEN}"
```

Then in `.env` (gitignored):

```
API_BEARER_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

### 4. Verify Setup

Run your agent and verify with:

```
/mcp
```

## Key Differences by Tool

| Feature        | Claude         | OpenCode         | Codex                                                   | Gemini       |
| -------------- | -------------- | ---------------- | ------------------------------------------------------- | ------------ |
| Root key       | `mcpServers`   | `mcp`            | `mcp_servers`                                           | `mcpServers` |
| Command        | string         | array            | string                                                  | string       |
| Env vars       | `env`          | `environment`    | `env_vars` (forwarded by name) + `[server.env]` (literals) | `env`        |
| Secret in URL  | `${VAR}`       | `{env:VAR}`      | not possible: `url` + `bearer_token_env_var`            | `$VAR`       |
| Remote type    | `type: "http"` | `type: "remote"` | `url`                                                   | `httpUrl`    |
| Enable/disable | N/A            | `enabled`        | `enabled`                                               | N/A          |

## Security

- **Templates** (this folder) = Safe for git, uses `{{VAR}}` placeholders
- **Active configs** (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) = committed, reference env vars only; secrets live in `.env` (gitignored)
- **Literal-secret copies** (strategy A) = NOT for git — add them to `.gitignore` yourself; there is no automatic pattern covering them
- `dbhub.toml` is **COMMITTED** (`${VAR}` placeholders, no secrets — same convention as `.mcp.json` / `opencode.jsonc`); only `dbhub.local.toml` (literal-secret overrides) is ignored

## Atlassian MCP (opt-in)

The Atlassian MCP server is **not enabled by default**. By default the boilerplate uses `acli` (Atlassian CLI) for all Jira/Confluence work. If you need MCP-level access to Atlassian (e.g. for tools that aren't exposed by acli), enable it manually:

1. Open the matching template under this directory:
   - Claude Code: `claude.template.json`
   - OpenCode: `opencode.template.json`
   - Gemini CLI: `gemini.template.json`
   - Codex CLI: `codex.template.toml`
2. Copy the `atlassian` block into your active config (`.mcp.json` for Claude Code, `opencode.jsonc` for OpenCode, etc.).
3. Confirm `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` are set in `.env` (the installer collects both during `bun run setup`).
4. Replace `{{ATLASSIAN_URL}}` in the block you pasted with the literal site host (Codex only: its template's `atlassian` block authenticates via `mcp-remote` OAuth and has no `{{ATLASSIAN_URL}}` to replace). Print it with:

   ```bash
   bun run --silent jira:url
   ```

   It is not read from `.env` — an MCP config cannot invoke a command, so this one value is pasted rather than referenced. After a site migration, update `.agents/project.yaml` first, then re-paste here; `bun run setup:doctor` will not catch a stale value inside an MCP config.

5. Restart your agent so the new MCP server is picked up.

## Documentation

For complete setup guide, see: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md)

This includes:

- Step-by-step configuration for each tool
- DBHub (SQL) setup with connection strings
- OpenAPI setup with authentication flow
- Postman API key generation
- Troubleshooting guide
