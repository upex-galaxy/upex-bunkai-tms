# Execution Sprint Sequence

_Last computed: 2026-06-01 · Scope of this run: **EPIC BK-44 — Coverage & Traceability** (newly created)._

> This sequence orders the Coverage & Traceability stories by their Jira `Dependencies` links. It is a read-side **capstone** epic: every story except the activity feed gates behind the test-execution layer (BK-24 Tests, BK-30 Runs, BK-31 Bugs) being **Done** — not merely created. Upstream epics are tracked in `.context/PBI/epic-tree.md`.

## Upstream gates (must be Done before most of this epic can start)

| Epic | Capability | Needed by |
|------|-----------|-----------|
| BK-13 | ATC Library | BK-46 |
| BK-24 | Tests (chains of ATCs) | BK-45 |
| BK-30 | Manual Execution & Runs | BK-45, BK-46, BK-47, BK-48 |
| BK-31 | Bugs & Defect Heatmap | BK-45, BK-47 |

## Execution order (topological, within BK-44)

### Exec Sprint A — startable independently of the execution layer
- **BK-49** · `TMS-Activity | Stream a read-side feed over the existing activity log` — no dependency links. Reads the workspace activity log; only needs the activity write-path wired by the features that emit events.

### Exec Sprint B — after Runs land (BK-30 Done)
- **BK-48** · `TMS-Traceability | Filter the chain by verdict, module, and date range` — depends on BK-30.
- **BK-46** · `TMS-Coverage | Surface untested ACs and modules with not-run filter` — depends on BK-13 + BK-30.

### Exec Sprint C — after Runs + Bugs land (BK-30 + BK-31 Done)
- **BK-47** · `TMS-Coverage | Compute time-to-green per user story from run and bug history` — depends on BK-30 + BK-31. Prerequisite note: BK-31 must capture defect resolution timestamps for the cycle-time calc.

### Exec Sprint D — after the full execution layer lands (BK-24 + BK-30 + BK-31 Done)
- **BK-45** · `TMS-Traceability | Render full US to bug evidence chain in one read` — depends on BK-24 + BK-30 + BK-31.
- **BK-50** · `TMS-Traceability | Export the assembled chain as a read-only snapshot` — depends on BK-45 (intra-epic). Ships last.

## Notes
- Story points intentionally unset (estimation happens in Sprint Planning, post Shift-Left).
- This file covers only the BK-44 epic. A full backlog-wide topological sort across all 9 epics is a separate `/product-management` sprint-sequencing run.
