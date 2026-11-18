---
name: project-context
description: "Generate or refresh project context: the business data, feature and API maps, the master implementation plan and the dev roadmap. Use when asked to map the domain, inventory features, explain how the API works, plan what to build first, find the next story, or refresh project context; also to scaffold an <aspect>-context skill."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [backend-db, issue-tracker, meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, library-docs, web-search, diagrams]
---

# Project Context

This skill generates the five regenerative project-context artifacts and scaffolds a project's own context skills. The three business maps live inside their context skills as HTML (`agentic-dev-core/references/business-context-maps.md`), and this skill creates them and updates their stale sections. Each mode is a full workflow with no harness command of its own: invoke the skill by name plus a mode (`/project-context data` on Claude Code, "load project-context, mode data" in prose on OpenCode and Codex).

## Compact Rules

- Run exactly one mode: `data`, `features`, `api`, `master-plan`, `dev-roadmap`, `refresh-all` or `context-skill`. The first token of `$ARGUMENTS` is the mode when it matches one of these; otherwise resolve it from the trigger phrases in Mode routing. Load only that mode's reference, and open a second one only when `refresh-all` reaches it.
- When the user named no mode, ask. A generic "refresh the context" is not `refresh-all`, because that chain rewrites five artifacts and the user has to ask for it.
- The Mode routing table below maps each mode to its reference and its output file. Map modes write into the context skill's `references/<map>.html`; `master-plan` and `dev-roadmap` write `.context/master-implementation-plan.md` and `.context/dev-roadmap.md`.
- `context-skill` scaffolds a project-owned `<aspect>-context` (`references/context-skill.md`, contract `agentic-dev-core/references/skill-scaffold.md` §3-§5) through `skill-creator` (T3), for an aspect the business maps do not cover. It cites its sources and copies nothing from them, and `refresh-all` never includes it. Its router row goes in the "Project context skills" table of `.agents/instructions/agent-project.md`, not in the synced `agent-skills-and-mcps.md`, because `bun sync` would drop it.
- `refresh-all` runs `data`, `features`, `api`, `master-plan`, `dev-roadmap` in that order, one at a time. Each reference's own validation and approval gate closes before the next one loads.
- A map mode writes only its own skill's `references/<map>.html`, read and checked through `bun run context:map <skill>`. The map skill already exists (delivered by `bun sync`, never scaffolded here). A project's legacy `.context/business/business-*-map.md` (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) is read as input and is never deleted.
- A missing artifact, or a placeholder map, is CREATE mode: write once the analysis completes. An existing artifact is UPDATE mode: generate a candidate (for a map, only its stale sections), show the diff summary and wait for explicit approval. Overwriting without that approval, or regenerating a whole generated map, destroys edits its readers depend on. A map candidate holds its stale sections only (`business-context-maps.md` §4-§5), and `dev-roadmap` UPDATE is surgical: it regenerates the sort section and keeps the hand-authored edges and gates, as its reference defines.
- Read `stack:` once per run (`.agents/project.yaml`, leaves `{{stack.<path>}}`) and parametrize the mode as `## Stack parameters` describes: every app path under `{{stack.app_root}}`, one app per run; the schema from `{{stack.database.schema_source}}` (`live` through `[DB_TOOL]` against the active env, production only when the user names it for this run; `migrations` from the files under `{{stack.database.migrations_dir}}`, offline). A null leaf means the app has none: skip it and say so. A missing block takes the defaults of `.agents/project.schema.yaml` plus one Discovery Gap naming `bun run agents:setup --stack`.
- Hard dependency gates stop the run with the reference's exact message (the table in Dependency gates lists them). `master-plan` needs a generated data map, which `bun run context:map business-data-context` shows by printing sections instead of the placeholder notice. A missing soft dependency is a Discovery Gap and the run continues. `dev-roadmap` needs at least one epic with child stories in the issue tracker, and `api` needs an OpenAPI spec, a route-scannable backend or a Supabase-direct API.
- Business facts come from sources. Read every source the selected reference requires; what stays unverified goes under the output's mandatory `## Discovery Gaps`, not into the body.
- After a map write, review that skill's `## Rules` and `references/gotchas.md` against the new map and propose any change; the rules themselves are not rewritten here.
- After a successful artifact write, add its pointer to `.agents/instructions/agent-project.md` (`## Key paths (this project)`), and only when neither the shared Key paths in `.agents/instructions/agent-context-map.md` nor that file names it yet. `AGENTS.md` is the boilerplate-owned always-on layer and `bun sync` overwrites the shared sections (`agentic-dev-core/references/docs-follow-through.md`). `CLAUDE.md` is the generated `@AGENTS.md` shim and takes no operational prose. Placement follows `agentic-dev-core/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change runs that reference's §6 procedure.
- Forward the rest of `$ARGUMENTS` (everything after the mode token) unchanged to the selected mode: project path, module filter, epic key or Master Sprint name, as each reference defines.
- Resolve each capability in `metadata.requires_capabilities` by tool-name suffix, any prefix (`diagrams`, for the maps' figures, by the `diagram-design` skill's presence). When none is available at the step that needs it, stop as `agentic-dev-core/references/mcp-capabilities.md` §4 says; built-in `WebSearch` and `WebFetch` stand in only when the user chooses them.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation: the first token of `$ARGUMENTS` when it names a mode below, otherwise the trigger phrase, otherwise ask. Load only the reference in that row. The former `business-*-map`, `master-implementation-plan` and `dev-roadmap` command names survive as trigger phrases only.

| Mode | Trigger phrases | Reference | Output |
|---|---|---|---|
| `data` | `business-data-map`, entity/data map, map the domain | `references/data.md` | `.agents/skills/business-data-context/references/business-data-map.html` |
| `features` | `business-feature-map`, feature inventory | `references/features.md` | `.agents/skills/business-feature-context/references/business-feature-map.html` |
| `api` | `business-api-map`, API business map, how the API works | `references/api.md` | `.agents/skills/business-api-context/references/business-api-map.html` |
| `master-plan` | `master-implementation-plan`, master plan, what to build first | `references/master-plan.md` | `.context/master-implementation-plan.md` |
| `dev-roadmap` | `dev-roadmap`, which story is next, execution order | `references/dev-roadmap.md` | `.context/dev-roadmap.md` |
| `refresh-all` | refresh all project context | all five references, one at a time | all five outputs |
| `context-skill` | context skill, scaffold `<aspect>-context` for another aspect | `references/context-skill.md` | `.agents/skills/<aspect>-context/` (project-owned, never shipped upstream) |

## `refresh-all` dependency order

Run sequentially, and close each reference's validation and approval gate before loading the next:

1. `data`
2. `features`
3. `api`
4. `master-plan`
5. `dev-roadmap`

A hard dependency failure or a rejected overwrite stops the chain. Missing soft dependencies stay Discovery Gaps, as each reference defines.

## Dependency gates (summary; the reference owns the exact wording)

| Mode | Hard gate (stop) | Soft gates (Discovery Gap) |
|---|---|---|
| `data` | none (invocable standalone) | PRD / SRS under `.context/` |
| `features` | none | the data map |
| `api` | no OpenAPI spec and no route-scannable backend and no Supabase-direct API | the data map, the feature map |
| `master-plan` | a generated data map | the feature map |
| `dev-roadmap` | at least one epic with child stories in the issue tracker | their dependency links, the data map, `master-design-plan.md`, `master-implementation-plan.md` |
| `context-skill` | what the skill sits over must exist (a map, a module, a contract) | none |

## Stack parameters

Every mode reads the `stack:` block of `.agents/project.yaml` once, before its first phase, and states the values it used in the run report. A greenfield project carries the schema's defaults (the app at the repo root, a live Supabase schema), so a mode behaves exactly as its reference describes. The parameters change a run only when the descriptor says the app is shaped differently, as an adopted app's usually does.

| Leaf | Changes | How |
|---|---|---|
| `{{stack.app_root}}` | where the app's code is | Every app path a reference names (`src/app/`, `app/api/`, `api/`, the `*_ENTRY` variables, the migrations folder) resolves under it. One app per run: in a monorepo the other workspaces are not scanned and are listed in `discovery-gaps` as not inspected |
| `{{stack.database.schema_source}}` = `live` | the schema comes from the database | `[DB_TOOL]` (capability `db`) against `{{DB_PROJECT_REF}}` of the active env (`testing.default_env`, or the env the user named this session). Production only when the user names it for this run, read-only. The `overview` section names the env it read |
| `{{stack.database.schema_source}}` = `migrations` | the schema comes from the repo, offline | The migration files under `{{stack.database.migrations_dir}}` (relative to `app_root`), oldest first, plus the schema definition `{{stack.database.migrations_tool}}` keeps when it keeps one (a Prisma schema, a Drizzle schema module). Sections cite `migration:<file>`. Capability `db` is optional: when connected it is a cross-check, and a difference between files and database is a Discovery Gap that is never resolved silently. `migrations` with a null `migrations_dir` is an inconsistent descriptor: stop and name `bun run agents:setup --stack` |
| `{{stack.database.engine}}` = `none` | there is no database | `data` maps the entities the code declares (types, validation schemas, stores) and says in `overview` that no database backs them |
| `{{stack.database.provider}}` = `supabase` | the API may be Supabase-direct | The app calls PostgREST tables, RPC functions, Auth, Storage or Edge Functions through the Supabase client instead of its own route handlers. `api` maps that surface (`references/api.md` § Supabase-direct API) |
| `.template/installer.lock.json` → `adopted: true` | the app already exists | `master-plan` plans the remaining work over a shipped baseline (`references/master-plan.md` § Existing app) |

A missing block follows the Compact Rules. When the descriptor disagrees with the code (a `migrations_dir` that does not exist, an `app_root` with no `package.json`), the code wins: the run continues on what it found and the drift is a Discovery Gap. `bun run setup:doctor` re-detects it.

## With nobody at the keyboard

`agentic-dev-core/references/decision-protocol.md` says which decisions reach a person at all, and §5.2 there holds the unattended path. These are the waits in this skill:

| Wait | A person is present | A supervised worker | A routine with nobody |
|---|---|---|---|
| The user named no mode | ask which artifact to refresh | the launcher names the mode | the brief's mode; with none in the brief, stop and report, since there is nothing reversible to do |
| UPDATE diff approval (every mode, and the reference's own confirm step) | show the diff summary and wait | the conductor holds the gate: send it the summary and apply what it approves | the brief approves when it names the artifact or section. Otherwise leave the artifact untouched, put the candidate sections and evidence in the report, and say nothing was applied |
| A tier-T4 composable skill | ask once | the briefing's `Skills to load` is the answer | load it only when the brief names it; otherwise skip it and say so in the report |
| A hard gate or a missing capability | stop with the reference's message | stop and report to the launcher | stop and report |

CREATE mode and read-only analysis proceed in every case. The business-context map approval follows `agentic-dev-core/references/business-context-maps.md` §10.

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before the selected mode's first phase, following `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter (`backend-db`, `issue-tracker`, `meta-skill`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each match's tier (§2) and apply the threshold rule (§3.2). T1 and T3 matches load silently and are cached for the session. For a T4 match, ask once, `"Detected <skill> (T4). Apply for this run? Y/N"`, and cache the answer. With nobody to ask, the table in "With nobody at the keyboard" decides.
4. Inject a `## Composable Skills` block per strategy doc §5.2 into every sub-agent prompt.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `backend-db` | `supabase` | Modes data, features and api read the live schema through `[DB_TOOL]` (Supabase MCP); the community skill owns query and schema-reading patterns. |
| `issue-tracker` | `/acli` | Mode dev-roadmap reads epics, stories and dependency links through `[ISSUE_TRACKER_TOOL]`; mode master-plan cross-checks epics. Load before any Jira read. |
| `meta-skill` | `skill-creator` (T3) | Mode context-skill builds every `<aspect>-context` through it: draft loop, description pass, three test prompts. |
| `meta-skill` | `diagram-design` (T3) | Modes data, features and api draw the maps' figures with it (the diagrams capability, `business-context-maps.md` §7 in agentic-dev-core). |
