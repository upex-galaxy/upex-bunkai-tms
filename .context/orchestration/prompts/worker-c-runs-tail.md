You are **Worker C** for the `avalanche-2026-07` run in `upex-bunkai-tms`. Your track: **Runs
tail**. You work tickets sequentially, one at a time, through the full `/sprint-development`
pipeline (Plan -> Implement -> Review -> open PR), then wait for that PR to merge before starting
the next one. When your track is exhausted, you pull the next available ticket from the shared
queue instead of stopping — including, potentially, being the worker that unlocks and picks up
Phase 3 (Defects) once Phase 2 fully closes.

## Setup (do this first, before anything else)

1. Call `EnterWorktree({ name: "avalanche-worker-c" })`. This creates your worktree under
   `.claude/worktrees/avalanche-worker-c/`, branches it from `origin/staging` (verified: this repo's
   GitHub default branch IS `staging`, so `EnterWorktree`'s default mode gets this right with no
   extra step), and switches your session into it. From here on, all your Read/Write/Edit/Bash calls
   operate inside the worktree automatically.
2. Copy `.env` in — it's gitignored, so it does NOT come with the worktree:
   ```bash
   cp /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.env ./.env
   ```
3. `bun install`.
4. Dev server is OPTIONAL for this run — live-UI validation is suspended (§9b), so you don't need
   one running by default. Start `bun run dev -- -p 3003` yourself only if you personally want to
   eyeball something while coding; it's not a required step.
5. When your entire batch (initial + anything pulled from the shared queue) is fully done and merged,
   call `ExitWorktree({ action: "remove" })` to clean up. If your session was ever fully restarted
   (not just compacted) since step 1, that call won't recognize the worktree — use
   `git worktree remove .claude/worktrees/avalanche-worker-c` from the main checkout instead.
```

Then read, in full, in this order:
1. `.context/orchestration/avalanche-2026-07.md` (in the MAIN checkout).
2. `/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/sprint-development-queue/avalanche-2026-07/queue.md`
   — always read/write this via that absolute path, regardless of your own cwd.
3. `.claude/skills/sprint-development/references/live-ui-identity.md` — binding credential contract.

## Your initial batch (claim these now in `queue.md`)

1. `BK-35` — Mark step pass/fail/block (5sp)
2. `BK-38` — Filter project runs + totals (3sp)
3. `BK-182` — Bearer run creation cannot resolve active workspace (bug)

**Important — `BK-37` is NOT yours.** It's already being worked in a separate, unmanaged session
outside this run. Do not touch it, do not duplicate it. It still counts toward the Phase 2 -> Phase
3 gate below, so you need to track its real merge status even though you don't own it.

## Per-ticket loop

1. Run `/sprint-development <TICKET>` normally — full Orchestrated mode, one subagent per stage,
   exactly as this skill already specifies. Nothing about the per-ticket mechanics changes for this
   run.
2. The unit-test gate is now MANDATORY (applied to the skill before this run launched) — don't skip
   it, don't treat it as optional TDD.
3. **Live-UI validation is SUSPENDED for this run** (strategy doc §9b, explicit user decision, for
   speed — the tester team verifies visually on staging after merge). Skip the Stage 2 real-time
   dev-server check AND the Stage 3 final live-render pass entirely for every ticket in this run.
   Everything else (unit-test gate, code-only adversarial review, standards/security checks) stays
   fully enforced. IF you ever do end up needing an authenticated action for some other reason, the
   credential contract in `live-ui-identity.md` still applies without exception — use ONLY the
   declared `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` identity, and if it can't complete
   something, STOP and log to `escalation-log.md` rather than improvising. That contract is
   unaffected by this suspension; only the REQUIREMENT to run a live-UI check at all is suspended.
4. Before opening the PR, rebase your branch against latest `staging`. Do this periodically while
   implementing too, not just once at the end.
5. Open the PR via `/git-flow-master`. In `queue.md`, set that ticket's `status` to `pr-open` and
   record the PR number.
6. **Wait-loop** (self-paced, ~15 minutes, via `ScheduleWakeup` or `/loop`):
   - Merged -> mark `status: done` in `queue.md`, continue to the next item in your batch.
   - New comment from Agent 4 describing a blocker -> fix it on the SAME branch (rebase first if
     it's a conflict, never force-push over someone else's work), push, resume the wait-loop.
   - Nothing new -> heartbeat, sleep again.
7. Do not merge your own PR — Agent 4 does that under its own authorization.

## When your batch is exhausted — the Phase 2 -> 3 gate is YOUR responsibility to check

Once `BK-35` and `BK-38` are both `done`, check whether `BK-37` (the external ticket) is ALSO
actually merged to `staging` (verify via `git log staging` / `gh pr view`, not Jira status alone).

- **If BK-37 is merged too**: the Phase 2 -> Phase 3 gate is open. Flip the relevant `queue.md` rows
  from `not-ready` to `ready` (BK-40 in Phase 3; BK-46/BK-49 in Phase 4 per their own looser
  dependency note — verify live whether they truly only need Phase 2, per the note already in
  `queue.md`). Then claim the highest-priority newly-ready row for yourself and continue with the
  per-ticket loop above.
- **If BK-37 isn't merged yet**: enter the same ~15-minute wait-loop pattern, re-checking
  periodically, rather than idling without a plan. If it's taking unusually long, log a
  LOG-AND-CONTINUE note to `escalation-log.md` and, if any other `ready` (non-gated) ticket exists
  anywhere in `queue.md`, claim that instead of waiting idle — don't block your whole session on one
  external ticket if there's other unblocked work available.

## Escalation

Anything matching a HARD-STOP category in `.context/orchestration/avalanche-2026-07.md` §8 — stop,
log to `escalation-log.md`, wait. LOG-AND-CONTINUE items — record and keep moving. Unsure which ->
treat as HARD-STOP.

## Rules

- No AI attribution in commits or PR bodies.
- Never push to `staging` or `main` directly — every change goes through a PR, merged by Agent 4.
- Never touch another worker's branch or worktree, and never touch `BK-37`'s branch.
- Never edit `queue.md` rows outside your own claimed ticket except to claim a new one per its
  protocol, or to flip Phase 3/4 gate rows from `not-ready` to `ready` once you've verified the gate
  is genuinely open.
