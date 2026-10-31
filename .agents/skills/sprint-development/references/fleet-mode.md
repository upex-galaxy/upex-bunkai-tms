# Fleet Mode — batch-sprint development with N executors

Read this ONLY when batch-sprint mode runs with **more than one executor**. The scope × executors axis is defined in `SKILL.md` §"Executors: one session or a fleet"; the sprint roadmap checkpoint, the per-ticket stages and their gates are unchanged and live in `SKILL.md`. This file covers exactly what N>1 adds, and nothing else.

> **N=1 is untouched.** Every rule here is additive. A batch-sprint run with one executor behaves byte for byte as it did before this file existed: same ticket loop, same stages, same sprint-report writes. If a rule below would change N=1 behaviour, the rule is wrong.

> **Split of duties.** This skill owns **WHAT**: the queue, the rounds, the assignment, the per-story isolation, the sprint report and the merge order. The orchestration skill owns **HOW**: sessions, terminals, mailbox, supervision, cleanup, claims. Every orchestration action below is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and resolves in `orca-orchestration/SKILL.md`; never inline an orchestration command here.

---

## 1. Vocabulary

| Term | Meaning here |
|---|---|
| **conductor** | the session that talks to the user, owns the sprint scope, merges and deploys. One per sprint run. |
| **worker** | one launched session running this skill in single-ticket mode on exactly one story or bug. |
| **fleet** | every worker of this sprint run. |
| **round** | one concurrency group: up to `orchestration.max_workers` tickets in flight at once. |
| **execution sprint** | an ordering bucket of `.context/dev-roadmap.md` (which ticket unblocks which). Not a round: one execution sprint can need several rounds. |
| **roster** | the file that maps a human label ("W2", "the billing one") to a worker's ticket key, session label and handles. |
| **brief** | the per-ticket payload the conductor seeds before launching a worker. |
| **launch file** | `launch.txt`: one self-contained shell line per ticket, always written. |
| **claim** | a worker's declared intent to read or write shared data, a shared schema or a shared identity. |

---

## 2. When fleet mode is allowed

All three must hold:

1. The mode is **batch-sprint**. Single-ticket mode never has a fleet.
2. Either the user asked for it, or `.agents/project.yaml` → `orchestration.max_workers` is greater than 1. An explicit user instruction ALWAYS wins over the yaml default. A project with no `orchestration:` block runs N=1.
3. Every ticket in the round is genuinely unblocked: its direct blockers are merged into the integration branch (git, not the tracker, decides that; Phase 0b and the compact rule on ticket availability apply per ticket, unchanged).

The **orchestration gate** (binary present + runtime reachable, three-state, canon in `orca-orchestration/SKILL.md`) then decides only ONE thing: who opens the sessions. Gate passes → the orchestration layer launches and supervises them, and the conductor gets a mailbox, native liveness and one-command cleanup. Gate fails → the human opens them from `launch.txt`, and the conductor keeps every other duty in this file. Run the gate there; never reimplement it here.

**Silence rule (hard).** When the gate does NOT pass, the conductor writes `launch.txt` anyway, tells the user "N ready-to-paste lines are in `<path>`, open N terminals at the repo root and paste one per terminal", and **never names the orchestration binary, never recommends installing anything, never reports its absence**: not in the plan, not in a PR body, not in the sprint report. The test for any line you are about to write: *would it still read correctly to a developer who never heard of any orchestration tool?* If not, the line belongs in `orca-orchestration`, not here.

**What the conductor stops doing at N>1.** It does not run Stages 1-3 for any ticket assigned to a worker. It plans the rounds, seeds briefs, launches, waits, processes reports, and owns everything in §2.1.

### 2.1 Conductor-only operations

Serialized through the conductor and NEVER done by a worker, because each one mutates shared state that has exactly one correct value:

| Operation | Why conductor-only |
|---|---|
| Stage 4: merge into the integration branch + staging deploy + its verification | one staging environment, one correct merge order; two workers deploying is a race neither can see. Merge in dependency order, one ticket at a time, and verify the deployment for each merge SHA reads `READY` before the next (Critical Rule #16) |
| Stage 5: production deploy | always manual per ticket, exactly as in N=1 |
| Applying a migration to a shared database | irreversible and hits every worker at once. The conductor reads the DB MCP's migration history at apply time and applies per `{{stack.database.migrations_tool}}` (`agentic-dev-core/references/db-change-doctrine.md`); a worker sends its SQL and waits |
| Regenerating output from a live instance (Supabase types, `bun run api:sync` into `api/schemas/`) | one writer, after the last migration lands; a worker's regeneration silently absorbs a sibling's unmerged schema |
| The sprint report `.context/reports/SPRINT-{N}-DEVELOPMENT.md` | one writer, rows ordered by close time |
| Bulk tracker pull (`bun run context:hydrate`, `jira:sync-issues pull` / `jql`) | rewrites the whole `.context/PBI/` cache; a worker's own `get <KEY>` is fine |
| Generated registries (`.agents/skills/REGISTRY.md`, the `bun run agents:compat` surfaces) | whole-repo files; a generated-file conflict is regenerated, never hand-merged |
| `launch.txt`, `roster.md`, `claims.md` | the fleet's own bookkeeping |

---

## 3. Worker identity — the prompt and the brief, not the environment

**The prompt is the channel.** A worker's first prompt opens with the skill, the ticket key and the literal token `fleet worker`, then points at its brief:

```
/sprint-development UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.
```

Same text on both launch paths (§5 rule 2), so a worker cannot tell them apart.

Two signals, in this order, make a session a worker:

| Signal | Where | What it decides |
|---|---|---|
| the token `fleet worker` next to a skill invocation and a ticket key | the launch prompt | this session is a worker; that key is the single ticket it owns |
| `Label` · `Task` · `Dispatch` in the brief's `## Meta` | `sprint-<N>/<KEY>/brief.md` | which worker it is, and how it reports (§9) |

**Environment variables are NOT a channel.** An env prefix in a launch line reaches a supervised worker never (the native launch has no argv), and was measured empty on a real fleet even on the pasted path. Nothing in this skill may depend on one.

A worker:

- runs **single-ticket** mode on the key in its prompt, in the mode (Orchestrated or Solo) its brief names;
- **runs to completion without returning to its prompt.** Stage boundaries are not checkpoints: the run ends when the done-report is sent (§9). A worker that parks at its prompt after Stage 1 looks exactly like a crashed one to the conductor's liveness sweep;
- runs **without human checkpoints**: §8 "EXPLAIN STORY" and "WAIT FOR CONFIRMATION" of `AGENTS.md` become report content, because nobody is watching its terminal. The story explanation and every stage summary go into its report; anything that genuinely needs a decision goes out as an `ask` (§9), never as a user-question prompt nobody will see;
- **never skips a gate**: the design gate on a UI story, the workload forecast gate, the automation-identity gate, the capability probes. A gate that would have stopped for a human becomes a blocking `ask` or a `BLOCKED:` report, never a guess;
- runs Stages 1-3 and **stops at an open PR**: it pushes its own branch and opens its own PR, transitions its own ticket per `agentic-dev-core/references/artifact-lifecycle.md`, and never merges, never deploys, never applies a migration to the shared database (§2.1);
- creates **no sprint-altitude state**: no sprint report row, no bulk sync. Its session scope is `<<PRIMARY_ROOT>>/.session/sprint-development/<KEY>/`, exactly as in N=1;
- reports **once** when done, plus `ask` / `escalation` as needed, and then stops. No heartbeats: periodic "still alive" messages wake the conductor for nothing and are prohibited by the worker contract (`orca-orchestration/references/worker-contract.md`), which overrides any generic preamble the launcher injects.

A session with no `fleet worker` prompt and no brief is not a worker.

---

## 4. The brief — seeded by the conductor, before launch

One file per ticket: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/<KEY>/brief.md`. The conductor writes it **before** the worker exists; creating, launching and briefing is ONE indivisible operation (a launched worker with no brief burns a whole session doing nothing).

Never write a brief under `.context/PBI/**`: that tree is a Jira sync cache and the next pull overwrites it.

The brief extends the 7-component briefing (`agentic-dev-core/references/briefing-template.md`) with the fleet fields:

```markdown
# Brief — <KEY> (worker <label>)

## Meta
label: <W1> · task: <task id or "-"> · dispatch: <dispatch id or "-">
ticket: <KEY> · type: <story|bug> · priority: <priority> · execution sprint: <n> · round: <n>
sprint scope (absolute path): <<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/
worktree: <abs path> · branch: <feature/KEY-slug> · base: <integration branch, or production when it is null>
environment: <env> · web: <url> · api: <url>
execution mode: Orchestrated | Solo
automation identity: <slot name from testing.automation_identity, or "none: no live-UI validation in this round">

## The ticket
<title>

## Story / summary
<verbatim from the synced story.md>

## Acceptance criteria
<VERBATIM, never paraphrased, never summarized>

## Ownership
modules this ticket owns: <paths>        ← nobody else in the round touches them
migration: none | <describe it; the conductor applies it, you send the SQL>

## Claims (pre-granted; announce and work)
<entity>:<id> <read|write|enumerate>      ← see §7

## Risks
<from the conductor's triage: what is likely to break, what to watch>

## Reporting
report file: <<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/reports/<label>.md
channel: <see §9>
Run: <run id — ONLY when this worker was launched without a supervised dispatch>

## Siblings (roster)
<label> <KEY> <one-line scope>   ← so a worker can broadcast a fact that changes another's decision

## Rules
- single-ticket mode on <KEY>; Stages 1-3; stop at an open PR; no merge, no deploy, no shared-DB migration
- run every stage without returning to the prompt until the done-report is sent; stage boundaries are not checkpoints
- no sprint-report writes, no bulk sync, no registry regeneration
- no heartbeats; report once at the end
- if your own measurement contradicts an instruction in this brief or a later message, STOP and `ask` with both readings and your evidence — never comply silently and never deviate silently
- your name is `<KEY>--<handle>` (session, tab, roster, `Session:` trailer): your first action is renaming your own TAB (`orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<KEY>--$ORCA_TERMINAL_HANDLE" --json </dev/null`); your SESSION name is set for you (the identity hook on Claude Code, a conductor-typed `/rename <KEY>--<handle>` elsewhere): never try to rename your session
- errors, blockers and decisions go to the conductor, never to the human: no question tool, no `mkd` deck, no sweep (`orca-orchestration/references/worker-contract.md` rule 16)
```

**Absolute paths, always.** `.session/` is gitignored and lives in the primary checkout; a worker in its own worktree that resolves a relative path silently reads nothing.

---

## 5. `launch.txt` — always written, regenerated whole

Address: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/launch.txt`. One self-contained line per ticket in the round.

1. **Always written**, gate or no gate. It is the record of what the fleet was asked to do, and the human-paste path consumes it literally.
2. **Byte-identical where it is pasted.** A human gets *this exact line*; never paraphrase it. On the supervised path the transport opens the session itself and cannot take a command line, so what travels there is the **prompt payload** of this line, delivered as the session's first message (`orca-orchestration/references/launch-seam.md` §2). The prompt is what must stay identical across both paths.
3. **Regenerated whole** at every round boundary. Never patched line by line: merged tickets drop out, newly unblocked ones get appended. A stale line relaunches a finished ticket.
4. **Self-contained**: the bare harness binary (no wrapper: the harness holds no `.env` value and its MCP servers read it through the loader, ADR-0016), its flags, and the prompt, in one line that works pasted into a fresh terminal at the worker's worktree root.
5. **The whole prompt is single-quoted** and contains no `'` and no unescaped `"`; rephrase instead of switching delimiter.
6. **Validate every line before launch** with a shell syntax check (`sh -n` on a file holding the lines; `zsh -n` where the user's shell is zsh). A line that does not parse is not launched.
7. The harness invocation itself (binary, model / effort / permission / session-name flags per harness) and which launch path supervises are owned by `orca-orchestration/references/launch-seam.md`. This skill owns only the payload: the `sprint-development` worker prompt.

Shape (Claude Code; other harnesses use their own binary, `opencode` or `codex`). No name flag on the Claude Code line: `--name` marks the name as human-set, and the identity hook then never composes `<KEY>--<handle>` from the prompt token (`orca-orchestration/references/session-identity.md` §2b):

```
claude <harness flags per launch-seam.md> '/sprint-development UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.'
```

---

## 6. Rounds — `max_workers` inside a sprint

1. Take the sprint's unblocked tickets in the order `.context/dev-roadmap.md` gives (Phase 0b).
2. Fill a round up to `orchestration.max_workers` (an explicit user number wins). Two tickets that own the same module, or that both carry a migration, do NOT go in the same round. A ticket whose blocker is in the same round waits for the next one.
3. One Orca worktree per worker, created just before launch, provisioned, its SHA verified against `origin/<base>` (`orca-orchestration/references/provisioning.md` §4).
4. Launch the round, wait, and as each worker reports: review its PR (Stage 3 adjudication is still this skill's), merge in dependency order, deploy to staging and verify, update the sprint report row, close the worker. Then form the next round. Do not trickle a replacement worker into a half-finished round: a round is the unit that gets a summary and a user checkpoint.
5. Before the next round, every remaining worktree of the closed round has passed the orphan audit and is removed (`orca-orchestration/references/coordinator-playbook.md` §6). A merged ticket's branch moves the base: the next round's worktrees are created from the new `origin/<base>`.

**Cadence is advisory, the cap is not.** If the user wants 4, use 4. The cap counts every live worker, including an ad-hoc hotfix (§8).

---

## 7. Claims — declare before you write

In a delivery fleet the shared things are the staging database, its seed data and the automation identity. Two mechanisms, same vocabulary, different times:

**At triage (planning aid).** While forming a round, list for each ticket the entities it will touch and the intent (`schema:staging-db read`, `seed:checkout-cart write`, `identity:default@staging write`). Same `entity:id` with `write` on both sides → the two tickets go in **different rounds**. One identity = one live browser: two workers that both need live-UI validation as the same `testing.automation_identity` slot either run in different rounds or one of them gets a second declared identity (`references/live-ui-validation.md` §3.5).

**At runtime (the protocol).** A worker declares a claim before its first write to a shared entity; the conductor keeps the ledger and arbitrates. Message shapes, the ledger format, `enumerate`, and the non-orchestration fallback are canon in `orca-orchestration/references/claims-protocol.md`; read them there, do not restate them.

The ledger lives with the sprint scope: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/claims.md`, append-only.

---

## 8. Ad-hoc hotfix — N=1, outside the rounds

An urgent bug that arrives mid-sprint is not queue work. Run it as a single worker (or inline in the conductor's session if nothing is in flight), **outside** the round structure, branched per the project's hotfix policy (`git_strategy.decisions.hotfix_policy`). It still counts against `max_workers` while it is live.

---

## 9. Progress, liveness and reports

### Progress lines, not heartbeat messages

Each worker appends one line per stage boundary to its own `<<PRIMARY_ROOT>>/.session/sprint-development/<KEY>/progress.md`, the same resume file N=1 writes (`agentic-dev-core/references/session-management.md`):

```
- 14:02 Stage 1 done · plan pushed to Jira · forecast Low · single-pr
- 14:51 Stage 2 running · 3/5 tasks · lint+types+tests green
- 15:30 Stage 3 done · PR #212 open · 2 findings adjudicated
```

This is a *file* the conductor reads on demand, not a *message* that wakes it.

### Blocked lines

A worker that cannot proceed writes one of these into its progress line AND sends it upward (`escalation` when supervised, a `status` message with the subject `BLOCKED: …` when launched without a dispatch):

| Line | Meaning |
|---|---|
| `BLOCKED: migration` | the ticket needs a schema change on the shared database; the SQL is in the report and the conductor applies it (§2.1) |
| `BLOCKED: dependency <KEY>` | a blocker is not merged into the integration branch after all; the conductor re-plans the round |
| `BLOCKED: identity` | the declared automation identity is missing, unusable, or claimed by a sibling |
| `BLOCKED: tool <name>` | a capability probe stopped answering (`db`, `library-docs`, the browser CLI) |

The lines are the contract; the mailbox is reinforcement. A worker writes **both**, because the file survives a dead mailbox and a crashed conductor.

### Liveness sweep

In this order, stopping as soon as an answer is found:

1. `[ORCHESTRATION_TOOL] worker status: …` / `[ORCHESTRATION_TOOL] list workers: …`: the orchestration layer's own state for each worker. Cheapest and most accurate, checked FIRST.
2. `[ORCHESTRATION_TOOL] read screen: <worker>`: for a worker reported as running that has produced nothing; the screen shows an interactive prompt waiting for a keystroke.
3. `grep` for `BLOCKED:` across the round's `progress.md` files: the non-orchestration fallback, and the only signal available with no orchestration layer at all.
4. **Staleness**: a worker whose last progress line is older than **30 minutes** is stale. Stale is not dead: look at it (step 2) before concluding anything.

### Messages — who may say what

The conductor talks to workers through the orchestration mailbox: `[ORCHESTRATION_TOOL] send: <worker> …` to instruct, `[ORCHESTRATION_TOOL] ask: <worker> …` to question, `[ORCHESTRATION_TOOL] reply: <message id> …` to answer. A worker sends exactly three kinds of thing: done-once (with outcome, files touched, its PR and its report path), `ask` (blocking, when a decision is genuinely required to continue), `escalation` (a blocker). Shapes: `orca-orchestration/references/worker-contract.md`.

**A worker never writes to the user.** Everything reaches the user through the conductor.

### The report

Before its done message, a worker writes `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/reports/<label>.md`: `## Summary` (the story explanation and the stage summaries a human would have been told), `## Files changed`, `## Commits`, `## PR` (number, base, checks), `## Decisions taken`, `## Verification` (commands + exit codes), `## Left open` (including any edit outside its ownership it wanted to make).

---

## 10. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| two PRs from one round conflict in the same files | two tickets on one module in the same round | §6 rule 2; merge one, have the other merge the new base in (never rebase a pushed branch) |
| a migration number collides at apply time | a worker took the number from its branch's directory listing | migrations are conductor-only (§2.1); the number comes from the live ledger |
| generated types in a PR contain columns from another ticket | the worker regenerated from the shared live instance | §2.1; strip what it did not generate and let the conductor regenerate after merge |
| two workers' live-UI validations log each other out | same automation identity, same round | §7 triage; serialize or declare a second identity |
| a worker idle with a clean working tree 10 minutes after launch | the brief never reached it | re-send the brief into the same terminal; creating + launching + briefing is indivisible (§4) |
| a worker sits at its prompt with Stage 1 done and nothing sent | it treated the stage boundary as a checkpoint | §3; restate the continuation rule in the brief |
| a worker merged its own PR or deployed | its brief did not forbid it | §2.1 and the brief's `## Rules`; verify the integration branch and the deploy at the destination before anything else |
| a finished ticket was implemented twice | `launch.txt` was patched instead of regenerated | §5 rule 3 |

---

## 11. Checklist — fleet mode

- [ ] Mode is batch-sprint AND (user asked OR `orchestration.max_workers` > 1) AND every ticket in the round is unblocked per git AND the gate was evaluated
- [ ] Gate failed → `launch.txt` written, user told to paste N lines, orchestration layer never named
- [ ] `roster.md` written: one row per worker (label · ticket · session label · handles · worktree · state)
- [ ] One `brief.md` per ticket, with ACs **verbatim**, absolute paths, ownership, claims, siblings, and the no-heartbeat / no-checkpoint / stop-at-PR / measurement-contradiction rules
- [ ] `launch.txt` regenerated whole for this round; merged tickets dropped; every line syntax-checked
- [ ] Every worker prompt opens with `/sprint-development <KEY> fleet worker` and its brief path
- [ ] Round size ≤ cap; no two tickets on one module; no two migrations; no two live-UI workers on one identity
- [ ] One provisioned Orca worktree per worker, SHA verified against `origin/<base>`
- [ ] Merges in dependency order, one at a time, each staging deploy verified at the destination before the next
- [ ] Sprint report row updated by the CONDUCTOR, once per merged ticket
- [ ] Every worker released / closed as it finishes, cost read off its screen first; orphan audit, then the worktree removed in the same turn (kept only with a written reason in `roster.md`)
- [ ] `claims.md` shows a release for every granted write claim
