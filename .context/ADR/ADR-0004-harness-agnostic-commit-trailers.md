# ADR-0004 — Harness-agnostic forensic trailers on every agent commit

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Boilerplate maintainer (upex-galaxy), owner decision `OD-trailer` = A in the dev-sync parity decision deck (2026-10-02)
- **Tags:** git, commit-provenance, harness-compatibility, cross-cutting-invariant
- **Supersedes:** ADR-0002, decision item 8 (commit provenance) only
- **Superseded by:** —

---

## Context

ADR-0002 item 8 kept the AI-attribution ban (Critical Rule #3) and allowed one exception: a `Claude-Session: <id>` trailer, emitted only when the running harness exposes a transcript pointer. In practice that meant Claude Code commits carried a trailer and OpenCode and Codex commits carried nothing, so two of the three supported harnesses left no provenance at all.

Two things changed. This repo now runs parallel agent sessions in linked worktrees (`bun run worktree:provision`, `orca.yaml`), so "which checkout and which session wrote this commit" is the question an incident review actually asks, and a Claude-only session id answers it for one harness out of three. And the sibling `agentic-qa-boilerplate` had already replaced its trailer with two harness-agnostic keys, `Worktree:` and `Session:`, resolved once per prompt by its hook and injected as an `AGENT IDENTITY:` line; teams that pair the two repos were writing two different provenance formats.

A branded key also reads as attribution, names the tool instead of the work, and goes stale when the tool changes.

## Decision

We will end every commit an agent session writes with exactly two trailers, in this order:

```
Worktree: <worktree name | primary>
Session: <session label>
```

1. **One source for the values.** The prompt hook (`.agents/hooks/personality-reinject.mjs`) resolves worktree, session label and harness on every prompt and injects `AGENT IDENTITY: worktree=… session=… harness=…` on Claude Code, Codex and OpenCode alike. Agents copy the line; they never re-derive it per commit. An unresolvable value is written `unknown`, never guessed and never dropped.
2. **Harness-branded trailers are forbidden**: `Claude-Session:`, any `<Tool>-Session:`, an AI `Co-Authored-By:`, a "Generated with …" line. The ADR-0002 exception is withdrawn.
3. **Enforcement is a warning, not a gate.** `.husky/commit-msg` runs `scripts/check-commit-trailers.ts`, which reports a missing or misplaced pair and any branded trailer, and always exits 0.
4. **PR bodies carry the same pair** (`- Worktree:` / `- Session:`) instead of a session id and a `~/.claude/projects/…` transcript path.

The canon (label rule, parsing, examples) lives in `.agents/skills/git-flow-master/SKILL.md` §3.2; Critical Rule #3 in `AGENTS.md` points at it.

## Consequences

- **Positive:** every harness produces the same provenance, so `git log --grep 'Session: <label>'` finds one session's commits regardless of tool; the trailers survive a tool change; the identity line also feeds the unprovisioned-worktree and missing-`.env` warnings from the same hook; the format matches the QA sibling.
- **Negative / trade-offs:** the direct transcript pointer is gone, so reaching the transcript of a Claude Code commit goes through the session label (the resume picker, the session index) instead of a file path; a session label can change mid-session, so two commits of one session may carry different labels; commits written before this ADR keep `Claude-Session:` lines, which is history and is not rewritten; humans committing by hand see the warning until they add the pair or ignore it.
- **Neutral / follow-ups:** the commit-msg check is a small standalone script so the later gates consolidation can call it from a shared gates file; `.husky/commit-msg` is on the updater's protected watchlist, so a downstream project with its own commit-msg gate keeps it; the Orca fleet skill, when ported, consumes the same `AGENT IDENTITY:` line.

## Alternatives considered

- **Keep `Claude-Session:` and add per-harness siblings (`Codex-Session:`, …)** — rejected. Three keys for one fact, each branded, and OpenCode exposes no transcript pointer to put in one.
- **Drop provenance trailers entirely** — rejected. With parallel worktree sessions, a commit with no provenance cannot be routed back to the session that explains it, and an absent trailer is indistinguishable from an old commit.
- **Block the commit when the trailers are missing** — rejected for now. A hard gate would stop human commits and merge commits that legitimately lack an agent identity; the warning makes the rule reachable without making it a new failure mode.

## References

- `AGENTS.md` §1 Critical Rule #3, §5.5 "HOOK: one emitter, three adapters"
- `.agents/skills/git-flow-master/SKILL.md` §3.2; `references/conventional-commits.md` § Hard rules; `references/pr-templating.md`
- `.agents/hooks/personality-reinject.mjs`, `.opencode/plugins/personality-reinject.js`, `cli/lib/agent-compatibility-contracts.ts`, `cli/lib/agent-identity.test.ts`
- `scripts/check-commit-trailers.ts`, `.husky/commit-msg`
- ADR-0002 (item 8, superseded by this record)
- Reference implementation: `agentic-qa-boilerplate` `.agents/hooks/personality-reinject.mjs` and `orca-orchestration/references/session-identity.md`
