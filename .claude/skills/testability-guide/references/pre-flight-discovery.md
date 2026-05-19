# Pre-flight Discovery

> **Purpose**: Detect the host project's stack, conventions, and existing test infrastructure before generating or patching the `/qa` page. Read-only. Run in parallel where possible.
>
> **When to read**: Phase 1 of `SKILL.md`. Also re-run during the idempotency check (Phase 2) to diff against the snapshot comment.

---

## What to detect (parallel checks, one short paragraph back to the orchestrator)

| Signal                         | Where to look                                                                                                                                              | Why it matters                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework                      | `package.json` dependencies (`next`, `remix`, `astro`, `nuxt`, `@sveltejs/kit`, `vite` + `react-router-dom`, plain `react-scripts`)                        | Decides the page-route location (App Router vs Pages vs `routes/`) and redirect mechanism. See `routing-patterns.md`.                                        |
| Framework version              | `package.json` exact version                                                                                                                               | Snapshot field. Surgical-patch trigger if it drifted.                                                                                                        |
| UI kit                         | look for `shadcn`/`components.json`, `@mui/material`, `@mantine/core`, `@chakra-ui/react`, `radix-ui`, plain Tailwind                                      | Reuse — never add a new UI dep. Component primitives (Button, Card, Accordion) come from the host kit.                                                       |
| Icon library                   | `lucide-react`, `react-icons`, `@heroicons/react`, `phosphor-react`                                                                                        | Reuse for the page icons. If none → use inline SVG, do not add a lib.                                                                                        |
| Auth model                     | scan `middleware.ts`, `lib/auth*`, `pages/api/auth/*`, `app/api/auth/*`, dependencies `next-auth` / `@auth/core` / `@clerk/*` / `@supabase/auth-helpers-*` | Drives the §4.5 API testing code (login curl, JWT header name, cookie vs bearer).                                                                            |
| Login endpoint path            | search for `signIn`, `/api/auth/callback/credentials`, custom login route                                                                                  | Exact path goes into the credentials-content template (not the page).                                                                                        |
| DB engine                      | `package.json` (`pg`, `mysql2`, `@supabase/supabase-js`, `mongodb`, `better-sqlite3`) + `.env.example`                                                     | Picks the DBHub MCP connection string format.                                                                                                                |
| ORM                            | `drizzle-orm`, `@prisma/client`, `typeorm`, `sequelize`, raw SQL                                                                                           | Mentioned in the architecture table on the page.                                                                                                             |
| Existing `/qa` or sibling page | check for `app/qa/*`, `pages/qa.*`, `app/guide/*`, `app/docs/*`, `app/integration/*`, `app/onboarding/*`                                                   | If `/qa` exists → idempotency path. If a sibling exists → Q4 (redirect old route) defaults to yes.                                                           |
| Existing test infrastructure   | `playwright.config.*`, `cypress.config.*`, `vitest.config.*`, `jest.config.*`                                                                              | Mention in §4.6 of the page. Inspect existing tests for the `data-testid` convention so the generated examples match.                                        |
| MCP config files               | `.mcp.json`, `.cursor/mcp.json`, `opencode.jsonc`, `.opencode/mcp.json`                                                                                    | Which MCPs (DBHub, OpenAPI, Atlassian, Notion, Supabase) are already wired. Drives Q1 publisher availability + §4.4 / §4.5 examples.                         |
| i18n setup                     | `next-intl`, `next-i18next`, `react-i18next`, root `<html lang="…">`, copy in existing pages                                                               | Sets visible-copy language for the generated `/qa`. Default English if no signal.                                                                            |
| OpenAPI / Swagger              | `/api/docs`, `/swagger.json`, `/openapi.json`, `scalar` config, `bun run api:sync` script                                                                  | Direct link from `/qa` §4.5. If absent → flag as gap, do not block.                                                                                          |
| Default branch                 | `gh repo view --json defaultBranchRef` or `.git/refs/heads/*`                                                                                              | Tells `/git-flow-master` what to branch off. NEVER assume `main` — `staging` and `develop` are common.                                                       |
| `.agents/project.yaml`         | does the file exist + is `active_env` set?                                                                                                                 | Pulls `{{WEB_URL}}`, `{{API_URL}}`, project name, Jira project key. If missing → user must clone the full boilerplate (foundation files ship with the repo). |
| `.env.example`                 | enumerate keys                                                                                                                                             | Cross-reference with what the credentials artifact needs. Surface gaps (e.g. `DATABASE_URL` not in `.env.example`).                                          |

---

## What to NOT do

- Do NOT read `.env` or any file matching `*.local` / `*credentials*` to discover real values. The pre-flight is read-only against committed code — real secrets live in the credentials artifact, never in the page or the repo.
- Do NOT install anything during pre-flight. The skill never adds dependencies.
- Do NOT run the dev server or the test suite. That happens in Phase 8 (verification), not here.

---

## Output shape

Return ONE short paragraph to the orchestrator. Example:

> Detected: Next.js 15.0.3 App Router (TypeScript), shadcn/ui + Tailwind, lucide-react icons, Auth.js v5 with credentials provider at `/api/auth/callback/credentials`, Supabase Postgres + Drizzle. Existing `/guide` page found (will redirect per Q4 default). Playwright tests under `tests/e2e/` using `data-testid="login-*"` convention. `.mcp.json` already declares Atlassian + Supabase MCPs; no Notion MCP. OpenAPI spec served at `/api/openapi.json`, Scalar UI at `/api/docs`. Default branch is `staging`. `.agents/project.yaml` present, `active_env=testing.default_env`.

This paragraph plugs straight into the snapshot comment in the generated page (Phase 4) and into the idempotency diff on re-run (Phase 2).
