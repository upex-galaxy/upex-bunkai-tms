# MCP Configuration Templates

This directory contains **pre-configured MCP server templates** for different AI CLI tools.

## Available Templates

| File                     | For Tool    | Format | Description                         |
| ------------------------ | ----------- | ------ | ----------------------------------- |
| `claude.template.json`   | Claude Code | JSON   | `.mcp.json` in project root         |
| `opencode.template.json` | OpenCode    | JSON   | `opencode.json` in project root     |
| `codex.template.toml`    | Codex CLI   | TOML   | `~/.codex/config.toml` or `.codex/` |
| `gemini.template.json`   | Gemini CLI  | JSON   | `~/.gemini/settings.json`           |
| `dbhub.example.toml`     | DBHub (SQL) | TOML   | `dbhub.toml` in project root        |

## Variable Format

Templates use `{{VARIABLE}}` as a universal **find-and-replace placeholder** — it's NOT runtime-evaluated syntax. Before using the file, replace every `{{VAR}}` using one of two strategies:

| Strategy                           | Replace `{{VAR}}` with               | Then                                              | Use when                         |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------- | -------------------------------- |
| **A. Literal value** (legacy)      | The real secret directly             | Add the config file to `.gitignore`               | Personal-only config             |
| **B. Native env-var expansion** ⭐ | Tool-native syntax (see table below) | Store the real value in `.env`, commit the config | Team-shared config (recommended) |

### Native env-var syntax (for strategy B)

| Tool        | Syntax                       | Example           | Missing-var behavior                 |
| ----------- | ---------------------------- | ----------------- | ------------------------------------ |
| Claude Code | `${VAR}` / `${VAR:-default}` | `${API_TOKEN}`    | **Fails to parse the config** (safe) |
| OpenCode    | `{env:VAR}`                  | `{env:API_TOKEN}` | Substitutes empty string (footgun)   |
| Codex CLI   | `${VAR}`                     | `${API_TOKEN}`    | Depends on field                     |
| Gemini CLI  | `$VAR` / `${VAR}`            | `$API_TOKEN`      | Depends on field                     |

For strategy B, also need a `.env` loader so the agent process has the vars at spawn time:

- Cross-platform: `bun claude` / `bun opencode` (`dotenv-cli` wrapper in `package.json`)
- Mac/Linux optional: a `.envrc` with `dotenv_if_exists .env` + `direnv allow`

**Working example**: see `.mcp.json`, `opencode.jsonc`, and `.env.example` in this repo's root.

Common `{{VAR}}` placeholders found in templates:

- `{{API_BEARER_TOKEN}}` — your API bearer token
- `{{POSTMAN_API_KEY}}` — your Postman API key
- `{{ATLASSIAN_URL}}` / `{{ATLASSIAN_EMAIL}}` / `{{ATLASSIAN_API_TOKEN}}` — Atlassian credentials (single family for Jira + Confluence + acli)
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
| **context7**   | stdio  | Developer documentation lookup              |
| **tavily**     | remote | Web search                                  |
| **postman**    | remote | API collections & testing                   |
| **sentry**     | remote | Error monitoring                            |
| **vercel**     | remote | Deployment management                       |
| **notion**     | remote | Documentation                               |
| **atlassian**  | stdio  | Jira/Confluence                             |
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
cp docs/mcp/opencode.template.json opencode.json
```

**For Codex CLI**:

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

| Feature        | Claude         | OpenCode         | Codex          | Gemini       |
| -------------- | -------------- | ---------------- | -------------- | ------------ |
| Root key       | `mcpServers`   | `mcp`            | `mcp_servers`  | `mcpServers` |
| Command        | string         | array            | string         | string       |
| Env vars       | `env`          | `environment`    | `[server.env]` | `env`        |
| Remote type    | `type: "http"` | `type: "remote"` | `url`          | `httpUrl`    |
| Enable/disable | N/A            | `enabled`        | `enabled`      | N/A          |

## Security

- **Templates** (this folder) = Safe for git, uses `{{VAR}}` placeholders
- **Catalog files** (your copies) = NOT in git, contain real API keys
- `*.catalog.json` (your real-key copies) are in `.gitignore`
- `dbhub.toml` is **COMMITTED** (`${VAR}` placeholders, no secrets — same convention as `.mcp.json` / `opencode.jsonc`); only `dbhub.local.toml` (literal-secret overrides) is ignored

## Atlassian MCP (opt-in)

The Atlassian MCP server is **not enabled by default**. By default the boilerplate uses `acli` (Atlassian CLI) for all Jira/Confluence work. If you need MCP-level access to Atlassian (e.g. for tools that aren't exposed by acli), enable it manually:

1. Open the matching template under this directory:
   - Claude Code: `claude.template.json`
   - OpenCode: `opencode.template.json`
   - Gemini CLI: `gemini.template.json`
   - Codex CLI: `codex.template.toml`
2. Copy the `atlassian` block into your active config (`.mcp.json` for Claude Code, `opencode.jsonc` for OpenCode, etc.).
3. Confirm `ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` are set in `.env` (the installer already collects these during `bun run setup`).
4. Restart your agent so the new MCP server is picked up.

## Documentation

For complete setup guide, see: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md)

This includes:

- Step-by-step configuration for each tool
- DBHub (SQL) setup with connection strings
- OpenAPI setup with authentication flow
- Postman API key generation
- Troubleshooting guide
