---
name: project-context
description: "Generate or refresh the canonical project-context artifacts for development: the business data, feature and API maps (HTML maps inside business-data-context, business-feature-context and business-api-context), the master implementation plan and the dev roadmap. Use for business-data-map, business-feature-map, business-api-map, master-implementation-plan, dev-roadmap, roadmap de desarrollo, mapear el dominio, inventario de features, cómo funciona el API, plan maestro de implementación, qué historia sigue, refresh project context, refresh all context. Also scaffolds a project-owned <aspect>-context skill for any aspect the business maps do not cover (context-skill mode: context skill, scaffold a context skill, judgment layer over X). Routes exactly one mode at a time unless refresh-all is explicit. UPDATE regenerates only stale map sections and always shows a diff and waits for approval before writing."
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [backend-db, issue-tracker, meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, library-docs, web-search, diagrams]
---

# Project Context

Own the five regenerative project-context artifacts, and scaffold a project's own context skills. The three business maps live inside their context skills as HTML (`agentic-dev-core/references/business-context-maps.md`); this skill generates them and updates their stale sections. Each mode is a full workflow. There are no harness commands for them: the skill is invoked by its own name plus a mode (`/project-context data` on Claude Code, "load project-context, mode data" in prose on OpenCode and Codex).

## Compact Rules

- Exactly ONE mode per run: `data` · `features` · `api` · `master-plan` · `dev-roadmap` · `refresh-all` · `context-skill`. The first token of `$ARGUMENTS` IS the mode when it matches one of these; otherwise resolve it from the trigger phrases in Mode routing. Load only that mode's reference; never open a second one in the same pass.
- `context-skill` scaffolds a project-owned `<aspect>-context` (`references/context-skill.md`, contract `agentic-dev-core/references/skill-scaffold.md` §3-§5) THROUGH `skill-creator` (T3) for an aspect the business maps do not cover. It cites its sources and never copies them; `refresh-all` never includes it. Its router row goes in the "Project context skills" table of `.agents/instructions/agent-project.md`, never in the synced `agent-skills-and-mcps.md` (`bun sync` would drop it).
- Mode → reference → output: `data` → `references/data.md` → `business-data-context`'s `references/business-data-map.html` · `features` → `references/features.md` → `business-feature-context`'s `references/business-feature-map.html` · `api` → `references/api.md` → `business-api-context`'s `references/business-api-map.html` · `master-plan` → `references/master-plan.md` → `.context/master-implementation-plan.md` · `dev-roadmap` → `references/dev-roadmap.md` → `.context/dev-roadmap.md`.
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `features` → `api` → `master-plan` → `dev-roadmap`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- A map mode writes ONLY its own skill's `references/<map>.html`, read and checked through `bun run context:map <skill>`. A project's legacy `.context/business/business-*-map.md` (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) is read as input and never deleted. The map skill already exists (delivered by `bun sync`, never scaffolded here).
- Artifact missing (or a placeholder map) = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate (for a map: only its stale sections), show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval, and NEVER regenerate a whole generated map.
- **Read `stack:` once per run** (`.agents/project.yaml`; leaves are `{{stack.<path>}}`) and let it parametrize the mode, per `## Stack parameters`: every app path resolves under `{{stack.app_root}}` (one app per run, other workspaces are a Discovery Gap); `{{stack.database.schema_source}}` picks the schema source (`live` = `[DB_TOOL]` against the active env, production only when the user names it for this run; `migrations` = the files under `{{stack.database.migrations_dir}}`, read offline, capability `db` then optional); an app that calls Supabase straight from its code with no OpenAPI spec and no route handlers has a Supabase-direct API. Block missing → the defaults of `.agents/project.schema.yaml` plus one Discovery Gap naming `bun run agents:setup --stack`. A null leaf means "the app has none": skip and say so, never invent one.
- Dependency gates are the selected reference's: `master-plan` hard-requires a generated data map (`bun run context:map business-data-context` prints sections, not the placeholder notice; soft: feature map); `dev-roadmap` hard-requires at least one epic with child stories in the issue tracker (soft: their dependency links, data map, master design plan, master implementation plan); `api` hard-requires an OpenAPI spec, a route-scannable backend or a Supabase-direct API; `features` and `api` soft-depend on the data map. A hard gate failure STOPS the run with the reference's exact message; a missing SOFT dependency is a Discovery Gap, never a stop.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory `## Discovery Gaps` section, not asserted in the body.
- After a map write, review that skill's `## Rules` and `references/gotchas.md` against the new map and PROPOSE any change; never rewrite a rule. After a successful artifact write, add its pointer ONLY when neither the shared Key paths (`.agents/instructions/agent-context-map.md`) nor `.agents/instructions/agent-project.md` names it yet, and write it into `agent-project.md` (`## Key paths (this project)`), never into `AGENTS.md` or a shared section: `AGENTS.md` is the boilerplate-owned always-on layer and `bun sync` overwrites the shared sections (the docs follow-through, `agentic-dev-core/references/docs-follow-through.md`). NEVER write operational prose into `CLAUDE.md`: it is the generated `@AGENTS.md` shim. Placement per `agentic-dev-core/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change runs that reference's §6 procedure.
- Forward the rest of `$ARGUMENTS` (everything after the mode token) unchanged to the selected mode (project path, module filter, epic key, or Master Sprint name, as each reference defines).
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix (`diagrams`, for the maps' figures, by the `diagram-design` skill's presence); none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation: the first token of `$ARGUMENTS` when it names a mode below, otherwise the trigger phrase, otherwise ask. Load only the reference named in that row. The former `business-*-map`, `master-implementation-plan` and `dev-roadmap` command names survive as trigger phrases only.

| Mode | Trigger phrases | Reference | Output |
|---|---|---|---|
| `data` | `business-data-map`, entity/data map, mapear el dominio | `references/data.md` | `.agents/skills/business-data-context/references/business-data-map.html` |
| `features` | `business-feature-map`, feature inventory, inventario de features | `references/features.md` | `.agents/skills/business-feature-context/references/business-feature-map.html` |
| `api` | `business-api-map`, API business map, cómo funciona el API | `references/api.md` | `.agents/skills/business-api-context/references/business-api-map.html` |
| `master-plan` | `master-implementation-plan`, master plan, what to build first | `references/master-plan.md` | `.context/master-implementation-plan.md` |
| `dev-roadmap` | `dev-roadmap`, roadmap de desarrollo, qué historia sigue, execution order | `references/dev-roadmap.md` | `.context/dev-roadmap.md` |
| `refresh-all` | refresh all project context | all five references, one at a time | all five outputs |
| `context-skill` | context skill, scaffold `<aspect>-context` for another aspect | `references/context-skill.md` | `.agents/skills/<aspect>-context/` (project-owned, never shipped upstream) |

If the user does not identify a mode, ask which artifact to refresh. Do not infer `refresh-all` from a generic request.

## `refresh-all` dependency order

Run sequentially and complete each reference's own validation and approval gate before loading the next:

1. `data`
2. `features`
3. `api`
4. `master-plan`
5. `dev-roadmap`

Stop on a hard dependency failure or rejected overwrite. Do not skip ahead. Missing soft dependencies remain Discovery Gaps exactly as each reference defines.

## Dependency gates (summary; the reference owns the exact wording)

| Mode | Hard gate (STOP) | Soft gates (Discovery Gap) |
|---|---|---|
| `data` | none (invocable standalone) | PRD / SRS under `.context/` |
| `features` | none | the data map |
| `api` | no OpenAPI spec AND no route-scannable backend AND no Supabase-direct API | the data map, the feature map |
| `master-plan` | a generated data map | the feature map |
| `dev-roadmap` | at least one epic with child stories in the issue tracker | their dependency links, the data map, `master-design-plan.md`, `master-implementation-plan.md` |
| `context-skill` | what the skill sits over must exist (a map, a module, a contract) | none |

## Stack parameters

Every mode reads the `stack:` block of `.agents/project.yaml` once, before its first phase, and states the values it used in the run report. A greenfield project carries the schema's defaults (the app at the repo root, a live Supabase schema), and with them every mode behaves exactly as its reference describes. The parameters only change the run when the descriptor says the app is shaped differently, which is what an adopted app's descriptor usually says.

| Leaf | Changes | How |
|---|---|---|
| `{{stack.app_root}}` | where the app's code is | every app path a reference names (`src/app/`, `app/api/`, `api/`, the `*_ENTRY` variables, the migrations folder) resolves under it. One app per run: in a monorepo, the other workspaces are not scanned and are listed in `discovery-gaps` as not inspected |
| `{{stack.database.schema_source}}` = `live` | the schema comes from the database | `[DB_TOOL]` (capability `db`) against `{{DB_PROJECT_REF}}` of the ACTIVE env (`testing.default_env`, or the env the user named this session). Production only when the user names it for this run, read-only. The `overview` section names the env read |
| `{{stack.database.schema_source}}` = `migrations` | the schema comes from the repo, offline | the migration files under `{{stack.database.migrations_dir}}` (relative to `app_root`), oldest first, plus the schema definition `{{stack.database.migrations_tool}}` keeps when it keeps one (a Prisma schema, a Drizzle schema module). Sections cite `migration:<file>`. Capability `db` is optional: when connected it is a cross-check, and a difference between files and database is a Discovery Gap, never resolved silently. `migrations` with a null `migrations_dir` is an inconsistent descriptor: STOP and name `bun run agents:setup --stack` |
| `{{stack.database.engine}}` = `none` | there is no database | `data` maps the entities the code declares (types, validation schemas, stores) and says in `overview` that no database backs them |
| `{{stack.database.provider}}` = `supabase` | the API may be Supabase-direct | the app calls PostgREST tables, RPC functions, Auth, Storage or Edge Functions through the Supabase client instead of its own route handlers. `api` maps that surface (`references/api.md` § Supabase-direct API) |
| `.template/installer.lock.json` → `adopted: true` | the app already exists | `master-plan` plans the REMAINING work over a shipped baseline (`references/master-plan.md` § Existing app) |

The block is missing (a project scaffolded before it existed) → use the defaults `.agents/project.schema.yaml` declares and add one `discovery-gaps` line naming `bun run agents:setup --stack`. The descriptor disagrees with the code (a `migrations_dir` that does not exist, an `app_root` with no `package.json`) → the code wins, the run continues on what it found, and the drift is a Discovery Gap; `bun run setup:doctor` re-detects it.

## Shared contract

- Read every available source required by the selected reference. Never invent business facts.
- CREATE mode may write the missing artifact (or replace a placeholder map) after analysis.
- UPDATE mode must generate a candidate, show the diff summary, and wait for explicit approval before overwriting. For a map, the candidate is its stale sections only (`business-context-maps.md` §4-§5). `dev-roadmap` UPDATE is surgical: regenerate the sort section, preserve hand-authored edges and gates, as its reference defines.
- Each output includes `## Discovery Gaps` for unverified facts.
- After a successful artifact write, add a missing Key paths pointer to `.agents/instructions/agent-project.md` (never to `AGENTS.md` or a shared section), and only when `.agents/instructions/agent-context-map.md` does not already name it, then run `bun run instructions:check` (placement rules: `agentic-dev-core/references/instructions-doctrine.md` §4). Never add operational prose to `CLAUDE.md`.
- The rest of `$ARGUMENTS`, after the mode token, is forwarded unchanged to the selected mode.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before the selected mode's first phase. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter (`backend-db`, `issue-tracker`, `meta-skill`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify tier per strategy doc §2.
4. Apply the threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK the user once: `"Detected <skill> (T4). Apply for this run? Y/N"`. Cache the answer.
5. Inject a `## Composable Skills` block per strategy doc §5.2 into every sub-agent prompt.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `backend-db` | `supabase` | Modes data, features and api read the live schema through `[DB_TOOL]` (Supabase MCP); the community skill owns query and schema-reading patterns. |
| `issue-tracker` | `/acli` | Mode dev-roadmap reads epics, stories and dependency links through `[ISSUE_TRACKER_TOOL]`; mode master-plan cross-checks epics. Load before any Jira read. |
| `meta-skill` | `skill-creator` (T3) | Mode context-skill builds every `<aspect>-context` through it: draft loop, description pass, three test prompts. |
| `meta-skill` | `diagram-design` (T3) | Modes data, features and api draw the maps' figures with it (the diagrams capability, business-context-maps.md §7 in agentic-dev-core). |
