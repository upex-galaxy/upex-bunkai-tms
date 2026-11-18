# Fleet project profile: what this repo fills into `/agent-orchestration`

> Loaded by a conductor of this repo once per Run, after the user-level skill `/agent-orchestration`. The skill is generic: it names slots ("the project's profile", "the project's provisioning step", "the project's git skill", "the project rules") and lets the project fill them. This file fills them for this repo. Siblings: `fleet-launch-seam.md` (how workflow skills hand work to a fleet) and `fleet-provisioning.md` (a fresh worktree).

| Slot in the skill | This repo |
|---|---|
| the project's profile | the `orchestration:` block of `.agents/project.yaml` (§1) |
| the project's provisioning step | `fleet-provisioning.md` (`bun run worktree:provision`, the `orca.yaml` hooks, `bun run worktree:audit --rescue`) |
| the project's git skill | `/git-flow-master`: branch names, commit style and the forensic trailers (§3) |
| the project rules a worker obeys | `AGENTS.md` and the fill-ins of §6 |
| the project's tracker | Jira through `[ISSUE_TRACKER_TOOL]` (`/acli`) and the PBI cache under `.context/PBI/` |
| the project's session-handoff flow | `/session-handoff` |
| the scope dir | `<<PRIMARY_ROOT>>/.session/orchestration/<slug>/`, or the workflow skill's own scope (`fleet-launch-seam.md` §2.1) |

---

## 1 · The profile keys

The skill reads these keys by path from `.agents/project.yaml` `orchestration:`; the old template variable names of the retired repo skill map to them as below. Variable syntax and checkout roots: `.agents/README.md`. The values are the owner's posture, recorded in ADR-0020; read them from the file, never from a doc.

| Key | Old name | Applied |
|---|---|---|
| `max_workers` | `{{MAX_WORKERS}}` | the cap per round |
| `default_agent`, `default_model`, `default_effort` | `{{DEFAULT_AGENT}}`, `{{DEFAULT_MODEL}}`, `{{DEFAULT_EFFORT}}` | the worker tier; a full model id, never an alias (G29) |
| `conductor_model`, `conductor_effort` | `{{CONDUCTOR_MODEL}}`, `{{CONDUCTOR_EFFORT}}` | a conductor another conductor launches (G77) |
| `subagent_model` | `{{SUBAGENT_MODEL}}` | one-shot subagents, in the harness's own subagent vocabulary (`sonnet`, `opus`, `haiku`, `fable` on Claude Code), never a full id |
| `permission_modes` | none (read by path) | the mode per tier, `bypass` / `auto` / `ask` / `inherit`, translated per harness in the skill's machine setup §3; ADR-0020 records the accepted exposure, and a Pi conductor can only run `bypass` (ADR-0022) |
| `model_overrides` | none (read by path) | entries matched against a brief's topics |
| `orchestrator_name`, `orchestrator_cli`, `message_verb`, `terminal_verb`, `orchestrator_skills` | `{{ORCHESTRATOR_NAME}}`, `{{ORCHESTRATOR_CLI}}`, `{{MESSAGE_VERB}}`, `{{TERMINAL_VERB}}` | no longer read by the skill, which names Orca and its verbs itself; kept in the file while the profile is the owner's (`.agents/project.schema.yaml`) |

A missing `orchestration:` block degrades instead of breaking: cap 1, the harness defaults. Vocabulary: a round is one concurrency group ("Sprint 42, round 2"); an execution sprint is an ordering bucket of `.context/dev-roadmap.md` and is not a round.

---

## 2 · Routines that fit this repo

The run discipline (lock, cap, empty run, report as you go, brakes) is the skill's automations reference. An unattended delivery routine is `/autonomous-delivery`, and the split of duties is `autonomous-delivery/references/worker-dispatch.md`.

| Routine | Cadence | Workspace | What it does |
|---|---|---|---|
| Unattended story delivery | daily, off-hours | existing | `/autonomous-delivery story`: one genuinely unblocked story per run, one worker in its own worktree, PR opened, nothing merged without its gates |
| Bug burn-down | daily | existing | `/autonomous-delivery bug`: up to the mode's cap, sequentially, each worker closed before the next |
| Backlog discovery | sprint start | existing | `/autonomous-delivery discovery`: backlog definitions only, never code; a same-checkout worker is enough |
| Hydrate the tracker cache | daily | existing | `bun run context:hydrate`, so the next run's audit starts from a fresh cache |
| Artifact-status guard | weekly | existing | check every in-flight ticket against `agentic-dev-core/references/artifact-lifecycle.md` and list the mismatches; it touches nothing |

A delivery routine's versioned prompt opens with `/autonomous-delivery <mode>` and restates nothing else. Nobody will answer a question, so an ambiguous case becomes a parked item in the report and never an `ask`.

---

## 3 · Session identity and trailers

- The emitter is `.agents/hooks/personality-reinject.mjs`, with one adapter per harness kept in sync by `cli/lib/agent-compatibility-contracts.ts`. It injects one line per prompt: `AGENT IDENTITY: worktree=<name|primary> session=<label> harness=<claude-code|codex|opencode|pi>`. When the `orca` binary is reachable it adds the `ORCA: available.` line, which names `/agent-orchestration` and the worker's channel; when the gate fails, nothing is injected.
- On Claude Code the hook composes the session name `<label>--<handle>` from the prompt token `/<skill> <label> fleet worker`; on Pi the extension does the same. A pasted line that sets a name flag marks the name as human-set, and the hook then leaves it alone, so the flag's value must already carry the handle (the skill's `launch.txt` template does).
- Every agent commit ends with `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` line (Critical Rule #3, ADR-0004). The canon is `/git-flow-master`; the skill defines no trailers.

---

## 4 · Decisions and conductor-only operations

**Decisions.** A worker's escalations follow `agentic-dev-core/references/decision-protocol.md` §5 (§5.1 applied); a conductor relays the rest to the human with `agentic-dev-core/references/decision-elicitation-doctrine.md` (sweep for small items, `mkd` deck for heavy ones), and a product question under `decision_authority.product: decide` goes to the scored decision subagent of §5.1. Owner answers go to `.session/decisions/<slug>-<date>.json` (or the log the workflow keeps), the record `decision-protocol.md` §6 writes and §2 searches first. An unattended routine (`/autonomous-delivery`) parks the item instead.

**Conductor-only operations in this repo**, added to the skill's conductor cycle §7:

- Schema migrations on a shared Supabase database. The conductor takes the migration number from the live ledger (never a branch's directory listing), applies it, and broadcasts the result; a worker that needs one sends `BLOCKED: migration` with the SQL. The gate is `/autonomous-delivery` (Migration gate) and `agentic-dev-core/references/db-change-doctrine.md`.
- Generated output from a shared live instance: Supabase types and `bun run api:sync` into `api/schemas/`, once, after any migration lands.
- Merges into the integration branch and the staging deploy, in dependency order (`.context/dev-roadmap.md`), one at a time, each deploy verified at the destination (Critical Rule #16).
- The sprint report (`.context/reports/SPRINT-{N}-DEVELOPMENT.md`) and cache hydration (`bun run context:hydrate`). A worker syncs and transitions its own ticket.
- The automation identity: when two workers need the same `testing.automation_identity` slot, the conductor serializes their live-UI validation or declares a second identity (`sprint-development/references/live-ui-validation.md` §3.5).
- `.agents/skills/REGISTRY.md` and the surfaces `bun run agents:compat` writes: regenerated at integration, never hand-merged.

**Harvest.** `skill-improvements.md` feeds the next edit of the skills it names, through the owning skill (a skill edit runs `skill-creator` and `agentic-dev-core/references/skill-scaffold.md`; an instruction edit runs `agentic-dev-core/references/instructions-doctrine.md` §6), never as a drive-by in a story branch.

---

## 5 · Routing a worker: `ROUTE-SCOPE`

This repo's prompt hook injects `ROUTE:` lines from the router in `AGENTS.md`. A worker prompt is its worst input, so the prompt ends with `ROUTE-SCOPE: <section ids>` (the `id:` of `.agents/instructions/agent-*.md`, a few words, or `none`) and the hook classifies that sentence instead of the prompt (ADR-0018). A worker reads its `ROUTE:` lines first, then `COMMON.md`, then its brief; a `ROUTE-OPTIONAL:` line is read only when the work needs it. This is the project's half of worker contract rule 15.

---

## 6 · `COMMON.md` fill-ins

The conductor copies the skill's `COMMON.md` template and fills its "Project rules" section from here:

1. Read `AGENTS.md` first. The Critical Rules that matter most for a worker: #3 (no AI attribution), #5 (never rewrite pushed history), #6 (tests, then types, then lint), #7 (read before edit), #10 (read `package.json` for scripts, never quote a command from a doc), #13 (no global git discards; restore only paths you modified), #14 (UI fidelity: reuse the live components), #16 (verify at the destination), #18 (no comments in code by default).
2. Repo artifacts are English (Critical Rule #12). Never push to a protected branch (Critical Rule #4), merge, deploy, apply a shared migration or post to chat unless the brief assigns that step; a story worker pushes its own branch and opens its own PR.
3. Generated files are generated: do not hand-edit `.agents/skills/REGISTRY.md`, the `bun run agents:compat` surfaces, Supabase types or `api/schemas/`; report one that went stale.
4. Run the gates before each commit in the Critical Rule #6 order, script names read from `package.json`; a change to skills or docs also runs the skill and docs checks the same file declares.

Lint traps that reject a commit here:

- `SKILL-LITERAL-TOOL`: a literal issue-tracker CLI command in a skill that is not that tool's owner. Write `[ISSUE_TRACKER_TOOL] <Verb>: …` pseudocode (`agentic-dev-core/references/skill-composition-strategy.md`).
- `SKILL-HARDCODED-CFID`: no literal custom-field ids outside the tool-owner skills.
- `STALE-PATH`: every inline-code path in a `SKILL.md` or a `references/*.md` must exist on disk; cross-skill cites use the full path.
- `vars:check`: every project variable you write must resolve (`.agents/README.md`).

Where things are:

- Skills: `.agents/skills/<slug>/SKILL.md` plus `references/`; shared doctrine in `.agents/skills/agentic-dev-core/references/`.
- Project variables: `.agents/project.yaml`.
- Tracker catalogs: `.agents/jira-fields.json`, `.agents/jira-workflows.json`, `.agents/jira-required.yaml`.
- Story context: the Jira cache under `.context/PBI/` (read-only; `.agents/instructions/agent-local-context-pbi.md` §9), the dependency edges in `.context/dev-roadmap.md`, the design plan for UI stories (`.context/design/master-design-plan.md`).
- Scripts: `package.json`, read directly.
