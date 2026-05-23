---
name: agentic-dev-onboard
description: "Walks new users through this repo's dev flow — Next.js + Supabase stack, Jira workflow (Ready For Dev → In Progress → In Review → Ready For QA), /sprint-development for ticket-driven work, MCPs available (Tavily, Context7, Supabase, n8n, Atlassian), critical env vars, Critical Rule #12 (READ package.json DIRECTLY). Triggers on: `onboard me`, `explain this repo`, `first time using this`, `primer vez en este repo`, `/agentic-dev-onboard`. Do NOT use for: feature implementation (use /sprint-development), test design (use /unit-testing), backlog refinement (use /product-management)."
license: MIT
compatibility: [claude-code, opencode]
phase: foundation
complementary_categories: []
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

# Agentic Dev Onboard — First-time tour of this repo

Activate when a user lands on this repo for the first time and asks "where do I start?", "how does this work?", or invokes `/agentic-dev-onboard`. The skill is a guided tour, not an executor: it explains the stack, the workflow, the MCPs, and the env vars that everything depends on, then hands off to the right downstream skill.

`/agentic-dev-onboard` is specific to **this** Next.js + Supabase boilerplate and points at the concrete entry points (`/sprint-development`, `/product-management`, etc.).

---

## Welcome

This is the **AI-Driven Project Starter** — a dev-only boilerplate for building Next.js + Supabase apps with AI agents in the loop. The repo ships skills, scripts, and conventions that turn a Jira ticket into merged code via `/sprint-development`. It does **not** ship a backend or a frontend; both are scaffolded on top of the boilerplate by `/project-bootstrap`.

If you cloned this repo and you don't yet have `bun run setup` complete, start there. Everything else assumes the foundation is green.

---

## Composable Skills (auto-resolved at skill entry)

This skill is mostly a static walkthrough — it rarely dispatches sub-agents, so composition is minimal. Run once at entry per `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter.
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. Apply threshold rule per strategy doc §3.2 (T1/T3 silent; T4 ASK).
4. Inject a `## Composable Skills` block per strategy doc §6.2 only when (rarely) dispatching a sub-agent.

Skip step if the catalog is unavailable; log `skill_resolution: "fallback-inline"` plus `missing: [<categories>]` per §3.4.

---

## Stack

| Layer       | Choice                                |
| ----------- | ------------------------------------- |
| Framework   | Next.js (locked, App Router)          |
| Database    | Supabase (Postgres + Auth + Storage)  |
| Language    | TypeScript (strict mode)              |
| Runtime     | bun                                   |
| Lint/format | ESLint + Prettier (pre-commit hooks)  |
| Tests       | Vitest (unit) + Playwright (E2E)      |
| AI agent    | Claude Code (primary), OpenCode (alt) |

The stack is intentionally locked. If your project needs a different stack, this boilerplate is not the right starting point.

---

## First-time setup

Run the interactive installer once after cloning:

```bash
bun run setup
```

This bootstraps `.agents/`, installs Engram (persistent memory) via gentle-ai `--preset minimal`, configures the 5 canonical MCPs (Tavily, Context7, Supabase, n8n, Atlassian), and writes `.mcp.json`. Full details in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` with the credentials the rest of the workflow expects (see "Critical env vars" below).

> **Critical Rule #12** (CLAUDE.md §1): for build/test/lint commands, **READ `package.json` DIRECTLY** — never trust a hardcoded list in a doc. Scripts drift; `package.json` is canonical.

---

## Primary workflow: `/sprint-development`

`/sprint-development` is the mega-orchestrator for ticket-driven work. Call it with a Jira issue key (`/sprint-development UPEX-123`) and it drives the per-story dev loop end-to-end.

**Jira state machine:**

```
Ready For Dev → In Progress → In Review → Ready For QA
```

**Five stages inside the loop:**

| Stage | Name              | What happens                                                                                        |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 1     | Planning          | Read the ticket, load module context, produce an implementation plan, transition to **In Progress** |
| 2     | Implementation    | Write code per plan, run unit tests + lint + types, commit on the feature branch                    |
| 3     | Code Review       | Open the PR, run review                                                                              |
| 4     | Staging Deploy    | Merge to `staging`, deploy, smoke-check, transition to **Ready For QA**                             |
| 5     | Production Deploy | (Gated, optional) Merge to `main`, deploy with rollback plan                                        |

The skill handles Jira transitions, branch creation, commits, PR open, deploy. You confirm at the gates.

---

## MCPs available

Five canonical MCPs ship with the boilerplate:

| MCP       | Use it for                                        |
| --------- | ------------------------------------------------- |
| Tavily    | Web search, troubleshooting community Q&A         |
| Context7  | Official library docs (Next.js, Supabase…)        |
| Supabase  | DB queries, migrations, type generation           |
| n8n       | Workflow automation, scheduled jobs               |
| Atlassian | Jira/Confluence fallback when `/acli` unavailable |

**Decision rule:**

- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)

`.mcp.json` lives at the repo root and is **committed** (uses `${VAR}` references to `.env` — no secrets stored in the file).

---

## Critical env vars

Place these in `.env` before running anything that talks to a real environment:

| Var                                            | Used by                                |
| ---------------------------------------------- | -------------------------------------- |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`     | Local dev login (Playwright, Supabase) |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | Staging smoke tests, manual login      |
| `ATLASSIAN_URL` / `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` | `acli` Jira CLI, MCP atlassian, scripts/sync-jira-* |
| `TAVILY_API_KEY`                               | Tavily MCP                             |
| `SUPABASE_URL` / `SUPABASE_*_KEY`              | Supabase MCP + runtime                 |

`.mcp.json` is **committed** — it references env vars via `${VAR}` placeholders (Claude Code) or `{env:VAR}` (OpenCode). The actual secret values live in `.env` (gitignored). Never inline a real token in `.mcp.json`.

Verify your config by running the linter declared in `package.json` (typically `bun run vars:check`). Always check `package.json` for the canonical script name — Critical Rule #12.

---

## Local skills (committed in this repo — T1 per CLAUDE.md §5, 11 ours only)

> **Policy**: this repo commits ONLY skills WE maintain. Community / third-party skills (`playwright-cli`, `frontend-design`, `next-*`, `shadcn`, `supabase-postgres-best-practices`, etc.) are installed user-scope by `bun run setup` from upstream — never committed.

| Skill                 | Trigger                       | Purpose                                                                                                                                                                |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-dev-core`    | (auto, cited by other skills) | Passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand — not invoked directly. |
| `agentic-dev-onboard` | `/agentic-dev-onboard`        | This skill — first-time orientation                                                                                                                                    |
| `project-foundation`  | `/project-foundation`         | Constitution + PRD + SRS + Discovery                                                                                                                                   |
| `design-system`       | `/design-system`              | DESIGN.md (Google Labs spec) — visual identity contract                                                                                                                |
| `project-bootstrap`   | `/project-bootstrap`          | Backend + frontend skeleton + features                                                                                                                                 |
| `testability-guide`   | `/testability-guide`          | `/qa` page + tool-agnostic credentials artifact (Jira / Confluence / Notion / MCP / CLI / manual). Idempotent re-runs.                                                 |
| `product-management`  | `/product-management`         | Backlog seeding, epic creation, INVEST/AC refinement                                                                                                                   |
| `sprint-development`  | `/sprint-development`         | Per-story dev loop — mega-orchestrator                                                                                                                                 |
| `unit-testing`        | `/unit-testing`               | TDD red-green-refactor (composable mid-flight from `/sprint-development`)                                                                                              |
| `git-flow-master`     | (auto)                        | Branch / commit / push / PR — adapts to detected branching strategy                                                                                                    |
| `acli`                | (auto)                        | Atlassian CLI wrapper for Jira/Confluence terminal work                                                                                                                |
| `vercel-cli`          | (auto on `vercel`)            | Vercel CLI cookbook — deployment verification, env var sync, debug, rollback. Companion to community `/deploy-to-vercel`                                               |

Browser automation is provided by `/playwright-cli` (community skill from `microsoft/playwright-cli`, installed by setup — see Critical Rule #11 in CLAUDE.md).

---

## Persistent memory via gentle-ai

`bun run setup` installs Engram via `gentle-ai install --preset minimal` — persistent memory that survives across sessions and compactions. No other gentle-ai skills are installed (CLAUDE.md §13 covers the proactive-save protocol). Full details in [`INSTALLER.md`](../../../INSTALLER.md).

---

## Where to learn more (CLAUDE.md pointers)

The AI persistent-memory file at the repo root carries the full operational contract. Before your first ticket, skim these sections:

- **§1 CRITICAL RULES** — 12 rules that override defaults (credentials, plan-before-coding, no AI attribution, MCP credential failure protocol, `READ package.json DIRECTLY`).
- **§4 CONTEXT LOADING MAP** — task → trigger phrase → skill → context files → primary tool.
- **§5 SKILLS + COMMANDS + MCPs REGISTRY** — full T1/T3/T4 skill model.
- **§12 PROACTIVE MEMORY TRIGGERS** — when to call `mem_save` without being asked.

---

## Next steps after the onboard

Run through this checklist before you reach for your first ticket:

- [ ] Did you run the setup script (`bun run setup` — verify name in `package.json`)?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `TAVILY_API_KEY`, `SUPABASE_*`)?
- [ ] Does the agents linter (`bun run vars:check` per `package.json`) exit clean (0 errors)?
- [ ] Does Engram appear in the active MCP list (restart your agent if not)?
- [ ] Ready for your first ticket: `/sprint-development <UPEX-XXX>`

If any box is unchecked, fix that first. The downstream skills assume a green foundation.

---

## What this skill does NOT do

- Implement features → use `/sprint-development`
- Write unit tests → use `/unit-testing`
- Refine acceptance criteria → use `/product-management`
- Define a brand-new product → use `/project-foundation`
- Scaffold backend / frontend code → use `/project-bootstrap`
- Generate the in-app `/qa` page + credentials artifact → use `/testability-guide`

The onboard tour ends at the moment the user knows which skill to call next. From there, the relevant workflow skill takes over.
