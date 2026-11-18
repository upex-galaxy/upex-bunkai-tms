# Pre-flight discovery

> **Purpose**: Detect the host project's stack, conventions, API and auth model, env-var wiring, MCP config and existing test infrastructure before generating or patching the `/qa` page. This file is the single source of truth for every endpoint, auth shape, docs URL, spec URL, MCP config block and env-var slot the page and the credentials artifact reference. Nothing downstream hardcodes a value this phase is responsible for detecting.
>
> **When to read**: Phase 1 of `SKILL.md`. Also re-run during the idempotency check (Phase 2) to diff against the snapshot comment.
>
> Read-only. Run the checks in parallel where possible.

---

## The zero-hardcode contract

The `/qa` page is generated against very different realities, three observed in this ecosystem:

| Aspect | upex-dojo | agentic-dev-boilerplate | agentic-qa-boilerplate (canonical) |
| --- | --- | --- | --- |
| Auth | custom `POST /api/auth/login` → `{access_token, token_type, expires_in}` (jose HS256) | Supabase Auth: cookie `sb-<ref>-auth-token` + Bearer + `X-API-Key` | Supabase `POST /auth/v1/token?grant_type=password` → `{access_token,...}`; `bun run api:login` writes the token into `.auth/tokens.env` (never `.env`), curl reads it |
| Docs UI | Swagger UI at `/api/docs` | Redoc at `/api-docu` | (consumer-defined) |
| Spec | `/api/swagger.json` | `/api/openapi` | `${OPENAPI_SPEC_PATH}` env var |
| MCP config | `.mcp.json` only | `.mcp.json` + `opencode.jsonc` | `.mcp.json` + `opencode.jsonc` + `docs/mcp/*.template.*` |

A template that bakes in `/api/auth/callback/credentials` or `/api/openapi.json` is wrong in at least two of the three. Detect everything below, and when a signal is absent, surface a gap instead of substituting a guess.

---

## What to detect (parallel checks, one short paragraph back to the orchestrator)

### Stack and UI

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| Framework and version | `stack.framework` and `stack.app_root` first, confirmed in the app's `package.json` deps (`next`, `remix`, `astro`, `nuxt`, `@sveltejs/kit`, `vite`+`react-router-dom`, `react-scripts`) with the exact version | Page-route location and redirect mechanism (`routing-patterns.md`). Snapshot field. |
| UI kit | `components.json`/`shadcn`, `@mui/material`, `@mantine/core`, `@chakra-ui/react`, `radix-ui`, plain Tailwind | Reuse it and add no UI dependency. Primitives (Button, Card, Accordion, Tabs) come from the host kit. |
| Icon library | `lucide-react`, `react-icons`, `@heroicons/react`, `phosphor-react` | Reuse it. None found means inline SVG, no new lib. |
| i18n / language | `next-intl`, `next-i18next`, `react-i18next`, root `<html lang="…">`, copy in existing pages | Sets the visible-copy language: Q5 follows this signal, and with no signal Q5 asks (no assumed default). |
| Dark/light theme | `next-themes`, `dark:` Tailwind variants, CSS-variable theme, theme provider | The page mirrors the host's existing dark/light mechanism. |

### API, auth and docs (the high-risk detections)

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| Auth model | `middleware.ts`, `lib/auth*`, `app/api/auth/*`, `pages/api/auth/*`; deps `next-auth`/`@auth/core`, `@clerk/*`, `@supabase/ssr`/`@supabase/supabase-js`; OpenAPI `securitySchemes` registration | Classify into one or more of: Supabase Auth (cookie `sb-<ref>-auth-token` + Bearer `access_token`), custom JWT login route, Auth.js credentials, Clerk, API-Key header (`X-API-Key`), `CRON_SECRET` bearer. A project can expose several, so capture all of them (this drives the AuthMethods tabs). |
| Login endpoint and token shape | Read the actual detected route file. Supabase: `/auth/v1/token?grant_type=password` (header `apikey`, body `{email,password}`). Custom: read the route's response JSON shape. Auth.js: `/api/auth/callback/credentials` is the internal provider callback, and a JSON-body login against it is usually the wrong shape, so flag it and look for a custom login route or a client-side `signIn('credentials',{...})`. | Goes into the credentials artifact and the API section verbatim. Read the route; an assumed shape is a fabricated one. |
| `bun run api:login` (or equivalent) | `package.json` scripts, `scripts/*login*`, `cli/*` | When present, document it: it performs the login and stores the tester's own token where that project keeps it (the QA boilerplate: `.auth/tokens.env`, never `.env`, never an MCP config), and curl uses it by name. This is the canonical API-auth bridge in the QA boilerplate. |
| Docs UI and route | Scalar (`@scalar/*`), Redoc (`redoc`/`redoc.standalone.js`), Swagger UI (`swagger-ui`); the route serving it (`/api/docs`, `/api-docu`, `/docs`, …) | The page links to the real docs UI. Detect which lib and which route; Scalar is not a default. |
| OpenAPI spec path | `/api/openapi`, `/api/openapi.json`, `/api/swagger.json`, `scalar` config, `@asteasolutions/zod-to-openapi` generator route, `bun run api:sync`/`api:export` scripts | A direct link plus the `OPENAPI_SPEC_PATH` value, which is the full URL (origin plus detected route) or a repo-root-relative synced file, never the route alone. Absent means flag a gap and carry on. |

### Database

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| DB engine and provider | `stack.database.engine` / `provider` first (they pick the DB MCP: `mcp-and-env-setup.md` §4.0), confirmed in `package.json` (`pg`, `mysql2`, `mssql`/`tedious`, `@supabase/supabase-js`, `mongodb`, `better-sqlite3`, `mariadb`) and `.env*` (`DBHUB_TYPE`, `POSTGRES_*`, connection strings) | Picks the DBHub `type` (sqlserver\|postgres\|mysql\|sqlite\|mariadb) and the VSCode/Cursor URI scheme. |
| ORM | `drizzle-orm`, `@prisma/client`, `typeorm`, `sequelize`, raw SQL / Supabase client | Architecture-table label only. |
| Read-only QA role | RLS policies, `qa_*` roles, `GRANT SELECT` migrations, seed scripts | Q2 (DB role policy). If only a superuser exists, `security-rules.md` "Hard refusals", rule 1 stops the run. |
| Connection shape | pooler host, port, sslmode (from `dbhub.toml` / `.env.example`) | Builds both the `dbhub.toml` MCP config and the `postgresql://…` / `sqlserver://…` URI for the VSCode extension (the two-ways-DB requirement). |

### MCP config and env-var wiring

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| Agent MCP config files | `.mcp.json` (Claude Code), `opencode.jsonc`/`opencode.json` (OpenCode), `.codex/config.toml` / `~/.codex/config.toml` (Codex), `~/.gemini/settings.json` (Gemini), `docs/mcp/*.template.*` | Determines which of the four agent tabs to render and with what real blocks. Read the existing dbhub/openapi/postman/playwright blocks and render those. |
| `dbhub.toml` | repo root `dbhub.toml`, `docs/mcp/dbhub.example.toml` | The DB MCP config. Values come from `.env` through `${VAR}` interpolation, and the file is committed. |
| Env-var strategy | Do MCP configs start servers through the `.env` loader (`--filter <vars>`), use `${VAR}` / `{env:VAR}` / `$VAR` expansion (remote servers), or carry literal values? | Strategy B (the `.env` loader plus commit) is the canonical pattern. Drives the EnvSetup section. |
| Env activation mechanism | MCP config entries that start a server through the `.env` loader (`varlock run --filter <vars> -- <server>`), a varlock schema (`.env.schema`), a note in `.env.example` | Tells the page how `.env` values reach what needs them: the agent opens bare and holds none, each MCP server reads its own through the loader, and a command needing a value runs as `bunx varlock run -- sh -c '...'` (never into the agent or the shell). |
| `.env` / `.env.example` slots | enumerate keys (names only, never values) | Cross-reference what the credentials artifact references by name: `TEST_ENV`, the automation identity declared in `.agents/project.yaml` → `testing.automation_identity` (default names `QA_E2E_USER_EMAIL/PASSWORD`), `LOCAL_USER_EMAIL/PASSWORD`, `STAGING_USER_EMAIL/PASSWORD`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `POSTMAN_API_KEY`, `DBHUB_TYPE/HOST/PORT/DATABASE/USER/PASSWORD`, `RESEND_API_KEY`, and so on. Surface gaps. |

### Repos, project config and test infra

| Signal | Where to look | Why it matters |
| --- | --- | --- |
| Repos shape (mono/poly) | `.agents/project.yaml` → `backend.backend_repo` + `frontend.frontend_repo`; separate FE/BE dirs or git remotes | The architecture diagram shows the official repos. The same URL for both means monorepo; different URLs mean polyrepo (draw both repos and the boundary). |
| Existing `/qa` or sibling page | `app/qa/*`, `pages/qa.*`, `app/guide/*`, `app/docs/*`, `app/integration/*`, `app/onboarding/*` | An existing `/qa` takes the idempotency path. A sibling makes Q4 (redirect) default to yes. |
| Existing test infra | `playwright.config.*`, `cypress.config.*`, `vitest.config.*`, `jest.config.*`; `@playwright/mcp` in MCP config; `allure*` | Feeds the UI-testing section. Inspect the tests for the `data-testid` convention so generated examples match, and note the scripted versus agentic split. |
| Default branch | `gh repo view --json defaultBranchRef` or `.git/refs/heads/*` | The `/git-flow-master` base branch. `main` is not a safe assumption: `staging` and `develop` are common. |
| Deployed build SHA source | Hosting signal: `vercel.json`, `.vercel/project.json`, `vercel` scripts in `package.json`, an installed `vercel-cli` skill. On Vercel the system env var is `VERCEL_GIT_COMMIT_SHA` (build and runtime; it needs the project setting "Automatically expose System Environment Variables" and is absent in local dev and on deploys without git metadata). Another host has its own commit-SHA variable, with the exact name confirmed through `library-docs` before coding. The commit-link base is the repo URL from `.agents/project.yaml` (`frontend.frontend_repo`, else `backend.backend_repo`). | Fills `qaConfig.build` (`page-craft.md` → Build stamp) and the `build-sha-source` snapshot field. Record the variable name only, never its value. No signal means `build: null`, and the hero renders the fallback line. |
| `.agents/project.yaml` | nested schema: `project.{project_name,project_key,webapp_domain}`, `backend.{backend_repo,backend_stack,backend_entry}`, `frontend.{frontend_repo,frontend_stack,frontend_entry,design_md_path}`, `database.db_type`, `issue_tracker.*`, `testing.default_env`, `environments.{local,staging,…}.{web_url,api_url,db_project_ref}` | Supplies URLs, stacks, repos and the Jira key. The `stack:` block (`stack.framework`, `stack.app_root`, `stack.database.*`, `stack.ui`, `stack.hosting`) is the structured stack: start from it, and when the code disagrees report the drift (`bun run setup:doctor`) instead of silently trusting either side. A missing file means the agentic layer is not installed: a new project comes from `bunx create-agentic-dev`, an existing app from `bunx create-agentic-dev --adopt` followed by `/project-adoption`. The real keys are snake_case and nested (`environments.staging.web_url`, not `WEB_URL`). |

---

## Testability assessment (flag deficiencies)

After detection, score the three layers (UI, API, DB) against the rubric in `testability-assessment.md` and emit a `testability:` flag. The page is built regardless of score, but a warning or failing layer fires a flag and a concrete remediation the team can act on. Adapt to what exists and flag what is missing.

- UI: stable selectors (`data-testid` or role) on critical flows, especially login? Missing means a flag plus a recommended selector convention.
- API (the highest leverage): is there a programmatic auth path that yields a token for `Authorization: Bearer …` (a password login endpoint, a PAT issuer or a service token, with an expiry)? A passwordless, OAuth-only or SSO-only app with no token issuer is a failing layer. Recommend the canonical pattern: a normal user+password login plus an API endpoint that issues a token with expiry, used to request as the authenticated user.
- DB: is there a read-only QA role for direct inspection? Only a superuser means stop per `security-rules.md` "Hard refusals", rule 1.

Detect the full auth surface before flagging the API. A passwordless UI plus a PAT or token issuer is a pass, because a programmatic path exists. The deficiency fires only when none does. The full rubric, levels, output format and remediation pattern live in `testability-assessment.md`.

---

## Boundaries of this phase

Pre-flight reads committed code and nothing else.

- Never read `.env` or any `*.local` or `*credentials*` file to discover real values (Critical Rule 1). Enumerate env-var names only. Real secrets live in the credentials artifact and the destination tool, never in the page or the repo.
- Install nothing. The skill adds no dependencies.
- Do not run the dev server or the test suite. That is Phase 8 (verification).
- When Scalar, Redoc, Swagger, a login path or a spec path cannot be detected, report it as a gap to the user and continue with an explicit `<detected: none — ask user>` placeholder. With nobody at the keyboard, put the gap in the run report and continue the same way; the placeholder is the answer.

---

## Output shape

Return one short paragraph to the orchestrator. Example:

> Detected: Next.js 15.5 App Router (TS), shadcn/ui + Tailwind + next-themes (dark/light via `dark:`), lucide-react. Auth = **custom JWT login route** `POST /api/auth/login` → `{access_token,token_type,expires_in}` (jose HS256); no Supabase, no api:login script. Docs = **Swagger UI at `/api/docs`**, spec at `/api/swagger.json`. DB = Postgres (Neon) + Drizzle; read-only `qa_student` role exists. MCP config: `.mcp.json` only (no opencode/codex/gemini), no `dbhub.toml` yet → will scaffold from `docs/mcp/dbhub.example.toml` shape. Env activation: Bun auto-loads `.env`, no dotenv-cli wrapper script, no varlock schema. `.env.example` slots: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL. Repos: monorepo (single repo, no separate `backend_repo`/`frontend_repo`). Existing `/guide` page found (Q4 redirect defaults yes). Playwright under `tests/e2e/` with `data-testid="login-*"`. Default branch `staging`. Build SHA: `VERCEL_GIT_COMMIT_SHA` (Vercel, commit link from `frontend.frontend_repo`). `.agents/project.yaml`: absent → flag. **testability: UI ⚠️ (login lacks `data-testid`) · API ❌ (magic-link only, no token endpoint; recommend password login + token issuer with expiry) · DB ✅ (`qa_inspector_ro` present).**

This paragraph feeds the snapshot comment (Phase 4) and the idempotency diff (Phase 2). Every value in it is substituted downstream, so a field that reads `<detected: none>` makes the matching page section render an explicit "ask your lead" gap, never a fabricated default.
