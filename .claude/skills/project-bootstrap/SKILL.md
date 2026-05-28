---
name: project-bootstrap
description: 'Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system, project skeleton, routing), and incremental features (OpenAPI/Scalar UI, API routes + middleware, bearer-token auth, env vars + URL builders, Supabase types generation). Triggers on: `scaffolding del proyecto`, `setup del backend`, `inicializar el frontend`, `configurar OpenAPI`, `API routes setup`, `bearer token authentication`, `env vars setup`, `supabase types generation`, `infrastructure setup`, `backend skeleton`, `frontend boilerplate`. Do NOT use for: product definition (use `/project-foundation`), backlog seeding (use `/product-management`), per-story development (use `/sprint-development`), unit testing (use `/unit-testing`), or test framework setup (out of scope).'
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: foundation
complementary_categories:
  - frontend-framework
  - frontend-ui
  - backend-db
  - runtime
  - language
  - ci-cd
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

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel scaffolding subagents (e.g. backend + frontend in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-bootstrap/`, archive on completion.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any phase below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`frontend-framework`, `frontend-ui`, `backend-db`, `runtime`, `language`, `ci-cd`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2 (path-based: `.claude/skills/` → T1; PROJECT_LEVEL_SKILLS → T3; USER_LEVEL_SKILLS → T4).
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this bootstrap? Y/N"`. Cache the answer for the session.
5. When dispatching scaffolding sub-agents (Backend setup, Frontend setup, Incremental features), inject a `## Composable Skills` block per strategy doc §6.2 listing the resolved skills + project standards (test command, runtime, etc).

Expected matches on a Next.js + Supabase project (illustrative — actual list depends on what the user has installed):

| Category             | Likely matches                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-framework` | `next-best-practices`, `next-cache-components`                                                                                                                     |
| `frontend-ui`        | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` (T3) |
| `backend-db`         | `supabase-postgres-best-practices`                                                                                                                                 |
| `runtime`            | `bun`                                                                                                                                                              |
| `language`           | `typescript-advanced-types`                                                                                                                                        |
| `ci-cd`              | `github-actions-docs`                                                                                                                                              |

Skip step only if the registry cache is missing AND no session-start skill list is available (rare; pre-init or non-Claude-Code runtime). When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

---

## When to use

Use this skill when:

- A fresh repo has its product foundation (`/project-foundation` already ran) but no code yet.
- An existing repo needs an incremental infrastructure feature added (e.g. "add OpenAPI to the API", "add bearer auth", "wire Supabase types into the frontend").

Do NOT use this skill to:

- Define the product (PRD, user journeys, architecture decisions) — that's `/project-foundation`.
- Seed the Jira backlog with epics + user stories — that's `/product-management`.
- Implement an individual user story (planning → code → review → deploy) — that's `/sprint-development`.
- Set up a unit-test framework — that's `/unit-testing` (and is its own concern).

The infrastructure choices below flow from the SRS architecture decisions made during `/project-foundation`. If `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, or `{{DB_TYPE}}` are unset in `.agents/project.yaml`, run `/project-foundation` first (and clone the full boilerplate if `.agents/project.yaml` itself is missing — foundation files ship with the repo).

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a project-bootstrap workflow. Read in order; stop earlier when the workflow is small enough that later inputs add no signal.

1. `.context/PRD/` — outputs from `/project-foundation`. Feature inventory + MVP scope drive what to scaffold.
2. `.context/SRS/` — outputs from `/project-foundation`. Infrastructure decisions (DB, hosting, auth provider, runtime).
3. `DESIGN.md` (repo root) — design system + tokens. Required input for the frontend scaffold; must exist before Phase 2.
4. `.agents/project.yaml` — project identity, env URLs, stack vars (`{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}`).
5. Existing scaffolding under `app/`, `lib/`, `db/` (if present) — detect prior state and UPSERT surgically; do NOT clobber.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/project-bootstrap/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

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
- Body sections (fixed H2 order): `## Goal` · `## Inputs` (SRS architecture path, stack vars, DESIGN.md path) · `## Approach` · `## Phase breakdown` (Phase 1 Backend + Phase 2 Frontend run as Parallel subagents; Phase 3 lists chosen incremental features from `openapi-setup` / `api-routes-setup` / `bearer-token-support` / `env-url-setup` / `supabase-types-setup`, with dispatch pattern per row) · `## Risks & open questions` · `## Verification checklist` · `## Cross-references`.

Dispatch: inline drafting by the orchestrator is normal — inputs (SRS + `.agents/project.yaml` + DESIGN.md) are small. A Single planner subagent is only warranted when the SRS is unusually large.

After `plan.md` is written and the user approves the chosen incremental features, transition `status: draft → approved` in the frontmatter and proceed to Phase 1.

## Phase walkthrough

Bootstrap is split into a base layer (backend + frontend, usually run in parallel) and an incremental layer (composable features, run on demand).

> **Progress checkpoint**: Phases 1 (Backend) and 2 (Frontend) are dispatched as a Parallel pair; the orchestrator writes ONE `progress.md` entry after BOTH subagents return. Each incremental feature in Phase 3 gets its own checkpoint entry on completion. All checkpoints follow `agentic-dev-core/references/session-management.md` §7.

### 1. Backend setup

Stands up the API service: database schemas, ORM/migrations, base API entry point, shared TypeScript types, error handling skeleton, structured logging, environment configuration. Establishes the conventions every future endpoint will follow.

Read `references/backend-setup.md` for the full procedure: stack detection, DB schema generation from the SRS, base middleware, type pipeline, and verification.

Pre-requisite: SRS architecture (`/project-foundation` output) defines the tech stack.

### 2. Frontend setup

Stands up the client app: framework scaffolding (Next.js / Vite / etc.), design system selection driven by the brand personality from the PRD, project structure, routing skeleton, state management baseline, content writing patterns, and integration with backend types.

Read `references/frontend-setup.md` for the full procedure: brand-aware design system bootstrapping, page skeletons, content patterns, and backend-type integration.

### 3. Incremental feature scaffolding

Each of the following layers in a single capability on top of the base backend + frontend. They are independent — pick the ones the project needs, skip the rest, run them in any order after the base is in place.

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

Backend and frontend setup are **independent** — once the SRS exists, both can run in parallel under separate subagents. Use the parallel dispatch pattern from `agentic-dev-core/references/dispatch-patterns.md`.

Incremental features are usually **sequential after the base** but independent from each other:

- After base backend exists → `openapi-setup`, `api-routes-setup`, `bearer-token-support`, `env-url-setup` can each run in their own subagent.
- After base frontend exists → `supabase-types-setup` wires backend types into the frontend.

Briefings for each subagent must follow the 6-component template in `agentic-dev-core/references/briefing-template.md`. Each briefing should cite the specific reference file the subagent must read.

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

- The `bun run build` (or equivalent for the chosen stack) command exits 0.
- The dev server starts and the home page (frontend) / health route (backend) responds.
- TypeScript compiles with no errors across the whole monorepo or split repos.
- New env vars are documented in `.env.example`.
- Generated artefacts (OpenAPI schema, Supabase types) are committed.

If any check fails, surface the failure in the report rather than papering over it. Do not invent fixes for unfamiliar stacks — ask the user.

On successful completion (Verification checklist from `plan.md` passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/project-bootstrap/` to `.session/.archive/<YYYY-MM-DD>-project-bootstrap-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back.

---

## Anti-patterns — NEVER do these

- **B1.** NEVER collapse the scaffold architecture layers (`api/` / `schemas/` / `db/` boundaries in backend, design-system structure in frontend). That structure is framework architecture, not speculative abstraction — CLAUDE.md §2 SIMPLICITY FIRST exempts it.
- **B2.** NEVER skip env-var validation (Zod or equivalent schema check at boot). Silent missing env vars cause cryptic prod failures far from the root cause.
- **B3.** NEVER clobber existing scaffolding. Detect prior state under `app/`, `lib/`, `db/` and apply UPSERT semantics — patch surgically, preserve user edits.
- **B4.** NEVER hardcode credentials, URLs, or env-specific values in scaffolded code. They belong in `.env` (secrets) + `.agents/project.yaml` (non-secret config).
- **B5.** NEVER scaffold the frontend before `DESIGN.md` exists at repo root. Design tokens are the input contract for Phase 2 — run `/design-system` first.
- **B6.** NEVER skip Supabase types generation when scaffolding the DB layer. Runtime TypeScript types must match the live schema; drift is a silent bug factory.
- **B7.** NEVER ship bearer-token auth without rate-limiting + secret-rotation guidance in the same scaffold. Auth without those two is a half-finished feature.
- **B8.** NEVER scaffold OpenAPI without the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler). The contract surface must be browsable from day one or downstream consumers won't trust it. Do NOT ship Redoc/Swagger instead — Scalar is the standard for this stack.

---

## Notes

- Each "incremental feature" reference is composable — the project does not need all of them. Pick by need, skip the rest.
- This skill consumes `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}` from `.agents/project.yaml`. If unset, run `/project-foundation` first. If `.agents/project.yaml` itself is missing, clone the full boilerplate — foundation files ship with the repo.
- For parallel scaffolding (backend + frontend at the same time), dispatch via the briefing template in `agentic-dev-core/references/briefing-template.md`.
- The references are written in Spanish in some sections (preserved from the original prompts). The skill orchestrator (this file) is in English; subagents should mirror the user's language when reporting results.
