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
| **UI** | **`playwright-cli` binary + the `/playwright-cli` skill** (default, Q7) | Drive the browser: scripted regression + agentic exploration | login `data-testid`s + a demo user |
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

The agent process must have the vars at **spawn time**. Three ways:

- **A) Cross-platform wrapper** (default — Windows/Mac/Linux): the project's `package.json` ships `bun run claude` / `bun run opencode` (a `dotenv-cli` wrapper). Launch the agent through it.
- **B) Source into the current shell** (Mac/Linux/Git Bash): `set -a; source .env; set +a` exports every `.env` var into your CURRENT shell, then you launch a bare `claude` / `opencode`. **Must be SOURCED** — a `bun run` wrapper runs in a subshell and the exports won't persist to your terminal. Useful when you also want to inspect the vars yourself.
- **C) direnv** (Mac/Linux, optional): a committed `.envrc` auto-loads `.env` on `cd` into the repo. One-time setup: `brew install direnv` (or distro pkg) → add `eval "$(direnv hook zsh)"` to `~/.zshrc` → `direnv allow`. Then launch `claude` / `opencode` directly.

> Only render the mechanisms the project actually ships (detected in Phase 1: `claude`/`opencode` scripts, `.envrc`; `source .env` always applies on a POSIX shell). If the project's runtime auto-loads `.env` (e.g. Bun), say so but note the agent process still needs the vars exported for the MCP launcher.

### CRITICAL rule (render as a warning callout)

> If an MCP server fails to start or returns **401 / 403**, an env var almost certainly isn't loaded. **Exit the agent, fix `.env`, and re-enter** — env vars are read once when the MCP is spawned. Do not work around it.

### Verifying a var loaded — the bare `env | grep` is MISLEADING

A naked `env | grep <PREFIX>` comes back **EMPTY even when everything is correct**: the `dotenv-cli` wrapper (path A) injects vars into the agent **CHILD process**, not your parent shell — so your terminal's `env` never had them. Testers waste hours here. Use the trio instead (`<PREFIX>` = the project's detected MCP env prefix, e.g. `DBHUB`):

```bash
grep <PREFIX> .env                       # (a) is the var present in the file?
dotenv -e .env -- env | grep <PREFIX>    # (b) what the MCP actually sees at spawn (the truth)
set -a; source .env; set +a              # (c) load .env into THIS shell, then inspect freely
```

Render this trio everywhere the page tells a tester to "verify the env var" — never the bare `env | grep` alone.

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

> **DBHub footgun (warning callout)**: DBHub substitutes the literal string `${VAR}` when a var is missing — producing a cryptic auth failure instead of a startup error. Verify before launching with the trio above — a bare `env | grep DBHUB` is misleading (the wrapper injects into the agent child process, not your shell): use `grep DBHUB .env` (in file), `dotenv -e .env -- env | grep DBHUB` (what the MCP sees), and `set -a; source .env; set +a` (load into your shell).
>
> **DBHub takes `[[sources]]`, not a DSN**: DBHub does NOT accept a raw connection string — only the split `[[sources]]` fields (`host` / `port` / `user` / `password` / `database` / `sslmode`), each from its own slot. A raw `postgresql://…` URI is ONLY for a VSCode/Cursor SQL extension (Way 2 below).

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

**RECOMMENDED API-auth bootstrap — the `api-login`-style mini-CLI.** When the project ships (or can ship) a small CLI like `bun run api:login` — or a headless signup/signin endpoint that mints a Personal Access Token — promote it as the FIRST-CLASS path for API auth, above hand-running curl. It logs in and writes the token into `.env` (e.g. `API_TOKEN`), so the OpenAPI MCP can authenticate. Key properties to document (all adaptive — the script name + shape are per-project):

- **Per-tester token**: each tester mints their OWN token into their OWN `.env` — no shared secret on the page, no token in git. The credentials artifact holds the login it bootstraps from; the minted token never leaves the tester's machine.
- **Restart after write**: env vars are cached at MCP spawn time — after the CLI writes the token, **exit and re-enter the agent** so the MCP picks it up (same rule as any `.env` change).
- **Adaptive shape**: if the project has no such CLI but DOES have a headless token issuer (a signup/signin or `POST …/tokens` endpoint), document that as the bootstrap and recommend wrapping it in a one-command script. If the project has NO programmatic token path at all, fall back to the detected manual login + raise the API testability flag (`testability-assessment.md`) — never fabricate a token endpoint.

Render the auth requests as Postman-style RequestCards (default — `page-structure.md` §5; plain-curl `AuthMethods` only as the Q8 fallback) for every method detected (Supabase token / Bearer / cookie `sb-<ref>-auth-token` / `X-API-Key` / custom JWT). Only render methods the project actually exposes.

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

## §6 — UI testing (playwright-cli, default — Q7) — see `page-structure.md` §6

The agentic UI driver is the **`playwright-cli` binary**, NOT the Playwright MCP. It is cheaper (fewer tokens, direct commands) and the `/playwright-cli` skill **auto-loads on `playwright-cli` calls**. The scripted fixture (regression over the detected login) + the agentic prompts live in `page-structure.md` §6 + `page-craft.md`. Decision rule: **scripted** Playwright for regression/CI, **agentic `playwright-cli`** for exploratory / bug-hunting / onboarding.

Command cookbook (render this; install browsers once with `bunx playwright install`):

```bash
# The /playwright-cli skill auto-loads when the agent calls 'playwright-cli'.
playwright-cli open http://localhost:3000/login
playwright-cli snapshot                       # accessibility tree with refs (e1, e2, ...)
playwright-cli fill e5 "<demo user email>" --submit
playwright-cli click e7
playwright-cli screenshot --filename=login.png
playwright-cli close
```

> **Fallback only — Playwright MCP.** Render an `@playwright/mcp` block ONLY when Q7 detection shows the project wires it (a `playwright` entry in `.mcp.json` / `opencode.jsonc` and no `playwright-cli` skill). In that case use the project's committed caps, e.g.:
>
> ```jsonc
> // Playwright MCP (ONLY if detected in the canonical .mcp.json — render its real caps)
> "playwright": { "command": "bunx", "args": ["@playwright/mcp@latest", "--caps", "<detected caps>"] }
> ```

---

## Substitution checklist (publish/render time)

- [ ] Every `${VAR}` / `{env:VAR}` / `$VAR` matches the agent tab it's under.
- [ ] `API_BASE_URL`, `OPENAPI_SPEC_PATH`, docs route, spec route = DETECTED values, not the examples above.
- [ ] DBHub `type` matches the detected engine; both `dbhub.toml` and the URI use the same engine.
- [ ] Only agent tabs the project supports are rendered (don't show Gemini if the project has no Gemini story — but the 4-tab reference is fine as documentation).
- [ ] UI driver = `playwright-cli` cookbook (Q7 default); a `@playwright/mcp` block appears ONLY when detection says the project wires the MCP.
- [ ] Env-verify guidance is the TRIO (`grep <PREFIX> .env` · `dotenv -e .env -- env | grep <PREFIX>` · `set -a; source .env; set +a`) — never a bare `env | grep` alone.
- [ ] Activation lists only DETECTED paths (wrapper / source-into-shell / direnv); `source .env` is the universal POSIX fallback.
- [ ] No real password, token, or private host anywhere — only `.env` slot names + `<see credentials source>`.
