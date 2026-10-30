# ADR-0018 — Routes the agent actually reads: a scoped, ranked and capped `ROUTE:` cue, re-surfaced once on Claude Code, and hook groups that reach every project

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): decision B11 of handoff 07 (2026-10-05), "cap ROUTE lines per long prompt + stronger ROUTE cue, re-measure with instructions:audit; QA first, DEV port after", read with the principle of decision B4 that a project is never blocked by boilerplate evolution. Twin decision in agentic-qa-boilerplate: its ADR-0017 (route adherence, PR #120) and the hook-group merge of its PR #122. Ported here by unit b11-d; the technical calls inside B11 (the ranking, the cap of three, the re-surface event, the scope sentence, the eval metrics, the additive hook merge) were made by the QA workers under that approval and are kept as made
- **Tags:** instructions, hooks, updater, multi-harness, orchestration, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0009 made the prompt hook name the instruction sections a request needs (`ROUTE: read <file>`), and the LOAD PROTOCOL in `AGENTS.md` makes those lines binding. ADR-0014 added `bun run instructions:audit`. On the day of this decision it read **14.6%** on this machine's transcripts of this repository with removed worktrees included (18 routes read in turn plus 2 already read, 117 missed, 91 transcripts, last 30 days), against a 90% target, while the router eval picks the right section on every labelled prompt.

Replaying the real prompts of those transcripts through the hook (114 user prompts, per prompt, no session dedupe):

1. **Worker prompts are the worst input.** Every one of the 87 dispatched-worker first prompts fired six or more section routes, **7.17** on average (72 of them exactly seven). The Orca supervised preamble talks about rules, capabilities, workers and dispatch, and the absolute paths in the task block fire more.
2. **Interactive prompts route 1.85 sections on average**, up to six.
3. **The cue named a file, not an action.** `ROUTE: read <path> (<id>)` gave no size and no moment, and nothing came back if it was ignored.

QA measured the same failure on its own transcripts (QA ADR-0017): recall falls with the number of routes in a turn (one route 50.0% read, five or more 12.3%), and in controlled `claude -p` sessions the change below moved routes read from 40.0% to 92.9%.

A second gap shows up the moment the first is fixed. `.claude/settings.json` is bootstrap-only: `bun run up` delivers it once and then only grows its permission lists. A hook group that `agents:compat:check` starts requiring (the re-surface group below) would therefore leave every project updated after this change failing its compat check at pre-commit, pre-push and CI until someone edited the file by hand.

## Decision

Route fewer sections per prompt, say when to read them, remind once, and let the updater deliver the hook groups the check requires. The routing lives in the one emitter, `.agents/hooks/personality-reinject.mjs`, so the three harnesses keep sharing a single classifier; the shared constants, line formats and texts are the QA ones, verbatim.

1. **Scope.** A `ROUTE-SCOPE:` sentence in the prompt (opening a line or following a sentence end, running to the end of its line) replaces the prompt for classification: each comma-separated item is a section `id`, routed directly, or words, classified; `none` routes nothing. Without one, a prompt that carries an orchestrator preamble is classified on the task block after its marker (`TASK_BLOCK_MARKERS`, the Orca `=== TASK ===` line). Absolute paths are neutralized first: one into this checkout becomes repo-relative (so `paths:` can match it), any other is blanked.
2. **Rank and cap.** Fired router rows are ranked by their anchor's strength (the anchor is still the first file of the row's `Load` cell): an `id` named in the scope, then `paths:` hits (each worth two trigger hits), then distinct `triggers:` hits, then the earliest match, then router order. Anchors come before the companions their rows bring. At most `MAX_ROUTED_SECTIONS` (three) section files get a binding line; the rest share one `ROUTE-OPTIONAL:` line, offered once per session and never recorded as routed. Imports (`package.json`, `.agents/project.yaml`) never count against the cap.
3. **A cue that states the action.** `ROUTE: read <path> (<id>, <n> lines) before acting on this prompt`. The prefix is unchanged, so the audit, the compat contract and older transcripts keep parsing.
4. **Re-surface once, on Claude Code.** `.claude/settings.json` gains a `PostToolUse` group with no matcher running the same emitter, in the one `PostToolUse` list that already holds the documentation-contract group (ADR-0017). The first tool call that reads none of the prompt's binding sections, while some are unread, gets ONE `ROUTE-PENDING:` line; a subagent's call is ignored; any other event prints nothing. `agents:compat:check` requires the group when Claude Code is a declared harness. Codex and OpenCode keep the `ROUTE:` cue only.
5. **The LOAD PROTOCOL names the three lines**: `ROUTE:` binding, `ROUTE-OPTIONAL:` read only when the task needs it, `ROUTE-PENDING:` read before the next step.
6. **Worker launch prompts end with `ROUTE-SCOPE: <section ids>`** (`orca-orchestration` `references/launch-seam.md` §2.1b, the playbook's two launch examples, a failure row in `references/brief-template.md`), and `references/worker-contract.md` gains rule 15: resolve the `ROUTE:` lines before the brief.
7. **The eval scores what the hook binds.** `scripts/lib/router-eval.ts` reports recall (named on any line), binding recall (named on a binding line, floor 90%) and precision (binding lines only). `instructions:audit` also counts `ROUTE-PENDING:` reminders, files read after one, and `ROUTE-OPTIONAL:` lines.
8. **The updater appends the hook groups a project lacks.** A project is never blocked by boilerplate evolution, so `mergeHookGroups` is the same additive merge for `hooks`: an upstream command the project lacks under the same event and matcher is appended as a NEW group at the end of that event's list. The project's own groups are never edited, reordered or removed, and a command it does not want is declined by its exact text in `updater.declined_hooks`. It runs BEFORE the compatibility check of `bun run up`; a command whose script the project lacks is skipped and reported; every merge that rewrites the file (permissions, hook groups, the `--adopt` prompt hook) reads it keeping a key a git auto-merge repeated; one backup per run covers every write. A downstream compat error for a missing hook group ends with the fix: run `bun run up`, which adds the upstream hook groups this file lacks.

The router table is untouched: lock fingerprint `387f2c89527c` (ADR-0014) stands.

## Consequences

- **Positive, measured before and after on this repository:**
  - Router eval (58 labelled prompts): recall 100% → 100%, binding recall 100% (new metric, no labelled prompt needs more than three sections), precision 94.2% → 94.2%, binding lines per prompt 1.48 → 1.48.
  - Replay of the 114 real prompts: worker first prompts **7.17 → 2.99** binding section lines (86 with three, 1 with two, none above three; 0.57 paths per prompt on the optional line); interactive prompts 1.85 → 1.59 (none above three). Routing cost 1.33 ms → 0.15 ms per prompt (the scoped text is shorter).
  - This port's own launch prompt routed seven sections before; it routes three (`orchestration-detail`, `git`, `tool-resolution`), and two with `ROUTE-SCOPE: harnesses, git`.
  - A downstream fixture on the settings of `main` before this change fails `agents:compat:check` with the re-surface error; after `bun run up` it passes, and a second run adds nothing.
  - The controlled-session number (routes read) is QA's: 40.0% → 92.9% on ten sessions per arm (QA ADR-0017). It was not re-run here; the live audit is re-read after a fleet has run on the new hook.
- **Negative / trade-offs:** a section the eval labels as needed can land on the optional line (binding recall below 100%, held by its floor). The re-surface costs one `node` start per tool call on Claude Code (QA measured 65.5 ms against 44.0 ms for a bare `node`). Each binding line grows by about ten tokens. The hook merge adds every upstream hook a project lacks, including ones no check requires (the documentation-contract hook is one, and stays inert downstream); declining is per command, by exact text. On an `--adopt` run the merge also appends the boilerplate's `UserPromptSubmit` group next to an app's own one, which the `--adopt` prompt-hook merge alone left out.
- **Neutral / follow-ups:** the live audit number moves only as new sessions run on the new hook. Codex and OpenCode get no re-surface (no measured equivalent of `PostToolUse` context injection on them yet). The triggers are compiled case-insensitive; a trigger-hygiene pass is a separate change.

## Alternatives considered

The ones QA ADR-0017 weighed and rejected stand here unchanged: a cap of two, a cap on rows instead of files, classifying only the first lines of a long prompt, a `PreToolUse` reminder, scanning the transcript from the hook, counting an optional-line hit as a hit. For the hook merge, from QA PR #122:

- **Whole-group equality as the identity.** Rejected: it would duplicate a command a project already wired in a group of its own. The identity is the triple compat asserts on (event, matcher with absent, empty and `*` as one key, command).
- **Inject a missing command into the project's existing group.** Rejected: it edits project-owned structure. A new group at the end of the event's list leaves the project's groups byte-equal.
- **Reject a settings file with a repeated key.** Rejected: it would block the sync on a git artefact; folding keeps both lists and reports it.
- **Merge `.codex/hooks.json` and the OpenCode plugin too.** Not needed: the sync rewrites them as framework files.
- **Seed `updater.declined_hooks: []` in `project.yaml`.** Not taken: this repo documents `updater.declined_denies` in `.agents/README.md` without seeding it, and the new list follows the same convention.

## References

- `.agents/hooks/personality-reinject.mjs` (`routeScope`, `neutralizePaths`, `classifyPrompt`, `capRoutes`, `bindingRoutes`, `routeLines`, `pendingRouteReminder`, `MAX_ROUTED_SECTIONS`, `TASK_BLOCK_MARKERS`)
- `.claude/settings.json` (`PostToolUse`), `cli/lib/agent-compatibility-contracts.ts` (`ROUTE_RESURFACE_EVENT`, `HOOK_GROUP_FIX`, `hookScriptPath`)
- `cli/lib/updater-settings.ts` (`mergeHookGroups`, `readDeclinedHooks`, `parseJsonKeepingDuplicates`), `cli/update-boilerplate.ts` (`makeHookMergeHook`), `cli/lib/updater-parity.ts`
- `scripts/lib/router-eval.ts` (`BINDING_RECALL_FLOOR`), `scripts/lint-instructions.ts` (`lintEval`), `scripts/lib/instructions-audit.ts`
- `.agents/instructions/README.md`, `AGENTS.md` LOAD PROTOCOL, `.agents/README.md` (`updater.declined_hooks`)
- `.agents/skills/orca-orchestration/references/launch-seam.md` §2.1b, `references/worker-contract.md` rule 15, `references/brief-template.md`, `references/coordinator-playbook.md`
- `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md`, `.context/ADR/ADR-0014-instructions-maintenance-locks.md`, `.context/ADR/ADR-0017-documentation-contracts.md`
- agentic-qa-boilerplate ADR-0017 and PRs #120, #122
