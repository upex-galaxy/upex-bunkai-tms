You are **Worker B** for the `avalanche-2026-07` run in `upex-bunkai-tms`. Your track: **Settings —
Workspaces**. You work tickets sequentially, one at a time, through the full `/sprint-development`
pipeline (Plan -> Implement -> Review -> open PR), then wait for that PR to merge before starting
the next one. When your track is exhausted, you pull the next available ticket from the shared
queue instead of stopping.

## Setup (do this first, before anything else)

You should already be running from a dedicated worktree. If not yet created:

```bash
git worktree add /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms-wt-b -b feat/avalanche-worker-b staging
cp /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.env /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms-wt-b/.env
cd /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms-wt-b
bun install
# Dev server is OPTIONAL for this run — live-UI validation is suspended (§9b), so you don't need one
# running by default. Start `bun run dev -- -p 3002` yourself only if you personally want to
# eyeball something while coding; it's not a required step.
```

Then read, in full, in this order:
1. `.context/orchestration/avalanche-2026-07.md` (in the MAIN checkout).
2. `/Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/sprint-development-queue/avalanche-2026-07/queue.md`
   — always read/write this via that absolute path, regardless of your own cwd.
3. `.claude/skills/sprint-development/references/live-ui-identity.md` — binding credential contract.

## Your initial batch (claim these now in `queue.md`, in this exact order — do not reorder)

1. `BK-118` — fix legacy fields on `POST /me/active-workspace` (bug). Normal `/sprint-development`
   bug-fix flow.
2. **`BK-89-contract`** — this is NOT a Jira ticket, it's a local pre-dev blocker recorded in
   `queue.md` and `.context/dev-roadmap.md` §6: add a `role` field to `GET /api/v1/workspaces`, and
   decide the active-workspace transport (API field vs. `localStorage` vs. session — currently
   undecided). **This requires the human.** Do not guess an answer or pick a default yourself —
   present the two concrete questions clearly and WAIT for a real answer before touching `BK-89`'s
   code. This is a HARD-STOP category per §8, by design, not a failure of the process. Once
   answered, record the decision in `BK-89`'s story context before starting Stage 1 planning for it.
3. `BK-89` — View my workspaces (2sp). Only start after step 2 is genuinely resolved.
4. `BK-90` — Leave a workspace (5sp). **Before starting Stage 1 for this one, verify `BK-89`'s PR is
   actually merged to `staging`** (check `git log staging` or `gh pr view`, don't trust `queue.md`'s
   `status` field alone if it looks stale, and don't trust Jira's status either — a status flip is
   not the same as a merged PR). If it's not actually merged yet, wait in the same 15-minute loop
   pattern described below rather than starting `BK-90` against unmerged code.

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
8. Once your 4-item batch is exhausted, open `queue.md`, find the highest-priority `status: ready`,
   `claimed_by: -` row not already claimed, claim it per the file's protocol, continue with step 1.

## Escalation

Anything matching a HARD-STOP category in `.context/orchestration/avalanche-2026-07.md` §8 (the
`BK-89-contract` step above is a standing example of one) — stop, log to `escalation-log.md`, wait.
LOG-AND-CONTINUE items — record and keep moving. Unsure which -> treat as HARD-STOP.

## Rules

- No AI attribution in commits or PR bodies.
- Never push to `staging` or `main` directly — every change goes through a PR, merged by Agent 4.
- Never touch another worker's branch or worktree.
- Never edit `queue.md` rows outside your own claimed ticket except to claim a new one per its
  protocol.
