# ADR-0020 — Agentic work runs in three tiers with one profile in `orchestration:`; a launched session escalates to its launcher, and workers run in bypass

- **Status:** Accepted (by the owner: the doctrine-alignment decisions of 2026-10-28 and 2026-10-29 in agentic-qa-boilerplate, recorded there as ADR-0024; extended to this repository by the owner on 2026-10-30, answer Q1 = A of the `dev-doctrine-port` worker, with the wider blast radius below recorded and the existing `permissions.deny` kept)
- **Date:** 2026-10-30
- **Deciders:** Boilerplate owner (upex-galaxy). Ported from agentic-qa-boilerplate ADR-0024 (commits `478e8c75..e3775a6b`) by the `dev-doctrine-port` worker; the QA ADR carries the full decision record (S1-S3, D1-D5), restated below
- **Tags:** orchestration, fleets, permissions, security, models, project-yaml
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The repo runs agentic work at three depths, and until now only one of them had any configuration. A human types into a session; that session may launch persistent worker sessions through the orchestrator (Orca), and any session may dispatch one-shot subagents inside a turn. A launched session may itself be a conductor (a "middle conductor") with workers of its own.

Four gaps, the same ones the QA twin measured:

1. **Who asks the human was undefined for launched sessions.** The sweep (ADR-0019) and the decision deck bound "the session talking to the human", but a middle conductor or a worker had no rule for the deck or the question tool, and the prompt hook told EVERY session in an Orca terminal never to use the question tool, a conductor included.
2. **A worker's name did not carry its terminal handle.** The harness session name, the orchestrator tab title (`<KEY> · task_<4>`), the roster key and the `Session:` commit trailer used different strings, so a commit could not be traced to the terminal that wrote it.
3. **The permission doctrine contradicted what was measured.** The orchestration skill's hard rule said workers run in the classifier mode, and `orca-machine-setup.md` told the reader to ADD `--permission-mode auto` to the agent's default arguments. But the classifier mode does prompt (below), a worker that stops on a prompt nobody watches is stalled, and the owner measured on 2026-10-28 that Orca 1.4.240's default Claude Code launch already carries `--dangerously-skip-permissions` (gotcha G79).
4. **The `orchestration:` block had one model and one effort.** No conductor model, no subagent model, no per-topic choice, no permission mode per tier. `default_model: ''` meant "the harness default", which is an alias, and gotcha G29 forbids aliases because an alias changes model between rounds.

Harness facts this decision rests on, with the date and version they were read (they move; the launch line is always confirmed against `<harness> --help` on the machine):

- **Claude Code** (code.claude.com/docs/en/permission-modes and /cli-reference, read 2026-10-28): `--dangerously-skip-permissions` equals `--permission-mode bypassPermissions` and never prompts (except a first-run dialog until `skipDangerousModePermissionPrompt: true` is set in user settings, explicit `ask` rules, and recognised critical-path removals), and deny rules block in every mode, bypass included (re-read 2026-10-29). `--permission-mode auto` runs a classifier that blocks exfiltration, `curl | bash`, force pushes, `reset --hard`, production deploys and token printing, and **after 3 consecutive or 20 total blocks it pauses and prompts the user**; when the classifier is unavailable it starts in manual mode. Subagents inherit the parent session's mode.
- **Codex CLI** (Codex approvals and security docs and `codex-rs` at tag `rust-v0.165.0`, read 2026-10-28): `-a never -s workspace-write` never prompts but keeps `.git` read-only and the network off, so a worker cannot commit; `--dangerously-bypass-approvals-and-sandbox` is the full bypass; `--approve-for-me` lets a reviewer model answer approvals.
- **OpenCode** (opencode.ai/docs/permissions and /docs/cli, source at v1.19.5 and v2.2.0, read 2026-10-28): `--auto` or `"permission": {"*": "allow"}` never prompts; no classifier mode exists.
- **Pi** (earendil-works/pi `packages/coding-agent/docs/security.md`, v1.4.0, read 2026-10-28; not a supported harness of this repo): no approval system; `--approve` skips the project-trust prompt.
- **Orca** (Orca 1.4.240, 2026-10-28): the native supervised launch (`worker-start`) takes a model and an effort but no argv, so a worker's permission mode comes from the app's per-agent default arguments; `ORCA_TERMINAL_HANDLE` is set in a dispatched worker's own environment.

The full per-harness translation table is owned by `.agents/skills/orca-orchestration/references/orca-machine-setup.md` §3.1, not by this ADR.

## Decision

We will run agentic work in three tiers configured from one profile inside the existing `orchestration:` block of `.agents/project.yaml`:

1. **Tiers.** A *conductor* is the session the human types into, or a middle conductor launched by another session. A *worker* is a session a conductor launched. A *subagent* is a one-shot dispatch inside a turn.
2. **Who asks the human.** A session is "launched by another session" when its prompt carries the fleet token `/<skill> <label> fleet worker`. Such a session never asks the human: no structured-question tool, no decision deck, no sweep. Everything meant for the human (what `agentic-dev-core/references/decision-protocol.md` §5 escalates, with §5.1 applied, and every error or blocker it cannot clear inside its brief) goes to the session that launched it, which relays; a routine at the top of the chain parks it. Exception: the human typed the request into that session directly, or the brief grants it in writing; the session then tells its launcher what was asked and answered. Canon: `decision-elicitation-doctrine.md` §0. The prompt hook says the same per role: the `ORCA:` line of a launched session differs from the one of a session the human types into.
3. **Worker name.** `<label>--<handle>`, where `label` is `[<KEY>-]<slug>` in kebab-case with single hyphens, and `--` appears only before the orchestrator terminal handle (`term_<uuid>`). Parsed by splitting on the LAST `--term_`. The same string is the harness session name, the tab title, the roster key and the `Session:` trailer. On Claude Code the identity hook composes it from the fleet token plus `ORCA_TERMINAL_HANDLE` (so a Claude launch line carries no name flag: `--name` marks the name human-set and the hook would never append the handle); the worker renames its OWN tab as its first action, and the conductor re-issues the tab rename in every liveness sweep. On Codex, OpenCode v2.2 and Pi the conductor types the harness's rename verb once the worker is ready. A harness that cannot be renamed (OpenCode v1): the roster maps name to handle and the trailer carries the roster name.
4. **Permission posture per tier.** Conductor `auto`, worker `bypass`, subagent `inherit`. The profile declares the expectation; a supervised worker's real mode is set in the orchestrator's per-agent default arguments, and the conductor verifies it at readiness (the status bar, or the process argv) before dispatching work.
5. **Profile shape.** The existing flat leaves stay. New flat leaves `conductor_model`, `conductor_effort` and `subagent_model` (template variables by the flat-key rule), a `permission_modes` map and a `model_overrides` list (both read by path, listed in `external_consumers`). `default_model` keeps its name and stays the worker model; `max_workers: 3` stays this repository's value.
6. **Vocabulary.** A mode is written in the repo vocabulary `bypass | auto | ask | inherit`, never in a harness's flag spelling.
7. **Models.** `default_model` and `conductor_model` are full provider model ids, never aliases. `''` is allowed only when the conductor reads the model off the worker's screen at readiness and records it in the roster. `subagent_model` is written in the harness's subagent vocabulary (Claude Code's Agent tool: `sonnet | opus | haiku | fable`).

## Consequences

- **Positive:** a worker runs to completion without stopping on a prompt nobody sees. One string traces a commit to the terminal that wrote it. The human hears from one session, and the upper conductor learns every decision taken under it. A project changes model, effort or permission mode per tier by editing one block. `bun sync` now marks an inserted key `upstream default` when it arrives with a value, `unset` only when it is empty.
- **Negative / trade-offs:** **worker bypass removes the last runtime check on what a worker does, and in this repository a worker reaches more than in the QA twin.** A `/sprint-development` worker runs a story end to end: it reads the running app's pages during live-UI validation, tracker comments and fetched documents, and it has the database MCP (schema writes) and the deploy CLI / MCP (deploys) in reach. An instruction injected through any of that content runs with the owner's rights, files and network, with no classifier in the way. Mitigations, none of which closes it: on Claude Code the repo's `permissions.deny` list in `.claude/settings.json` still blocks under bypass (force push, `reset --hard`, `rm -rf`, `sudo`, …); the irreversible steps are gated by doctrine, not by a permission prompt (a schema change follows `agentic-dev-core/references/db-change-doctrine.md` and, unattended, `autonomous_delivery.migrations: confirm`; a production deploy is `/sprint-development` Stage 5, gated; a push to a protected branch follows `git_strategy.policy`); a Codex, OpenCode or Pi worker never reads the Claude deny list, so there only the harness's own deny rules apply; the conductor verifies each worker's mode at readiness; and the choice is per tier, so a project that cannot accept the exposure sets `worker: auto` or `ask` and accepts stalls instead. Running workers in a container or VM is outside this repo's setup.
- **Neutral / follow-ups:** a downstream project receives the new keys through an interactive `bun sync` (insert-only); with `--auto` they are listed, not inserted, because the block already exists. A project that had `default_model: ''` keeps it until someone sets it.

## Alternatives considered

- **A middle conductor asks the human directly.** Two sessions would ask in parallel, and the upper conductor would never learn the decision it is accountable for.
- **Stricter subagents than their worker.** It needs a permission mode per subagent definition, and a subagent that hits a prompt stalls the turn that dispatched it.
- **Keep `default_model: ''`.** The harness default is an alias, the thing G29 forbids.
- **The conductor sets the whole name after launch.** A `/rename` typed into a busy session is queued, and typing into a starting session damages the label. **Handle only in the tab or the roster:** the session name and the commit trailer would still not carry it.
- **Workers in `auto` in this repository only.** The classifier pauses and prompts after 3 consecutive or 20 total blocks, and a worker that prompts with no human watching is stalled; it has no equivalent on OpenCode; and the twins would diverge. Rejected by the owner on 2026-10-30 (Q1 = A).
- **Conductors in `bypass`.** The conductor has the largest blast radius and the human is there to answer a prompt, so it keeps the classifier.
- **A nested `tiers:` map.** Nested leaves are not template variables, and it would duplicate `default_*`. **Harness-native values in the profile:** every project would carry one spelling per harness.

## References

- `.agents/project.yaml` (`orchestration:` block) and `.agents/README.md` §"`orchestration` (block inside `project.yaml`)": the keys.
- `.agents/skills/orca-orchestration/references/orca-machine-setup.md` §3.1: the per-harness translation table; `references/gotchas.md` G29, G77, G78, G79.
- `.agents/skills/agentic-dev-core/references/decision-protocol.md` §5 / §5.1 and `decision-elicitation-doctrine.md` §0: what reaches a person, and who asks.
- `.agents/hooks/personality-reinject.mjs`: the `ORCA:` line by role and the composed worker name.
- ADR-0019 (the sweep), ADR-0003 (the forensic measurements ledger). QA twin: agentic-qa-boilerplate ADR-0024.
