# ADR-0002 — One instruction source and one skill store for three harnesses

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Boilerplate maintainer (upex-galaxy), mirroring the decision already ratified in `agentic-qa-boilerplate`
- **Tags:** harness-compatibility, agents, skills, cross-cutting-invariant, tooling
- **Supersedes:** —
- **Superseded by:** —

> **Bunkai delta (2026-09-03).** This ADR is the upstream record, synced verbatim from `agentic-dev-boilerplate@aa87fe8` and adopted as-is. Where Bunkai differs: the MCP set is **six** servers (`context7`, `tavily`, `supabase`, `n8n`, `playwright`, `dbhub`), not four; the store holds 16 T1 skills (the 14 upstream ones plus `autonomous-delivery`, `jira-administration`) plus `playwright-cli` and 27 committed community skills; the "harness surfaces are generated" rule is Critical Rule **#19** in `AGENTS.md` (#15 upstream); the implementation plan referenced below lives in the upstream repository, not here. The `.claude/skills` alias is regenerated locally with `bun run agents:compat`.

---

## Context

The boilerplate started as a Claude Code project: `CLAUDE.md` was the instruction body, `.claude/skills/` the skill store, `.claude/commands/` held eight slash commands (six of them carrying a full workflow body with no backing skill), `.claude/hooks/personality-reinject.js` the only hook, and MCP servers were declared twice (`.mcp.json`, `opencode.jsonc`) with Codex and Gemini reduced to copy-paste templates under `docs/mcp/`. Seventy-nine files referenced `CLAUDE.md` by name and another seventy-nine referenced `.claude/skills/`.

Teams that adopt the boilerplate run different harnesses, and the same person often switches between Claude Code, OpenCode and Codex (CLI or Desktop) in one week. OpenCode and Codex read `AGENTS.md` and a skills directory natively; they do not read `CLAUDE.md` or `.claude/`. The obvious answer, keeping one copy per harness, had already been tried implicitly: every instruction that existed in two places drifted, and there was no check that would notice.

The sibling `agentic-qa-boilerplate` resolved the same problem first (README § "Multi-harness architecture", `AGENTS.md` §4.5) and shipped the engine (`cli/lib/agent-compatibility.ts`), the contracts, and the updater migration. Reusing that model keeps the two repos interchangeable for teams that pair them. Two facts constrain the shape: Windows checkouts do not reliably preserve symlinks, so the instruction shim cannot be one; and Codex loads project `.codex/` config and hooks only in a repository the user has marked trusted, which no file read can verify.

Plan and gap analysis: `implementation-plan.md` on branch `saiotest/harness-compatibility` (§2 gap table, §3 decisions D1-D4, §4 target layout).

## Decision

We will keep exactly one copy of every instruction and every skill, and let each harness reach it through the thinnest adapter that host requires.

1. **`AGENTS.md` is the only instruction body.** OpenCode and Codex load it natively. Claude Code loads `CLAUDE.md`, which is generated and is exactly `@AGENTS.md` plus one newline: a documented include, not a symlink, so it survives a Windows checkout. Operational prose in the shim is structural drift; `sync-ai-memory` stops instead of propagating it, and the compatibility check enforces the bytes.
2. **`.agents/skills/` is the only skill store** (the 14 existing skills plus `project-context` and `sync-ai-memory`, plus the generated `REGISTRY.md`). OpenCode and Codex read it directly. Claude Code reaches it through `.claude/skills`, a generated, gitignored POSIX symlink (Windows junction). Project-level community skills install into the same store; user-level skills stay per harness.
3. **Slash commands are transport, not workflow.** The six inline bodies move into skill modes (`project-context`: `data | features | api | master-plan | dev-roadmap | refresh-all`; `sync-ai-memory`). All eight wrappers under `.claude/commands/` and `.opencode/commands/` are generated from `.agents/compatibility/command-aliases.json`, name a target skill plus a mode, and forward `$ARGUMENTS`. Codex has no wrapper layer and invokes the skill plus mode directly.
4. **One hook emitter, three adapters.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. `.claude/settings.json` and `.codex/hooks.json` run it as a `UserPromptSubmit` command hook (the Codex adapter carries a POSIX and a PowerShell command); `.opencode/plugins/personality-reinject.js` imports the constant.
5. **Per-host MCP files with semantic parity.** `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` each declare the same four servers (`context7`, `tavily`, `supabase`, `n8n`) in their native format. Parity is checked by normalizing the three formats and comparing the `.env` variables each server depends on, so a server added to one host only fails. Codex cannot expand `${VAR}` in `args`, so its adapter uses HTTP with `bearer_token_env_var` for `tavily` and env-only auth for `supabase`. Gemini CLI and Cursor stay at the template level (`docs/mcp/*.template.*`), no runtime adapter.
6. **`bun run agents:compat:check` is the gate.** It validates the shim bytes, the alias target, both wrapper sets byte-for-byte against the manifest, the hook adapters and MCP parity, and runs in `repo:check`, unconditionally in pre-push, and in pre-commit when a harness surface is staged. `bun run agents:compat` regenerates and then checks. `bun run setup` and `bun run up` call the same repair at the end of their run. `bun run setup:doctor` reports the same surfaces plus Codex repository trust as WARN, because trust is runtime state.
7. **`bun run up` migrates instead of destroying.** A preflight that runs before any component sync promotes `CLAUDE.md` to `AGENTS.md` and leaves the shim, moves `.claude/skills/*` into `.agents/skills/` (project-authored skills included), archives collisions under `.template/pre-agents-migration/`, never deletes, is idempotent, and refuses in full when an item cannot be resolved without guessing.
8. **Commit provenance (decision D2).** The AI-attribution ban (Critical Rule #3) stands on every harness. The harness session trailer is emitted only when the running harness exposes a transcript pointer; `Claude-Session: <id>` is the only specified format today, and OpenCode and Codex sessions omit the trailer entirely. `.claude/settings.json` sets `attribution` to empty strings so the harness never appends its own line.

**Invariant every future change must uphold:** a harness-specific file under `.claude/`, `.opencode/` or `.codex/` may contain an adapter or generated output, never a second copy of an instruction, a skill, or a workflow body. If two hosts need the same text, it lives once under `.agents/` or in `AGENTS.md`, and the adapters point at it.

## Consequences

- **Positive:** one edit updates every harness; drift between hosts becomes a failing check instead of a silent divergence; a downstream project switches harness without touching content; `.agents/` is fully harness-agnostic and matches the agentskills.io layout the QA sibling uses, so the two repos stay pairable; the eight commands surface identically on Claude Code and OpenCode, and Codex users invoke the same skill modes.
- **Negative / trade-offs:** a fresh clone has no `.claude/skills` until `bun run setup` or `bun run agents:compat` runs (the alias is generated, never committed), and every worktree needs its own alias; Windows relies on junctions, which some tooling treats differently from symlinks; every project created before this change must go through the updater preflight once, and the migration must ship in the same release as the store move, never separately; Claude Code lists the six former commands as `project-context` and `sync-ai-memory` plus eight wrapper commands, which changes the picker; the OpenCode hook API is experimental and must be re-verified on upgrades; Engram and caveman remain Claude Code plugins, so the rules that mention them are no-ops on OpenCode and Codex; Codex trust cannot be asserted from the repo, only reported.
- **Neutral / follow-ups:** `.agents/compatibility/command-aliases.json` is the single place a command is declared; the hook contract text references `AGENTS.md §2`; the branch `origin/feat/codex-cli-support` is superseded and can be deleted after merge (with confirmation, Critical Rule #5); the Spanish walkthrough (`packages/pages-home/harnesses.es.html`, published at https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) is the human-facing explanation of this record.

## Alternatives considered

- **Symlink `CLAUDE.md` to `AGENTS.md`** — rejected. Git on Windows checks symlinks out as plain text files unless `core.symlinks` is enabled and the user has the privilege, so the shim would silently become a one-line text file containing a path. The `@AGENTS.md` include is a documented Claude Code feature and byte-checkable, and it costs nothing on POSIX.
- **Keep one skill copy per harness (`.claude/skills/`, `.opencode/skills/`, `.codex/skills/`) synced by script** — rejected. Three copies triple the review surface, the sync script becomes a second source of truth, and the failure mode (two copies diverge between syncs) is exactly the drift this decision removes. A generated alias for the one host that needs a fixed path is strictly smaller.
- **Symlink `.claude/skills` and commit the symlink** — rejected. The same Windows checkout problem as the shim, plus a committed symlink breaks the scaffolder tarball path. Generating it at `bun run setup` / `bun run agents:compat` time, and regenerating it from the updater, keeps the repo portable.
- **Keep the six slash-command bodies as commands and duplicate them into `.opencode/commands/`** — rejected. Command files are a harness feature, not a skill; Codex has no equivalent, so those workflows would be unreachable there. Moving the bodies into skill modes makes them reachable on every host and reduces the wrappers to transport that can be generated and diffed.
- **Drop the commit session trailer entirely (the QA model)** — rejected for this repo. The trailer is a forensic pointer into the Claude Code transcript that has already paid for itself in root-cause investigations here. Making it conditional on the running harness keeps that value where it exists and emits nothing where it does not, without weakening the attribution ban.
- **Add runtime adapters for Gemini CLI and Cursor** — deferred (D4). No user has asked; the templates under `docs/mcp/` and the `compatibility:` declaration in each skill cover discovery. Reopen if demand appears.

## References

- `implementation-plan.md` on branch `saiotest/harness-compatibility` (goal, gap analysis, decisions D1-D4, target layout, verification matrix)
- `AGENTS.md` §1 Critical Rules #3, #8, #15 and §5.5 "Multi-harness: one source, three consumers"
- `README.md` § "Multi-harness architecture: one source, three consumers"; `CONTEXT.md` §2.1; `INSTALLER.md` § "Multi-harness layout"
- `packages/pages-home/harnesses.es.html`, published at <https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html> (Spanish visual walkthrough)
- Reference implementation: `agentic-qa-boilerplate` README § "Multi-harness architecture" and `AGENTS.md` §4.5; commits `519befc7`, `9641f37`, `bedc6d9`, `405fa8f`, `eb9f7f1`, `0ac3d49`, `d881885`
- Engine and contracts: `cli/lib/agent-compatibility.ts`, `cli/lib/agent-compatibility-contracts.ts`, `cli/lib/updater-harness-migration.ts`, `scripts/agent-compatibility.ts`
- agentskills.io layout spec: <https://agentskills.io>
