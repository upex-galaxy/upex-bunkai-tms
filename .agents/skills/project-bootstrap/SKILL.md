---
name: project-bootstrap
description: 'Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system, project skeleton, routing), and incremental features (OpenAPI/Scalar UI, API routes + middleware, bearer-token auth, env vars + URL builders, Supabase types generation). The base phases (backend + frontend) are GREENFIELD-ONLY: on a repo that already holds an application (`bun run bootstrap:guard`: adoption lock, app `package.json`, app files) they refuse and route to `/project-adoption`; the add-on phases stay available and read the `stack:` block. Triggers on: `scaffolding del proyecto`, `setup del backend`, `inicializar el frontend`, `configurar OpenAPI`, `API routes setup`, `bearer token authentication`, `env vars setup`, `supabase types generation`, `infrastructure setup`, `backend skeleton`, `frontend boilerplate`. Do NOT use for: product definition (use `/project-foundation`), backlog seeding (use `/product-management`), per-story development (use `/sprint-development`), unit testing (use `/unit-testing`), test framework setup (out of scope), teaching the agentic layer an existing app (use `/project-adoption`), or recording the design identity of an existing app (use `/design-system extract`).'
license: MIT
compatibility: [claude-code, codex, opencode]
phase: foundation
complementary_categories:
  - frontend-framework
  - frontend-ui
  - backend-db
  - language
  - ci-cd
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the "Anti-patterns" section in the body below.
compact_rules: |
  - **B0. BROWNFIELD GUARD (fail-closed).** Run `bun run bootstrap:guard` at entry, before the session plan, and record its verdict + exit code in `plan.md`. Exit 2 (`existing-app`: adoption lock, an app `package.json`, or app files) → REFUSE the base phases (backend setup, frontend setup: tables, RLS, seed, clients, `middleware.ts` / `proxy.ts`, layout, theme, `tailwind.config`, `shadcn init`, `next@latest`, README, demo pages, demo credentials), quote the signals, route to `/project-adoption` (design identity → `/design-system extract`). The add-on phases stay available and read `stack:`. A base phase runs only on a plan that recorded exit 0; no recorded verdict = refused. Never override the verdict by reading the tree yourself.
  - **B1.** NEVER collapse the scaffold architecture layers (`api/` / `schemas/` / `db/` boundaries in backend, design-system structure in frontend). That structure is framework architecture, not speculative abstraction — AGENTS.md §2 SIMPLICITY FIRST exempts it.
  - **B2.** NEVER skip env-var validation (Zod or equivalent schema check at boot). Silent missing env vars cause cryptic prod failures far from the root cause.
  - **B3.** NEVER clobber existing scaffolding (B0 refuses the base phases on an existing app; this rule binds the add-ons and a resumed greenfield run). Detect prior state under `app/`, `lib/`, `db/` and apply UPSERT semantics — patch surgically, preserve user edits.
  - **B4.** NEVER hardcode credentials, URLs, or env-specific values in scaffolded code. They belong in `.env` (secrets) + `.agents/project.yaml` (non-secret config).
  - **B5.** NEVER scaffold the frontend before `DESIGN.md` exists at repo root. Design tokens are the input contract for Phase 2 — run `/design-system` first. NEVER emit `tailwind.config` / `globals.css` / CSS variables over an app's existing theme: an existing design identity is recorded by `/design-system extract`, never replaced.
  - **B6.** NEVER skip Supabase types generation when scaffolding the DB layer. Runtime TypeScript types must match the live schema; drift is a silent bug factory.
  - **B7.** NEVER ship bearer-token auth without rate-limiting + secret-rotation guidance in the same scaffold. Auth without those two is a half-finished feature.
  - **B8.** NEVER scaffold OpenAPI without the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler). The contract surface must be browsable from day one or downstream consumers won't trust it. Do NOT ship Redoc/Swagger instead — Scalar is the standard for this stack. On an existing app that already serves its own docs UI, that UI stays; Scalar is added beside it only on the user's OK, never as a replacement.
  - **B9.** NEVER write the DB layer or the UI layer without its stack skills loaded first: `supabase` + `supabase-postgres-best-practices` before any install, DB-MCP schema / RLS / migration call or type generation; the design set (`frontend-design` + `ui-ux-pro-max` + `impeccable` + `emil-design-eng`, strategy doc §3.5) + `shadcn` + `tailwind-css-patterns` before the component strategy (Fase 1.6). Not installed → say so once, point at `bun setup`, continue; never a silent skip (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
  - **B10.** Database changes go through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: `list_migrations` read before the first write, DDL only through `apply_migration`, the route per `stack.database.migrations_tool`, verified at the destination, an ADR for an architecturally significant migration.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).
metadata:
  kind: workflow
  stage_owner: true
  requires_capabilities: [library-docs, db]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Project Bootstrap — Infrastructure scaffolding

`project-bootstrap` scaffolds the codebase foundation: it turns the product specs produced by `/project-foundation` into a working backend + frontend with the integration plumbing wired in. Where `project-foundation` answers "what are we building", this skill answers "now stand up the repo so we can start building it".

It is invoked once per project, after the PRD / SRS / API contract exist, and before any user story is implemented.

**Greenfield only for the base phases.** Backend setup and frontend setup only create: tables, RLS, seed rows, Supabase clients, `middleware.ts`, the root layout, the theme, `shadcn init`, framework installs, README, demo pages. On a repo that already holds an application every one of those steps overwrites or upgrades something live, so they refuse there (see "Entry gate" below) and the work routes to `/project-adoption`, the skill that teaches the agentic layer an existing app. The incremental add-ons stay available on an existing app and read its `stack:` block.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md` — used when dispatching scaffolding subagents (backend, then frontend).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-bootstrap/`, archive on completion.
- `agentic-dev-core/references/db-change-doctrine.md` — how every database change in this skill goes through the DB MCP (history read first, `apply_migration` for DDL, verify, ADR when significant).

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any phase below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`frontend-framework`, `frontend-ui`, `backend-db`, `language`, `ci-cd`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. For each matched skill, classify tier per strategy doc §2 (path-based: `.agents/skills/` → T1; PROJECT_LEVEL_SKILLS → T3; USER_LEVEL_SKILLS → T4).
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this bootstrap? Y/N"`. Cache the answer for the session.
5. When dispatching scaffolding sub-agents (Backend setup, Frontend setup, Incremental features), inject a `## Composable Skills` block per strategy doc §5.2 listing the resolved skills + project standards (test command, runtime, etc).

Expected matches on a Next.js + Supabase project (illustrative — actual list depends on what the user has installed):

| Category             | Likely matches                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-framework` | `next-cache-components-adoption`, `next-cache-components-optimizer` (Next.js reference docs: `[DOCS_TOOL]`)                                                        |
| `frontend-ui`        | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` (T3) |
| `backend-db`         | `supabase`, `supabase-postgres-best-practices` (REQUIRED at the backend and types steps, not only matched: §3.5 of the strategy doc)                               |
| `language`           | `typescript-advanced-types`                                                                                                                                        |
| `ci-cd`              | `github-actions-docs`                                                                                                                                              |

**Step-required, not only matched.** Some of these load at a named step whatever the entry scan decided (`agentic-dev-core/references/skill-composition-strategy.md` §3.5): `supabase` + `supabase-postgres-best-practices` in `references/backend-setup.md` (before install and any DB-MCP call) and `references/supabase-types-setup.md` (generate step); the design set (`frontend-design` + `ui-ux-pro-max` + `impeccable` + `emil-design-eng`, strategy doc §3.5) + `shadcn` + `tailwind-css-patterns` in `references/frontend-setup.md` Fase 1.6.

Skip step only if neither the session skill list nor the `.agents/skills/` folder can be read. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

---

## When to use

Use this skill when:

- A fresh repo has its product foundation (`/project-foundation` already ran) but no code yet: base phases + add-ons.
- An existing repo needs an incremental infrastructure feature added (e.g. "add OpenAPI to the API", "add bearer auth", "wire Supabase types into the frontend"): add-ons only, reading the `stack:` block.

Do NOT use this skill to:

- Define the product (PRD, user journeys, architecture decisions) — that's `/project-foundation`.
- Seed the Jira backlog with epics + user stories — that's `/product-management`.
- Implement an individual user story (planning → code → review → deploy) — that's `/sprint-development`.
- Set up a unit-test framework — that's `/unit-testing` (and is its own concern).
- Run the backend or frontend base phase on an app that already exists — that's `/project-adoption` (the agentic layer learns the app as it is), and `/design-system extract` for its design identity.

The infrastructure choices below flow from the SRS architecture decisions made during `/project-foundation`. If `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, or `{{DB_TYPE}}` are unset in `.agents/project.yaml`, run `/project-foundation` first. If `.agents/project.yaml` itself is missing, the tooling was never installed: `create-agentic-dev` for a new project, the updater's `--adopt` run for an existing app (`INSTALLER.md`).

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a project-bootstrap workflow. Read in order; stop earlier when the workflow is small enough that later inputs add no signal.

1. `.context/PRD/` — outputs from `/project-foundation`. Feature inventory + MVP scope drive what to scaffold.
2. `.context/SRS/` — outputs from `/project-foundation`. Infrastructure decisions (DB, hosting, auth provider, runtime).
3. `DESIGN.md` (repo root) — design system + tokens. Required input for the frontend scaffold; must exist before Phase 2.
4. `.agents/project.yaml` — project identity, env URLs, stack vars (`{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}`).
5. Existing scaffolding under `app/`, `lib/`, `db/` (if present) — detect prior state and UPSERT surgically; do NOT clobber.
6. `.agents/project.yaml` → `stack:` — where the app lives (`stack.app_root`), its package manager, its script NAMES, its schema source and migration tool, its types path. The add-ons resolve every path and command through it (Phase 3).

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 0.5 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-bootstrap/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

## Entry gate — brownfield guard (MANDATORY, inline)

The base phases run only on a repo with no application yet. The verdict comes from a script, never from the agent reading the tree, because a gate the gated agent can satisfy by writing a plausible value is no gate (`AGENTS.md` §3, gate design):

```bash
bun run bootstrap:guard   # exit 0 = greenfield · exit 2 = existing app (signals listed) · --json for the same as JSON
```

Signals (`cli/lib/bootstrap-guard.ts`; any one is enough): the adoption lock (`.template/installer.lock.json` records `adopted: true`), a `package.json` declaring `next` or `react` at the repo root, at the declared `stack.app_root` or under `apps/*` / `packages/*`, or app files under that root (a route tree, `middleware` / `proxy`, a Tailwind config, `components.json`, a migration directory holding files).

| Verdict | Base phases (backend, frontend) | Add-ons (Phase 3) |
|---|---|---|
| exit 0, `greenfield` | run as written | run as written |
| exit 2, `existing-app` | **REFUSED.** Quote the signals, name what the phase would have overwritten, route to `/project-adoption` (and `/design-system extract` when the request was about the UI's look) | available, reading `stack:` |

**When it runs.** Once, at entry, in the same turn as Phase 0: after Phase 0 finds no prior session, or the user picks restart. Its verdict and exit code go into `plan.md` → `## Inputs` (`Bootstrap guard: greenfield, exit 0, <date>`). A RESUMED run keeps the verdict its plan recorded, because by then the app the guard would see is this skill's own output; a restart keeps the verdict the archived plan recorded for the same reason, and a run with no prior plan runs the guard fresh. A base-phase reference read with no plan at all (a standalone "set up the frontend" request, a subagent briefed with one reference) runs the guard itself first.

**Fail-closed.** No recorded verdict, an unreadable one, or one with no exit code = the base phases are refused. The user may not waive the guard by asserting "this is greenfield"; the fix for a wrong `existing-app` reading is to remove the signal the script quoted (or, for a leftover adoption lock, to correct the lock), then rerun the script.

## Phase 0 — Resume check (MANDATORY, inline)

Before any subagent dispatch and before invoking any phase below, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/project-bootstrap/progress.md` exists.
2. If it does NOT exist → proceed to Phase 0.5 (write `plan.md`).
3. If it DOES exist:
   1. Read `.session/project-bootstrap/plan.md` in full.
   2. Read the tail of `.session/project-bootstrap/progress.md` (last ~3 phase entries).
   3. Surface to the user: plan Goal (one sentence), last completed phase + timestamp, next planned phase, any blocking notes.
   4. Offer three options and WAIT for input: **resume** (jump to the next planned phase) / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-project-bootstrap-project-aborted/`, then proceed to Phase 0.5 fresh) / **abort** (leave directory untouched, stop).

Phase 0 is inline — no subagent dispatch. Runs even on first invocation so resume-vs-fresh is deterministic.

## Phase 0.5 — Write `plan.md`

After Phase 0 confirms no prior session exists, write `.session/project-bootstrap/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6. The plan must list which incremental features the user wants on top of the base backend + frontend:

- Frontmatter: `topic_key: session/project-bootstrap/project/plan`, `skill: project-bootstrap`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` (SRS architecture path, stack vars, DESIGN.md path, and the `Bootstrap guard:` line from the entry gate) · `## Approach` · `## Phase breakdown` (Phase 1 Backend, then Phase 2 Frontend, as Sequential subagents; Phase 3 lists chosen incremental features from `openapi-setup` / `api-routes-setup` / `bearer-token-support` / `env-url-setup` / `supabase-types-setup`, with dispatch pattern per row) · `## Risks & open questions` · `## Verification checklist` · `## Cross-references`.

Dispatch: inline drafting by the orchestrator is normal — inputs (SRS + `.agents/project.yaml` + DESIGN.md) are small. A Single planner subagent is only warranted when the SRS is unusually large.

After `plan.md` is written and the user approves the chosen incremental features, transition `status: draft → approved` in the frontmatter and proceed to Phase 1.

## Phase walkthrough

Bootstrap is split into a base layer (backend first, then frontend) and an incremental layer (composable features, run on demand).

> **Progress checkpoint**: Phases 1 (Backend) and 2 (Frontend) are dispatched as a Sequential pair; the orchestrator writes one `progress.md` entry after each subagent returns. Each incremental feature in Phase 3 gets its own checkpoint entry on completion. All checkpoints follow `agentic-dev-core/references/session-management.md` §7.

### 1. Backend setup

Stands up the API service: database schemas, ORM/migrations, base API entry point, shared TypeScript types, error handling skeleton, structured logging, environment configuration. Establishes the conventions every future endpoint will follow.

Read `references/backend-setup.md` for the full procedure: stack detection, DB schema generation from the SRS, base middleware, type pipeline, and verification.

Pre-requisite: SRS architecture (`/project-foundation` output) defines the tech stack, and the entry gate recorded `greenfield`.

Every schema, RLS, seed or function change in this phase goes through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: load the Supabase skills, read `list_migrations` before the first write, DDL only through `apply_migration`, verify each change at the destination, and record an ADR for an architecturally significant one (the foundational schema and its RLS model usually are).

### 2. Frontend setup

Stands up the client app: framework scaffolding (Next.js / Vite / etc.), design system selection driven by the brand personality from the PRD, project structure, routing skeleton, state management baseline, content writing patterns, and integration with backend types.

Read `references/frontend-setup.md` for the full procedure: brand-aware design system bootstrapping, page skeletons, content patterns, and backend-type integration.

Pre-requisite: the entry gate recorded `greenfield`. This phase writes the theme from `DESIGN.md` (`tailwind.config`, `globals.css`, the shadcn CSS variables); it never runs over an app that already has a design identity. That identity is recorded as it is by `/design-system extract`, and nothing here replaces it.

### 3. Incremental feature scaffolding

Each of the following layers in a single capability on top of the base backend + frontend. They are independent — pick the ones the project needs, skip the rest, run them in any order after the base is in place.

**On an existing app (entry gate `existing-app`)** the add-ons run against what the app already is, read from `.agents/project.yaml` → `stack:` (contract: `.agents/README.md` → `stack`):

- Every literal path in a reference (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) is the greenfield default. Resolve it under `{{stack.app_root}}`; the generated types file is `{{stack.database.types_path}}`, and the Pages Router (`stack.framework: nextjs-pages`) keeps its API under `pages/api/`.
- An app command is `{{stack.package_manager}} run <script>` with the script NAME from `stack.scripts`; a null script is skipped and said so, never invented. Dependencies install with that package manager, never by switching it.
- What the app already has wins: an existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by an add-on. A conflict is surfaced to the user with both shapes.
- The Supabase project ref is `environments.<env>.db_project_ref`; a database touch follows `agentic-dev-core/references/db-change-doctrine.md`.

- **OpenAPI integration** → `references/openapi-setup.md`. Schema generation (Zod → OpenAPI), Scalar UI at `/api/docs` (route handler), contract publication.
- **API routes + middleware** → `references/api-routes-setup.md`. Route conventions, error responses, request logging, auth middleware wiring.
- **Bearer-token auth** → `references/bearer-token-support.md`. JWT issuance, refresh tokens, protected-route middleware, session handling.
- **Env vars + URL builders** → `references/env-url-setup.md`. Typed `.env` schema, environment-aware URL helpers, validation at boot.
- **Supabase types generation** → `references/supabase-types-setup.md`. DB schema → TypeScript types pipeline, regeneration script, frontend wiring.

---

## Specific tasks — which reference to read

| User intent                                                          | Read                                 |
| -------------------------------------------------------------------- | ------------------------------------ |
| "setup the backend" / "DB + API boilerplate" / "scaffold the server" | `references/backend-setup.md`        |
| "setup the frontend" / "design system + project skeleton"            | `references/frontend-setup.md`       |
| "add OpenAPI" / "Swagger" / "Scalar" / "API docs UI"                 | `references/openapi-setup.md`        |
| "API routes" / "route conventions" / "middleware"                    | `references/api-routes-setup.md`     |
| "bearer auth" / "JWT" / "refresh tokens" / "protect routes"          | `references/bearer-token-support.md` |
| ".env vars" / "URL builder" / "environment config"                   | `references/env-url-setup.md`        |
| "Supabase types" / "DB schema → TS" / "type generation pipeline"     | `references/supabase-types-setup.md` |

If the user intent does not match a row, fall back to `references/backend-setup.md` or `references/frontend-setup.md` depending on which side of the stack the request touches, and surface in the report that no exact match was found.

---

## Subagent dispatch

Backend and frontend setup are **sequential**: the frontend pre-flight (`references/frontend-setup.md`) reads `src/types/supabase.ts` and the Supabase clients that `references/backend-setup.md` produces, and stops when they are missing. Dispatch backend, then frontend, with the sequential pattern from `agentic-dev-core/references/dispatch-patterns.md`.

Incremental features are usually **sequential after the base** but independent from each other:

- After base backend exists → `openapi-setup`, `api-routes-setup`, `bearer-token-support`, `env-url-setup` can each run in their own subagent.
- After base frontend exists → `supabase-types-setup` wires backend types into the frontend.

Briefings for each subagent must follow the 7-component template in `agentic-dev-core/references/briefing-template.md`. Each briefing should cite the specific reference file the subagent must read.

---

## Hand-offs

After bootstrap completes, the project is ready for:

- **Backlog seeding** → `/product-management`. Turns the PRD into Jira epics + user stories with acceptance criteria.
- **Per-story development** → `/sprint-development`. The planning → implementation → review → deploy loop for each user story.
- **Unit testing setup** → `/unit-testing` (separate concern, can run any time after base scaffolding).
- **QA testability page + credentials artifact** → `/testability-guide` (optional). Once infra is live, generates the in-app `/qa` page + a tool-agnostic credentials artifact (Jira Epic / Confluence / Notion / MCP / CLI / manual paste) so QA testers and AI agents can exercise the app at DB / API / UI layers. Idempotent re-runs on stack drift.

The bootstrap output is **not** ready for production — it is ready for feature work. Production-readiness gates (deployment, CI, observability hardening) are layered on by later skills as the product matures.

---

## Verification

After running any phase, confirm:

- The app's build exits 0: `{{stack.package_manager}} run {{stack.scripts.build}}` (on a greenfield run, the script the base phases just created).
- The dev server starts and the home page (frontend) / health route (backend) responds.
- TypeScript compiles with no errors across the whole monorepo or split repos.
- New env vars are documented in `.env.example`.
- Generated artefacts (OpenAPI schema, Supabase types) are committed. The references never commit on their own: they recommend the commit and the user (or `/git-flow-master`) makes it.
- The `stack:` block of `.agents/project.yaml` describes the app that now exists: run `bun run agents:setup --stack` (detects it from the scaffolded repo, one prompt per field that differs from the shipped greenfield defaults) and keep `bun run setup:doctor` free of stack drift. Block contract: `.agents/README.md` → `stack`.

If any check fails, surface the failure in the report rather than papering over it. Do not invent fixes for unfamiliar stacks — ask the user.

On successful completion (Verification checklist from `plan.md` passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/project-bootstrap/` to `.session/.archive/<YYYY-MM-DD>-project-bootstrap-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back.

---

## Anti-patterns — NEVER do these

- **B0. BROWNFIELD GUARD (fail-closed).** Run `bun run bootstrap:guard` at entry, before the session plan, and record its verdict + exit code in `plan.md`. Exit 2 (`existing-app`: adoption lock, an app `package.json`, or app files) → REFUSE the base phases (backend setup, frontend setup: tables, RLS, seed, clients, `middleware.ts` / `proxy.ts`, layout, theme, `tailwind.config`, `shadcn init`, `next@latest`, README, demo pages, demo credentials), quote the signals, route to `/project-adoption` (design identity → `/design-system extract`). The add-on phases stay available and read `stack:`. A base phase runs only on a plan that recorded exit 0; no recorded verdict = refused. Never override the verdict by reading the tree yourself.
- **B1.** NEVER collapse the scaffold architecture layers (`api/` / `schemas/` / `db/` boundaries in backend, design-system structure in frontend). That structure is framework architecture, not speculative abstraction — AGENTS.md §2 SIMPLICITY FIRST exempts it.
- **B2.** NEVER skip env-var validation (Zod or equivalent schema check at boot). Silent missing env vars cause cryptic prod failures far from the root cause.
- **B3.** NEVER clobber existing scaffolding (B0 refuses the base phases on an existing app; this rule binds the add-ons and a resumed greenfield run). Detect prior state under `app/`, `lib/`, `db/` and apply UPSERT semantics — patch surgically, preserve user edits.
- **B4.** NEVER hardcode credentials, URLs, or env-specific values in scaffolded code. They belong in `.env` (secrets) + `.agents/project.yaml` (non-secret config).
- **B5.** NEVER scaffold the frontend before `DESIGN.md` exists at repo root. Design tokens are the input contract for Phase 2 — run `/design-system` first. NEVER emit `tailwind.config` / `globals.css` / CSS variables over an app's existing theme: an existing design identity is recorded by `/design-system extract`, never replaced.
- **B6.** NEVER skip Supabase types generation when scaffolding the DB layer. Runtime TypeScript types must match the live schema; drift is a silent bug factory.
- **B7.** NEVER ship bearer-token auth without rate-limiting + secret-rotation guidance in the same scaffold. Auth without those two is a half-finished feature.
- **B8.** NEVER scaffold OpenAPI without the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler). The contract surface must be browsable from day one or downstream consumers won't trust it. Do NOT ship Redoc/Swagger instead — Scalar is the standard for this stack. On an existing app that already serves its own docs UI, that UI stays; Scalar is added beside it only on the user's OK, never as a replacement.
- **B9.** NEVER write the DB layer or the UI layer without its stack skills loaded first: `supabase` + `supabase-postgres-best-practices` before any install, DB-MCP schema / RLS / migration call or type generation; the design set (`frontend-design` + `ui-ux-pro-max` + `impeccable` + `emil-design-eng`, strategy doc §3.5) + `shadcn` + `tailwind-css-patterns` before the component strategy (Fase 1.6). Not installed → say so once, point at `bun setup`, continue; never a silent skip (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- **B10.** Database changes go through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: `list_migrations` read before the first write, DDL only through `apply_migration`, the route per `stack.database.migrations_tool`, verified at the destination, an ADR for an architecturally significant migration.

---

## Notes

- Each "incremental feature" reference is composable — the project does not need all of them. Pick by need, skip the rest.
- This skill consumes `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}` from `.agents/project.yaml`. If unset, run `/project-foundation` first. If `.agents/project.yaml` itself is missing, install the tooling first (`create-agentic-dev` for a new project, the updater's `--adopt` run for an existing app).
- For scaffolding subagents (backend, then frontend), dispatch via the briefing template in `agentic-dev-core/references/briefing-template.md`.
- The references are written in Spanish in some sections (preserved from the original prompts). The skill orchestrator (this file) is in English; subagents should mirror the user's language when reporting results.
