# Avalanche 2026-07 — Multi-session parallel batch strategy

> Living operational doc for this specific push, not a permanent architecture. Goal: clear Phases
> 0-4 of `.context/reports/IMPLEMENTATION-QUEUE-2026-07-30.md` before the next Bunkai release, using
> 3 isolated worker sessions (git worktrees) working batches in parallel + 1 dedicated PR-review/merge
> agent, instead of one story per terminal sequentially.
>
> Read this file in full before starting any of the 4 roles below. Each role's launch prompt lives in
> `prompts/` and assumes you've read this doc first.

---

## 1. Why this exists

`/sprint-development` already dispatches one subagent per stage inside a single ticket — that part
doesn't change. What changes is the OUTER loop: instead of a human reopening a terminal per story
and running the tickets one at a time, 3 sessions run in parallel (each isolated in its own git
worktree, each working a batch of related tickets sequentially), plus 1 session whose only job is
deciding merge order and actually merging.

Grounded in a real incident and a real research pass done the same week this doc was written:

- BK-87 (Settings hub) proved the hard, non-negotiable gates: GitHub branch protection needs 1 human
  review per PR, and `git-flow-master`'s own doctrine re-confirms admin-status + the specific bypass
  action every single time, even when the policy flag is already `true` — it never becomes silent.
  §3 below is how this run handles that gate without breaking the rule.
- The same BK-87 session also produced a real security incident: subagents defaulted to the Supabase
  service-role key to impersonate a real user for live-UI checks, because no dedicated test identity
  was declared. This is now closed at the doctrine layer by
  `.claude/skills/sprint-development/references/live-ui-identity.md` (shipped via the 2026-07-31
  boilerplate sync) — read §7 below, it is binding for every worker.
- A follow-up research pass (10-agent workflow) confirmed cloud-scheduled routines (the `schedule`
  skill) CANNOT run this backlog's work: they have no access to `.env`, no local dev server, no
  browser automation — and nearly everything in Phases 0-2 is a UI story requiring mandatory live-UI
  validation (Critical Rule #14). That's why this design uses real local sessions in worktrees, not a
  cloud scheduler — it's the only shape that keeps full local access while still running unattended
  between check-ins.

---

## 2. Architecture

```
                    ┌─────────────────────────────┐
                    │   Agent 4 — PR Orchestrator  │
                    │   (its own terminal, no      │
                    │    worktree needed — reads   │
                    │    across all branches)      │
                    └──────────────┬──────────────┘
                                   │ polls every ~15 min
                                   │ decides merge order, merges,
                                   │ or comments on the PR if blocked
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼────────┐ ┌─────────▼────────┐ ┌─────────▼────────┐
    │  Worker A         │ │  Worker B         │ │  Worker C         │
    │  worktree: wt-a   │ │  worktree: wt-b   │ │  worktree: wt-c   │
    │  Track: Settings  │ │  Track: Settings  │ │  Track: Runs tail │
    │  PATs (BK-88)     │ │  Workspaces       │ │  (BK-35, BK-38)   │
    │                   │ │  (BK-89 -> BK-90) │ │                   │
    └───────────────────┘ └───────────────────┘ └───────────────────┘
```

Each worker: runs `/sprint-development` per ticket in its batch, one ticket at a time, through
Stage 1 -> Stage 2 -> Stage 3 -> open PR, then enters a wait-loop (§6) until that PR is merged before
starting the next ticket in its batch. When a batch is exhausted, the worker consults the shared
queue (§5) for its next assignment instead of stopping.

Agent 4 never implements, never fixes, never resolves conflicts itself — it only orders, merges, or
leaves a comment redirecting the problem back to the worker that owns the branch. One clear
responsibility, matching this repo's own orchestration doctrine.

---

## 3. Admin-bypass authorization — explicit, bounded, auditable

The user (repo owner/admin on `upex-galaxy/upex-bunkai-tms`) has explicitly pre-authorized Agent 4 to
merge PRs from this avalanche run without asking per-PR, **within these exact boundaries**:

1. **Scope**: only PRs opened by Worker A/B/C for tickets listed in `queue.md` under this avalanche
   run (`avalanche-2026-07`). Never a PR outside this run, never a PR against `main`.
2. **Merge gate**: CI green AND the Stage 3 adversarial review adjudication shows **0 unresolved
   BLOCKER and 0 unresolved MAJOR**. Anything less strict escalates instead of merging (see §8).
3. **Hard carve-out, no exception**: any PR whose diff or review trail shows even a suspicion of a
   `live-ui-identity.md` §3 violation (privileged-key auth, admin user-management API use, session
   forging, impersonation) is **NEVER** auto-merged, regardless of CI/review status — stop, log to
   `escalation-log.md`, and wait for the human. This is the one thing the pre-authorization does not
   cover, full stop.
4. **Never covers**: force-push, `--no-verify`, any history rewrite, or any push/merge to `main`.
   Those stay fully manual under every version of this doctrine, avalanche or not.
5. **Time-bound**: this authorization is valid from the moment Agent 4's session starts until EITHER
   every ticket in `queue.md` for this run reaches `Ready For QA`, OR 7 calendar days elapse from
   launch, OR the user explicitly revokes it — whichever comes first. It is not a standing policy
   change; re-authorize explicitly for any future avalanche run, don't assume this carries over.
6. **Audit trail**: every merge Agent 4 performs is logged (PR number, ticket, timestamp, gate values
   that justified it) in `merge-log.md` next to `queue.md` — the human can review the full trail at
   any time without having watched it happen live.

This is the one place this run trades the "human catches it live" safety net (which is what actually
caught the BK-87 incident) for throughput. That trade is the user's explicit, informed call — not
something inferred from `admin_bypass: true` in `.agents/project.yaml` on its own; that flag alone
would still require a fresh per-PR confirmation per `git-flow-master`'s doctrine. This §3 is the
override, scoped to exactly this run.

---

## 4. Worktree setup (each worker, before doing anything else)

Workers run as Claude Code sessions, so they use the harness's own **`EnterWorktree`** tool, not
manual `git worktree add`. Verified for this repo: GitHub's default branch is `staging` (not
`main`), and no `worktree.baseRef` override is configured, so `EnterWorktree`'s default `fresh` mode
correctly branches from `origin/staging` — no extra step needed to fix the base.

Each worker calls, as its first action:

```
EnterWorktree({ name: "avalanche-worker-a" })   # worker B: "avalanche-worker-b", worker C: "avalanche-worker-c"
```

This creates the worktree under `.claude/worktrees/avalanche-worker-a/`, branches it from
`origin/staging`, and switches that worker's own session into it — all subsequent Read/Write/Edit/
Bash calls in that session operate inside the worktree automatically, no absolute-path bookkeeping
needed. The PR Orchestrator (Agent 4) does NOT use a worktree — it needs visibility across every
branch, so it stays in the main checkout.

**Gotcha proven this same week (still applies)**: a worktree — whether made by `EnterWorktree` or
manual `git worktree add` — only brings TRACKED files. `.env` is gitignored and will NOT exist in a
fresh worktree. Each worker copies it in manually right after entering:

```bash
cp /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.env ./.env
```

A missing `.env` in a fresh worktree is exactly the kind of gap that produced the original credential
incident — a subagent finding no identity available and improvising. Do this before doing anything
requiring credentials, not after something goes wrong.

**Cleanup caveat**: `ExitWorktree` only recognizes a worktree created by `EnterWorktree` IN THE SAME
session. If a worker's terminal is fully closed and reopened later (not just compacted — compaction
keeps the same session), a fresh session calling `ExitWorktree` won't recognize the old worktree;
fall back to manual `git worktree remove .claude/worktrees/avalanche-worker-a` (from the main
checkout) in that case.

Each worker also needs its own `bun install` / dev-server port if running live-UI checks
concurrently (Next.js dev server binds a port; run each worker's `bun run dev` on a distinct port,
e.g. `-- -p 3001`, `-p 3002`, `-p 3003`, and use that worker's own port for its live-UI checks).

The shared coordination files (§5, §8) live in the MAIN checkout, not inside any worktree, so all 4
sessions read/write the same physical files regardless of which worktree their shell is rooted in:

```
/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/sprint-development-queue/avalanche-2026-07/
```

---

## 5. Batch assignment (initial claims) + dynamic queue

Initial tracks, chosen to be parallel-safe against each other (all gate only on `BK-87` ✅ or
`BK-34` ✅, both already shipped) and to keep dependent tickets sequential within one worker:

| Track | Worker | Tickets, in order |
|---|---|---|
| Settings — PATs | A | BK-88, BK-176 |
| Settings — Workspaces | B | BK-118 -> BK-89 contract resolution -> BK-89 -> BK-90 |
| Runs tail | C | BK-35, BK-38, BK-182 |

`BK-37` is explicitly OUTSIDE this run's claim system — it's already being worked in an unmanaged
session. It still counts toward the Phase 2 -> Phase 3 gate (see `queue.md`), so whichever worker
checks that gate must verify BK-37's real merge status (not just its Jira status) alongside its own
tracked tickets.

Once a worker's initial track is exhausted, it does NOT stop — it reads
`.session/sprint-development-queue/avalanche-2026-07/queue.md`, finds the highest-priority ticket
whose dependencies are satisfied (checked live via `acli`/Jira status AND, where the roadmap notes a
LOCAL-only pre-dev blocker, that specific blocker resolved — never trust a Jira status flip alone;
`BK-90`-style hard gates need the predecessor's PR actually merged to `staging`, not just its ticket
marked done), and that is not already claimed by another worker, and claims it (see the claim
protocol at the top of `queue.md`). Phases 3-4 only unlock once Phase 2 (`BK-30` epic: BK-34/35/36/
37/38/39, plus abort BK-36 and verdict BK-39 already done) is fully merged — `queue.md` encodes this
gate explicitly so no worker has to re-derive the whole roadmap by hand each time.

---

## 6. The wait-loop (worker side)

After opening a PR, a worker does not sit idle waiting on a blocking call — it self-paces:

1. Update `queue.md`: mark the ticket `status: pr-open`, record the PR number.
2. Enter a ~15 minute self-paced loop (`ScheduleWakeup` from inside the session, or the `/loop`
   skill) checking: has the PR been merged? Are there new PR comments since the last check?
3. **Merged** -> mark `status: done` in `queue.md`, pick the next ticket per §5, continue.
4. **New comment from Agent 4** (a blocker, a requested fix, a merge conflict) -> read it, apply the
   fix on the SAME branch (rebase against `staging` first if it's a conflict — `git-flow-master`'s
   conflict-resolution playbook applies exactly as it would for any single-ticket run), push, and
   go back to step 2. Never force-push over Agent 4's or anyone else's work.
5. **Nothing yet** -> log a one-line heartbeat to its own ticket's `progress.md`, sleep again.

Rebase against `staging` periodically WHILE STILL IMPLEMENTING (not just when a PR is open) to keep
drift low and make eventual conflicts smaller — this is the "constantly update your branch" instinct
from the original proposal, applied concretely.

---

## 7. Credential contract — binding on every worker, every live-UI check

`.claude/skills/sprint-development/references/live-ui-identity.md` is the law here, not a suggestion.
Every worker's stage-2/stage-3 dispatch briefing MUST carry, verbatim, the three lines that file's
§5 requires (resolved identity by variable name, the §3 prohibition list restated, the §4 hygiene
contract). The declared identity for this project is already wired:

```yaml
testing:
  automation_identity:
    email_var: QA_E2E_USER_EMAIL
    password_var: QA_E2E_USER_PASSWORD
    scope: dedicated-non-production-account
```

If any worker ever finds itself unable to complete a live-UI check with that identity (missing
permission, missing workspace membership, whatever), the fail-closed rule applies: STOP, report the
exact gap, do not improvise a workaround. Log it to `escalation-log.md` (§8) — this is always a
hard-stop category, never a log-and-continue one.

---

## 8. Escalation categories

Every worker and Agent 4 write to the same
`.session/sprint-development-queue/avalanche-2026-07/escalation-log.md` (append-only, one entry per
stop). Two categories:

**Always hard-stop and wait for the human** (never resolved autonomously, never skipped-and-logged):
- Any `live-ui-identity.md` violation or gap (§7).
- A PR merge that would fall outside the §3 boundaries (wrong scope, failing gate, the hard
  carve-out).
- Any genuinely novel security-relevant judgment call not already covered by an existing rule.
- An ambiguous AC not already resolved during shift-left refinement (a brand-new ambiguity invented
  mid-run still stops — it does not get an AI-improvised answer).
- Anything requiring `--force`, `--no-verify`, or a history rewrite.
- A Stage 1 workload forecast coming back High risk with an unclear chain strategy — run the actual
  git-flow-master decision tree (don't guess a label, this happened once already on BK-87), but if
  the tree itself doesn't cleanly resolve, stop and ask.

**Log-and-continue** (record it, keep moving, don't wait):
- A failing test the implementation itself introduced — existing Stage 2/3 fix-iterate loop, capped
  attempts, same as any single-ticket run.
- A pre-existing, unrelated test failure — confirm via a throwaway worktree against clean `staging`
  (exactly how BK-87's `search-isolation.test.ts` case was handled), log it, move on.
- MINOR/NIT review findings that match an already-established convention in this codebase.
- A `queue.md` dependency not yet satisfied — skip to the next unblocked ticket, log the skip, don't
  wait around for it.
- Mechanical Jira transitions / QA-owner reassignment (MCP-verified per the existing gotcha, no
  judgment call involved).

---

## 9. Unit-test gate

Applied to `sprint-development/SKILL.md` and its reference files BEFORE this run launches (per the
user's explicit decision) — every worker's Stage 2 now treats unit-test authoring as mandatory, not
optional TDD. See the skill files themselves for the exact gate criteria; nothing avalanche-specific
here, this is now just how Stage 2 works, permanently, for every future ticket too.

---

## 9b. Live-UI validation — SUSPENDED for this run (explicit, user-directed, 2026-07-31)

For `avalanche-2026-07` ONLY, the mandatory live-UI validation normally required by Critical Rule
#14 and this skill's own Stage 2/3 doctrine is **suspended**, by the user's explicit, informed
decision. Reason: throughput — the tester team verifies visually/E2E on staging after merge
regardless, and re-driving a browser per ticket across 3 parallel workers was judged too slow for
this specific push.

**What this changes:**
- Stage 2's "live-UI check while building" (open the dev server, drive Playwright/claude-in-chrome
  as you code): **SKIP**, for every ticket in this run.
- Stage 3's "final live-render verification pass": **SKIP**. The adversarial reviewer subagent must
  NOT require or attempt a live render check, and must NOT raise "no live-UI verification" as a
  BLOCKER/MAJOR/MINOR finding against any PR in this run.

**What does NOT change:**
- The mandatory unit-test gate (§9) — fully enforced, this suspension does not touch it.
- The adversarial code review itself (diff read against AC/TC-AC, code-standards, security,
  scope) — fully enforced, unchanged.
- Agent 4's merge gate (CI green + 0 unresolved BLOCKER/MAJOR from that code-only review) —
  unchanged.
- `live-ui-identity.md`'s credential contract — stays fully binding for ANY authenticated action a
  worker does take, if one happens for some other reason. This suspension removes the REQUIREMENT
  to check, it does not relax HOW a check is done if one happens anyway.
- Every §8 escalation category — unchanged.

**The real tradeoff, stated so it isn't silently absorbed**: this is exactly the gap Critical Rule
#14 exists to close. A diff can pass unit tests, types, lint, and a text-only code review while the
actual rendered UI is subtly wrong (broken layout, a state that never renders, a JSX mistake) and
nothing in this run's pipeline catches that before merge — the tester team catching it on staging
afterward is the accepted mitigation for this run specifically.

This suspension applies ONLY to `avalanche-2026-07`. It is not a change to `sprint-development`'s
standing rules and does not carry over to any future run without being explicitly re-stated there.

## 10. Resume / session-management

Each ticket still gets its own `.session/sprint-development/<JIRA-KEY>/progress.md` exactly as
today's `session-management.md` contract already specifies — this run does not change per-ticket
resume mechanics, it only adds `queue.md` as a layer ABOVE that, for cross-ticket "what's next"
coordination. If a worker's session itself gets interrupted (compaction, crash, closed terminal),
resuming it should: re-read `queue.md` for its own claimed ticket, re-read that ticket's own
`progress.md`, and continue from there — never assume prior state without re-reading both.

---

## 11. Files in this run

- `queue.md`, `escalation-log.md`, `merge-log.md` — under
  `.session/sprint-development-queue/avalanche-2026-07/` (local-only, never committed, same
  convention as per-ticket `progress.md`).
- Launch prompts for all 4 roles — under `prompts/` next to this file.
