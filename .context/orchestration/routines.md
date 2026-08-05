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
    discovery_definitions: 2  # NEW user stories drafted + created per run, gated on synchronous chat approval
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
approve/reject-by-comment cycle — Discovery's proposals are approved synchronously, live, in that
routine's own chat session (see "Routine 3" below). Nobody should reply to a `BK-261` comment
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

Cadence: once daily. Unlike the other two, this routine is not fully unattended by design — its
proposal must be approved live, in this routine's own chat session, before anything gets created. It
never writes application code; the only artifacts it ever creates are epics and user stories.

```
You are running the scheduled STORY-CREATION routine for this repository (mode: discovery). Unlike the
other two routines, THIS one waits on you by design: you check in on this session's chat, at any point
during the day (or a later day, if it comes to that), to approve or redirect what it proposes. You
never write application code in any branch — the only artifacts you ever create are epics and user
stories.

Invoke the `autonomous-delivery` skill in `discovery` mode and follow it. It dispatches
`product-management` for the actual authoring, only after approval.

FIRST: CHECK FOR AN UNANSWERED PROPOSAL FROM A PRIOR RUN

Read `.session/autonomous-delivery/discovery/pending-decision.md`. If it exists and its status is
still `awaiting_reply`: do NOT run a fresh analysis. Re-state the EXACT same recommendation from that
file, ask the same question again, and stop — release the lock, end the turn. Never generate a new
proposal on top of one that is still waiting; that is exactly the flooding this file exists to
prevent. The same recommendation stands until the operator answers it, however many days that takes.

If the file does not exist, or its status is `resolved`: proceed with a fresh analysis below.

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

Proposals can be UI, UX, data, or API in nature — whatever the app actually needs, not just one lane.

WHAT YOU MAY PROPOSE, IN ORDER OF PREFERENCE

  1. One or two user stories under an EXISTING epic. This is the default and the common case.
  2. A single, clearly urgent user story on its own, if something genuinely cannot wait for epic
     grouping.
  3. A NEW epic with its first user stories — only when the app genuinely needs a new feature area,
     not a slot inside an existing one. This is the heaviest option and needs its own explicit
     go-ahead on the EPIC ITSELF, separate from its stories, before any of them get drafted.

Cap: at most TWO new user stories fully defined and created per run, whether they land under an
existing epic or a brand-new one. Definition work (INVEST refinement, acceptance criteria, 3-amigos)
is far lighter than a full `/sprint-development` pass, and stories drafted together in the same run
stay mutually consistent — but the cap exists so the backlog does not flood on a daily cadence. If you
find more good candidates than the cap allows, prioritize the best 1-2 and note the rest in the run
report for a future run to reconsider. Do not discard the thinking, just do not act on it this run.

THE APPROVAL GATE — LIVE, IN THIS CHAT, NEVER VIA A TRACKER COMMENT

This is the one place in this system that deliberately waits on a human, by explicit operator
instruction, scoped ONLY to this gate. The story and bug routines still must never wait — do not
generalize this exception to them.

Once you have analyzed and settled on a recommendation:

  1. Write it to `.session/autonomous-delivery/discovery/pending-decision.md`: which epic (existing
     or the case for a new one), the 1-2 stories with a one-line pitch each, why now, and what it
     depends on. Set its status to `awaiting_reply`.
  2. Release the `discovery` mode lock immediately — you may not get an answer today, and the lock
     must not block tomorrow's fire from re-surfacing this same question.
  3. Ask the question directly in this chat, plainly, and STOP. Do not create anything yet. If a new
     epic is part of the recommendation, ask about the epic specifically, separate from its stories —
     the operator may want the epic without your specific first-story picks, or the reverse.

If the operator answers within this same open session — moments later or hours later, same day or a
later one this exact session is still sitting open — resume immediately: dispatch
`/product-management` to actually create what was approved, set `pending-decision.md`'s status to
`resolved` with a one-line note of what got created, and continue to CLOSING below.

If nobody answers before this routine's next scheduled fire: that fire reads `pending-decision.md`,
sees `awaiting_reply`, and re-surfaces this EXACT recommendation per the check at the top of this
prompt. It does not re-analyze, does not propose something new, and does not nag beyond restating the
same question once per fire.

DECIDE NOTHING PRODUCT-SHAPED WITHOUT THE GATE

Whether to build something, and which of two similarly-good candidates wins, is the operator's call,
always. Bring the research, the evidence, and a clear recommendation — never skip the gate because a
candidate seems obviously good to you.

You may resolve purely technical questions inside a proposal autonomously via the decision protocol
(e.g. how a story should be sliced technically once approved) — you may not decide scope, priority, or
whether a feature exists.

REPORTING

`BK-261` (or whatever `report_channel` is configured) is a plain log now — post what you found, what
you proposed or re-surfaced, and what got created or is still pending. It carries no reply-parsing
protocol; nobody should reply to it expecting this routine to read that reply. Approval only ever
happens live, in this chat, per the gate above.

CLOSING

Write a run report: what you analyzed, what you proposed (or re-surfaced), what the operator decided
if they answered this session, what got created, and what is still pending for next time. If a new
epic was proposed and not yet approved, say so explicitly — do not draft its stories preemptively "in
case" it gets approved later.
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
