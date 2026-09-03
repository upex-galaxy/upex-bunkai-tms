# Credentials Content Template — SOURCE OF TRUTH

> **Purpose**: The canonical markdown body of the credentials artifact. Publisher-specific files in `publishers/` are thin adapters around this template — they describe HOW to publish, not WHAT to publish.
>
> **When to read**: Phase 5 of `SKILL.md`. The orchestrator builds this body once, then routes it to the destination chosen in Q1.
>
> **Author once, publish anywhere**: the body is framework-neutral. Each publisher converts heading / code-block syntax (Jira wiki, Confluence macro, Notion block). Tables are special — see the per-publisher note (Jira's converter can't build them; see `publishers/jira-epic.md`).
>
> **Zero-hardcode rule**: every endpoint, host, spec URL, docs route, role name, connection-string shape, and token prefix is a DETECTED placeholder filled from `pre-flight-discovery.md`. This file NEVER hardcodes `/api/auth/callback/credentials`, `/api/openapi.json`, a Supabase pooler host, a `bk_pat_` token prefix, or any literal — those are wrong on most projects. If a value is undetected, render `<detected: none — ask lead>`.

---

## Division of labor (Epic vs `/qa` page) — render this as a box at the top

The credentials artifact and the in-app `/qa` page are a PAIR. They never duplicate; they cross-link.

| | Credentials artifact (this body) | In-app `/qa` page |
| --- | --- | --- |
| Holds | REAL secret values + copy-paste `.env` blocks | Placeholders + procedure / how-to |
| Audience | gated (QA group only) | public-readable |
| Answers | "what do I paste" | "how do I test" |
| Links to | the `/qa` page (footer) | the artifact (credentials CTA) |

State this explicitly in the artifact body so a reader landing on either one knows where the other half lives.

---

## Required sections (in order) — SLIM

The artifact goes straight to the point: what the credentials are and which `.env` vars to set. The "how to test" (architecture, trifuerza UI/API/DB, step-by-step) lives on the `/qa` page, not here.

1. **Title + audience + Division-of-labor box** (above).
2. **Environments** — a TABLE (per env: web URL, API base, OpenAPI spec, status). From `.agents/project.yaml` `environments`. (No prose architecture summary — see #drop below.)
3. **Auth at the UI layer (browser)** — the system roles, and how each tester self-provisions. Two variants, conditional (see §UI variants).
4. **Auth at the DB layer** — raw connection-string (SQL-editor only) VS the DB MCP driver's split-field `.env` block (read-only + read-write). The "two formats, NOT interchangeable" callout.
5. **Auth at the API layer** — a copy-paste `.env` block (base URL / spec path / token); token left BLANK, tester-minted.
6. **Activate the MCPs** — inject the `.env` into the agent (wrapper / source / direnv) + the verification trio.
7. **Security** — what never to publish; rotate-on-leak.
8. **Footer** — one-line pointer to the `/qa` page (this REPLACES the dropped architecture summary).

### Dropped vs the old template

- **Architecture summary prose** → DROPPED. Replaced by the footer one-liner pointing at `/qa` (the page carries the architecture).
- **Fix-history / snapshot-meta prose** → not in the body (snapshot lives in the page comment, per `idempotency-snapshot.md`).
- **Demo-users table** → CONDITIONAL, not removed. See §UI variants.

---

## UI variants — CONDITIONAL on detected auth model (pick ONE at pre-flight)

Detect the project's auth model in pre-flight, then render the matching variant. Default to whichever the auth model implies.

- **Variant A — self-serve (no shared demo users)** — DEFAULT when the project has open/self-service signup, magic-link / passwordless login, or per-tester workspace creation. Each tester makes their OWN user + their OWN workspace; no shared accounts to leak. Render the "how to create your own user" steps; render NO demo-users table.
- **Variant B — shared demo accounts** — when the project has no self-service signup, or QA explicitly relies on seeded/fixture accounts. Render a demo-users TABLE (emails; passwords gated per `security-rules.md` → `<see secrets store>`).

If detection is ambiguous, ask the lead; do not silently pick B (shared accounts are the higher-leak path).

---

## Snippet rules

- **One credential = one snippet** for single values; for grouped `.env` blocks (DB driver fields, API trio) a SINGLE fenced block is correct — testers paste the whole block into `.env` at once. (This is the deliberate exception to one-value-per-fence: a `.env` block is one copy-paste unit.)
- Generic code-fence (```) in the template; each adapter converts to its native syntax.
- Never put real passwords in this committed template. Real values are filled at publish-time inside the access-gated destination.
- Use `<see secrets store>` for any value the AI must not see (production passwords, service-role keys).

---

## Placeholder sources (publish-time substitution)

| Placeholder | Source |
| --- | --- |
| `{{PROJECT_NAME}}` | `.agents/project.yaml` → `project.project_name` |
| `{{DB_TYPE}}` | `database.db_type` (fallback: pre-flight) |
| `{{environments.<env>.web_url}}` / `{{…api_url}}` | `.agents/project.yaml` → `environments.<env>.*` (**nested, snake_case** — NOT `WEB_URL`) |
| `<<LOGIN_URL>>` | DETECTED browser login route (e.g. `/login`). NEVER a default path. |
| `<<SYSTEM_ROLES>>` | DETECTED app role names (render ONLY what the project actually has — no invented `viewer/member/admin`) |
| `<<SIGNUP_MODEL>>` | DETECTED: self-serve / magic-link / invite-only / seeded — drives the UI variant choice |
| `<<API_LOGIN_ENDPOINT>>` | DETECTED `<METHOD> <path>` for headless login (e.g. `POST <path>`). NEVER baked-in `/signin` or `/signup`. |
| `<<TOKEN_PREFIX>>` | DETECTED token prefix shape (e.g. `<token-prefix>_<...>`). NEVER a literal `bk_pat_`. |
| `<<OPENAPI_SPEC_URL>>` | DETECTED spec route (`/api/openapi`, `/api/swagger.json`, …) |
| `<<API_LOGIN_HELPER>>` | the project's api-login mini-CLI IF present (e.g. `bun run api:login`), adapted per-project. Else omit the line and keep only the manual path. |
| `<<DB_MCP>>` | DETECTED DB MCP name (e.g. DBHub, Postgres MCP) + its config style (toml `${VAR}` / env-only) |
| `<<DB_ENV_PREFIX>>` | DETECTED env-var prefix the DB MCP reads (e.g. `DBHUB_`) |
| `<<DB_URI_SCHEME>>` | DETECTED engine URI scheme (`postgresql` / `sqlserver` / `mysql` / …) |
| `<<DB_RO_ROLE>>` / `<<DB_RW_ROLE>>` | DETECTED read-only / read-write role names (render RW only if the project actually has one) |
| `<<DB_HOST>>` / `<<DB_PORT>>` / `<<DB_NAME>>` | DETECTED connection target (e.g. a pooler host:port). Real values filled in the gated destination. |
| `<see secrets store>`, `<detected: none — ask lead>` | LITERAL placeholders — never substitute with real `.env` values during codegen. |

The skill NEVER writes real passwords into the artifact during codegen. The user pastes them into the access-gated destination after publish.

> **DB shape is an EXAMPLE, not a contract.** The Supabase-pooler form below (`<role>.<project-ref>` username, port 5432, `?sslmode=require`) is ONE detected shape. If the project uses a different engine/driver, the skill fills the same TWO-FORMAT pattern (raw DSN vs split-field env) with that engine's real shape. Detect, don't copy.

---

## Template body (literal — copy into the publisher adapter, then substitute placeholders)

```markdown
# {{PROJECT_NAME}} — QA Testing Credentials (DB / API / UI)

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

**2) Driver split fields — what the <<DB_MCP>> MCP reads.** The MCP config is committed with `${VAR}` placeholders; you set these in your `.env` (read-only role):

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

Set in your `.env` (pointing at staging):

```bash
# .env — API / OpenAPI MCP
API_BASE_URL={{environments.staging.api_url}}
OPENAPI_SPEC_PATH=<<OPENAPI_SPEC_URL>>
API_TOKEN=
```

`API_TOKEN` is left BLANK on purpose — it is PERSONAL. Do NOT copy anyone else's. Mint your own with YOUR user:

- Helper (if present): `<<API_LOGIN_HELPER>>` — the project's api-login mini-CLI; mints your token and writes it into your `.env` as `API_TOKEN=`. Restart the terminal/agent after (the MCP caches env at spawn).
- Manual: `<<API_LOGIN_ENDPOINT>>` with your credentials → returns a token (`<<TOKEN_PREFIX>>…`). Paste it into `API_TOKEN`.

## Activate the MCPs (inject the `.env`)

The MCP config files carry `${VAR}` / `{env:VAR}` placeholders — no secrets. Real values live in your `.env` (gitignored). The agent reads vars when it spawns each MCP, so the `.env` must be injected into the process that launches the agent:

```bash
bun run claude      # agent with the .env injected (= dotenv -e .env -- claude)
bun run opencode
```

Verify the vars are actually present BEFORE launching. The wrapper injects the `.env` into the agent CHILD process, NOT your parent shell — so a bare `env | grep <PREFIX>` in your terminal comes back empty even when everything is correct. Use the right check:

```bash
grep <PREFIX> .env                       # is it in the file?
dotenv -e .env -- env | grep <PREFIX>    # is it injected (what the MCP will see)?
set -a; source .env; set +a              # load into THIS shell, then run claude/opencode bare
```

Any change to `.env` → restart the agent (env cached at spawn). Mac/Linux alternative: `direnv allow` with the repo `.envrc`.

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

- New publisher = one new file in `publishers/` wrapping this body. No content duplication.
- Change a heading once → propagates to every destination on the next re-run.
- Security audit runs ONCE in `security-rules.md` against this template.
- Idempotency `content-hash` tracks a hash of this rendered body (after `.agents/project.yaml` substitution, before passwords). Drift → surgical patch.
