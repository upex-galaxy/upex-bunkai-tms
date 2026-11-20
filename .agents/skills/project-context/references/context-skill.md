# Context Skill Scaffolder (`context-skill` mode)

Scaffold a project-owned `<aspect>-context` skill: the judgment layer over one aspect of the product that a competent session would otherwise misread. Contract: `../../agentic-dev-core/references/skill-scaffold.md` §3-§5. The sources hold facts; the skill holds the rules for reading them.

**Target**: $ARGUMENTS (`<aspect>`: a project-chosen aspect such as `billing`, `auth`, `notifications`; optional path to what it sits over)

Data, feature and API knowledge already have an owner: the shipped business context map skills `business-data-context`, `business-feature-context` and `business-api-context` (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`). Modes `data`, `features` and `api` generate their maps, and their reading rules accrue in their own `## Rules` and gotchas. A request for `data-context`, `feature-context` or `api-context` is answered by pointing to that owner. A second skill over the same aspect would become a competing source.

---

## Inputs

| Aspect | What it sits over | Produced by |
|---|---|---|
| a business module (`billing`, `auth`, ...) | the module's code, its tables, its routes, the sections of the business maps that cover it (`bun run context:map <map skill> --section <id>`) | the code itself, modes `data` / `features` / `api` |
| an integration (`stripe`, `resend`, ...) | the integration's client module, its env vars, its webhook routes | the code itself |
| other | the path the user names | whoever owns it |

What it sits over must exist. If it is missing, run the owning step first (a map mode here, or the story that builds the module): a context skill scaffolded over nothing becomes the source by accident.

## Mode detection

- `.agents/skills/<aspect>-context/` absent: **CREATE**. Write the scaffold after the analysis below.
- Present: **UPDATE**. Generate the candidate, show the diff summary and wait for explicit approval. Rules already in `## Rules` stay as written; new ones are appended with their date.

With nobody at the keyboard, the table in `../SKILL.md` ("With nobody at the keyboard") decides: CREATE proceeds, and an UPDATE is applied only when the brief approves it.

## Analysis (before writing)

1. Read what it sits over in full. List every place a competent session could misread it: soft deletes, derived columns, RLS that hides rows from one role, status names that differ between the DB, the API and the UI, env-only behaviour (staging vs production), webhook ordering, auth edge cases.
2. Run each candidate through the three-question test (`skill-scaffold.md` §3). Regenerable stays in the map or the code. A fact stays in the map or the code. A judgment that must arrive unasked becomes a rule in the skill.
3. Every rule carries a date and how it was measured (a query through the `db` capability, a request, a test run, a session label). A candidate with no measurement is not a rule yet: record it in Engram instead.

## Output

`.agents/skills/<aspect>-context/SKILL.md` from the template in `skill-scaffold.md` §4 with `metadata.kind: context`, plus `references/gotchas.md` (measured table, empty allowed at creation). Build it through `skill-creator` (T3, installed at project level; load it silently): its draft loop, a description pass and three test prompts under `evals/evals.json`. If the install is missing on this machine, scaffold from the template and say so in the report, so the missing builder is visible.

## Validation gate

- `bun run skills:check` shows `KIND-SUFFIX` and `STALE-PATH` green. STALE-PATH is strict for a context skill: every `.context/` path it cites must exist on disk (only `.context/PBI/` is exempt), which is why what it sits over must exist first
- `bun run skills:registry` adds the new block to `REGISTRY.md` with `kind: context`
- A row in the "Project context skills" table of `.agents/instructions/agent-project.md` (between `<!-- project-skills:start -->` and `<!-- project-skills:end -->`). The row has the skill, when to load it, the triggers that route a prompt to it (backticked, case-insensitive regexes over the aspect's domain words), and the loader: the workflow skills that touch the aspect. When the triggers are broad and must stay off coding prompts, its `Unless` cell names the rows it yields to (the column is described in the template). An `agent-project.md` without that section gets it first, copied from `.agents/instructions/agent-project.md.template`. The shared `agent-skills-and-mcps.md` §5 is the wrong place, because `bun sync` overwrites that file and the row would vanish on the next update. Placement rules: `agentic-dev-core/references/instructions-doctrine.md` §4; close with `bun run instructions:check`
- `bun run instructions:check` is green (the row names an existing skill and its triggers compile) and `bun run docs:check` is green (`roster` counts the row)
- The skill body has no sentence that is also in the map or the code comments (spot-check three rules)

## Never

- Copy a table, an entity list or an endpoint list from a map into the skill.
- Ship a project context skill upstream. It is project-owned by construction, and `bun sync` never delivers, overwrites or deletes one.
- Register it in a shared instruction section (`agent-skills-and-mcps.md` or any other synced file). Its row lives in `agent-project.md`, the one instruction file no update touches.
- Write to Jira or Confluence from the skill, or edit another skill.

## After its sources change (the UPDATE reminder)

When what a project-owned context skill sits over is regenerated (a map mode in UPDATE, a story that reshapes the module), offer to run this mode in UPDATE for it. The facts just changed and a person is already looking at a diff, so a review of the judgment layer is cheapest now. UPDATE appends dated rules and leaves existing ones alone; a rule the new sources contradict moves to the gotchas' `## No longer true` section instead of being deleted.

With nobody at the keyboard there is nobody to offer it to. The brief decides whether the UPDATE runs; without one, report that the skill may be stale and leave it as is.
