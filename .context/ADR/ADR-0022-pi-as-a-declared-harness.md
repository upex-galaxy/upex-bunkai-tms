# ADR-0022 — Pi is a declared harness: two files decide detection, and a secret-only block stands in for a deny list

- **Status:** Accepted (by the owner: the Pi compatibility plan of the sibling QA boilerplate, approved 2026-11-04, and the port brief of 2026-11-06; twin of the QA boilerplate's ADR-0026)
- **Date:** 2026-11-06
- **Deciders:** framework owner (boilerplate maintainer). The posture below was decided for both boilerplates in the QA plan (its Q1, Q2 and Q3) and restated in the DEV port brief; the DEV-only adaptations are the port worker's, recorded as decided.
- **Tags:** harness, compatibility, security, orchestration
- **Supersedes:** —
- **Superseded by:** —

Amends ADR-0013 (the harness list grows by one, the mechanism does not change) and corrects one claim of ADR-0020 (session naming on Pi, and "not a supported harness of this repo").

---

## Context

Pi (earendil-works) can run this repo with little of its own: it reads `AGENTS.md` and `.agents/skills` natively, and its extension API takes the shared hook emitter unchanged. The QA boilerplate measured this on Pi 1.4.0 and 1.5.0 (2026-11-04) and shipped it; this port re-ran the probes on this repo (the port report records them).

Four things differ from the harnesses already declared:

- Pi packages write runtime state under `.pi/` (`loops/`, `tasks/`, `subagents/`). ADR-0013 puts a harness "in use" while any of its files exists, so a directory-wide rule would flip a project to Pi because someone ran a package once.
- Pi has no deny config and no approval system. Rule #1 has no runtime net there, and a `/sprint-development` worker reads the running app's pages, tracker comments and fetched documents.
- Project trust gates `.agents/skills`, `.pi/mcp.json` and `.pi/extensions`. Without it a session gets `AGENTS.md` and nothing else. The default on a new machine is to ask, and print and RPC modes skip protected resources under that default.
- ADR-0020 and the orchestration doctrine said a conductor types Pi's rename verb, and called Pi "not a supported harness of this repo". The first is wrong: an extension calls `pi.setSessionName()`, the name lands in the session file as a `session_info` entry and shows on the status bar (measured in the QA boilerplate under a real `orca orchestration worker-start --agent pi`).

## Decision

We will treat Pi as a first-class harness: it is in `HARNESSES`, under the same gates as the others.

1. **Detection reads two files.** `HARNESS_FILES.pi` and `HARNESS_SYNC_PATHS.pi` are exactly `.pi/mcp.json` and `.pi/extensions/agentic-dev.js`. Never `.pi/settings.json` and never a directory, so runtime state cannot put Pi in use and a project's own extensions stay out of the sync.
2. **Existing projects are untouched.** A project that neither declares Pi nor has those files gets no Pi file and one more `NOTE:` line. The installer preselects Pi only when it detects it; with nobody to ask, `bun setup` declares a detected harness only when this repo has its files, unless `INSTALL_AGENTS` names it. `harnesses:` stays `null` in the template. A project that declares Pi later receives the adapter, and once its registry, through `bun sync` (`pi-adapter` and the bootstrap-only `pi-config` components).
3. **One adapter on the shared emitter.** `.pi/extensions/agentic-dev.js` is plain JS with no Pi import. The emitter does not change for it, and the output of the existing harnesses does not change.
4. **A secret-only block in the adapter.** A `tool_call` handler refuses direct reads of the `.env` and `.envrc` families (except `.env.example` and the schemas), `.auth/**` and `.claude/settings.local.json`, plus the commands in Claude Code's secret deny entries, and refuses malformed input. A `grep` glob that names a secret is refused, and `tool_result` drops lines from secret files out of `grep` output. A test derives its cases from `.claude/settings.json`, so a new secret entry fails until the adapter covers it. It is a seatbelt, not a boundary: `cat .env` and other shell variants pass, `pi-subagents` background children are untested, and it exists only where the adapter loads (an untrusted session, or a print or RPC session under `ask`, has none). The output filter depends on Pi's `<path>:<line>: ` grep format.
5. **`exposure: "deferred"` on every server in `.pi/mcp.json`**, with a one-line `description`. The default `codemode` hides tools from the model, and this repo resolves a capability by tool-name suffix. Tool names keep the suffix with hyphens as underscores. A `!command` value in `env` or `headers` (Pi runs it in a shell) is an error in the boilerplate and a warning downstream.
6. **ADR-0020's naming claim is corrected here.** That ADR stays as written. Pi self-names like Claude Code, and the conductor does not type `/name`.

### DEV-only adaptations (decided by the port worker)

- **The `.envrc` family is blocked too.** This repo's Claude deny list carries `Read(.envrc.local)`, which QA's does not; the parity test derived from it failed until the adapter matched `.envrc` and `.envrc.<x>`. *Beat:* any name starting with `.env`, which also refused ordinary docs such as `docs/.env-guide.md`.
- **No documentation-contract hook on Pi.** `.agents/hooks/doc-contracts.mjs` runs on Claude Code and Codex `PostToolUse`; OpenCode carries none either, so Pi follows OpenCode. *Beat:* a second `tool_result` duty in the adapter, which QA never measured.
- **No `docs/mcp/pi.template.json`.** Pi reads Claude's `mcpServers` shape, so `docs/mcp/claude.template.json` serves it as is, plus `exposure` and `description`. *Beat:* a fourth template to keep in step with the other three.
- **No launcher refusal to extend.** This repo has no wrapper that starts a harness under the loader (ADR-0016); the retired package scripts the updater reports (`RETIRED_HARNESS_SCRIPTS`) gain `pi`.

## Consequences

- **Positive:** Pi gets identity, routes, `ROUTE-PENDING:` and self-naming through code the other harnesses already use. A deleted adapter fails the boilerplate's own gates.
- **Negative / trade-offs:** the boilerplate must keep a fourth adapter passing while Pi moves fast. New scaffolds carry two more files until the installer's offer to delete them is taken. The block leaves Rule #1's text as what really binds; with worker `bypass` (ADR-0020) a Pi worker has no deny list at all, only this seatbelt. A Pi conductor cannot honour `permission_modes.conductor: auto`, because Pi has no such mode.
- **Neutral / follow-ups:** Pi has no subagents, question tool or plan mode built in, so the doctrines name their fallbacks (inline work or a supervised worker, the numbered list). `default_model` never reaches a Pi worker: it starts on the model in its own config and the conductor types `/model`. The `supabase` and `n8n` servers on Pi are loader-verified only; a full connect needs real values on a machine. Trust on a machine whose default is `ask` is unproven under Orca.

## Alternatives considered

- **A separate opt-in class for Pi** — lower promise while Pi moves fast, but a second code path through selection, doctor, installer and updater, with weaker gates.
- **Rule text only, the Codex precedent** — no code and honest about what exists, but Rule #1 would have no net on the one harness with no approvals.
- **A full port of Claude's deny list** — parity on destructive git and shell too, but a larger list to maintain, overlapping a user-level gate some machines already run.
- **`.pi/` as a whole in `HARNESS_FILES`** — simpler, and it would flip detection on runtime state.
- **The default `codemode` exposure, or `direct`** — the first hides tools from suffix resolution, the second pays their schema cost on every prompt.

## References

- ADR-0013 (declared harnesses), ADR-0016 (retire harness launchers), ADR-0020 (work profile and permission posture).
- The QA boilerplate's ADR-0026, its Pi plan and review (`.session/orchestration/sync-wave2/reports/pi-compat-*.md` in that repo).
- Pi docs shipped with the install: `docs/extensions.md`, `docs/mcp.md`, `docs/security.md`.
