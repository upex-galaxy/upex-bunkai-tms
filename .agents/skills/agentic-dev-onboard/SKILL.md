---
name: agentic-dev-onboard
description: "Onboard a newcomer to this repo's dev flow and hand off to the right skill. Use when someone is new here and asks where to start or how the repo works; when an existing app was just adopted and the next step is unclear. Not for ticket work (sprint-development)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation
complementary_categories: []
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the MCP decision rule + "What this skill does not do" in the body below.
compact_rules: |
  - Use `library-docs` (Context7) for "how to use X": official docs, current API
  - Use `web-search` (Exa or Tavily, connected at harness level) for "how to solve X": community fixes, troubleshooting
  - Use Atlassian only as a fallback; prefer the `/acli` skill (fewer tokens, faster)
  What this skill does not do:
  - Implement features: use `/sprint-development`
  - Write unit tests: use `/unit-testing`
  - Refine acceptance criteria: use `/product-management`
  - Define a brand-new product: use `/project-foundation`
  - Scaffold backend or frontend code: use `/project-bootstrap` (greenfield only; `bun run bootstrap:guard` refuses its base phases on an existing app)
  - Teach the agentic layer an existing app: use `/project-adoption`
  - Generate the in-app `/qa` page and credentials artifact: use `/testability-guide`
  Entry path: `.template/installer.lock.json` with `adopted: true` is an adopted app (tour the adoption hand-off, never the `/project-bootstrap` base phases); otherwise it is a new project. Stack facts come from the `stack:` block of `.agents/project.yaml`, never from this skill's defaults.
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

# Agentic Dev Onboard: first-time tour of this repo

This skill is a guided tour for someone who has just landed on the repo and asks "where do I start?" or "how does this work?", or who types `/agentic-dev-onboard`. It explains the stack, the workflow, the MCPs and the env vars everything depends on, gives the docs hub, and ends by naming the skill to call next. It executes nothing: the downstream skill does the work. Every stack fact it states is read from the `stack:` block of `.agents/project.yaml`, so the tour describes the app this repo holds, not a default.

---

## Welcome

This is **agentic-dev-boilerplate**, a dev-only boilerplate for building Next.js apps on the Postgres family with AI agents in the loop. It ships skills, scripts and conventions that turn a Jira ticket into merged code through `/sprint-development`. A repo reaches it by one of two paths, and the tour opens by saying which one this repo took:

| Path | How to tell | Where the app came from | First steps |
| ---- | ----------- | ----------------------- | ----------- |
| New project | `.template/installer.lock.json` absent or without `adopted: true` | `/project-bootstrap` scaffolds the backend and frontend on top of the boilerplate (`bun run bootstrap:guard` exits 0 while no app exists yet) | `bun setup`, then `/project-foundation`, `/design-system` and `/project-bootstrap`, in that order |
| Adopted app | `.template/installer.lock.json` records `adopted: true` | the team's own code; `bunx create-agentic-dev --adopt` installed the tooling around it and overwrote nothing | commit the adoption, load `/project-adoption`, then follow the hand-off it prints |

On an adopted app the `/project-bootstrap` base phases are refused (`bun run bootstrap:guard` exits 2 and names the signals), so never send the user there. The adoption hand-off runs in this order, one session each:

1. `/project-context refresh-all` builds the business maps from the code.
2. `/project-foundation` in Discovery-only mode writes the dev guide and the domain glossary, with no PRD or SRS.
3. `/git-flow-master` runs Strategy Setup.
4. Optionally `/design-system extract` and `/testability-guide`.

`/sprint-development` works from the maps on such a repo. Install detail is in `README.md` ("Adopt an existing app") and `INSTALLER.md`.

A fresh clone needs `bun setup` first (on an adopted app, after the adoption commit); everything else assumes the foundation is green.

**Docs hub, to read in a browser:** `https://upex-galaxy.github.io/agentic-dev-boilerplate/`. It holds the start-here page (`onboarding.html`, also opened locally by `bun run onboarding`), the multi-harness page and one deck per workflow skill (table below). Hand the user this URL in every tour. When the person wants to learn a topic over several sessions (a course, not a quick explanation), tell them to type `/teach`: it is installed at user level, only a person can start it (no skill can load it), and it keeps its own mission, lessons and learning record in the folder where it runs. The tour itself stays for quick explanations inside this session.

---

## Composable Skills (auto-resolved at skill entry)

This skill is a static walkthrough and rarely dispatches subagents, so composition is minimal. Resolve once at entry, following `agentic-dev-core/references/skill-composition-strategy.md`:

1. Read `complementary_categories` from this skill's frontmatter.
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is not this scan.
3. Apply the threshold rule of strategy doc §3.2 (T1 and T3 silent; T4 asks).
4. Only when this skill dispatches a subagent, inject a `## Composable Skills` block per §5.2.

When the catalog is unavailable, skip the step and log `skill_resolution: "fallback-inline"` plus `missing: [<categories>]` per §3.4.

---

## With nobody at the keyboard

The tour only reads and explains. Its one question is the T4 ask above; when nobody can answer it, `agentic-dev-core/references/decision-protocol.md` says where the answer comes from, and without a delegating brief the T4 load is skipped and the report says so. Installing is a person's job at a terminal, so a run with nobody there reports what is missing and stops.

---

## Stack

Read the app's stack from `.agents/project.yaml`, key `stack:`, and present it as a table. Do not recite a default from memory. The block ships the greenfield defaults (what `/project-bootstrap` scaffolds); on an adopted app `/project-adoption` replaced them with what the app runs, and `bun run setup:doctor` reports any drift between the block and the repo.

| Layer           | Read from                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| Framework       | `stack.framework`, app code under `stack.app_root`                        |
| Database        | `stack.database.engine` + `provider`; schema changes route by `stack.database.migrations_tool` (`agentic-dev-core/references/db-change-doctrine.md`) |
| Package manager | `stack.package_manager`; an app command is `{{stack.package_manager}} run <name from stack.scripts>`, a null script is skipped and said so |
| UI              | `stack.ui` (css, kit, icons)                                              |
| Tests           | `stack.test_runner` + `stack.scripts.test` (the app's own runner; `/unit-testing` never adds a second one). This repo's own tooling suite runs on Bun's test runner |
| Hosting / CI    | `stack.hosting`, `stack.ci`                                               |
| Language        | TypeScript                                                                |
| AI agent        | Claude Code, OpenCode, Codex (CLI + Desktop), Pi: one instruction set (always-on `AGENTS.md` plus sections under `.agents/instructions/`) and one skill store (`.agents/instructions/agent-harnesses.md` §5.5) |

The skills support the set named by `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts`: Next.js (App Router or Pages) on the Postgres family, with bun, one app per repo. A stack outside it stops at the adoption preflight or at `/project-adoption`'s analysis, with the field and value that failed. Say so instead of touring workflows that would not fit.

---

## First-time setup

Run the interactive installer once after cloning:

```bash
bun setup
```

It bootstraps `.agents/`, records the harnesses you pick in `.agents/project.yaml` (`harnesses:`), wires Engram (persistent memory) per agent with `engram setup`, offers RTK token savings on Claude Code (optional, user level), asks where secret values live (`.env` by default, or a secret manager), wires the `.env` keys for every MCP server `.mcp.json` declares, and prints how to connect web search at harness level. Full details are in [`INSTALLER.md`](../../../INSTALLER.md).

After setup, fill `.env` (see "Critical env vars").

Open the agent with its own binary in the project folder (`claude`, `opencode`, `codex` or `pi`) or with its desktop app, with no wrapper, so the agent process holds no `.env` value (ADR-0016). MCP servers get their credentials from the `.env` loader they start through (`varlock run --filter <its vars>`), and a command that needs a `.env` value runs through `bunx varlock run -- sh -c '...'`. Restart the agent session after a `.env` change. A second working tree (`git worktree add`) needs `bun run worktree:provision` first (`/git-flow-master`, `references/worktrees.md`).

> **Critical Rule #10** (AGENTS.md §1): for build, test and lint commands, read `package.json` directly. Scripts drift and `package.json` is canonical, so a command quoted in a doc is never the source.

---

## Primary workflow: `/sprint-development`

`/sprint-development` is the mega-orchestrator for ticket-driven work. Call it with a Jira issue key (`/sprint-development UPEX-123`) and it drives the per-story dev loop from start to finish.

The default Jira state machine is below. The real statuses and transitions of this instance are in `.agents/jira-workflows.json`, so read them there before naming one.

```
Ready For Dev → In Progress → In Review → Ready For QA
```

The loop has five stages:

| Stage | Name              | What happens                                                                                        |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 1     | Planning          | Read the ticket, load module context, produce an implementation plan, transition to In Progress |
| 2     | Implementation    | Write code per plan, run unit tests, lint and types, commit on the feature branch                   |
| 3     | Code Review       | Open the PR, run review                                                                             |
| 4     | Staging Deploy    | Deploy to the integration target (`git_strategy.branches.integration` in `.agents/project.yaml`, or a Preview under `solo-main`), verify by commit SHA, smoke-check, transition to Ready For QA |
| 5     | Production Deploy | Gated and optional: promote to production (`git_strategy.branches.production`), deploy with a rollback plan |

The skill handles Jira transitions, branch creation, commits, the PR and the deploy. The person confirms at its gates.

---

## Screen design flow (optional, for UI-heavy projects)

UI stories can be built against agreed screen mockups instead of improvised UI. This is the loop behind Critical Rule 14, the UI Fidelity Contract in `AGENTS.md`:

```
/design-system (screen-mapping, opt-in)
  -> generates a portable DESIGN BRIEF (frozen tokens + your stories' functional intent)
  -> YOU paste it into Claude Design (claude.ai/design) or Open Design (open-design.ai),
     iterate, export the bundle into .context/designs/<project>/<batch>/
  -> the skill maps the mockups into .context/design/master-design-plan.md
     (per-screen specs + US-to-Screen map)
  -> /sprint-development builds every UI story with the mockup as inspiration;
     the fidelity reference is the live UI + DESIGN.md tokens, and an
     unratified divergence from THEM is a review defect
```

The agent does not hand-author mockups on its own. It commissions them through a design tool (Open Design MCP or equivalent), generates the HTML only through a loaded design skill (the `frontend-ui` category), or hands the user the brief to design in the external tool. The user ratifies every mockup. Without a master design plan, UI fidelity falls back to the `DESIGN.md` tokens alone.

---

## MCPs available

Skills ask for a capability and resolve it by tool-name suffix, whatever the server prefix (`agentic-dev-core/references/mcp-capabilities.md`). The committed servers are whatever `.mcp.json` declares; web search runs at harness level, connected once per machine.

| Capability         | Provided by                                              | Use it for                                |
| ------------------ | -------------------------------------------------------- | ----------------------------------------- |
| `library-docs`     | Context7 (committed)                                     | Official library docs (Next.js, Supabase and others) |
| `web-search`       | Exa or Tavily at harness level (`bun run setup:doctor`)  | Web search, troubleshooting community Q&A |
| `db`               | the DB MCP for `stack.database.provider` (Supabase when the block says `supabase`) | DB queries, schema changes per `db-change-doctrine.md`, type generation |
| `automation-flows` | n8n (committed)                                          | Workflow automation, scheduled jobs       |

The Atlassian MCP is opt-in (`docs/mcp/`); Jira and Confluence go through `/acli`.

The decision rule is in the compact rules: `library-docs` for "how to use X", `web-search` for "how to solve X", Atlassian only as a fallback because `/acli` costs fewer tokens.

---

## Critical env vars

Put these in `.env` before running anything that talks to a real environment:

| Var                                            | Used by                                |
| ---------------------------------------------- | -------------------------------------- |
| `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`   | The automation identity: the account live-UI validation and authenticated probes log in as. Declare the names in the key `testing.automation_identity` of `.agents/project.yaml`. Use a dedicated non-production account. A missing slot stops the sprint, because improvising a login is worse than waiting. See `sprint-development/references/live-ui-identity.md` |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`     | Local dev login (manual or ad-hoc)     |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | Staging smoke tests, manual login      |
| `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` | `acli` Jira CLI, scripts/sync-jira-* (the site host is not here: it lives in the key `issue_tracker.atlassian_url` of `.agents/project.yaml`; read it with `bun run --silent jira:url`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | App runtime, when `stack.database.provider` is `supabase` (the full set is `.env.example`; an adopted app keeps its own variable names, inside or beside the sentinel block the adoption appended) |
| `SUPABASE_ACCESS_TOKEN`                        | Supabase MCP (personal access token), same condition |
| `N8N_API_URL` / `N8N_API_KEY`                  | n8n MCP (`automation-flows`)           |

`.mcp.json` is committed, like `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json`. On every host, each server that needs `.env` values starts through the `.env` loader (`bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>`), which hands it only the variables it names. The secret values live in `.env` (gitignored), so keep real tokens out of `.mcp.json`.

To see which variables are set, run `bun run setup:doctor` (or `bunx varlock load --agent`, redacted). `bun run vars:check` validates template-variable references, not `.env`. Check `package.json` for the canonical script name (Critical Rule #10).

---

## Skills and their decks

The committed skill catalog is `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`) and the table in `.agents/instructions/agent-skills-and-mcps.md` §5. Read the list there, never from a copy. Repo skills live in `.agents/skills/`.

Community stack skills install at project level into the same store through `bun setup` (the list is `PROJECT_LEVEL_SKILLS` in `cli/install.ts`). Only the repo-agnostic ones stay user-level and harness-specific (`USER_LEVEL_SKILLS` there; `.agents/instructions/agent-skills-and-mcps.md` §5 layout note). A workflow step that writes in a stack domain names and loads its stack skills at that step (`agentic-dev-core/references/skill-composition-strategy.md` §3.5), and reports a missing one once with its install path.

Invocation: on Claude Code `/<skill> <mode>`; on Pi `/skill:<skill> <mode>`; on OpenCode and Codex, name the skill and the mode in prose ("load `project-context`, mode `data`").

Every workflow skill has a deck on the docs hub at `https://upex-galaxy.github.io/agentic-dev-boilerplate/decks/<skill>/how-it-works.es.html`, unless the table says otherwise. Point the user to the deck of the skill you hand them off to. The decks are written in Spanish; every deck has an English twin, `<name>.en.html`, next to it (same slides, same shell), so offer the twin to an English speaker.

| Deck path (under the hub URL)                      | Teaches |
| -------------------------------------------------- | ------- |
| `decks/<skill>/how-it-works.es.html`              | the workflow skill `<skill>`: every `kind: workflow` skill in `REGISTRY.md`, except `design-system` (next row) and this skill |
| `decks/design-system/flujo-mockups.es.html`        | `design-system`: token phase and screen phase |
| `decks/context-skills/how-it-works.es.html`       | the business context skills (`business-data-context`, `business-feature-context`, `business-api-context`) and `bun run context:map` |
| `decks/tooling/how-it-works.es.html`              | the utility skills (`acli`, `vercel-cli`), the CLI-to-skill auto-load, launch, and the MCP `.env` loader |
| `decks/agentic-dev-core/capa-comportamental.es.html` | how the agent writes back (AGENTS.md §2) |
| `decks/agentic-dev-core/pbi-jira-cache.es.html`    | `.context/PBI/` as a Jira cache (`.agents/instructions/agent-local-context-pbi.md` §9) |
| `decks/progressive-disclosure/how-it-works.es.html` | how the instructions load: always-on `AGENTS.md`, routed sections, the hook's `ROUTE:` line, budgets (ADR-0009) |
| `decks/user-level-skills/how-it-works.es.html` | the user-level skills `setup` installs (portal: what each does, who calls it, a link to its own deck) |
| `harnesses.es.html`                                | the supported hosts (`.agents/instructions/agent-harnesses.md` §5.5) |

Each user-level skill from `upex-galaxy/agentic-user-skills` also ships its own deck inside its installed folder: `~/.agents/skills/<name>/how-it-works.es.html` (English twin `.en.html`; `~/.claude/skills/<name>/` when the skills CLI installed it for Claude Code alone). Ask before opening it in the browser.

This skill has no deck of its own: the hub and its start-here page are its surface.

Browser automation is `/playwright-cli`, a community skill from `microsoft/playwright-cli` that setup installs (`.agents/instructions/agent-tool-resolution.md` §6 resolves `[AUTOMATION_TOOL]` to it).

When the context window runs high or work must outlive the session, `/session-handoff` writes the handoff and launches the successor in the same worktree and harness.

---

## Community skills installed at user level

`bun setup` also runs `bunx skills add --global` for the cross-project skills in the `USER_LEVEL_SKILLS` array of `cli/install.ts`; that array is the list, so this table follows it row for row and never replaces it. The last row is not in the array: the orchestration binary installs it, not `setup`. Setup asks per skill with every box pre-checked, records an unchecked skill as declined and does not offer it again, and a non-interactive run installs every skill not declined.

Every installed skill needs a loader, or it should not be installed: an install no flow reaches costs tokens for a capability nobody invokes, and the failure is silent. So the third column names the file and the moment that reaches the skill, or says it is user-invoked only. `bun run skills:check` (`T4-LOADER`) fails when a `USER_LEVEL_SKILLS` slug has no row, or a row whose loader cell neither cites its loader in backticks nor says "user-invoked only".

A step that loads one of these says `Call the Skill tool with "<name>"` and states what happens when the skill is not installed: the step runs inline and the report says so, and nothing blocks. Find every loader with `git grep -n -F 'Call the Skill tool with "<name>"'`.

| Skill | Source | Loaded by / when |
| --- | --- | --- |
| `find-skills` | vercel-labs/skills | Automatic, as a last resort. `agentic-dev-core/references/skill-composition-strategy.md` §6.2 scans T1 first, then installed T3 and T4, and only when a task domain still has no match does any flow invoke this one. It asks before installing |
| `github-actions-docs` | xixu-me/skills | `/project-bootstrap` CI phase and `/sprint-development`, through the `ci-cd` category (T4: asks before loading) |
| `html-ppt` | lewislulu/html-ppt-skill | User-invoked only. `packages/decks/` is hand-authored; this one is for a one-off deck outside that tree |
| `playwright-cli` | microsoft/playwright-cli | `/sprint-development` live-UI validation, where `[AUTOMATION_TOOL]` resolves to it (`.agents/instructions/agent-tool-resolution.md` §6) |
| `mkd` | upex-galaxy/agentic-user-skills | Any flow that reaches the decision threshold in `agentic-dev-core/references/decision-elicitation-doctrine.md` (a heavy decision: real tradeoffs, architecture, a larger change; small decisions are swept with the harness question tool instead) |
| `humanizer` | upex-galaxy/agentic-user-skills | The prose pass of `agentic-dev-core/references/skill-scaffold.md` ("How a skill is written", the `Call the Skill tool with "humanizer"` line) and `agentic-dev-core/references/instructions-doctrine.md` §6 (step 3), and `pr-review-lead/references/output-and-posting-flow.md` Step 6; when it is not installed the pass runs inline |
| `writing-for-agents` | upex-galaxy/agentic-user-skills | The structure pass of `agentic-dev-core/references/skill-scaffold.md` ("How a skill is written", the `Call the Skill tool with "writing-for-agents"` line) and `agentic-dev-core/references/instructions-doctrine.md` §6 (step 3); when it is not installed the pass runs inline |
| `agent-orchestration` | upex-galaxy/agentic-user-skills | The `orca` row of `.agents/instructions/agent-tool-resolution.md` §6.5 and its `[ORCHESTRATION_TOOL]` row in §6: loaded before any `orca` call, by a conductor (`/sprint-development` fleet mode, `/autonomous-delivery` Phase 3 workers) and by a worker; this repo's half is `agentic-dev-core/references/fleet-project-profile.md`. When it is not installed, the fleet runs on subagents plus `launch.txt` |
| `show-me-your-work` | upex-galaxy/agentic-user-skills | `/agent-orchestration` `## Brakes and the decision log` and `.agents/skills/autonomous-delivery/SKILL.md` `## Autonomy`: an unattended or long run calls it for the log format; when it is not installed the log keeps the same six columns by hand |
| `retro` | upex-galaxy/agentic-user-skills | `/agent-orchestration` Quick start step 7 and its conductor cycle §9: the harvest at the close of a run; when it is not installed the harvest runs inline |
| `diagnosing-bugs` | upex-galaxy/agentic-user-skills | `.agents/skills/sprint-development/SKILL.md` Stage 2 "Bug fix" and `.agents/skills/sprint-development/references/bug-fix-workflow.md` Phase 2: a bug whose cause is not obvious; when it is not installed the step writes the failing command first and says the method was missing |
| `blast-radius` | upex-galaxy/agentic-user-skills | `.agents/skills/sprint-development/SKILL.md` Stage 3 opening paragraph: a diff not trusted to be contained; when it is not installed the merge danger is judged by hand |
| `grilling` | upex-galaxy/agentic-user-skills | `.agents/skills/product-management/SKILL.md` workflows B and D, `.agents/skills/product-management/references/add-feature.md`, `.agents/skills/product-management/references/story-refinement.md`, `.agents/skills/product-management/references/epic-creation.md` and `.agents/skills/project-foundation/SKILL.md` Phases 1 and 2: open questions that decide scope; when it is not installed the same questions are asked as a numbered list |
| `domain-modeling` | upex-galaxy/agentic-user-skills | `.agents/skills/product-management/references/epic-creation.md` "When the epic is too big to plan" and `.agents/skills/project-foundation/SKILL.md` Phase 4 Step 6: settles the domain terms; when it is not installed the questions run inline |
| `research` | upex-galaxy/agentic-user-skills | `.agents/skills/product-management/references/epic-creation.md` "When the epic is too big to plan": a `research` decision ticket given to a fresh subagent; when it is not installed the subagent researches inline |
| `teach` | upex-galaxy/agentic-user-skills | User-invoked only. `/teach` is manual (`disable-model-invocation`), so no flow loads it; the tour tells a person to type it for a multi-session course |
| `orchestration.orchestrator_skills` | the orchestration binary | `/agent-orchestration`, beside it: the vendor owns the command grammar and the user skill owns when and what; a worker loads only the `orchestration` guide |

---

## Persistent memory via Engram

`bun setup` wires Engram per agent with `engram setup <agent>` and offers the Engram Claude Code plugin, so memory survives across sessions and compactions. No gentle-ai bundle is installed. `AGENTS.md` §12 has the proactive-save protocol and `INSTALLER.md` the details.

---

## Token savings with RTK (optional, user level)

RTK (`rtk-ai/rtk`) compresses the output of shell commands such as `git status` before the agent reads it, so sessions spend fewer tokens. `rtk gain` shows the savings. It installs once per machine, in the user-level Claude Code config, and works only with Claude Code here. `bun setup` already offers it in an interactive run ([`INSTALLER.md`](../../../INSTALLER.md), "RTK").

Offer the prompt below only to a newcomer on Claude Code who does not have RTK (`rtk gain` fails or `rtk` is missing), and ask first: it edits `~/.claude/settings.json`. Never install it on your own, and never when the user declined it. The prompt itself shows a dry run and waits for a confirmation before it changes anything.

````text
Install RTK (rtk-ai/rtk), the token-saving output compressor, for Claude Code on this machine.

First, check the machine state. If `rtk` is already installed (`rtk gain` exits 0) and its Claude Code hook is already in ~/.claude/settings.json (a PreToolUse command containing "rtk hook claude"), report that and change nothing.

Otherwise:
1. Detect the OS and the package manager, then install with the matching command:
   - macOS or Linux with Homebrew: brew install rtk
   - Windows: winget install rtk-ai.rtk
   - Anything else: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
2. Verify with `rtk --version` and `rtk gain`. A different crate also named "rtk" exists: if `rtk gain` fails, it is the wrong binary, so stop and explain.
3. Run `rtk -v init --global --dry-run`, show me the full output and wait for my confirmation.
4. After I confirm, run `rtk init --global --auto-patch`.
5. Tell me to restart Claude Code so the hook loads.
6. Validate: `rtk rewrite "git status"` must print a rewritten command, and `rtk rewrite "supabase db diff"` must exit 1 (not rewritten, by design).

Do not use rtk-proxy or any pipeline feature. If any step fails, stop and explain what happened instead of working around it.
To uninstall later: rtk init --global --uninstall
````

---

## Where to learn more (AGENTS.md pointers)

`AGENTS.md` at the repo root is always loaded. It carries the binding core and a router, and the detail lives in one file per section under `.agents/instructions/`, read on demand. Before the first ticket, skim these:

- The router and LOAD PROTOCOL say which section file each kind of request loads. A `ROUTE: read <file>` line from the prompt hook names the same file and is binding. A rule only this project has lives in `.agents/instructions/agent-project.md`; `.agents/instructions/README.md` explains how the sections work and how to edit them.
- §1 CRITICAL RULES: binding sentences in `AGENTS.md`, full text in `.agents/instructions/agent-critical-rules.md`. They override defaults.
- §4 CONTEXT LOADING MAP (`.agents/instructions/agent-context-map.md`) maps a task to its trigger phrase, skill, context files and primary tool.
- §5 SKILLS + MODES + MCPs REGISTRY (`.agents/instructions/agent-skills-and-mcps.md`) holds the T1/T3/T4 skill model, the modes and the MCP capabilities.
- §5.5 MULTI-HARNESS (`.agents/instructions/agent-harnesses.md`) covers what is generated per host, the hook, MCP parity and launch gotchas.
- §12 PROACTIVE MEMORY TRIGGERS says when to call `mem_save` without being asked.

---

## Next steps after the onboard

The tour is done when the user can tick this list and knows which skill to call next.

- [ ] Adopted app only: is the adoption committed, and does `/project-adoption check` report every signal `ADOPTED`?
- [ ] Did you run the setup script (`bun setup`, name verified in `package.json`)?
- [ ] Is `.env` filled with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `SUPABASE_*`, `N8N_*`), and is a web-search provider connected at harness level (`bun run setup:doctor`)?
- [ ] Is the agent open in the project folder (`claude`, `opencode`, `codex`, `pi`, or the desktop app; Pi needs `/trust` on the folder first), with its MCP servers connected and Engram in the active list (restart the agent if not)?
- [ ] Does `bun run vars:check` (name per `package.json`) exit with 0 errors?
- [ ] Did you open the docs hub and the deck of the skill you are about to use?
- [ ] Ready for your first ticket: `/sprint-development <UPEX-XXX>`

If a box is unchecked, fix that first, because the downstream skills assume a green foundation.

---

## What this skill does not do

The compact rules list the neighbours that own the work this tour only points at (`/sprint-development`, `/unit-testing`, `/product-management`, `/project-foundation`, `/project-bootstrap`, `/project-adoption`, `/testability-guide`). Once the user knows which one to call next, the tour ends and that skill takes over.
