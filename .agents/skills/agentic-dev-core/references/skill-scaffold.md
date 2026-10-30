# Skill Scaffold — the contract every new T1 skill is born with

> Cited by: `project-context` mode `context-skill` (a project's own `<aspect>-context`) and any change that adds a T1 skill to `.agents/skills/`. `skill-creator` (T3, installed at project level by `cli/install.ts`) is ALWAYS the builder: load it for the draft, the test prompts, the evals and the description pass. The CONTRACT below is this repo's and `skill-creator` does not own it. On a machine where the install is missing, the scaffold still works from the template in §4, and the run says so.
> Axes and kinds: `skill-composition-strategy.md` §2b. Lint: `scripts/lint-skills.ts` (`bun run skills:check`).

---

## 1 · Frontmatter every T1 skill carries

```yaml
---
name: <slug>                                   # equals the directory name
description: "<trigger phrases + what it does + what it is NOT for>"
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [<from strategy §4.1>] # optional, audited when present
compact_rules: |                               # authoritative registry block (skill-resolver.md)
  - DO: <binding rule>
metadata:
  kind: <context | workflow | utility | core>  # mandatory, gated (KIND-MISSING / KIND-VOCAB / KIND-SUFFIX)
  stage_owner: true                            # workflow skills that own stages only (STAGE-OWNER-DISPATCH)
  requires_capabilities: [<mcp-capabilities.md §2>] # only when the skill instructs an MCP capability (CAPABILITY-VOCAB)
---
```

Only `allowed-tools, compatibility, description, license, metadata, name` are Agent Skills spec top-level keys. `complementary_categories`, `compact_rules` and `phase` are this repo's established top-level extensions and stay where they are; every NEW project-specific key goes under `metadata`. `compact_rules` is consumed verbatim by `scripts/build-skill-registry.ts`; without it the registry falls back to a `## Compact Rules` body section, capped.

## 2 · Per kind: files, suffix, sections

| Kind | Slug suffix | Files | Body sections that must exist |
|---|---|---|---|
| **context** | `-context` (mandatory) | `SKILL.md`, `references/gotchas.md`; a skill that holds a generated map adds the map under `references/` plus `references/refresh.md` and declares `metadata.writes: [references/]` | `## What this skill knows` (one aspect), `## Sources of truth` (what it CITES), `## Rules` (judgment, each dated), `## Not here` (what belongs elsewhere) |
| **workflow** | none | `SKILL.md`, `references/`, `evals/evals.json` | `compact_rules` frontmatter; a stage owner (`metadata.stage_owner: true`) adds the session banner + `## Phase 0` (register the slug in `SESSION_RETROFITTED_SKILLS`, `scripts/lint-skills.ts`, so `SESSION-BANNER-MISSING`, `SESSION-PHASE-0-MISSING` and `SESSION-SCOPE-INVALID` bind), a dispatch section (`## Subagent Dispatch Strategy`, `## Subagent dispatch` or `## Session & Dispatch`, the 7-component briefing), and a session-close step citing `session-footer-contract.md` |
| **utility** | `-cli` / `-tool` / `-app` (mandatory) | `SKILL.md` with `allowed-tools: Bash(<binary>:*)`, `references/gotchas.md` | `compact_rules` frontmatter, the tool's grammar (verbs, flags, auth, errors), a §6.5 row in `AGENTS.md` if a Bash binary must auto-load it |
| **core** | none | `SKILL.md` + `references/` | no write path of its own; other skills cite its references |

`references/gotchas.md` is a measured table: columns `# · Gotcha · Symptom · Fix · Measured · Verified against`, plus a `## No longer true` section rows move to instead of being deleted.

## 3 · Context skills: what goes where

**The principle.** `.context/` holds what a SCRIPT pulls from an external source of truth, plus the things this repo itself is the source of truth for. What an AI SYNTHESIZES lives in a skill. A cache is cheap to rebuild and identical on two machines; a synthesis is authored (by an AI, but authored), two sessions write it differently, rebuilding it costs thousands of tokens, and it is exactly the knowledge that should arrive unasked. Ask about each piece of knowledge:

| Question | Yes → |
|---|---|
| 1. Does a script pull it from an external source of truth? (Jira, the OpenAPI spec, the Supabase schema) | `.context/` as a `[SYNC]` cache, or generated types, recovered by that script (`bun run context:hydrate`, `bun run api:sync`) |
| 2. Is this repo itself the source of truth for it? (an ADR, the PRD / SRS, the domain glossary, the master design plan) | `.context/` as `[COMMIT]`, authored by its owning skill |
| 3. Otherwise: the AI synthesizes it from code, DB and contracts, or a human writes judgment about it | a context skill: the synthesis as the skill's generated map, the judgment in `## Rules` / `references/gotchas.md` |

Judgment vs fact inside a context skill: would two competent sessions write it differently? Yes → a dated rule. No → a fact, which belongs in the map (or the cache) and never in `SKILL.md`.

| Content | Home |
|---|---|
| Entities, relationships, RLS, migrations, state machines (synthesis) | the data map inside `business-data-context`, written by `project-context` mode `data` |
| CRUD matrix, UI inventory, feature flows (synthesis) | the feature map inside `business-feature-context`, written by mode `features` |
| Auth model, route groups, OpenAPI surface (synthesis) | the API map inside `business-api-context`, written by mode `api` |
| The rule for READING a map ("profiles are soft-deleted; a count without `deleted_at IS NULL` is wrong") | the context skill's `## Rules` or `references/gotchas.md` |
| Jira mirror | `.context/PBI/` (never hand-written, `.agents/instructions/agent-local-context-pbi.md` §9) |
| An architecture decision | `.context/ADR/` |
| PRD, SRS, business model, domain glossary (authored) | `.context/PRD/`, `.context/SRS/`, `.context/business/` (owned by `/project-foundation`; never a context skill) |
| Per-screen design specs, the US→Screen map | the master design plan `/design-system` writes |

**Hard rule: a `-context` skill CITES `.context/` paths, it does not copy them.** A context skill that restates a `.context/` fact is a second source of truth and fails review. A generated map held inside a context skill is not a copy: it is the ONLY copy of that synthesis. `STALE-PATH` (`scripts/lint-skills.ts`) enforces the citing half with a kind-scoped rule: inside a `metadata.kind: context` skill every `.context/` cite must exist on disk (the map is born before the skill; only the gitignored `.context/PBI/` cache is exempt). The "does not copy" half stays a review rule.

**Ownership rule.** A project's context skills (`billing-context`, `auth-context`, ...) are project-owned and NEVER shipped upstream. The updater enforces it: any `.agents/skills/<slug>-context/` other than the ones upstream owns (the grandfathered workflow slug `project-context`) is project-local by construction, never delivered, overwritten or deleted by `bun sync`, even if upstream ever ships a same-slug example (`isProjectLocalSkillPath` in `cli/lib/updater-core.ts`). The context skills this boilerplate ships on purpose are the business map skills, and their exception is explicit and delivery-only: `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) names them, `collectContextMapBootstrap` delivers each folder once when it is absent, and after that they are project-owned like any other (`business-context-maps.md` §9).

**The write-scope amendment.** A context skill that holds a generated map keeps it honest: when a session observes something that contradicts a section, it PROPOSES the one-section edit (to the user, or to the conductor for a supervised worker) and applies it on approval, under its own `references/` and nowhere else. It declares that in frontmatter (`metadata.writes: [references/]`), carries the procedure in `references/refresh.md`, and `CONTEXT-WRITES` (`scripts/lint-skills.ts`) gates it. It never runs a stage, never touches Jira or Confluence (`[ISSUE_TRACKER_TOOL]` / `[KNOWLEDGE_BASE_TOOL]` are forbidden in it) and never edits another skill.

**Who proposes, who creates.** The business maps have an owner already: `project-context` modes `data` / `features` / `api` generate them inside `business-data-context`, `business-feature-context` and `business-api-context`, and their reading rules accrue in those skills through their refresh paths (`business-context-maps.md`). For any OTHER aspect, `project-context` mode `context-skill` CREATES the skill, always through `skill-creator`. UPDATE appends dated rules; it never rewrites one.

**Who loads them.** A context skill triggers by its `description` in the main thread. In a subagent briefing the Skill Resolver injects only the context skills whose ASPECT the dispatch touches (`skill-resolver.md`, rule 5), never all of them.

## 4 · Minimal `SKILL.md` for a context skill

```markdown
---
name: <aspect>-context
description: "Trigger: <aspect> questions, <domain words>. Judgment layer over <the source it sits over>. NOT the source itself."
license: MIT
compatibility: [claude-code, codex, opencode]
compact_rules: |
  - DO: <the one reading rule a subagent must not miss>
metadata:
  kind: context
---

# <aspect>-context

## What this skill knows
One aspect of the product: <aspect>. Loading it changes what the agent KNOWS, not what it does next.

## Sources of truth (cited, never copied)
- `<the path or command it cites>` — <what to read there>

## Rules (judgment, dated)
- <YYYY-MM-DD> · <rule> · measured: <how>

## Not here
- <fact class> → `<the map or cache that holds it>` (regenerable)
```

## 5 · Definition of Done for a new skill

- `bun run skills:check` green (kind declared, suffix matches, capabilities in the vocabulary, no stale path)
- `bun run skills:registry` regenerated; `bun run skills:registry:check` green (the Source line prints its `kind:`)
- A router row and a loader (which flow loads it and when). A skill the boilerplate ships (T1) → `.agents/instructions/agent-skills-and-mcps.md` §5. A skill a project creates for itself (an `<aspect>-context`) → the "Project context skills" table of `.agents/instructions/agent-project.md`, with its triggers, because `bun sync` overwrites the shared section. An install nothing loads should not exist
- `evals/evals.json` for a workflow skill; optional for the other kinds at creation
