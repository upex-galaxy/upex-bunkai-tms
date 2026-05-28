# Credentials Content Template — SOURCE OF TRUTH

> **Purpose**: The canonical markdown body of the credentials artifact. Publisher-specific files in `publishers/` are thin adapters around this template — they describe HOW to publish, not WHAT to publish.
>
> **When to read**: Phase 5 of `SKILL.md`. The orchestrator builds this body once, then routes it to the destination chosen in Q1.
>
> **Author once, publish anywhere**: the body is framework-neutral. Each publisher converts heading / code-block syntax (Jira wiki, Confluence macro, Notion block).
>
> **Zero-hardcode rule**: every endpoint, host, spec URL, and docs route is a DETECTED placeholder filled from `pre-flight-discovery.md`. This file NEVER hardcodes `/api/auth/callback/credentials`, `/api/openapi.json`, or any literal — those were wrong in most projects. If a value is undetected, render `<detected: none — ask lead>`.

---

## Required sections (in order)

1. **Title + audience**
2. **Architecture summary** — one-paragraph mirror of the page's §2 (incl. repos shape), so the artifact stands alone.
3. **Environment table** — per env (local, staging, …): web URL, API URL, OpenAPI spec URL, docs UI URL. From `.agents/project.yaml` `environments`.
4. **Environment variables** — the `.env` slot names testers must set (NAMES only) + how to activate them (wrapper / direnv).
5. **Database access — TWO ways**: (a) `dbhub.toml` for the DBHub MCP, (b) connection URI for a VSCode/Cursor SQL extension. One snippet per credential.
6. **API access — TWO ways + auth**: the detected login endpoint + token shape; (a) OpenAPI MCP config + spec URL, (b) Postman MCP. `bun run api:login` if present.
7. **UI access** — login URL per env, demo users (emails; passwords gated per `security-rules.md`).
8. **Footer** — link BACK to the in-app `/qa` page.

---

## Snippet rules

- **One credential = one snippet.** Never group two values in one fence — publishers render one copy button per snippet.
- Generic code-fence (```) in the template; each adapter converts to its native syntax.
- Never put real passwords here. The template is committed; real values are filled at publish-time inside the access-gated destination.
- Use `<see secrets store>` for any value the AI must not see (production passwords).

---

## Placeholder sources (publish-time substitution)

| Placeholder | Source |
| --- | --- |
| `{{PROJECT_NAME}}` | `.agents/project.yaml` → `project.project_name` |
| `{{FRONTEND_STACK}}` / `{{BACKEND_STACK}}` / `{{DB_TYPE}}` | `frontend.frontend_stack` / `backend.backend_stack` / `database.db_type` (fallback: pre-flight) |
| `<<REPOS>>` | `frontend.frontend_repo` + `backend.backend_repo` (mono if same/single, poly if distinct) |
| `{{environments.<env>.web_url}}` / `{{…api_url}}` | `.agents/project.yaml` → `environments.<env>.*` (**nested, snake_case** — NOT `WEB_URL`) |
| `<<LOGIN_ENDPOINT>>` | DETECTED login endpoint (pre-flight). NEVER a default path. |
| `<<TOKEN_RESPONSE_SHAPE>>` | DETECTED token JSON shape (e.g. `{ access_token, token_type, expires_in }`) |
| `<<AUTH_METHODS>>` | DETECTED list (Supabase token / Bearer / cookie / X-API-Key / custom) |
| `<<OPENAPI_SPEC_URL>>` | DETECTED spec route (`/api/openapi`, `/api/swagger.json`, …) |
| `<<DOCS_URL>>` + `<<DOCS_UI>>` | DETECTED docs route + renderer (Scalar / Redoc / Swagger) |
| `<<API_LOGIN_HELPER>>` | `bun run api:login` or equivalent, if detected (else omit the line) |
| `<<DB_ENGINE>>` / `<<DB_URI_SCHEME>>` | DETECTED engine + URI scheme (`postgresql` / `sqlserver` / `mysql` / …) |
| `<host>`, `<db>`, `<see secrets store>`, `<detected: none — ask lead>` | LITERAL placeholders — never substitute with real `.env` values. |

The skill NEVER writes real passwords into the artifact during codegen. The user pastes them into the access-gated destination after publish.

---

## Template body (literal — copy into the publisher adapter, then substitute placeholders)

```markdown
# {{PROJECT_NAME}} — QA Testing Credentials (DB / API / UI)

> Audience: Manual QA + AI-driven testers (Claude Code, OpenCode, Codex, Gemini) exercising this app at the DB, API, and UI layers.
> Companion page (in-app): {{environments.staging.web_url}}/qa

## Architecture summary

{{PROJECT_NAME}} is a {{FRONTEND_STACK}} client + {{BACKEND_STACK}} API + {{DB_TYPE}} database. Repos: <<REPOS>>. Tenant isolation is enforced at the API layer; the DB role below is read-only.

## Environments

| Env     | Web URL                          | API URL                          | OpenAPI spec        | Docs UI (<<DOCS_UI>>) |
| ------- | -------------------------------- | -------------------------------- | ------------------- | --------------------- |
| Local   | {{environments.local.web_url}}   | {{environments.local.api_url}}   | <<OPENAPI_SPEC_URL>> | <<DOCS_URL>>          |
| Staging | {{environments.staging.web_url}} | {{environments.staging.api_url}} | <<OPENAPI_SPEC_URL>> | <<DOCS_URL>>          |

## Environment variables (set in `.env`, then activate)

Slots to fill (names only — values go in your local `.env`, never committed):
`TEST_ENV`, `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD`, `STAGING_USER_EMAIL`, `STAGING_USER_PASSWORD`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `API_TOKEN`, `POSTMAN_API_KEY`, `DBHUB_TYPE`, `DBHUB_HOST`, `DBHUB_PORT`, `DBHUB_DATABASE`, `DBHUB_USER`, `DBHUB_PASSWORD`.

Activate before launching the agent: `bun run claude` / `bun run opencode` (cross-platform) or `direnv` + `.envrc` (Mac/Linux). If a var doesn't load, the MCP returns 401/403 — fix `.env` and restart the agent.

## Database access (read-only QA role) — TWO ways

### Way 1 — DBHub MCP (`dbhub.toml`, committed; `${VAR}` from `.env`)

Type:
```

<<DB_ENGINE>>

```
Host:
```

<host>

```
Port:
```

<port>

```
Database:
```

<db>

```
User:
```

<see secrets store>

```
Password:
```

<see secrets store>

```

> DBHub footgun: a missing `${VAR}` substitutes literally → cryptic auth failure. Verify: `env | grep DBHUB`.

### Way 2 — Connection URI (VSCode / Cursor SQL extension)

```

<<DB_URI_SCHEME>>://<see secrets store>@<host>:<port>/<db>?sslmode=require

```

## API access — auth + TWO ways

Auth methods detected: <<AUTH_METHODS>>.

Login endpoint:
```

<<LOGIN_ENDPOINT>>

```
Token response shape:
```

<<TOKEN_RESPONSE_SHAPE>>

```
Login body (demo user):
```json
{ "email": "<see secrets store>", "password": "<see secrets store>" }
```
Helper (if present): `<<API_LOGIN_HELPER>>` writes `API_TOKEN` into `.env` — restart the terminal/agent after.

### Way 1 — OpenAPI MCP

Spec URL:
```

<<OPENAPI_SPEC_URL>>

```
(Configure `@ivotoby/openapi-mcp-server --tools dynamic` with `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `API_TOKEN` — see the in-app /qa page for per-agent blocks.)

### Way 2 — Postman MCP

```

https://mcp.postman.com/mcp  (Authorization: Bearer ${POSTMAN_API_KEY})

```

## UI access — demo users

| Email             | Password              | Notes                  |
| ----------------- | --------------------- | ---------------------- |
| <see secrets store> | <see secrets store> | Tenant A — default     |
| <see secrets store> | <see secrets store> | Tenant A — admin       |

Login URL (staging): {{environments.staging.web_url}}/login

## Footer

Operational docs (architecture, MCP setup, env activation, Playwright snippets) live at the in-app page:
```

{{environments.staging.web_url}}/qa

```

If anything here is out of date, re-run `/testability-guide` against the project repo.
```

---

## Why this is the source of truth

- New publisher = one new file in `publishers/` wrapping this body. No content duplication.
- Change a heading once → propagates to every destination on the next re-run.
- Security audit runs ONCE in `security-rules.md` against this template.
- Idempotency `content-hash` tracks a hash of this rendered body (after `.agents/project.yaml` substitution, before passwords). Drift → surgical patch.
