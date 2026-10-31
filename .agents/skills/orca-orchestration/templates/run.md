# Run — <slug>

> Copy to `.session/orchestration/<slug>/run.md`. Owner: the conductor. Replace every `<…>`.
> This file is what a SECOND conductor binds to. Everything it needs to take over is here or is
> pointed at from here.

| Field | Value |
|---|---|
| Run id | `run_…` |
| Objective | <one sentence: what is being coordinated> |
| Coordinator handle | `…` |
| Created | <YYYY-MM-DD HH:MM> by <session label> |
| Primary checkout | <absolute path> |
| Base branch | <branch> |
| Topology | <same-checkout fleet \| worktree per worker \| worktree per cluster> (`references/topologies.md`) |
| Worker cap | <n> (source: `.agents/project.yaml` → `orchestration.max_workers`, or the user's explicit instruction for this run) |
| Agent / model / effort | <agent> / <full model id> / <effort> |
| Supervision | <supervised (native launch) \| unsupervised (custom-argv terminals or pasted lines)> — the native path needs the agent's default permission mode AND credentials reaching the worker (a `.env` in the worker's checkout for the MCP `.env` loader; the CLIs a brief calls logged in) on this machine (`references/orca-machine-setup.md` §3); when either is missing, say so HERE, because it changes how every worker is nudged and closed |
| Board status mapping | <todo=… · in-progress=… · in-review=… · completed=…> |
| Board card shape | <one card per worker \| ONE fleet card pointing at the roster (same-checkout fleet)> (`references/coordinator-playbook.md` §3) |
| Gate state at start | <C ready \| A no binary (fallback: human pastes launch.txt)> |

## Scope files

All absolute, in the primary checkout:

- `<ABS>/.session/orchestration/<slug>/roster.md`
- `<ABS>/.session/orchestration/<slug>/COMMON.md`
- `<ABS>/.session/orchestration/<slug>/launch.txt`
- `<ABS>/.session/orchestration/<slug>/claims.md`
- `<ABS>/.session/orchestration/<slug>/reports/`

## Rounds

| Round | Workers | Started | Closed | Notes |
|---|---|---|---|---|
| 1 | <labels> | <HH:MM> | <HH:MM> | |

Rounds are concurrency groups, numbered inside the sprint or batch the run serves ("Sprint 42,
round 2"). An execution sprint of `.context/dev-roadmap.md` is an ordering, not a round.

## Conductor-only operations done for this Run

- [ ] migrations applied to the shared database, in order (<when>, numbers from the live ledger: <…>)
- [ ] generated output regenerated after the last migration (<Supabase types, api/schemas>)
- [ ] PRs merged into the integration branch in dependency order (<keys, in order>)
- [ ] staging deploy verified at the destination for each merge (<commit SHA → READY>)
- [ ] tracker cache hydrated (<when>, scope: <…>)
- [ ] generated registries regenerated after integration (<which>)

## Open decisions for the owner

1. <decision, with the recommendation>

## Log

- <YYYY-MM-DD HH:MM> — <what happened, one line>
