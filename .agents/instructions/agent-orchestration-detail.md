---
id: orchestration-detail
title: "Orchestration detail"
load_when: "planning a dispatch beyond one subagent, running a fleet or a supervised worker, choosing an execution pattern, designing a gate, or handling auth material a subagent writes to disk"
triggers: ["subagent", "subagente", "\\bfleet\\b", "\\bflota\\b", "\\bworkers?\\b", "orchestrat", "orquest", "\\bdispatch", "briefing", "\\bgates?\\b", "paralel", "parallel"]
paths: []
---

# Orchestration detail

> Section `orchestration-detail` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

The core of orchestration mode (main thread vs subagents, the 7-component briefing, rule reachability, the error protocol and the binding sentence of each contract below) stays in `AGENTS.md` § 3. This file holds the detail behind it.

## 3. ORCHESTRATION MODE: detail

**TWO EXECUTORS.** One-shot subagents are the DEFAULT executor and nothing below changes that. A second, OPTIONAL executor exists: the **supervised worker**, a persistent agent session coordinated through `/orca-orchestration` (conductor ↔ worker mailbox). It is gated on the orchestration binary AND a reachable runtime; when either is missing the repo is SILENT about it and the work runs on subagents plus the `launch.txt` lines a human pastes. Never name it to the user from a workflow skill when the gate fails.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask / reply / send at any moment, both ways |
| Git | the orchestrator's index | its own worktree and branch, one story per worker |
| Best for | reading, mapping, verifying; one-shot tasks | a whole story through Stages 1-3 to an open PR, work the owner wants to step into |

The conductor keeps using SUBAGENTS for its own reads and verifications, and keeps every shared-state write (merge, staging deploy, shared-DB migration, sprint report) for itself. A supervised worker is warranted when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Doctrine: `agentic-dev-core/references/orchestration-doctrine.md`; transport: `/orca-orchestration`; the story fleet: `/sprint-development` fleet mode.

**EXECUTION PATTERNS**:

| Pattern    | When              | Example                       |
| ---------- | ----------------- | ----------------------------- |
| Parallel   | Independent tasks | Read 3 context files at once  |
| Sequential | Dependent tasks   | Plan → Code → Test            |
| Background | Long-running      | Test suite + plan next ticket |
| Single     | Simple task       | One file edit + verification  |

**EPHEMERAL-ARTIFACT CONTRACT (secret hygiene)**: subagent materializing auth/session material to disk (cookie jar, `storageState.json`, token file, `.har` with `Authorization`/`Cookie`, session-bearing logs, DB dump) MUST: write ONLY to session scratch dir (never repo tree, not even ignored paths) → delete BEFORE reporting → disclose `secrets_materialized: none|<kinds>` + `cleaned: yes|no (<reason>)` in report. `cleaned: no` = BLOCKER surfaced to user. NEVER echo material into report/plan/commit/PR/tracker comment.

**GATE DESIGN: FAIL-CLOSED**: gate keyed on value the gated agent itself writes is fail-open (agent disables own gate by emitting plausible value). Every gate MUST: require citation of decision procedure alongside value + treat missing/malformed citation AS the blocking value + name who may fill it (when decision belongs to another skill, gated agent may emit blocking value only).

**VALUE PROVENANCE**: Rule #10 generalizes to ALL config. Any claim about project config cites file it was read from, same turn. NEVER quote skill reference / template / worked example as project state: reference values are illustrative and routinely differ.

**DEEP DETAIL** (subagent-cacheable) → `.agents/skills/agentic-dev-core/references/` (briefing-template, dispatch-patterns, orchestration-doctrine, skill-composition-strategy).
