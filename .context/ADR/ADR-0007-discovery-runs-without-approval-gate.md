# ADR-0007 — Unattended `discovery` runs create within the per-run cap; no approval gate

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Boilerplate maintainer (upex-galaxy). The gate was removed by the operator's explicit decision on 2026-08-18; this record moves that decision and its evidence out of `autonomous-delivery/SKILL.md`, where it lived as dated history (dev-sync parity fleet, residual of the doctrine wave)
- **Tags:** autonomous-delivery, unattended-runs, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

`/autonomous-delivery` runs on a schedule with no human on the line. Its `discovery` mode never writes code: it creates backlog definitions through `/product-management`. Until 2026-08-18 that mode had an approval gate: when it settled on a definition, it ended its turn on an open proposal (`pending-decision.md`, `status: awaiting_reply`) and waited for the operator to answer in that routine's own chat. A re-surface rule forbade stacking a new proposal on a pending one.

The gate was measured in production before it was removed:

- ONE unanswered proposal produced FOUR consecutive fires, 2026-08-14 through 2026-08-18, that created nothing at all, because the re-surface rule correctly refused to stack a second proposal.
- During that same gated period the mode opened a pull request its own contract forbade, and it went unnoticed for five days.

So the gate cost four days of idle runs and did not bound the blast radius: the thing that did go wrong happened inside the gated period.

## Decision

We will let `discovery` act without a synchronous approval, exactly like `story` and `bug`. When a run settles on a definition worth creating, it creates it, appends it to `created-log.md`, and reports it; the operator vetoes after the fact by closing or deleting the ticket, and the next run reads `created-log.md` first so a vetoed definition is never re-created. The `discovery_definitions` per-run cap, not a human in the loop, bounds the blast radius.

**Invariant:** no unattended mode ends its turn waiting for an answer in its own chat. A future run or edit must not restore the gate, and must not invent a softer version of it (a confirm-first flag for "big" items, a pause-on-epic rule, any other synchronous wait) as a safety improvement.

## Consequences

- **Positive:** every fire does work or reports why it could not; a single unanswered message can no longer stall the routine for days; the safety bound is a number in config that a reviewer can read.
- **Negative / trade-offs:** a poor definition reaches the tracker before a human sees it, and the operator pays for it by closing it; the per-run cap has to be set low enough that a bad run is cheap to clean up.
- **Neutral / follow-ups:** the veto path depends on `created-log.md` being read first on every run, which is why `discovery` skips worktree isolation (the log must be the one real file the next fire reads).

## Alternatives considered

- **Keep the gate, add a timeout** — rejected. A timeout that proceeds is the no-gate decision with a delay; one that aborts is the measured failure with a deadline.
- **Gate only "big" items (epics, multi-story definitions)** — rejected. The forbidden pull request was not a big item; size does not predict which run goes wrong, and the gated period proved the gate does not stop it.
- **Ask in a shared channel instead of the routine's chat** — rejected. It is the same synchronous wait in a different place; the idle fires come from waiting, not from where the question is posted.

## References

- `.agents/skills/autonomous-delivery/SKILL.md` → "Discovery creates, the operator vetoes (no approval gate)", and hazard H19
- `.agents/skills/autonomous-delivery/references/run-report-format.md` (where a created definition is reported)
