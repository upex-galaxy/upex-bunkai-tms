---
name: agentic-dev-onboard
description: "Walks new users through this repo's dev flow — which entry path the repo took (new project scaffolded by /project-bootstrap, or an existing app adopted with `create-agentic-dev --adopt` + /project-adoption), the app's real stack as the `stack:` block of `.agents/project.yaml` declares it, Jira workflow (Ready For Dev → In Progress → In Review → Ready For QA), /sprint-development for ticket-driven work, MCP capabilities (library docs, web search at harness level, DB, automation flows), critical env vars, Critical Rule #10 (READ package.json DIRECTLY). Triggers on: `onboard me`, `explain this repo`, `first time using this`, `primer vez en este repo`, `we just adopted our app, now what`, `acabamos de adoptar la app`, `/agentic-dev-onboard`. Do NOT use for: feature implementation (use /sprint-development), test design (use /unit-testing), backlog refinement (use /product-management)."
license: MIT
compatibility: [claude-code, codex, opencode]
phase: foundation
complementary_categories: []
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the MCP decision rule + "What this skill does NOT do" in the body below.
compact_rules: |
  - Use `library-docs` (Context7) for "how to use X" — official docs, current API
  - Use `web-search` (Exa or Tavily, connected at harness level) for "how to solve X" — community fixes, troubleshooting
  - Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)
  What this skill does NOT do:
  - Implement features → use `/sprint-development`
  - Write unit tests → use `/unit-testing`
  - Refine acceptance criteria → use `/product-management`
  - Define a brand-new product → use `/project-foundation`
  - Scaffold backend / frontend code → use `/project-bootstrap` (greenfield only: `bun run bootstrap:guard` refuses its base phases on an existing app)
  - Teach the agentic layer an existing app → use `/project-adoption`
  - Generate the in-app `/qa` page + credentials artifact → use `/testability-guide`
  Entry path: `.template/installer.lock.json` with `adopted: true` = adopted app (tour the adoption hand-off, never `/project-bootstrap` base phases); otherwise a new project. Stack facts come from `.agents/project.yaml` → `stack:`, never from this skill's defaults.
metadata:
  kind: workflow
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

Activate when a user lands on this repo for the first time and asks "where do I start?", "how does this work?", or invokes `/agentic-dev-onboard`. The skill is a guided tour, not an executor: it explains the stack, the workflow, the MCPs, and the env vars that everything depends on, points at the visual docs hub, then hands off to the right downstream skill.

`/agentic-dev-onboard` is specific to **this** boilerplate and points at the concrete entry points (`/sprint-development`, `/product-management`, etc.). Every stack fact it states is read from the `stack:` block of `.agents/project.yaml`, so the tour describes the app this repo actually holds.

---

## Welcome

This is **agentic-dev-boilerplate** — a dev-only boilerplate for building Next.js apps on the Postgres family with AI agents in the loop. The repo ships skills, scripts, and conventions that turn a Jira ticket into merged code via `/sprint-development`. It reaches a repository by one of two paths, and the tour opens by saying which one this repo took:

| Path | How to tell | Where the app came from | First steps |
| ---- | ----------- | ----------------------- | ----------- |
| New project | `.template/installer.lock.json` absent or without `adopted: true` | `/project-bootstrap` scaffolds the backend and frontend on top of the boilerplate (`bun run bootstrap:guard` exits 0 while no app exists yet) | `bun setup`, then `/project-foundation` → `/design-system` → `/project-bootstrap` |
| Adopted app | `.template/installer.lock.json` records `adopted: true` | the team's own code; `bunx create-agentic-dev --adopt` installed the tooling around it and overwrote nothing | commit the adoption, load `/project-adoption`, then follow the hand-off it prints |

On an adopted app the `/project-bootstrap` base phases are refused (`bun run bootstrap:guard` exits 2 and names the signals): never send the user there to "scaffold" an app that already exists. The adoption hand-off is, in order and one session each: `/project-context refresh-all` (business maps from the code), `/project-foundation` Discovery-only (dev guide + domain glossary, no PRD or SRS), `/git-flow-master` Strategy Setup, and optionally `/design-system extract` and `/testability-guide`. `/sprint-development` works from the maps on such a repo. Install detail: `README.md` → "Adopt an existing app" and `INSTALLER.md`.

If you cloned this repo and you don't yet have `bun setup` complete, start there (on an adopted app, after the adoption commit). Everything else assumes the foundation is green.

**Docs hub (read it in a browser):** `https://upex-galaxy.github.io/agentic-dev-boilerplate/`. It holds the start-here page (`onboarding.html`, also opened locally by `bun run onboarding`), the multi-harness page, and one deck per workflow skill (table below). Hand the user this URL in every tour.

---

## Composable Skills (auto-resolved at skill entry)

This skill is mostly a static walkthrough — it rarely dispatches sub-agents, so composition is minimal. Run once at entry per `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter.
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Apply threshold rule per strategy doc §3.2 (T1/T3 silent; T4 ASK).
4. Inject a `## Composable Skills` block per strategy doc §5.2 only when (rarely) dispatching a sub-agent.

Skip step if the catalog is unavailable; log `skill_resolution: "fallback-inline"` plus `missing: [<categories>]` per §3.4.

---

## Stack

Read the app's stack from `.agents/project.yaml` → `stack:` and present it as a table; never recite a default from memory. The block ships the greenfield defaults (what `/project-bootstrap` scaffolds); on an adopted app `/project-adoption` replaced them with what the app runs, and `bun run setup:doctor` reports any drift between the block and the repo.

| Layer           | Read from                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| Framework       | `stack.framework`, app code under `stack.app_root`                        |
| Database        | `stack.database.engine` + `provider`; schema changes route by `stack.database.migrations_tool` (`agentic-dev-core/references/db-change-doctrine.md`) |
| Package manager | `stack.package_manager`; an app command is `{{stack.package_manager}} run <name from stack.scripts>`, a null script is skipped and said so |
| UI              | `stack.ui` (css, kit, icons)                                              |
| Tests           | `stack.test_runner` + `stack.scripts.test` (the app's own runner; `/unit-testing` never adds a second one). This repo's own tooling suite runs on Bun's test runner |
| Hosting / CI    | `stack.hosting`, `stack.ci`                                               |
| Language        | TypeScript                                                                |
| AI agent        | Claude Code, OpenCode, Codex (CLI + Desktop): one instruction set (always-on `AGENTS.md` + sections under `.agents/instructions/`), one skill store (`.agents/instructions/agent-harnesses.md` §5.5) |

The skills support the set named by `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts`: Next.js (App Router or Pages) on the Postgres family, with bun, one app per repo. A stack outside it stops at the adoption preflight or at `/project-adoption`'s analysis with the field and the value that failed; this skill says so plainly instead of touring workflows that would not fit.

---

## First-time setup

Run the interactive installer once after cloning:

```bash
bun setup
```

This bootstraps `.agents/`, records the harnesses you pick in `.agents/project.yaml` (`harnesses:`), wires Engram (persistent memory) per agent with `engram setup`, asks where secret values live (`.env` by default, or a secret manager), wires the `.env` keys for every MCP server `.mcp.json` declares, and prints how to connect web search at harness level. Full details in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` with the credentials the rest of the workflow expects (see "Critical env vars" below).

**Open the agent with its own binary** in the project folder (`claude`, `opencode` or `codex`) or with its desktop app. No wrapper: the agent process holds no `.env` value (ADR-0016). MCP servers get their credentials from the `.env` loader they start through (`varlock run --filter <its vars>`), and a command that needs a `.env` value runs through `bunx varlock run -- sh -c '...'`; after a `.env` change, restart the agent session. A second working tree (`git worktree add`) needs `bun run worktree:provision` before its first session (`/git-flow-master`, `references/worktrees.md`).

> **Critical Rule #10** (AGENTS.md §1): for build/test/lint commands, **READ `package.json` DIRECTLY** — never trust a hardcoded list in a doc. Scripts drift; `package.json` is canonical.

---

## Primary workflow: `/sprint-development`

`/sprint-development` is the mega-orchestrator for ticket-driven work. Call it with a Jira issue key (`/sprint-development UPEX-123`) and it drives the per-story dev loop end-to-end.

**Jira state machine** (the default workflow; the real statuses and transitions of THIS instance are in `.agents/jira-workflows.json`, so read them there before naming one):

```
Ready For Dev → In Progress → In Review → Ready For QA
```

**Five stages inside the loop:**

| Stage | Name              | What happens                                                                                        |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 1     | Planning          | Read the ticket, load module context, produce an implementation plan, transition to **In Progress** |
| 2     | Implementation    | Write code per plan, run unit tests + lint + types, commit on the feature branch                    |
| 3     | Code Review       | Open the PR, run review                                                                              |
| 4     | Staging Deploy    | Deploy to the integration target (`git_strategy.branches.integration` in `.agents/project.yaml`, or a Preview under `solo-main`), verify by commit SHA, smoke-check, transition to **Ready For QA** |
| 5     | Production Deploy | (Gated, optional) Promote to production (`git_strategy.branches.production`), deploy with rollback plan |

The skill handles Jira transitions, branch creation, commits, PR open, deploy. You confirm at the gates.

---

## Screen design flow (optional — for UI-heavy projects)

UI stories can be built against **agreed screen mockups**, not improvised UI. The loop (AGENTS.md
Critical Rule 14 — UI Fidelity Contract):

```
/design-system (screen-mapping, opt-in)
  → generates a portable DESIGN BRIEF (frozen tokens + your stories' functional intent)
  → YOU paste it into Claude Design (claude.ai/design) or Open Design (open-design.ai),
    iterate, export the bundle into .context/designs/<project>/<batch>/
  → the skill maps the mockups into .context/design/master-design-plan.md
    (per-screen specs + US→Screen map)
  → /sprint-development builds every UI story with the mockup as inspiration;
    the fidelity reference is the live UI + DESIGN.md tokens, and an
    unratified divergence from THEM = review defect
```

The AI never hand-authors mockups on its own: it commissions them through a design tool (Open Design
MCP or equivalent), generates the HTML itself only through a loaded design skill (`frontend-design`,
`ui-ux-pro-max`, `impeccable`: the `frontend-ui` category), or hands you the brief to design in the external tool (which keeps project memory
across batches, so later briefs are light "follow-up" deltas). Either way you ratify every mockup. Entirely
optional: without a master design plan, UI fidelity degrades gracefully to `DESIGN.md` tokens only.

---

## MCPs available

Skills ask for a CAPABILITY and resolve it by tool-name suffix, whatever the server prefix (`agentic-dev-core/references/mcp-capabilities.md`). The committed servers are whatever `.mcp.json` declares; web search runs at harness level, connected once per machine:

| Capability         | Provided by                                              | Use it for                                |
| ------------------ | -------------------------------------------------------- | ----------------------------------------- |
| `library-docs`     | Context7 (committed)                                     | Official library docs (Next.js, Supabase…) |
| `web-search`       | Exa or Tavily at harness level (`bun run setup:doctor`)  | Web search, troubleshooting community Q&A |
| `db`               | the DB MCP for `stack.database.provider` (Supabase when the block says `supabase`) | DB queries, schema changes per `db-change-doctrine.md`, type generation |
| `automation-flows` | n8n (committed)                                          | Workflow automation, scheduled jobs       |

The Atlassian MCP is opt-in (`docs/mcp/`): Jira and Confluence go through `/acli`.

**Decision rule:**

- Use `library-docs` for "how to use X" — official docs, current API
- Use `web-search` for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)

---

## Critical env vars

Place these in `.env` before running anything that talks to a real environment:

| Var                                            | Used by                                |
| ---------------------------------------------- | -------------------------------------- |
| `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`   | **Automation identity** — the account live-UI validation and authenticated probes log in as. Declare the names in `.agents/project.yaml` → `testing.automation_identity`. Must be a DEDICATED non-production account; a missing slot STOPS the sprint instead of improvising a login. See `sprint-development/references/live-ui-identity.md` |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`     | Local dev login (manual / ad-hoc)      |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | Staging smoke tests, manual login      |
| `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` | `acli` Jira CLI, scripts/sync-jira-* (the site HOST is not here — it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url`; read it with `bun run --silent jira:url`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | App runtime, when `stack.database.provider` is `supabase` (the full set is `.env.example`; an adopted app keeps its own variable names, inside or beside the sentinel block the adoption appended) |
| `SUPABASE_ACCESS_TOKEN`                        | Supabase MCP (personal access token), same condition |
| `N8N_API_URL` / `N8N_API_KEY`                  | n8n MCP (`automation-flows`)           |

`.mcp.json` is **committed**, like `opencode.jsonc` and `.codex/config.toml`: on all three hosts every server that needs `.env` values starts through the `.env` loader (`bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>`), which hands it only the variables it names. The actual secret values live in `.env` (gitignored). Never inline a real token in `.mcp.json`.

Verify which variables are set with `bun run setup:doctor` (or `bunx varlock load --agent`, redacted); `bun run vars:check` validates template-variable references, not `.env`. Always check `package.json` for the canonical script name — Critical Rule #10.

---

## Skills and their decks

The committed skill catalog is `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`) and the table in `.agents/instructions/agent-skills-and-mcps.md` §5: read the list there, never from a copy. Repo skills live in `.agents/skills/`. **Policy**: community stack skills (`frontend-design`, `shadcn`, `supabase`, `deploy-to-vercel`, …) install at PROJECT level, into the SAME store, through `bun setup` (the list is `PROJECT_LEVEL_SKILLS` in `cli/install.ts`); only the repo-agnostic ones (`playwright-cli`, `find-skills`, …, `USER_LEVEL_SKILLS` there) stay user-level and harness-specific (`.agents/instructions/agent-skills-and-mcps.md` §5 layout note). Workflow steps that write in a stack domain name and load their stack skills at that step (`agentic-dev-core/references/skill-composition-strategy.md` §3.5); a missing one is reported once with its install path, never skipped silently.

Invocation: on Claude Code `/<skill> <mode>`; on OpenCode and Codex name the skill and the mode in prose ("load `project-context`, mode `data`").

Every workflow skill has a deck on the docs hub, at `https://upex-galaxy.github.io/agentic-dev-boilerplate/decks/<skill>/how-it-works.es.html`, unless the row below says otherwise. Point the user to the deck of the skill you hand them off to:

| Deck path (under the hub URL)                      | Teaches |
| -------------------------------------------------- | ------- |
| `decks/<skill>/how-it-works.es.html`              | the workflow skill `<skill>`: every `kind: workflow` skill in `REGISTRY.md`, except `design-system` (next row) and this skill |
| `decks/design-system/flujo-mockups.es.html`        | `design-system`: token phase and screen phase |
| `decks/context-skills/how-it-works.es.html`       | the business context skills (`business-data-context`, `business-feature-context`, `business-api-context`) and `bun run context:map` |
| `decks/tooling/how-it-works.es.html`              | the utility skills (`acli`, `vercel-cli`), CLI → skill auto-load, launch + the MCP `.env` loader |
| `decks/agentic-dev-core/capa-comportamental.es.html` | how the agent writes back (AGENTS.md §2) |
| `decks/agentic-dev-core/pbi-jira-cache.es.html`    | `.context/PBI/` as a Jira cache (`.agents/instructions/agent-local-context-pbi.md` §9) |
| `decks/progressive-disclosure/how-it-works.es.html` | how the instructions load: always-on `AGENTS.md`, routed sections, the hook's `ROUTE:` line, budgets (ADR-0009) |
| `harnesses.es.html`                                | the three hosts (`.agents/instructions/agent-harnesses.md` §5.5) |

This skill has no deck of its own: the hub and its start-here page are its surface.

Browser automation is provided by `/playwright-cli` (community skill from `microsoft/playwright-cli`, installed by setup; `.agents/instructions/agent-tool-resolution.md` §6 resolves `[AUTOMATION_TOOL]` to it).

Long sessions: when the context window runs high or work must outlive the session, `/session-handoff` writes the handoff and launches the successor in the same worktree and harness.

---

## Community skills installed at user level

`bun setup` also runs `bunx skills add --global` for the cross-project skills in the `USER_LEVEL_SKILLS` array of `cli/install.ts` (the last row of the table below is NOT one of them: the orchestration binary installs it, not `setup`). It asks per skill, all pre-checked; a skill you uncheck is recorded as declined and not offered again, and a non-interactive run installs every skill not declined.

**Every installed skill needs a LOADER, or it should not be installed.** An install that no flow ever reaches is tokens spent on a capability nobody invokes, and the failure is silent, because an unused skill looks exactly like a working one. So the third column names the skill or doctrine that reaches this one and the moment it does, or says plainly that only a human invokes it. `bun run skills:check` (`T4-LOADER`) fails when a `USER_LEVEL_SKILLS` slug has no row, or a row whose loader cell neither cites its loader in backticks nor says "user-invoked only".

| Skill | Source | Loaded by / when |
| --- | --- | --- |
| `find-skills` | vercel-labs/skills | **automatic, last resort.** `agentic-dev-core/references/skill-composition-strategy.md` §6.2: scan T1, then installed T3+T4, and only if a task domain still has no match does any flow invoke this; it asks before installing |
| `github-actions-docs` | xixu-me/skills | `/project-bootstrap` CI phase and `/sprint-development`, through the `ci-cd` category (T4: asks before loading) |
| `html-ppt` | lewislulu/html-ppt-skill | **user-invoked only.** `packages/decks/` is hand-authored; this is for a one-off deck outside that tree |
| `playwright-cli` | microsoft/playwright-cli | `/sprint-development` live-UI validation, where `[AUTOMATION_TOOL]` resolves to it (`.agents/instructions/agent-tool-resolution.md` §6) |
| `mkd` | upex-galaxy/agentic-user-skills | any flow that reaches the decision threshold in `agentic-dev-core/references/decision-elicitation-doctrine.md` (a heavy decision: real tradeoffs, architecture, a larger change; small decisions are swept with the harness question tool instead) |
| `orchestration.orchestrator_skills` | the orchestration binary | `/orca-orchestration`, ALONGSIDE it: the vendor owns the command grammar, the repo skill owns when and what |

## Persistent memory via Engram

`bun setup` wires Engram per agent with `engram setup <agent>` and offers the Engram Claude Code plugin — persistent memory that survives across sessions and compactions. No gentle-ai bundle is installed (AGENTS.md §12 covers the proactive-save protocol). Full details in [`INSTALLER.md`](../../../INSTALLER.md).

---

## Where to learn more (AGENTS.md pointers)

The AI persistent-memory file at the repo root (`AGENTS.md`, always loaded) carries the binding core and a router; the detail lives in one file per section under `.agents/instructions/`, read on demand. Before your first ticket, skim these:

- **`AGENTS.md` router + LOAD PROTOCOL** — which section file each kind of request loads; a `ROUTE: read <file>` line the prompt hook injects names the same file and is binding. A rule only this project has lives in `.agents/instructions/agent-project.md`; how the sections work and how to edit them: `.agents/instructions/README.md`.
- **§1 CRITICAL RULES** (binding sentences in `AGENTS.md`, full text in `.agents/instructions/agent-critical-rules.md`) — the rules that override defaults (credentials, plan-before-coding, no AI attribution + forensic trailers, MCP credential failure protocol, `READ package.json DIRECTLY`, UI fidelity contract, verify at the destination, committed prose names the source of truth).
- **§4 CONTEXT LOADING MAP** (`.agents/instructions/agent-context-map.md`) — task → trigger phrase → skill → context files → primary tool.
- **§5 SKILLS + MODES + MCPs REGISTRY** (`.agents/instructions/agent-skills-and-mcps.md`) — full T1/T3/T4 skill model, skill modes, MCP capabilities.
- **§5.5 MULTI-HARNESS** (`.agents/instructions/agent-harnesses.md`) — one source, three hosts: what is generated, the hook, MCP parity, launch gotchas.
- **§12 PROACTIVE MEMORY TRIGGERS** — when to call `mem_save` without being asked.

---

## Next steps after the onboard

Run through this checklist before you reach for your first ticket:

- [ ] Adopted app only: is the adoption committed, and does `/project-adoption check` report every signal `ADOPTED`?
- [ ] Did you run the setup script (`bun setup` — verify name in `package.json`)?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `SUPABASE_*`, `N8N_*`)? Did you connect a web-search provider at harness level (`bun run setup:doctor`)?
- [ ] Did you open the agent in the project folder (`claude`, `opencode`, `codex`, or the desktop app), and do its MCP servers show as connected (they read `.env` through the loader)?
- [ ] Does the agents linter (`bun run vars:check` per `package.json`) exit clean (0 errors)?
- [ ] Does Engram appear in the active MCP list (restart your agent if not)?
- [ ] Did you open the docs hub (`https://upex-galaxy.github.io/agentic-dev-boilerplate/`) and the deck of the skill you are about to use?
- [ ] Ready for your first ticket: `/sprint-development <UPEX-XXX>`

If any box is unchecked, fix that first. The downstream skills assume a green foundation.

---

## What this skill does NOT do

- Implement features → use `/sprint-development`
- Write unit tests → use `/unit-testing`
- Refine acceptance criteria → use `/product-management`
- Define a brand-new product → use `/project-foundation`
- Scaffold backend / frontend code → use `/project-bootstrap` (greenfield only)
- Teach the agentic layer an existing app → use `/project-adoption`
- Generate the in-app `/qa` page + credentials artifact → use `/testability-guide`

The onboard tour ends once the user knows which skill to call next. From there, the relevant workflow skill takes over.
