# Docs follow-through: keeping the docs in step with the change that moved them

> Cited by `sprint-development` (Stage 3, docs before merge), `project-context` (the Key-paths pointer after an artifact write), `testability-guide` (registering the `/qa` page) and `.agents/instructions/agent-context-map.md` §4 (the "sync AI memory" row). It replaces the retired `sync-ai-memory` skill.

## 1. Why there is no sync skill any more

A doc drifts in the PR that changed the thing it describes, and it stays drifted because nothing asks about it at that moment. A separate "sync the docs" skill ran later, if ever, and had to rediscover every change from the repo. So the work splits in two:

| Half | Owner | What it catches |
|---|---|---|
| Mechanical | `bun run docs:check` (inside `repo:check`, so CI runs it, and on every push) | dead links and paths, a repo skill missing from the `.agents/instructions/agent-skills-and-mcps.md` §5 router and from the project's own rows (`agent-project.md` "Project context skills", an `AGENTS.md` router row to its `SKILL.md`) (`roster`), a `bun run <name>` quoted in a doc that `package.json` does not declare (`script`), missing page metadata, the volatile-fact families of Critical Rule #17 |
| Mechanical | `bun run agents:compat:check` | the `CLAUDE.md` shim (exactly `@AGENTS.md` plus one newline), the skills alias, a harness command that shadows a skill, hooks, MCP parity |
| Mechanical | `scripts/lint-doc-contracts.ts` (ADR-0017, boilerplate maintainers only) | a code region marked `LINT.IfChange(<label>)` changed while a page its `LINT.ThenChange(...)` names did not (§5): warns at commit, blocks at pre-push and in CI |
| Judgment | this reference, run by whoever makes the change, in the same PR | the sentence around each fact, a section that still describes the old behaviour, two docs that now disagree |

## 2. When it runs

Two triggers, either one is enough:

- the change adds, renames or retires any of: a skill or a skill mode, a `package.json` script, a doc or `.context/` path, an MCP server, an env var, a harness surface;
- the change alters a BEHAVIOUR some page describes in prose: what a gate checks, what the installer asks or offers, which files a contract covers, how a rule is applied.

The second trigger is the one the measured drift came through: a PR updates the page its author remembered, and a parallel page that describes the same behaviour keeps the old sentence. A change that does neither needs nothing here.

## 3. The surfaces

| Surface | What to patch | Never |
|---|---|---|
| `AGENTS.md` + `.agents/instructions/` | placement and procedure per `instructions-doctrine.md`. `AGENTS.md`: a router row only when a new request KIND appears, behind its ADR (the router lock); the sections: `agent-context-map.md` task-map row and Key paths, `agent-skills-and-mcps.md` skill router row, `agent-harnesses.md` surface tables | inline a `bun run` script in a table (Rule #10); restate a count or a mutable list (Rule #17); paste section prose into `AGENTS.md` (its byte budget, `bun run instructions:check`); change a `triggers:` list without the labelled prompts that motivated it |
| `.agents/instructions/agent-project.md` | a fact true only for this project: a Key path only it has (`## Key paths (this project)`), the row of a skill it created (`## Project context skills`), its own exception, its reading of shared doctrine | write it into `AGENTS.md` (the boilerplate-owned always-on layer) or a shared section (`bun sync` overwrites those) |
| `README.md`, `CONTEXT.md`, `INSTALLER.md` | the command, path or skill name the change moved, and the sentence around it | enumerate the skill set: point to `.agents/skills/REGISTRY.md` |
| `packages/decks/**`, `packages/pages-home/**` | the decks and the Pages home describe behaviour in prose; patch the sentence, the table cell or the callout that states the old behaviour (text nodes only, as for `docs/onboarding.html`) | skip them: they are the surface every measured drift missed |
| `docs/**` | the same facts; `docs/onboarding.html` is hand-maintained HTML: patch text nodes only (`<code>`, `<td>`, inline spans, a repo-file `href`), never `<head>`, `<script>`, `<style>`, the sidebar or attributes | regenerate a page |
| `CLAUDE.md` | nothing: operational prose found there is structural drift, report it and run `bun run agents:compat` | propagate that prose anywhere |
| Generated files (`REGISTRY.md`, `.claude/skills`) | regenerate with their command | hand-edit |
| `.context/` maps and roadmaps | owned by `project-context` modes | rewrite their content from here |
| `.claude/commands/`, `.opencode/commands/` | the project's own commands, if it keeps any | name one like a skill: it hides the skill (`agents:compat` moves it to `.backups/shadowing-commands/`) |

## 4. How to patch

1. **The current file is the base.** Edit the drifted fact; never rewrite a doc from a template.
2. **Preserve structure and voice.** Headings, list style, table columns, examples and human prose stay byte-for-byte except the changed cell or sentence. No reformatting on the way past.
3. **Structural drift is a question, not an edit.** A whole section about a removed feature, or a section that reappeared after being deleted on purpose: surface it to the user and let them decide.
4. **One fact, one value everywhere.** When a fact appears in several docs (a command, a path, a skill name, the instruction topology), patch every copy in the same PR. `grep -rn '<old value>'` across the surfaces above before calling it done.
5. **Redact before writing.** No credential, token, shaped secret (`eyJ…`, `ATATT…`, `ghp_…`, `AKIA…`) or production URL carrying one lands in a doc; replace it with a placeholder and say so in the report.
6. **Name the owner, not the value** (Rule #17, `volatile-facts.md`): "the servers `.mcp.json` declares", never their count or list.

## 5. Declared couplings (ADR-0017)

A code region a page describes carries `LINT.IfChange(<label>)` / `LINT.ThenChange(<pages>)` comment lines (grammar: `scripts/lib/doc-contracts.ts`). When the change touches one, every page it names changes in the same push, or a commit carries `Docs-Checked: <label> <reason>` because the documented behaviour still holds. Pre-push (`scripts/lint-doc-contracts.ts --push`) and CI block otherwise; the commit hook only warns. In Claude Code and Codex the edit hook prints the `DOCS:` line the moment the region is edited. When this change finds a drift no marker caught, add the marker in the same PR: that is how coverage grows where drift happens. Maintainers only in v1: in a downstream project the gate prints one line and the hook stays silent.

## 6. Drift sweep (report-only, path-scoped)

Runs only when the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, after the verification gates (tests, types, lint). One subagent, briefed with the diff (`git diff <merge-base>..HEAD`) and a one-paragraph summary of the behaviour that changed:

1. Extract the changed behaviour's terms (flags, file names, commands, rule names, the old wording the diff removed).
2. Grep the doc surface: `README.md`, `INSTALLER.md`, `CONTEXT.md`, `AGENTS.md`, `.agents/instructions/**`, `.agents/skills/**`, `docs/**`, `packages/decks/**`, `packages/pages-home/**`.
3. Read every hit in context and report each sentence that is now wrong or silently incomplete, as `file:line` + the sentence + what changed. A hit the PR already updated is not a finding.
4. Count the `Docs-Checked:` trailers in the range (`git log --format=%B <merge-base>..HEAD`) and list each label with its reason.

Report-only: it never gates the change. Whoever owns the change fixes each finding or dismisses it with a reason, in the same PR. It is the one step that finds a coupling nobody declared.

## 7. Verify and report

Run `bun run docs:check`, `bun run agents:compat:check` and `bun run skills:check`; all three exit 0 or the follow-through is not done. Report one line per touched doc: path, the facts corrected, anything flagged as structural and left for the user, and the drift-sweep findings when §6 ran.
