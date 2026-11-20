# ADR-0025: the orchestration doctrine moves to the user-level skill `agent-orchestration`

- **Status:** Accepted (by the owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** framework owner (boilerplate maintainer)
- **Tags:** orchestration, skills, user-level, router, updater
- **Supersedes:** none
- **Superseded by:** none

---

## Context

The repo skill `orca-orchestration` carried the whole fleet doctrine (gates, conductor cycle, worker contract, channel discipline, claims, the dated gotchas ledger) plus this repo's own parts (launch seam, provisioning, the project profile). Every boilerplate and every downstream repo held its own copy. The copies drifted: the copy here and the QA boilerplate's differ in every one of the twenty files they share, and the downstream copies differ again. A fix measured in one repo reached none of the others.

The generic doctrine does not depend on this repo. It depends on the orchestration runtime, which is per machine. The owner's rule for where a skill lives: whatever travels in a project install and is specific to that project stays in the boilerplate; a skill a person uses across projects lives in `upex-galaxy/agentic-user-skills` and installs at user level.

## Decision

We move the generic doctrine to the user-level skill `agent-orchestration` (repo `upex-galaxy/agentic-user-skills`), installed by `bun setup` through `USER_LEVEL_SKILLS` and refreshed by `bun sync`. The owner's decisions D1 to D3 of 2026-11-18 apply:

1. **Name (D1).** The skill is `agent-orchestration`. The old folder keeps only a transition stub, `.agents/skills/orca-orchestration/SKILL.md`, that says "renamed, load `agent-orchestration`". It is deleted once every downstream repo has synced.
2. **Where it lives (D2).** The doctrine lives in `agentic-user-skills`. This repo keeps only what is specific to it, in `.agents/skills/agentic-dev-core/references/`: `fleet-launch-seam.md`, `fleet-provisioning.md` and `fleet-project-profile.md`; the unattended delivery split goes to `.agents/skills/autonomous-delivery/references/worker-dispatch.md`; the delivery-fleet partition stays in `.agents/skills/sprint-development/references/fleet-mode.md`.
3. **How it is reached (D3).** The skill is not in `REGISTRY.md` and carries no compact rules. It loads by name through the `orca` row of `.agents/instructions/agent-tool-resolution.md` §6.5 and the `[ORCHESTRATION_TOOL]` row of §6. Worker rules travel in the `COMMON.md` the conductor fills. With the skill missing, the binary gate falls back to one-shot subagents plus `launch.txt`.

The router row "fleets, workers, multi-agent dispatch plans, gates" changes its "Also" cell from `orca-orchestration` to `agent-orchestration`. Router fingerprint after the change: `4d9c70b883ba`.

The updater retires the twenty removed files through `RETIRED_ORCHESTRATION_FILES` in `cli/update-boilerplate.ts`, each backed up first, so a downstream `bun sync` ends with the stub only. A downstream copy that was edited keeps its old `SKILL.md` body in `--auto`; the manual steps are in the move's final report.

## Consequences

- **Positive:** one copy of the doctrine for every repo on the machine; a measured gotcha reaches every project on the next skill update; this repo's L2 drops about 300 KB of orchestration text it no longer maintains.
- **Negative / trade-offs:** the doctrine is now outside the repo's own gates (`skills:check`, `STALE-PATH` cannot see it), so a citation to it is by name and section words, never by path. A machine without the user skill gets the fallback until `bun setup` runs.
- **Neutral / follow-ups:** the profile keys `orchestrator_skills`, `message_verb` and `terminal_verb` are no longer read by the skill and stay in `.agents/project.yaml` (the owner's file). A "not installed" line in `cli/lib/user-skills-update.ts` is a joint follow-up with the QA boilerplate, because that file is shared byte for byte.

## Alternatives considered

- **Keep a repo copy per boilerplate and sync it.** Rejected: it is the arrangement that drifted.
- **Delete the old folder outright.** Rejected: a session or a downstream instruction that still names `orca-orchestration` would find nothing; the stub tells it where to go.

## References

- Owner decisions D1, D2, D2b, D3 (2026-11-18) of the agent-orchestration move.
- router fingerprint 4d9c70b883ba (the lock line under the router in `AGENTS.md`).
- ADR-0014 (the router lock and the edit procedure), ADR-0018 (`ROUTE-SCOPE`), ADR-0020 (the agentic-work profile).
- `.agents/skills/agentic-dev-core/references/fleet-project-profile.md`.
