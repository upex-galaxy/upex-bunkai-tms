# ADR-0009 — Progressive disclosure of the project instructions: an always-on L0, routed sections, a hook that names what to read

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Boilerplate owner (upex-galaxy): owner decisions OD1-OD7 on the context-tiers spike (2026-10-04, every recommended option, with binding notes on OD6 and OD7); conductor rulings of the dev-sync fleet on the shared design (ids, frontmatter, Git Strategy split, two-level budget). Implemented by D-U1 (#95, section split + `instructions:check`), D-U2 (#96, hook router) and D-U3 (#97, the updater's `instructions` component)
- **Tags:** instructions, multi-harness, hooks, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

`AGENTS.md` was the one instruction body every host loaded whole at session start (ADR-0002 item 1). It had grown into a single file holding the critical rules, the behavioural layer, orchestration, the task-to-skill map, the skill registry table, the multi-harness contract, tool resolution, project variables, the PBI cache doctrine, the code quick-reference, git policy and memory triggers. Three facts made that shape untenable:

1. **Every session paid for all of it.** A chat about a colour loaded the git policy, the PBI tiers and the harness contract. Most sections are needed in a minority of sessions.
2. **Codex was cutting it.** Codex concatenates project `AGENTS.md` files into ONE budget, `project_doc_max_bytes`, default 32 768 bytes, truncates at the byte that crosses it, and only logs a warning (source: `codex-rs/config/src/config_toml.rs`, `DEFAULT_PROJECT_DOC_MAX_BYTES`; `codex-rs/core/src/agents_md.rs`, `data.truncate`). The old file crossed it inside the context loading map, so on Codex everything after that point never reached the model.
3. **An `@` import saves nothing.** Claude Code expands an imported file in full at launch (Claude Code memory docs: "imported files load at launch"); OpenCode and Codex do not expand imports at all. The only lazy mechanisms the three hosts share are the model reading a file because an instruction told it to, skills (description first, body on use), and a per-prompt hook that injects text.

## Decision

We will split the project instructions into layers and engineer recall with the existing prompt hook ("routed progressive disclosure", option C on A).

1. **L0, `AGENTS.md`, always on.** It keeps only what must bind on every turn: the header and the LOAD PROTOCOL, the binding sentence of each Critical Rule, §2 (the behavioural layer) verbatim and whole, the core of §3 (orchestration), the fixed router, and §12 (memory triggers). `CLAUDE.md` stays exactly `@AGENTS.md` plus a newline.
2. **L1, one file per section under `.agents/instructions/`, on demand.** Each section carries frontmatter (`id`, `title`, `load_when`, `triggers`, `paths`); `project.md` is the project-owned overlay and `README.md` documents the folder. Every sentence of the old file landed in L0 or a section.
3. **L2 is what already existed**: each skill's `references/`, named by the section or skill that needs them. No new tier.
4. **The router is a fixed table in L0** between `<!-- router:start -->` and `<!-- router:end -->` (`Kind | Load | Also`). Rows are request kinds, not features, so the table does not grow with the project; sections and their `triggers:` do.
5. **The prompt hook routes.** `.agents/hooks/personality-reinject.mjs` reads the router and each section's frontmatter at runtime, classifies the prompt, and emits one `ROUTE: read <file>` line per file this session has not been routed to yet. A per-session state file dedupes; a `SessionStart` with source `compact` re-arms it. The LOAD PROTOCOL makes a `ROUTE:` line binding.
6. **Critical Rules keep their force.** Each L0 rule line is the rule's binding sentence verbatim plus a pointer to its full text in `.agents/instructions/01-critical-rules.md`, and the router has a row for "about to break, unsure about, or asked about a Critical Rule".
7. **Two data files are Claude imports.** The router rows for scripts and for project variables write `@package.json` and `@.agents/project.yaml` as plain text (Claude Code skips imports inside code spans), so Claude Code loads them at launch, and carry a reinforced instruction ("whenever any of these apply, read ...") that OpenCode and Codex follow. No other bare `@` token is allowed in L0.
8. **`bun run instructions:check` is the gate** (inside `repo:check`): byte budget, router integrity, frontmatter, verbatim rule excerpts, a binding carrier for every `NEVER` / `MUST` line in a section, and the import allowlist.

**Invariant.** Section prose is edited in its section file and never pasted back into `AGENTS.md`; a rule only one project has goes in `.agents/instructions/project.md` or a project context skill. A Critical Rule changes in two places on purpose: its full text in `01-critical-rules.md` and its binding sentence in `AGENTS.md`, which stays verbatim.

### Owner decisions (2026-10-04)

| ID | Decision | Owner note |
|---|---|---|
| OD1 | C on A: L0 + sections + routing hook (not trim-only) | |
| OD2 | Name: "progressive disclosure" (Anthropic's term for the skill mechanism this extends) | |
| OD3 | Folder `.agents/instructions/` (not `.agents/context/`, not inside a skill's references) | |
| OD4 | Section files are upstream doctrine; `project.md` is the project-owned overlay | |
| OD5 | An adopted app's own instruction block moves to an `<app>-context` skill with a router row | |
| OD6 | Data files load on demand through a router row | Reinforce the instruction AND write `@package.json` / `@.agents/project.yaml` in it, so Claude auto-loads them while the other hosts follow the instruction |
| OD7 | Two budgets: boilerplate L0 and L0 with project additions | L0 keeps each rule's binding sentence; a section explains the rule in full, loaded when the AI is breaking or about to break it |

### Conductor rulings recorded with this ADR

| Point | Ruling |
|---|---|
| Budget levels | Target 16 KiB (`L0_TARGET`, warning), ceiling 24 KiB (`L0_BUDGET`, error), 28 KiB with project additions (`L0_PROJECT_BUDGET`, error), Codex 32 KiB (`CODEX_PROJECT_DOC_MAX_BYTES`, always an error). Supersedes the spike's 16 / 24 KiB pair once §2 measured whole: the 16 KiB target became unreachable without cutting §2, which the owner forbids |
| `## Git Strategy` | Generic doctrine to `80-git.md`; this repository's accepted divergence and standing push authorization to `project.md` `## Git Strategy (this repository)`, so no downstream project inherits it |
| Router anchor | A row fires when the prompt matches its FIRST Load target; every target of a fired row is routed. Firing on any target dragged rows in through shared files |
| Classifier inputs | Prompt text and the paths it names only. Branch name (fires the same sections on every new session) and staged paths (needs a child process) were dropped from the spike's list |

## Measurements (2026-10-04, `main` after #96)

Bytes measured with `wc -c`; tokens are bytes / 4, an approximation (no tokenizer was run).

| What | Before | After |
|---|---:|---:|
| `AGENTS.md` (always on, every host) | 100 743 B (~25.2k tok) | 23 085 B (~5.8k tok) |
| Codex sees the whole always-on file | no (cut at 32 768 B) | yes |
| Claude Code session start: L0 + `@package.json` (4 268 B) + `@.agents/project.yaml` (23 888 B) | 100 743 B | 51 241 B (~12.8k tok) |

The two imports add 28 156 B (~7.0k tokens) on Claude Code only, more than L0 itself; `project.yaml` is most of it, and about a third of its bytes are comments. They do not count against the L0 budget, which measures the file itself. L0 sits over the 16 KiB target on purpose (`instructions:check` warns, never fails): §2 alone is about 10.9 KB and stays whole.

Classifier eval (`cli/lib/fixtures/instruction-router-eval.json`, 51 labelled prompts, Spanish and English, labels written before tuning; asserted by `cli/lib/instruction-router.test.ts` against the fixture's `targets`):

| Metric | Before tuning | After tuning | Target |
|---|---:|---:|---:|
| Recall (prompt x target) | 94.4% | 100% | >= 95% |
| Precision | 77.3% | 93.5% | >= 80% |
| In-process routing, median per prompt | | 0.40 ms | < 50 ms |

Not yet measured: model compliance with `ROUTE:` (share of routed sessions that read the routed file before acting), which needs real transcripts after merge.

## Consequences

- **Positive:** every host loads a fraction of the old always-on text, and Codex now sees all of it. Recall no longer depends on the model remembering to consult a table: on Claude Code, Codex and OpenCode 1 a deterministic classifier names the file. Doctrine outside L0 can ship as upstream-owned files instead of hand-merged parity rows (OD4), and the rows of the router stay fixed by design.
- **Negative / trade-offs:** recall is still soft on OpenCode 2, which exposes no per-message hook with the prompt text: it relies on the router and the LOAD PROTOCOL alone (declared degradation). A routed read costs a tool call the old file did not. The two imports make Claude Code's session start heavier than the other hosts'. A Critical Rule now lives in two places that must agree, which the lint enforces.
- **Neutral / follow-ups:** `bun run up` syncs the sections as the `instructions` component (`cli/lib/updater-instructions.ts`) and never touches `project.md`; a project that has none receives it once from the generic `.agents/instructions/project.md.template`, behind a leak gate that refuses the boilerplate's own text, and the greenfield scaffolder seeds it the same way. Moving an adopted app's instruction block into an `<app>-context` skill (OD5) is its own change. Triggers are tuned in section frontmatter, never in L0, and every miss is added to the labelled set.

## Alternatives considered

- **Trim-only (one file, detail moved into skill references)** — keeps full determinism for what stays, but the file still exceeds Codex's cap unless cut hard, and every session keeps paying for the conditional sections.
- **L0 + L1 + a new L2 tier of sub-files per section** — rejected: every section already has an L2 in the skill references it cites, and a second hop is one more read the model can skip, for little saving.
- **Sections as `kind: context` skills (the harness skill listing as router)** — rejected: routing becomes model-judged from descriptions, the listing budget drops the least-used descriptions first, and Codex already shortens the skill list at its cap.
- **`@` imports for the sections** — rejected: eager on Claude Code (no saving), ignored by OpenCode and Codex.
- **Listing the sections in OpenCode's `instructions`** — rejected: loads them all eagerly, recreating the old cost on OpenCode only.
- **Path-scoped `.claude/rules/`** — rejected as a base: Claude-only, triggered by reading a path rather than by intent, and summarised away on compaction.

## References

- `AGENTS.md` (L0: LOAD PROTOCOL, router, rule excerpts) and `.agents/instructions/README.md` (layers, frontmatter, editing)
- `.agents/instructions/10-harnesses.md` (INSTRUCTIONS and HOOK paragraphs)
- `scripts/lint-instructions.ts`, `scripts/lib/instructions.ts` (the gate and the shared parsers)
- `cli/lib/updater-instructions.ts` and `.agents/instructions/project.md.template` (delivery downstream)
- `.agents/hooks/personality-reinject.mjs` (`routeLines`, `IMPORT_ROW_TRIGGERS`), `.claude/settings.json` and `.codex/hooks.json` (`SessionStart` matcher `compact`), `.opencode/plugins/personality-reinject.js`
- Human explanation: `packages/decks/progressive-disclosure/how-it-works.es.html`
- ADR-0002 (one instruction source for three harnesses; this ADR keeps its shim contract and changes only how much of the source loads always)

## Amendments

- 2026-10-04: the routes re-arm on `SessionStart` source `clear` as well as `compact`, on Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`); `bun run agents:compat:check` requires both groups on both hosts. OpenCode 1 still re-arms on compaction only; OpenCode 2 stays router-only. Decision 5 and the hook reference above keep their original text.
- 2026-10-04: a skill the project creates for itself (an `<aspect>-context`) is routed from the "Project context skills" table of `.agents/instructions/project.md` (between `<!-- project-skills:start -->` and `<!-- project-skills:end -->`), not from the synced `20-skills-and-mcps.md`, which `bun run up` overwrites. The prompt hook reads that table's triggers next to the L0 router, `bun run instructions:check` validates its rows, and `bun run docs:check` (`roster`) counts them.
- 2026-10-04: owner decision, the section files drop their number for the `agent-` prefix, so every file in `.agents/instructions/` but `README.md` reads as part of the agent setup (`80-git.md` -> `agent-git.md`, `project.md` -> `agent-project.md`, `project.md.template` -> `agent-project.md.template`). The frontmatter `id` is unchanged (the stem without `agent-`), so ROUTE lines keep their tags; reading order comes from the router rows, not from file names. `bun run up` retires a project's numbered copies with a backup and moves its `project.md` byte for byte. The paths named above keep their original text.
