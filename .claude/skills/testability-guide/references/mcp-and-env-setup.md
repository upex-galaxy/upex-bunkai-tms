# MCP & Env Setup — content the `/qa` page must teach

> **Purpose**: The canonical, detection-adapted content for the page's "Agentic Testing" sections: how to wire the three testing MCPs (DBHub / OpenAPI / Playwright) + Postman across the four supported agents, how the env-var strategy works, and how to activate `.env` in the terminal so the MCP configs resolve.
>
> **When to read**: Phase 4 (page codegen), sections §3–§5. Pair with `page-craft.md` for the component shapes that render this content.
>
> **Source of truth**: this mirrors the host project's own MCP guide when one exists (e.g. `docs/mcp/mcp-configuration-guide.md` + the real `.mcp.json` / `opencode.jsonc` / `dbhub.toml` detected in Phase 1). **Render the blocks the project actually ships. Do NOT invent package names, flags, env vars, or behaviors.** If the project has no such config and no canonical guide, render the reference blocks below as the documented default and mark them "ejemplo — adaptar al proyecto".

---

## The zero-hardcode + zero-invention rule

Every concrete value (`API_BASE_URL`, spec URL, DB host, package version) comes from Phase-1 detection or the project's committed config. Every external behavioral claim (a flag being mandatory, a missing-var behavior, a tool's capability list) must trace to the project's own MCP guide or the tool's official docs. If you need to state something about an MCP/library that is NOT in the detected config or the host's guide, look it up via Context7 or Tavily first — never fabricate.

---

## §3 — The Testing Trinity ("La Trifuerza del Testing")

Three layers, one complete testing surface:

```
UI (Playwright) + API (OpenAPI / Postman) + DB (DBHub) = Testing Completo
```

| Layer | MCP / tool | What it's for | Needs |
| --- | --- | --- | --- |
| **UI** | `@playwright/mcp` + the `/playwright-cli` skill | Drive the browser: scripted regression + agentic exploration | login `data-testid`s + a demo user |
| **API** | OpenAPI MCP (`@ivotoby/openapi-mcp-server`) | Invoke endpoints directly from the agent | Bearer token + spec URL |
| **API (formal)** | Postman MCP (`https://mcp.postman.com/mcp`) | Manage collections, run formal test suites | Postman API key |
| **DB** | DBHub MCP (`@bytebase/dbhub`) | Verify data directly in the database | read-only connection (`dbhub.toml`) |

Render this as the overview card grid in §3. Each card deep-links to its detailed section (§4 DB, §5 API, §6 UI).

---

## Env-var strategy (the EnvSetup section)

MCP config files are **committed to git** and contain **no secrets** — they reference env vars by expansion. The real values live in `.env` (gitignored). Two strategies:

| Strategy | Replace each `{{...}}` placeholder with | Then | Use when |
| --- | --- | --- | --- |
| **A. Literal value** (legacy) | the real secret directly | add the config file to `.gitignore` | personal-only config |
| **B. Env-var expansion + commit** (recommended) | the agent's native env syntax | store the real value in `.env`, commit the config | team-shared config |

### Native env-var syntax per agent (strategy B)

| Agent | Config file | Syntax | If the var is missing |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` | `${VAR}` / `${VAR:-default}` | **fails to parse the config (safe)** |
| OpenCode | `opencode.jsonc` | `{env:VAR}` | **substitutes empty string (footgun)** |
| Codex CLI | `config.toml` | `${VAR}` / `bearer_token_env_var = "NAME"` | depends on field |
| Gemini CLI | `settings.json` | `$VAR` / `${VAR}` | depends on field |

> Render the "missing var" column prominently — it's the #1 cause of cryptic MCP failures.

### Config-file shape differences per agent

| Feature | Claude | OpenCode | Codex | Gemini |
| --- | --- | --- | --- | --- |
| Root key | `mcpServers` | `mcp` | `mcp_servers` | `mcpServers` |
| Command | string | array | string | string |
| Env key | `env` | `environment` | `[server.env]` | `env` |
| Remote | `type:"http"` | `type:"remote"` | `url` + `bearer_token_env_var` | `httpUrl` |
| Enable/disable | n/a | `enabled` | `enabled` | n/a |

### Activating `.env` in the terminal (only if the project uses strategy B)

The agent process must have the vars at **spawn time**. Two ways:

- **A) Cross-platform wrapper** (default — Windows/Mac/Linux): the project's `package.json` ships `bun run claude` / `bun run opencode` (a `dotenv-cli` wrapper). Launch the agent through it.
- **B) direnv** (Mac/Linux, optional): a committed `.envrc` auto-loads `.env` on `cd` into the repo. One-time setup: `brew install direnv` (or distro pkg) → add `eval "$(direnv hook zsh)"` to `~/.zshrc` → `direnv allow`. Then launch `claude` / `opencode` directly.

> Only render the mechanisms the project actually ships (detected in Phase 1: `claude`/`opencode` scripts, `.envrc`). If the project's runtime auto-loads `.env` (e.g. Bun), say so but note the agent process still needs the vars exported for the MCP launcher.

### CRITICAL rule (render as a warning callout)

> If an MCP server fails to start or returns **401 / 403**, an env var almost certainly isn't loaded. **Exit the agent, fix `.env`, and re-enter** — env vars are read once when the MCP is spawned. Do not work around it.

---

## §4 — DB testing (DBHub) — TWO ways to connect

### Way 1 — DBHub MCP (agentic)

The project ships `dbhub.toml` at the root (committed; `${VAR}` placeholders, no secrets):

```toml
[[sources]]
id = "primary"
type = "${DBHUB_TYPE}"        # sqlserver | postgres | mysql | sqlite | mariadb
host = "${DBHUB_HOST}"
port = "${DBHUB_PORT}"        # 1433 sqlserver · 5432 postgres · 3306 mysql/mariadb
database = "${DBHUB_DATABASE}"
user = "${DBHUB_USER}"
password = "${DBHUB_PASSWORD}"
sslmode = "require"
```

Declare in `.env` (render the slots, never values): `DBHUB_TYPE`, `DBHUB_HOST`, `DBHUB_PORT`, `DBHUB_DATABASE`, `DBHUB_USER`, `DBHUB_PASSWORD`.

> **DBHub footgun (warning callout)**: DBHub substitutes the literal string `${VAR}` when a var is missing — producing a cryptic auth failure instead of a startup error. Verify before launching: `env | grep DBHUB`.

MCP config block, per agent (substitute the detected `dbhub.toml` path; values shown are the real package + flags from the canonical config):

```jsonc
// Claude Code → .mcp.json
"dbhub": { "command": "bunx", "args": ["-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"] }

// OpenCode → opencode.jsonc
"dbhub": { "type": "local", "command": ["bunx", "-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"], "enabled": true }
```

```toml
# Codex → config.toml
[mcp_servers.dbhub]
command = "bunx"
args = ["-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"]
```

```json
// Gemini → settings.json
"dbhub": { "command": "bunx", "args": ["-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"] }
```

### Way 2 — Connection URI for a VSCode/Cursor SQL extension (manual)

For testers who prefer a GUI SQL client (e.g. SQLTools, the SQL Server extension), give the connection string shape for the detected engine — host/db/sslmode from detection, credentials by name:

```
# postgres
postgresql://<DBHUB_USER>:<DBHUB_PASSWORD>@<DBHUB_HOST>:5432/<DBHUB_DATABASE>?sslmode=require
# sqlserver
sqlserver://<DBHUB_USER>:<DBHUB_PASSWORD>@<DBHUB_HOST>:1433/<DBHUB_DATABASE>
```

Both ways use the SAME read-only QA credentials from the credentials artifact. Neither inlines a real password on the page.

---

## §5 — API testing — TWO ways + the auth flow

### Auth flow (detected — render the project's real shape)

Detect the real login endpoint + token shape in Phase 1. Render the flow as a small diagram + a `curl`. Example (Supabase Auth, as in the QA boilerplate — substitute the detected endpoint/host/keys):

```bash
# 1) Get the access token (endpoint + headers + body are DETECTED, not assumed)
curl -X POST '<LOGIN_ENDPOINT>' \
  -H 'apikey: <SUPABASE_ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"<see credentials source>","password":"<see credentials source>"}'
# → { "access_token": "eyJ…", "token_type": "bearer", "expires_in": … }

# 2) Use it on every request
curl '<API_BASE_URL>/<endpoint>' -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

If the project ships `bun run api:login` (or equivalent), document it: it performs the login and writes `API_TOKEN` into `.env`; **restart the terminal/agent afterward** so MCP servers pick up the new token.

Render the AuthMethods tabs for every method detected (Supabase token / Bearer / cookie `sb-<ref>-auth-token` / `X-API-Key` / custom JWT). Only render methods the project actually exposes.

### Way 1 — OpenAPI MCP (agentic, invoke endpoints)

> The `--tools dynamic` flag is **mandatory** (without it the server errors 400) — this is documented behavior of `@ivotoby/openapi-mcp-server`, not an assumption.

```jsonc
// Claude Code → .mcp.json
"openapi": {
  "command": "bunx",
  "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "env": {
    "API_BASE_URL": "${API_BASE_URL}",
    "OPENAPI_SPEC_PATH": "${OPENAPI_SPEC_PATH}",
    "API_HEADERS": "Authorization:Bearer ${API_TOKEN}"
  }
}
```

```jsonc
// OpenCode → opencode.jsonc  (env key is "environment", {env:VAR} syntax)
"openapi": {
  "type": "local",
  "command": ["bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "environment": {
    "API_BASE_URL": "{env:API_BASE_URL}",
    "OPENAPI_SPEC_PATH": "{env:OPENAPI_SPEC_PATH}",
    "API_HEADERS": "Authorization:Bearer {env:API_TOKEN}"
  },
  "enabled": true
}
```

```toml
# Codex → config.toml
[mcp_servers.openapi]
command = "bunx"
args = ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"]
[mcp_servers.openapi.env]
API_BASE_URL = "${API_BASE_URL}"
OPENAPI_SPEC_PATH = "${OPENAPI_SPEC_PATH}"
API_HEADERS = "Authorization:Bearer ${API_TOKEN}"
```

```json
// Gemini → settings.json  ($VAR syntax)
"openapi": {
  "command": "bunx",
  "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "env": {
    "API_BASE_URL": "$API_BASE_URL",
    "OPENAPI_SPEC_PATH": "$OPENAPI_SPEC_PATH",
    "API_HEADERS": "Authorization:Bearer $API_TOKEN"
  }
}
```

Tools it exposes (per the canonical guide): `list-api-endpoints`, `get-api-endpoint-schema`, `invoke-api-endpoint`. Env slots: `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `API_TOKEN`.

### Way 2 — Postman MCP (formal API test documentation)

For collection-based, shareable, formal test suites:

```jsonc
// Claude Code → .mcp.json
"postman": { "type": "http", "url": "https://mcp.postman.com/mcp", "headers": { "Authorization": "Bearer ${POSTMAN_API_KEY}" } }

// OpenCode → opencode.jsonc
"postman": { "type": "remote", "url": "https://mcp.postman.com/mcp", "headers": { "Authorization": "Bearer {env:POSTMAN_API_KEY}" }, "enabled": true }
```

```toml
# Codex → config.toml
[mcp_servers.postman]
url = "https://mcp.postman.com/mcp"
bearer_token_env_var = "POSTMAN_API_KEY"
```

```json
// Gemini → settings.json
"postman": { "httpUrl": "https://mcp.postman.com/mcp", "headers": { "Authorization": "Bearer $POSTMAN_API_KEY" } }
```

Generate the key at postman.com → Settings → API Keys. Env slot: `POSTMAN_API_KEY`. Postman MCP covers collections, requests, environments, specs, mocks, and workspaces (per the canonical guide).

### Link to `/api/docs`

Link to the project's docs UI at its DETECTED route (`/api/docs`, `/api-docu`, …) and name the DETECTED renderer (Scalar / Redoc / Swagger). Never assume which one.

---

## §6 — UI testing (Playwright) — see `page-structure.md` §6

The Playwright MCP block (detected from `.mcp.json`), the scripted JWT-interception fixture, and the agentic `/playwright-cli` prompts live in `page-structure.md` §6 + `page-craft.md`. The decision rule: **scripted** for regression/CI, **agentic CLI** for exploratory / bug-hunting / onboarding.

```jsonc
// Playwright MCP (from the canonical .mcp.json — render the detected caps)
"playwright": {
  "command": "bunx",
  "args": ["@playwright/mcp@latest", "--caps", "vision,pdf,testing,tracing,tabs",
           "--timeout-action", "10000", "--timeout-navigation", "30000",
           "--viewport-size", "1920x1080"]
}
```

---

## Substitution checklist (publish/render time)

- [ ] Every `${VAR}` / `{env:VAR}` / `$VAR` matches the agent tab it's under.
- [ ] `API_BASE_URL`, `OPENAPI_SPEC_PATH`, docs route, spec route = DETECTED values, not the examples above.
- [ ] DBHub `type` matches the detected engine; both `dbhub.toml` and the URI use the same engine.
- [ ] Only agent tabs the project supports are rendered (don't show Gemini if the project has no Gemini story — but the 4-tab reference is fine as documentation).
- [ ] No real password, token, or private host anywhere — only `.env` slot names + `<see credentials source>`.
