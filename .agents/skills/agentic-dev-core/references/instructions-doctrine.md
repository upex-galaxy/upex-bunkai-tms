# Instructions doctrine: where does this sentence go?

> The one sanctioned path for changing what the agent is told on every session or per request kind. Any change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list runs the procedure in §6, and every skill whose own flow writes a project fact into `agent-project.md` follows §4. Decision records: `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md` (the split) and `.context/ADR/ADR-0014-instructions-maintenance-locks.md` (what holds it in place). Folder guide: `.agents/instructions/README.md`.

## 1. The layers, by cost

Every host loads L0 on every session, and everything else costs nothing until a request needs it. So the question for a new sentence is not "is it important?" but "does it have to sit in the context of a session that is doing something else?".

| Layer | File | Loaded | Holds |
|---|---|---|---|
| L0 | `AGENTS.md` | every session, every host | the LOAD PROTOCOL and router, each Critical Rule's binding sentence, the behavioural layer (§2), the orchestration core (§3), the memory triggers |
| L1 | `.agents/instructions/agent-<id>.md` | when the router or a `ROUTE:` line names it | one request kind each: its rules, tables and pointers |
| L1, project | `.agents/instructions/agent-project.md` | routed by its own `triggers:` and its project context skills table | this project's own rules, key paths, accepted divergences and the rows of the skills it created; never synced |
| L2 | `.agents/skills/<skill>/SKILL.md` and `references/` | when the skill is invoked, or a reference is named | the how of one workflow: stages, flags, templates, doctrine |
| Knowledge | `.agents/skills/business-*-context/` and a project's own `<aspect>-context` | when a dispatch touches the aspect | judgment about the app (data, features, API), citing the maps |

## 2. The decision tree

Ask the questions in order and stop at the first yes.

```
Q1  Must it bind on EVERY turn, whatever the request is?
    (how the agent speaks and reasons, a Critical Rule, the LOAD PROTOCOL,
     how it dispatches subagents, when it saves memory, the router itself)
      yes -> L0, and only the binding sentence:
             - a Critical Rule: the sentence in AGENTS.md §1, the full text,
               rationale and examples in agent-critical-rules.md under the same
               number and name (the L0 line is a verbatim fragment of it)
             - a router row: see Q4, it is a decision, not an edit
      no  -> Q2

Q2  Is it true only for THIS project?
      knowledge about the app (entities, RLS, routes, screens, flows,
      vocabulary, how it is deployed)
          -> the matching business-*-context map (project-context mode
             data / features / api), or a project <aspect>-context skill
             (project-context mode context-skill)
      a rule, guardrail, key path or pointer for the agent working here
          -> agent-project.md, one heading per topic
      no  -> Q3

Q3  Does one skill own the workflow it describes (a stage, flags, a template,
    the syntax of a tool, a stage's doctrine)?
      yes -> that skill: references/ for the detail; one ## Compact Rules
             bullet as well when it must bind an executor (AGENTS.md §3 RULE
             REACHABILITY); a shared doctrine several skills cite goes in
             agentic-dev-core/references/
      no  -> Q4

Q4  Which REQUEST KIND needs it? Find the router row whose Kind covers it and
    write it in that row's Load section (agent-<id>.md).
      the section exists but prompts of that kind do not reach it
          -> widen that section's triggers: (or paths:), add the missed
             prompts to the eval set, let instructions:check score them
      no row's Kind covers it
          -> first try harder: rows are broad on purpose, and most "new
             kinds" are an existing kind seen from a new angle
          -> truly new: write the ADR that decides the new kind, add the row
             and its section, then `bun run instructions:check --accept-router
             ADR-NNNN` and cite the printed fingerprint in that ADR
```

## 3. Rules that hold whatever the tree answers

- L0 never grows by prose. A paragraph that explains a rule belongs in the rule's full text, and a paragraph that explains a topic belongs in its section. L0 keeps the sentence that binds, and `bun run instructions:check` holds its byte budget.
- A `NEVER` or `MUST` line in a section has to stay reachable when the section is not loaded. It cites `Rule #N`, a skill whose `## Compact Rules` carry it, a contract label L0 also carries, or it declares `<!-- binds-in-section: <reason> -->`. `instructions:check` fails an orphan. Writing the word in lowercase removes the lint check, not the rule, so the same obligation still needs a home.
- Committed prose names the source of truth and never its current value (Critical Rule #17): no counts of sections, prompts or rows, no measured size, no claim about the present state. Measurements go in an ADR.
- A synced file never holds a project fact. Every section except `agent-project.md` is overwritten by `bun sync`, so a project's rule, pointer or skill row goes in `agent-project.md`.
- A trigger miss is fixed in `triggers:`, never by relabelling the eval set, and a false hit is fixed by narrowing the trigger. Triggers are English: a prompt in another language reaches the section by meaning, and a prompt that only a non-English stem would match is recorded in the fixture's `meaningOnly` list instead of being added to a trigger.
- A new section ships complete: frontmatter (`id`, `title`, `load_when`, `triggers`, `paths`), a router row (which is an ADR, see Q4), at least three labelled prompts that expect its `id`, and a row in the `## Sections` table of `.agents/instructions/README.md`. `instructions:check` fails each missing piece.

## 4. Writes from other skills

A workflow skill whose own flow records a project fact writes that one place, `agent-project.md`, following §2 Q2 and §3, and closes with `bun run instructions:check`. The known writers:

| Skill | What it writes in `agent-project.md` |
|---|---|
| `project-context` | a missing key path after an artifact write (`## Key paths (this project)`); a project context skill's row and its triggers (mode `context-skill`) |
| `project-adoption` | the app's own facts the adoption plan approved (its key paths, its exceptions) |
| `testability-guide` | the pointer to the `/qa` page it registered |
| `git-flow-master` | the repository's own reading of its strategy and the reason for an accepted divergence (`## Git Strategy (this repository)`) |

None of them touches `AGENTS.md`, a synced section, the router or another section's `triggers:`. Those changes run the procedure in §6.

## 5. Worked examples

1. "Add to the credentials rule that a HAR file counts as a secret." Q1 yes, but the rule exists, so the addition goes in the full text of rule 1 in `agent-critical-rules.md`. The L0 line stays a verbatim fragment of it, and `instructions:check` fails a reworded one.
2. "Every PR the agent opens must link its story." Q3: `git-flow-master` owns the PR body, so the detail goes in its `references/pr-templating.md` and one compact rule carries it to the executor.
3. "Staging's database resets every night; no migration near the reset." Q2: the schedule is knowledge about the app, so it goes in the `business-data-context` map (through `project-context` mode `data`). The rule for the agent is a heading in `agent-project.md` that cites the map.
4. "The Vercel CLI needs `--scope` on every call." Q3: the syntax of one tool belongs to `vercel-cli` (`references/`). No section changes, because `agent-tool-resolution.md` only says which skill to load before the binary.
5. "Prompts about Supabase migrations do not get the tool-resolution section." Q4, a trigger miss: widen the `triggers:` of `agent-tool-resolution.md`, add the missed prompts to `cli/lib/fixtures/instruction-router-eval.json` with the ids a careful reader would load, and run `bun run instructions:check`. The eval scores the change in the same call and fails if the new trigger floods other prompts.
6. "We need a router row for performance work." Q4: performance work is developing or reviewing app code, and the `agent-code-quickref.md` row and the `agent-context-map.md` row ("starting a task") already cover it. Grow that section's map and its `triggers:`. A row is added only when no Kind fits, through an ADR and `--accept-router`.
7. "A teammate pasted thirty lines explaining our branching model into `AGENTS.md`." Undo it. The git section (`agent-git.md`) is a pointer, the strategy is `git_strategy:` in `.agents/project.yaml`, and `git-flow-master` owns the policy.
8. "Our team calls a story a 'card'; the agent should understand both words." Q2: project vocabulary is knowledge about the app, so the matching context map gets the term. If prompts that say "card" then miss a project rule, the trigger goes in `agent-project.md`'s own `triggers:`, which the project owns. A synced section's `triggers:` are upstream's, and the next `bun sync` would drop the edit.

## 6. The procedure

It is a plan, an edit and a verifier, cut to the size of a text change.

1. Place. For each sentence, walk §2 and write one line: sentence, file, the question that decided it. A sentence that lands in a skill or in a context map leaves this procedure for that skill's own flow (`skill-creator` for a skill, `project-context` for a map).
2. Router row? A new, changed or removed router row is a decision: record the ADR (`references/adr-doctrine.md`; `Accepted` when the owner already approved the change), make the edit, run `bun run instructions:check --accept-router ADR-NNNN`, and cite the fingerprint it prints in that ADR. Without the ADR the gate stays red, which is the lock working. With nobody at the keyboard, a supervised worker takes the decision to its launcher (`decision-protocol.md`), and a routine whose brief does not cover the change leaves the row alone and reports it.
3. Edit. L0 takes binding sentences only: a Critical Rule's full text goes in `agent-critical-rules.md` first, and the L0 line stays a verbatim fragment of it. A `triggers:` or `paths:` change adds the prompts that motivated it to `cli/lib/fixtures/instruction-router-eval.json`, labelled with what a careful reader of the router would load. Write the text with the two canon skills (`skill-scaffold.md`, "How a skill is written"). Call the Skill tool with "writing-for-agents" for structure: each sentence goes in the one place §2 names, pointers replace copies, and a sentence whose removal would change nothing is dropped. Call the Skill tool with "humanizer" for prose: plain verbs, no em or en dashes, no arrows used as verbs, no shouting capitals. When either skill is not installed, do that pass inline from this description, say so in the report, and carry on.
4. New section? Ship it complete (§3, last rule).
5. Verify. Run `bun run instructions:check` (budget, router, frontmatter, rules, binding, imports, the router lock, the eval, completeness), then `bun run docs:check` when a skill, script or doc path moved (the docs follow-through, `references/docs-follow-through.md`), then the quality gates of Critical Rule #6. Report a red gate with its output and never work around it.
6. Measure (optional). `bun run instructions:audit` reports how often routed sections are actually read, from local transcripts. Quote its overall number in the PR when the change is about routing.

## 7. Measuring the routes

The router eval proves the hook names the right section and keeps it on a binding `ROUTE:` line under the cap (binding recall). `bun run instructions:audit` measures whether the agent then read it, and how many reads followed a `ROUTE-PENDING:` reminder, from this machine's Claude Code transcripts (OpenCode and Codex transcripts are not parsed yet). It prints file names and counts only, never transcript text. A team that wants a trend can run it monthly (an Orca automation or a calendar reminder); the repo ships no routine for it.
