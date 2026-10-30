# ADR-0006 — A skill is invoked by its name plus a mode; the command-alias layer is retired

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Boilerplate maintainer (upex-galaxy), owner decision `OD-aliases` = A in the dev-sync parity decision deck (2026-10-02)
- **Tags:** harness-compatibility, skills, updater, cross-cutting-invariant
- **Supersedes:** ADR-0002, decision item 3 (slash commands as generated transport) and the wrapper half of item 6 (the compat gate); the `sync-ai-memory` references in items 1 and 2
- **Superseded by:** —

---

## Context

ADR-0002 moved every workflow body out of the slash commands and into skill modes, and kept the command files as generated transport: one manifest (`.agents/compatibility/command-aliases.json`), an optional project overlay, a wrapper per alias per host under `.claude/commands/` and `.opencode/commands/`, a `commands` updater component, a `Commands` parity surface and a wrapper group in `agents:compat:check`.

Once the bodies lived in skills, the transport bought very little. Claude Code merged custom commands into skills, so `/project-context data` already reaches the skill with `$ARGUMENTS = data`, and a wrapper with a skill's name registers the same slash twice. Codex never had a wrapper layer. Only OpenCode lost a shortcut, and its native `skill` tool loads the same skill from prose. Meanwhile the layer cost a generator, a merge engine, an overlay contract, a parity surface, its own tests, and a class of drift (stale or hand-edited wrappers) that existed only because the files were generated.

`sync-ai-memory` had the same shape problem from the other side: a skill that re-audited every doc after the fact, which nothing triggered, so the drift it was written to catch kept accumulating between runs. Its mechanical checks already had a better home in `bun run docs:check` (roster and quoted-script findings) and `agents:compat:check` (the `CLAUDE.md` shim).

The sibling QA boilerplate made both retirements first; this record adapts them to the development boilerplate.

## Decision

We will invoke a skill by its own name plus a mode, on every harness, and ship no command files.

1. **Invocation.** Claude Code: `/<skill> <mode> [args]`. OpenCode and Codex: in prose ("load project-context, mode data"). Every multi-mode skill carries a `## Mode routing` section: the first token of `$ARGUMENTS` IS the mode when it names one, the rest is forwarded; otherwise the trigger phrase decides, and an interactive skill asks when that is unclear (an unattended skill fast-fails). The former alias names survive as trigger phrases only.
2. **No generated commands.** The manifest, the overlay contract, the wrapper generator, the `commands` updater component and the `Commands` parity surface are removed. `bun run up` deletes the retired manifest and wrappers downstream through `deprecatedFiles`; a lock that still carries the `commands` cursor is ignored, never an abort.
3. **The harness command directories belong to the project.** A project may keep its own commands there. One exception is enforced: a command whose name equals a repo skill hides that skill's instructions, so `agents:compat:check` fails on it and every repair (`agents:compat`, `bun run up`, `bun run setup`) moves it to `.backups/shadowing-commands/`, recoverable, never deleted. A project overlay left from the alias era is named once as an informational parity row; its wrapper files stay as plain project commands.
4. **Docs are kept in step by the change that moved them.** `sync-ai-memory` is retired. `bun run docs:check` and `agents:compat:check` are the mechanical half; `agentic-dev-core/references/docs-follow-through.md` is the judgment half, run in the same PR (`sprint-development` Stage 3 cites it).

**Invariant:** a harness command file never stands between a user and a skill. If two hosts need to reach the same workflow, it is a skill mode, and the invocation names the skill.

## Consequences

- **Positive:** one invocation form everywhere; no generator, overlay or wrapper drift left to check; a skill registers once on Claude Code; the updater and parity report lose a component and a surface; the compat gate gains a guard against the one command shape that actually breaks a skill.
- **Negative / trade-offs:** OpenCode users lose the slash shortcuts and type the skill and mode in prose; every downstream project loses its generated wrappers on the next `bun run up` (project-declared commands stay, but stop being generated and are edited by hand); the docs follow-through depends on the author running it, with `docs:check` catching only the mechanical half.
- **Neutral / follow-ups:** the human pages under `docs/` and `packages/` that still teach the wrappers are rewritten by the docs-and-decks currency pass, not here; `docs:check` keeps the retired overlay path in its optional-path list because older projects may still carry it.

## Alternatives considered

- **Keep the wrappers, drop only the overlay** — rejected. The generator, the parity surface and the drift class stay for a shortcut only OpenCode uses.
- **Keep `sync-ai-memory` and schedule it** — rejected. A scheduled re-audit still finds drift after the PR that caused it merged; the fact is cheapest to fix in the PR that moved it.
- **Delete shadowing commands instead of moving them** — rejected. The file is the project's, and its body may hold something worth porting into the skill.

## References

- ADR-0002 (items 1-3, 6), ADR-0005 (capability resolution, same skill-first direction)
- `AGENTS.md` §1 Critical Rule #15, §4 and §5.5
- Engine: `cli/lib/agent-compatibility.ts` (`commandsShadowingSkills`, `removeShadowingCommands`); updater: `cli/update-boilerplate.ts` (`RETIRED_COMMAND_WRAPPERS`, `RETIRED_SKILL_FILES`), `cli/lib/updater-core.ts` (`cleanupDeprecated`, `dropDeprecatedDeletes`), `cli/lib/updater-parity.ts`
- `.agents/skills/agentic-dev-core/references/docs-follow-through.md`; `scripts/lint-docs.ts` (`docs:check`)
- Reference implementation: `agentic-qa-boilerplate` PR #52 (retire command aliases) and PR #55 (retire sync-ai-context)
