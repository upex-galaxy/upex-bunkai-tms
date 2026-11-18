# Page structure for `/qa`

> **Purpose**: Section-by-section layout and copy for the generated page. This file defines what each section says; `page-craft.md` defines how it looks (the golden file); `mcp-and-env-setup.md` supplies the MCP and env content inside §3 to §6.
>
> **When to read**: Phase 4 of `SKILL.md`, together with `page-craft.md` (components) and `routing-patterns.md` (file location).
>
> Code identifiers and `data-testid`s stay English. Visible copy uses the Q5 language, which follows the host's language signal (with no signal, Q5 asks; there is no assumed default). The Spanish strings below are the page copy for `es`, quoted as the page shows them.

---

## Header rules

- Title: `Software Testability Guide for QA` (translate it only if Q5 demands).
- Subtitle: one sentence naming the audience, manual QA and AI-driven testers working at the DB, API and UI layers.
- Root container: `data-testid="qa-page"`. Title node: `data-testid="qa-title"`.
- Build stamp under the subtitle: `data-testid="qa-build-sha"`. It shows the deployed short commit SHA, linked to the commit when a repo URL was detected, and reads it at runtime from the env var names in `qaConfig.build` (`page-craft.md`, "Build stamp"). With no SHA available the same node renders a gap line (es: `build local, sin SHA de despliegue`). The SHA never enters the page source.
- Snapshot comment at the very top of the file (`idempotency-snapshot.md`).
- Layout: an own shell with a sticky TOC and a hero, never a flat accordion list (`page-craft.md`).

---

## Section list (§1 to §7, in order)

> The numbering is canonical. `SKILL.md`, `idempotency-snapshot.md` and `security-rules.md` cite these same numbers, and publishers read the sections by name and order, so neither changes.

### §1: Credentials CTA (above the fold)

`data-testid="qa-credentials-card"`. Amber accent.

- Heading (es): `Necesitás las credenciales para hacer testing?` (the closing question mark stays; the opening one is dropped on purpose).
- One sentence: the real credentials live in `<destination>`, each value as its own snippet with a copy button.
- A prominent button opening the credentials destination in a new tab: `data-testid="qa-credentials-button"`, `target="_blank"`, `rel="noopener noreferrer"`. The href is the snapshot field `credentials-source=<URL>` (set in Phase 6). With none detected, render a gap line and no button.
- Small note: `Si no tenés acceso, pedilo a tu instructor / lead / canal de Slack.`
- Real credentials never appear here.

### §2: Architecture + Repos

`data-testid="qa-architecture-card"`, diagram `data-testid="qa-architecture-diagram"`, repos `data-testid="qa-repos"`. Slate and blue accent.

- Boxes and arrows from Frontend to API to Database, with labels from the detected stack.
- The MCP layer sits below a dashed divider: `DBHub MCP → DB`, `OpenAPI / Postman MCP → API`, `playwright-cli → UI`. The UI badge is the CLI binary, not `@playwright/mcp` (Q7).
- Repos block (requirement #5): read `backend.backend_repo` and `frontend.frontend_repo` from `.agents/project.yaml`. The same URL, or a single repo, is a monorepo (one row). Different URLs are a polyrepo (a Frontend row, a Backend row and the boundary between them). A missing value renders the gap "preguntá a tu lead".
- Optional two-column table: Tech Stack next to the data-isolation or multi-tenancy invariant (pre-flight discovers it).

### §3: The Testing Trinity + Env setup

`data-testid="qa-section-trinity"`. Cyan accent.

- Overview: the three layers and the formula `UI (Playwright) + API (OpenAPI/Postman) + DB (DBHub) = Testing Completo`. Three cards (DB, API, UI) each deep-link to §4, §5 and §6. The content comes from `mcp-and-env-setup.md` §3.
- Env setup (`data-testid="qa-env-setup"`) shows the `.env` slots (names only), the strategy-B note (configs committed, secrets in `.env`), the activation mechanisms detected (the agent opened bare, the MCP `.env` loader entries, and `bunx varlock run -- sh -c '...'` for a command that needs a value), and the warning that a var that fails to load shows up as 401/403, so the tester exits, fixes `.env` and re-enters. The content comes from `mcp-and-env-setup.md` under "Env-var strategy".

### §4: Backend testing: Database (TWO ways)

`data-testid="qa-section-database"`. Emerald accent. Two-way tabs (`data-testid="qa-db-ways"`).

- Way 1, DBHub MCP: the default that `mcp-and-env-setup.md` §4.0 resolves from `stack.database` (a Supabase app adds the read-only Supabase MCP tab for team members there). Show the committed `dbhub.toml` (`${VAR}` interpolation), the `.env` `DBHUB_*` slots, the silent-substitution warning with `env | grep DBHUB`, and the MCP config block per agent (4-agent tabs), all from `mcp-and-env-setup.md` §4.
- Way 2, connection URI (VSCode or Cursor extension): the `postgresql://…` or `sqlserver://…` string shape for the detected engine, credentials by name. It uses the same read-only QA role as Way 1.
- A callout: `Host, user, password viven en <destination>. Nunca en esta página.`
- Short generic example queries: `Mostrame todas las tablas`, `Contá las <rows> del usuario <email>`.

**DB-roles depth.** Everything here is adaptive: render only what the project has. The Supabase pooler format below is an example, so let detection decide. Read `db.roles`, `db.revokedColumns`, `db.poolerNote` and `db.rlsProbe` from the config. Each `null` or empty field omits its block and never invents one.

- Role table (`db.roles[]`): one row per detected QA role with its access summary, for example a read-only role (`SELECT` only) and, if it exists, a read-write role. Mention `BYPASSRLS` per role only when that role has it (some QA roles run under RLS on purpose). A project with one shared role gets one row.
- Column-level REVOKE callout (`db.revokedColumns[]`): when the schema revokes specific sensitive columns from the QA role (for example `*.token_hash`, `*.encrypted_password`), say those columns stay opaque even with `BYPASSRLS`, because column grants are independent of row-level security. Omit it when no such REVOKE exists.
- Pooler-port note (`db.poolerNote`): when the DB sits behind a connection pooler (Supabase, PgBouncer, RDS Proxy), document which port to use: the session pooler (for example 5432, supports long transactions and prepared statements) or the transaction pooler (for example 6543, no prepared statements). Host, user and ref come from `.env` slot names, never literals. Omit it when there is no pooler.
- Cross-tenant RLS probe (`db.rlsProbe`): when the app is multi-tenant with row-level security, give a concrete negative test: log in as user B, `SELECT` a row scoped to user A's tenant, expect 0 rows. It is the highest-value DB test a QA can run. Omit it for a single-tenant app or one without RLS.

### §5: Backend testing: API (TWO ways) + auth + docs

`data-testid="qa-section-api"`. Violet accent.

- Auth requests as Postman-style RequestCards (the default, Q8; `data-testid="qa-auth-methods"`, cards `qa-request-card`, toggle `qa-request-toggle`). One tab per detected auth request, each a read-only `RequestCard` with a verb-colored METHOD badge, URL with copy, a Headers table, Body and Response panels, and a Visual/curl toggle. The cards are filled from `api.apiRequests[]`, a structured version of the project's real auth calls (`<METHOD> <path>` placeholders, `<API_BASE_URL>`, `<see credentials source>`), never invented endpoints. Plain-curl `AuthMethods` is the Q8 fallback for a host kit that cannot render tabs or tables.
  - The tabs map to the detected methods (Supabase token, Bearer `access_token`, cookie `sb-<ref>-auth-token`, `X-API-Key`, custom JWT route).
  - Do not assume Auth.js `/api/auth/callback/credentials`. That path is the internal provider callback; if pre-flight finds only it, surface the warning from `pre-flight-discovery.md`.
  - If the only auth is passwordless, OAuth or SSO with no programmatic token issuer, raise the API testability flag (`testability-assessment.md`), render the honest "no headless token path" gap with the remediation, and never fabricate a token endpoint.
- Auth flow: the cards already show the detected `loginEndpoint` and `tokenShape`. If `bun run api:login` (or an equivalent PAT-bootstrap CLI) exists, promote it as the recommended API-auth bootstrap (`mcp-and-env-setup.md` §5). It mints the tester's own per-tester token where the testing project keeps it, never into an MCP config, and curl uses it by name, so no agent restart is needed.
- Two-way tabs (`data-testid="qa-api-ways"`):
  - Way 1, OpenAPI MCP: `--tools dynamic` is mandatory, the server is schema-read-only, and its env is `API_BASE_URL` and `OPENAPI_SPEC_PATH` only, with no token (`OPENAPI_SPEC_PATH` is the full spec URL or a repo-root-relative file). Config per agent. Tools: `list-api-endpoints`, `get-api-endpoint-schema`; authenticated calls are curl's job. From `mcp-and-env-setup.md` §5.
  - Way 2, Postman MCP: formal collection-based testing over a remote MCP with `POSTMAN_API_KEY`, config per agent.
- A link to `/api/docs` (`data-testid="qa-docs-button"`) pointing at the detected docs UI (Scalar, Redoc or Swagger) at its detected route and spec URL, never an assumed one.

### §6: Frontend testing: Playwright (scripted + agentic)

`data-testid="qa-section-ui"`. Put one id on each node: the same element does not also carry `qa-section-playwright`. Pink accent.

Two sub-blocks, stacked under `md`.

**(a) Scripted: the UI→API bridge, chosen by the detected auth shape**

Pick the variant that matches the detected auth (`pre-flight-discovery.md` and the score in `testability-assessment.md`). Many stacks are passwordless, so do not assume a login that returns a token.

- **A, token-returning login** (a password or credentials POST that responds with a token): the classic interception fixture. A Playwright test fills the login form with the host's real `data-testid`s, intercepts the detected auth endpoint through `page.waitForResponse(...)`, extracts the token (shape from detection) and reuses it through `request.newContext({ extraHTTPHeaders: { Authorization: 'Bearer …' } })`. A `test.extend<…>` fixture then yields `authToken` and `authApi`. This is the headline bridge.
- **B, passwordless, magic-link or OAuth UI** (login does not return a token synchronously): do not fake a token interception. Render two parts. First, a regression test that drives the visible flow (fill the email, submit, assert the "check your inbox" or redirect state). Second, the hybrid bridge as the headline: reuse an already-authenticated browser session cookie (for example `sb-<ref>-auth-token`) to mint a token through the detected token endpoint (for example `POST /api/.../tokens`), then call `request.newContext` with `Authorization: Bearer …`. Note inline that a first-class password and token endpoint would upgrade this from a ⚠️ hybrid to a ✅ direct path (link the `testability-assessment.md` remediation).
- **C, no programmatic token path at all** (API testability ❌): render the fixture as a template with the testability flag above it: "Auth has no headless token path. See recommendation: password login + token endpoint with expiry." Do not invent an endpoint.

After the code, add a small table of the login page's `data-testid` selectors.

> **Login selectors missing?** If the detected login flow has no stable `data-testid`s, the fixture cannot reference real selectors. Either (A) add minimal selectors to the host login component (`login-email`, `login-password` or `login-otp`, `login-submit`) as a surgical, opt-in host edit and tell the user you did it, or (B) render the fixture with placeholder selectors, an explicit "add `data-testid`s to the login first" gap, and the UI testability flag. Editing host code outside `app/qa/` is allowed only for this narrow selector case and only when you surface it to the user. With nobody at the keyboard, take (B) unless the delegating brief covers the host edit, and say in the report which one you took (`agentic-dev-core/references/decision-protocol.md`).

**(b) Agentic: playwright-cli (the default, Q7)**

Show the `playwright-cli` command cookbook (`open`, `snapshot`, `fill`, `click`, `screenshot`, `close`) and the `/playwright-cli` skill, which auto-loads on `playwright-cli` calls. It is the default agentic driver (fewer tokens, direct commands), not the Playwright MCP. Render the `@playwright/mcp` config block only when Q7 detection says the project uses the MCP (`mcp-and-env-setup.md` §"UI testing" has the cookbook and the explicit MCP fallback line). Install with `bunx playwright install`. Example prompts an AI can run:

- `abrí /login, logueate como <demo user>, sacá un screenshot del dashboard`
- `listá todos los empty states de la home`
- `reportá un bug si algún texto visible desborda su contenedor`

**Decision rule**: scripted Playwright for regression and CI; agentic `playwright-cli` for exploratory testing, bug hunting and onboarding.

### §7: Quick reference (collapsed by default)

`data-testid="qa-section-reference"`.

- Demo users: emails on the page. Shared demo accounts with intentionally public scope may show their password inline (low friction, consistent with `security-rules.md`). Real per-tester credentials stay gated in the credentials artifact and are only linked. Pre-flight and the Q answers decide the case; default to gated when unsure.
- Endpoints table: method, path and purpose, pulled from the detected OpenAPI spec.
- Troubleshooting: the most common 4xx and 5xx responses with the first thing to check, including the env-var-not-loaded restart rule.

---

## RSC vs client-component boundary (Next.js App Router, React 19, similar)

The page is a Server Component by default. `QaShell` is an async Server Component that runs `prepareQa(config)` once to highlight every snippet on the server, because Shiki is server-only (`page-craft.md`, "Server highlight pipeline"). The only `'use client'` leaves are the interactive pieces: `CopyButton`, `AgentCodeBlock`, `RequestCards`, `RequestCard` and `Toc`. `page-craft.md` has the exact file split. For Remix, Astro, SvelteKit and Vite+RR, run the highlighter at build time or in the route loader and pass html strings down.

---

## Implementation rules

- Reuse the host UI kit and icon library. The one sanctioned new dependency is the highlighter (Shiki, server-only, zero client JS), and only when the host has none (`SKILL.md` Notes and Q6). With no host `<CodeBlock>`, write the local CodeBlock, CodeFrame and CopyButton split from `page-craft.md`.
- Every interactive element gets a `data-testid` (`qa-<section>` or `qa-<element>`), one per node.
- Dark and light mirror the host (CSS vars, `dark:` variants, theme provider). Mobile-first layout and keyboard-navigable tabs follow `page-craft.md` ("Responsive + a11y"); icon-only buttons carry `aria-label`.
- Visible copy follows Q5. Code, `data-testid`s and inline tech labels (`JWT`, `Bearer`, `OpenAPI`) stay English.

---

## What does not go on the page

- Real DB passwords, API tokens, session secrets and private hostnames. They live in the credentials artifact only.
- Admin or superuser credentials, which are refused entirely (`security-rules.md`).
- Hardcoded endpoints, spec URLs or docs routes. Everything comes from `qaConfig` (detection).
- Analytics scripts, tracking pixels and new library dependencies.

Read `security-rules.md` before any publish.
