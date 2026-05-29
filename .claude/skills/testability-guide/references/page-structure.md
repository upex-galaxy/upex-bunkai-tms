# Page Structure — `/qa`

> **Purpose**: Section-by-section layout + copy for the generated page. Defines WHAT each section says; `page-craft.md` defines HOW it looks (golden file); `mcp-and-env-setup.md` supplies the MCP/env content inside §3–§6.
>
> **When to read**: Phase 4 of `SKILL.md`. Pair with `page-craft.md` (components) + `routing-patterns.md` (file location).
>
> Code identifiers + `data-testid`s stay English. Visible copy uses Q5 language (**Spanish is the default in this ecosystem** — the page is for QA; English only if no signal AND the user picks it).

---

## Header rules

- Title: `Software Testability Guide for QA` (translate only if Q5 demands).
- Subtitle: one sentence — audience is manual QA + AI-driven testers exercising the app at DB, API, and UI layers.
- Root container: `data-testid="qa-page"`. Title node: `data-testid="qa-title"`.
- Snapshot comment at the very top of the file (`idempotency-snapshot.md`).
- Layout: own shell with sticky TOC + hero — NOT a flat accordion list. See `page-craft.md`.

---

## Section list (§1–§7, in order)

> Numbering is canonical: §1–§7. Other references (`SKILL.md`, `idempotency-snapshot.md`, `security-rules.md`) cite these same numbers.

### §1 — Credentials CTA (above the fold)

`data-testid="qa-credentials-card"`. Amber accent.

- Heading (es): `¿Necesitás las credenciales para hacer testing?`
- One sentence: the real credentials live in `<destination>`; each value is its own snippet with a copy button.
- Prominent button → opens the credentials destination in a new tab. `data-testid="qa-credentials-button"`, `target="_blank"`, `rel="noopener noreferrer"`. href = snapshot field `credentials-source=<URL>` (set in Phase 6). If none detected → render a gap line, no button.
- Small note: `Si no tenés acceso, pedilo a tu instructor / lead / canal de Slack.`
- NEVER inline real credentials here.

### §2 — Architecture + Repos

`data-testid="qa-architecture-card"`, diagram `data-testid="qa-architecture-diagram"`, repos `data-testid="qa-repos"`. Slate/blue accent.

- Boxes-and-arrows: Frontend → API → Database, labels from the **detected** stack.
- MCP layer below a dashed divider: `DBHub MCP → DB`, `OpenAPI / Postman MCP → API`, `Playwright MCP → UI`.
- **Repos block** (req #5): read `backend.backend_repo` / `frontend.frontend_repo` from `.agents/project.yaml`. Same URL or single repo → **monorepo** (one row). Different → **polyrepo** (Frontend + Backend rows + the boundary). Missing → "preguntá a tu lead" gap.
- Optional 2-column table: Tech Stack | data-isolation / multi-tenancy invariant (pre-flight discovers it).
- Mobile: diagram arrows flip to vertical under `md`.

### §3 — The Testing Trinity + Env setup

`data-testid="qa-section-trinity"`. Cyan accent.

- Overview: the three layers + the formula `UI (Playwright) + API (OpenAPI/Postman) + DB (DBHub) = Testing Completo`. Three cards (DB / API / UI), each deep-links to §4 / §5 / §6. Content from `mcp-and-env-setup.md` §3.
- **Env setup** (`data-testid="qa-env-setup"`): the `.env` slots (names only), the strategy-B note (configs committed, secrets in `.env`), the activation mechanisms detected (wrapper `bun run claude`/`opencode` and/or `direnv` `.envrc`), and the critical "if a var doesn't load → 401/403 → exit, fix `.env`, re-enter" warning. Content from `mcp-and-env-setup.md` §"Env-var strategy".

### §4 — Backend testing: Database (TWO ways)

`data-testid="qa-section-database"`. Emerald accent. Two-way tabs (`data-testid="qa-db-ways"`).

- **Way 1 — DBHub MCP**: the committed `dbhub.toml` (`${VAR}` interpolation), the `.env` `DBHUB_*` slots, the silent-substitution warning + `env | grep DBHUB`, and the MCP config block per agent (4-agent tabs). All from `mcp-and-env-setup.md` §4.
- **Way 2 — Connection URI (VSCode/Cursor extension)**: the `postgresql://…` / `sqlserver://…` string shape for the detected engine, credentials by name. Same read-only QA role as Way 1.
- A callout: `Host, user, password viven en <destination>. Nunca en esta página.`
- Short generic example queries: `Mostrame todas las tablas`, `Contá las tasks del usuario <email>`.

### §5 — Backend testing: API (TWO ways) + auth + docs

`data-testid="qa-section-api"`. Violet accent.

- **Auth methods** (`data-testid="qa-auth-methods"`): one tab per DETECTED method (Supabase token / Bearer `access_token` / cookie `sb-<ref>-auth-token` / `X-API-Key` / custom JWT route). NEVER assume Auth.js `/api/auth/callback/credentials` — that path is the internal provider callback; if pre-flight only finds it, surface the warning from `pre-flight-discovery.md`. If the ONLY auth is passwordless / OAuth / SSO with no programmatic token issuer, raise the API testability flag (`testability-assessment.md`), render the honest "no headless token path" gap + the remediation, and NEVER fabricate a token endpoint.
- **Auth flow**: a small diagram + a `curl` using the **detected** `loginEndpoint` + `tokenShape`. If `bun run api:login` (or equivalent) exists, document it (writes `API_TOKEN` to `.env`; restart terminal/agent after).
- Two-way tabs (`data-testid="qa-api-ways"`):
  - **Way 1 — OpenAPI MCP**: `--tools dynamic` (mandatory), env `API_BASE_URL`/`OPENAPI_SPEC_PATH`/`API_TOKEN`, config per agent. Tools: `list-api-endpoints`, `get-api-endpoint-schema`, `invoke-api-endpoint`. From `mcp-and-env-setup.md` §5.
  - **Way 2 — Postman MCP**: formal collection-based testing; remote MCP, `POSTMAN_API_KEY`, config per agent.
- Link to `/api/docs` (`data-testid="qa-docs-button"`): the DETECTED docs UI (Scalar / Redoc / Swagger) at its DETECTED route + spec URL. Never assume.

### §6 — Frontend testing: Playwright (scripted + agentic)

`data-testid="qa-section-ui"`. (Use ONE id per node — do not also put `qa-section-playwright` on the same element.) Pink accent.

Two sub-blocks, stacked under `md`:

**(a) Scripted — the UI→API bridge (branch by DETECTED auth shape)**

Pick the variant that matches the detected auth (from `pre-flight-discovery.md` + the testability score in `testability-assessment.md`). NEVER assume a token-returning login — many stacks are passwordless.

- **A — token-returning login** (a password/credentials POST that responds with a token): the classic interception fixture. A Playwright test fills the login form using the host's real `data-testid`s, intercepts the **detected** auth endpoint via `page.waitForResponse(...)`, extracts the token (shape from detection), and reuses it via `request.newContext({ extraHTTPHeaders: { Authorization: 'Bearer …' } })`. Then a `test.extend<…>` fixture yielding `authToken` + `authApi`. Headline bridge.
- **B — passwordless / magic-link / OAuth UI** (login does NOT return a token synchronously): do NOT fake a token interception. Two parts — (1) a regression test that drives the visible flow (fill email, submit, assert the "check your inbox" / redirect state); (2) the **hybrid bridge** as the headline — reuse an already-authenticated browser session cookie (e.g. `sb-<ref>-auth-token`) to mint a token via the detected token endpoint (e.g. `POST /api/.../tokens`), then `request.newContext` with `Authorization: Bearer …`. Note inline that a first-class password+token endpoint would upgrade this from a ⚠️ hybrid to a ✅ direct path (link the `testability-assessment.md` remediation).
- **C — no programmatic token path at all** (API testability ❌): render the fixture as a TEMPLATE with the testability flag above it — "Auth has no headless token path — see recommendation: password login + token endpoint with expiry." Do NOT invent an endpoint.

After the code, a small table of the login page's `data-testid` selectors.

> **Login selectors missing?** If the detected login flow has NO stable `data-testid`s, the fixture cannot reference real selectors. Either (A) add minimal selectors to the host login component (`login-email`, `login-password`/`login-otp`, `login-submit`) as a surgical, **opt-in host edit** and tell the user you did it — OR (B) render the fixture with placeholder selectors + an explicit "add `data-testid`s to the login first" gap and raise the UI testability flag. Editing host code outside `app/qa/` is allowed ONLY for this narrow selector case, and only when surfaced to the user — never silently.

**(b) Agentic — Playwright CLI / MCP**
The `@playwright/mcp` config block (detected caps) + the `/playwright-cli` skill. Install: `bunx playwright install`. Example prompts an AI can run:
- `abrí /login, logueate como <demo user>, sacá un screenshot del dashboard`
- `listá todos los empty states de la home`
- `reportá un bug si algún texto visible desborda su contenedor`

**Decision rule**: scripted Playwright for regression / CI; agentic Playwright CLI for exploratory + bug-hunting + onboarding.

### §7 — Quick reference (collapsed by default)

`data-testid="qa-section-reference"`.

- **Demo users**: emails on the page. Passwords policy: **shared demo accounts with intentionally-public scope MAY show their password inline** (low-friction practice — consistent with `security-rules.md`); **real per-tester credentials are gated** in the credentials artifact and only linked. Pre-flight + Q-context decides which case applies; default to gated when unsure.
- **Endpoints table**: method, path, purpose — pulled from the detected OpenAPI spec.
- **Troubleshooting**: most common 4xx/5xx + first thing to check (incl. the env-var-not-loaded → restart rule).

---

## RSC vs client-component boundary (Next.js App Router, React 19, similar)

The page is a Server Component by default. Anything using `useState`/`useEffect`/`onClick` (CodeBlock copy, Tabs, TOC active-section) lives in a `'use client'` sibling under `app/qa/_components/` and is imported into the Server `page.tsx`. shadcn/ui Tabs/Accordion ship `'use client'` already, so they can be imported directly. See `page-craft.md` for the exact file split. For Remix/Astro/SvelteKit/Vite+RR this RSC rule does not apply — use the framework's normal interactivity pattern.

---

## Implementation rules

- Reuse host UI kit + icon library. Never add a dep. No host `<CodeBlock>` → write the minimal local one in `page-craft.md` (copy button → check icon for 2 s).
- Every interactive element gets a `data-testid` (`qa-<section>` / `qa-<element>`), ONE per node.
- Dark/light: mirror the host (CSS vars, `dark:` variants, theme provider). Per-domain accent hues all have `dark:` variants.
- Responsive: mobile-first. TOC rail, diagram, two-way/agent tabs, demo-user table all degrade gracefully under `md`/`lg`.
- A11y: tabs/accordions keyboard-navigable, semantic headings, icon-only buttons `aria-label`.
- Language: visible copy = Q5 (Spanish default). Code, `data-testid`s, inline tech labels (`JWT`, `Bearer`, `OpenAPI`) stay English.

---

## What NOT to put on the page

- Real DB passwords, API tokens, session secrets, private hostnames → credentials artifact only.
- Admin / superuser credentials → refused entirely (`security-rules.md`).
- Hardcoded endpoints / spec URLs / docs routes → everything comes from `qaConfig` (detection).
- Analytics scripts, tracking pixels, new library dependencies.

Cross-reference `security-rules.md` before any publish.
