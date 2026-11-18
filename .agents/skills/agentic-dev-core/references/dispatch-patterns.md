# Dispatch patterns: decision guide

> Cited by the "Subagent Dispatch Strategy" tables of the workflow skills.
> Pairs with `agentic-dev-core/references/briefing-template.md`, the 7-component briefing every dispatch follows.

This file picks the shape of a dispatch: how many subagents, in what order, blocking or not. It also names the two executors a dispatch can run on.

## When to use each pattern

| Pattern    | Use when                                      | Typical subagent count | Anti-pattern                          |
| ---------- | --------------------------------------------- | ---------------------- | ------------------------------------- |
| Single     | One contained task, isolates main context     | 1                      | Don't use for trivial 1-file edits    |
| Sequential | Stage B needs Stage A's output                | 1 per stage            | Don't use when stages are independent |
| Parallel   | N independent tasks, no dependencies          | 2-10                   | Don't fan out to >10 (rate limits)    |
| Background | Long-running task (>5 min) blocks main thread | 1                      | Don't background tasks <5 min         |

## Heuristic

Walk these gates in order. The first one that matches wins.

1. Is the work CPU-bound and short (<2 min), reading or writing 2 files or fewer? Go **inline** (no dispatch) and call `Read` or `Edit` directly.
2. Is it long, blocking and monitorable from outside (for example `gh run watch`, a CI suite, a long build)? Use **Background**.
3. Are there N independent jobs of the same shape, with N > 1? Use **Parallel** and fan out in one tool-call block.
4. Is it a pipeline where each stage consumes the previous stage's output? Use **Sequential**: one dispatch per stage, feeding Stage N's report into Stage N+1.
5. Is it a single non-trivial task (touches 3+ files, loads a heavy skill or runs a multi-step verification) that benefits from isolating the orchestrator's context? Use **Single**.

When two gates seem to fit, take the earlier one, since it is more specific.

---

## Two executors

One-shot subagents are the default executor, and every pattern above describes them. The optional second executor is the supervised worker: a persistent session coordinated through the user-level skill `/agent-orchestration`. It is gated on the orchestration binary and a reachable runtime. When either is missing, the work runs on subagents plus the `launch.txt` lines a human pastes, and a workflow skill stays silent about workers instead of naming them to the user. The comparison between the two, the execution patterns and the gate design are in `.agents/instructions/agent-orchestration-detail.md`.

---

## Real examples in this repo

| Pattern    | Example skill / file                                                                                        | What gets dispatched                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Parallel   | `.agents/skills/sprint-development/SKILL.md` Stage 2, verification (lint, types, tests)                     | 3 verifiers in parallel, one per app script, each reporting its exit code and failures.                               |
| Background | `.agents/skills/sprint-development/SKILL.md` Stage 4, deploy to staging                                     | A deploy agent plus a background monitor that watches the health and smoke window.                                    |
| Sequential | `.agents/skills/sprint-development/SKILL.md` Stage 3, fix-and-iterate after a red review                    | An implementation agent applies the review notes, then verification re-runs, one after the other.                     |
| Single     | `.agents/skills/sprint-development/SKILL.md` Stage 1, plan creation                                         | 1 planner agent that reads the story and its ACs, decomposes the tasks and writes `implementation-plan.md`.           |

When you extend a skill, mirror the pattern of its closest sibling instead of inventing a new one. Consistency keeps the orchestration legible.

---

## What not to do

- Don't dispatch one-file reads. An inline `Read` is faster and costs no sub-conversation slot. Subagent overhead pays off only when the agent does meaningful work (3+ files, a skill load, a multi-step verification).
- Don't Parallel-dispatch more than 10 agents against the same external API (Jira, GitHub). The service rate-limits you, the orchestrator gets a flood of 429s and recovery is messy. Cap fan-out at 10, and above that chunk the work into batches run Sequentially.
- Don't Background a task under 5 minutes. A background wait carries a sleep cost: after `delaySeconds > 300` the prompt cache is gone and the next turn re-reads the whole conversation. For a shorter task, wait inline, or Single-dispatch it if you want context isolation.
- Don't use Sequential when Parallel works. If A and B are independent, Parallel costs the wall-clock time of the slowest one, where Sequential costs the sum. The classic mistake is ordering two reads that do not depend on each other.
- Don't delegate planning. The orchestrator owns the plan and its scope, and subagents execute it. Inside the plan a subagent decides technical calls and reports them as DECIDED (`decision-protocol.md`), and it escalates to the orchestrator only the four §5 kinds (product behaviour, a new security posture, an irreversible or outward action, what the owner reserved). A subagent allowed to decide what to do next beyond the plan silently expands its scope and makes the orchestrator's view of progress incoherent.
- Don't fan out without a clear merge step. Parallel agents return reports, and the orchestrator has to know what to do with N reports before it dispatches them. If you cannot say how they merge, the job is Sequential in disguise.
- Don't reuse a subagent across phases. Each dispatch is a fresh agent and a one-shot contract: briefing in, report out. State carried across dispatches belongs in files the orchestrator owns, not in agent memory.
