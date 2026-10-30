# MCP & Env Setup — content the `/qa` page must teach

> **Purpose**: The canonical, detection-adapted content for the page's "Agentic Testing" sections: how to wire the three testing MCPs (DBHub / OpenAPI / Playwright) + Postman across the four supported agents, how the env-var strategy works, and how to activate `.env` in the terminal so the MCP configs resolve.
>
> **When to read**: Phase 4 (page codegen), sections §3–§5. Pair with `page-craft.md` for the component shapes that render this content.
>
> **Source of truth**: this mirrors the host project's own MCP guide when one exists (e.g. `docs/mcp/mcp-configuration-guide.md` + the real `.mcp.json` / `opencode.jsonc` / `dbhub.toml` detected in Phase 1). **Render the blocks the project actually ships. Do NOT invent package names, flags, env vars, or behaviors.** If the project has no such config and no canonical guide, render the reference blocks below as the documented default and mark them "ejemplo — adaptar al proyecto".

---

## The zero-hardcode + zero-invention rule

Every concrete value (`API_BASE_URL`, spec URL, DB host, package version) comes from Phase-1 detection or the project's committed config. Every external behavioral claim (a flag being mandatory, a missing-var behavior, a tool's capability list) must trace to the project's own MCP guide or the tool's official docs. If you need to state something about an MCP/library that is NOT in the detected config or the host's guide, look it up via `[DOCS_TOOL]` (`library-docs`) or `[WEB_SEARCH_TOOL]` (`web-search`) first — never fabricate; neither available → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4.

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
| **DB** | the DB MCP §4.0 resolves from `stack.database` (DBHub `@bytebase/dbhub` by default) | Verify data directly in the database | read-only connection (`dbhub.toml`, or the Supabase MCP in `--read-only` mode) |

Render this as the overview card grid in §3. Each card deep-links to its detailed section (§4 DB, §5 API, §6 UI).

---

## Env-var strategy (the EnvSetup section)

MCP config files are **committed to git** and contain **no secrets** — they name env vars, never values. The real values live in `.env` (gitignored). Two strategies:

| Strategy | Replace each `{{...}}` placeholder with | Then | Use when |
| --- | --- | --- | --- |
| **A. Literal value** (legacy) | the real secret directly | add the config file to `.gitignore` | personal-only config |
| **B. `.env` loader + commit** (recommended) | a local (stdio) server: the variable NAME in the loader's `--filter` list (`varlock run --filter <vars> -- <server>`); a remote server only: the agent's native env syntax below | store the real value in `.env`, commit the config | team-shared config |

### Native env-var syntax per agent (strategy B, remote servers only)

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

### Activating `.env` for the agent (only if the project uses strategy B)

The tester opens the agent **bare**, with its own binary in the project folder (`claude`, `opencode`) or its desktop app: no wrapper, and never `.env` exported into the tester's shell (every later command in it, the agent's tool calls included, would inherit the secrets). The agent process holds no `.env` value, so each piece that needs one gets it by its own route:

- **A local (stdio) MCP server** starts through the `.env` loader in its config entry: `bunx varlock run --filter <its vars> -- <server command>` (render the exact entry the project commits). The loader reads `.env` at spawn time and hands that server only its own variables. A config that relies on the agent expanding `${VAR}` / `{env:VAR}` from its own process gets nothing from a bare launch: render the loader form instead.
- **A remote (HTTP) MCP server** that takes its token from the agent's environment gets none: prefer the server's OAuth flow; a token-only server needs the tester to export that ONE variable in the terminal before opening the agent.
- **A command that needs a value** (a `curl` with a token, a login typed by the browser driver) runs through the loader in a subprocess: `bunx varlock run -- sh -c '<command using "$VAR">'`.

> Only render the mechanisms the project actually ships (detected in Phase 1: the loader entries in the MCP configs, a varlock schema). Never render a launch that loads `.env` into the agent: a `varlock run` or `dotenv` prefix on the agent binary, `source .env`, or a wrapper script.

### CRITICAL rule (render as a warning callout)

> If an MCP server fails to start or returns **401 / 403**, an env var almost certainly isn't loaded. **Exit the agent, fix `.env`, and re-enter** — env vars are read once when the MCP is spawned. Do not work around it.

### Verifying a var loaded — the bare `env | grep` is MISLEADING

A naked `env | grep <PREFIX>` comes back **EMPTY even when everything is correct**: the loader hands the values to each MCP server process at spawn, never to the agent or to your shell, so your terminal's `env` never has them. Testers waste hours here. Use the trio instead (`<PREFIX>` = the project's detected MCP env prefix, e.g. `DBHUB`):

```bash
grep -E '^<PREFIX>[A-Z0-9_]*=.' .env | cut -d= -f1   # (a) set in the file? (names only)
bunx varlock run -- env | grep '^<PREFIX>' | cut -d= -f1   # (b) what the MCP sees at spawn (names only)
bunx varlock load --agent                # (c) does every value pass the schema? (redacted)
```

Render this trio everywhere the page tells a tester to "verify the env var" — never the bare `env | grep` alone.

---

## §4 — DB testing (DBHub) — TWO ways to connect

### §4.0 — Which DB MCP the page documents (resolved from `stack:`)

The testers' DB MCP is NOT the agent's `db` capability. The agent's server (`.agents/instructions/agent-tool-resolution.md` §6, `[DB_TOOL]`; on Supabase, `@supabase/mcp-server-supabase` with `SUPABASE_ACCESS_TOKEN`) authenticates with a personal access token that carries its holder's whole Supabase account. That token never reaches the page or the credentials artifact. Testers get a connection whose reach the database itself limits: a `qa_*` read-only role.

Read `stack.database` from `.agents/project.yaml`, confirm it against the code (Phase 1), then pick:

| `stack.database` | Way 1 (agentic) the page documents | Alternative, shown as a second tab only when it applies |
| --- | --- | --- |
| `engine: postgres`, `provider: supabase` | DBHub, `type = "postgres"`, over the project's session pooler, logged in as the `qa_*` role | Supabase MCP in read-only mode, scoped to the project, for team members who already hold a Supabase account on it (`--read-only --project-ref <ref>` locally, `https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true&features=database` hosted). Each person signs in with their OWN account; the artifact names the ref, never a token |
| `engine: postgres`, `provider: other` | DBHub, `type = "postgres"`, logged in as the `qa_*` role | none |
| `engine: none` | no DB section: §4 renders one line saying the app has no database layer to inspect, and the DB card drops from the §3 overview | none |
| `engine: other` (outside the v1 support set) | DBHub with the detected `type` when DBHub supports the engine; otherwise a gap the user resolves | none |

`project_ref` is `environments.<env>.db_project_ref` of the environment the artifact documents. The read-only mode is a decision, not a convenience (`agentic-dev-core/references/db-change-doctrine.md` §2): a tester's DB MCP never runs in write mode, whichever server it is. Record the choice in the snapshot field `db` (`idempotency-snapshot.md`): a change of `stack.database` is drift.

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

> **DBHub footgun (warning callout)**: DBHub substitutes the literal string `${VAR}` when a var is missing — producing a cryptic auth failure instead of a startup error. Verify before launching with the trio above — a bare `env | grep DBHUB` is misleading (the wrapper injects into the agent child process, not your shell): use `grep -E '^DBHUB[A-Z0-9_]*=.' .env | cut -d= -f1` (set in file), `bunx varlock run -- env | grep '^DBHUB' | cut -d= -f1` (what the MCP sees; older dotenv scaffolds: `dotenv -e .env -- env`), and `bunx varlock load --agent` (schema check, redacted).
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
  -H 'apikey: <SUPABASE_PUBLISHABLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"<see credentials source>","password":"<see credentials source>"}'
# → { "access_token": "eyJ…", "token_type": "bearer", "expires_in": … }

# 2) Use it on every request
curl '<API_BASE_URL>/<endpoint>' -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

**RECOMMENDED API-auth bootstrap — the `api-login`-style mini-CLI.** When the project ships (or can ship) a small CLI like `bun run api:login` — or a headless signup/signin endpoint that mints a Personal Access Token — promote it as the FIRST-CLASS path for API auth, above hand-running curl. It logs the tester in and stores the token where the tester's testing project keeps it (the QA boilerplate's `bun run api:login` writes `.auth/tokens.env`, gitignored, never `.env`), and curl reads it from there. Key properties to document (all adaptive — the script name + shape are per-project):

- **Per-tester token**: each tester mints their OWN token on their OWN machine — no shared secret on the page, no token in git. The credentials artifact holds the login it bootstraps from; the minted token never leaves the tester's machine.
- **The token is a secret, used by name**: it never goes into an MCP config, the page, the credentials artifact or a chat, and the AI never types or writes its value. A command that needs it reads it by name through the loader for that one process (`bunx varlock run -- sh -c '<curl using "$VAR">'`, or the testing project's own token file).
- **No restart for API auth**: the OpenAPI MCP carries no token (Way 1 below), so minting or refreshing one never needs an agent restart. Only `API_BASE_URL` / `OPENAPI_SPEC_PATH` are read at MCP spawn time.
- **Adaptive shape**: if the project has no such CLI but DOES have a headless token issuer (a signup/signin or `POST …/tokens` endpoint), document that as the bootstrap and recommend wrapping it in a one-command script. If the project has NO programmatic token path at all, fall back to the detected manual login + raise the API testability flag (`testability-assessment.md`) — never fabricate a token endpoint.

Render the auth requests as Postman-style RequestCards (default — `page-structure.md` §5; plain-curl `AuthMethods` only as the Q8 fallback) for every method detected (Supabase token / Bearer / cookie `sb-<ref>-auth-token` / `X-API-Key` / custom JWT). Only render methods the project actually exposes.

### Way 1 — OpenAPI MCP (agentic, schema-read-only)

> The `--tools dynamic` flag is **mandatory** (without it the server errors 400) — this is documented behavior of `@ivotoby/openapi-mcp-server`, not an assumption.

The MCP is used ONLY to discover endpoints and read their schemas. Authenticated requests run with curl and the tester's own token (the auth flow above), so the server gets no `API_TOKEN` and no `API_HEADERS`. Its `.env` loader hands it exactly two non-secret variables:

- `API_BASE_URL` — the backend under test (curl's base, and the MCP's request base).
- `OPENAPI_SPEC_PATH` — the FULL spec URL, origin + DETECTED route (e.g. `http://localhost:3000/api/openapi`), OR a repo-root-relative synced file (e.g. `./api/openapi.json`). NEVER the route alone: the server reads a value that is not a URL as a file path and exits at start (ENOENT on `/api/openapi`).

```jsonc
// Claude Code → .mcp.json
"openapi": {
  "command": "bunx",
  "args": ["-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars", "--filter", "API_BASE_URL,OPENAPI_SPEC_PATH", "--", "bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"]
}
```

```jsonc
// OpenCode → opencode.jsonc
"openapi": {
  "type": "local",
  "command": ["bunx", "-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars", "--filter", "API_BASE_URL,OPENAPI_SPEC_PATH", "--", "bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "enabled": true
}
```

```toml
# Codex → config.toml
[mcp_servers.openapi]
command = "bunx"
args = ["-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars", "--filter", "API_BASE_URL,OPENAPI_SPEC_PATH", "--", "bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"]
```

```json
// Gemini → settings.json
"openapi": {
  "command": "bunx",
  "args": ["-p", "varlock@1.20.0", "varlock", "run", "--no-redact-stdout", "--inject", "vars", "--filter", "API_BASE_URL,OPENAPI_SPEC_PATH", "--", "bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"]
}
```

Tools to render: `list-api-endpoints`, `get-api-endpoint-schema`. The server also ships `invoke-api-endpoint`; the page does not teach it, because execution is curl's job. Env slots: `API_BASE_URL`, `OPENAPI_SPEC_PATH`.

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
- [ ] `API_BASE_URL`, `OPENAPI_SPEC_PATH`, docs route, spec route = DETECTED values, not the examples above. `OPENAPI_SPEC_PATH` is a full URL (origin + route) or a repo-root-relative file, never a bare route.
- [ ] The OpenAPI MCP block filters `API_BASE_URL,OPENAPI_SPEC_PATH` only: no `API_TOKEN`, no `API_HEADERS`, no token anywhere in an MCP config.
- [ ] DBHub `type` matches the detected engine; both `dbhub.toml` and the URI use the same engine.
- [ ] Only agent tabs the project supports are rendered (don't show Gemini if the project has no Gemini story — but the 4-tab reference is fine as documentation).
- [ ] UI driver = `playwright-cli` cookbook (Q7 default); a `@playwright/mcp` block appears ONLY when detection says the project wires the MCP.
- [ ] Env-verify guidance is the TRIO (`grep -E '^<PREFIX>[A-Z0-9_]*=.' .env | cut -d= -f1` · `bunx varlock run -- env | grep '^<PREFIX>' | cut -d= -f1` (or the project's own loader) · `bunx varlock load --agent`), every leg printing NAMES only (Critical Rule #1: a value printed in a terminal the agent can see lands in its transcript) — never a bare `env | grep` alone.
- [ ] Activation opens the agent bare and lists only DETECTED loader paths (the MCP config's loader entry / `bunx varlock run -- sh -c`); never a path that loads `.env` into the agent or the shell (a wrapper script, a `varlock run` prefix on the agent binary, `source .env`, a shell autoloader).
- [ ] No real password, token, or private host anywhere — only `.env` slot names + `<see credentials source>`.
