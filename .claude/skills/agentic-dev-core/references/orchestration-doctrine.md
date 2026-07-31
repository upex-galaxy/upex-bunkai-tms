# Orchestration Doctrine

> **Mirror**: this file mirrors `CLAUDE.md` §3 ("ORCHESTRATION MODE — PERMANENTLY ACTIVE").
> If you change the doctrine, update both files. The root CLAUDE.md is the canonical source.
> Rationale: subagents need to load this without pulling the full CLAUDE.md into their context.

## Orchestration Mode (Subagent Strategy)

**Core Principle**: Main conversation = command center. Subagents = executors.

> **Sanctioned exceptions** (not violations of the doctrine): a skill MAY define an explicit, user-invoked all-inline (**Solo**) mode that dispatches no subagents, AND MAY pin a specific step to the session that owns a non-delegable resource (e.g. a browser/extension or user auth bound to the main session). Example: `/sprint-development` Solo mode, and its live-UI step when the chosen tool is the session-bound claude-in-chrome MCP.

**Use subagents for**: Reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits.

**Do NOT use subagents for**: Quick lookups, memory reads/writes, task tracking, asking the user, planning.

**Briefing format** -- every dispatch must include:

1. **Goal**: One-sentence description
2. **Context docs**: Which files to read first
3. **Skills to load**: Which skills the subagent needs (e.g., `/playwright-cli`)
4. **Exact instructions**: Step-by-step, not vague goals
5. **Report format**: What to return (files changed, tests passed/failed, blockers)
6. **Rules**: Relevant Critical Rules to follow

### Rule reachability (a rule a subagent cannot see does not exist)

A dispatched subagent sees ONLY: its briefing, the `## Project Standards (auto-resolved)` block copied from `.claude/skills/REGISTRY.md`, and the files the briefing names. It does NOT walk the `references/` tree of the skills that own the work.

Therefore, for any rule that must BIND an executor (a prohibition, a fail-closed gate, a credential contract, a cleanup obligation):

1. The rule lives in its owning `references/*.md` (full statement + rationale) **AND**
2. It appears as a bullet under the owning skill's `## Compact Rules` section in `SKILL.md`, so `scripts/build-skill-registry.ts` propagates it into `REGISTRY.md` (Strategy A extraction) **AND**
3. The dispatching orchestrator restates it in component **6 (Rules)** of the briefing for any dispatch that could trip it.

A rule that exists only in a reference file is documentation for the orchestrator, not a constraint on the executor. **Observed failure mode**: credential improvisation and un-cleaned session artifacts by stage subagents that never opened the reference stating the rule.

### Ephemeral-artifact contract (secret hygiene)

Any subagent that MATERIALIZES authentication or session material to disk is bound by this contract. Material means: cookie jars, `storageState.json` / saved auth state, bearer-token or API-key files, `.har` captures containing `Authorization` / `Cookie` headers, session-bearing request logs, DB dumps, or any file whose contents would grant access if leaked.

1. **Location**: write it ONLY under the session scratch directory. NEVER under the repo working tree, not even in an ignored path.
2. **Lifetime**: delete it before returning control to the orchestrator. Not "at end of sprint", not "when the session closes" -- before the report.
3. **Disclosure**: the report (briefing component 6) MUST include:
   ```
   secrets_materialized: none | <list of artifact kinds>
   cleaned: yes | no (<reason>)
   ```
   `cleaned: no` is a BLOCKER the orchestrator surfaces to the user; it never passes silently.
4. **Never** echo the material into the report body, a plan, a commit message, a PR body, or a tracker comment. Reference it by kind, never by value.

The orchestrator restates this contract in every briefing whose work involves logging into a running app, capturing traffic, or holding a token.

### Gate design -- fail-closed, evidence-bearing

A gate keyed on a value the gated agent itself writes is FAIL-OPEN: the agent can disable its own gate by emitting a plausible value. Any gate in any skill must therefore:

1. Require a **citation** alongside the value -- the decision procedure that produced it (which tree, which questions, which answers), verbatim enough to audit.
2. Treat a **missing, empty, or malformed citation as the blocking value**, regardless of what the value field says.
3. Name explicitly WHO may fill the field. When the decision belongs to another skill, the gated agent may only emit the blocking value; only the hand-off may resolve it.

**Observed failure mode**: a planner emitted a plausible chain-strategy label without running the decision tree, which turned off the gate meant to force that very decision.

### Value provenance (config claims cite the file they came from)

CLAUDE.md Rule #10 ("scripts = read `package.json` directly") generalizes to ALL project configuration:

- Any statement about what a project is configured to do cites the file and location it was read from, in the same turn (`read from .agents/project.yaml`).
- NEVER quote a value from a skill reference, a template, or a worked example as if it were this project's state. Reference files contain ILLUSTRATIVE values that routinely differ from any real project.
- Config samples inside `references/*.md` are labelled as examples at the point of use, so a later reader cannot mistake one for state.

### Execution Patterns

| Pattern        | When              | Example                                         |
| -------------- | ----------------- | ----------------------------------------------- |
| **Parallel**   | Independent tasks | Read 3 context files simultaneously             |
| **Sequential** | Dependent tasks   | Plan -> Code -> Test                            |
| **Background** | Long-running      | Test suite execution while planning next ticket |
| **Single**     | Simple task       | One file edit with verification                 |

**Error protocol**: On subagent error -- STOP, report to user with full context, do NOT fix without approval, present options (retry/skip/abort).

**Planning**: Present plan -> wait for approval -> track progress -> report results.
