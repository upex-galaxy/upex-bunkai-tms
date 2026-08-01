# Worker handoff — avalanche-2026-07

Why this directory exists: the three worker sessions filled their context windows around 70%+ while
the run was still going. Rather than let them degrade (hallucination, forgotten details), they are
retired and replaced by fresh sessions. This is where a retiring worker writes down what only exists
in its head, so the replacement starts informed instead of blind.

**This directory is committed.** That is the whole point — unlike `.session/`, which is gitignored
and, critically, lives INSIDE each worker's own worktree. Worker A/B/C's per-ticket `progress.md`
files and archived sessions are stranded in `.claude/worktrees/avalanche-worker-*/` and vanish the
moment those worktrees are removed. Anything that matters must be lifted out to here first.

## What is ALREADY durable — do not re-write it here

Be ruthless about this. A handoff that restates what is already recorded is noise, and noise is what
makes the next worker skim instead of read.

| Already captured | Where |
|---|---|
| Per-ticket status, claims, blockers, review adjudications | `.session/sprint-development-queue/avalanche-2026-07/queue.md` |
| Every merge, its gate values, its ordering caveats | same dir, `merge-log.md` |
| Every stop, ruling and resolution | same dir, `escalation-log.md` |
| Architectural decisions | `.context/ADR/` |
| Dev-contract resolutions, shift-left answers, QA handoffs | Jira comments on the ticket |
| What the code does | the code, and its tests |

## What to write here — the stuff that dies with the session

One file per worker: `worker-a.md`, `worker-b.md`, `worker-c.md`.

1. **Tickets you touched**, one line each: key, what shipped, PR number, merge commit if merged.
   Just enough to orient. The detail is in `queue.md`.
2. **Traps you hit that cost you time.** The thing you'd tell a colleague over their shoulder so
   they don't lose the same hour. Tool quirks, flaky infrastructure, a command that lies about
   succeeding, a doc that is subtly wrong. Be specific: exact command, exact symptom, what worked.
3. **Conventions you discovered or established** that are not written down anywhere. If you invented
   a pattern (a test shape, a module layout, an error-mapping style) and the next ticket in this area
   should follow it, say so and point at the file that is the reference implementation.
4. **Codebase knowledge that is not obvious from reading it.** Where the real source of truth lives,
   which helper is deceptively named, which two modules must change together, which "existing
   pattern" is actually two competing patterns.
5. **Work in flight**, if you are retired mid-ticket: exact branch, what is done, what is not, the
   next concrete step, and anything you were about to do that would be wrong to skip.
6. **What you would do differently.** Direct and unhedged. If the batch order was wrong, if a split
   should have been three PRs, if an escalation should have happened earlier — say it plainly. This
   is the highest-value section and the one most likely to be skipped.

## What NOT to write

- No secrets, tokens, or credential values. Variable NAMES are fine, values never.
- No summary of the run's rules — the replacement reads the strategy doc directly.
- No apology, no throat-clearing, no restating your own instructions back.
- No speculation presented as fact. If you never verified something, mark it unverified.

## Before you write it, rescue your session files

Your `.session/` is inside your worktree and will not survive it. Copy the per-ticket records for
every ticket you touched into the MAIN checkout, where the next session can actually find them:

```bash
mkdir -p /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/.archive/
cp -R .session/.archive/* /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/.archive/ 2>/dev/null
cp -R .session/sprint-development/* /Users/ely/Desktop/projects/bunkai/upex-bunkai-tms/.session/sprint-development/ 2>/dev/null
```

Do this FIRST. Writing a beautiful handoff and then losing the underlying records is the failure
mode this whole directory exists to prevent.
