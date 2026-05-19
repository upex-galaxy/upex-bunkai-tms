# Page Structure — `/qa`

> **Purpose**: Section-by-section layout for the generated page. Code identifiers + `data-testid`s stay English. Visible copy mirrors the host language (English when no signal).
>
> **When to read**: Phase 4 of `SKILL.md`. Pair with `routing-patterns.md` for the framework-specific file location.

---

## Header rules

- Title: `Software Testability Guide for QA` (translate only when Q5 demands it).
- Subtitle: one sentence about the audience — manual QA + AI-driven testers exercising the app at DB, API, and UI layers.
- Root container: `data-testid="qa-page"`.
- Snapshot comment at the very top of the file. See `idempotency-snapshot.md` for the exact format.

---

## Section list (in order)

### 1. Credentials CTA — above the fold

Bordered card or banner. `data-testid="qa-credentials-card"`.

- Heading: `¿Necesitás las credenciales para hacer testing?` (or English equivalent).
- One sentence pointing at the destination: `The real credentials live in <destination>. Each value lives in its own snippet with a copy button.`
- Prominent button → opens the credentials destination in a new tab.
  - `data-testid="qa-credentials-button"`
  - `target="_blank"`, `rel="noopener noreferrer"`
  - href is read from the snapshot field `credentials-source=<URL>` (set during publish in Phase 6).
- Small note: `If you don't have access, ask your instructor / lead / Slack channel #X.`
- NEVER inline real credentials here.

### 2. Architecture

- Boxes-and-arrows diagram: Frontend → API → Database. Labels use the detected stack (e.g. `Next.js 15`, `Auth.js v5`, `Supabase Postgres`, `Drizzle`).
- Mobile-first responsive: under `md`, the diagram collapses to a vertical stack.
- 2-column table: Tech Stack | Multi-tenancy / data-isolation model (or any equivalent invariant the app enforces — pre-flight discovers it).
- Mention which MCPs are relevant (DBHub for DB, OpenAPI MCP for API). If the host has a different MCP for one of these, swap the name — never invent.
- Container: `data-testid="qa-architecture-card"`.

### 3. Backend testing — Database (DBHub MCP)

`data-testid="qa-section-database"`. Accordion or section, collapsed by default if the host UI kit supports it.

- Prerequisites bullet list.
- A callout that points to the credentials source: `Host, user, password live in <destination>. Never on this page.`
- Step 1 — create `dbhub.toml` with placeholders. Use the literal token `<see credentials source>` in place of any real value.
- Step 2 — add the MCP entry to `.mcp.json` (or the editor-specific equivalent the host already uses).
- Step 3 — smoke-test the connection.
- Short example queries — `Show me all users`, `Count tasks for <email>`. Keep them generic.

### 4. Backend testing — API (OpenAPI MCP)

`data-testid="qa-section-api"`.

- Explain that OpenAPI MCP reads the spec and exposes one tool per endpoint.
- Step 1 — JWT acquisition. `curl` example using the **detected login endpoint** from pre-flight (the "Login endpoint path" row in `pre-flight-discovery.md`). Do NOT hardcode a path. Common detection results:
  - Auth.js v5 (`@auth/core` / `next-auth` v5): typically a **custom** `app/api/login/route.ts` or `/api/auth/signin/credentials` that the team wrote. The `/api/auth/callback/credentials` path is Auth.js's INTERNAL provider callback — calling it externally with a JSON body is not the right shape. If pre-flight only finds the callback path, surface a warning: the host project does not expose a public credentials login endpoint; testers need either a custom login route OR client-side `signIn('credentials', {...})` via the Auth.js SDK.
  - Clerk: `/v1/client/sign_ins`.
  - Supabase Auth: `/auth/v1/token?grant_type=password`.
  - Custom: whatever the team wrote.

  Body uses the env-aware URL plus placeholder user / password (`<see credentials source>`).

- Step 2 — use the token in `Authorization: Bearer …`.
- Step 3 — configure OpenAPI MCP in `.mcp.json` with `OPENAPI_SPEC_PATH` pointing at the project's spec.
- Link to Swagger UI if the host serves one (pre-flight detected `/api/docs` or similar).

### RSC vs client-component boundary (Next.js 15 App Router, React 19, similar frameworks)

The page itself is a Server Component by default. Anything that uses `useState`, `useEffect`, `onClick` handlers, or any client-only hook MUST live in a sibling client component.

Concretely for the host UI kit's `<CodeBlock>` (which has a copy button → needs `useState` to flip the icon to a checkmark for 2 s):

- **DO** put the `CodeBlock` in `app/qa/_components/CodeBlock.tsx` with `'use client'` at the top, then import it into `app/qa/page.tsx` (Server Component).
- **DO NOT** inline a `useState`-using `CodeBlock` directly inside `app/qa/page.tsx` and then forget `'use client'` — Next.js will throw a `You're importing a component that needs useState. It only works in a Client Component …` error at runtime.
- For Accordion / Tabs / Collapsible primitives from shadcn/ui (or any other UI kit), check whether the kit's component is already marked `'use client'`. shadcn/ui ships them as client components, so the page can import them directly. Some headless kits ship server-compatible primitives — verify before scaffolding.
- For frameworks without an RSC boundary (Remix, Astro `client:load`, SvelteKit, Vite+RR), this rule does not apply — use the framework's normal interactivity pattern.

A safe minimal layout for Next.js App Router:

```
app/qa/
├── page.tsx                   # Server Component (the page itself, all static markup)
└── _components/
    ├── CodeBlock.tsx          # 'use client' — copy button state
    └── Accordion.tsx          # if you wrote your own; shadcn's already 'use client'
```

When the skill detects Next.js App Router during pre-flight, it scaffolds this structure automatically. For other frameworks, it produces a single page file.

### 5. Frontend testing — Playwright (scripted)

`data-testid="qa-section-ui"` and `data-testid="qa-section-playwright"`.

Two sub-sections, stacked vertically on small screens:

**(a) JWT interception during UI login**

Complete Playwright test. Fills the login form using the host's real `data-testid`s, intercepts the response of the real auth endpoint, stores the JWT for downstream API calls. Reuses host `data-testid` conventions detected in pre-flight.

**(b) Reusable fixture**

A `test.extend<…>` fixture that yields `authToken` and `authApi` (a `request.newContext` with the `Authorization` header pre-set). Lets other test files do `import { test } from './fixtures/auth'` and get authenticated context immediately.

After the code, a small table of the login page's available `data-testid` selectors.

### 6. Frontend testing — Playwright CLI (agentic)

`data-testid="qa-section-playwright-cli"`.

- One paragraph: what the Playwright CLI is, when to prefer it (AI agent performs exploration itself, rather than writing `.spec.ts` files).
- Steps: `bunx playwright install` (or the host runtime's equivalent), reference the official Playwright MCP server or skill, then a few example prompts an AI can run:
  - `open /login, log in as <demo user>, take a screenshot of the dashboard`
  - `list every empty state on the home page`
  - `report a bug if any visible text overflows its container`
- Decision rule: **scripted Playwright** for regression / CI; **Playwright CLI agentic** for exploratory + bug-hunting + onboarding sessions.

### 7. Quick reference — collapsed by default

`data-testid="qa-section-reference"`.

- Demo user table — **emails only** on the page. Passwords are NEVER on the page (even for "public" demo accounts). Passwords live in the credentials artifact (the published Epic / Confluence / Notion page), gated by the destination's permission model. The page links out to that artifact for the passwords. This rule is consistent with `credentials-content-template.md` (passwords appear there only as `<see secrets store>` placeholders) and `security-rules.md` (no inline credentials on the page).
- Endpoints table: method, path, short purpose. Pulled from the detected OpenAPI spec when one exists.
- Troubleshooting: most common 4xx / 5xx responses + the first thing to check.

---

## Implementation rules

- Reuse host UI kit + icon library. Never add a new dep. If the host has no `<CodeBlock>`, write a minimal local one with a copy button (becomes a check icon for 2 s after click).
- Every interactive element gets a `data-testid`. The convention: `qa-<section-name>` or `qa-<element-name>`.
- Dark mode: mirror the host's existing patterns (CSS variables, `dark:` Tailwind variants, or theme provider).
- Responsive: mobile-first. The architecture diagram, the side-by-side Playwright code blocks, and the demo-user table all collapse to vertical under `md`.
- Accessibility: accordions are keyboard-navigable, headings are semantic, icon-only buttons have `aria-label`.
- Language: visible copy uses the language from Q5. Code, `data-testid`s, and inline tech labels (`JWT`, `Bearer`, `OpenAPI`) stay English.

---

## What NOT to put on the page

- Real DB passwords, API tokens, session secrets — they live in the credentials artifact, not here.
- Private hostnames (e.g. `<random>.upexgalaxy.com`-shaped) — they live in the credentials artifact, not here.
- Admin / superuser credentials — refused entirely.
- Analytics scripts or tracking pixels.
- New library dependencies.

Cross-reference `security-rules.md` before any publish.
