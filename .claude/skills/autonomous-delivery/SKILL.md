---
name: autonomous-delivery
description: "SCHEDULED entry point for a delivery run. Audits real state (git is truth, the tracker is a hint), selects work whose dependencies are genuinely satisfied, dispatches the owning pipeline skill, closes out, and reports. Three modes: `story` (1 per run, hard cap, fully unattended) and `bug` (up to 3, sequential, fully unattended) never wait on a human; `discovery` (up to 2 new user stories or epic per run, never application code) is the one mode that DOES wait — its proposal must be approved synchronously in that routine's own chat session before anything is created. Four phases: Phase 0 Lock -> Phase 1 Audit -> Phase 2 Select -> Phase 3 Execute -> Phase 4 Close and report. Triggers on: scheduled delivery run, unattended run, autonomous run, cron delivery, routine run, nightly delivery, overnight sprint run, run the queue unattended, pick up the next unblocked ticket by yourself, autonomous-delivery, `/autonomous-delivery story`, `/autonomous-delivery bug`, `/autonomous-delivery discovery`. Do NOT use for: interactive per-ticket work with a human present (use /sprint-development directly — this skill only wraps it in audit + selection + handoff), backlog seeding or AC refinement on a named ticket (use /product-management directly), branch / PR / conflict operations (use /git-flow-master), foundational product definition (use /project-foundation), infrastructure scaffolding (use /project-bootstrap), or unit-test TDD slices (use /unit-testing)."
license: MIT
compatibility: [claude-code, opencode]
phase: implementation
---

<!-- Model preferences: the top-level routine session runs on whatever model the schedule is configured
     with (Opus 5 recommended for the audit/select reasoning below). Every Agent() dispatch this skill
     makes is NOT advisory — Phase 2's judge panel and Phase 3's execution dispatch MUST pass an explicit
     `model` override. Omitting it means the subagent silently inherits the orchestrator's model, which is
     the wrong default when the orchestrator is running something stronger (and pricier) than the
     mechanical work actually needs. -->
<!--
model_preferences:
  audit: sonnet          # mechanical state verification
  selection: opus        # dependency reasoning under contradictory evidence — this is the ORCHESTRATOR
                          # thinking inline, not a dispatch; it runs on whatever model the session itself is on
  execution: sonnet      # ENFORCED — every Phase 3 Agent() call passes model: "sonnet" explicitly
  judge_panel: opus      # ENFORCED — every Phase 2 scored-judge-panel Agent() call passes model: "opus" explicitly
  archive: haiku         # mechanical close-out, if dispatched as a separate agent
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
- **Product questions are DECIDED, never escalated (`CLAUDE.md` Rule #18).** This project has no human PO — an open product, business, functional, scope, UX-copy or design-intent question on a ticket is work to do, not a blocker. **Search the record FIRST** (`.session/autonomous-delivery/escalation-log.md` in full, `.context/ADR/`, the ticket's siblings) — a ruling that already governs it is followed and cited, never re-derived. Only if genuinely unsettled, dispatch a decision subagent (`AI Product Owner / Business Analyst`, `AI Tech Lead`, or both when joint, `model: "opus"` explicit), have it score 2-4 candidate answers against explicit criteria, publish the winner to the ticket under an attributed heading (`## AI Product Owner — Decision: <question>`), resync the cache, and CONTINUE. Never style an AI ruling as human sign-off, and never leave one unattributed. Escalate ONLY a genuinely new security posture, irreversible/destructive actions, and whatever the operator explicitly reserved. See `decision-protocol.md` §5.1.
- **Exactly two things legitimately block a candidate**, and an empty run is only correct when one of them is what you actually found: (a) a **real dependency** — the prerequisite is not an ancestor of the integration branch, verified by git, never by a status; (b) **a story that never went through shift-left at all** — a QA-authoring gap, recorded for assignment, never invented yourself. An unresolved or self-ratified refinement question is category (a) for neither: it is a decision to dispatch. Selecting marginal work to avoid an empty report is still a failure — but so is reporting empty over a question you were equipped to settle.
- **Caps are hard: `story` 1 per run, `bug` 3 sequential (each fully closed before the next), `discovery` up to 2 new user stories per run (never application code, and only after its synchronous approval gate — see Autonomy).** Every measured story became a multi-thousand-line chain; two do not fit in one run's context.
- **Write the handoff as you go, never at the end.** A run that exhausts its context cannot write up why. Checkpoint after every phase and after every completed slice.
- **When context runs low, push the branch FIRST, then record resume state, then stop.** Unpushed commits in a disposable worktree are the only unrecoverable loss in this system. A clean mid-work handoff is a success; a mid-ticket death with unpushed work is the failure to design against.
- **Applying a schema migration to shared infrastructure is irreversible and hits every concurrent agent.** Under `migrations: confirm` (default) it stops for approval, stating target and additive-vs-destructive. Under `migrations: autonomous` it proceeds for ADDITIVE changes only and still stops for anything that drops, renames, or rewrites a live object. Under `migrations: unrestricted` it proceeds for EVERY class, including destructive ones — this project's current setting (operator decision, 2026-08-06; see Configuration). Writing the migration file is always autonomous; applying it is not. Two rules bind at every level, `unrestricted` included: never apply a migration merely to clear a local error, and always re-read the live definition after every apply (incl. re-applies) and diff it against the committed file.
- **A cached `gh` identity can silently flip between phases in a multi-account setup.** `gh auth status` showing the correct account (with repo write/merge scope) at Phase 0 is not evidence it is still active at merge time — `git push` keeps working under a separate keychain credential even after the active `gh` account changes, so the failure surfaces only at `gh pr merge`, looking like a permissions or branch-protection error. Assert the expected account (`autonomous_delivery.automation_gh_account` in `.agents/project.yaml`) and `gh auth switch --user <account>` if it drifted — at Phase 0, again immediately before the first push, and again immediately before any merge.
- **Take the migration number from the live ledger immediately before writing the file**, never from a local directory listing. The ledger can be ahead of your branch by a peer's unmerged migration, and behind no file you can list.
- **Read regenerated output before committing it.** Types, clients, and API specs generated from a shared live instance silently absorb a concurrent sibling's unmerged schema. Diff it; strip foreign entries after proving zero consumers.
- **Give every dispatched agent its own worktree.** A background subagent writes into its dispatcher's working directory by default, outlives its dispatcher, and keeps mutating shared state after the dispatcher is gone. Fixing this after `git status` looks wrong is too late.
- **Never rebase a branch a subagent already pushed** — merge the base in instead (`git checkout -B <branch> origin/<branch> && git merge <integration-branch> --no-edit`). Rebasing forces a force-push, which is a history rewrite on pushed work.
- **Never reach for a repo-wide destructive git command** — `git reset --hard`, `git restore .`, `git checkout -- .`, untargeted `git stash`, `git clean -f`. Critical Rule #13 forbids them because agent sessions share this working tree, and the permission layer DENIES them, so a run that reaches for one stalls rather than proceeding. To move a branch pointer use `git checkout -B <branch> <ref>`; to discard, name the exact paths YOU modified.
- **Green tests are not evidence the feature works.** Fixtures that seed the column the code reads, rather than the column production writes, keep every test green over a dead data path. Require at least one assertion against a real production write path before calling an acceptance criterion covered.
- **Editing a skill's rules does nothing until the registry is regenerated** (`bun run skills:registry`). The registry is what reaches a subagent briefing; a rule that never reached the briefing never reached any executor.
- **Search the record before deciding anything, and record every decision after.** Follow `agentic-dev-core/references/decision-protocol.md`: search -> follow if settled -> scored panel or decision subagent if genuinely novel. A ruling that governs you may have been written an hour ago by a run you never saw; re-deriving it lands somewhere else and creates two contradictory rules. Write every autonomous decision where the NEXT run's Phase 1 will find it, at the moment it is made.

**Read full SKILL.md when**: you are running any phase of a scheduled run, a gate fires, or the briefing tells you to load the full skill.

---

## When to use

Use this skill when a **scheduler, cron, routine, or timed wake-up** starts a session with no human present and a mode argument. That is the entire trigger surface.

| Mode | Selects | Cap | Dispatches to | Writes code | Waits on a human |
| --- | --- | --- | --- | --- | --- |
| `story` | highest-priority genuinely-unblocked user story | **1 per run, hard** | `/sprint-development` | yes | never |
| `bug` | genuinely-unblocked defects, oldest-severest first | **up to 3, strictly sequential** | `/sprint-development` (bug entry point) | yes | never |
| `discovery` | new user stories the app genuinely needs (existing epic, or new epic + its first stories) | **2 new stories per run, hard** | `/product-management` (only after synchronous approval) | **never** | **yes — by design, this one mode's exception; see Autonomy §Discovery's synchronous approval gate** |

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
    discovery_definitions: 2 # NEW user stories drafted + created per run — gated on synchronous chat approval.
  lock_staleness_minutes: 90 # older than this -> abandoned, reclaimable with a logged note.
  automation_gh_account: null # gh identity this run asserts before every push and merge. See Phase 0b step 3.
  migrations: confirm # confirm | autonomous | unrestricted. See "Migration gate".
  isolation: worktree # worktree | in-place. worktree is strongly preferred.
  context_budget:
    handoff_checkpoint: every-phase # every-phase | every-slice. Never "at-end".
    stop_at_remaining_pct: 20 # begin the clean-stop sequence at this much budget left.
  report_channel: null # null | tracker:<ISSUE-KEY> | file:<path>. A plain summary log for all three modes —
    # NOT a mailbox. Discovery's proposal approval is synchronous, in that routine's own chat, never a reply here.
  escalation_log: .session/autonomous-delivery/escalation-log.md # append-only, shared across modes.
```

**Config claims cite the file they came from.** Read the block; never quote a default from this document as project state (`agentic-dev-core/references/orchestration-doctrine.md` -> "Value provenance").

**On `isolation: worktree` and the scheduling app's own "Worktree" option.** Leave the Routine/schedule's own "Worktree" checkbox **unchecked**. This skill self-manages its isolation via the `EnterWorktree` / `ExitWorktree` tools (Phase 0 entry, Phase 4 exit) instead of relying on the scheduler's implicit assignment — that is what makes Phase 4 able to actually close the run's own worktree rather than leaving it on disk for a human to remove. If the scheduler's Worktree option is left checked, the session already starts inside a worktree that `ExitWorktree` cannot see or remove (it only tracks worktrees this session entered itself) — see Hazard 5.10.

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
└── discovery/
    └── pending-decision.md      # DISCOVERY ONLY — an unanswered proposal, re-surfaced verbatim by every
                                  # fire until the operator answers, however many days that takes. See
                                  # Autonomy §Discovery's synchronous approval gate.
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
| Phase 2 — scored judge panel (only when a call is genuinely novel) | Parallel, **model: opus, explicit** | 3-5 independent lenses per `decision-protocol.md` §4 |
| Phase 3 — Execute | Single, in an isolated worktree, **model: sonnet, explicit** | the owning pipeline skill runs its own stages; this skill does not decompose them |
| Phase 3.5 — Per-ticket cleanup | inline | orchestrator only; rescue that ticket's session artifacts, then `git worktree remove` its worktree — immediately, not batched |
| Phase 3 — context checkpoint | inline | orchestrator writes handoff + progress between slices |
| Phase 4 — Close and report | Sequential | close-out per the owning skill, rescue session records, release lock, report, then `ExitWorktree` on the run's OWN worktree |

> **Phase 1's parallelism is the point.** Four evidence sources that disagree is the normal case, and the orchestrator can only notice the disagreement if it sees all four independently. Collapsing them into one agent produces a single reconciled narrative with the contradiction already smoothed away.

> **On any subagent failure**: STOP that mode's run, write the failure into `progress.md` and the escalation log, release the lock, and report. Do NOT auto-retry a failed dispatch more than the pipeline skill's own capped fix-iterate loop allows, and never auto-rollback.

---

## Main flow

```
[scheduler fires: /autonomous-delivery <mode>]  <- session starts in the plain checkout, NOT a worktree
       |                                           (the scheduler's own "Worktree" option is unchecked)
       v
   +--------------------------------+
   | Phase 0a: ENTER ISOLATION       |  inline, FIRST action
   |  - EnterWorktree (if isolation: |
   |    worktree in config)         |
   |  - copy in .env + .session/    |
   |  - CHECK base vs origin/<integr>|
   |    (fresh worktree uses the    |
   |    repo DEFAULT branch; today  |
   |    that IS staging). Realign   |
   |    only if needed, via         |
   |    checkout -B, never reset    |
   +--------------------------------+
       |
       v
   +--------------------------------+
   | Phase 0b: LOCK                  |  inline
   |  - config read + mode validate |
   |  - lock: take / reclaim / exit |
   |  - resume resolution (table)   |
   +--------------------------------+
       |  live lock for this mode -> rescue nothing new, ExitWorktree(keep only if you entered pre-existing
       |                              work; usually remove), EXIT CLEANLY (report, no queue, no wait)
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
       |  nothing genuinely unblocked -> rescue nothing new, close isolation, EXIT CLEANLY (empty run is correct)
       v
   +--------------------------------+
   | Phase 3: EXECUTE               |  Single, isolated worktree, model: sonnet (explicit)
   |  story/bug -> /sprint-development
   |  discovery -> /product-management
   |  - migration gate              |
   |  - handoff as you go           |
   |  - context budget monitor      |
   +--------------------------------+
       |  every ticket -> Phase 3.5 cleanup (rescue + remove that ticket's worktree) before the next
       |  budget exhausted -> PUSH BRANCH, record resume state, stop (this is a SUCCESS)
       v
   +--------------------------------+
   | Phase 4: CLOSE AND REPORT      |  Sequential
   |  - owning skill's close-out    |
   |  - rescue session records      |
   |  - release lock                |
   |  - run report + channel post   |
   |  - copy .session/ back to home |
   |    checkout, then ExitWorktree |
   |    (remove) on the run's OWN   |
   |    worktree                    |
   +--------------------------------+
```

---

## Phase 0 — Enter isolation, then lock

Concurrent routines must not collide, and the collision they must not have is two runs implementing the same ticket into two branches. Before any of that: `story` and `bug` runs need their OWN worktree, entered explicitly, so it can be closed explicitly — a scheduler-assigned worktree cannot be (see the Configuration note on the scheduler's "Worktree" option). `discovery` needs no worktree at all — see §0a.

### 0a. Enter isolation (before touching config, lock, or git state) — `story` / `bug` ONLY

**`discovery` mode skips this whole subsection.** It never writes application code and never creates a git branch — the only things it produces are Jira/tracker content via `/product-management`. A worktree buys it nothing and costs it the one thing its approval gate depends on: `.session/discovery/pending-decision.md` (and the mode lock, and the shared escalation log) must be the SAME file the next fire reads, not a copy made inside a worktree that gets removed before anyone reads it back. `discovery` operates directly in the plain checkout, for its entire run, start to finish. Go straight to §0b.

For `story` and `bug`:

1. **Note the home checkout path** — `pwd` right now, before anything else. This is where `.session/` and reports get rescued back to at Phase 4, and it is NOT recoverable once you've moved (worktree-relative paths only from here on; see Hazard 5.3).
2. **Read `autonomous_delivery.isolation`** from `.agents/project.yaml` (tracked, present in the plain checkout — no worktree needed yet to read it). If `in-place`, skip to §0b.
3. **Check whether you are already inside a worktree** (`pwd` under `.claude/worktrees/`, or the equivalent for this environment). If so, the scheduler's own "Worktree" option was left checked despite the Configuration note above — `EnterWorktree` errors when called from inside an existing worktree session, so do NOT call it. Instead: proceed in-place in this already-assigned worktree, note in the run report that the scheduler's Worktree checkbox needs to be unchecked for this routine, and flag that `ExitWorktree` will NOT be able to close this worktree at Phase 4 (Hazard 5.10) — a human will need to `git worktree remove` it manually afterward. This is a degraded-but-functional path, not a hard failure.
4. **Otherwise, `EnterWorktree`** with no fixed `name` (let it auto-generate — a fixed per-mode name risks a collision with a stale worktree from a crashed prior run; the mode-lock already prevents same-mode overlap, so collision-avoidance here is pure hygiene, not a race guard).
5. **Copy in what a fresh worktree does not carry**: `.env`, and the **whole `.session/` tree** from the home checkout (not just this mode's subfolder — `escalation-log.md` is shared across modes, and Phase 0b's resume table plus decision-protocol's "search the record first" both need it). Without this, the lock/progress/escalation history from every prior run is invisible and Phase 0b's resume table sees a false "fresh run" every single time. This copy is a point-in-time READ snapshot — `story` and `bug` runs may legitimately overlap (locks are per-mode), so treat anything outside your own mode's subfolder as read-only reference, not a value to write back verbatim (see Phase 4 step 3 for why).
6. **Verify the base branch, and realign it if it is wrong.** `EnterWorktree`'s default (`fresh`) branches from `origin/<the repo's default branch>` — whatever `refs/remotes/origin/HEAD` currently points at. **Check it, do not assume it in either direction.** As of 2026-08-06 this repo's default branch IS `staging` (GitHub `default_branch: staging`, local `origin/HEAD -> refs/remotes/origin/staging`), so a fresh worktree already lands on the integration branch and needs no realignment — verified empirically, not inferred. That can change the moment someone flips the default on the host, which is exactly why this is a check rather than a fixed instruction.

   ```bash
   git fetch origin
   git merge-base --is-ancestor origin/<integration-branch> HEAD && echo "base OK" || echo "REALIGN NEEDED"
   ```

   If realignment IS needed:

   ```bash
   git checkout -B <this-worktree-branch> origin/<integration-branch>
   ```

   **Do NOT use `git reset --hard` here.** Critical Rule #13 forbids repo-wide destructive git commands because multiple agent sessions share this working tree, and the call is DENIED by the permission layer — a run that reaches for it stalls at Phase 0a instead of realigning. `git checkout -B` reaches the same state without a destructive discard, and is safe on a brand-new branch precisely because nothing has been committed on it yet. See Hazard 5.10.

### 0b. Lock

1. **Read the rest of the config.** `enabled: false`, or a mode absent from `modes`, ends the run here with a one-line report — copy `.session/` back to the home checkout first if anything in it changed (it shouldn't have, this early), then `ExitWorktree(remove)`. This is not a failure.
2. **Validate the mode** against the three literals `story`, `bug`, `discovery`. Anything else is a fast-fail — never fall back to a default mode.
3. **Assert push identity before anything else, and re-assert it at every point of no return.** A multi-account CLI with the wrong cached identity reads and fetches fine and fails only at the first push or merge, hours later, with a permission error that looks like branch protection. Observing the identity once is not enough — a real run had `saiotest` (correct, repo admin) active at Phase 0 and `elycuracity` (read-only on this repo) active by the time it reached `gh pr merge`, with every step in between succeeding silently because `git push` uses a separate keychain credential that never drifted. Check `gh auth status` against `autonomous_delivery.automation_gh_account` (`.agents/project.yaml`); if the active account is wrong, `gh auth switch --user <account>` before proceeding. **Re-run this exact check again immediately before the FIRST push of the run, and again immediately before ANY merge** — not just here at Phase 0. See Hazard H20.
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

1. Build the candidate set for the mode: `story` -> stories at ready-for-dev; `bug` -> open defects; `discovery` -> new-story or new-epic candidates the app genuinely needs (existing-epic stories, a single urgent story, or a new epic + its first stories — see `discovery`'s prompt for the full source list, including the KATA reference repo).
2. Drop any candidate whose hard blocker is not **merged** by Phase 1's verdict. Log the skip with the reason. A blocked candidate is not an escalation — it is a skip.
3. Drop any candidate that is **already past dev** by live status, regardless of what the queue file claims.
4. **Readiness is not status — but an unresolved question is work, not a rejection.** Read the refinement trail before accepting a candidate; never infer readiness from the status field. A ticket can be moved to ready-for-dev with a declared blocker still open and no comment trail explaining the move. What you do about it depends on WHICH of the two cases you are in, and conflating them is the failure mode this step exists to prevent:
   - **(a) The story went through shift-left, and some questions are open or self-ratified** — unresolved blocking questions, explicitly-disclaimed practice/DRAFT answers, "pending PO sign-off" markers, an AI persona closing its own blocker. **This is NOT a reason to drop the candidate.** Per `CLAUDE.md` Rule #18 and `decision-protocol.md` §5.1, dispatch the decision subagent (`AI Product Owner / Business Analyst`, `AI Tech Lead`, or both), let it score the open questions, publish the attributed rulings to the ticket, resync the cache, and THEN proceed with the candidate. Deciding is the job; waiting is the failure mode.
   - **(b) The story never went through shift-left at all** — no refinement trail, no acceptance criteria, nothing to ratify. **This one genuinely blocks.** It is a QA-authoring gap, not a question, and inventing the refinement yourself is not the fix. Record it for assignment to whoever (human or their agent) runs shift-left, and take the next candidate.
   - A design-contract departure (a decision that diverges from the mockup) additionally needs its `master-design-plan.md` §5 divergence row — and an ADR when architectural — written as part of the ruling, per Critical Rule #15. The subagent produces those; it does not merely assert the departure is fine.
5. **Scope-growth check.** If a candidate carries signals of being larger than a normal pick — high point estimate, no mockup where the design plan expects one, an architectural decision implied by its acceptance criteria, more than one migration — **do not claim it in an unattended run.** Log it as a candidate needing a human-present session, and take the next one. Auto-claiming the largest thing on the board by "pull the next available row" is a measured way to burn a whole run.
6. **Apply the cap**: `story` takes exactly one. `bug` takes up to three and processes them **strictly sequentially**, each fully closed through Phase 4's close-out before the next is claimed. `discovery` recommends at most `discovery_definitions` (default 2) new user stories per run — and never creates any of them without its synchronous approval gate firing first (see Autonomy §Discovery's synchronous approval gate). It never writes application code, regardless of the outcome of that gate.
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
| `discovery` | `/product-management` (its refinement / epic / AC workflows) — **only after the synchronous approval gate resolves `awaiting_reply` -> `resolved`** | the recommendation from Phase 2, the evidence for it, and the operator's go-ahead |

Every dispatch uses the 7-component briefing from `agentic-dev-core/references/briefing-template.md`. Component 7 (Rules) MUST carry the migration gate, the worktree path, the no-rebase-on-pushed-branches rule, and the context-budget stop procedure — a rule that lives only in this file never reaches the executor.

**Every Phase 3 dispatch passes `model: "sonnet"` explicitly.** Do not omit it. The top-level routine session may be running Opus 5 for its own audit/select reasoning; an Agent() call with no `model` override silently inherits that, which is expensive and buys nothing for work that is delegated to `/sprint-development`'s own stages anyway. (The Agent tool's `model` enum is `sonnet | opus | haiku | fable` — there is no versioned `-5` suffix; pass the bare name.)

### Isolation

`isolation: worktree` (the default) means the dispatched agent works in its own git worktree. This is not tidiness: a background subagent writes into its dispatcher's working directory by default, its uncommitted files ride along through every branch switch the dispatcher makes, and it **outlives its dispatcher** — one dispatched shortly before its dispatcher retired went on to finish a slice, push a branch, open a pull request and merge it, with nobody watching. This applies to `story` and `bug` dispatches to `/sprint-development` — both write code and create branches. `discovery`'s dispatch to `/product-management` creates only Jira/tracker content, touches no git branch, and gets no `isolation` override — there is nothing for a worktree to protect there.

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
2. Rescue session records out of the worktree into the main checkout (this run's own
   `.session/<mode>/` subfolder wholesale; APPEND-only into shared `escalation-log.md`
   — never overwrite it, per Phase 4 step 3).
3. Append the resume state to handoff.md: exact branch, exact tip SHA, which pull
   requests exist and their state, what is done, what is not, and the NEXT CONCRETE
   COMMAND. Written so a stranger could resume from it cold.
4. Append the final progress.md entry.
5. Release the lock.
6. Report.
7. Close every worktree this run leaves behind — a budget-exhausted stop is not an
   exemption from Phase 3.5 / Phase 4's cleanup, it is one more reason to need it. If a
   dispatched agent's own budget is what ran out (not the orchestrator's), the AGENT does
   NOT remove its own worktree — it stops after step 6 above and reports back; the
   ORCHESTRATOR runs Phase 3.5 cleanup on it in the usual way once the report is read and
   the push is confirmed. If the ORCHESTRATOR's own budget is what ran out: remove any
   already-closed dispatched-agent worktrees still lingering (there should be none if
   Phase 3.5 was followed), then close the run's OWN worktree last, via
   `ExitWorktree(remove)`, as the final action — never leave it on disk "because the run
   ended early." An early stop is still a clean stop, and A24 does not have a budget
   exception.
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
  novel security / irreversible / operator-reserved?
        |  no                                  |  yes
        v                                      v
  is it product/business/functional?       ESCALATE (informed)
        |  no            |  yes                |
        v                v                     |
  SCORED JUDGE     DISPATCH DECISION           |
  PANEL (3-5)      SUBAGENT (AI PO/BA          |
        |          and/or AI Tech Lead)        |
        |          scored, then PUBLISH        |
        |          ATTRIBUTED to the ticket    |
        |                |                     |
        +----> WRITE IT DOWN <-----------------+
```

**Product is NOT an escalation category in this project** (`CLAUDE.md` Rule #18 — Bunkai TMS has no human PO by default; the AI holds the best product and technical knowledge here because it can read the whole context surface). See `decision-protocol.md` §5.1 for the two role profiles, the mandatory scored method, and the attribution format.

For an unattended run, four amplifications:

- **The record to search FIRST is `.session/autonomous-delivery/escalation-log.md`, read in full, plus `.context/ADR/` and the ticket's siblings.** Search for the SHAPE of the question, not its wording. A ruling that governs you may have been written an hour ago by a run you never saw.
- **Escalating is expensive here in a way it is not interactively.** There is nobody to answer. An escalation ends the run's forward progress until the next human touch, so an over-stop costs a whole scheduled slot. The escalate-only categories are exhaustive and product is NOT among them: a genuinely NEW security posture (applying an already-ratified pattern is implementation), irreversible or destructive actions, and anything the operator explicitly reserved.
- **An open product question is work to do, not a reason to stop.** Dispatch the decision subagent per `decision-protocol.md` §5.1 — `AI Product Owner / Business Analyst` for product/business/functional/scope/UX-copy/design-intent, `AI Tech Lead` for schema/index/API-contract/auth/performance/migration-shape, both when the call is joint. It scores 2-4 candidate answers against explicit criteria, publishes the winner to the ticket under an attributed heading, and the run CONTINUES. Dispatch it with `model: "opus"` explicitly, same rule as the judge panel. The two blockers that survive this: a real dependency (git-ancestry-verified), and a story that never went through shift-left at all (a QA-authoring gap — record it for assignment, never invent the refinement).
- **Record every autonomous decision where the next run's Phase 1 will find it** — the escalation log, at the moment the decision is made. A decision that is not recorded did not happen, and the next run will re-derive it and land somewhere else.
- **Every scored judge panel dispatch passes `model: "opus"` explicitly**, same rule and same reason as Phase 3's execution dispatches (see Phase 3 §Isolation) — a panel's independent lenses are exactly the kind of judgment call the stronger model is for, and an omitted override just inherits whatever the orchestrator happens to be running.

**Escalation, when it does fire, is a clean stop, not a hang.** Write the escalation entry (what happened, why it is this category, what the human needs to decide, what the downstream cost of waiting is), push anything unpushed, release the lock, and end the run. Never park a scheduled session waiting on an answer that cannot arrive.

### Exception — Discovery's synchronous approval gate

Every discovery-mode recommendation is a product decision (`decision-protocol.md` §5 category 1) and always escalates — that part is unchanged, and it was always true even under the old async-mailbox design. What changed, by explicit operator instruction, is HOW it escalates and how PATIENT that escalation is allowed to be — and this exception is scoped to discovery's approval gate alone. Story and bug mode escalations are untouched: they remain a clean stop, push-and-end, never a wait, exactly as above.

For discovery specifically: the operator has confirmed they will check in on that routine's own chat session at any point during the day (or on a later day) to answer, so the run is allowed to end its turn on an open question and sit there — rather than being forced to abandon and report like every other escalation in this skill.

This is exactly why `discovery` skips worktree isolation entirely (Phase 0a) — `pending-decision.md` below must be the one real file the next fire reads, not a copy trapped inside a worktree that gets removed before that fire ever sees it.

**Mechanics**, once a recommendation is settled (existing-epic story/stories, a single urgent story, or a new epic + its first stories):

1. Write the recommendation to `.session/autonomous-delivery/discovery/pending-decision.md` — the proposal itself, the rationale, what it depends on — with `status: awaiting_reply`.
2. Release the `discovery` mode lock immediately. The operator may not answer today, and the lock must not block tomorrow's fire from re-surfacing the same question — a discovery run sitting on an unanswered question is not "in progress" in the sense the lock exists to protect.
3. Ask the question directly in that session's chat, plainly, and end the turn there. Do not create anything yet.

**On a later fire of discovery mode** (same day or a subsequent one): read `pending-decision.md` FIRST, before any fresh analysis.
- `status: awaiting_reply` -> re-state the EXACT same recommendation, ask again, end the turn again. Never regenerate a new proposal on top of one still pending — that is precisely the backlog-flooding this exception exists to avoid, and it is why the file, not a fresh Jira mailbox comment, is the source of truth here.
- `status: resolved` (or the file absent) -> proceed with a normal fresh analysis.

**If the operator answers within the same open session** — whether moments later or hours later that same day — resume immediately: dispatch `/product-management` to actually create what was approved, mark `pending-decision.md` `resolved` with a one-line note of what got created, and continue to Phase 4 as normal.

---

## Phase 4 — Close and report

Sequential, and the order matters because each step can be lost by the one before it.

1. **Complete the owning skill's own close-out.** For `/sprint-development` that is its Stage 4 tail: verify the tracker's auto-transition actually fired (it is inconsistent — check live, every ticket, every type), reassign the story to its shift-left QA owner and **verify the assignee actually changed** (some tracker CLI paths report success while clearing the field), post the handoff comment, and sync the tracker cache. This skill does not reimplement any of it; it verifies it happened.
2. **Confirm every dispatched-agent worktree from this run is already gone.** If Phase 3.5 was followed per ticket, this is a no-op check. If any are still on disk (a mid-run interruption skipped the cleanup step), rescue and remove them now, per ticket, before continuing — do not carry them into the archive step below by accident.
3. **Rescue session records BEFORE the run's OWN worktree is removed — surgically, never a blind tree overwrite.** Session directories are gitignored and live inside the worktree; removing the worktree destroys them. Copy THIS RUN's own `.session/autonomous-delivery/<mode>/` subfolder back to the `home_checkout` path wholesale (nothing else writes there, so a full overwrite is safe). For `escalation-log.md` (shared across modes), APPEND only the entries THIS run itself added — never overwrite the whole file with your worktree's copy. `story` and `bug` runs may overlap by design (locks are per-mode); a sibling run may have appended its own entries to the home checkout's live `escalation-log.md` while this run was still executing, and a blind overwrite would silently erase them. Writing a good handoff and then losing the underlying records — your own or a sibling's — is the exact failure this ordering, and this append-only rule, exist to prevent.
4. **Release the lock** — delete `lock.json` (in the copy now sitting at `home_checkout`, since that is what survives). A run that escalated or stopped on budget releases it too; a lock is held by a running session, not by an unfinished ticket.
5. **Write the run report** to `.session/autonomous-delivery/<mode>/run-report.md` per `references/run-report-format.md` §1. Include the empty-run case: what was considered, what was dropped, why.
6. **Post the summary** to `report_channel` when one is configured. `null` means the file is the report — do not improvise a destination.
7. **Archive** the session directory (now at `home_checkout`) per `session-management.md` §8 and call the memory session summary with the archive path included.
8. **Close the run's OWN worktree.** If this run entered one via `EnterWorktree` in Phase 0a (`story`/`bug` only — `discovery` never enters one, so this step is a no-op for it), call `ExitWorktree` with `action: "remove"` now that everything durable has been copied out and the branch (if any) is pushed. This is the step that makes the run leave nothing behind — a routine that ships two pull requests and then abandons its own worktree on disk has not actually finished cleanly. `ExitWorktree(remove)` **refuses** when the worktree holds uncommitted files or commits not on the original branch unless `discard_changes: true` — do not pass that flag reflexively to force it through; a refusal here means something is genuinely uncommitted that step 3 should have already rescued, which is itself worth a line in the run report. If the branch genuinely cannot be pushed (a real failure, not the normal case), use `action: "keep"` instead and name the exact worktree path and branch in the run report so a human can recover it — never force a discard to make the cleanup step "succeed."

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
| H15 | Session records die with the worktree that held them | Rescue before removal, Phase 4 step 3 |
| H16 | The scheduler's own "Worktree" option assigns a worktree `ExitWorktree` cannot see or close (it only tracks worktrees THIS session entered via `EnterWorktree`) | Leave that option unchecked; the run enters and exits its own isolation explicitly, Phase 0a / Phase 4 step 8 |
| H17 | A fresh `EnterWorktree` branches from the repo's default branch, which is not guaranteed to be the integration branch this project works against (today it IS — `origin/HEAD -> staging`) | Fetch + `git merge-base --is-ancestor` check after entry; realign with `git checkout -B`, NEVER `git reset --hard` (Rule #13 denies it), Phase 0a step 6 |
| H18 | A dispatched agent's worktree is never auto-removed once it holds changes — that is deliberate on the Agent tool's part | Explicit `git worktree remove` per ticket, immediately, Phase 3.5 |
| H19 | `discovery`'s synchronous approval gate re-proposes on top of an already-pending, unanswered recommendation, flooding the backlog | Read `pending-decision.md` FIRST; `awaiting_reply` re-surfaces the same recommendation verbatim, never a new one |
| H20 | A multi-account `gh` CLI's active identity silently flips between Phase 0 and merge time — `git push` keeps working under a separate keychain credential, so the failure surfaces only at `gh pr merge` with a permission error that looks like branch protection | Assert `autonomous_delivery.automation_gh_account`, `gh auth switch --user <account>` if wrong — at Phase 0, again before the first push, and again before any merge |

---

## Anti-patterns — NEVER do these

- **A1.** NEVER advance a dependency on a tracker status. Only `git merge-base --is-ancestor` against the integration branch decides whether something shipped.
- **A2.** NEVER queue, sleep-and-retry, or proceed anyway when a live lock exists for your mode. Exit cleanly; the next scheduled fire is the retry.
- **A3.** NEVER take a second story in one run. The cap is one, it is hard, and it is derived from measurement rather than caution.
- **A4.** NEVER start the next bug before the current one is fully closed through Phase 4.
- **A5.** NEVER write application code in `discovery` mode. It analyzes, proposes, and — only after the operator's explicit go-ahead given live in that session's chat — defines and creates the approved epic/stories via `/product-management`. Code is always another mode's job.
- **A6.** NEVER defer the handoff to the end of the run. Write it as you go, or you will not write it.
- **A7.** NEVER stop on a low budget with unpushed commits. Push first, then record, then stop.
- **A8.** NEVER apply a destructive migration under `confirm` or `autonomous` without approval — `unrestricted` is the only setting that covers it. And under EVERY setting, including `unrestricted`: never apply a migration, additive or destructive, merely to clear a local error — that is a finding, not a step.
- **A9.** NEVER take a migration number from a local directory listing.
- **A10.** NEVER commit generated output from a shared live instance without reading it first.
- **A11.** NEVER rebase, force-push, amend, or otherwise rewrite pushed history, and never route around a denied operation by finding another path to the same effect. A denial is a signal to stop and name the exact permission needed, never a puzzle to solve.
- **A12.** NEVER modify your own permission settings, allowlists, or configuration to restore your own capability.
- **A13.** NEVER improvise an identity, credential, or account when the declared one is missing. Fail closed and report. A worktree without its environment file is the most common way this temptation arises.
- **A14.** NEVER select work by "pull the next available row" without the scope-growth check. Large or novel work belongs in a human-present session.
- **A15.** NEVER manufacture a non-empty run. If nothing is genuinely unblocked, report that.
- **A16.** NEVER re-ask a settled question, and never treat an answer obtained without the prior ruling in front of the human as a supersession. It is an uninformed re-ask and it overrides nothing.
- **A17.** NEVER escalate a technical call this run is equipped to settle. There is nobody to answer, and the stop costs a whole scheduled slot.
- **A17b.** NEVER escalate, park, or drop a candidate over a PRODUCT, business, functional, scope or design-intent question. Rule #18 makes that a decision to dispatch, score, publish attributed to the ticket, and move on. The only survivors are a git-verified dependency and a story that never had shift-left at all.
- **A17c.** NEVER publish an AI decision styled as human PO sign-off, and never leave a ruling unattributed. Every published decision names its deciding profile in the heading. Unattributed or human-looking rulings are exactly what Rule #18 exists to end — this repo has already logged a non-human account closing its own blocker and moving the ticket to Ready For Dev twenty-four minutes later.
- **A18.** NEVER leave an escalation parked waiting for a reply, for `story` or `bug` mode. Write the entry, push, release the lock, end the run. (`discovery`'s approval gate is the one explicit, scoped exception to this — see Autonomy §Discovery's synchronous approval gate. Do not read that exception as license to park anywhere else.)
- **A19.** NEVER remove a worktree before rescuing the session records inside it.
- **A20.** NEVER edit another run's board row (except to claim an unclaimed one per protocol), branch, or worktree.
- **A21.** NEVER include AI-attribution lines in commits, pull request bodies, or tracker comments.
- **A22.** NEVER reimplement a stage that `/sprint-development` or `/product-management` owns. Dispatch it.
- **A23.** NEVER leave a dispatched agent's worktree on disk once its ticket is closed (merged, escalated-with-push, or gate-stopped-with-push). Remove it immediately in Phase 3.5, per ticket — never batch this at Phase 4.
- **A24.** NEVER end a run without closing its OWN worktree (`ExitWorktree remove`) once the branch is pushed or there was nothing to push. A routine that finishes its work but abandons its own worktree has not finished cleanly.
- **A25.** NEVER omit an explicit `model` override on a Phase 2 judge-panel or Phase 3 execution dispatch. An omitted model silently inherits the orchestrator's, which may be a stronger and pricier model than mechanical execution needs.
- **A26.** NEVER trust a fresh `EnterWorktree`'s default base without checking it, and never assume it is wrong either — verify with `git merge-base --is-ancestor origin/<integration-branch> HEAD` before realigning. When realignment IS needed, use `git checkout -B`; NEVER `git reset --hard`, which Critical Rule #13 forbids and the permission layer denies.

---

## Pre-flight checklist

- [ ] Scheduler's own "Worktree" option left unchecked; this run entered its own isolation via `EnterWorktree` in Phase 0a (if `isolation: worktree`)
- [ ] `.env` and the whole `.session/` tree copied in from the home checkout immediately after entry; base VERIFIED against `origin/<integration-branch>` and realigned with `git checkout -B` only if the check failed (never `git reset --hard`)
- [ ] Mode is one of `story` / `bug` / `discovery`, present in `autonomous_delivery.modes`, and `enabled: true`
- [ ] Push identity asserted against `autonomous_delivery.automation_gh_account` (`gh auth switch --user <account>` if wrong) at Phase 0, again immediately before the first push, and again immediately before any merge — not merely observed once
- [ ] Lock taken, reclaimed-with-a-logged-note, or the run exited cleanly on a live lock
- [ ] Resume resolved deterministically per the unattended table; a missing remote branch escalated rather than redone
- [ ] `git fetch` run before every ancestry and fast-forward check
- [ ] Ancestor check run on every contributing merge commit of every dependency
- [ ] Merged-vs-claimed table produced; every tracker/git discrepancy written to the escalation log with evidence
- [ ] Live migration ledger queried; queue/board/claim file read in full; both protection endpoints checked
- [ ] Candidate's refinement trail read — readiness established, not inferred from status
- [ ] Open product/business/functional questions on the candidate DECIDED via a dispatched `AI PO/BA` (and/or `AI Tech Lead`) subagent with scored alternatives, published to the ticket under an attributed heading, cache resynced — not escalated, not used as a reason to drop the candidate
- [ ] Only two blocker types accepted: a git-ancestry-verified dependency, and a story that never went through shift-left at all (recorded for assignment, refinement NOT invented)
- [ ] Scope-growth check applied; oversized or novel work deferred to a human-present session
- [ ] Cap respected (`story` 1, `bug` 3 sequential, `discovery` up to `discovery_definitions` new stories, never code, never created before the approval gate fires)
- [ ] Claim written, file re-read, and the row conceded if contested
- [ ] Dispatched agent given an isolated worktree, its environment file copied in, briefing component 7 carrying the migration gate + budget stop procedure, and an explicit `model` override (sonnet for execution, opus for a judge panel)
- [ ] Migration gate honoured per the configured level (`confirm` / `autonomous` / `unrestricted`); live definition re-read and diffed after every apply; never applied merely to clear a local error
- [ ] At least one assertion exercises a real production write path
- [ ] Handoff appended at every phase boundary — never deferred
- [ ] On low budget: branch pushed FIRST, resume state recorded, then stop
- [ ] Every dispatched agent's worktree removed immediately after its ticket closes (Phase 3.5) — none carried batched into Phase 4
- [ ] Owning skill's close-out verified (auto-transition fired, assignee actually changed)
- [ ] Session records rescued out of the worktree before removal
- [ ] Lock released, run report written, channel posted if configured, session archived
- [ ] This run's OWN worktree closed via `ExitWorktree(remove)` once its branch (if any) is pushed — nothing left on disk
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
- **Choosing what to build** — the strategic "which epic next" call. Note this is NOT the same as answering an open product question ON a selected ticket: that one is decided in-run per `decision-protocol.md` §5.1, never escalated.

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
