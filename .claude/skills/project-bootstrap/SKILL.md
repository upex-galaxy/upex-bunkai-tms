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
| `frontend-framework` | `next-best-practices`, `next-cache-components`, `react-best-practices`, `composition-patterns`                                                                     |
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

## Phase walkthrough

Bootstrap is split into a base layer (backend + frontend, usually run in parallel) and an incremental layer (composable features, run on demand).

### 1. Backend setup

Stands up the API service: database schemas, ORM/migrations, base API entry point, shared TypeScript types, error handling skeleton, structured logging, environment configuration. Establishes the conventions every future endpoint will follow.

Read `references/backend-setup.md` for the full procedure: stack detection, DB schema generation from the SRS, base middleware, type pipeline, and verification.

Pre-requisite: SRS architecture (`/project-foundation` output) defines the tech stack.

### 2. Frontend setup

Stands up the client app: framework scaffolding (Next.js / Vite / etc.), design system selection driven by the brand personality from the PRD, project structure, routing skeleton, state management baseline, content writing patterns, and integration with backend types.

Read `references/frontend-setup.md` for the full procedure: brand-aware design system bootstrapping, page skeletons, content patterns, and backend-type integration.

### 3. Incremental feature scaffolding

Each of the following layers in a single capability on top of the base backend + frontend. They are independent — pick the ones the project needs, skip the rest, run them in any order after the base is in place.

- **OpenAPI integration** → `references/openapi-setup.md`. Schema generation, Swagger / Scalar UI, contract publication.
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

---

## Notes

- Each "incremental feature" reference is composable — the project does not need all of them. Pick by need, skip the rest.
- This skill consumes `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}`, `{{API_URL}}`, `{{WEB_URL}}` from `.agents/project.yaml`. If unset, run `/project-foundation` first. If `.agents/project.yaml` itself is missing, clone the full boilerplate — foundation files ship with the repo.
- For parallel scaffolding (backend + frontend at the same time), dispatch via the briefing template in `agentic-dev-core/references/briefing-template.md`.
- The references are written in Spanish in some sections (preserved from the original prompts). The skill orchestrator (this file) is in English; subagents should mirror the user's language when reporting results.
