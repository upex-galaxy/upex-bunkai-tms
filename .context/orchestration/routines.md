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
    story: 1                 # hard cap — measured, not guessed. See note below.
    bug: 3                   # sequential, each fully closed before the next
    discovery: 0              # application CODE cap — always zero, discovery never writes code
    discovery_definitions: 2  # NEW user stories drafted + created per run, UNATTENDED; operator vetoes after
  lock_staleness_minutes: 90
  migrations: confirm            # confirm | autonomous
  isolation: worktree
  context_budget:
    handoff_checkpoint: every-phase
    stop_at_remaining_pct: 20
  report_channel: tracker:BK-261 # plain run-summary log, all 3 routines. NOT a mailbox — see "THE APPROVAL
                                 # GATE" inside Routine 3's prompt below; approval happens live in that chat.
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

**3. Uncheck each Routine's "Worktree" option.** The skill now manages its own isolation —
`EnterWorktree` in Phase 0a, `ExitWorktree(remove)` in Phase 4 — instead of relying on the scheduler's
implicit assignment. This is deliberate, not an oversight: a worktree the scheduler assigns is one
`ExitWorktree` cannot see or close (it only tracks worktrees the session entered itself), so leaving
the option checked guarantees a dangling worktree on every run that commits anything. See
`autonomous-delivery/SKILL.md` Phase 0a / Phase 4 and Hazard 5.10.

**4. Schedule with a 4-hour stagger** so two routines never overlap. Suggested, adjust to your
timezone:

| Routine | Cadence | Suggested times |
|---|---|---|
| Bugs | every 8h | 02:00 · 10:00 · 18:00 |
| Stories | every 8h | 06:00 · 14:00 · 22:00 |
| Story Creation (discovery) | daily | 12:00 |

The skill takes a lock per mode, so an overrunning routine is skipped rather than colliding — but
staggering keeps that from being the normal case.

**Model split.** Set the routine's own model to **Opus 5** — that is the model doing the audit/select
reasoning (Phase 0-2) inline, and it is where contradictory evidence and dependency judgment calls
actually benefit from the stronger model. Every subagent the routine DISPATCHES (Phase 3 execution,
and any Phase 2 judge panel) is pinned to **Sonnet 5** explicitly by the skill itself, regardless of
what the routine session is running — mechanical execution and root-cause work does not need Opus, and
letting it inherit the orchestrator's model by omission is pure cost with no upside. You do not have to
do anything to get this split beyond picking Opus 5 for the routine; the `model` override on every
dispatch is the skill's job (`autonomous-delivery/SKILL.md`'s `model_preferences` block). Thinking
effort: **ultracode**.

---

## `BK-261` is a plain report log, not a mailbox

All three routines post their run summaries to `BK-261` (the `report_channel`). That is its entire
role now. There is no reply-parsing protocol here anymore, no proposal header, no async
approve/reject-by-comment cycle. Since 2026-08-18 Discovery does not seek approval at all: it creates
what it decides and posts the keys here, and the operator vetoes by closing or deleting the ticket
(see "Routine 3" below). Nobody should reply to a `BK-261` comment
expecting a routine to read it; nothing here is ever waited on.

(Earlier revisions of this document had Discovery post pending proposals to `BK-261` with a
machine-readable header and have Stories/Bugs "drain" verdicts from replies on their next run. That
design is retired — the operator found watching a routine's own chat and answering directly simpler
than round-tripping through Jira comments. If you find a stray `[PROPOSAL P-...]`-headed comment from
before this change, it is historical; it is not read by anything anymore.)

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
  - **Merge with `gh pr merge <n> --merge`. NEVER `--squash`, never `--rebase`.** The skill's Stage 4
    walkthrough shows `--squash`; this repo's ruleset sets `allowed_merge_methods: ["merge"]`, so a
    squash is rejected by the host and your Stage 4 fails at the last step. `--admin` is not needed:
    `required_approving_review_count` is 0.
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

Query the tracker live. This project calls a defect THREE different things, and all three are in
scope with the same workflow — they are categories, not different processes:

    project = BK AND issuetype in (Bug, Defect, Improvement) AND statusCategory != Done

Do NOT filter on `issuetype = Bug` alone. That silently drops two thirds of the surface. `Improvement`
in particular reads like a feature request but is used here for defects of degree — something that
works but works wrongly.

These start at status `Open`, not `Ready For Dev` like stories. Do not read `Open` as "not
actionable"; for this issue class it is the normal starting state.

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
  - **Merge with `gh pr merge <n> --merge`. NEVER `--squash`, never `--rebase`.** The skill's Stage 4
    walkthrough shows `--squash`; this repo's ruleset sets `allowed_merge_methods: ["merge"]`, so a
    squash is rejected by the host and your Stage 4 fails at the last step. `--admin` is not needed:
    `required_approving_review_count` is 0.
  - Never force-push, never rewrite pushed history, never `--no-verify`, never push to `main`.

CLOSING

Stage 4 per bug: verify the transition (bug workflows do NOT always auto-transition on merge — check,
and transition manually if it did not fire), identify the shift-left QA owner from the comment trail
rather than defaulting to the reporter, verify the assignee actually changed, post the handoff
comment, resync.

Write one run report covering all bugs handled. Post to the report channel if configured.
```

---

## Routine 3 — Story Creation

Cadence: once daily. Fully unattended, same as the other two, since 2026-08-18: it creates what it
decides and the operator vetoes afterwards by closing or deleting the ticket. It never writes
application code and never opens a PR; the only artifacts it ever creates are epics and user stories.

```
You are running the scheduled STORY-CREATION routine for this repository (mode: discovery). Like the
other two routines, you are AUTONOMOUS: no human is watching, none will answer you mid-run, and you
never wait for one. You decide what the backlog needs, you create it, and you report what you created
so the operator can veto it afterwards at their leisure. You never write application code in any
branch and never open a pull request — the only artifacts you ever create are epics and user stories.

Invoke the `autonomous-delivery` skill in `discovery` mode and follow it. It dispatches
`product-management` for the actual authoring.

FIRST: READ WHAT PRIOR RUNS ALREADY CREATED

Read `.session/autonomous-delivery/discovery/created-log.md` — the append-only record of every story
and epic this routine has created, with the date, the run session id, and the one-line reason. It
exists for exactly one purpose: so you never re-create, re-propose, or re-argue something a prior run
already put in the backlog. Cross-check every candidate you are about to create against it, and
against the live tracker, before creating anything.

An entry in that log that the operator has since CLOSED or DELETED in the tracker is a veto. Treat it
as a standing ruling: do not re-create that story, and do not create a near-identical restatement of
it under a different title. Record in your run report that you found a vetoed entry and what you
concluded from it — a veto is information about what this project does not want, and it is worth more
than the ticket it removed.

If the log does not exist yet, create it on your first write.

SECOND: FETCH BEFORE YOU ANALYZE — NEVER TRUST THE WORKING TREE

Your first action after the created-log check, before reading a single planning doc, is
`git fetch origin` followed by `git rev-list --count HEAD..origin/staging`. This mode runs in the
plain checkout and never pulls (other sessions may share this working tree), so the files on disk
are whatever the last session left behind and may be dozens of commits stale. If that count is not
0, the working tree is not evidence of anything: read the real state with
`git show origin/staging:<path>` and `git ls-tree -r --name-only origin/staging`, and record the
local SHA, the remote SHA, and the gap in the run report. Verify EVERY candidate gap against
origin/staging before it reaches the proposal — never assert that a route, component, config value,
or migration is missing without having read it at the remote ref. A gap "found" in a stale tree may
already be shipped, and proposing completed work is the failure this check exists to prevent.

WHAT TO ANALYZE

Ground everything in what Bunkai's app genuinely needs next, from the perspective of a QA engineer who
wants the best possible test-management tool — not in abstract feature ideas. Sources, in order:

  - `.context/master-implementation-plan.md` and `.context/dev-roadmap.md` — what is planned, and
    what the plan assumes exists but does not
  - open bugs and improvements — recurring themes are usually a missing feature, not N defects
  - `.context/ADR/` — decisions marked `Proposed` that never got accepted, and debt they created
  - escalation logs and run reports — deferred items, "flagged not fixed" notes, known gaps
  - the design plan's screen map — screens that stories point at but that nobody has ticketed
  - `upex-galaxy/agentic-qa-boilerplate` on GitHub — READ-ONLY reference material, never clone-and-
    modify, never open a PR there, never write to it. This is UPEX's own reference repo for the KATA
    testing architecture Bunkai is modeled on. Pull whatever skills or docs in there help you actually
    understand what KATA is and how that architecture should be reflected in Bunkai's TMS, so Bunkai
    stays compatible with (or at least conceptually aligned to) the real thing. Use it as a source of
    ideas for what might be missing, never as a spec to copy blindly — Bunkai's own PRD/ADRs/roadmap
    still govern intent.

That Home-screen gap is a real shape this project has hit before: three stories mapped to a screen
that has no ticket anywhere in the backlog. Look specifically for that pattern — work everyone assumes
is somebody else's.

What you create can be UI, UX, data, or API in nature — whatever the app actually needs, not just one lane.

WHAT YOU MAY CREATE, IN ORDER OF PREFERENCE

  1. One or two user stories under an EXISTING epic. This is the default and the common case.
  2. A single, clearly urgent user story on its own, if something genuinely cannot wait for epic
     grouping.
  3. A NEW epic with its first user stories — only when the app genuinely needs a new feature area,
     not a slot inside an existing one. This is the heaviest option: it is still yours to decide, but
     it owes the run report an explicit argument for why no existing epic could hold the work.

Cap: at most TWO new user stories fully defined and created per run, whether they land under an
existing epic or a brand-new one. Definition work (INVEST refinement, acceptance criteria, 3-amigos)
is far lighter than a full `/sprint-development` pass, and stories drafted together in the same run
stay mutually consistent — but the cap exists so the backlog does not flood on a daily cadence. If you
find more good candidates than the cap allows, prioritize the best 1-2 and note the rest in the run
report for a future run to reconsider. Do not discard the thinking, just do not act on it this run.

CREATE, THEN REPORT — THE OPERATOR VETOES AFTERWARDS

There is no approval gate. It was removed on 2026-08-18 by operator decision, after four consecutive
fires produced no backlog work at all while a proposal sat unanswered. Do not reintroduce it, do not
invent a softer version of it, and do not end a turn asking a product question. Decide, create,
report.

The reasoning, so a future run does not "restore" the gate as a safety improvement: a user story
sitting in `Backlog` is cheap and reversible — closing it costs the operator ten seconds. The gate,
by contrast, cost four days of idle routine and produced nothing. The cap of 2 definitions per run is
what bounds the blast radius; the gate was never what bounded it.

Once you have analyzed and settled on what to create:

  1. **Create it.** Dispatch `/product-management` to author the stories properly — INVEST refinement,
     acceptance criteria, 3-amigos, the epic parent, the whole treatment. A thin story is worse than
     no story, because it looks done.
  2. **Append to `.session/autonomous-delivery/discovery/created-log.md`**, one entry per artifact:
     key, title, parent epic, date, this run's session id, and the one-line reason it was created.
     Append-only — never rewrite a prior entry.
  3. **Report it** to `report_channel` and in the run report, stating plainly what was created and
     how to veto it (close or delete the ticket; the next run reads that as a standing ruling).

**A new epic is created the same way, with one extra obligation.** An epic defines a product area and
drags structure behind it, so it earns a paragraph in the run report arguing why an existing epic
could NOT hold the work — not a request for permission, an argument on the record. Creating an epic
plus its first stories still consumes the same cap of 2 definitions.

DECIDE PRODUCT QUESTIONS — DO NOT ESCALATE THEM

Whether to build something, and which of two similarly-good candidates wins, is YOUR call, made on
the evidence, under `CLAUDE.md` Rule #18. Use the decision protocol: enumerate 2-4 candidates, score
them against explicit criteria (product value, consistency with existing precedent, implementation
cost, reversibility, risk), pick the highest scorer, and write the reasoning into the run report. A
decision without alternatives considered and a score is a guess, not a decision.

The same applies to purely technical questions inside a story you are creating (how it should be
sliced, which surface it lands on): decide them, attribute them, move on.

The ONLY thing that still stops this routine is a genuine dependency — story B must exist before
story A is even definable. That is rare here, and it is not a reason to end a run silently: say so in
the report and create the prerequisite instead.

REPORTING — THIS IS NOW THE VETO SURFACE

`BK-261` (or whatever `report_channel` is configured) is where the operator finds out what you
created. That makes it load-bearing in a way it was not under the old gate: post the keys and titles
of everything created, the reason each one was created, and one line on how to veto (close or delete
the ticket).

It still carries no reply-parsing protocol — nobody replies to it and nothing reads a reply. The veto
is the tracker state itself, which the next run reads directly.

CLOSING

Write a run report: what you analyzed, what you decided and why (with the alternatives you scored and
rejected), what got created, which vetoed entries from `created-log.md` you found and what you
concluded from them, and what a future run should reconsider. If you created a new epic, the report
carries the argument for why no existing epic could hold the work.
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
