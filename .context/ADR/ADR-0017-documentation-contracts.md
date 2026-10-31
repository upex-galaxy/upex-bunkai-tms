# ADR-0017 — Documentation contracts: region markers, a push and CI gate with a `Docs-Checked:` escape, an edit-time reminder

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): decision B15 of handoff 07 (2026-10-05), "approved with conductor recommendations: v1 in the two boilerplates only (no downstream distribution yet); push + CI BLOCK with an explicit `Docs-Checked: <label> <reason>` trailer escape, commit only warns; drift-sweep subagent runs only when a PR touches `cli/`, `scripts/`, `.husky/` or instruction files; option B of the doc-contracts spike, QA first then DEV port". Twin decision in agentic-qa-boilerplate: its ADR-0016. Ported here by unit b15-d
- **Tags:** docs, gates, husky, ci, hooks, harness-compatibility
- **Supersedes:** —
- **Superseded by:** —

---

## Context

A read-only spike over both boilerplates measured the drift that merged PRs leave behind. Of the five PRs this repo merged in one day, three left 20 stale sites on `main`. Almost every site had one shape: a PR changed a behaviour (which harnesses MCP parity covers, how a stdio server reaches `.env`, how a ROUTER row is locked) and updated the page its author remembered, while a parallel page describing the same behaviour in prose kept the old sentence. The parity rule alone was restated in nine files. Removals did not drift: a dead word can be grepped to zero.

This repo already ran every doc check on every PR (`repo:check` in `ci.yml`), and the drift passed anyway: `docs:check` proves that words resolve (links, paths, quoted scripts), never that a sentence is still true. It also ran in no husky hook. The docs follow-through (`agentic-dev-core/references/docs-follow-through.md`) fired on renames, not on behaviour changes, and its surface table left out the decks and the Pages home, the surface every drifting PR missed.

## Decision

Option B of the spike, sized small, with the same script, hook and wording as the QA boilerplate.

1. **Markers.** A code region a page describes is wrapped in `LINT.IfChange(<label>)` and `LINT.ThenChange(<path>[#anchor], ...)` comment lines, Google's syntax, so any model reading the file knows what they mean. A marker counts only when it is the whole content of a comment line and not inside a Markdown fence. Labels are kebab-case and unique across the repo. Targets are checked at FILE level; the anchor is for the reader. Grammar: `scripts/lib/doc-contracts.ts`.
2. **Gate.** `scripts/lint-doc-contracts.ts`. When a change touches a region's content lines, EVERY target must change in the same range ("any" would let a PR that updated one page and missed its twin pass). Escape: a commit in the range carrying `Docs-Checked: <label> <reason>`; a trailer without a reason does not count. A region created in the range cannot be violated by the change that creates it. Pre-commit WARNS (`--staged`): pages often land in the next commit of the same push. Pre-push BLOCKS (`--push`, range from the merge-base with `origin/HEAD`, else `origin/main`). CI BLOCKS on the PR range (`ci.yml`, pull requests only, full-history checkout). The structural lint (balanced markers, unique labels, targets on disk) runs inside `docs:check` as an error.
3. **Edit-time reminder.** `.agents/hooks/doc-contracts.mjs`, a `PostToolUse` command hook on file edits in Claude Code (`Edit|Write|MultiEdit`) and Codex (`Edit|Write`, which Codex maps to `apply_patch`). When an edit lands inside a region it adds one `DOCS:` line naming the pages, once per session per label. OpenCode registers nothing: injecting model context from its `tool.execute.after` event is not verified, so it relies on the gate. `agents:compat:check` holds the two registrations in the boilerplate (`validateDocContractHooks`).
4. **Drift sweep.** The docs follow-through gains a report-only step that greps the doc surface for prose describing the old behaviour. It runs only when the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, after the verification gates, and it counts the `Docs-Checked:` trailers the change used. It is the only piece that finds a coupling nobody declared.
5. **Gaps closed alongside.** `docs:check` runs on every push (where the script exists); the docs follow-through triggers on behaviour changes and lists `packages/decks/**` and `packages/pages-home/**`.
6. **Scope: maintainers only (v1).** The gate, the structural lint and the hook bind only where `package.json` names the boilerplate (`isSchemaOwner`) AND `.agents/project.yaml` carries the maintainer sentinel (`isMaintainerCopy`). Downstream every mode prints one line and exits 0, and the hook stays silent: the markers ship in synced `cli/` and `scripts/` files but point at pages a project owns or does not have.

Seeded on the regions the spike measured as drift sources here: `harness-selection` (`declaredHarnesses` in `cli/lib/harness-selection.ts`), `mcp-parity` (`validateMcpParityFindings`) and `mcp-env-loader` (the loader head) in `cli/lib/agent-compatibility-contracts.ts`, `instruction-locks` (the lock, eval and complete-section findings of ADR-0014 in `scripts/lint-instructions.ts`). Every drift found later becomes a new marker.

## Consequences

- **Positive:** the drift shape the spike measured now fails the push that creates it, naming each page; the agent hears about the pages at the moment it edits the code, in the two harnesses that can carry it; `docs:check` finally runs in a hook.
- **Negative / trade-offs:** a marker exists only where someone anticipated the coupling, which moves the memory problem earlier rather than removing it; the drift sweep is the backstop. The `mcp-parity` region names eleven pages because the rule is restated in that many places: a behaviour change there costs eleven edits until the fan-out is collapsed into one home page, and a refactor inside a region costs one trailer line with a reason. A trailer cannot be added to a pushed commit: an ack after the fact is an empty commit carrying the line. The hook adds a node start (tens of milliseconds) to every edit.
- **Neutral / follow-ups:** collapsing the parity fan-out (one home page, one-line pointers elsewhere) would shrink the `mcp-parity` target list. Downstream opt-in (a project seeding its own markers) is a v2 decision, not taken here.

## Alternatives considered

- **Generate the drifting facts with a check mode and nothing else.** Rejected as the answer: none of the measured sites was a generatable fact; Critical Rule #17 already pushed those out of prose.
- **Semantic doc tests.** Rejected: one fixture and runner per prose claim, in Spanish HTML decks and English Markdown, to learn what the code's own tests already say. A test cannot tell a sentence is stale.
- **File-level contracts on hot files.** Rejected: every bug fix in a hot file would need an acknowledgement.
- **Warn-only everywhere.** Rejected by the owner: the measured drift already passed a process with every doc check green. The escape keeps the block cheap.
- **Block at pre-commit.** Rejected: docs routinely land in the next commit of the same push, and a per-commit block teaches `--no-verify`.
- **A central contracts file with keyword lists.** Rejected: a second document that drifts, and keywords did not find the measured sites. The marker lives next to the code.

## References

- Spike: the doc-contracts plan in the QA boilerplate's local session tree (gitignored), option B and unit 3.
- Twin: agentic-qa-boilerplate ADR-0016 (same script, hook, trailer and messages).
- Prior art: Chromium "keep files in sync" (`LINT.IfChange` / `LINT.ThenChange`, `NO_IFTTT=` bypass); Fuchsia presubmit checks.
- Code: `scripts/lib/doc-contracts.ts`, `scripts/lint-doc-contracts.ts`, `.agents/hooks/doc-contracts.mjs`, `.husky/framework-gates.sh`, `.github/workflows/ci.yml`, `validateDocContractHooks` in `cli/lib/agent-compatibility-contracts.ts`.
