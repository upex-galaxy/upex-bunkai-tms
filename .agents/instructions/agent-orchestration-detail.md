---
id: orchestration-detail
title: "Orchestration detail"
load_when: "planning a dispatch beyond one subagent, running a fleet or a supervised worker, choosing an execution pattern, designing a gate, or handling auth material a subagent writes to disk"
triggers: ["subagent", "\\bfleet\\b", "\\bworkers?\\b", "orchestrat", "\\bdispatch", "briefing", "\\bgates?\\b", "parallel"]
paths: []
---

# Orchestration detail

> Section `orchestration-detail` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

The core of orchestration mode (main thread against subagents, the 7-component briefing, rule reachability, the error protocol and the binding sentence of each contract below) is in `AGENTS.md` §3. This file holds the detail behind it.

## 3. Orchestration mode: detail

### Two executors

The one-shot subagent is the default executor, and nothing below changes that. The second executor is optional: the supervised worker, a persistent agent session coordinated through the user-level skill `/agent-orchestration` over a conductor and worker mailbox. It needs the orchestration binary and a reachable runtime. When either is missing the repo says nothing about it, and the work runs on subagents plus the `launch.txt` lines a human pastes. So a workflow skill never names the worker to the user when the gate fails.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask, reply and send at any moment, both ways |
| Git | the orchestrator's index | its own worktree and branch, one story per worker |
| Best for | reading, mapping, verifying; one-shot tasks | a whole story through Stages 1 to 3 to an open PR, work the owner wants to step into |

The conductor keeps its own reads and verifications on subagents, and keeps every shared-state write (merge, staging deploy, shared-DB migration, sprint report) for itself. A supervised worker earns its cost when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Doctrine: `agentic-dev-core/references/orchestration-doctrine.md`; transport: `/agent-orchestration`, with this repo's half in `agentic-dev-core/references/fleet-launch-seam.md`, `fleet-provisioning.md` and `fleet-project-profile.md`; the story fleet: `/sprint-development` fleet mode.

### Execution patterns

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan, code, test |
| Background | Long-running | Test suite while planning the next ticket |
| Single | Simple task | One file edit plus verification |

### Ephemeral-artifact contract (secret hygiene)

A subagent that writes auth or session material to disk (a cookie jar, `storageState.json`, a token file, a `.har` with `Authorization` or `Cookie`, session-bearing logs, a DB dump) follows three steps. It writes only to the session scratch dir, never the repo tree, not even ignored paths. It deletes the material before reporting. It discloses `secrets_materialized: none|<kinds>` and `cleaned: yes|no (<reason>)` in its report. `cleaned: no` is a blocker the orchestrator surfaces to the user. The material is never echoed into a report, plan, commit, PR or tracker comment.

### Gate design: fail-closed

A gate keyed on a value the gated agent writes itself is fail-open, because the agent can open its own gate by emitting a plausible value. Every gate does three things. It requires a citation of the decision procedure beside the value. It treats a missing or malformed citation as the blocking value. It names who may fill the value in; when the decision belongs to another skill, the gated agent may emit only the blocking value.

### Value provenance

Rule #10 extends to all config. A claim about project config cites the file it was read from, in the same turn. A skill reference, a template or a worked example is never quoted as project state, because their values are illustrative and routinely differ from the project's.

Deep detail a subagent can cache lives in `.agents/skills/agentic-dev-core/references/` (`briefing-template`, `dispatch-patterns`, `orchestration-doctrine`, `skill-composition-strategy`).
