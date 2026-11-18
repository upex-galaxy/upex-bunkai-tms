# MCP and env setup: the content the `/qa` page teaches

> **Purpose**: The canonical, detection-adapted content for the page's "Agentic Testing" sections: how to wire the three testing tools (DBHub, OpenAPI, Playwright) plus Postman across the four supported agents, how the env-var strategy works, and how a tester gets `.env` values to the things that need them.
>
> **When to read**: Phase 4 (page codegen), sections §3 to §5. Pair with `page-craft.md` for the component shapes that render this content.
>
> **Source of truth**: the host project's own MCP guide when one exists (for example `docs/mcp/mcp-configuration-guide.md`, plus the real `.mcp.json`, `opencode.jsonc` and `dbhub.toml` found in Phase 1). Render the blocks the project actually ships, and do not invent package names, flags or env vars. When the project has no such config and no guide, render the reference blocks below as the documented default and mark them "ejemplo — adaptar al proyecto" (example, adapt to the project).

---

## The zero-hardcode, zero-invention rule

Every concrete value (`API_BASE_URL`, spec URL, DB host, package version) comes from Phase 1 detection or the project's committed config. Every external behavioural claim (a flag being mandatory, what happens when a variable is missing, a tool's capability list) traces to the project's own MCP guide or the tool's official docs. When you need a claim that neither holds, look it up through `[DOCS_TOOL]` (`library-docs`) or `[WEB_SEARCH_TOOL]` (`web-search`) before writing it. With neither available, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 rather than guess.

---

## §3: The Testing Trinity ("La Trifuerza del Testing")

Three layers make one complete testing surface:

```
UI (Playwright) + API (OpenAPI / Postman) + DB (DBHub) = Testing Completo
```

| Layer | MCP / tool | What it is for | Needs |
| --- | --- | --- | --- |
| UI | the `playwright-cli` binary plus the `/playwright-cli` skill (default, Q7) | Drive the browser: scripted regression and agentic exploration | login `data-testid`s and a demo user |
| API | OpenAPI MCP (`@ivotoby/openapi-mcp-server`) | Discover endpoints and read their schemas from the agent | spec URL and API base URL |
| API (formal) | Postman MCP (`https://mcp.postman.com/mcp`) | Manage collections, run formal test suites | Postman API key |
| DB | the DB MCP §4.0 resolves from `stack.database` (DBHub `@bytebase/dbhub` by default) | Verify data directly in the database | read-only connection (`dbhub.toml`, or the Supabase MCP in `--read-only` mode) |

Render this as the overview card grid in §3. Each card deep-links to its detailed section (§4 DB, §5 API, §6 UI).

---

## Env-var strategy (the EnvSetup section)

MCP config files are committed to git and hold no secrets: they name env vars, never values. The real values live in `.env` (gitignored). There are two strategies.

| Strategy | Replace each `{{...}}` placeholder with | Then | Use when |
| --- | --- | --- | --- |
| A. Literal value (legacy) | the real secret directly | add the config file to `.gitignore` | personal-only config |
| B. `.env` loader plus commit (recommended) | a local (stdio) server: the variable NAME in the loader's `--filter` list (`varlock run --filter <vars> -- <server>`); a remote server only: the agent's native env syntax below | store the real value in `.env`, commit the config | team-shared config |

### Native env-var syntax per agent (strategy B, remote servers only)

| Agent | Config file | Syntax | If the var is missing |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` | `${VAR}` / `${VAR:-default}` | fails to parse the config (safe) |
| OpenCode | `opencode.jsonc` | `{env:VAR}` | substitutes an empty string (footgun) |
| Codex CLI | `config.toml` | `${VAR}` / `bearer_token_env_var = "NAME"` | depends on the field |
| Gemini CLI | `settings.json` | `$VAR` / `${VAR}` | depends on the field |

Render the "missing var" column prominently, since it is the most common cause of cryptic MCP failures.

### Config-file shape differences per agent

| Feature | Claude | OpenCode | Codex | Gemini |
| --- | --- | --- | --- | --- |
| Root key | `mcpServers` | `mcp` | `mcp_servers` | `mcpServers` |
| Command | string | array | string | string |
| Env key | `env` | `environment` | `[server.env]` | `env` |
| Remote | `type:"http"` | `type:"remote"` | `url` + `bearer_token_env_var` | `httpUrl` |
| Enable/disable | n/a | `enabled` | `enabled` | n/a |

### Activating `.env` for the agent (only if the project uses strategy B)

The tester opens the agent bare, with its own binary in the project folder (`claude`, `opencode`) or its desktop app. There is no wrapper, and `.env` is never exported into the tester's shell, because every later command in it (the agent's tool calls included) would inherit the secrets. The agent process therefore holds no `.env` value, and each piece that needs one gets it by its own route:

- A local (stdio) MCP server starts through the `.env` loader in its config entry: `bunx varlock run --filter <its vars> -- <server command>` (render the exact entry the project commits). The loader reads `.env` at spawn time and hands that server only its own variables. A config that relies on the agent expanding `${VAR}` or `{env:VAR}` from its own process gets nothing from a bare launch, so render the loader form instead.
- A remote (HTTP) MCP server that takes its token from the agent's environment gets none. Prefer the server's OAuth flow; a token-only server needs the tester to export that one variable in the terminal before opening the agent.
- A command that needs a value (a `curl` with a token, a login typed by the browser driver) runs through the loader in a subprocess: `bunx varlock run -- sh -c '<command using "$VAR">'`.

Render only the mechanisms the project ships (detected in Phase 1: the loader entries in the MCP configs, a varlock schema). A launch that loads `.env` into the agent is the one thing the page never shows: no `varlock run` or `dotenv` prefix on the agent binary, no `source .env`, no wrapper script. It puts every secret in reach of the agent's transcript.

### When a server fails to start or returns 401 or 403 (render as a warning callout)

An env var almost certainly is not loaded. Exit the agent, fix `.env`, and re-enter, because env vars are read once when the MCP is spawned. Working around it hides the real problem (Critical Rule 9).

### Verifying a var loaded

A bare `env | grep <PREFIX>` comes back empty even when everything is correct: the loader hands the values to each MCP server process at spawn, never to the agent or to the tester's shell, so the terminal's `env` never has them. Use the trio instead (`<PREFIX>` is the project's detected MCP env prefix, for example `DBHUB`):

```bash
grep -E '^<PREFIX>[A-Z0-9_]*=.' .env | cut -d= -f1   # (a) set in the file? (names only)
bunx varlock run -- env | grep '^<PREFIX>' | cut -d= -f1   # (b) what the MCP sees at spawn (names only)
bunx varlock load --agent                # (c) does every value pass the schema? (redacted)
```

Render this trio wherever the page tells a tester to verify an env var.

---

## §4: DB testing (DBHub), two ways to connect

### §4.0: Which DB MCP the page documents (resolved from `stack:`)

The testers' DB MCP is not the agent's `db` capability. The agent's server (`.agents/instructions/agent-tool-resolution.md` §6, `[DB_TOOL]`; on Supabase, `@supabase/mcp-server-supabase` with `SUPABASE_ACCESS_TOKEN`) authenticates with a personal access token that carries its holder's whole Supabase account. That token never reaches the page or the credentials artifact. Testers get a connection whose reach the database itself limits: a `qa_*` read-only role.

Read `stack.database` from `.agents/project.yaml`, confirm it against the code (Phase 1), then pick:

| `stack.database` | Way 1 (agentic) the page documents | Alternative, shown as a second tab only when it applies |
| --- | --- | --- |
| `engine: postgres`, `provider: supabase` | DBHub, `type = "postgres"`, over the project's session pooler, logged in as the `qa_*` role | Supabase MCP in read-only mode, scoped to the project, for team members who already hold a Supabase account on it (`--read-only --project-ref <ref>` locally, `https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true&features=database` hosted). Each person signs in with their own account; the artifact names the ref, never a token |
| `engine: postgres`, `provider: other` | DBHub, `type = "postgres"`, logged in as the `qa_*` role | none |
| `engine: none` | no DB section: §4 renders one line saying the app has no database layer to inspect, and the DB card drops from the §3 overview | none |
| `engine: other` (outside the v1 support set) | DBHub with the detected `type` when DBHub supports the engine; otherwise a gap the user resolves | none |

`project_ref` is `environments.<env>.db_project_ref` of the environment the artifact documents. Read-only is a decision, not a convenience (`agentic-dev-core/references/db-change-doctrine.md` §2): a tester's DB MCP never runs in write mode, whichever server it is. Record the choice in the snapshot field `db` (`idempotency-snapshot.md`); a change of `stack.database` is drift.

### Way 1: DBHub MCP (agentic)

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

Declare these in `.env` (render the slots, never values): `DBHUB_TYPE`, `DBHUB_HOST`, `DBHUB_PORT`, `DBHUB_DATABASE`, `DBHUB_USER`, `DBHUB_PASSWORD`.

Two callouts go with this block.

> DBHub footgun (warning callout): when a var is missing, DBHub substitutes the literal string `${VAR}`, which produces a cryptic auth failure instead of a startup error. Verify before launching with the trio above. A bare `env | grep DBHUB` misleads (the wrapper injects into the agent's child process, not the shell), so use `grep -E '^DBHUB[A-Z0-9_]*=.' .env | cut -d= -f1` (set in the file), `bunx varlock run -- env | grep '^DBHUB' | cut -d= -f1` (what the MCP sees; older dotenv scaffolds: `dotenv -e .env -- env`), and `bunx varlock load --agent` (schema check, redacted).
>
> DBHub takes `[[sources]]`, not a DSN: it does not accept a raw connection string, only the split `[[sources]]` fields (`host`, `port`, `user`, `password`, `database`, `sslmode`), each from its own slot. A raw `postgresql://…` URI belongs only to a VSCode or Cursor SQL extension (Way 2 below).

MCP config block per agent (substitute the detected `dbhub.toml` path; the values are the real package and flags from the canonical config):

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

### Way 2: connection URI for a VSCode or Cursor SQL extension (manual)

For testers who prefer a GUI SQL client (SQLTools, the SQL Server extension), give the connection string shape for the detected engine, with host, database and sslmode from detection and credentials by name:

```
# postgres
postgresql://<DBHUB_USER>:<DBHUB_PASSWORD>@<DBHUB_HOST>:5432/<DBHUB_DATABASE>?sslmode=require
# sqlserver
sqlserver://<DBHUB_USER>:<DBHUB_PASSWORD>@<DBHUB_HOST>:1433/<DBHUB_DATABASE>
```

Both ways use the same read-only QA credentials from the credentials artifact. Neither inlines a real password on the page.

---

## §5: API testing, two ways plus the auth flow

### Auth flow (detected, render the project's real shape)

Detect the real login endpoint and token shape in Phase 1. Render the flow as a small diagram plus a `curl`. The example below is Supabase Auth, as in the QA boilerplate; substitute the detected endpoint, host and keys:

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

When the project ships (or can ship) a small CLI like `bun run api:login`, or a headless signup/signin endpoint that mints a Personal Access Token, promote it as the first-class API-auth path, above hand-running curl. It logs the tester in and stores the token where the tester's testing project keeps it (the QA boilerplate's `bun run api:login` writes `.auth/tokens.env`, gitignored, never `.env`), and curl reads it from there. Document these properties (the script name and shape are per project):

- Each tester mints their own token on their own machine. No shared secret goes on the page and no token goes in git. The credentials artifact holds the login it bootstraps from, and the minted token never leaves the tester's machine.
- The token is a secret, used by name. It never goes into an MCP config, the page, the credentials artifact or a chat, and the AI never types or writes its value. A command that needs it reads it by name through the loader for that one process (`bunx varlock run -- sh -c '<curl using "$VAR">'`, or the testing project's own token file).
- API auth needs no agent restart. The OpenAPI MCP carries no token (Way 1 below), so minting or refreshing one changes nothing the MCP reads; only `API_BASE_URL` and `OPENAPI_SPEC_PATH` are read at MCP spawn time.
- The shape adapts. A project with no such CLI but a headless token issuer (a signup/signin or `POST …/tokens` endpoint) documents that endpoint as the bootstrap and recommends wrapping it in a one-command script. A project with no programmatic token path at all falls back to the detected manual login and raises the API testability flag (`testability-assessment.md`); a token endpoint nobody confirmed does not get invented.

Render the auth requests as Postman-style RequestCards (default, `page-structure.md` §5; plain-curl `AuthMethods` only as the Q8 fallback) for every method detected (Supabase token, Bearer, cookie `sb-<ref>-auth-token`, `X-API-Key`, custom JWT). Render only the methods the project exposes.

### Way 1: OpenAPI MCP (agentic, schema-read-only)

The `--tools dynamic` flag is mandatory (without it the server errors 400). That is documented behaviour of `@ivotoby/openapi-mcp-server`, not an assumption.

The MCP discovers endpoints and reads their schemas, nothing more. Authenticated requests run with curl and the tester's own token (the auth flow above), so the server gets no `API_TOKEN` and no `API_HEADERS`. Its `.env` loader hands it exactly two non-secret variables:

- `API_BASE_URL`: the backend under test (curl's base, and the MCP's request base).
- `OPENAPI_SPEC_PATH`: the full spec URL, origin plus the detected route (for example `http://localhost:3000/api/openapi`), or a repo-root-relative synced file (for example `./api/openapi.json`). Never the route alone: the server reads a value that is not a URL as a file path and exits at start (ENOENT on `/api/openapi`).

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

### Way 2: Postman MCP (formal API test documentation)

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

The tester generates the key at postman.com, Settings, API Keys. Env slot: `POSTMAN_API_KEY`. Postman MCP covers collections, requests, environments, specs, mocks and workspaces (per the canonical guide).

### Link to `/api/docs`

Link to the project's docs UI at its detected route (`/api/docs`, `/api-docu`, and so on) and name the detected renderer (Scalar, Redoc or Swagger).

---

## §6: UI testing (playwright-cli, default, Q7), see `page-structure.md` §6

The agentic UI driver is the `playwright-cli` binary, not the Playwright MCP. It is cheaper (fewer tokens, direct commands), and the `/playwright-cli` skill auto-loads on `playwright-cli` calls. The scripted fixture (regression over the detected login) and the agentic prompts live in `page-structure.md` §6 and `page-craft.md`. Use scripted Playwright for regression and CI, and agentic `playwright-cli` for exploratory work, bug hunting and onboarding.

Command cookbook (render it; install browsers once with `bunx playwright install`):

```bash
# The /playwright-cli skill auto-loads when the agent calls 'playwright-cli'.
playwright-cli open http://localhost:3000/login
playwright-cli snapshot                       # accessibility tree with refs (e1, e2, ...)
playwright-cli fill e5 "<demo user email>" --submit
playwright-cli click e7
playwright-cli screenshot --filename=login.png
playwright-cli close
```

Fallback, Playwright MCP: render an `@playwright/mcp` block only when Q7 detection shows the project wires it (a `playwright` entry in `.mcp.json` or `opencode.jsonc` and no `playwright-cli` skill). Use the project's committed caps, for example:

```jsonc
// Playwright MCP (ONLY if detected in the canonical .mcp.json: render its real caps)
"playwright": { "command": "bunx", "args": ["@playwright/mcp@latest", "--caps", "<detected caps>"] }
```

---

## Substitution checklist (publish and render time)

- [ ] Every `${VAR}` / `{env:VAR}` / `$VAR` matches the agent tab it sits under.
- [ ] `API_BASE_URL`, `OPENAPI_SPEC_PATH`, the docs route and the spec route are detected values, not the examples above. `OPENAPI_SPEC_PATH` is a full URL (origin plus route) or a repo-root-relative file, never a bare route.
- [ ] The OpenAPI MCP block filters `API_BASE_URL,OPENAPI_SPEC_PATH` only: no `API_TOKEN`, no `API_HEADERS`, no token anywhere in an MCP config.
- [ ] DBHub `type` matches the detected engine, and `dbhub.toml` and the URI use the same engine.
- [ ] Only agent tabs the project supports are rendered. The four-tab reference is fine as documentation, but skip Gemini when the project has no Gemini story.
- [ ] The UI driver is the `playwright-cli` cookbook (Q7 default); a `@playwright/mcp` block appears only when detection says the project wires the MCP.
- [ ] Env-verify guidance is the trio (`grep -E '^<PREFIX>[A-Z0-9_]*=.' .env | cut -d= -f1`, `bunx varlock run -- env | grep '^<PREFIX>' | cut -d= -f1` or the project's own loader, and `bunx varlock load --agent`), every leg printing names only (Critical Rule 1: a value printed in a terminal the agent can see lands in its transcript), and never a bare `env | grep` alone.
- [ ] Activation opens the agent bare and lists only detected loader paths (the MCP config's loader entry, or `bunx varlock run -- sh -c`). No path loads `.env` into the agent or the shell (a wrapper script, a `varlock run` prefix on the agent binary, `source .env`, a shell autoloader).
- [ ] No real password, token or private host appears anywhere, only `.env` slot names and `<see credentials source>`.

## With nobody at the keyboard

Two stops can wait for a person: "neither lookup tool available" in the zero-invention rule, and a 401 or 403 from an MCP. A supervised run's conductor holds them. With nobody there, leave the unverified claim out of the page and list it as a gap in the report; for a credential failure, stop that step and name the env var in the report.
