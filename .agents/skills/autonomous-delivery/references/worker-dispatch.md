# Worker dispatch: an unattended run whose Phase 3 goes to supervised workers

> Loaded only when the orchestration gate passes (binary present and runtime reachable; canon in the user-level skill `/agent-orchestration`) and Phase 3 dispatches to a supervised worker instead of an in-session subagent. When the gate fails, the run is exactly what `SKILL.md` documents, and its report does not name the orchestrator.

`/autonomous-delivery` is the WHAT of every unattended run: Phase 0 lock per mode, Phase 1 audit (git is truth), Phase 2 selection of genuinely unblocked work, Phase 3 execution through the owning pipeline skill, Phase 4 close and report, plus the hazard catalogue and the migration gate. `/agent-orchestration` is the HOW of launching, waiting on and closing the workers. Each concern has one owner:

| Concern | Owner | What the other one does |
|---|---|---|
| lock | this skill (`.session/autonomous-delivery/<mode>/lock.json`, `lock_staleness_minutes`) | the routine lock of the orchestration skill's automations reference is not taken a second time: one lock per run, the mode's |
| audit, selection, empty run | this skill, Phases 1 and 2 | nothing: its "empty run" and "the deployed environment is truth" rules say the same for routines that are not delivery |
| cap | `autonomous_delivery.caps` (story 1 per run, bug up to 3 sequential, discovery writes no code) | `orchestration.max_workers` only lowers it, never raises it: the lower of the two wins |
| run report and handoff | this skill (`.session/autonomous-delivery/<mode>/`, written as it goes) | each worker's handle and dispatch id is added to that report the moment it opens |
| launching, waiting, closing, orphan audit | `/agent-orchestration` (conductor cycle §2 to §6) | the dispatched worker runs `/sprint-development <KEY> fleet worker` with the briefing component 7 that Phase 3 requires (migration gate, worktree path, no-rebase rule, context-budget stop) |
| migration, merge, deploy | this skill gates them; a worker never applies a migration to the shared database | the conductor-only list in `agentic-dev-core/references/fleet-project-profile.md` §4 is the same rule for a supervised fleet |
| brakes | this skill, "The three brakes" | the orchestration skill's brakes are the same three and are not applied twice; a fix run never chains |

A delivery routine's versioned prompt therefore opens with `/autonomous-delivery <mode>` and restates nothing of the orchestration skill's run discipline. The scope, launch file and topology rows are in `agentic-dev-core/references/fleet-launch-seam.md` §4; the routine recipes are in `fleet-project-profile.md` §2.
