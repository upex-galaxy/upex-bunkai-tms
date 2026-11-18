---
id: skills-and-mcps
title: "Skills, modes and MCPs registry"
load_when: "choosing, invoking or editing a skill or one of its modes, adding a skill, or deciding which MCP capability provides a tool"
triggers: ["\\bskills?\\b", "\\bmodes?\\b", "(?<![./])\\bmcps?\\b", "context7", "web search", "\\bexa\\b", "tavily", "n8n", "REGISTRY\\.md"]
paths: [".agents/skills/"]
---

# Skills, modes and MCPs registry

> Section `skills-and-mcps` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 5. Skills, modes and MCPs registry

### Skills T1 (committed in `.agents/skills/`)

| Skill | Trigger | Purpose |
|---|---|---|
| `agentic-dev-core` | (loaded by other skills) | Passive host for shared doctrine: briefing template, dispatch patterns, orchestration, skill-composition strategy, behavioral layer, model routing, skill resolver, topic-key conventions, TypeScript patterns. Workflow skills load it on demand; nobody invokes it directly. |
| `agentic-dev-onboard` | `/agentic-dev-onboard` | First-time orientation: the stack, the Jira workflow, the skill map and the MCPs. |
| `project-foundation` | `/project-foundation` | Constitution, architecture (PRD and SRS) and discovery (data, API, dev guide). For an existing app it runs discovery only, from the code. |
| `design-system` | `/design-system` | Two phases at different moments. The token phase writes DESIGN.md (Google Labs spec, 5 paths) once, before scaffolding; mode `extract` writes it instead from an existing app's live theme and only reads app code. The screen phase makes per-story mockups just in time, invoked alone or routed from the design gate of `/sprint-development`. |
| `project-bootstrap` | `/project-bootstrap` | Infra scaffolding: backend, frontend, OpenAPI, auth, env, Supabase types. The base phases are greenfield only (`bun run bootstrap:guard` refuses them on an existing app, which goes to `/project-adoption`); the add-ons read `stack:`. |
| `project-adoption` | `/project-adoption` (modes `adopt`, `check`) | The understanding layer for an existing app after the updater's `--adopt` install. `adopt` analyses the app without writing, saves `.context/reports/project-adoption-plan.md` as PENDING APPROVAL, then writes only to agentic surfaces (identity, `stack:`, environments, `.env` slots, Jira catalogs, protected paths, the saved instruction merge) and verifies with the app's own scripts against their baseline. It never touches app code, a database, dependencies, CI or git history. `check` is a read-only drift report. |
| `testability-guide` | `/testability-guide` | Generates the in-app `/qa` page ("Software Testability Guide for QA") and a tool-agnostic credentials artifact (Jira Epic by default, or Confluence, Notion, MCP, CLI, manual paste). Re-runs are idempotent through snapshot-comment drift detection. |
| `product-management` | `/product-management` | Backlog seed, epics, INVEST and AC refinement, sprint report. |
| `sprint-development` | `/sprint-development` | The mega-orchestrator. Takes each story through plan, implement, review, staging and prod, with a gate between stages. |
| `unit-testing` | `/unit-testing` | TDD red-green-refactor, mocking, coverage. Composes with `/sprint-development`. |
| `autonomous-delivery` | `/autonomous-delivery` | Scheduled or unattended delivery runs, with no human on the line. Phases: lock, audit (git is the truth, the tracker is a hint), select genuinely unblocked work, execute through the owning pipeline skill, close and report. Modes: `story` (one per run), `bug` (up to three, sequential), `discovery` (backlog only, writes no code). |
| `git-flow-master` | (loads on git and PR intents) | End-to-end Git operator. Detects the branching strategy and keeps it in parity with the host ruleset through `bun run git:policy` (verify, apply). |
| `pr-review-lead` | `/pr-review-lead` | Tech Lead review of a teammate's or an external repo's PR (through `gh`): a strictness preflight (Flexible, Standard, Strict), every finding cited to code or doctrine (TypeScript patterns, layer boundaries, Rule #14, ADRs, RPC authorization), Real, Pattern and Positive buckets plus a score, and a post only after an explicit OK. It shares its checklist and severity scale with Stage 3 of `/sprint-development` (`review-pr.md`), which stays the in-pipeline story reviewer. |
| `session-handoff` | `/session-handoff` | Hands the whole session to a successor when the context window runs high or the work outlives the session. Writes `<<PRIMARY_ROOT>>/.session/handoffs/<session>-handoff-NN.md` (ten mandatory sections, measured against predicted, live state marked PERISHABLE), then launches the successor in the same worktree and harness, or prints the launch line. It is not orchestration and not per-story resume. |
| `orca-orchestration` | `/orca-orchestration`, "orchestrate", "fleet", "one session per story", "resume the run" | The multi-session layer (CONDUCTOR, WORKER and AUTOMATION modes) over the `orca` binary. It launches persistent supervised workers, coordinates them through the run mailbox, owns the claims protocol and the fleet side of worktree provisioning, and owns the `orchestration:` block in `.agents/project.yaml`. The workflow skills keep the WHAT (`/sprint-development` fleet mode, `/autonomous-delivery` for unattended runs). It is optional by construction: the gate is the binary plus a reachable runtime, and when it fails the workflow skills stay silent and fall back to their `launch.txt`. |
| `jira-administration` | `/jira-administration` (modes `components`, `instance-migration`) | Bounded Jira admin workflows, one mode per run. `components` reconciles a project's Components against the app's real modules, plan first. `instance-migration` repoints the Atlassian host and regenerates the `.agents/` catalogs. Both are sealed behind read-first analysis and explicit approval before any Jira, credential-session or repo change. |
| `project-context` | `/project-context` (modes `data`, `features`, `api`, `master-plan`, `dev-roadmap`) | Business maps, the master implementation plan and the dev roadmap, one mode per run. `data`, `features` and `api` write the HTML map inside `business-data-context`, `business-feature-context` or `business-api-context` (stale sections only on an update); `master-plan` writes `.context/master-implementation-plan.md`; `dev-roadmap` writes `.context/dev-roadmap.md`. |
| `business-data-context` | (loads on migrations, RLS, seed, entity lifecycle) | Context skill holding the business data map (entities, RLS, migrations, state machines, automatic processes, integrations) as HTML. Read it with `bun run context:map business-data-context`. It proposes one-section edits on evidence and writes only its own `references/`. `bun sync` delivers it once, then the project owns it. |
| `business-feature-context` | (loads on screens, forms, CRUD, navigation, role gates) | Context skill holding the business feature map (feature catalog, CRUD matrix, UI inventory, cross-feature flows). Same read path and write scope. |
| `business-api-context` | (loads on route handlers, server actions, OpenAPI, auth) | Context skill holding the business API map (auth model, route groups, OpenAPI surface, cross-route journeys). Same read path and write scope. |
| `acli` | `/acli` | Atlassian CLI cookbook (Jira and Confluence). Resolves `[ISSUE_TRACKER_TOOL]`. |
| `vercel-cli` | (loads on `vercel` Bash calls) | Vercel CLI cookbook: deployment verification (poll the commit SHA, `inspect --wait`), env var sync (`.env` against the Preview and Production scopes), build and runtime log streaming, rollback, `.vercel/` linking. Companion to the community `/deploy-to-vercel`. |

Persistent memory: `bun setup` wires Engram per agent with the engram binary's own `engram setup <agent>` (the Engram MCP server, nothing else) and offers the Engram Claude Code plugin for its session hooks. It is active across sessions and compactions per `AGENTS.md` §12 (proactive memory triggers). No gentle-ai bundle is installed.

T3 (community, project level) are the frontend and backend skills, matched by category at runtime and not by literal name. The list is in `cli/install.ts`. The installed-skill scan finds them (the session's skill list plus `.agents/skills/` on disk, git-ignored folders included); `REGISTRY.md` lists committed skills only and never names them (`agentic-dev-core/references/skill-composition-strategy.md` §3.1). A step that designs or builds a screen names its skills instead of matching them: the design set (§3.5).

T4 (community, user level) are repo-agnostic skills, discovered at runtime. Ask before loading one, per strategy §3.2.

Layout: T1 repo skills live in `.agents/skills/<slug>/` (the committed source). T3 community skills (`bunx skills add`) install into the same `.agents/skills/` store. T4 user-level skills stay harness-specific (`~/.claude/skills/`, and the equivalent for each host). Claude Code discovers the whole store through the generated `.claude/skills` alias (`agent-harnesses.md` §5.5); OpenCode and Codex read `.agents/skills/` natively.

### Skill modes

A multi-mode skill lists its modes in its own `## Mode routing` section, and that section is the only list. Invoke it by name plus mode: `/project-context data` on Claude Code, "load `project-context`, mode `data`" on OpenCode and Codex. The first token of `$ARGUMENTS` that matches a mode is the mode, and the rest is forwarded. With no matching token the skill resolves the mode from the trigger phrase or asks; `autonomous-delivery` fails fast instead, because nobody is on the line. A former command name (`business-data-map`, `jira-components`) survives only as a trigger phrase in its skill's `description`. Keeping docs in step with a change is not a skill. It is the docs follow-through (`agentic-dev-core/references/docs-follow-through.md`), and `bun run docs:check` gates its mechanical half.

### MCPs (decision rules)

Skills declare the capability they need (`metadata.requires_capabilities`) and the AI resolves it by tool-name suffix, whatever server prefix the host gave it. The vocabulary, the suffixes, the stop at the point of use and how to enable each capability per host are in `agentic-dev-core/references/mcp-capabilities.md`. The project MCP files declare local servers only (the set is whatever `.mcp.json` declares); web search runs at harness level (ADR-0005).

| Capability | Provided by | Rule |
|---|---|---|
| `library-docs` | committed `context7` (`resolve-library-id`, then `query-docs`) | `[DOCS_TOOL]`. Required for any library, framework, SDK, API or CLI doc lookup ("how to use X"), before writing code against it. |
| `web-search` | harness level, never `.mcp.json`: Exa first (`web_search_exa`), Tavily second (`tavily_search`); connect once per machine (`bun run setup:doctor` shows what this machine declares) | `[WEB_SEARCH_TOOL]`. Required for community fixes, error-message lookups, "how to solve X" and other non-doc research. |
| `db` | the DB MCP that `stack.database` names: committed `supabase` (`execute_sql`, `list_tables`) when `provider: supabase`, a Postgres-family server the project declares in `.mcp.json` otherwise, none when `engine: none` | `[DB_TOOL]`: schema, migration ledger, read-only data checks. How a change is applied follows `stack.database.migrations_tool` (`db-change-doctrine.md`). |
| `automation-flows` | committed `n8n`, when the project's `.mcp.json` declares it | `[AUTOMATION_FLOWS_TOOL]`: workflow automation, integrations. |
| `diagrams` | the `diagram-design` skill (T3, `cli/install.ts`), resolved by skill presence and not by a tool suffix | The figures inside the business maps (`business-context-maps.md` §7). |

A missing capability stops the work at the point of use. Name the capability, the server that normally provides it and how to enable it, then wait. Built-in `WebSearch` and `WebFetch`, or any other substitute, are allowed only when the user chooses them after the stop, for that step.
