# Pre-flight Discovery

> **Purpose**: Detect the host project's stack, conventions, API/auth model, env-var wiring, MCP config, and existing test infrastructure BEFORE generating or patching the `/qa` page. **This file is the single source of truth for every endpoint, auth shape, docs URL, spec URL, MCP config block, and env-var slot the page and the credentials artifact will reference.** Nothing downstream may hardcode a value this phase is responsible for detecting.
>
> **When to read**: Phase 1 of `SKILL.md`. Also re-run during the idempotency check (Phase 2) to diff against the snapshot comment.
>
> **Read-only.** Run the checks in parallel where possible.

---

## The zero-hardcode contract

The `/qa` page is generated against THREE+ wildly different realities (observed in this ecosystem alone):

| Aspect | upex-dojo | agentic-dev-boilerplate | agentic-qa-boilerplate (canonical) |
| --- | --- | --- | --- |
| Auth | custom `POST /api/auth/login` → `{access_token, token_type, expires_in}` (jose HS256) | Supabase Auth: cookie `sb-<ref>-auth-token` + Bearer + `X-API-Key` | Supabase `POST /auth/v1/token?grant_type=password` → `{access_token,...}`; `bun run api:login` writes `API_TOKEN` into `.env` |
| Docs UI | Swagger UI at `/api/docs` | Redoc at `/api-docu` | (consumer-defined) |
| Spec | `/api/swagger.json` | `/api/openapi` | `${OPENAPI_SPEC_PATH}` env var |
| MCP config | `.mcp.json` only | `.mcp.json` + `opencode.jsonc` | `.mcp.json` + `opencode.jsonc` + `docs/mcp/*.template.*` |

→ A template that bakes in `/api/auth/callback/credentials` or `/api/openapi.json` is **wrong in at least 2 of 3 projects**. Detect everything below. When a signal is absent, surface a gap — never substitute a guess.

---

## What to detect (parallel checks, one short paragraph back to the orchestrator)

### Stack & UI

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| Framework + version | `package.json` deps (`next`, `remix`, `astro`, `nuxt`, `@sveltejs/kit`, `vite`+`react-router-dom`, `react-scripts`) + exact version | Page-route location + redirect mechanism (`routing-patterns.md`). Snapshot field. |
| UI kit | `components.json`/`shadcn`, `@mui/material`, `@mantine/core`, `@chakra-ui/react`, `radix-ui`, plain Tailwind | Reuse — never add a UI dep. Primitives (Button/Card/Accordion/Tabs) come from the host kit. |
| Icon library | `lucide-react`, `react-icons`, `@heroicons/react`, `phosphor-react` | Reuse. None → inline SVG, do not add a lib. |
| i18n / language | `next-intl`, `next-i18next`, `react-i18next`, root `<html lang="…">`, copy in existing pages | Sets visible-copy language. Default Spanish per Q5 in this ecosystem (page is for QA), English only if no signal AND user picks it. |
| Dark/light theme | `next-themes`, `dark:` Tailwind variants, CSS-variable theme, theme provider | The page MUST mirror the host's existing dark/light mechanism. |

### API, auth & docs (the high-risk detections)

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| **Auth model** | `middleware.ts`, `lib/auth*`, `app/api/auth/*`, `pages/api/auth/*`; deps `next-auth`/`@auth/core`, `@clerk/*`, `@supabase/ssr`/`@supabase/supabase-js`; OpenAPI `securitySchemes` registration | Classify into one or more of: **Supabase Auth** (cookie `sb-<ref>-auth-token` + Bearer `access_token`), **custom JWT login route**, **Auth.js credentials**, **Clerk**, **API-Key header** (`X-API-Key`), **CRON_SECRET bearer**. A project can expose MULTIPLE — capture all (drives the AuthMethods tabs). |
| **Login endpoint + token shape** | Read the actual detected route file. Supabase → `/auth/v1/token?grant_type=password` (header `apikey`, body `{email,password}`). Custom → read the route's response JSON shape. Auth.js → `/api/auth/callback/credentials` is the INTERNAL provider callback; a JSON-body login against it is usually the WRONG shape — flag it and look for a custom login route or client-side `signIn('credentials',{...})`. | Goes into the credentials artifact + the API section verbatim. NEVER assume — read the route. |
| **`bun run api:login` (or equivalent)** | `package.json` scripts, `scripts/*login*`, `cli/*` | If present, document it: it performs login and writes `API_TOKEN` into `.env`; tester must restart the terminal/agent after. This is the canonical API-auth bridge in the QA boilerplate. |
| **Docs UI + route** | look for Scalar (`@scalar/*`), Redoc (`redoc`/`redoc.standalone.js`), Swagger UI (`swagger-ui`); route serving it (`/api/docs`, `/api-docu`, `/docs`, …) | The page links to the real docs UI. Detect WHICH lib + WHICH route. Never assume Scalar. |
| **OpenAPI spec path** | `/api/openapi`, `/api/openapi.json`, `/api/swagger.json`, `scalar` config, `@asteasolutions/zod-to-openapi` generator route, `bun run api:sync`/`api:export` scripts | Direct link + the `OPENAPI_SPEC_PATH` value. If absent → flag a gap, don't block. |

### Database

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| DB engine | `package.json` (`pg`, `mysql2`, `mssql`/`tedious`, `@supabase/supabase-js`, `mongodb`, `better-sqlite3`, `mariadb`) + `.env*` (`DBHUB_TYPE`, `POSTGRES_*`, connection strings) | Picks the DBHub `type` (sqlserver\|postgres\|mysql\|sqlite\|mariadb) AND the VSCode/Cursor URI scheme. |
| ORM | `drizzle-orm`, `@prisma/client`, `typeorm`, `sequelize`, raw SQL / Supabase client | Architecture-table label only. |
| Read-only QA role | RLS policies, `qa_*` roles, `GRANT SELECT` migrations, seed scripts | Q2 (DB role policy). If only a superuser exists → `security-rules.md` STOP. |
| Connection shape | pooler host, port, sslmode (from `dbhub.toml`/`.env.example`) | Build BOTH the `dbhub.toml` MCP config and the `postgresql://…`/`sqlserver://…` URI for the VSCode extension (2-ways-DB requirement). |

### MCP config & env-var wiring (req #3 + #6)

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| **Agent MCP config files** | `.mcp.json` (Claude Code), `opencode.jsonc`/`opencode.json` (OpenCode), `.codex/config.toml` / `~/.codex/config.toml` (Codex), `~/.gemini/settings.json` (Gemini), `docs/mcp/*.template.*` | Determines which of the 4 agent tabs to render and with what real blocks. Read the EXISTING dbhub/openapi/postman/playwright blocks — render those, don't invent. |
| **dbhub.toml** | repo root `dbhub.toml`, `docs/mcp/dbhub.example.toml` | The DB MCP config. Note `${VAR}` interpolation — values come from `.env`, file is committed. |
| **Env-var strategy** | are MCP configs using `${VAR}` / `{env:VAR}` / `$VAR` expansion, or literal values? | Strategy B (env-expansion + commit) is the canonical pattern. Drives the EnvSetup section. |
| **Env activation mechanism** | `package.json` scripts `claude`/`opencode` (dotenv-cli wrapper), `.envrc` (direnv), note in `.env.example` | Tells the page HOW testers load `.env` before launching the agent (wrapper cross-platform vs direnv Mac/Linux). |
| **`.env` / `.env.example` slots** | enumerate keys (NAMES ONLY, never values) | Cross-reference what the credentials artifact references by name: `TEST_ENV`, `LOCAL_USER_EMAIL/PASSWORD`, `STAGING_USER_EMAIL/PASSWORD`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `API_TOKEN`, `POSTMAN_API_KEY`, `DBHUB_TYPE/HOST/PORT/DATABASE/USER/PASSWORD`, `RESEND_API_KEY`, etc. Surface gaps. |

### Repos, project config & test infra

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| **Repos shape (mono/poly)** | `.agents/project.yaml` → `backend.backend_repo` + `frontend.frontend_repo`; presence of separate FE/BE dirs or git remotes | The architecture diagram MUST show the official repos. Same URL for both → monorepo; different → polyrepo (draw both repos + the boundary). |
| Existing `/qa` or sibling page | `app/qa/*`, `pages/qa.*`, `app/guide/*`, `app/docs/*`, `app/integration/*`, `app/onboarding/*` | `/qa` exists → idempotency path. Sibling exists → Q4 (redirect) defaults yes. |
| Existing test infra | `playwright.config.*`, `cypress.config.*`, `vitest.config.*`, `jest.config.*`; `@playwright/mcp` in MCP config; `allure*` | UI-testing section. Inspect tests for the `data-testid` convention so generated examples match. Note scripted vs agentic split. |
| Default branch | `gh repo view --json defaultBranchRef` or `.git/refs/heads/*` | `/git-flow-master` base branch. NEVER assume `main` — `staging`/`develop` common. |
| **`.agents/project.yaml`** | nested schema: `project.{project_name,project_key,webapp_domain}`, `backend.{backend_repo,backend_stack,backend_entry}`, `frontend.{frontend_repo,frontend_stack,frontend_entry,design_md_path}`, `database.db_type`, `issue_tracker.*`, `testing.default_env`, `environments.{local,staging,…}.{web_url,api_url,db_project_ref}` | Pulls URLs (snake_case, nested), stacks, repos, Jira key. If missing → user must clone the full boilerplate. **Note the real keys are snake_case + nested — `environments.staging.web_url`, NOT `WEB_URL`.** |

---

## Testability assessment (flag deficiencies)

After detection, score the three layers (UI / API / DB) against the rubric in `testability-assessment.md` and emit a `testability:` flag. The page is built regardless of score — but a ⚠️ / ❌ layer fires a flag + a concrete remediation the team should act on. **Adapt to what exists; flag what's missing.**

- **UI** — stable selectors (`data-testid` / role) on critical flows, esp. login? Missing → flag + recommend a selector convention.
- **API** (highest leverage) — a **programmatic auth path** that yields a token for `Authorization: Bearer …` (a password login endpoint, a PAT issuer, or a service token, with an expiry)? Passwordless- / OAuth- / SSO-only with NO token issuer → ❌ flag + recommend the canonical pattern: **a normal user+password login PLUS an API endpoint that issues a token with expiry**, used to request as the authenticated user.
- **DB** — a read-only QA role for direct inspection? Only a superuser → STOP per `security-rules.md` §1.

Detect the FULL auth surface BEFORE flagging API: passwordless UI **+** a PAT/token issuer = ✅ (a programmatic path exists), NOT ❌. The deficiency fires only when no programmatic token path exists at all. Full rubric, levels, output format, and the remediation pattern live in `testability-assessment.md`.

---

## What to NOT do

- Do NOT read `.env` or any `*.local` / `*credentials*` file to discover real values. Pre-flight is read-only against committed code; enumerate env-var NAMES only. Real secrets live in the credentials artifact + the destination tool, never in the page or repo.
- Do NOT install anything. The skill never adds dependencies.
- Do NOT run the dev server or test suite. That is Phase 8 (verification).
- Do NOT assume Scalar/Redoc/Swagger, a login path, or a spec path. If you cannot detect it, report it as a gap to the user and continue with an explicit `<detected: none — ask user>` placeholder.

---

## Output shape

Return ONE short paragraph to the orchestrator. Example:

> Detected: Next.js 15.5 App Router (TS), shadcn/ui + Tailwind + next-themes (dark/light via `dark:`), lucide-react. Auth = **custom JWT login route** `POST /api/auth/login` → `{access_token,token_type,expires_in}` (jose HS256); no Supabase, no api:login script. Docs = **Swagger UI at `/api/docs`**, spec at `/api/swagger.json`. DB = Postgres (Neon) + Drizzle; read-only `qa_student` role exists. MCP config: `.mcp.json` only (no opencode/codex/gemini), no `dbhub.toml` yet → will scaffold from `docs/mcp/dbhub.example.toml` shape. Env activation: Bun auto-loads `.env`, no dotenv-cli wrapper script, no `.envrc`. `.env.example` slots: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL. Repos: monorepo (single repo, no separate `backend_repo`/`frontend_repo`). Existing `/guide` page found (Q4 redirect defaults yes). Playwright under `tests/e2e/` with `data-testid="login-*"`. Default branch `staging`. `.agents/project.yaml`: absent → flag. **testability: UI ⚠️ (login lacks `data-testid`) · API ❌ (magic-link only, no token endpoint — recommend password login + token issuer with expiry) · DB ✅ (`qa_inspector_ro` present).**

This paragraph plugs straight into the snapshot comment (Phase 4) and the idempotency diff (Phase 2). Every value it states is something a downstream reference will substitute — so if a field reads `<detected: none>`, the corresponding page section renders an explicit "ask your lead" gap, never a fabricated default.
