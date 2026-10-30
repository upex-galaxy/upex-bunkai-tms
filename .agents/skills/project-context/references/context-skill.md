# Context Skill Scaffolder (`context-skill` mode)

Scaffold a project-owned `<aspect>-context` skill: the judgment layer over one aspect of the product that a competent session would otherwise misread. Contract: `../../agentic-dev-core/references/skill-scaffold.md` §3-§5. The sources hold facts; the skill holds the rules for reading them.

**Target**: $ARGUMENTS (`<aspect>`: a project-chosen aspect such as `billing`, `auth`, `notifications`; optional path to what it sits over)

Data, feature and API knowledge already have an owner: the shipped business context map skills `business-data-context`, `business-feature-context` and `business-api-context` (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`), whose maps this skill's modes `data` / `features` / `api` generate and whose reading rules accrue in their own `## Rules` and gotchas. A request for `data-context`, `feature-context` or `api-context` is answered by pointing to that owner, never by scaffolding a second source over the same aspect.

---

## Inputs

| Aspect | What it sits over | Produced by |
|---|---|---|
| a business module (`billing`, `auth`, ...) | the module's code, its tables, its routes, the sections of the business maps that cover it (`bun run context:map <map skill> --section <id>`) | the code itself, modes `data` / `features` / `api` |
| an integration (`stripe`, `resend`, ...) | the integration's client module, its env vars, its webhook routes | the code itself |
| other | the path the user names | whoever owns it |

What it sits over MUST exist. Missing → run the owning step first (a map mode here, or the story that builds the module); never scaffold a context skill over nothing, because it would become the source by accident.

## Mode detection

- `.agents/skills/<aspect>-context/` absent → **CREATE**: write the scaffold after the analysis below.
- Present → **UPDATE**: generate the candidate, show the diff summary, WAIT for explicit approval. Rules already in `## Rules` are never rewritten; new ones are appended with their date.

## Analysis (before writing)

1. Read what it sits over in full. List every place a competent session could misread it: soft deletes, derived columns, RLS that hides rows from one role, status names that differ between the DB, the API and the UI, env-only behaviour (staging vs production), webhook ordering, auth edge cases.
2. Run each candidate through the three-question test (`skill-scaffold.md` §3). Regenerable → stays in the map or the code. Fact → stays in the map or the code. Judgment that must arrive unasked → a rule in the skill.
3. Every rule carries a date and how it was measured (a query through the `db` capability, a request, a test run, a session label). No measurement, no rule: record it in Engram instead.

## Output

`.agents/skills/<aspect>-context/SKILL.md` from the template in `skill-scaffold.md` §4 with `metadata.kind: context`, plus `references/gotchas.md` (measured table, empty allowed at creation). Build it THROUGH `skill-creator` (T3, installed at project level; load it silently): its draft loop, a description pass and three test prompts under `evals/evals.json`. If the install is missing on this machine, scaffold from the template and say so in the report; never skip the builder silently.

## Validation gate

- `bun run skills:check` → `KIND-SUFFIX` and `STALE-PATH` green. STALE-PATH is STRICT for a context skill: every `.context/` path it cites must exist on disk (only `.context/PBI/` is exempt), which is why what it sits over must exist first
- `bun run skills:registry` → the new block appears in `REGISTRY.md` with `kind: context`
- A row in the "Project context skills" table of `.agents/instructions/agent-project.md` (between `<!-- project-skills:start -->` and `<!-- project-skills:end -->`): the skill, when to load it, the triggers that route a prompt to it (backticked, case-insensitive regexes over the aspect's domain words), and the loader: the workflow skills that touch the aspect. A `agent-project.md` without that section gets it first, copied from `.agents/instructions/agent-project.md.template`. Never the shared `agent-skills-and-mcps.md` §5: `bun sync` overwrites that file and the row would vanish on the next update. Placement rules: `agentic-dev-core/references/instructions-doctrine.md` §4; close with `bun run instructions:check`.
- `bun run instructions:check` green (the row names an existing skill and its triggers compile) and `bun run docs:check` green (`roster` counts the row)
- The skill body contains no sentence that is also in the map or the code comments (spot-check three rules)

## Never

- Copy a table, an entity list or an endpoint list from a map into the skill.
- Ship a project context skill upstream: it is project-owned by construction, and `bun sync` never delivers, overwrites or deletes one.
- Register it in a shared instruction section (`agent-skills-and-mcps.md` or any other synced file): its row lives in `agent-project.md`, the one instruction file no update touches.
- Write to Jira or Confluence from the skill, or edit another skill.

## After its sources change (the UPDATE reminder)

When what a project-owned context skill sits over is regenerated (a map mode in UPDATE, a story that reshapes the module), offer to run THIS mode in UPDATE for it. The facts just changed and a human is already looking at a diff, so that is the one moment a review of the judgment layer is cheap. UPDATE appends dated rules and never rewrites an existing one; a rule the new sources contradict moves to the gotchas' `## No longer true` section, not deleted.
