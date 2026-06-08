# Execution Sprint Sequence — Bunkai (67) Sprint 1

_Last computed: 2026-06-08 · Scope: **active sprint** (sprint id 6 · board 7 · site `upexgalaxy69`) · Recomputed after 17 `Dependencies` links were created (ATC chain + Test + skeleton backfill)._

> **Ordering is now LINK-DRIVEN (machine-derivable).** Previously the in-sprint `Dependencies` graph was empty (only BK-27 carried links, all dependents out-of-sprint), so ordering was driven by the architectural cascade in `.context/master-implementation-plan.md`. As of 2026-06-08 the graph is populated: every skeleton + ATC + Test edge now exists as a real Jira `Dependencies` link and the topological sort below is derived from Jira, not from the plan. The cascade and the link graph agree.

## Dependency graph (in-sprint `Dependencies` edges, `X depends on Y`)

```
Skeleton:  BK-8→BK-4 · BK-9→BK-8 · BK-10→BK-9 · BK-11→BK-9 · BK-14→BK-9
           BK-15→BK-14 · BK-17→BK-14 · BK-17→BK-15
ATC/Test:  BK-18→BK-15 · BK-19→BK-18 · BK-20→BK-18 · BK-23→BK-18 · BK-27→BK-18
           BK-21→BK-18 · BK-21→BK-27 · BK-22→BK-18 · BK-22→BK-27
Account:   BK-87→BK-86 · BK-88→BK-87 · BK-89→BK-87 · BK-90→BK-89   (pre-existing, well-refined)
Blocked:   BK-6→BK-83 (bug)   — BK-6 BLOCKED until bug BK-83 closes
Downstream (out-of-sprint): BK-28/32/33/34 → BK-27 (future Tests epic; do not delay in-sprint work)
```

---

## Execution Sprints (Kahn topological sort over the full in-sprint story set)

| Execution Sprint | Parallel-safe | Story keys | Notes |
|---|---|---|---|
| ES1 | 6 | BK-2, BK-3, BK-4, BK-5, BK-16, BK-86 | No inbound deps — start here. (BK-6 excluded: blocked by bug BK-83.) |
| ES2 | 2 | BK-8 (dep BK-4), BK-87 (dep BK-86) | |
| ES3 | 3 | BK-9 (dep BK-8), BK-88 (dep BK-87), BK-89 (dep BK-87) | |
| ES4 | 4 | BK-10 (dep BK-9), BK-11 (dep BK-9), BK-14 (dep BK-9), BK-90 (dep BK-89) | |
| ES5 | 1 | BK-15 (dep BK-14) | |
| ES6 | 2 | BK-17 (dep BK-14, BK-15), **BK-18 (dep BK-15)** | BK-18 = head of ATC chain |
| ES7 | 4 | BK-19, BK-20, BK-23, BK-27 (all dep BK-18) | Parallel once BK-18 done |
| ES8 | 2 | BK-21 (dep BK-18, BK-27), BK-22 (dep BK-18, BK-27) | ATC↔Test cross-deps |

---

## Dev-REMAINING frontier (what's actually left to build)

Everything ES1–ES5 is **dev-done** (merged + staging-deployed / QA). The remaining work, in order:

| Order | Key | Story | Status | Blockers remaining |
|---|---|---|---|---|
| 1 | **BK-18** | TMS-ATC API — create/edit ATCs | Ready For Dev | **NONE — implement now** |
| 1 | BK-3 | Authentication — OAuth (GitHub/Google) | Ready For Dev | NONE (independent; auth substrate exists) |
| 2 | BK-19 | TMS-ATC Builder | Estimation | BK-18 |
| 2 | BK-20 | TMS-ATC Search | Ready For Dev | BK-18 |
| 2 | BK-23 | TMS-ATC Duplicate | Estimation | BK-18 |
| 2 | BK-27 | TMS-Test Builder | Ready For Dev | BK-18 |
| 3 | BK-21 | TMS-ATC Propagation ★differentiator | Shift-Left QA | BK-18 + BK-27 |
| 3 | BK-22 | TMS-ATC Usage report | Ready For Dev | BK-18 + BK-27 |

> **BK-18 verdict:** all prerequisites (BK-4→BK-8→BK-9→BK-14→BK-15) are dev-complete. BK-18 is the next thing to build — no story precedes it in the remaining work.

Account/Settings cluster (BK-86→87→88/89→90) is independently sequenced and already linked; build alongside per capacity.

---

## Cycle warnings
- none (sort completed; graph is a DAG)

## Soft dependencies (Relates To)
- none — no `Relates` links exist on any in-sprint story.

## Blocked
- **BK-6** (Switch workspaces) — blocked by bug **BK-83** (active-workspace response missing fields). Resolve BK-83 to unblock.

---
_Sequencing authored by `/product-management` workflow H against the active sprint. 17 `Dependencies` links created + direction-verified via REST on 2026-06-08 (site upexgalaxy69)._
