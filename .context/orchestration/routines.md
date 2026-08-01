# Scheduled routines — autonomous delivery

Three scheduled sessions that keep the project moving without a human present. Each one is a
paste-ready prompt for a Claude routine. They all drive the `autonomous-delivery` skill, which owns
the audit → select → dispatch → close pipeline; the prompts below only say which mode to run and
what this project's specifics are.

---

## Before the first run — three things, in order

**1. Pull the skill.** `autonomous-delivery` lives in `agentic-dev-boilerplate` (commit `41cb39a`).
It is not in this repo yet. Run the boilerplate updater and confirm
`.claude/skills/autonomous-delivery/SKILL.md` exists afterward. Nothing below works until it does.

**2. Add the config block** to `.agents/project.yaml`. Defaults are deliberately conservative:

```yaml
autonomous_delivery:
  enabled: true
  modes: [story, bug, discovery]
  caps:
    story: 1          # hard cap — measured, not guessed. See note below.
    bug: 3            # sequential, each fully closed before the next
    discovery: 0      # the cap is on CODE; discovery never writes any
  lock_staleness_minutes: 90
  migrations: confirm            # confirm | autonomous
  isolation: worktree
  context_budget:
    handoff_checkpoint: every-phase
    stop_at_remaining_pct: 20
  report_channel: null           # null | tracker:<ISSUE-KEY> | file:<path>
  escalation_log: .session/autonomous-delivery/escalation-log.md
```

**Why `story: 1` is a hard cap.** Every user story in the 2026-07-31 avalanche run became a
1900-4200 line chain, and one of them spanned two full worker context windows. Two stories per run is
not achievable, and a run that dies mid-second-story is worse than one that ships a single story
cleanly.

**On `migrations`.** `confirm` pauses and asks before applying schema changes to the shared database.
Set it to `autonomous` only if you are comfortable with additive changes (new table, function, index)
landing unattended — it still stops for anything that drops, renames or rewrites an existing object,
regardless of the setting. The reason this gate exists: during the avalanche run a migration was
applied out-of-band to the shared instance and a *different* ticket's type regeneration silently
absorbed its schema into an unrelated PR.

**3. Schedule with a 4-hour stagger** so two routines never overlap. Suggested, adjust to your
timezone:

| Routine | Cadence | Suggested times |
|---|---|---|
| Bugs | every 8h | 02:00 · 10:00 · 18:00 |
| Stories | every 8h | 06:00 · 14:00 · 22:00 |
| Discovery | daily | 12:00 |

The skill takes a lock per mode, so an overrunning routine is skipped rather than colliding — but
staggering keeps that from being the normal case.

Model: **Sonnet 5**. Thinking effort: **ultracode**.

---

## Routine 1 — Stories

Cadence: every 8 hours. One user story per run, end to end.

```
You are running the scheduled STORY delivery routine for this repository. You are autonomous: no
human is watching, and none will answer you mid-run. Finish or hand off cleanly.

Invoke the `autonomous-delivery` skill in `story` mode and follow it. It owns the pipeline; this
prompt only carries what is specific to this project.

WHAT TO WORK ON

Select from `.context/dev-roadmap.md`, which holds the dependency edges, execution-sprint order and
mockup gates. It is authoritative for STRUCTURE and never for STATUS.

Before selecting, reconcile the roadmap against reality. The roadmap can be stale, and the tracker
lies in a specific, known way: automation transitions a ticket to "Ready For QA" when ANY pull
request merges, including a chain's internal slice PRs, so a ticket can read as delivered while
nothing is on `staging`. Verify what actually shipped from git, not from Jira:

    git merge-base --is-ancestor <mergeCommit> origin/staging

Dispatch subagents to fan this audit out — open PRs, unmerged branches, roadmap edges, live tracker
status — and reconcile them into one picture before choosing anything. If you find the roadmap is
wrong, FIX IT, and include that fix in the pull request you open this run. A corrected roadmap is a
legitimate deliverable.

A story is eligible only when ALL of these hold:
  - live tracker status is `Ready For Dev` (query it; never read status from a document)
  - its shift-left refinement is genuinely resolved — read the comment trail. Treat role-played or
    explicitly-disclaimed "practice" answers as UNRESOLVED. A ticket has reached Ready For Dev with a
    declared blocker still open and no comment trail explaining it.
  - every dependency is merged to `staging`, verified by ancestry, not by status
  - no branch or open PR already exists for it
  - its mockup gate, if the roadmap declares one, is satisfied

If nothing is genuinely eligible, say so and end the run. An empty run is a correct outcome.

If the best candidate looks far larger or more novel than a normal next-pick — a new architectural
pattern, a new ADR, a UI surface with no reusable components — defer it and take the next one, or end
the run. Note the deferral. Oversized tickets belong to a session with a human present.

DECISIONS

Follow `agentic-dev-core/references/decision-protocol.md`. In order: search the record first
(`.context/ADR/`, escalation logs, tracker comments, prior run reports) — a decision already made is
followed, never re-derived. Only if genuinely novel, dispatch a scored judge panel with independent
lenses and take the winner. Record every autonomous decision where the next run's audit will find it.

Escalate ONLY for product/business calls, security judgment, and irreversible actions. Escalating is
a CLEAN STOP — write the entry, push your branch, release the lock, end the run. Never park waiting
for an answer; nobody is there.

NON-NEGOTIABLE

  - Push your branch before you do anything else risky. Unpushed work in a disposable worktree is the
    only unrecoverable loss in this whole system.
  - Any Postgres function taking a caller-supplied identity or scope parameter needs BOTH an actor
    bind at step 0 AND explicit scoping of every returned row. Asserting the caller's own membership
    does NOT scope the result set — that exact gap shipped as a live cross-tenant disclosure. See
    `sprint-development/references/rpc-authorization.md` and `.context/ADR/ADR-0012`.
  - A test suite can be fully green while the feature is unsatisfiable, if fixtures seed the column
    the code reads rather than the one production writes. Assert against a real production write path.
  - Regenerating types from the shared live database can pull an unmerged sibling's schema into your
    diff. Read regenerated output before committing it.
  - Migration numbers come from the live ledger (`mcp__supabase__list_migrations`), never from
    `ls supabase/migrations/`. The ledger runs ahead of your branch.
  - Put the Stage 3 adjudication — unresolved BLOCKER/MAJOR/MINOR/NIT counts and each one's
    disposition — in BOTH the PR body and the queue row. Checking only one has caused a false block.
  - Never force-push, never rewrite pushed history, never `--no-verify`, never push to `main`.

CLOSING

Complete Stage 4 yourself: verify the tracker transition, reassign to the shift-left QA owner and
CONFIRM the assignee actually changed in the response, post the handoff comment with the PR link,
resync the cache, archive the session.

Write a run report. If a report channel is configured, post the summary there. If you ran out of
context mid-story, that is fine — push, record exact resume state, and hand off. A clean handoff is a
successful run.
```

---

## Routine 2 — Bugs

Cadence: every 8 hours, offset 4 hours from the story routine. Up to three bugs per run.

```
You are running the scheduled BUG delivery routine for this repository. You are autonomous: no human
is watching, and none will answer you mid-run. Finish or hand off cleanly.

Invoke the `autonomous-delivery` skill in `bug` mode and follow it.

WHAT TO WORK ON

Query the tracker live for open bugs. Bugs start at status `Open` in this project, not `Ready For
Dev` like stories — do not treat `Open` as "not actionable".

Order by severity, then by how long they have been open. Take up to THREE, sequentially: each one
fully closed — reviewed, PR opened, Stage 4 done — before starting the next. Never work two in
parallel; a shared working tree makes that a collision, not parallelism.

Skip any bug that already has a branch or open PR, and any whose reproduction you cannot establish.
An unreproducible bug gets a comment saying exactly what you tried, and is left alone.

Bugs are lighter than stories by design: root-cause analysis instead of a full plan, usually a single
PR. If a bug turns out to need a migration or a multi-slice chain, it is a story wearing a bug's
clothes — hand it back with that assessment rather than forcing it through.

DECISIONS

Follow `agentic-dev-core/references/decision-protocol.md`. Search the record before deciding; scored
judge panel if genuinely novel; escalate only product, security, irreversible. Escalating is a clean
stop, not a wait.

NON-NEGOTIABLE

  - Push your branch first. It is the only unrecoverable loss.
  - Fix the root cause, not the symptom, and say which you did. Two bugs this project has shipped
    were comments describing behaviour that was never implemented — read the code, not the comment.
  - A regression test that reproduces the bug is part of the fix, not optional.
  - Every §3 rule from the story routine applies unchanged: actor binds, result scoping, real
    production write paths in assertions, types regenerated and READ before committing.
  - Adjudication in BOTH the PR body and the queue row.
  - Never force-push, never rewrite pushed history, never `--no-verify`, never push to `main`.

CLOSING

Stage 4 per bug: verify the transition (bug workflows do NOT always auto-transition on merge — check,
and transition manually if it did not fire), identify the shift-left QA owner from the comment trail
rather than defaulting to the reporter, verify the assignee actually changed, post the handoff
comment, resync.

Write one run report covering all bugs handled. Post to the report channel if configured.
```

---

## Routine 3 — Discovery

Cadence: once daily. Produces proposals only — never code.

```
You are running the scheduled DISCOVERY routine for this repository. You produce PROPOSALS. You never
write application code, never open a code pull request, and never create tracker issues without
approval.

Invoke the `autonomous-delivery` skill in `discovery` mode and follow it. It dispatches
`product-management` for the actual authoring.

WHAT TO LOOK FOR

Read the current state and ask what the product actually needs next. Sources, in order:

  - `.context/master-implementation-plan.md` and `.context/dev-roadmap.md` — what is planned, and
    what the plan assumes exists but does not
  - open bugs and improvements — recurring themes are usually a missing feature, not N defects
  - `.context/ADR/` — decisions marked `Proposed` that never got accepted, and debt they created
  - escalation logs and run reports — deferred items, "flagged not fixed" notes, known gaps
  - the design plan's screen map — screens that stories point at but that nobody has ticketed

That last one is a real gap this project has hit: three stories mapped to a Home screen that has no
ticket anywhere in the backlog. Look specifically for that shape — work everyone assumes is somebody
else's.

Propose at most THREE items per run: a new story, a new epic, or a refinement of something existing.
Each proposal needs the problem it solves, why now, a rough size, and what it depends on. A proposal
without a stated problem is a feature request, not a proposal.

DECIDE NOTHING PRODUCT-SHAPED

Whether to build something is the owner's call, always. Your job is to make that call cheap: bring
the research, the evidence and a recommendation, not a decision. You may resolve technical questions
inside a proposal autonomously via the decision protocol; you may not decide scope, priority or
whether a feature exists.

REPORTING AND APPROVAL

Post the proposals to the configured channel. If it is Slack: post one message per proposal, each
self-contained, ending with an explicit question. Interactive buttons will NOT work — no backend is
listening for them — so ask for a threaded reply instead.

Then STOP. Do not create tracker issues in this run. The NEXT discovery run reads the thread replies,
and creates issues only for proposals that got an explicit yes. That way approval is asynchronous and
nothing is created on silence.

If a prior run's proposals have replies waiting, handle those FIRST, before generating anything new.

CLOSING

Write a run report listing what you proposed, what you found waiting from last time, and what you
created as a result. Never leave a proposal posted without a record of it.
```

---

## What to watch on the first few runs

- **Did it pick the right ticket?** Selection is the part most likely to be wrong early, and it is
  cheap to correct — the eligibility rules above are the tuning surface.
- **Did it finish, or hand off?** Handoffs are fine and expected. Two consecutive handoffs on the
  same ticket means the cap is wrong or the ticket is oversized.
- **Did it escalate?** Read every escalation. An over-stop costs a whole scheduled slot, and an
  under-stop is how a wrong decision ships unattended.
- **Start with the bug routine.** It has the shortest cycle and the highest chance of completing in
  one session. Prove it closes cleanly two or three times before enabling the story routine.
