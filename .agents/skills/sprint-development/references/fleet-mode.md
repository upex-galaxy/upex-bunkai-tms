# Fleet mode: batch-sprint development with N executors

Read this only when batch-sprint mode runs with more than one executor. `SKILL.md` ("Executors: one session or a fleet") defines the scope and executors axis, and it keeps the sprint roadmap checkpoint, the per-ticket stages and their gates. This file covers what N>1 adds and nothing else.

> **N=1 is untouched.** Every rule here is additive. A batch-sprint run with one executor behaves exactly as it did before this file existed: same ticket loop, same stages, same sprint-report writes. A rule below that would change N=1 behaviour is a wrong rule.

> **Split of duties.** This skill owns the WHAT: the queue, the rounds, the assignment, the per-story isolation, the sprint report and the merge order. The orchestration skill owns the HOW: sessions, terminals, mailbox, supervision, cleanup, claims. Every orchestration action below is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and resolves in `orca-orchestration/SKILL.md`. Do not inline an orchestration command here.

---

## 1. Vocabulary

| Term | Meaning here |
|---|---|
| conductor | the session that talks to the user, owns the sprint scope, merges and deploys. One per sprint run. |
| worker | one launched session running this skill in single-ticket mode on exactly one story or bug. |
| fleet | every worker of this sprint run. |
| round | one concurrency group: up to `orchestration.max_workers` tickets in flight at once. |
| execution sprint | an ordering bucket of `.context/dev-roadmap.md` (which ticket unblocks which). It is not a round: one execution sprint can need several rounds. |
| roster | the file that maps a human label ("W2", "the billing one") to a worker's ticket key, session label and handles. |
| brief | the per-ticket payload the conductor seeds before launching a worker. |
| launch file | `launch.txt`: one self-contained shell line per ticket, always written. |
| claim | a worker's declared intent to read or write shared data, a shared schema or a shared identity. |

---

## 2. When fleet mode is allowed

All three conditions hold:

1. The mode is batch-sprint. Single-ticket mode never has a fleet.
2. Either the user asked for it, or `orchestration.max_workers` in `.agents/project.yaml` is greater than 1. An explicit user instruction beats the yaml default. A project with no `orchestration:` block runs N=1.
3. Every ticket in the round is genuinely unblocked: its direct blockers are merged into the integration branch. Git decides that, not the tracker (Phase 0b and the compact rule on ticket availability apply per ticket, unchanged).

The orchestration gate (binary present and runtime reachable, three states, canon in `orca-orchestration/SKILL.md`) then decides one thing: who opens the sessions. When the gate passes, the orchestration layer launches and supervises them, and the conductor gets a mailbox, native liveness and one-command cleanup. When it fails, the human opens them from `launch.txt`, and the conductor keeps every other duty in this file. Run the gate there; do not reimplement it here.

**Silence rule.** When the gate does not pass, the conductor writes `launch.txt` anyway and tells the user "N ready-to-paste lines are in `<path>`, open N terminals at the repo root and paste one per terminal". It does not name the orchestration binary, recommend installing anything or report its absence, in the plan, in a PR body or in the sprint report. The reason: a developer who never heard of an orchestration tool must be able to read every line. Test each line you are about to write against that. A line that fails belongs in `orca-orchestration`.

**What the conductor stops doing at N>1.** It runs Stages 1-3 for no ticket that a worker holds. It plans the rounds, seeds briefs, launches, waits, processes reports, and owns everything in §2.1.

### 2.1 Conductor-only operations

These go through the conductor and never through a worker, because each one changes shared state that has exactly one correct value:

| Operation | Why conductor-only |
|---|---|
| Stage 4: merge into the integration branch, staging deploy and its verification | one staging environment, one correct merge order; two workers deploying is a race neither can see. Merge in dependency order, one ticket at a time, and verify that the deployment for each merge SHA reads `READY` before the next (Critical Rule #16) |
| Stage 5: production deploy | always manual per ticket, exactly as in N=1 |
| Applying a migration to a shared database | irreversible, and it hits every worker at once. The conductor reads the DB MCP's migration history at apply time and applies per `{{stack.database.migrations_tool}}` (`agentic-dev-core/references/db-change-doctrine.md`); a worker sends its SQL and waits |
| Regenerating output from a live instance (Supabase types, `bun run api:sync` into `api/schemas/`) | one writer, after the last migration lands; a worker's regeneration silently absorbs a sibling's unmerged schema |
| The sprint report `.context/reports/SPRINT-{N}-DEVELOPMENT.md` | one writer, rows ordered by close time |
| Bulk tracker pull (`bun run context:hydrate`, `jira:sync-issues pull` / `jql`) | rewrites the whole `.context/PBI/` cache; a worker's own `get <KEY>` is fine |
| Generated registries (`.agents/skills/REGISTRY.md`, the `bun run agents:compat` surfaces) | whole-repo files; a generated-file conflict is regenerated, never hand-merged |
| `launch.txt`, `roster.md`, `claims.md` | the fleet's own bookkeeping |

---

## 3. Worker identity: the prompt and the brief, not the environment

The prompt is the channel. A worker's first prompt opens with the skill, the ticket key and the literal token `fleet worker`, then points at its brief:

```
/sprint-development UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.
```

Both launch paths carry the same text (§5 rule 2), so a worker cannot tell them apart.

Two signals make a session a worker, in this order:

| Signal | Where | What it decides |
|---|---|---|
| the token `fleet worker` next to a skill invocation and a ticket key | the launch prompt | this session is a worker; that key is the single ticket it owns |
| `Label` · `Task` · `Dispatch` in the brief's `## Meta` | `sprint-<N>/<KEY>/brief.md` | which worker it is, and how it reports (§9) |

Environment variables are not a channel. An env prefix in a launch line never reaches a supervised worker (the native launch has no argv), and it measured empty on a real fleet even on the pasted path. Nothing in this skill may depend on one.

A worker:

- runs single-ticket mode on the key in its prompt, in the mode (Orchestrated or Solo) its brief names;
- runs to completion without returning to its prompt. Stage boundaries are not checkpoints, and the run ends when the done-report is sent (§9). A worker that parks at its prompt after Stage 1 looks exactly like a crashed one to the conductor's liveness sweep;
- runs without human checkpoints, because nobody is watching its terminal. The "EXPLAIN STORY" and "WAIT FOR CONFIRMATION" steps of `AGENTS.md` §8 become report content: the story explanation and every stage summary go into its report. A decision it genuinely needs goes out as an `ask` (§9), never as a user-question prompt nobody will see. The conductor answers an `ask` by `agentic-dev-core/references/decision-protocol.md` and reaches a person only for what that protocol reserves;
- skips no gate: the design gate on a UI story, the review size forecast gate, the automation-identity gate, the capability probes. A gate that would have stopped for a human becomes a blocking `ask` or a `BLOCKED:` report, and the worker never guesses past it;
- runs Stages 1-3 and stops at an open PR. It pushes its own branch, opens its own PR and transitions its own ticket per `agentic-dev-core/references/artifact-lifecycle.md`. It never merges, deploys or applies a migration to the shared database (§2.1);
- creates no sprint-altitude state: no sprint report row, no bulk sync. Its session scope is `<<PRIMARY_ROOT>>/.session/sprint-development/<KEY>/`, exactly as in N=1;
- reports once when done, plus `ask` or `escalation` as needed, and then stops. It sends no heartbeats: periodic "still alive" messages wake the conductor for nothing, and the worker contract (`orca-orchestration/references/worker-contract.md`) rules them out, overriding any generic preamble the launcher injects.

A session with no `fleet worker` prompt and no brief is not a worker.

---

## 4. The brief, seeded by the conductor before launch

There is one file per ticket: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/<KEY>/brief.md`. The conductor writes it before the worker exists. Creating, launching and briefing is one indivisible operation, because a launched worker with no brief burns a whole session doing nothing.

Do not write a brief under `.context/PBI/**`: that tree is a Jira sync cache and the next pull overwrites it.

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
ai effort: <low | medium | high | unset> (a warning only; the worker works the ticket either way)
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
- start from the current tip of the integration branch, not the tip the round was planned on: before the first edit run `git fetch` and confirm the worktree contains `origin/<base>`, and when it does not, merge `origin/<base>` into your branch (never rebase). Before you report the PR, merge the tip in again so the conductor lands your branch without conflicts. The conductor briefs you with pointers (the plan, the ticket, the research notes, earlier commits) and never pastes summaries; you pass pointers back in your report the same way. A conflict you cannot resolve is a `BLOCKED:` line (§9), and the rest of your Stage 1 to 3 work continues
- run every stage without returning to the prompt until the done-report is sent; stage boundaries are not checkpoints
- no sprint-report writes, no bulk sync, no registry regeneration
- no heartbeats; report once at the end
- AI Effort `high` only WARNS: note it in the plan and the PR description, split your own work into stacked small PRs if useful (about 200 changed lines and 2 to 5 files per PR), and work the ticket; never skip or stop it, never `ask` about it
- tokens: append your measured tokens to your `progress.md` (`tokens: <n> K, source=<harness|human|unknown>`) and report them under `## Tokens`; never estimate, `unknown` is valid
- if your own measurement contradicts an instruction in this brief or a later message, STOP and `ask` with both readings and your evidence; never comply silently and never deviate silently
- your name is `<KEY>--<handle>` (session, tab, roster, `Session:` trailer): your first action is renaming your own TAB (`orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<KEY>--$ORCA_TERMINAL_HANDLE" --json </dev/null`); your SESSION name is set for you (the identity hook on Claude Code, a conductor-typed `/rename <KEY>--<handle>` elsewhere), so do not try to rename your session
- errors, blockers and decisions go to the conductor, never to the human: no question tool, no `mkd` deck, no sweep (`orca-orchestration/references/worker-contract.md` rule 16)
```

Paths in a brief are always absolute. `.session/` is gitignored and lives in the primary checkout, so a worker in its own worktree that resolves a relative path silently reads nothing.

---

## 5. `launch.txt`: always written, regenerated whole

Address: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/launch.txt`. One self-contained line per ticket in the round.

1. It is always written, gate or no gate. It records what the fleet was asked to do, and the human-paste path consumes it literally.
2. It stays byte-identical where it is pasted. A human gets this exact line, so never paraphrase it. On the supervised path the transport opens the session itself and cannot take a command line, so what travels there is the prompt payload of this line, delivered as the session's first message (`orca-orchestration/references/launch-seam.md` §2). The prompt is what must stay identical across both paths.
3. It is regenerated whole at every round boundary and never patched line by line: merged tickets drop out and newly unblocked ones get appended. A stale line relaunches a finished ticket.
4. Each line is self-contained: the bare harness binary (no wrapper, because the harness holds no `.env` value and its MCP servers read it through the loader, ADR-0016), its flags, and the prompt, in one line that works pasted into a fresh terminal at the worker's worktree root.
5. The whole prompt is single-quoted and contains no `'` and no unescaped `"`. Rephrase instead of switching delimiter.
6. Every line is validated before launch with a shell syntax check (`sh -n` on a file holding the lines; `zsh -n` where the user's shell is zsh). A line that does not parse is not launched.
7. The harness invocation itself (binary, model, effort, permission and session-name flags per harness) and which launch path supervises are owned by `orca-orchestration/references/launch-seam.md`. This skill owns only the payload: the `sprint-development` worker prompt.

Shape for Claude Code (other harnesses use their own binary, `opencode` or `codex`). The line carries no name flag: `--name` marks the name as human-set, and the identity hook then never composes `<KEY>--<handle>` from the prompt token (`orca-orchestration/references/session-identity.md` §2b):

```
claude <harness flags per launch-seam.md> '/sprint-development UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.'
```

---

## 6. Rounds: `max_workers` inside a sprint

1. Take the sprint's unblocked tickets in the order `.context/dev-roadmap.md` gives (Phase 0b).
2. Fill a round up to `orchestration.max_workers` (an explicit user number wins). Two tickets that own the same module, or that both carry a migration, go in different rounds. A ticket whose blocker is in the same round waits for the next one.
3. Create one Orca worktree per worker just before launch, provision it, and verify its SHA against `origin/<base>` (`orca-orchestration/references/provisioning.md` §4). A worker starts from the current tip of the integration branch, not the tip the round was planned on, and the brief's `## Rules` tell it how to check.
4. Launch the round, wait, and as each worker reports: review its PR (Stage 3 adjudication is still this skill's), merge in dependency order, deploy to staging and verify, update the sprint report row, and close the worker. Then form the next round. A round is the unit that gets a summary and a user checkpoint, so do not trickle a replacement worker into a half-finished round.
5. Before the next round, every remaining worktree of the closed round has passed the orphan audit and is removed (`orca-orchestration/references/coordinator-playbook.md` §6). A merged ticket's branch moves the base, so the next round's worktrees are created from the new `origin/<base>`.

The cadence is advisory and the cap is not. If the user wants 4, use 4. The cap counts every live worker, including an ad-hoc hotfix (§8).

---

## 7. Claims: declare before you write

In a delivery fleet the shared things are the staging database, its seed data and the automation identity. Two mechanisms share one vocabulary and run at different times.

**At triage (planning aid).** While forming a round, list for each ticket the entities it will touch and the intent (`schema:staging-db read`, `seed:checkout-cart write`, `identity:default@staging write`). When two tickets hold the same `entity:id` with `write` on both sides, they go in different rounds. One identity is one live browser: two workers that both need live-UI validation as the same `testing.automation_identity` slot run in different rounds, or one of them gets a second declared identity (`references/live-ui-validation.md` §3.5).

**At runtime (the protocol).** A worker declares a claim before its first write to a shared entity, and the conductor keeps the ledger and arbitrates. Message shapes, the ledger format, `enumerate` and the non-orchestration fallback are canon in `orca-orchestration/references/claims-protocol.md`. Read them there.

The ledger lives with the sprint scope, append-only: `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/claims.md`.

---

## 8. Ad-hoc hotfix: N=1, outside the rounds

An urgent bug that arrives mid-sprint is not queue work. Run it as a single worker (or inline in the conductor's session if nothing is in flight), outside the round structure, branched per the project's hotfix policy (`git_strategy.decisions.hotfix_policy`). It still counts against `max_workers` while it is live.

---

## 9. Progress, liveness and reports

### Progress lines, not heartbeat messages

Each worker appends one line per stage boundary to its own `<<PRIMARY_ROOT>>/.session/sprint-development/<KEY>/progress.md`, the same resume file N=1 writes (`agentic-dev-core/references/session-management.md`):

```
- 14:02 Stage 1 done · plan pushed to Jira · forecast Low · single-pr
- 14:51 Stage 2 running · 3/5 tasks · lint+types+tests green
- 15:30 Stage 3 done · PR #212 open · 2 findings adjudicated
```

The conductor reads this file on demand. It is not a message that wakes the conductor.

### Blocked lines

A worker that cannot proceed writes one of these into its progress line and sends it upward (`escalation` when supervised, a `status` message with the subject `BLOCKED: …` when launched without a dispatch):

| Line | Meaning |
|---|---|
| `BLOCKED: migration` | the ticket needs a schema change on the shared database; the SQL is in the report and the conductor applies it (§2.1) |
| `BLOCKED: dependency <KEY>` | a blocker is not merged into the integration branch after all; the conductor re-plans the round |
| `BLOCKED: identity` | the declared automation identity is missing, unusable, or claimed by a sibling |
| `BLOCKED: tool <name>` | a capability probe stopped answering (`db`, `library-docs`, the browser CLI) |

The lines are the contract and the mailbox is reinforcement. A worker writes both, because the file survives a dead mailbox and a crashed conductor.

### Liveness sweep

Run these in order and stop at the first answer:

1. `[ORCHESTRATION_TOOL] worker status: …` or `[ORCHESTRATION_TOOL] list workers: …`: the orchestration layer's own state for each worker. It is the cheapest and most accurate, so check it first.
2. `[ORCHESTRATION_TOOL] read screen: <worker>`: for a worker reported as running that has produced nothing. The screen shows an interactive prompt waiting for a keystroke.
3. `grep` for `BLOCKED:` across the round's `progress.md` files: the non-orchestration fallback, and the only signal available with no orchestration layer at all.
4. Staleness: a worker whose last progress line is older than 30 minutes is stale. Stale is not dead, so look at it (step 2) before concluding anything.

### Messages: who may say what

The conductor talks to workers through the orchestration mailbox: `[ORCHESTRATION_TOOL] send: <worker> …` to instruct, `[ORCHESTRATION_TOOL] ask: <worker> …` to question, `[ORCHESTRATION_TOOL] reply: <message id> …` to answer. A worker sends exactly three kinds of message: done-once (with outcome, files touched, its PR and its report path), `ask` (blocking, when a decision is genuinely required to continue) and `escalation` (a blocker). Shapes are in `orca-orchestration/references/worker-contract.md`.

A worker never writes to the user. Everything reaches the user through the conductor.

### The report

Before its done message, a worker writes `<<PRIMARY_ROOT>>/.session/sprint-development/sprint-<N>/reports/<label>.md` with these sections:

- `## Summary`: the story explanation and the stage summaries a human would have been told.
- `## Files changed`
- `## Commits`
- `## PR`: number, base, checks.
- `## Decisions taken`
- `## Verification`: commands and exit codes.
- `## Left open`: including any edit outside its ownership it wanted to make.
- `## Tokens` (optional): the measured tokens this worker spent (K = input plus output, cache reads apart) and the source. It reads `unknown` when the harness shows none, and is never an estimate.

The conductor sums every worker's `## Tokens` plus its own into the DTU cycle at Stage 4 (`SKILL.md` Stage 4). A missing `## Tokens` makes that DTU line N/A or partial, stated, and is never a failure.

---

## 10. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| two PRs from one round conflict in the same files | two tickets on one module in the same round | §6 rule 2; merge one, have the other merge the new base in (never rebase a pushed branch) |
| a migration number collides at apply time | a worker took the number from its branch's directory listing | migrations are conductor-only (§2.1); the number comes from the live ledger |
| generated types in a PR contain columns from another ticket | the worker regenerated from the shared live instance | §2.1; strip what it did not generate and let the conductor regenerate after merge |
| two workers' live-UI validations log each other out | same automation identity, same round | §7 triage; serialize or declare a second identity |
| a worker idle with a clean working tree 10 minutes after launch | the brief never reached it | re-send the brief into the same terminal; creating, launching and briefing is indivisible (§4) |
| a worker sits at its prompt with Stage 1 done and nothing sent | it treated the stage boundary as a checkpoint | §3; restate the continuation rule in the brief |
| a worker merged its own PR or deployed | its brief did not forbid it | §2.1 and the brief's `## Rules`; verify the integration branch and the deploy at the destination before anything else |
| a finished ticket was implemented twice | `launch.txt` was patched instead of regenerated | §5 rule 3 |

---

## 11. Checklist: fleet mode

- [ ] Mode is batch-sprint, AND (the user asked OR `orchestration.max_workers` > 1), AND every ticket in the round is unblocked per git, AND the gate was evaluated
- [ ] Gate failed: `launch.txt` written, user told to paste N lines, orchestration layer never named
- [ ] `roster.md` written: one row per worker (label · ticket · session label · handles · worktree · state)
- [ ] One `brief.md` per ticket, with ACs verbatim, absolute paths, ownership, claims, siblings, the `ai effort` line, and the rules on no heartbeat, no checkpoint, stop at PR, measurement contradiction, AI Effort warns, tokens and starting from the integration tip
- [ ] `launch.txt` regenerated whole for this round; merged tickets dropped; every line syntax-checked
- [ ] Every worker prompt opens with `/sprint-development <KEY> fleet worker` and its brief path
- [ ] Round size within the cap; no two tickets on one module; no two migrations; no two live-UI workers on one identity
- [ ] One provisioned Orca worktree per worker, SHA verified against `origin/<base>`
- [ ] Merges in dependency order, one at a time, each staging deploy verified at the destination before the next
- [ ] Sprint report row updated by the conductor, once per merged ticket
- [ ] Every worker released and closed as it finishes, cost read off its screen first; orphan audit, then the worktree removed in the same turn (kept only with a written reason in `roster.md`)
- [ ] `claims.md` shows a release for every granted write claim
