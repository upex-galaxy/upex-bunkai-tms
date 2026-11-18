# Fleet launch seam: how this repo's workflow skills hand work to a fleet

> Loaded by a workflow skill that distributes work (`sprint-development` in batch-sprint fleet mode, `autonomous-delivery` when its Phase 3 dispatch goes to workers, `product-management` for a refinement fan-out) and by whoever edits one. The fleet doctrine itself (gates, conductor cycle, worker contract, gotchas) is the user-level skill `/agent-orchestration`; this file holds only what is specific to this repo. Its siblings: `fleet-provisioning.md` (a fresh worktree) and `fleet-project-profile.md` (what this repo fills into the skill's slots).

---

## 1 · The one seam, and what the two paths share

Every workflow skill that distributes work writes a launch file, `launch.txt`, inside its own session scope: one self-contained, ready-to-paste line per unit of work. It writes that file always, whether or not a runtime exists.

What the pasted path and the supervised path share is the payload, not the argv: the same brief files, cited by the same absolute paths, and the same prompt text. On the supervised path the prompt travels as the worker's task spec, which is its first prompt; a human pastes the same text inside the `launch.txt` line. A paraphrased prompt is the failure this rule prevents.

| Responsibility | Without a runtime (the contract) | With a runtime (supervised) |
|---|---|---|
| Launch | the human opens N terminals and pastes N lines from `launch.txt` | `[ORCHESTRATION_TOOL] launch: one supervised worker per unit of work (agent, model, effort), the prompt as its task spec` |
| Prompt | inside the pasted line | the task spec, same text, opening with `/<workflow-skill> <label> fleet worker` |
| Credentials | the pasted line opens the bare harness binary, so the harness process holds no `.env` value (ADR-0016) | identical: each MCP server that needs `.env` values starts through the `.env` loader, which reads the worktree's `.env` (`fleet-provisioning.md` §2). The conductor verifies credentials on the worker's screen before relying on it |
| State | the workflow's own blocked-state tokens in its session memory, plus the tracker | the mailbox: `worker_done`, `escalation`, `ask` |
| Sibling awareness | each worker knows only its own ticket | the roster in the brief; a worker broadcasts a fact that changes someone else's decision |
| Close | the human closes the terminals | `[ORCHESTRATION_TOOL] close: the close sequence of the conductor cycle` |

Workflow skills write `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and point at `/agent-orchestration` for the grammar (`.agents/instructions/agent-tool-resolution.md` §6).

---

## 2 · What a workflow skill writes

### 2.1 · The launch file

- Path: `<<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/launch.txt`, inside the scope of the workflow skill that distributes the work. Only a run that no single workflow skill owns (a conductor running `/agent-orchestration` directly) keeps it in the orchestration scope, `.session/orchestration/<slug>/launch.txt`, never in both.
- Regenerate it whole at each planning pass. Finished items drop out; nothing is edited in place.
- One line per unit of work, self-contained. A line that depends on something typed earlier in that terminal is not a launch line.
- Shape: the per-harness lines of the `/agent-orchestration` `launch.txt` template, with the permission flag that matches `orchestration.permission_modes.worker` in `.agents/project.yaml` (the skill's machine setup §3 translates it per harness). This repo also declares Pi (`harnesses:`, ADR-0022), which the template does not carry: `pi --approve '<prompt>'`, where `--approve` trusts the folder for that one run. Confirm every flag with `<harness> --help` before pasting.
- The line runs the harness's own binary in the worktree, with no wrapper (ADR-0016).

Two things about the pasted line do not survive the supervised path:

1. An environment prefix does not reach a supervised worker: there is no argv on the native launch. Detect fleet mode from the prompt token and the brief, never from an environment variable.
2. A session-name flag exists only in a pasted line. On the supervised path this repo's identity hook names the session from the prompt token (`fleet-project-profile.md` §3).

### 2.2 · The prompt, which both paths share

```
/<workflow-skill> <label> fleet worker. Read <ABS>/<scope>/COMMON.md then <ABS>/<scope>/W-<label>.md
and execute your brief. Run every stage without returning to the prompt until worker_done is sent;
stage boundaries are not checkpoints; the one stop is ending your turn right after an ask.
Channel: orca orchestration send. No heartbeats.
ROUTE-SCOPE: <section ids the work needs, e.g. git, harnesses; or none>
```

- The opening token is load-bearing: the identity hook reads it to title the session and the workflow skill reads it to know it runs as a fleet worker (G84).
- The continuation sentence belongs in the prompt, the brief and `COMMON.md` (G58).
- `ROUTE-SCOPE:` is this repo's addition and goes last: the prompt hook classifies it instead of the whole prompt (ADR-0018, `fleet-project-profile.md` §5). It runs to the end of its line, so nothing follows it.
- Quoting: the whole prompt single-quoted, no `'` and no unescaped `"` inside, `sh -n` over the file before anything is launched (G30; the skill's brief template §1).

### 2.3 · The gated lines

When the orchestration gate passes (`/agent-orchestration`, runtime gate state C), a workflow skill may do only these things, each one gated and each one silent when the gate fails:

1. Hand the work to the launcher instead of asking the human to paste it: one supervised worker per unit of work, the prompt as its task spec.
2. Seed the per-unit brief with the fleet fields of the skill's brief template, including `Run: <run_id>` when the worker is launched without a dispatch.
3. Add the mailbox report to what a worker already writes. The workflow's own tokens and files stay.
4. Open a generated HTML surface in a worktree-bound tab instead of the system browser (§5).

Everything else (Runs, Tasks, board cards, waiting, liveness, closing) belongs to `/agent-orchestration`, and a workflow skill never spells out a command for it.

---

## 3 · What a workflow skill must never do

| Never | Why |
|---|---|
| list a runtime, a binary or an app as a prerequisite | the flow works without it |
| put it in a non-bypassable probe | a machine without it would fail a gate it has no reason to pass |
| mention it in a PR body, an implementation plan, a tracker comment or any report of record | the artifact of record reads identically on every machine |
| include it in the blocked-token sweep | the sweep is the fallback that must work without it |
| name it to the user when the gate fails | state A is total silence; the install line belongs to `/agent-orchestration` and fires only when the user asked for orchestration |
| change what a single worker does | N=1 keeps its behaviour byte for byte |
| paraphrase the prompt, on either path | the prompt is the payload both paths share |
| detect fleet mode from an environment variable | it survives neither path |

The test for any future edit: would this line still make sense, unchanged, to a developer who has never heard of the orchestrator? If not, it belongs in `/agent-orchestration`.

---

## 4 · Per-skill scope and topology

| Skill | Scope for `launch.txt` | Topology |
|---|---|---|
| `sprint-development` (batch-sprint, N>1) | `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/` | one Orca worktree per worker, one worker per story; merge and staging deploy serialized through the conductor (`sprint-development/references/fleet-mode.md`) |
| `autonomous-delivery` (unattended) | its own mode scope, `.session/autonomous-delivery/<mode>/` | one worktree per dispatched story or bug, inside its mode cap (`autonomous-delivery/references/worker-dispatch.md`) |
| `product-management` (backlog refinement fan-out) | its own batch scope | same checkout, one worker per epic or story; state lives in the tracker |

The scope directory name is whatever that skill's own session-management contract declares; this seam never invents a new scope shape.

### 4.1 · Topology per activity in this repo

The general rule (decide by what the work writes) is the skill's topologies reference. This repo's activities:

| Activity | Topology | Why |
|---|---|---|
| `sprint-development` batch-sprint | one worktree per worker, one worker per story; stories that share a module or a migration run sequentially | it writes code; two sessions in one checkout collide on the git index, and two dev servers fight over one `.next/` build directory (G38) |
| bug burn-down | one worktree per bug cluster | three bugs with one root cause are one worker |
| `product-management` refinement fan-out | fleet in the same checkout, one worker per epic or story | it writes no code; the state of record is Jira |
| a cross-cutting refactor split by module | one worktree per module, explicit file ownership | two workers on one module conflict by construction |
| `project-context` maps, audits, research | not a fleet: one-shot subagents | these are reads |
| unattended delivery | `/autonomous-delivery` dispatching into worktrees | `autonomous-delivery/references/worker-dispatch.md` |
| other unattended routines | a scheduled automation over an existing workspace | `fleet-project-profile.md` §2 |

The partition rule for a delivery fleet (module, migration sequence, generated files) is in `sprint-development/references/fleet-mode.md`.

---

## 5 · HTML surfaces

A read-by-a-human page (an `mkd` decision deck, an HTML report or plan in a Run scope, a rendered business map, a design bundle opened for review) may open in a worktree-bound tab when the gate passes; when it fails, it opens the ordinary way and nothing is said. The two routes (`file://` for a page the owner reads, a loopback URL for a page the owner answers), the clipboard dead end and the one-copy rule for a page that holds state are in the skill's Orca provider file (board card and pages).

---

## 6 · Review checklist for a seam edit

- [ ] The launch file is written on both paths, unconditionally.
- [ ] The prompt is identical on both paths and opens with `/<workflow-skill> <label> fleet worker` (G84).
- [ ] The permission flag matches `orchestration.permission_modes.worker`.
- [ ] The prompt carries the continuation sentence and ends with `ROUTE-SCOPE:`.
- [ ] Nothing detects fleet mode from an environment variable.
- [ ] Every line is self-contained, single-quoted and passes `sh -n`.
- [ ] The gated block is genuinely gated, and its failure mode is silence.
- [ ] N=1 behaviour is unchanged; the workflow's own tokens and artifacts are still written.
- [ ] Every orchestration action is `[ORCHESTRATION_TOOL]` pseudocode pointing at `/agent-orchestration`.
