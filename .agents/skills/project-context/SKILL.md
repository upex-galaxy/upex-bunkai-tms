---
name: project-context
description: "Generate or refresh the canonical project-context artifacts for development: business data map, business feature map, business API map, master implementation plan and dev roadmap. Use for business-data-map, business-feature-map, business-api-map, master-implementation-plan, dev-roadmap, roadmap de desarrollo, mapear el dominio, inventario de features, cómo funciona el API, plan maestro de implementación, qué historia sigue, refresh project context, refresh all context. Routes exactly one mode at a time unless refresh-all is explicit. UPDATE mode always shows a diff and waits for approval before overwriting."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [backend-db, issue-tracker]
---

# Project Context

Own the five regenerative project-context artifacts without duplicating their workflows across harness commands. Each mode is a full workflow that used to live inline in a slash command; the commands are now transport-only aliases (`.agents/compatibility/command-aliases.json`) that invoke this skill with a mode.

## Compact Rules

- Exactly ONE mode per run: `data` · `features` · `api` · `master-plan` · `dev-roadmap` · `refresh-all`. Load only that mode's reference; never open a second one in the same pass.
- Mode → reference → output: `data` → `references/data.md` → `.context/business/business-data-map.md` · `features` → `references/features.md` → `.context/business/business-feature-map.md` · `api` → `references/api.md` → `.context/business/business-api-map.md` · `master-plan` → `references/master-plan.md` → `.context/master-implementation-plan.md` · `dev-roadmap` → `references/dev-roadmap.md` → `.context/dev-roadmap.md`.
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `features` → `api` → `master-plan` → `dev-roadmap`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- Artifact missing = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate, show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval.
- Dependency gates are the selected reference's: `master-plan` hard-requires `.context/business/business-data-map.md` (soft: feature map); `dev-roadmap` hard-requires at least one epic with child stories in the issue tracker (soft: data map, master design plan, master implementation plan); `features` and `api` soft-depend on the data map. A hard gate failure STOPS the run with the reference's exact message; a missing SOFT dependency is a Discovery Gap, never a stop.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory `## Discovery Gaps` section, not asserted in the body.
- After a successful artifact write, add the pointer to `AGENTS.md` (Key paths) ONLY when that pointer is missing. NEVER write operational prose into `CLAUDE.md`: it is the generated `@AGENTS.md` shim.
- Forward `$ARGUMENTS` unchanged to the selected mode (project path, module filter, epic key, or Master Sprint name, as each reference defines).

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation. Load only the reference named in that row.

| Mode | Legacy alias / trigger | Reference | Output |
|---|---|---|---|
| `data` | `/business-data-map`, entity/data map, mapear el dominio | `references/data.md` | `.context/business/business-data-map.md` |
| `features` | `/business-feature-map`, feature inventory, inventario de features | `references/features.md` | `.context/business/business-feature-map.md` |
| `api` | `/business-api-map`, API business map, cómo funciona el API | `references/api.md` | `.context/business/business-api-map.md` |
| `master-plan` | `/master-implementation-plan`, master plan, what to build first | `references/master-plan.md` | `.context/master-implementation-plan.md` |
| `dev-roadmap` | `/dev-roadmap`, roadmap de desarrollo, qué historia sigue, execution order | `references/dev-roadmap.md` | `.context/dev-roadmap.md` |
| `refresh-all` | refresh all project context | all five references, one at a time | all five outputs |

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
| `features` | none | `business-data-map.md` |
| `api` | none | `business-data-map.md`, `business-feature-map.md` |
| `master-plan` | `.context/business/business-data-map.md` | `business-feature-map.md` |
| `dev-roadmap` | at least one epic with child stories (and dependency links) in the issue tracker | `business-data-map.md`, `master-design-plan.md`, `master-implementation-plan.md` |

## Shared contract

- Read every available source required by the selected reference. Never invent business facts.
- CREATE mode may write the missing artifact after analysis.
- UPDATE mode must generate a candidate, show the diff summary, and wait for explicit approval before overwriting. `dev-roadmap` UPDATE is surgical: regenerate the sort section, preserve hand-authored edges and gates, as its reference defines.
- Each output includes `## Discovery Gaps` for unverified facts.
- After a successful artifact write, update the Key paths pointers in `AGENTS.md` only when a pointer is missing. Never add operational prose to `CLAUDE.md`.
- `$ARGUMENTS` are forwarded unchanged to the selected mode.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before the selected mode's first phase. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter (`backend-db`, `issue-tracker`).
2. Resolve via the local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.agents/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. Classify tier per strategy doc §2.
4. Apply the threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK the user once: `"Detected <skill> (T4). Apply for this run? Y/N"`. Cache the answer.
5. Inject a `## Composable Skills` block per strategy doc §6.2 into every sub-agent prompt.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `backend-db` | `supabase` | Modes data, features and api read the live schema through `[DB_TOOL]` (Supabase MCP); the community skill owns query and schema-reading patterns. |
| `issue-tracker` | `/acli` | Mode dev-roadmap reads epics, stories and dependency links through `[ISSUE_TRACKER_TOOL]`; mode master-plan cross-checks epics. Load before any Jira read. |
