---
name: autonomous-delivery
description: "SCHEDULED / UNATTENDED entry point for a delivery run with no human on the line. Audits real state (git is truth, the tracker is a hint), selects work whose dependencies are genuinely satisfied, dispatches the owning pipeline skill, closes out, and reports. Three modes: `story` (1 per run, hard cap), `bug` (up to 3, sequential), `discovery` (backlog definitions only, never writes code). Four phases: Phase 0 Lock -> Phase 1 Audit -> Phase 2 Select -> Phase 3 Execute -> Phase 4 Close and report. Triggers on: scheduled delivery run, unattended run, autonomous run, cron delivery, routine run, nightly delivery, overnight sprint run, run the queue unattended, pick up the next unblocked ticket by yourself, autonomous-delivery, `/autonomous-delivery story`, `/autonomous-delivery bug`, `/autonomous-delivery discovery`. Do NOT use for: interactive per-ticket work with a human present (use /sprint-development directly — this skill only wraps it in audit + selection + handoff), backlog seeding or AC refinement on a named ticket (use /product-management directly), branch / PR / conflict operations (use /git-flow-master), foundational product definition (use /project-foundation), infrastructure scaffolding (use /project-bootstrap), or unit-test TDD slices (use /unit-testing)."
license: MIT
compatibility: [claude-code, opencode]
phase: implementation
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the "## Compact Rules" section in the body below.
compact_rules: |
  - **Git is the source of truth; the tracker is a hint.** A ticket shipped only when `git merge-base --is-ancestor <mergeCommit> <integration-branch>` succeeds. A status of ready-for-QA, done, or merged proves nothing — merge automation commonly fires on ANY pull request merge, including a chain's internal ones. Never advance a dependency on a status flip.
  - **`git fetch` immediately before every ancestor or fast-forward check, unconditionally.** A merge performed through the host's API updates the real ref at once; your remote-tracking ref updates only on the next fetch. "I fetched a few minutes ago" has produced a confident, wrong answer.
  - **One lock per mode, never a queue.** A live lock for your mode means another run owns it: exit cleanly with a report. Do not wait, do not queue, do not run anyway. A lock older than `lock_staleness_minutes` is abandoned — reclaim it and log the reclamation.
  - **An empty run is a correct outcome.** Nothing genuinely unblocked means stop and say so. Selecting marginal work to avoid an empty report is the failure this phase exists to prevent.
  - **Caps are hard: `story` 1 per run, `bug` 3 sequential (each fully closed before the next), `discovery` writes no code.** Every measured story became a multi-thousand-line chain; two do not fit in one run's context.
  - **Write the handoff as you go, never at the end.** A run that exhausts its context cannot write up why. Checkpoint after every phase and after every completed slice.
  - **When context runs low, push the branch FIRST, then record resume state, then stop.** Unpushed commits in a disposable worktree are the only unrecoverable loss in this system. A clean mid-work handoff is a success; a mid-ticket death with unpushed work is the failure to design against.
  - **Applying a schema migration to shared infrastructure is irreversible and hits every concurrent agent.** Under `migrations: confirm` (default) it stops for approval, stating target and additive-vs-destructive. Under `migrations: autonomous` it proceeds for ADDITIVE changes only and still stops for anything that drops, renames, or rewrites a live object. Writing the migration file is always autonomous; applying it is not.
  - **Take the migration number from the live ledger immediately before writing the file**, never from a local directory listing. The ledger can be ahead of your branch by a peer's unmerged migration, and behind no file you can list.
  - **Read regenerated output before committing it.** Types, clients, and API specs generated from a shared live instance silently absorb a concurrent sibling's unmerged schema. Diff it; strip foreign entries after proving zero consumers.
  - **Give every dispatched agent its own worktree.** A background subagent writes into its dispatcher's working directory by default, outlives its dispatcher, and keeps mutating shared state after the dispatcher is gone. Fixing this after `git status` looks wrong is too late.
  - **Never rebase a branch a subagent already pushed** — merge the base in instead (`git checkout -B <branch> origin/<branch> && git merge <integration-branch> --no-edit`). Rebasing forces a force-push, which is a history rewrite on pushed work.
  - **Green tests are not evidence the feature works.** Fixtures that seed the column the code reads, rather than the column production writes, keep every test green over a dead data path. Require at least one assertion against a real production write path before calling an acceptance criterion covered.
  - **Editing a skill's rules does nothing until the registry is regenerated** (`bun run skills:registry`). The registry is what reaches a subagent briefing; a rule that never reached the briefing never reached any executor.
  - **Decide technical calls yourself, after searching the record.** Follow `agentic-dev-core/references/decision-protocol.md`: search -> follow if settled -> scored judge panel if genuinely novel -> escalate ONLY product, novel security posture, irreversible, and whatever the operator reserved. Record every autonomous decision where the NEXT run's Phase 1 will find it.
  - **Whether a PRODUCT call escalates is per-project config, not a constant.** Read `decision_authority.product` in `.agents/project.yaml`. `escalate` (default, and the correct default) means it stops the run. `decide` means there is no human PO: dispatch a scored decision subagent, publish the ruling to the ticket under a heading naming the deciding profile, resync, and continue — never style it as human sign-off. Categories 2-4 escalate under both settings. Method: `decision-protocol.md` §5.1.
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  audit: sonnet          # mechanical state verification
  selection: opus        # dependency reasoning under contradictory evidence
  execution: sonnet      # delegated to the owning pipeline skill
  judge_panel: opus      # scored decision lenses
  archive: haiku         # mechanical close-out
-->

# Autonomous Delivery — Scheduled Runs With Nobody Watching

The layer between a scheduler and `/sprint-development`. It exists because a pipeline skill assumes a human picked the ticket, confirmed the state, and is present when something goes sideways. Unattended, all three assumptions are false, and each one has its own failure mode.

**This skill does not implement anything.** It establishes what is actually true, picks work that is actually unblocked, hands the work to the skill that owns it, and leaves behind a record the next run can start from. If you find yourself restating `/sprint-development`'s stages, stop and reference them instead.

---

## Compact Rules

> Extracted verbatim into `.claude/skills/REGISTRY.md` by `scripts/build-skill-registry.ts` and copied into every subagent briefing. These are the rules that must BIND an executor, not just inform the orchestrator (`agentic-dev-core/references/orchestration-doctrine.md` -> "Rule reachability"). Keep this list short and imperative; rationale lives in the referenced files.

- **Git is the source of truth; the tracker is a hint.** A ticket shipped only when `git merge-base --is-ancestor <mergeCommit> <integration-branch>` succeeds. A status of ready-for-QA, done, or merged proves nothing — merge automation commonly fires on ANY pull request merge, including a chain's internal ones. Never advance a dependency on a status flip.
- **`git fetch` immediately before every ancestor or fast-forward check, unconditionally.** A merge performed through the host's API updates the real ref at once; your remote-tracking ref updates only on the next fetch. "I fetched a few minutes ago" has produced a confident, wrong answer.
- **One lock per mode, never a queue.** A live lock for your mode means another run owns it: exit cleanly with a report. Do not wait, do not queue, do not run anyway. A lock older than `lock_staleness_minutes` is abandoned — reclaim it and log the reclamation.
- **An empty run is a correct outcome.** Nothing genuinely unblocked means stop and say so. Selecting marginal work to avoid an empty report is the failure this phase exists to prevent.
- **Caps are hard: `story` 1 per run, `bug` 3 sequential (each fully closed before the next), `discovery` writes no code.** Every measured story became a multi-thousand-line chain; two do not fit in one run's context.
- **Write the handoff as you go, never at the end.** A run that exhausts its context cannot write up why. Checkpoint after every phase and after every completed slice.
- **When context runs low, push the branch FIRST, then record resume state, then stop.** Unpushed commits in a disposable worktree are the only unrecoverable loss in this system. A clean mid-work handoff is a success; a mid-ticket death with unpushed work is the failure to design against.
- **Applying a schema migration to shared infrastructure is irreversible and hits every concurrent agent.** Under `migrations: confirm` (default) it stops for approval, stating target and additive-vs-destructive. Under `migrations: autonomous` it proceeds for ADDITIVE changes only and still stops for anything that drops, renames, or rewrites a live object. Writing the migration file is always autonomous; applying it is not.
- **Take the migration number from the live ledger immediately before writing the file**, never from a local directory listing. The ledger can be ahead of your branch by a peer's unmerged migration, and behind no file you can list.
- **Read regenerated output before committing it.** Types, clients, and API specs generated from a shared live instance silently absorb a concurrent sibling's unmerged schema. Diff it; strip foreign entries after proving zero consumers.
- **Give every dispatched agent its own worktree.** A background subagent writes into its dispatcher's working directory by default, outlives its dispatcher, and keeps mutating shared state after the dispatcher is gone. Fixing this after `git status` looks wrong is too late.
- **Never rebase a branch a subagent already pushed** — merge the base in instead (`git checkout -B <branch> origin/<branch> && git merge <integration-branch> --no-edit`). Rebasing forces a force-push, which is a history rewrite on pushed work.
- **Green tests are not evidence the feature works.** Fixtures that seed the column the code reads, rather than the column production writes, keep every test green over a dead data path. Require at least one assertion against a real production write path before calling an acceptance criterion covered.
- **Editing a skill's rules does nothing until the registry is regenerated** (`bun run skills:registry`). The registry is what reaches a subagent briefing; a rule that never reached the briefing never reached any executor.
- **Decide technical calls yourself, after searching the record.** Follow `agentic-dev-core/references/decision-protocol.md`: search -> follow if settled -> scored judge panel if genuinely novel -> escalate ONLY product, novel security posture, irreversible, and whatever the operator reserved. Record every autonomous decision where the NEXT run's Phase 1 will find it.
- **Whether a PRODUCT call escalates is per-project config, not a constant.** Read `decision_authority.product` in `.agents/project.yaml`. `escalate` (default, and the correct default) means it stops the run. `decide` means there is no human PO: dispatch a scored decision subagent, publish the ruling to the ticket under a heading naming the deciding profile, resync, and continue — never style it as human sign-off. Categories 2-4 escalate under both settings. Method: `decision-protocol.md` §5.1.

**Read full SKILL.md when**: you are running any phase of a scheduled run, a gate fires, or the briefing tells you to load the full skill.

---

## When to use

Use this skill when a **scheduler, cron, routine, or timed wake-up** starts a session with no human present and a mode argument. That is the entire trigger surface.

| Mode | Selects | Cap | Dispatches to | Writes code |
| --- | --- | --- | --- | --- |
| `story` | highest-priority genuinely-unblocked user story | **1 per run, hard** | `/sprint-development` | yes |
| `bug` | genuinely-unblocked defects, oldest-severest first | **up to 3, strictly sequential** | `/sprint-development` (bug entry point) | yes |
| `discovery` | refinement, epic, or backlog gaps | backlog definitions only | `/product-management` | **never** |

The invoking routine passes the mode: `/autonomous-delivery story`. No mode, or an unrecognized one, is a fast-fail — do not guess a default.

**Do NOT use this skill** when a human is on the line and named a ticket. That is `/sprint-development` directly. This skill's only value is the audit / selection / handoff layer around it, and that layer is pure overhead when a human already did the selecting.

---

## Pre-requisites

- `.agents/project.yaml` populated, including `git_strategy.branches.integration` (the branch every ancestor check runs against) and an `autonomous_delivery:` block (see Configuration).
- The owning pipeline skill's own pre-requisites are met — this skill does not re-check them, it fast-fails when the dispatched skill reports them missing.
- A dependency source exists: `.context/dev-roadmap.md` for ticket-level edges, plus whatever queue or board file the project keeps.
- `.env` populated. Credentials are read by variable NAME at runtime, never inlined, never carried in a report.
- The run has write access to the code host under an identity with push scope. Verify it in Phase 0, not at the first push.

Any missing pre-requisite ends the run in Phase 0 with a report naming the exact file and key. Do not improvise around it.

---

## Configuration

Lives in `.agents/project.yaml`. Defaults are the safe end of every axis; a scheduled run inherits them unless the project deliberately widened them.

```yaml
autonomous_delivery:
  enabled: false # master switch. false -> every mode exits in Phase 0 with a report.
  modes: [story, bug, discovery] # modes this project permits. A mode not listed is rejected.
  caps:
    story: 1 # HARD. Raising this is a measured mistake, not a tuning knob.
    bug: 3 # sequential; each fully closed before the next starts.
    discovery: 0 # application CODE cap — always zero, discovery never writes code.
    discovery_definitions: 2 # NEW user stories drafted + created per run — created UNATTENDED; this cap is what bounds the blast radius.
  lock_staleness_minutes: 90 # older than this -> abandoned, reclaimable with a logged note.
  automation_gh_account: null # gh identity this run asserts before every push and merge. See Phase 0b step 3.
  migrations: confirm # confirm | autonomous | unrestricted. See "Migration gate".
  isolation: worktree # worktree | in-place. worktree is strongly preferred.
  context_budget:
    handoff_checkpoint: every-phase # every-phase | every-slice. Never "at-end".
    stop_at_remaining_pct: 20 # begin the clean-stop sequence at this much budget left.
  report_channel: null # null | tracker:<ISSUE-KEY> | file:<path>. A plain summary log for all three modes —
    # NOT a mailbox. For discovery it is where the operator SEES what was created — the input to the
    # veto (close or delete the ticket) — while still being a log nobody replies to.
  escalation_channel: null # null | slack:<CHANNEL-ID> | <any channel the harness can post to>.
    # ESCALATIONS ONLY — never summaries; those go to report_channel above.
  escalation_log: .session/autonomous-delivery/escalation-log.md # append-only, shared across modes.
```

**Config claims cite the file they came from.** Read the block; never quote a default from this document as project state (`agentic-dev-core/references/orchestration-doctrine.md` -> "Value provenance").

**On `isolation: worktree` and the scheduling app's own "Worktree" option.** Leave the Routine/schedule's own "Worktree" checkbox **unchecked**. This skill self-manages its isolation via the `EnterWorktree` / `ExitWorktree` tools (Phase 0a entry, Phase 4 exit) instead of relying on the scheduler's implicit assignment — that is what makes Phase 4 able to actually close the run's own worktree rather than leaving it on disk for a human to remove. If the scheduler's Worktree option is left checked, the session already starts inside a worktree that `ExitWorktree` cannot see or remove (it only tracks worktrees this session entered itself) — see Hazard 5.10.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) is NOT optional. Phase 1 plan is delegated to the canonical artifact owned by the dispatched pipeline skill (`.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md` for `/sprint-development`); this skill writes only `progress.md`.

`<scope>` = the **mode** (`story`, `bug`, or `discovery`). Session state lives at `.session/autonomous-delivery/<mode>/`:

```
.session/autonomous-delivery/
├── escalation-log.md            # append-only, SHARED across modes and runs
├── <mode>/
│   ├── lock.json                # Phase 0 — presence means a run owns this mode
│   ├── progress.md              # append-only, per session-management.md §7
│   ├── handoff.md               # written AS YOU GO, never at the end
│   └── run-report.md            # Phase 4 output
```

**Unattended adaptation to the resume contract (deliberate, stated here so it is not read as a violation).** `session-management.md` §4 ends the resume check by presenting resume / restart / abort and WAITING for user input. There is no user. Phase 0 resolves it deterministically instead:

| Prior state | Action |
| --- | --- |
| No `progress.md` | Fresh run. |
| `progress.md` ends mid-phase AND its branch exists on the remote | **Resume** at the recorded next step. |
| `progress.md` ends mid-phase AND its branch is absent from the remote | **Escalate** — work was lost. Log it, report it, do not silently redo it: a half-applied migration or a half-posted tracker update may already exist. |
| `progress.md` ends with the final phase completed | Archive to `.session/.archive/<YYYY-MM-DD>-autonomous-delivery-<mode>/`, start fresh. |

### Dispatch table

| Phase / step | Pattern | Subagent role |
| --- | --- | --- |
| Phase 0 — Enter isolation | inline | orchestrator only; `EnterWorktree` for the run's OWN session, before config/lock work touches anything |
| Phase 0 — Lock + resume resolution | inline | orchestrator only; a lock decision delegated is a lock decision raced |
| Phase 1 — Audit | Parallel | one verifier per evidence source: git ancestry, open pull requests + unmerged branches, tracker status, queue/board + claim files |
| Phase 2 — Select | inline | orchestrator reasons over Phase 1's report; planning is never delegated |
| Phase 2 — scored judge panel (only when a call is genuinely novel) | Parallel | 3-5 independent lenses per `decision-protocol.md` §4 |
| Phase 3 — Execute | Single, in an isolated worktree | the owning pipeline skill runs its own stages; this skill does not decompose them |
| Phase 3 — context checkpoint | inline | orchestrator writes handoff + progress between slices |
| Phase 3.5 — Per-ticket cleanup | inline | orchestrator only; rescue that ticket's session artifacts, then `git worktree remove` its worktree — immediately, not batched |
| Phase 4 — Close and report | Sequential | close-out per the owning skill, rescue session records, release lock, report, then `ExitWorktree` on the run's OWN worktree |

> **Phase 1's parallelism is the point.** Four evidence sources that disagree is the normal case, and the orchestrator can only notice the disagreement if it sees all four independently. Collapsing them into one agent produces a single reconciled narrative with the contradiction already smoothed away.

> **On any subagent failure**: STOP that mode's run, write the failure into `progress.md` and the escalation log, release the lock, and report. Do NOT auto-retry a failed dispatch more than the pipeline skill's own capped fix-iterate loop allows, and never auto-rollback.

---

## Main flow

```
[scheduler fires: /autonomous-delivery <mode>]
       |
       v
   +--------------------------------+
   | Phase 0: LOCK                  |  inline
   |  - config read + mode validate |
   |  - lock: take / reclaim / exit |
   |  - resume resolution (table)   |
   +--------------------------------+
       |  live lock for this mode -> EXIT CLEANLY (report, no queue, no wait)
       v
   +--------------------------------+
   | Phase 1: AUDIT                 |  Parallel x4
   |  - git ancestry (the truth)    |
   |  - open PRs + unmerged branches|
   |  - tracker status (a hint)     |
   |  - queue / board / claim files |
   |  => merged-vs-claimed table    |
   +--------------------------------+
       |
       v
   +--------------------------------+
   | Phase 2: SELECT                |  inline
   |  - edges x live status x Phase1|
   |  - caps, scope-growth check    |
   |  - claim, re-read, back off    |
   +--------------------------------+
       |  nothing genuinely unblocked -> EXIT CLEANLY (empty run is correct)
       v
   +--------------------------------+
   | Phase 3: EXECUTE               |  Single, isolated worktree
   |  story/bug -> /sprint-development
   |  discovery -> /product-management
   |  - migration gate              |
   |  - handoff as you go           |
   |  - context budget monitor      |
   +--------------------------------+
       |  budget exhausted -> PUSH BRANCH, record resume state, stop (this is a SUCCESS)
       v
   +--------------------------------+
   | Phase 4: CLOSE AND REPORT      |  Sequential
   |  - owning skill's close-out    |
   |  - rescue session records      |
   |  - release lock                |
   |  - run report + channel post   |
   +--------------------------------+
```

---

## Phase 0 — Enter isolation, then lock

Concurrent routines must not collide, and the collision they must not have is two runs implementing the same ticket into two branches. Before any of that: `story` and `bug` runs need their OWN worktree, entered explicitly, so it can be closed explicitly — a scheduler-assigned worktree cannot be (see the Configuration note on the scheduler's "Worktree" option). `discovery` needs no worktree at all — see §0a.

### 0a. Enter isolation (before touching config, lock, or git state) — `story` / `bug` ONLY

**`discovery` mode skips this whole subsection.** It never writes application code and never creates a git branch — the only things it produces are tracker content via `/product-management`. A worktree buys it nothing and costs it the one thing its create-then-veto record depends on: `.session/autonomous-delivery/discovery/created-log.md` (and the mode lock, and the shared escalation log) must be the SAME file the next fire reads, not a copy made inside a worktree that gets removed before anyone reads it back. `discovery` operates directly in the plain checkout, start to finish. Go straight to §0b.

For `story` and `bug`:

1. **Note the home checkout path** — `pwd` right now, before anything else. This is where `.session/` and reports get rescued back to at Phase 4, and it is NOT recoverable once you've moved (worktree-relative paths only from here on; see Hazard 5.3).
2. **Read `autonomous_delivery.isolation`** from `.agents/project.yaml` (tracked, present in the plain checkout — no worktree needed yet to read it). If `in-place`, skip to §0b.
3. **Check whether you are already inside a worktree** (`pwd` under `.claude/worktrees/`, or the equivalent for this environment). If so, the scheduler's own "Worktree" option was left checked despite the Configuration note above — `EnterWorktree` errors when called from inside an existing worktree session, so do NOT call it. Instead: proceed in-place in this already-assigned worktree, note in the run report that the scheduler's Worktree checkbox needs to be unchecked for this routine, and flag that `ExitWorktree` will NOT be able to close this worktree at Phase 4 (Hazard 5.10) — a human will need to `git worktree remove` it manually afterward. This is a degraded-but-functional path, not a hard failure.
4. **Otherwise, `EnterWorktree`** with no fixed `name` (let it auto-generate — a fixed per-mode name risks a collision with a stale worktree from a crashed prior run; the mode-lock already prevents same-mode overlap, so collision-avoidance here is pure hygiene, not a race guard).
5. **Copy in what a fresh worktree does not carry**: `.env`, and the **whole `.session/` tree** from the home checkout (not just this mode's subfolder — `escalation-log.md` is shared across modes, and Phase 0b's resume table plus decision-protocol's "search the record first" both need it). Without this, the lock/progress/escalation history from every prior run is invisible and Phase 0b's resume table sees a false "fresh run" every single time. This copy is a point-in-time READ snapshot — `story` and `bug` runs may legitimately overlap (locks are per-mode), so treat anything outside your own mode's subfolder as read-only reference, not a value to write back verbatim (see Phase 4 step 3 for why).
6. **Verify the base branch, and realign it if it is wrong.** `EnterWorktree`'s default (`fresh`) branches from `origin/<the repo's default branch>` — whatever `refs/remotes/origin/HEAD` currently points at. That is not guaranteed to be the branch this project actually works against: read `git_strategy.branches.integration` from `.agents/project.yaml` and compare. In a `main-integration` strategy the default branch is typically `main` while work belongs on the integration branch. **Check it, do not assume it in either direction** — the host's default branch can be flipped at any time, which is exactly why this is a check rather than a fixed instruction.

   ```bash
   git fetch origin
   git merge-base --is-ancestor origin/<integration-branch> HEAD && echo "base OK" || echo "REALIGN NEEDED"
   ```

   If realignment IS needed:

   ```bash
   git checkout -B <this-worktree-branch> origin/<integration-branch>
   ```

   **Do NOT use `git reset --hard` here.** Critical Rule #13 forbids repo-wide destructive git commands because multiple agent sessions may share a working tree, and in a project that enforces it the call is DENIED by the permission layer — a run that reaches for it stalls at Phase 0a instead of realigning. `git checkout -B` reaches the same state without a destructive discard, and is safe on a brand-new branch precisely because nothing has been committed on it yet. See Hazard 5.11.

### 0b. Lock

1. **Read the rest of the config.** `enabled: false`, or a mode absent from `modes`, ends the run here with a one-line report — copy `.session/` back to the home checkout first if anything in it changed (it shouldn't have, this early), then `ExitWorktree(remove)`. This is not a failure.
2. **Validate the mode** against the three literals `story`, `bug`, `discovery`. Anything else is a fast-fail — never fall back to a default mode.
3. **Assert push identity before anything else, and re-assert it at every point of no return.** A multi-account CLI with the wrong cached identity reads and fetches fine and fails only at the first push or merge, hours later, with a permission error that looks like branch protection. Observing the identity once is not enough: an account with write scope can be active at Phase 0 and a read-only one active by the time the run reaches `gh pr merge`, with every step in between succeeding silently because `git push` uses a separate keychain credential that never drifted. Check `gh auth status` against `autonomous_delivery.automation_gh_account` (`.agents/project.yaml`); if the active account is wrong, `gh auth switch --user <account>` before proceeding. **Re-run this exact check again immediately before the FIRST push of the run, and again immediately before ANY merge** — not just here at Phase 0. See Hazard H20.
4. **Take the lock** at `.session/autonomous-delivery/<mode>/lock.json`:

```json
{
  "mode": "story",
  "owner": "<session id or pid — whatever this harness makes stable and observable>",
  "host": "<machine identifier>",
  "worktree": "<absolute path of the worktree this run entered via EnterWorktree>",
  "home_checkout": "<absolute path noted in §0a step 1 — where .session/ gets rescued back to>",
  "started_at": "<ISO-8601 UTC>",
  "heartbeat_at": "<ISO-8601 UTC, refreshed at every phase boundary>"
}
```

5. **Lock arbitration**, in this order:
   - **No lock file** -> write it, proceed.
   - **Lock exists, `heartbeat_at` newer than `lock_staleness_minutes`** -> a live run owns this mode. **Exit cleanly with a report naming the owner and its start time.** Do not queue. Do not sleep and retry. Do not proceed anyway. The next scheduled fire is the retry. Close YOUR OWN worktree (nothing was claimed in it) before ending.
   - **Lock exists, `heartbeat_at` older than `lock_staleness_minutes`** -> treat as abandoned. Reclaim it, and append a note to the escalation log recording whose lock was reclaimed, its age, and what the resume table then decided. A silent reclamation loses the only evidence that a prior run died. Note: the dead run's own worktree is a separate, likely-orphaned directory under `.claude/worktrees/` — it is not this run's `worktree` path in the reclaimed lock; if it's still on disk, note its path in the escalation log for a human to inspect and remove (do not remove another run's worktree yourself — see Anti-pattern A20).
   - **Lock exists and names THIS session** -> a prior phase of this same run; continue.
6. **Resolve resume** per the table in "Session & Dispatch". Refresh `heartbeat_at` at every phase boundary from here on; a run that stops refreshing is exactly what the staleness window is for.

Locks are **per mode**, so `story` and `bug` runs may overlap by design. That is deliberate and it is also why every hazard in `references/hazard-catalogue.md` §2 (shared mutable infrastructure) applies to a single-mode run too.

---

## Phase 1 — Audit

Establish what is real. The non-negotiable rule, learned by watching it fail:

> **Git is the source of truth. The tracker is a hint.**

A tracker can report ready-for-QA while nothing at all is on the integration branch, because merge automation fires on any pull request merge — including a chain's internal pull requests, which merge into an integration branch that is not the target. Every dependency decision in Phase 2 rests on this phase, so it is verified, never inferred.

**Fetch first, unconditionally**, then run the four evidence sources in parallel. Exact commands, the traps inside them, and the reconciliation procedure live in `references/audit-and-selection.md` §1-§4. The load-bearing check:

```bash
git fetch origin
git merge-base --is-ancestor <merge-commit> origin/<integration-branch>   # exit 0 == genuinely shipped
```

Run it on **every** contributing merge commit of a dependency, not on the dependency's status field, and not on a coordination file's claim about it.

**Output of the phase** is an explicit picture, not a narrative:

| Ticket | Tracker says | Merge commit | Ancestor of integration? | Open PR | Branch state | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| ... | ... | ... | yes / **no** | #NN / — | pushed / unpushed / absent | **merged** / claimed-only / in-flight / not-started |

Any row where "tracker says" and "verdict" disagree is written to the escalation log as a **discrepancy**, with the evidence. It is not corrected silently and it is not left implicit: the next run's Phase 1 needs to know this tracker lies in this specific way.

Also collected in this phase, because Phase 2 and Phase 3 both need it and neither should go looking on its own:

- **The live migration ledger**, queried from the shared instance via `[DB_TOOL]`. It can be ahead of your branch (a peer applied out-of-band) and it can contain a migration that exists in no file you can list.
- **The queue / board / claim file, read in full** — not just your own row. A peer's coordination flag routinely lands on someone else's row, and it is only ever found by someone reading the whole file.
- **Branch-protection reality**, from BOTH the classic protection endpoint and the rulesets endpoint. The classic endpoint returns a not-protected 404 when protection is implemented as a ruleset, which reads as "unprotected" if it is all you check.

---

## Phase 2 — Select

Pick work whose dependencies are **actually** satisfied. Four inputs, and they are weighted, not averaged:

1. **`.context/dev-roadmap.md`** — authoritative for dependency EDGES, mockup gates, and execution ordering. Never for current status. A recent timestamp on it says nothing about any ticket's status today.
2. **Live tracker status**, queried now via `[ISSUE_TRACKER_TOOL]` for the candidate and its direct blockers in one call.
3. **Phase 1's verdict column** — which overrides both of the above whenever they disagree.
4. **The claim / queue file**, to avoid taking work a peer already owns.

### Selection algorithm

1. Build the candidate set for the mode: `story` -> stories at ready-for-dev; `bug` -> open defects; `discovery` -> refinement gaps (`/product-management`'s own workflows define what counts).
2. Drop any candidate whose hard blocker is not **merged** by Phase 1's verdict. Log the skip with the reason. A blocked candidate is not an escalation — it is a skip.
3. Drop any candidate that is **already past dev** by live status, regardless of what the queue file claims.
4. **Readiness is not status.** Read the refinement trail before accepting a candidate: unresolved blocking refinement questions, explicitly-disclaimed practice-exercise answers, and unchecked edge-case lists all mean not-ready even when the status field says otherwise. A ticket can be moved to ready-for-dev with a declared blocker still open and no comment trail explaining the move.
5. **Scope-growth check.** If a candidate carries signals of being larger than a normal pick — high point estimate, no mockup where the design plan expects one, an architectural decision implied by its acceptance criteria, more than one migration — **do not claim it in an unattended run.** Log it as a candidate needing a human-present session, and take the next one. Auto-claiming the largest thing on the board by "pull the next available row" is a measured way to burn a whole run.
6. **Apply the cap**: `story` takes exactly one. `bug` takes up to three and processes them **strictly sequentially**, each fully closed through Phase 4's close-out before the next is claimed. `discovery` creates backlog definitions (up to `discovery_definitions`) and writes no code.
7. **Claim it** using the claim protocol: write your name and status into the row, save, then **re-read the file**. If a different name is there, a peer won the race — back off and take the next candidate. Never fight over a row.
8. **If nothing survives**: exit cleanly. Write the run report saying what was considered and why each was dropped. **An empty run is a correct outcome, not a failure**, and a report that explains the emptiness is worth more than a marginal ticket.

Full recipes, including the readiness signals and the scope-growth signals: `references/audit-and-selection.md` §5-§7.

---

## Phase 3 — Execute

Dispatch the owning skill. This skill orchestrates; it does not duplicate stages.

| Mode | Dispatch | What this skill supplies |
| --- | --- | --- |
| `story` | `/sprint-development` (new-story entry) | ticket key, Phase 1 verdict table, the claim, the worktree path, the migration gate setting, the context budget |
| `bug` | `/sprint-development` (bug entry — root cause first) | same, once per bug, sequentially |
| `discovery` | `/product-management` (its refinement / epic / AC workflows) | the gap found in Phase 2 and the evidence for it |

Every dispatch uses the 7-component briefing from `agentic-dev-core/references/briefing-template.md`. Component 7 (Rules) MUST carry the migration gate, the worktree path, the no-rebase-on-pushed-branches rule, and the context-budget stop procedure — a rule that lives only in this file never reaches the executor.

### Isolation

`isolation: worktree` (the default) means the dispatched agent works in its own git worktree. This is not tidiness: a background subagent writes into its dispatcher's working directory by default, its uncommitted files ride along through every branch switch the dispatcher makes, and it **outlives its dispatcher** — one dispatched shortly before its dispatcher retired went on to finish a slice, push a branch, open a pull request and merge it, with nobody watching.

Three worktree consequences the dispatch briefing must state, because they are invisible until they bite:

- **Gitignored files do not come with a worktree.** Environment files are not tracked, so the worktree has no credentials. An agent that finds no declared identity available has been observed **improvising one**. Copy the environment file in immediately on entry, before any credential-needing step.
- **An absolute path inside a worktree silently reads and writes the MAIN checkout.** There is no error. Reads return another branch's content, writes land on the wrong branch and report success. Use paths relative to the worktree for anything that should reflect your branch. If a write succeeds but a later search in the same session cannot find it, suspect the path before suspecting the tool.
- **Session files written inside a worktree are gitignored and die with it.** Rescue them in Phase 4 **before** the worktree is removed.

### Phase 3.5 — Per-ticket cleanup (do this immediately, not batched at Phase 4)

The Agent tool does **not** remove a dispatched agent's worktree once it holds any changes — that is deliberate on its part (so a still-useful worktree survives for follow-up), but it means the orchestrator must close it explicitly, per ticket, the moment that ticket's work is done. "Done" means one of: merged, escalated with its branch pushed, or stopped at the migration-apply gate with its branch pushed. In every one of those cases there is nothing left to lose by removing the local copy — the remote branch already has it.

Immediately after a dispatched agent reports back, before selecting or dispatching the next ticket:

1. **Confirm the branch is pushed** (or that the agent made zero commits — nothing to lose either way). Never remove a worktree holding unpushed work; if that happens, something upstream failed to push-first and this is now itself an escalation, not a cleanup step.
2. **Rescue anything in that worktree's `.session/` tree** that this run's own progress log doesn't already capture (the dispatched agent may have written its own nested-skill progress files, e.g. `/sprint-development`'s `.session/sprint-development/<KEY>/`) into the home checkout.
3. **`git worktree remove <path>`.** Not `ExitWorktree` — that tool only tracks worktrees entered via `EnterWorktree` by name/path from THIS session, and a dispatched Agent's `isolation: worktree` worktree was created by the Agent tool, not by an `EnterWorktree` call this session made. Plain `git worktree remove` is the correct tool here. Two edge cases: it refuses on modified tracked files without `--force` (should not happen if step 1's push-confirmation held — treat a refusal as a sign something was missed, not a reason to force through it); and it errors "not a working tree" if the Agent tool already auto-removed a zero-change worktree before you get here — check the path exists first, and treat "already gone" as success, not a failure to retry.
4. **Log the removal** in `progress.md` — one line, alongside that ticket's outcome — so a reader can tell the worktree was closed deliberately, not simply forgotten.

Never defer this to Phase 4. A run processing three bugs that waits until the end to clean up has three dangling worktrees sitting on disk for the entire remaining run for no reason, and a mid-run context exhaustion means they never get cleaned at all.

### Migration gate

Applying a schema migration to a shared database is irreversible and affects every concurrent agent. It has already happened out-of-band on a shared instance, and a **different** ticket's type regeneration silently absorbed the resulting schema into its own diff.

Writing the migration file is ordinary technical work and is always autonomous. **Applying it is a separate act with a separate gate:**

| `migrations:` | Additive change (new table, new function, new index, new column with a default) | Destructive change (drop, rename, rewrite of an existing live object) |
| --- | --- | --- |
| `confirm` (default) | **Pause and request approval**, stating the target instance, exactly what the migration does, and that it is additive. | **Pause and request approval**, stating target, what it does, and that it is destructive. Offer a real second option (defer to a fast-follow), not a yes/no. |
| `autonomous` | Proceed. Take the number from the live ledger immediately before writing the file. | **Still stops.** `autonomous` never covers dropping, renaming, or rewriting a live object. |
| `unrestricted` | Proceed. Take the number from the live ledger immediately before writing the file. | **Proceed.** Every class applies unattended, including drop / rename / `CREATE OR REPLACE` rewrites of an existing live object. Take the number from the live ledger immediately before writing the file, same as additive. |

`unrestricted` is opt-in and deliberately unsafe-by-choice: it exists for a project whose database has no production data to lose (a greenfield build, a disposable environment) and whose operator has decided that stopping the run is more expensive than a bad migration. Never make it the default, and never infer it from a project that merely set `autonomous`.

Two rules regardless of setting, `unrestricted` included:

- **Never apply a migration merely to clear a local error.** If a local failure seems to need a live schema change, that is a finding, not a step.
- **Re-read the live definition after every apply** — including re-applies where you believe nothing changed — and diff it against the committed file. Hand-retyping SQL into an apply call has dropped a clause by fat-finger, caught only by the habit of diffing afterwards.

A `CREATE OR REPLACE` that changes an existing live object's **output** is a rewrite, not an additive change, even when the fix is narrow, confirmed, and unambiguous. Do not pattern-match a bug-fix precedent onto it. Under `unrestricted` this classification no longer changes whether the apply proceeds (both columns proceed), but it still matters for the run report: log it as destructive, not additive, so the record stays honest about what actually happened.

### Verification that actually verifies

The pipeline skill owns the verification stages. This skill adds one requirement on top, because unattended runs cannot fall back on a human noticing:

**At least one assertion must exercise a real production write path** before an acceptance criterion is called covered. A suite can be fully green over a feature that cannot work, when fixtures seed the column the code reads rather than the column production actually writes. Every test passed; two production metrics were permanently zero. Grep the migration history for writes to the table in question and confirm the column is written by something other than your own fixture.

Related, and cheap: a function that has never been executed against the real backend can be reviewed and merged and still fail on every call. Mocked calls prove nothing about the thing being mocked.

---

## Context-budget contract

**The binding constraint on an unattended run is context, not wall-clock.** Three worker generations were consumed inside twenty-four hours in the run this skill is derived from; every one of them retired on context, most of them more than once, several mid-ticket. Design for that, do not hope against it.

Three obligations, in order of importance:

1. **Write the handoff as you go.** `handoff.md` is appended at every phase boundary and after every completed slice (`context_budget.handoff_checkpoint`). A session that runs out of room cannot write up why it ran out of room. Never defer the handoff to the end; there is no end you can count on.
2. **Monitor your own budget.** At every phase boundary, estimate remaining budget. At `stop_at_remaining_pct` (default 20), stop taking new work and begin the clean-stop sequence — do not start a new slice, do not dispatch a background agent, and do not schedule a wake-up.
3. **The clean-stop sequence, in this exact order:**

```
1. PUSH the branch.                 <- first, always. Unpushed work in a disposable
                                       worktree is the only unrecoverable loss here.
2. Rescue session records out of the worktree into the main checkout.
3. Append the resume state to handoff.md: exact branch, exact tip SHA, which pull
   requests exist and their state, what is done, what is not, and the NEXT CONCRETE
   COMMAND. Written so a stranger could resume from it cold.
4. Append the final progress.md entry.
5. Release the lock.
6. Report.
```

**A run that hands off cleanly is a success.** Judge a run by whether the next one can pick it up, not by whether it shipped.

What belongs in the handoff, and what must not: `references/run-report-format.md` §3. The short version is that restating what is already durable elsewhere (per-ticket status on the board, merges in the merge record, rulings in the escalation log) is noise, and noise is what makes the next run skim instead of read. What the next run cannot get anywhere else: traps that cost real time with their exact symptom, conventions established but not yet written down, work in flight with the next concrete command, and what you would do differently — direct and unhedged.

**Never end a turn in the worst possible shape.** Starting a slice with a background agent AND scheduling a wake-up in the same breath, with the budget already thin, is precisely the shape that produces a mid-write death. When a clean stopping point is available — right after planning, nothing in flight — take it.

---

## Autonomy

Follow `agentic-dev-core/references/decision-protocol.md` in full. The order is the substance:

```
SEARCH THE RECORD -> settled? FOLLOW IT
        |
        | not settled
        v
  product / novel security / irreversible / reserved?
        |  no                                  |  yes
        v                                      v
  SCORED JUDGE PANEL (3-5 lenses)          ESCALATE (informed)
        |                                      |
        +--------> WRITE IT DOWN <-------------+
```

For an unattended run, three amplifications:

- **The record to search FIRST is `.session/autonomous-delivery/escalation-log.md`, read in full, plus `.context/ADR/` and the ticket's siblings.** Search for the SHAPE of the question, not its wording. A ruling that governs you may have been written an hour ago by a run you never saw.
- **Escalating is expensive here in a way it is not interactively.** There is nobody to answer. An escalation ends the run's forward progress until the next human touch, so an over-stop on a technical call costs a whole scheduled slot. The escalate-only categories are exhaustive: product and business decisions, a genuinely NEW security posture (applying an already-ratified pattern is implementation), irreversible or destructive actions, and anything the operator explicitly reserved.
- **Check whether product calls are even an escalation here.** Read `decision_authority.product` in `.agents/project.yaml` before treating a product question as a stop. Under the default (`escalate`) it is one. Under `decide` — a project with no human PO — it is work: dispatch the decision subagent, publish the attributed ruling to the ticket, resync, and continue the run. `decision-protocol.md` §5.1 owns the method. This changes only category 1; the other three still end the run.
- **Record every autonomous decision where the next run's Phase 1 will find it** — the escalation log, at the moment the decision is made. A decision that is not recorded did not happen, and the next run will re-derive it and land somewhere else.

**Escalation, when it does fire, is a clean stop, not a hang.** Write the escalation entry (what happened, why it is this category, what the human needs to decide, what the downstream cost of waiting is), push anything unpushed, release the lock, **notify** if `escalation_channel` is configured (see below), and end the run. Never park a scheduled session waiting on an answer that cannot arrive.

### Notifying an escalation

An escalation nobody is told about is indistinguishable from a run that silently died. When `autonomous_delivery.escalation_channel` is set (it is `null` by default, and `null` means "the run report is the notification"), the clean-stop sequence gains a notify step, after the lock is released and before the run ends:

1. **Post to `escalation_channel`** — the primary path, because an external channel persists, leaves a record, and does not depend on any agent client being connected. Name the ticket key, what is blocking it, and what specifically the operator must decide. It is a message a human reads on a phone, so keep it short and lead with the ticket key.
2. **Send a push notification second**, if the harness offers one — one line, under 200 characters, no markdown, ticket key first, then the actual decision needed (not "run stopped").

A failure to deliver either one never becomes a second failure that swallows the first: record the send failure in the run report and end cleanly anyway.

**`escalation_channel` carries escalations only.** A run that finishes cleanly does not post there, and neither does an empty run with nothing eligible — both are correct outcomes that belong in the run report. Everything landing in that channel must be something the operator has to act on; diluting it with routine traffic is what turns a channel worth reading into one that gets muted. Routine summaries go to `report_channel`, which is a different setting.

### Discovery creates, the operator vetoes (no approval gate)

`discovery` never waits — exactly like `story` and `bug`. There is no approval gate: when the run settles on a definition worth creating, it creates it, records it, and reports it. Creating definitions within the `discovery_definitions` cap is this mode's work product, not an escalation; the cap — not a human in the loop — is what bounds the blast radius.

**Mechanics**, once a definition is settled:

1. Dispatch `/product-management` to create it in the tracker.
2. Append ONE entry per created artifact to `.session/autonomous-delivery/discovery/created-log.md`: key, title, parent, date, run session id, one-line reason. The file is APPEND-ONLY — never rewrite, resolve, or prune an entry.
3. Report the created keys to `report_channel`.

**At the START of every discovery run**: read `created-log.md` in full, before any fresh analysis, and cross-check every entry against live tracker state. An entry whose ticket is closed or deleted is a VETO — a standing operator ruling. Never re-create it, and never create a near-identical restatement of it under a new title. The veto is cheap by design: closing a user story sitting in `Backlog` costs one click, which is less than one idle scheduled fire.

**New epics** are created the same way — but the run report owes an explicit argument for why no existing epic could hold the work. That argument is accountability after the fact, not a request for permission.

This is exactly why `discovery` skips worktree isolation entirely (Phase 0a): `created-log.md` must be the one real file the next fire reads, not a copy trapped inside a worktree that gets removed before that fire ever sees it.

**DO NOT REINTRODUCE the approval gate.** Until 2026-08-18, `discovery` was allowed to end its turn on an open proposal and wait for the operator to answer in that routine's own chat (`pending-decision.md`, `status: awaiting_reply`). The operator removed it by explicit decision, on evidence: ONE unanswered proposal produced FOUR consecutive fires (2026-08-14 through 2026-08-18) that created nothing at all, because the re-surface rule correctly forbade stacking a new proposal on a pending one — and during that same gated period the mode opened a pull request its own contract forbade, unnoticed for five days. The gate cost four days of idle runs and did not bound the blast radius; the per-run cap does. A future run or edit must not restore the gate, and must not invent a softer version of it — a confirm-first flag for "big" items, a pause-on-epic rule, or any other synchronous wait — as a safety improvement.

---

## Phase 4 — Close and report

Sequential, and the order matters because each step can be lost by the one before it.

1. **Complete the owning skill's own close-out.** For `/sprint-development` that is its Stage 4 tail: verify the tracker's auto-transition actually fired (it is inconsistent — check live, every ticket, every type), reassign the story to its shift-left QA owner and **verify the assignee actually changed** (some tracker CLI paths report success while clearing the field), post the handoff comment, and sync the tracker cache. This skill does not reimplement any of it; it verifies it happened.
2. **Rescue session records BEFORE the worktree is removed.** Session directories are gitignored and live inside the worktree; removing the worktree destroys them. Copy them into the main checkout's session tree first. Writing a good handoff and then losing the underlying records is the exact failure this ordering prevents.
3. **Release the lock** — delete `lock.json`. A run that escalated or stopped on budget releases it too; a lock is held by a running session, not by an unfinished ticket.
4. **Write the run report** to `.session/autonomous-delivery/<mode>/run-report.md` per `references/run-report-format.md` §1. Include the empty-run case: what was considered, what was dropped, why.
5. **Post the summary** to `report_channel` when one is configured. `null` means the file is the report — do not improvise a destination.
6. **Archive** the session directory per `session-management.md` §8 and call the memory session summary with the archive path included.
7. **`ExitWorktree(remove)` on the run's OWN worktree** — the one entered in Phase 0a, and only that one. Dispatched agents' worktrees were already closed per ticket in Phase 3.5, and another run's worktree is never yours to remove (A20). This is the last step for a reason: everything above reads or writes paths that stop existing the moment it runs. If the run is in the degraded path from Phase 0a step 3 (a scheduler-assigned worktree), `ExitWorktree` is a no-op here — say so in the report and name the path a human needs to `git worktree remove`.

Every discrepancy Phase 1 found, every autonomous decision made, and every check the run could not perform is named explicitly in the report. Nothing evaporates silently: what an unattended run could not verify becomes an explicit flag for the humans who can.

---

## Hazard checks

Every item below has been observed. Each is a check the run performs, not a caution it holds in mind. Trigger, symptom, and countermeasure for each: `references/hazard-catalogue.md`.

| # | Hazard | Check |
| --- | --- | --- |
| H1 | Tracker reports ready-for-QA while nothing is on the integration branch (automation fires on any pull request merge, including a chain's internal ones) | Ancestor check on the merge commit, every time |
| H2 | Regenerating types/clients from a shared live database pulls an unmerged sibling's schema into your diff | Read regenerated output before committing; diff it; prove zero consumers before stripping |
| H3 | Migration numbering taken from local files collides, in both directions | Query the live ledger immediately before writing the file |
| H4 | A fully green suite over an unsatisfiable feature, because fixtures seed the column the code reads rather than the one production writes | At least one assertion against a real production write path |
| H5 | Editing a skill's compact-rules block changes nothing until the registry is regenerated | Regeneration is a second, separate, explicit step |
| H6 | A background subagent outlives its dispatcher and keeps mutating shared state | Isolated worktree per dispatched agent, from the start |
| H7 | Rebasing a branch a subagent already pushed forces a history rewrite | Merge the base in; never rebase pushed work |
| H8 | A fast-forward check no-ops against a stale remote-tracking ref | `git fetch` immediately before, unconditionally |
| H9 | An absolute path inside a worktree silently reads/writes the main checkout, with no error | Worktree-relative paths; suspect the path when a write "succeeds" but cannot be found |
| H10 | Declared branch protection differs from what the host enforces; the classic endpoint 404s when a ruleset is in force | Query both endpoints before planning any merge |
| H11 | A claim or coordination file goes stale within minutes, and the flag that matters is on someone else's row | Re-read the WHOLE file, at least once per work session |
| H12 | A privileged function filtering on a caller-supplied identity or scope authorizes nothing | `/sprint-development`'s `references/rpc-authorization.md` gate — this run never waives it |
| H13 | Per-slice review passing is not evidence the assembled chain is sound | Budget the assembled-diff review as seriously as any slice's |
| H14 | A tracker status flips to ready-for-dev with blocking refinement questions still open | Read the refinement trail in Phase 2, not the status field |
| H15 | Session records die with the worktree that held them | Rescue before removal, Phase 4 step 2 |
| H16 | The scheduler's own "Worktree" option assigns a worktree `ExitWorktree` cannot see or close (it only tracks worktrees THIS session entered via `EnterWorktree`) | Leave that option unchecked; the run enters and exits its own isolation explicitly, Phase 0a / Phase 4 |
| H17 | A fresh `EnterWorktree` branches from the repo's default branch, which is not guaranteed to be the integration branch the project works against | Fetch + `git merge-base --is-ancestor` check after entry; realign with `git checkout -B`, NEVER `git reset --hard` (Rule #13 denies it), Phase 0a step 6 |
| H18 | A dispatched agent's worktree is never auto-removed once it holds changes — that is deliberate on the Agent tool's part | Explicit `git worktree remove` per ticket, immediately, Phase 3.5 |
| H19 | `discovery` re-creates a definition a prior run already created, or restates one the operator vetoed by closing/deleting it, flooding the backlog | Read `created-log.md` FIRST; cross-check every entry against live tracker state; closed/deleted = standing ruling — never re-create, never restate under a new title |
| H20 | A multi-account `gh` CLI's active identity silently flips between Phase 0 and merge time — `git push` keeps working under a separate keychain credential, so the failure surfaces only at `gh pr merge` with a permission error that looks like branch protection | Assert `autonomous_delivery.automation_gh_account`, `gh auth switch --user <account>` if wrong — at Phase 0, again before the first push, and again before any merge |

---

## Anti-patterns — NEVER do these

- **A1.** NEVER advance a dependency on a tracker status. Only `git merge-base --is-ancestor` against the integration branch decides whether something shipped.
- **A2.** NEVER queue, sleep-and-retry, or proceed anyway when a live lock exists for your mode. Exit cleanly; the next scheduled fire is the retry.
- **A3.** NEVER take a second story in one run. The cap is one, it is hard, and it is derived from measurement rather than caution.
- **A4.** NEVER start the next bug before the current one is fully closed through Phase 4.
- **A5.** NEVER write code in `discovery` mode. It defines and creates tracker content; that is the whole mode.
- **A6.** NEVER defer the handoff to the end of the run. Write it as you go, or you will not write it.
- **A7.** NEVER stop on a low budget with unpushed commits. Push first, then record, then stop.
- **A8.** NEVER apply a destructive migration autonomously — no setting covers it, and clearing a local error is not a reason.
- **A9.** NEVER take a migration number from a local directory listing.
- **A10.** NEVER commit generated output from a shared live instance without reading it first.
- **A11.** NEVER rebase, force-push, amend, or otherwise rewrite pushed history, and never route around a denied operation by finding another path to the same effect. A denial is a signal to stop and name the exact permission needed, never a puzzle to solve.
- **A12.** NEVER modify your own permission settings, allowlists, or configuration to restore your own capability.
- **A13.** NEVER improvise an identity, credential, or account when the declared one is missing. Fail closed and report. A worktree without its environment file is the most common way this temptation arises.
- **A14.** NEVER select work by "pull the next available row" without the scope-growth check. Large or novel work belongs in a human-present session.
- **A15.** NEVER manufacture a non-empty run. If nothing is genuinely unblocked, report that.
- **A16.** NEVER re-ask a settled question, and never treat an answer obtained without the prior ruling in front of the human as a supersession. It is an uninformed re-ask and it overrides nothing.
- **A17.** NEVER escalate a technical call this run is equipped to settle. There is nobody to answer, and the stop costs a whole scheduled slot.
- **A18.** NEVER leave an escalation parked waiting for a reply — in ANY mode. Write the entry, push, release the lock, notify `escalation_channel` if one is configured, end the run. No mode ends its turn on an open question: `discovery` creates within its cap and lets the operator veto after the fact (see Autonomy § "Discovery creates, the operator vetoes").
- **A19.** NEVER remove a worktree before rescuing the session records inside it.
- **A20.** NEVER edit another run's board row (except to claim an unclaimed one per protocol), branch, or worktree.
- **A21.** NEVER include AI-attribution lines in commits, pull request bodies, or tracker comments.
- **A22.** NEVER reimplement a stage that `/sprint-development` or `/product-management` owns. Dispatch it.

---

## Pre-flight checklist

- [ ] Mode is one of `story` / `bug` / `discovery`, present in `autonomous_delivery.modes`, and `enabled: true`
- [ ] Push identity verified as having write scope, before the first push rather than at it
- [ ] Lock taken, reclaimed-with-a-logged-note, or the run exited cleanly on a live lock
- [ ] Resume resolved deterministically per the unattended table; a missing remote branch escalated rather than redone
- [ ] `git fetch` run before every ancestry and fast-forward check
- [ ] Ancestor check run on every contributing merge commit of every dependency
- [ ] Merged-vs-claimed table produced; every tracker/git discrepancy written to the escalation log with evidence
- [ ] Live migration ledger queried; queue/board/claim file read in full; both protection endpoints checked
- [ ] Candidate's refinement trail read — readiness established, not inferred from status
- [ ] Scope-growth check applied; oversized or novel work deferred to a human-present session
- [ ] Cap respected (`story` 1, `bug` 3 sequential, `discovery` no code)
- [ ] Claim written, file re-read, and the row conceded if contested
- [ ] Dispatched agent given an isolated worktree, its environment file copied in, and briefing component 7 carrying the migration gate + budget stop procedure
- [ ] Migration gate honoured; live definition re-read and diffed after every apply
- [ ] At least one assertion exercises a real production write path
- [ ] Handoff appended at every phase boundary — never deferred
- [ ] On low budget: branch pushed FIRST, resume state recorded, then stop
- [ ] Owning skill's close-out verified (auto-transition fired, assignee actually changed)
- [ ] Session records rescued out of the worktree before removal
- [ ] Lock released, run report written, channel posted if configured, session archived
- [ ] Every autonomous decision recorded where the next run's Phase 1 will find it

---

## Hand-offs

### Project-owned (T1)

- **Per-ticket implementation, review, and deploy** -> `/sprint-development`. It owns every stage; this skill only selects and dispatches.
- **Refinement, epics, acceptance criteria, backlog gaps** -> `/product-management` (`discovery` mode's only callee).
- **Branch creation, pull requests, merges, conflicts, chained-pull-request planning** -> `/git-flow-master`.
- **Dependency edges and execution ordering are stale or missing** -> `/dev-roadmap`.

### Out of scope

- **QA verification** — a separate workflow picks up from the QA-ready state.
- **Choosing what to build** — that is product work and it escalates.

If a pre-requisite check fails, STOP and report. Do not continue and do not improvise around it.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
| --- | --- | --- |
| `[ISSUE_TRACKER_TOOL]` | the project's tracker CLI or MCP | `CLAUDE.md` Tool Resolution |
| `[DB_TOOL]` | the project's database MCP or CLI | `CLAUDE.md` Tool Resolution |
| `[WEB_SEARCH_TOOL]` | the project's search MCP | `CLAUDE.md` Tool Resolution |

`git`, `gh`, and `bun` are used literally.

---

## Variables consumed

- `autonomous_delivery.*` — every key in the Configuration block, read from `.agents/project.yaml`
- `git_strategy.branches.integration` — the branch every ancestry check runs against
- `git_strategy.branches.production` and `git_strategy.protected` — never a target for this skill
- `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}` — tracker queries
- `testing.automation_identity` — passed through to the dispatched skill; never substituted

If a required key is unset, the run ends in Phase 0 naming the file and the key.

---

## References

| Read | For |
| --- | --- |
| `references/audit-and-selection.md` | Phase 1 audit commands and their traps; Phase 2 selection recipes, readiness signals, scope-growth signals, claim protocol |
| `references/hazard-catalogue.md` | Every hazard by class: trigger, symptom, check |
| `references/run-report-format.md` | Run report, handoff, escalation-log entry, and `progress.md` formats |
| `agentic-dev-core/references/decision-protocol.md` | Who decides what, and in which order |
| `agentic-dev-core/references/briefing-template.md` | The 7-component dispatch briefing |
| `agentic-dev-core/references/session-management.md` | The session contract this skill adapts for unattended use |
| `sprint-development/references/rpc-authorization.md` | The authorization gate this run never waives |

---

## Notes

- This skill assumes `/sprint-development` and `/product-management` are installed and their pre-requisites met. It fast-fails rather than substituting for either.
- Everything here is derived from a measured multi-agent run: the caps, the lock semantics, the ordering of the clean-stop sequence, and every hazard. Where a number appears, it came from observation. Treat a change to one as a change to a finding, not a preference.
- Judge a run by whether the next one can pick it up cleanly. Shipping is the output; a resumable state is the invariant.
