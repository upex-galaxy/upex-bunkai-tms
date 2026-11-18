---
name: orca-orchestration
description: "Renamed: load agent-orchestration. Transition stub for the old fleet orchestration skill; use only when a session or an older instruction still names orca-orchestration."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: workflow
---

# orca-orchestration: renamed to agent-orchestration

This skill was renamed: load the user-level skill `/agent-orchestration` (from `upex-galaxy/agentic-user-skills`) and follow it instead.

If it is not installed, run `bun setup`; until then a fleet runs on one-shot subagents plus the `launch.txt` lines a human pastes.

This repo's own parts are `agentic-dev-core/references/fleet-launch-seam.md`, `agentic-dev-core/references/fleet-provisioning.md` and `agentic-dev-core/references/fleet-project-profile.md`.

This stub is deleted once every downstream repo has synced (ADR-0025).
