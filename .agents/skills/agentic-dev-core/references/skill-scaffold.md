# Skill scaffold: how a skill is written and what it is born with

> Cited by: `project-context` mode `context-skill` (a project's own `<aspect>-context`) and any change that adds a T1 skill to `.agents/skills/`. `skill-creator` (T3, installed at project level by `cli/install.ts`) is always the builder: load it for the draft, the test prompts, the evals and the description pass. The contract below is this repo's and `skill-creator` does not own it. On a machine where that install is missing, the scaffold still works from the template in §4, and the run says so.
> Axes and kinds: `skill-composition-strategy.md` §2b. Lint: `scripts/lint-skills.ts` (`bun run skills:check`).

---

## How a skill is written (the canon)

Two user-level skills are the canon, and every skill in this repo is written with both:

- Call the Skill tool with "writing-for-agents" for structure: lead with what the file is for and when it applies, point to material instead of copying it, push what only some branches need behind a pointer, delete any sentence whose removal would not change what the agent does, state the goal and the reason, and say when the work is done.
- Call the Skill tool with "humanizer" for prose: plain verbs ("is", "has"), no em or en dashes, no arrows used as verbs, no bold-label lists, no shouting capitals, sentences of different lengths.

Either skill may be missing on a machine (both are user-level installs, see `agentic-dev-onboard`). Then do the pass inline from the two bullets above, say so in the report, and carry on: a missing writing skill never blocks the change.

Agents follow reasons better than step lists. A skill states the intent and the why, and keeps a concrete step, variable or command only where it changes behaviour. A prohibition stays only where the wrong move is likely and costly, and it carries its reason next to the positive target.

What this repo adds on top of the canon is below: frontmatter, kinds, context skills, compact rules, stage owners, lint, and the invocation classes (§6).

---

## 1 · Frontmatter every T1 skill carries

```yaml
---
name: <slug>                                   # equals the directory name
description: "<Leading word> <what it does>. Use when <branch>; <branch>."   # form per class, §6
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [<from strategy §4.1>] # optional, audited when present
compact_rules: |                               # authoritative registry block (skill-resolver.md)
  - <binding rule, self-contained>
metadata:
  kind: <context | workflow | utility | core>  # mandatory, gated (KIND-MISSING / KIND-VOCAB / KIND-SUFFIX)
  stage_owner: true                            # workflow skills that own stages only (STAGE-OWNER-DISPATCH)
  requires_capabilities: [<mcp-capabilities.md §2>] # only when the skill instructs an MCP capability (CAPABILITY-VOCAB)
---
```

Only `allowed-tools, compatibility, description, license, metadata, name` are Agent Skills spec top-level keys. `complementary_categories`, `compact_rules` and `phase` are this repo's established top-level extensions and stay where they are. Every new project-specific key goes under `metadata`. A manual skill also carries `disable-model-invocation: true` (§6). `scripts/build-skill-registry.ts` consumes `compact_rules` verbatim; without it the registry falls back to a `## Compact Rules` body section, capped. Write each rule so it still reads right alone, because a briefing receives it without its neighbours.

## 2 · Per kind: files, suffix, sections

| Kind | Slug suffix | Files | Body sections that must exist |
|---|---|---|---|
| **context** | `-context` (mandatory) | `SKILL.md`, `references/gotchas.md`; a skill that holds a generated map adds the map under `references/` plus `references/refresh.md` and declares `metadata.writes: [references/]` | `## What this skill knows` (one aspect), `## Sources of truth` (what it cites), `## Rules` (judgment, each dated), `## Not here` (what belongs elsewhere) |
| **workflow** | none | `SKILL.md`, `references/`, `evals/evals.json` | `compact_rules` frontmatter; a stage owner (`metadata.stage_owner: true`) adds the session banner and `## Phase 0` (register the slug in `SESSION_RETROFITTED_SKILLS`, `scripts/lint-skills.ts`, so `SESSION-BANNER-MISSING`, `SESSION-PHASE-0-MISSING` and `SESSION-SCOPE-INVALID` bind), a dispatch section (`## Subagent Dispatch Strategy`, `## Subagent dispatch` or `## Session & Dispatch`, the 7-component briefing), and a session-close step citing `session-footer-contract.md` |
| **utility** | `-cli` / `-tool` / `-app` (mandatory) | `SKILL.md` with `allowed-tools: Bash(<binary>:*)`, `references/gotchas.md` | `compact_rules` frontmatter, the tool's grammar (verbs, flags, auth, errors), a §6.5 row in `AGENTS.md` if a Bash binary must auto-load it |
| **core** | none | `SKILL.md` and `references/` | no write path of its own; other skills cite its references |

A gotchas file keeps its measurement record either in its own columns (`Measured`, `Verified against`, `## No longer true`) or in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`, per repo.

## 3 · Context skills: what goes where

The principle: `.context/` holds what a script pulls from an external source of truth, plus the things this repo itself is the source of truth for. What an AI synthesizes lives in a skill. A cache is cheap to rebuild and identical on two machines. A synthesis is authored (by an AI, but authored): two sessions write it differently, rebuilding it costs thousands of tokens, and it is exactly the knowledge that should arrive unasked. Ask about each piece of knowledge:

| Question | If yes, it goes to |
|---|---|
| 1. Does a script pull it from an external source of truth? (Jira, the OpenAPI spec, the Supabase schema) | `.context/` as a `[SYNC]` cache, or generated types, recovered by that script (`bun run context:hydrate`, `bun run api:sync`) |
| 2. Is this repo itself the source of truth for it? (an ADR, the PRD / SRS, the domain glossary, the master design plan) | `.context/` as `[COMMIT]`, authored by its owning skill |
| 3. Otherwise: the AI synthesizes it from code, DB and contracts, or a human writes judgment about it | a context skill: the synthesis as the skill's generated map, the judgment in `## Rules` / `references/gotchas.md` |

Judgment versus fact inside a context skill: would two competent sessions write it differently? If yes it is a dated rule. If no it is a fact, which belongs in the map (or the cache) and never in `SKILL.md`.

| Content | Home |
|---|---|
| Entities, relationships, RLS, migrations, state machines (synthesis) | the data map inside `business-data-context`, written by `project-context` mode `data` |
| CRUD matrix, UI inventory, feature flows (synthesis) | the feature map inside `business-feature-context`, written by mode `features` |
| Auth model, route groups, OpenAPI surface (synthesis) | the API map inside `business-api-context`, written by mode `api` |
| The rule for reading a map ("profiles are soft-deleted; a count without `deleted_at IS NULL` is wrong") | the context skill's `## Rules` or `references/gotchas.md` |
| Jira mirror | `.context/PBI/` (never hand-written, `.agents/instructions/agent-local-context-pbi.md` §9) |
| An architecture decision | `.context/ADR/` |
| PRD, SRS, business model, domain glossary (authored) | `.context/PRD/`, `.context/SRS/`, `.context/business/` (owned by `/project-foundation`, never a context skill) |
| Per-screen design specs, the US-to-Screen map | the master design plan `/design-system` writes |

A `-context` skill cites `.context/` paths and does not copy them. A context skill that restates a `.context/` fact is a second source of truth and fails review. A generated map held inside a context skill is not a copy: it is the only copy of that synthesis. `STALE-PATH` (`scripts/lint-skills.ts`) enforces the citing half with a kind-scoped rule: inside a `metadata.kind: context` skill every `.context/` cite must exist on disk (the map is born before the skill; only the gitignored `.context/PBI/` cache is exempt). The "does not copy" half stays a review rule.

Ownership: a project's context skills (`billing-context`, `auth-context`, ...) are project-owned and never shipped upstream. The updater enforces it. Any `.agents/skills/<slug>-context/` other than the ones upstream owns (the grandfathered workflow slug `project-context`) is project-local by construction, and `bun sync` never delivers, overwrites or deletes it, even if upstream ever ships a same-slug example (`isProjectLocalSkillPath` in `cli/lib/updater-core.ts`). The context skills this boilerplate ships on purpose are the business map skills, and their exception is explicit and delivery-only: `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) names them, `collectContextMapBootstrap` delivers each folder once when it is absent, and after that they are project-owned like any other (`business-context-maps.md` §9).

The write-scope amendment: a context skill that holds a generated map keeps it honest. When a session observes something that contradicts a section, it proposes the one-section edit and applies it on approval, under its own `references/` and nowhere else. The approver is the user, or the conductor for a supervised worker. A routine with nobody to approve records the proposal in its report and applies nothing. The skill declares this in frontmatter (`metadata.writes: [references/]`), carries the procedure in `references/refresh.md`, and `CONTEXT-WRITES` (`scripts/lint-skills.ts`) gates it. It still never runs a stage, never touches Jira or Confluence (`[ISSUE_TRACKER_TOOL]` and `[KNOWLEDGE_BASE_TOOL]` are forbidden in it) and never edits another skill.

Who proposes, who creates: the business maps have an owner already. `project-context` modes `data`, `features` and `api` generate them inside `business-data-context`, `business-feature-context` and `business-api-context`, and their reading rules accrue in those skills through their refresh paths (`business-context-maps.md`). For any other aspect, `project-context` mode `context-skill` creates the skill, always through `skill-creator`. An update appends dated rules and never rewrites one.

Who loads them: a context skill triggers by its `description` in the main thread. In a subagent briefing the Skill Resolver injects only the context skills whose aspect the dispatch touches (`skill-resolver.md`, rule 5), never all of them.

## 4 · Minimal `SKILL.md` for a context skill

```markdown
---
name: <aspect>-context
description: "<Aspect> judgment layer over <the source it sits over>. Use when <aspect question>; <domain words>."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
compact_rules: |
  - <the one reading rule a subagent must not miss>
metadata:
  kind: context
---

# <aspect>-context

## What this skill knows
One aspect of the product: <aspect>. Loading it changes what the agent knows, not what it does next.

## Sources of truth (cited, never copied)
- `<the path or command it cites>`: <what to read there>

## Rules (judgment, dated)
- <YYYY-MM-DD> · <rule> · measured: <how>

## Not here
- <fact class>: see `<the map or cache that holds it>` (regenerable)
```

## 5 · Definition of Done for a new skill

- `bun run skills:check` is green (kind declared, suffix matches, capabilities in the vocabulary, no stale path).
- `bun run skills:registry` is regenerated and `bun run skills:registry:check` is green (the Source line prints its `kind:`).
- A router row and a loader: which flow loads it and when. A skill the boilerplate ships (T1) gets a row in the `### Skills T1` table of `.agents/instructions/agent-skills-and-mcps.md`. A skill a project creates for itself (an `<aspect>-context`) gets a row in the "Project context skills" table of `.agents/instructions/agent-project.md`, with its triggers, because `bun sync` overwrites the shared section. An install nothing loads should not exist.
- The description matches its invocation class (§6) and is English.
- Both writing passes ran: `writing-for-agents` for structure, `humanizer` for prose.
- `evals/evals.json` exists for a workflow skill; it is optional for the other kinds at creation.

## 6 · Invocation classes and descriptions

Every skill belongs to exactly one class, and the class fixes how it starts and what its description looks like. The description is a pointer that sits in context on every turn, so each word has to earn its place: lead with the word that triggers it, give one trigger per branch (synonyms that rename one branch are one branch written twice), and leave out anything the body already says.

| Class | Started by | Frontmatter | Description |
|---|---|---|---|
| A | talking: the agent fires it when the request matches | model-invocable (no `disable-model-invocation`) | `<Leading word> <what it does in one clause>. Use when <branch>; <branch>.` Aim under 300 characters, hard limit 450. The first sentence stands alone in 140 characters, because the registry cuts there. |
| B | a person typing `/name`, never loaded by anything else | `disable-model-invocation: true`, plus `agents/openai.yaml` with `policy.allow_implicit_invocation: false` for Codex | a one-line human summary, no trigger list. It costs no context. |
| C | another skill, which names it | model-invocable (a manual skill cannot be loaded by another skill) | one line: what it is and which skills load it. The parent says `Call the Skill tool with "<name>"`. |

One rule drives the classes: a skill that the router, an instruction section, a hook or another skill tells the agent to load cannot be manual. A manual skill has no description the agent can reach, so that load would fail silently. Before marking a skill class B, measure who loads it (search the router, `.agents/instructions/`, `.agents/hooks/`, `cli/` and every other `SKILL.md`) and keep it model-invocable if anything does. Every `metadata.kind: context` skill is class A (§3). A manual skill is mentioned to a person as "run `/<name>`", never as something the agent loads.

Not every harness has a manual switch; the per-harness keys are in the `writing-for-agents` skill's `SKILL-MECHANICS.md`. Where a harness has none, the skill stays model-invoked there and the one-line summary keeps its context cost small.

Descriptions and triggers are English. Skills load by meaning in any language, so a prompt in Spanish or any other language reaches the same skill as its English equivalent, and replies still mirror the user's language (Critical Rule #12). Do not add literal trigger phrases in other languages to a description or to an instruction's `triggers:`.

The user-level skills this repo installs are `USER_LEVEL_SKILLS` in `cli/install.ts`. The ones a step loads are model-invocable, so the step says `Call the Skill tool with "<name>"` and states what happens when the skill is not installed. A manual one (`disable-model-invocation: true` upstream) is only mentioned to a person as `/<name>`.
