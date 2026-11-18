---
name: project-bootstrap
description: "Scaffolds a new project's backend and frontend, plus API add-ons, once the PRD and SRS exist. Use when standing up the repo before stories start; adding OpenAPI, API routes, bearer auth, env URLs or Supabase types later. Refuses an existing app: that is /project-adoption."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation
complementary_categories:
  - frontend-framework
  - frontend-ui
  - backend-db
  - language
  - ci-cd
# compact_rules is read verbatim by scripts/build-skill-registry.ts (frontmatter first, no
# truncation). It is the only copy of the B0 to B10 rules; the body points here and the
# references cite them by code.
compact_rules: |
  - **B0. Brownfield guard (fail-closed).** Run `bun run bootstrap:guard` at entry, before the session plan, and record its verdict and exit code in `plan.md`. Exit 2 (`existing-app`: an adoption lock, an app `package.json` or app files) refuses the base phases (backend setup and frontend setup: tables, RLS, seed, clients, `middleware.ts` / `proxy.ts`, layout, theme, `tailwind.config`, `shadcn init`, `next@latest`, README, demo pages, demo credentials). Quote the signals and route to `/project-adoption` (design identity: `/design-system extract`). The add-on phases stay available and read `stack:`. A base phase runs only on a plan that recorded exit 0, so a missing verdict means refused. Never override the verdict by reading the tree yourself.
  - **B1.** A new project uses the GUARD default layout (`agentic-dev-core/references/guard-architecture.md` §1: `src/app`, `src/features`, `src/adapters`, `src/platform`), with the example already inserted by the installer. The backend `api/`, `schemas/` and `db/` boundaries are its layer map (`api/` routes in `app`, `schemas/` and domain in `features`, `db/` in `adapters`), and the design-system structure stays in the frontend. That structure is framework architecture, and AGENTS.md §2 SIMPLICITY FIRST exempts it from the ban on speculative abstraction.
  - **B2.** Validate env vars at boot (Zod or an equivalent schema check). A missing variable that passes silently shows up as a cryptic production failure far from its cause.
  - **B3.** Never clobber existing scaffolding. B0 refuses the base phases on an existing app, so this rule binds the add-ons and a resumed greenfield run. Detect prior state under `app/`, `lib/` and `db/`, apply upsert semantics, patch surgically and keep the user's edits.
  - **B4.** Keep credentials, URLs and environment-specific values out of scaffolded code: secrets go in `.env`, non-secret config in `.agents/project.yaml`.
  - **B5.** Scaffold the frontend only once `DESIGN.md` exists at the repo root. Its tokens are the input contract for Phase 2, so run `/design-system` first. Never emit `tailwind.config`, `globals.css` or CSS variables over an app's existing theme: `/design-system extract` records an existing design identity, and nothing here replaces it.
  - **B6.** Generate the Supabase types whenever you scaffold the DB layer. Runtime TypeScript types have to match the live schema, because drift is a silent bug factory.
  - **B7.** Ship bearer-token auth with rate limiting and secret-rotation guidance in the same scaffold. Auth without both is a half-finished feature.
  - **B8.** Scaffold OpenAPI with the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler), so the contract is browsable from day one and downstream consumers trust it. Scalar is the standard for this stack: do not ship Redoc or Swagger instead. An existing app that already serves its own docs UI keeps it, and Scalar goes beside it only on the user's OK, never as a replacement.
  - **B9.** Load the stack skills before writing the DB layer or the UI layer. `supabase` and `supabase-postgres-best-practices` come before any install, DB-MCP schema, RLS or migration call, or type generation. The design set (`frontend-design`, `ui-ux-pro-max`, `impeccable`, `emil-design-eng`, `modern-web-guidance`, strategy doc §3.5), `shadcn` and `tailwind-css-patterns` come before the component strategy (Phase 1.6 of `references/frontend-setup.md`). A skill that is not installed is said once, with a pointer to `bun setup`, and the work continues; never skip silently (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
  - **B10.** Database changes go through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: read `list_migrations` before the first write, run DDL only through `apply_migration`, take the route `stack.database.migrations_tool` names, verify at the destination, and record an ADR for an architecturally significant migration.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and never substitute silently (the built-in `WebSearch` / `WebFetch` only when the user chooses them).
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

# Project bootstrap: infrastructure scaffolding

`project-bootstrap` turns the product specs from `/project-foundation` into a working backend and frontend with the integration plumbing wired in. Where `project-foundation` answers "what are we building", this skill stands the repo up so the first story can start. It runs once per project, after the PRD, SRS and API contract exist and before any story is implemented.

The base phases (backend setup, frontend setup) are greenfield only. They create tables, RLS, seed rows, Supabase clients, `middleware.ts`, the root layout, the theme, `shadcn init`, framework installs, the README and demo pages, and on a repo that already holds an application each of those steps would overwrite something live. They refuse there (see "Entry gate") and the work goes to `/project-adoption`, which teaches the agentic layer an existing app. The incremental add-ons stay available on an existing app and read its `stack:` block.

---

## Dependencies

Requires `agentic-dev-core`. Loaded on demand:

- `agentic-dev-core/references/briefing-template.md` for dispatching the scaffolding subagents.
- `agentic-dev-core/references/dispatch-patterns.md` to pick Single, Sequential or Parallel per phase.
- `agentic-dev-core/references/skill-composition-strategy.md`, the contract the next section applies.
- `agentic-dev-core/references/orchestration-doctrine.md`: the main thread is the command center.
- `agentic-dev-core/references/session-management.md`: the Phase 0 resume contract, plan-first persistence at `.session/project-bootstrap/` and the archive on completion.
- `agentic-dev-core/references/db-change-doctrine.md` for every database change this skill makes through the DB MCP.

---

## Composable Skills (auto-resolved at skill entry)

Run once when the skill is invoked, before any phase, following `agentic-dev-core/references/skill-composition-strategy.md`.

1. Read `complementary_categories` from this skill's frontmatter (`frontend-framework`, `frontend-ui`, `backend-db`, `language`, `ci-cd`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each match by tier per strategy doc §2 (`.agents/skills/` is T1, `PROJECT_LEVEL_SKILLS` is T3, `USER_LEVEL_SKILLS` is T4).
4. Apply the threshold rule of strategy doc §3.2. T1 and T3 matches load silently and are cached for the session. For a T4 match, ask once, `"Detected <skill> (T4). Apply for this bootstrap? Y/N"`, and cache the answer. With nobody to ask, the table under "With nobody at the keyboard" decides.
5. When you dispatch a scaffolding subagent (backend setup, frontend setup, an add-on), inject a `## Composable Skills` block per strategy doc §5.2 that lists the resolved skills and the project standards (test command, runtime and so on).

Expected matches on a Next.js and Supabase project (illustrative; the real list depends on what is installed):

| Category             | Likely matches                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-framework` | `next-cache-components-adoption`, `next-cache-components-optimizer` (Next.js reference docs: `[DOCS_TOOL]`)                                                        |
| `frontend-ui`        | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` (T3) |
| `backend-db`         | `supabase`, `supabase-postgres-best-practices` (required at the backend and types steps, not only matched: §3.5 of the strategy doc)                               |
| `language`           | `typescript-advanced-types`                                                                                                                                        |
| `ci-cd`              | `github-actions-docs`                                                                                                                                              |

Some of these load at a named step whatever the entry scan decided (strategy doc §3.5): `supabase` and `supabase-postgres-best-practices` in `references/backend-setup.md` (before the install and any DB-MCP call) and `references/supabase-types-setup.md` (the generate step), and the design set plus `shadcn` and `tailwind-css-patterns` in `references/frontend-setup.md` Phase 1.6.

Skip the scan only when neither the session skill list nor `.agents/skills/` can be read, and then log `skill_resolution: "fallback-inline"` and `missing: [<categories with no resolution>]` in the result envelope (strategy doc §3.4).

---

## When to use

- A fresh repo has its product foundation (`/project-foundation` already ran) and no code yet: base phases plus add-ons.
- An existing repo needs one incremental infrastructure feature ("add OpenAPI to the API", "add bearer auth", "wire Supabase types into the frontend"): add-ons only, reading the `stack:` block.

Send these elsewhere:

- Product definition (PRD, user journeys, architecture decisions) goes to `/project-foundation`.
- Seeding the Jira backlog with epics and stories goes to `/product-management`.
- Implementing one story (plan, code, review, deploy) goes to `/sprint-development`.
- A unit-test framework goes to `/unit-testing`.
- The base phases on an app that already exists go to `/project-adoption` (the agentic layer learns the app as it is) and `/design-system extract` for its design identity.

The infrastructure choices flow from the SRS architecture decisions made in `/project-foundation`. If `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}` or `{{DB_TYPE}}` is unset in `.agents/project.yaml`, run `/project-foundation` first. If `.agents/project.yaml` itself is missing, the tooling was never installed: `create-agentic-dev` for a new project, the updater's `--adopt` run for an existing app (`INSTALLER.md`).

---

## Inputs: read these first, in this order

Read in this order and stop early when the job is small enough that later inputs add no signal.

1. `.context/PRD/`, the `/project-foundation` output. The feature inventory and MVP scope drive what to scaffold.
2. `.context/SRS/`, also from `/project-foundation`: the infrastructure decisions (DB, hosting, auth provider, runtime).
3. `DESIGN.md` at the repo root: the design system and tokens. The frontend scaffold requires it before Phase 2.
4. `.agents/project.yaml`: project identity, env URLs and stack vars (`{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}`).
5. Existing scaffolding under `app/`, `lib/` and `db/`, if present. Detect prior state and upsert surgically (B3).
6. `.agents/project.yaml` → `stack:`: where the app lives (`stack.app_root`), its package manager, its script names, its schema source and migration tool, its types path. The add-ons resolve every path and command through it (Phase 3).

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 0.5 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

The skill is project-scope, so there is no `<scope>` segment. Session state lives directly at `.session/project-bootstrap/{plan.md, progress.md}` (`agentic-dev-core/references/session-management.md` §3 and §9).

## Entry gate: brownfield guard (mandatory, inline)

The base phases run only on a repo with no application yet. A script gives the verdict, not the agent reading the tree, because a gate the gated agent can satisfy by writing a plausible value is no gate (`AGENTS.md` §3, gate design):

```bash
bun run bootstrap:guard   # exit 0 = greenfield · exit 2 = existing app (signals listed) · --json for the same as JSON
```

Any one signal is enough (`cli/lib/bootstrap-guard.ts`): the adoption lock (`.template/installer.lock.json` records `adopted: true`); a `package.json` declaring `next` or `react` at the repo root, at the declared `stack.app_root` or under `apps/*` / `packages/*`; or app files under that root (a route tree, `middleware` / `proxy`, a Tailwind config, `components.json`, a migration directory holding files).

| Verdict | Base phases (backend, frontend) | Add-ons (Phase 3) |
|---|---|---|
| exit 0, `greenfield` | run as written | run as written |
| exit 2, `existing-app` | Refused. Quote the signals, name what the phase would have overwritten, route to `/project-adoption` (and to `/design-system extract` when the request was about the UI's look) | available, reading `stack:` |

The guard runs once, at entry, in the same turn as Phase 0: after Phase 0 finds no prior session, or after the user picks restart. Its verdict and exit code go into `plan.md` under `## Inputs` (`Bootstrap guard: greenfield, exit 0, <date>`). A resumed run keeps the verdict its plan recorded, because the app the guard would see by then is this skill's own output. A restart keeps the verdict the archived plan recorded, for the same reason. A run with no prior plan runs the guard fresh, and so does a base-phase reference read with no plan at all (a standalone "set up the frontend" request, a subagent briefed with one reference).

The guard is fail-closed. No recorded verdict, an unreadable one, or one without an exit code refuses the base phases. The user cannot waive the guard by saying "this is greenfield". When the script wrongly reads `existing-app`, remove the signal it quoted (for a leftover adoption lock, correct the lock) and rerun the script.

## Phase 0 — Resume check (MANDATORY, inline)

Before any subagent dispatch and before any phase below, run the resume contract of `agentic-dev-core/references/session-management.md` §4. It runs inline with no subagent, and on a first invocation too, so telling resume from fresh never depends on memory.

1. Check whether `.session/project-bootstrap/progress.md` exists. If not, go to Phase 0.5.
2. If it exists, read `.session/project-bootstrap/plan.md` in full and the last three phase entries of `progress.md`.
3. Tell the user the plan's Goal (one sentence), the last completed phase with its timestamp, the next planned phase and any blocking notes.
4. Offer three options and wait: resume (jump to the next planned phase), restart (archive the directory to `.session/.archive/<YYYY-MM-DD>-project-bootstrap-project-aborted/`, then go to Phase 0.5 fresh) or abort (leave the directory untouched and stop). The "With nobody at the keyboard" table says who answers when no person is present.

## Phase 0.5 (write `plan.md`)

Once Phase 0 confirms no prior session exists, write `.session/project-bootstrap/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6. The plan lists which incremental features the user wants on top of the base backend and frontend.

- Frontmatter: `topic_key: session/project-bootstrap/project/plan`, `skill: project-bootstrap`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections, in this H2 order: `## Goal`, `## Inputs` (SRS architecture path, stack vars, DESIGN.md path, and the `Bootstrap guard:` line from the entry gate), `## Approach`, `## Phase breakdown` (Phase 1 Backend, then Phase 2 Frontend, as sequential subagents; Phase 3 lists the chosen add-ons from `openapi-setup`, `api-routes-setup`, `bearer-token-support`, `env-url-setup` and `supabase-types-setup`, each row with its dispatch pattern), `## Risks & open questions`, `## Verification checklist`, `## Cross-references`.

The orchestrator drafts the plan inline, since the inputs are small. A single planner subagent is worth it only when the SRS is unusually large.

When the user approves the chosen add-ons, change `status: draft` to `status: approved` in the frontmatter and start Phase 1.

## Phase walkthrough

Bootstrap has a base layer (backend, then frontend) and add-ons you run on demand. The orchestrator writes one `progress.md` entry after each Phase 1 and Phase 2 subagent returns, and one per add-on on completion, per `agentic-dev-core/references/session-management.md` §7.

### 1. Backend setup

Stands up the API service: database schemas, ORM and migrations, the base API entry point, shared TypeScript types, the error-handling skeleton, structured logging and environment configuration. It sets the conventions every later endpoint follows. Read `references/backend-setup.md` for the procedure (stack detection, DB schema generation from the SRS, base middleware, the type pipeline, verification).

The prerequisites are an SRS that defines the tech stack and an entry gate that recorded `greenfield`.

Every schema, RLS, seed or function change goes through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: load the Supabase skills, read `list_migrations` before the first write, run DDL only through `apply_migration`, verify each change at the destination, and record an ADR for an architecturally significant one (the foundational schema and its RLS model usually are).

### 2. Frontend setup

Stands up the client app: framework scaffolding (Next.js, Vite and so on), a design system chosen from the PRD's brand personality, the project structure, the routing skeleton, a state-management baseline, content patterns and the integration with the backend types. Read `references/frontend-setup.md` for the procedure.

The prerequisite is an entry gate that recorded `greenfield`. This phase writes the theme from `DESIGN.md` (`tailwind.config`, `globals.css`, the shadcn CSS variables), so it never runs over an app that already has a design identity.

### 3. Incremental feature scaffolding

Each add-on layers one capability on top of the base backend and frontend. They are independent: pick the ones the project needs and run them in any order once the base is in place.

On an existing app (entry gate `existing-app`) the add-ons run against what the app already is, read from `.agents/project.yaml` → `stack:` (contract: `.agents/README.md` → `stack`):

- Every literal path in a reference (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) is the greenfield default. Resolve it under `{{stack.app_root}}`. The generated types file is `{{stack.database.types_path}}`, and the Pages Router (`stack.framework: nextjs-pages`) keeps its API under `pages/api/`.
- An app command is `{{stack.package_manager}} run <script>` with the script name from `stack.scripts`. A null script is skipped and said so, never invented. Dependencies install with that package manager, which is never switched.
- What the app already has wins. An existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by an add-on. A conflict is shown to the user with both shapes.
- The Supabase project ref is `environments.<env>.db_project_ref`, and a database touch follows `agentic-dev-core/references/db-change-doctrine.md`.

The add-ons, each with its reference in the table below: OpenAPI with the Scalar UI at `/api/docs` (Zod to OpenAPI schema generation, contract publication), API routes and middleware (route conventions, error responses, request logging, auth middleware wiring), bearer-token auth (JWT issuance, refresh tokens, protected-route middleware, session handling), env vars and URL builders (environment-aware helpers and the per-environment URLs in `.agents/project.yaml`) and Supabase types generation (the DB schema to TypeScript types pipeline, the regeneration script, frontend wiring).

### 4. Refresh the GUARD example (on request only)

The installer inserts `packages/guard-example/src/` into the project once, and the updater never ships it. When the person asks and the example changed upstream, refresh it from `https://github.com/upex-galaxy/agentic-dev-boilerplate`:

1. Sparse-clone the repo into a temp dir (`git clone --depth 1 --filter=blob:none --sparse`, then `git sparse-checkout set packages/guard-example`; `gh repo clone` works too).
2. Copy `packages/guard-example/src/` into the project's `src/` without overwriting a file the team changed (`cp -Rn`, or compare each file first and show the diff of any that differ).
3. Run `bun run guard:manifest`; done when it exits 0 and the manifest lists the example's actions.
4. Delete the temp dir.

---

## Specific tasks: which reference to read

| User intent                                                          | Read                                 |
| -------------------------------------------------------------------- | ------------------------------------ |
| "setup the backend" / "DB + API boilerplate" / "scaffold the server" | `references/backend-setup.md`        |
| "setup the frontend" / "design system + project skeleton"            | `references/frontend-setup.md`       |
| "add OpenAPI" / "Swagger" / "Scalar" / "API docs UI"                 | `references/openapi-setup.md`        |
| "API routes" / "route conventions" / "middleware"                    | `references/api-routes-setup.md`     |
| "bearer auth" / "JWT" / "refresh tokens" / "protect routes"          | `references/bearer-token-support.md` |
| ".env vars" / "URL builder" / "environment config"                   | `references/env-url-setup.md`        |
| "Supabase types" / "DB schema → TS" / "type generation pipeline"     | `references/supabase-types-setup.md` |

When the request matches no row, fall back to `references/backend-setup.md` or `references/frontend-setup.md` by which side of the stack it touches, and say in the report that no exact match was found.

---

## Subagent dispatch

Backend and frontend setup run in sequence, because the frontend pre-flight (`references/frontend-setup.md`) reads `src/types/supabase.ts` and the Supabase clients that `references/backend-setup.md` produces, and stops when they are missing. Dispatch backend, then frontend, with the sequential pattern from `agentic-dev-core/references/dispatch-patterns.md`.

The add-ons usually run after the base but are independent of each other:

- With the base backend in place, `openapi-setup`, `api-routes-setup`, `bearer-token-support` and `env-url-setup` can each run in its own subagent.
- With the base frontend in place, `supabase-types-setup` wires the backend types into it.

Every briefing follows the 7-component template in `agentic-dev-core/references/briefing-template.md` and cites the one reference file the subagent has to read.

---

## Hand-offs

After bootstrap the project is ready for:

- Backlog seeding, `/product-management`: turns the PRD into Jira epics and stories with acceptance criteria.
- Per-story development, `/sprint-development`: the plan, implement, review and deploy loop for each story.
- Unit-test setup, `/unit-testing`: a separate concern that can run any time after the base scaffolding.
- The QA testability page and credentials artifact, `/testability-guide` (optional): once the infrastructure is live, it generates the in-app `/qa` page and a tool-agnostic credentials artifact (Jira Epic, Confluence, Notion, MCP, CLI or manual paste) so testers and agents can exercise the app at DB, API and UI layers.

The output is ready for feature work, not for production. Deployment, CI and observability hardening are layered on by later skills as the product matures.

---

## Verification

After any phase, confirm:

- The app's build exits 0: `{{stack.package_manager}} run {{stack.scripts.build}}` (on a greenfield run, the script the base phases just created).
- The dev server starts and the home page (frontend) or the health route (backend) responds.
- TypeScript compiles with no errors across the whole repo.
- New env vars are documented in `.env.example`.
- Generated artefacts (OpenAPI schema, Supabase types) are committed. The references never commit on their own: they recommend the commit, and the user (or `/git-flow-master`) makes it.
- The `stack:` block of `.agents/project.yaml` describes the app that now exists. Run `bun run agents:setup --stack` (it detects the stack from the scaffolded repo and prompts once per field that differs from the shipped greenfield defaults) and keep `bun run setup:doctor` free of stack drift. Block contract: `.agents/README.md` → `stack`.

When a check fails, put the failure in the report instead of papering over it, and ask before inventing a fix for an unfamiliar stack.

When the plan's verification checklist passes, the orchestrator archives per `agentic-dev-core/references/session-management.md` §8: it moves `.session/project-bootstrap/` to `.session/.archive/<YYYY-MM-DD>-project-bootstrap-project/` and calls `mem_session_summary` with the archive path, so a later `mem_search` can find its way back.

---

## With nobody at the keyboard

A supervised worker or a routine can run this skill (`/autonomous-delivery` never calls it), and neither waits for a person. The rule is the one in `agentic-dev-core/references/decision-protocol.md` §5.2: a worker's conductor holds each gate, and a routine takes the delegating brief as the answer when the brief covers the decision. Without that cover it does the reversible work, stops before any outward or irreversible action (a DB-MCP write, a push, a tracker write, a message) and reports.

| Gate | A person is present | A supervised worker | A routine with nobody |
|---|---|---|---|
| T4 skill question | ask once | the briefing's `Skills to load` answers | the brief names it; otherwise do the step inline and log `skill_resolution: "fallback-inline"` |
| Phase 0 resume, restart or abort | the user picks | the conductor picks | the brief picks; otherwise resume, and say earlier state was found |
| Plan approval (Phase 0.5) | the user approves | the conductor approves | the brief covers it; otherwise the plan stays `draft`, the run stops after writing it and reports, because the base phases write tables and RLS through the DB MCP |
| A reference's own question (URLs, project ref, package manager) | ask the user | ask the conductor | the brief answers; otherwise the reference's "With nobody at the keyboard" part says what to do |
| Add-on conflicts with what the app has | show both shapes to the user | ask the conductor | keep the app's version, skip that change and report both shapes |
| Scalar beside an existing docs UI (B8) | the user's OK | the conductor's OK | do not add it; report |
| `DESIGN.md` missing (B5) | run `/design-system`, then return | report to the conductor | stop the frontend and report |
| PRD, SRS or stack vars missing | run `/project-foundation` first | report to the conductor | stop and report |
| Capability missing (`db`, `library-docs`) | one-message stop per `mcp-capabilities.md` §4 | the message goes to the conductor | skip the dependent step, do the rest, report |
| A check fails on an unfamiliar stack | ask the user | ask the conductor | report the failure and stop |
| `agents:setup --stack` prompts | answer once per differing field | the conductor answers | after a greenfield run (exit 0 recorded): `bun run agents:setup --stack --non-interactive`. On an existing app: `--dry-run`, and put the proposed changes in the report |

The brownfield guard itself never waits: the script decides, and a refusal is a report.

---

## Rules

The B0 to B10 rules live once, in `compact_rules` in the frontmatter, and the references cite them by code (B4, B5, B7).

Subagents mirror the user's language when they report results. Scaffolded files and other repo artifacts stay in English.
