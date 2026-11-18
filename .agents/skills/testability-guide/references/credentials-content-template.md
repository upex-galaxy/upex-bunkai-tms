# Credentials content template (source of truth)

> This file holds the markdown body of the credentials artifact. The files in `publishers/` are thin adapters: they say how to publish the body, never what it contains.
>
> Read it in Phase 5 of `SKILL.md`. Build the body once, then route it to the destination chosen in Q1.
>
> The body is framework-neutral. Each publisher converts the heading and code-block syntax (Jira wiki, Confluence macro, Notion block). Tables need a per-publisher note, because Jira's converter cannot build them (see `publishers/jira-epic.md`).
>
> Every endpoint, host, spec URL, docs route, role name, connection-string shape and token prefix is a detected placeholder, filled from `pre-flight-discovery.md`. Literals such as `/api/auth/callback/credentials`, `/api/openapi.json`, a Supabase pooler host or a `bk_pat_` prefix are wrong on most projects, so none of them is hardcoded here. When a value was not detected, render `<detected: none — ask lead>`.

---

## Division of labor (render this as a box at the top)

The credentials artifact and the in-app `/qa` page are a pair. They never duplicate each other; they link to each other.

| | Credentials artifact (this body) | In-app `/qa` page |
| --- | --- | --- |
| Holds | Real secret values and copy-paste `.env` blocks | Placeholders and the how-to |
| Audience | Gated (QA group only) | Public-readable |
| Answers | "what do I paste" | "how do I test" |
| Links to | the `/qa` page (footer) | the artifact (credentials CTA) |

Say this in the artifact body, so a reader who lands on either one knows where the other half lives.

---

## Required sections, in order

The artifact is short on purpose: it says what the credentials are and which `.env` vars to set. The how-to (architecture, UI/API/DB exploration, step by step) lives on the `/qa` page.

1. Title, audience and the Division-of-labor box above.
2. Environments: a table with, per env, the web URL, API base, OpenAPI spec and status. The values come from `environments` in `.agents/project.yaml`.
3. Auth at the UI layer (browser): the system roles and how each tester provisions an account. Two variants, picked by the detected auth model (see "UI variants").
4. Auth at the DB layer: the raw connection string (SQL editor only) next to the DB MCP driver's split-field `.env` block (read-only and read-write), with the callout that the two formats are not interchangeable.
5. Auth at the API layer: a copy-paste `.env` block with the base URL and the spec path only. It has no token slot, because the OpenAPI MCP only reads the schema. Each tester mints a personal token and uses it by name with curl.
6. Activate the MCPs: open the agent bare, let each MCP server read `.env` through the loader, run a command that needs a value as `bunx varlock run -- sh -c '...'`, and check the setup with the three verification commands.
7. Security: what is never published, and rotation after a leak.
8. Footer: one line pointing to the `/qa` page.

Three things stay out of the body. An architecture summary is replaced by the footer line. Fix history and snapshot metadata live in the page comment (`idempotency-snapshot.md`). The demo-users table is not removed, only conditional (see "UI variants").

---

## UI variants (pick one at pre-flight)

Detect the auth model in pre-flight and render the matching variant.

- Variant A, self-serve. This is the default when the project has open signup, magic-link or passwordless login, or per-tester workspace creation. Each tester creates their own user and workspace, so there are no shared accounts to leak. Render the "create your own user" steps and no demo-users table.
- Variant B, shared demo accounts. Use it when the project has no self-service signup, or QA relies on seeded accounts. Render a demo-users table with emails; passwords stay gated per `security-rules.md` and read `<see secrets store>`.

When detection is ambiguous, ask the lead. Do not pick B quietly: shared accounts are the higher-leak path. With nobody to ask (a routine), render Variant A and report that you assumed it.

---

## Snippet rules

- One credential is one snippet. Grouped `.env` blocks (the DB driver fields, the API pair) are the exception: a single fenced block is right, because testers paste the whole block into `.env` at once.
- Use a generic code fence in the template; each adapter converts it to its native syntax.
- The committed template never holds a real password. Real values are filled at publish time, inside the access-gated destination.
- Use `<see secrets store>` for any value the AI must not see (production passwords, service-role keys).

---

## Placeholder sources (substituted at publish time)

| Placeholder | Source |
| --- | --- |
| `{{PROJECT_NAME}}` | `.agents/project.yaml` → `project.project_name` |
| `{{DB_TYPE}}` | `database.db_type` (fallback: pre-flight) |
| `{{environments.<env>.web_url}}` / `{{…api_url}}` | `.agents/project.yaml` → `environments.<env>.*` (nested, snake_case, never `WEB_URL`) |
| `<<LOGIN_URL>>` | Detected browser login route (for example `/login`). Never a default path. |
| `<<SYSTEM_ROLES>>` | Detected app role names. Render only the roles the project has, never an invented `viewer/member/admin`. |
| `<<SIGNUP_MODEL>>` | Detected: self-serve, magic-link, invite-only or seeded. It drives the UI variant. |
| `<<API_LOGIN_ENDPOINT>>` | Detected `<METHOD> <path>` for headless login (for example `POST <path>`). Never a baked-in `/signin` or `/signup`. |
| `<<TOKEN_PREFIX>>` | Detected token prefix shape (for example `<token-prefix>_<...>`). Never a literal `bk_pat_`. |
| `<<OPENAPI_SPEC_URL>>` | Full spec URL of the row's environment: the origin that serves the spec plus the detected route (for example `http://localhost:3000/api/openapi`; the route itself is `/api/openapi`, `/api/swagger.json` and so on). In the `.env` block it is the staging one. Never the route alone: the openapi MCP reads a value that is not a URL as a file path, finds no `/api/openapi` on disk and exits at start. A repo-root-relative synced file (for example `./api/openapi.json`) is the only other valid form. |
| `<<API_LOGIN_HELPER>>` | The project's api-login mini-CLI when present (for example `bun run api:login`), adapted per project. Otherwise omit the line and keep only the manual path. |
| `<<DB_MCP>>` | Detected DB MCP name (for example DBHub, Postgres MCP) and its config style (toml `${VAR}` or env-only). |
| `<<DB_ENV_PREFIX>>` | Detected env-var prefix the DB MCP reads (for example `DBHUB_`). |
| `<<DB_URI_SCHEME>>` | Detected engine URI scheme (`postgresql`, `sqlserver`, `mysql` and so on). |
| `<<DB_RO_ROLE>>` / `<<DB_RW_ROLE>>` | Detected read-only and read-write role names. Render the RW one only if the project has it. |
| `<<DB_HOST>>` / `<<DB_PORT>>` / `<<DB_NAME>>` | Detected connection target (for example a pooler host and port). Real values are filled in the gated destination. |
| `<see secrets store>`, `<detected: none — ask lead>` | Literal placeholders. Codegen never replaces them with real `.env` values. |

The skill writes no real password into the artifact during codegen. The person pastes them into the access-gated destination after publish.

> The DB shape below is an example, not a contract. The Supabase-pooler form (`<role>.<project-ref>` username, port 5432, `?sslmode=require`) is one detected shape. For another engine or driver, fill the same two-format pattern (raw DSN and split-field env) with that engine's real shape. Detect, don't copy.

---

## Template body (copy into the publisher adapter, then substitute placeholders)

```markdown
# {{PROJECT_NAME}}: QA Testing Credentials (DB / API / UI)

> Audience: Manual QA + AI-driven testers (Claude Code, OpenCode, Codex, Gemini) exercising this app at the DB, API, and UI layers.
> This artifact goes straight to the point: what the credentials are and which `.env` vars to set.

## Division of labor

- **This artifact** = REAL secret values + copy-paste `.env` blocks. Gated to the QA group. Answers "what do I paste".
- **The /qa page** ({{environments.staging.web_url}}/qa) = placeholders + the how-to (architecture, trifuerza UI/API/DB, step-by-step). Public. Answers "how do I test".
- Do not publish anything from this artifact outside the gated destination.

## Environments

(Render as a TABLE — one row per env in `.agents/project.yaml` `environments`. On a re-run where the artifact is human-curated and the env table has drifted from `project.yaml`, do NOT silently overwrite — FLAG the drift per the non-destructive rule in `publishers/jira-epic.md`.)

| Env     | Web URL                          | API base                         | OpenAPI spec         | Status |
| ------- | -------------------------------- | -------------------------------- | -------------------- | ------ |
| local   | {{environments.local.web_url}}   | {{environments.local.api_url}}   | <<OPENAPI_SPEC_URL>> | dev    |
| staging | {{environments.staging.web_url}} | {{environments.staging.api_url}} | <<OPENAPI_SPEC_URL>> | <status> |

## Auth at the UI layer (browser)

System roles: <<SYSTEM_ROLES>>.

<!-- VARIANT A (default — self-serve / magic-link / per-tester workspace). Render this OR Variant B, never both. -->
Each tester provisions their OWN user (no shared demo accounts):

- Go to `<<LOGIN_URL>>` and authenticate per the detected method (<<SIGNUP_MODEL>>).
- First login provisions your account / workspace — you own it.
- Each tester uses their OWN user and OWN workspace. Share only by explicit invite if your auth model supports it.

<!-- VARIANT B (shared demo accounts — render ONLY when no self-service signup). -->
<!--
| Email               | Password            | Notes              |
| ------------------- | ------------------- | ------------------ |
| <see secrets store> | <see secrets store> | <role/tenant note> |
-->

Login URL (staging): {{environments.staging.web_url}}<<LOGIN_URL>>

## Auth at the DB layer

Two dedicated inspection roles (read-only + read-write). **There are TWO formats and they are NOT interchangeable** — a raw connection string for a SQL editor, and the DB MCP driver's split fields.

**1) Raw connection string — for a SQL editor extension ONLY (the DB MCP does NOT accept a DSN):**

```
<<DB_URI_SCHEME>>://<see secrets store>@<<DB_HOST>>:<<DB_PORT>>/<<DB_NAME>>?sslmode=require
```

**2) Driver split fields — what the <<DB_MCP>> MCP reads.** The MCP config is committed with variable names only (the `.env` loader's `--filter` list; DBHub reads them as `${VAR}` in `dbhub.toml`); you set these in your `.env` (read-only role):

```bash
# .env — <<DB_MCP>> read-only (<<DB_RO_ROLE>>)
<<DB_ENV_PREFIX>>TYPE=<<DB_URI_SCHEME>>
<<DB_ENV_PREFIX>>HOST=<<DB_HOST>>
<<DB_ENV_PREFIX>>PORT=<<DB_PORT>>
<<DB_ENV_PREFIX>>DATABASE=<<DB_NAME>>
<<DB_ENV_PREFIX>>USER=<see secrets store>
<<DB_ENV_PREFIX>>PASSWORD=<see secrets store>
```

For read-write, change the last two to the <<DB_RW_ROLE>> credentials:

```bash
<<DB_ENV_PREFIX>>USER=<see secrets store>
<<DB_ENV_PREFIX>>PASSWORD=<see secrets store>
```

> Footgun: a missing `${VAR}` substitutes LITERALLY (`${VAR}` becomes the value) → cryptic auth failure, not a startup crash. Verify the vars BEFORE launching the agent (see §Activate the MCPs).

## Auth at the API layer

Set in your `.env` (pointing at staging). Both values are non-secret; the OpenAPI MCP reads only these two, to list endpoints and read their schemas:

```bash
# .env — API / OpenAPI MCP (schema-read-only)
API_BASE_URL={{environments.staging.api_url}}
OPENAPI_SPEC_PATH=<<OPENAPI_SPEC_URL>>
```

`OPENAPI_SPEC_PATH` is the FULL spec URL (origin + route) or a repo-root-relative synced file. A bare route such as `/api/openapi` is read as a file path and the MCP exits at start.

Authenticated calls run with curl and YOUR personal token, never through the MCP. The token is a secret: it never goes into this artifact, a chat, a committed config or an MCP block, and the AI never types it. Mint your own with YOUR user and keep it where your testing project's token flow stores it:

- Helper (if present): `<<API_LOGIN_HELPER>>` — the project's api-login mini-CLI; mints your token and stores it for curl to read by name. No agent restart needed: no MCP holds it.
- Manual: `<<API_LOGIN_ENDPOINT>>` with your credentials → returns a token (`<<TOKEN_PREFIX>>…`). Store it the same way, then use it by name (`bunx varlock run -- sh -c '<curl using "$VAR">'`).

## Activate the MCPs (the `.env` loader)

Real values live in your `.env` (gitignored); the MCP config files carry no secrets. Open the agent bare, in the project folder (or its desktop app): it holds no `.env` value. Each MCP server that needs one starts through the `.env` loader in its committed config entry, which reads `.env` when the server spawns and hands it only its own variables:

```bash
claude      # or: opencode. No wrapper, no env loader in front of the agent
```

A command that needs a value (a `curl` with your token) runs through the loader for that one process: `bunx varlock run -- sh -c '<command using "$VAR">'`. Never export `.env` into your shell.

A bare `env | grep <PREFIX>` in your terminal comes back empty even when everything is correct: the loader hands the values to each MCP server process, never to the agent or your shell. Use the right check:

```bash
grep -E '^<PREFIX>[A-Z0-9_]*=.' .env | cut -d= -f1   # set in the file? (names only)
bunx varlock run -- env | grep '^<PREFIX>' | cut -d= -f1   # loadable? (what the MCP will see, names only)
bunx varlock load --agent                # every value passes the schema? (redacted)
```

Any change to `.env` → restart the agent (env cached at MCP spawn).

## Security

- NEVER publish service-role / superuser keys here.
- NEVER commit real credentials — they live only in `.env` (gitignored) and inside this gated artifact.
- If a credential leaks outside this artifact, rotate it (e.g. `alter role <role> password '<new>'`) before re-publishing.

## Footer

Public testing guide (architecture, trifuerza UI/API/DB, step-by-step — NO credentials): {{environments.staging.web_url}}/qa
Re-run `/testability-guide` if the stack or migrations change.
```

---

## Why this is the source of truth

- A new publisher is one new file in `publishers/` that wraps this body, with no content duplicated.
- A heading changed here reaches every destination on the next re-run.
- The security audit runs once, in `security-rules.md`, against this template.
- The idempotency `content-hash` is a hash of this body after the `.agents/project.yaml` substitution and before the passwords. Drift in it triggers a surgical patch.
