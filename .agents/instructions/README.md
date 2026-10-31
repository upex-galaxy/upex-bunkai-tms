# Project instructions: sections

The project instructions are split in two layers so every session pays only for what it needs.

| Layer | File | Loaded |
|---|---|---|
| L0 | `AGENTS.md` | every session, on every host (Claude Code through the `CLAUDE.md` shim) |
| L1 | one file per section in this folder | on demand: the router table in `AGENTS.md` names when to read each one |
| L2 | skill `references/` | on demand, named by the section or the skill that needs them |

L0 keeps what must bind on every turn: the binding sentence of each Critical Rule, the behavioural layer, the core of orchestration mode, the load protocol, the router and the memory triggers. Everything else lives here.

## How a section is reached

1. The router in `AGENTS.md` (between `<!-- router:start -->` and `<!-- router:end -->`) maps request kinds to files in this folder.
2. Each section's frontmatter declares `triggers:` (case-insensitive regexes) and `paths:` (repo prefixes); the prompt hook (`.agents/hooks/personality-reinject.mjs`) classifies each prompt with them and the router, so the table the model reads is the table the classifier uses. A row fires on its first Load target (its anchor) and routes every target in it. The hook emits one `ROUTE: read <file> (<id>, <n> lines) before acting on this prompt` line per file this session has not been routed to yet, or `ROUTE: read package.json (<n> lines) before acting on this prompt` for an import (a per-session state file dedupes, so a prompt that needs nothing new adds nothing), and a `SessionStart` with source `compact` or `clear` re-arms the routes (Claude Code and Codex; OpenCode 1 on compaction only). OpenCode 1 routes from `chat.message`; OpenCode 2 has no per-message hook with the prompt text and relies on the router alone.
   - **Scope.** A `ROUTE-SCOPE:` line in the prompt (opening a line or following a sentence) replaces the prompt for classification: each comma-separated item is a section `id`, routed directly, or words, classified; `none` routes nothing. Without one, a prompt that carries an orchestrator preamble is classified on the task block after its marker (`TASK_BLOCK_MARKERS` in the emitter), because the preamble is vendor text identical for every worker. Absolute paths are neutralized first: one into this checkout becomes repo-relative, any other is blanked, so a directory name is never read as intent.
   - **Rank and cap.** Fired rows are ranked by their anchor's strength: an `id` named in the scope, then `paths:` hits (each worth two trigger hits), then distinct `triggers:` hits, then the earliest match. Anchors come first and companions after them. At most `MAX_ROUTED_SECTIONS` section files get a binding `ROUTE:` line; the rest share one `ROUTE-OPTIONAL:` line, offered once and never recorded as routed, so a later prompt about that topic still routes it. Imports never count against the cap (Claude Code expands them at launch). The reason is measured: an agent reads a lone route far more often than one of five in the same turn (the numbers are in ADR-0018).
   - **Re-surface (Claude Code).** A `PostToolUse` hook runs the same emitter: the first tool call after the prompt that reads none of the routed sections, while some are still unread, gets ONE `ROUTE-PENDING:` line naming them. It never repeats in the turn, stays quiet for a subagent's calls, and costs one `node` start per tool call. Codex and OpenCode get the `ROUTE:` cue only.
3. `agent-project.md` adds the project's own rows: its "Project context skills" table (between `<!-- project-skills:start -->` and `<!-- project-skills:end -->`) lists each skill the project created, with the triggers that route a prompt to its `SKILL.md`. The hook reads that table like the router, and no `bun sync` touches the file, so the project's routing to its own skills survives updates.
4. The load protocol in `AGENTS.md` makes a routed read binding, and "unsure → read" the default.
5. Two router rows also name data files as Claude Code imports, `@package.json` and `@.agents/project.yaml`, written as plain text so Claude Code loads them at launch; OpenCode and Codex do not expand imports and follow the rows' reinforced instruction instead. No other bare `@` token may appear in `AGENTS.md`.

## Frontmatter

```yaml
---
id: git                 # the file stem without `agent-` (agent-git.md -> git)
title: "Git workflow and strategy"
load_when: "any git, branch, commit, push, pull request, merge, rebase or conflict intent"
triggers: ["\\bgit\\b", "\\bcommit"]
paths: [".husky/", ".github/"]
---
```

Every file in this folder but this README is named `agent-<id>.md`, so a reader can tell it came with the agent setup; the name carries no order (the router rows do). `agent-project.md` (`id: project`) carries `id`, `title` and `load_when` and may leave `triggers` empty (its skill rows carry their own); this README carries no frontmatter.

## Sections

One row per section file, so a reader finds a topic's home without opening every file. `instructions:check` fails a section with no row here and a row naming a file that is gone. The router in `AGENTS.md` decides when each one loads; this table only says what it holds.

| File | Holds |
|---|---|
| `agent-critical-rules.md` | the full text of every Critical Rule, under the number and name its L0 binding sentence carries |
| `agent-context-map.md` | the task to skill to context map for every workflow request, and the key paths |
| `agent-skills-and-mcps.md` | the skill table, skill modes and the MCP capability rules |
| `agent-tool-resolution.md` | `[TAG_TOOL]` resolution and the CLI to skill mapping |
| `agent-project-variables.md` | template-variable resolution, environments, project identity and the Jira host |
| `agent-ticket-work.md` | AI behaviour while developing, explaining or fixing a story or a bug |
| `agent-local-context-pbi.md` | the `.context/PBI/` cache of the tracker: tree, sync and reads |
| `agent-code-quickref.md` | the stack quick reference for writing or reviewing app code |
| `agent-git.md` | git workflow and the pointer to the project's `git_strategy:` |
| `agent-harnesses.md` | the multi-harness contract: instruction files, hooks, MCP configs, the updater, `cli/` |
| `agent-orchestration-detail.md` | executors, dispatch patterns, value provenance, fail-closed gates, session material |
| `agent-project.md` | the project's own rules and its project context skills table (project-owned) |

## Editing

Every change to `AGENTS.md`, a section, the router or a `triggers:` list follows `agentic-dev-core/references/instructions-doctrine.md`: its decision tree places each sentence, and its procedure closes with the checks below.

- Edit the section file. Never paste section prose back into `AGENTS.md`: L0 has a byte budget, because Codex cuts its project instructions at `project_doc_max_bytes` without a visible notice.
- A Critical Rule changes in two places on purpose: its full text in `agent-critical-rules.md` and its binding excerpt in `AGENTS.md`, which must stay verbatim.
- A section line that says `NEVER` or `MUST` names what carries it when the section is not loaded (a Critical Rule, a skill's Compact Rules, a contract L0 carries) or declares itself section-scoped with `<!-- binds-in-section: <reason> -->`.
- A rule only this project has goes in `agent-project.md`, the project-owned overlay. The other files are shared doctrine.
- `bun run instructions:check` gates all of the above: budget, router (the `agent-project.md` skill rows included), frontmatter, rule excerpts, binding carriers, imports.

It also holds three locks (ADR-0014), errors in the maintainers' copy and warnings in a project:

- **Router lock.** The comment `<!-- router:lock <fingerprint> <ADR-NNNN> -->` under the router records the fingerprint of the table and the ADR that decided it. Any change to a row, header included, fails until a decision covers it: write the ADR (or an Amendments line on the one that owns the router), run `bun run instructions:check --accept-router ADR-NNNN`, and cite the fingerprint it prints in that ADR. Whitespace-only reflows keep the fingerprint.
- **Router eval.** Every run scores the hook's classifier against the labelled prompts in `cli/lib/fixtures/instruction-router-eval.json` and fails under any of three floors (`scripts/lib/router-eval.ts`): recall (an expected section named on any line), binding recall (named on a binding line, so the cap did not push it out) and precision (binding lines only: an optional line binds nothing). A `triggers:` or `paths:` edit is proved here, on the same pre-commit call, before any test run. A trigger that fires on everything also costs a binding slot: under the cap it pushes a section the prompt needed onto the optional line.
- **Complete section.** Every section but `agent-project.md` ships with frontmatter, a router row, at least three labelled prompts that expect its `id`, and a row in the `## Sections` table above.

`bun run instructions:audit` measures the other half from local transcripts: of the `ROUTE:` lines the hook injected, how many the agent actually read in the same turn, and how many reads followed a `ROUTE-PENDING:` reminder.
