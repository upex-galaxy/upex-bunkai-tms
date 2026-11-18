---
id: critical-rules
title: "Critical rules (full text)"
load_when: "about to break, unsure about, or asked about a Critical Rule"
triggers: ["critical rule", "\\brule #?\\d+"]
paths: []
---

# Critical rules (full text)

> Section `critical-rules` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

Each rule below has the same number and name as in `AGENTS.md` § 1, where its binding text is quoted verbatim. This file holds the full text: the rationale, the edge cases and the mechanics.

## 1. Credentials by name, never by value

Reference a secret only through its variable name: `$STAGING_USER_PASSWORD` expanded by the shell, `process.env.X` in code, a name in the MCP loader's `--filter` list. Never open, print or paste a secret value: no `Read`, `cat` or `grep` of `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, and no `printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`, `varlock printenv|reveal` or `varlock load` without `--agent`. To learn whether a variable is set, run the repo's redacted presence check (below). A missing secret value is the human's to type, in a terminal or the secret manager, never through the chat. You may write a non-sensitive value (URL, project key, flag, port) when asked. Never hardcode or guess a secret.

**Why.** A value the AI reads lands in the model context, the provider request and the local transcript, and stays there. Using a secret by name inside a command is not an exposure: `echo "$ATLASSIAN_API_TOKEN" | acli jira auth login ... --token` carries the name in the command text, and the value goes into a pipe, never into the output. Printing it is the exposure.

**Presence check in this repo**: `bunx varlock load --agent` (JSON against the committed `.env.schema` + `.env.core.schema`, plus `.env.provider.schema` when the project opted into a secret manager; a `@sensitive` item shows a two-character prefix and the rest masked, a non-sensitive one prints in full, which is why every secret must be `@sensitive`), `bun run setup:doctor --json` (key `env_vars`: `set` / `missing` per required name, never a value) and `bun run vars:env:check` (an inherited process value that differs from `.env`, lengths only).

**Writing `.env` (non-sensitive exception).** The AI never writes a secret value (credential, API key, token, password: anything marked sensitive or obviously secret) into `.env` or anywhere else. It names the variable and the human types the value. A non-sensitive value (a URL, a project key, a flag, a port) the AI may write into `.env` when the human asks, and only through `bun run env:set KEY=value`. That command accepts a key only when the committed env schema (`.env.schema` + `.env.core.schema`) declares it without `@sensitive` and `cli/lib/variables-manifest.ts` neither marks it secret nor sources it outside `.env` (with no schema at all, the manifest alone decides). It refuses everything else, undeclared keys included, and prints names, never values. The `Read(.env)` deny also refuses every direct edit of the file, so no other write path exists and none may be improvised (`bun -e`, `sed -i`, a heredoc).

**The net under the rule.** `.claude/settings.json` denies `Read` of `.env`, `.env.local`, `.env.*.local`, `.envrc.local`, `.auth/**` and `.claude/settings.local.json` (which also refuses `cat`, `head`, `grep`, `awk` and shell writes on those paths), plus `printenv`, bare `env` and `varlock printenv|reveal`. `opencode.jsonc` mirrors it. Codex keeps secrets out of the shell it runs (`shell_environment_policy.inherit = "core"`). The Pi adapter's `tool_call` block refuses the same reads and printing commands, a seatbelt that loads only in a trusted session (ADR-0022). Deny rules are pattern-based and a subprocess can still read a file, so the rule text is what binds and the deny is the net. Mechanics, safe command shapes and the leak response: `.agents/skills/agentic-dev-core/references/secret-hygiene.md`.

Example keys: `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`. Add `[Project-specific reminders]` per project (for example "SPA and API on different hosts: use the correct base URLs").

## 2. Plan before coding

Produce the implementation plan (`implementation-plan.md` or the skill's internal plan) before writing code. The flow is Plan, then Code, then Review.

## 3. No AI attribution

Commits carry no AI attribution: no "Generated with Claude Code", no "Co-Authored-By: Claude", no harness branding and no equivalent authorship or advertising line. The forensic trailers are the one mandatory exception and are not attribution: every commit an agent session writes ends with `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` line the prompt hook injects (`unknown` when unresolved). They answer "which checkout and which session produced this line", not "who wrote it", and name no tool. `Claude-Session:` and every other harness-branded trailer are forbidden (ADR-0004 supersedes ADR-0002 item 8). `.husky/commit-msg` warns on a missing pair or a branded trailer and never blocks. Canon and label rule: `.agents/skills/git-flow-master/SKILL.md` §3.2.

## 4. Push to protected follows `git_strategy.policy.direct_push_to_protected`

Before pushing to a protected branch, resolve `git_strategy.policy.direct_push_to_protected` in `.agents/project.yaml` (the protected list is `git_strategy.protected`). With `forbidden`, never push directly: route the change through a PR. With `confirm`, ask for explicit user confirmation before every push. With `allowed`, push without asking: the authorization is standing, and asking anyway collapses `allowed` into `confirm`. A missing or null `git_strategy` block (fresh scaffold) behaves as `confirm`. The variable is the decision, so never hardcode the answer here. Mechanics: `git-flow-master` §3.3.

## 5. Git history

Never rewrite pushed history (rebase or amend on pushed commits), never force-push to shared branches and never delete remote branches without confirmation. Add forward with new commits and preserve merge history.

## 6. Quality verification

After code changes, verify in this order: tests, then types, then lint. Run all three; skip none.

## 7. File operations

Read a file before editing it, preserve its formatting and indentation, and never overwrite a file you have not read.

## 8. Skills first

All workflows live in `.agents/skills/`: invoke the matching skill and let it load its own detail instead of pasting instructions inline. Use `[TAG_TOOL]` pseudocode and `{{VARIABLES}}` for dynamic content.

## 9. MCP credential failure: stop immediately

When an MCP server fails auth or an env var is missing, stop immediately, with no workaround. Tell the user the exact env var, point to `.env` / `.env.example`, and ask them to fix `.env` and restart the agent session (the env is cached when the MCP server spawns).

The failure is silent on every host. Every stdio server that needs `.env` values starts through the `.env` loader (`varlock run --filter <its vars>`, `MCP_ENV_LOADER_*` in `cli/lib/agent-compatibility-contracts.ts`), so a missing or empty `.env` value reaches the server unset or empty, and the server dies later on its first authenticated call, not at config parse (`/mcp` inside a Claude Code session is the check). A value that fails the schema stops only the server that needs it: `bunx varlock load --agent` shows which, redacted. A legacy config that still carries `${VAR}` or `{file:}` fails the same silent way. `.codex/config.toml` is loud only for a remote server (a missing `bearer_token_env_var` is a hard error naming the server). So a 401/403 or a mystery tool failure is the signal: do not wait for a parse error that will not come.

## 10. Scripts: read `package.json` directly

Do not quote build, test or lint commands from `AGENTS.md`, an instruction section or any doc, because quoted commands drift. Open `package.json` first, then answer.

## 11. Concision comes from §2, not from a plugin

Butler and PM Voice set the content, and the user-level reply rules (`## Replies`) plus the `humanizer` skill set how it looks. No communication-mode plugin is assumed or recommended. A reply never depends on a plugin being installed, so the same rules produce the same reply on every host (`.agents/instructions/agent-harnesses.md` §5.5). A harness plugin that rewrites the register (a word-compression mode, a persona) is the user's own user-level choice: the repo does not install it, does not depend on it, and writes no rule whose meaning changes when it is present. Terse is the default, and when the user asks for more detail ("be verbose" or a clear equivalent) give it for that thread. Code, commits, PR bodies and security warnings are always written in full sentences.

## 12. Language detection and mirroring

At the start of every conversation, read the full user message (not just the opening words) to detect the user's working language. Mirror that language in every conversational reply: questions, summaries, explanations, status updates. Repo artifacts are always English regardless of conversation language: code, any code comment that Rule #18 lets survive, commits, PR titles and bodies, branch names, file names, test names, configuration values, and any external action artifact (Jira issues and comments, GitHub issues, PRs and comments, Slack messages, emails, deploy notes, MCP tool inputs). Override: when the user explicitly asks for another language for a specific artifact (for example "write this PR description in Spanish"), honor that request for that artifact only, and default to English for the next ones unless it is requested again.

## 13. No global discards (multi-session safety)

Never run a repo-wide destructive git command (`git restore .`, `git checkout -- .`, `git reset --hard`, an untargeted `git stash`, `git clean -f`). Several agent sessions may share one working tree without worktrees, and a global discard silently destroys another session's uncommitted work, unrecoverably. Discard only explicit paths you modified in this session (`git restore <path>...` / `git stash push <path>...`). When unsure who modified a file, do not restore it: ask the user.

## 14. UI fidelity contract

When a story has UI and `.context/design/master-design-plan.md` exists, look the story up in §8 (US to Screen map), open the §4 screen spec and the §2 frozen tokens, and use the mockup in `.context/designs/<project-slug>/<batch-slug>/` as inspiration (LIVE-UI-FIRST, below). Never invent UI. The fidelity reference is the current live UI plus the `DESIGN.md` tokens: a UI change that diverges from either and carries no §5 ratification is a defect (review gate), while following the improved live UI where the mockup differs is not.

When the story is missing from §8, stop and pick one of three paths. (a) A just-in-time mockup through the `/design-system` screen phase: the AI commissions it through a design tool (the Open Design MCP capability or an equivalent), generates the HTML itself through a loaded design skill, or hands the user a portable brief for Claude Design or Open Design, and the bundle lands in the drop zone for a human to ratify. (b) A spec-only build ratified in §5 (plus an ADR if architectural). (c) An explicit, user-approved `DESIGN.md`-only build. With no plan at all, fidelity is `DESIGN.md` only (tokens, no screen reference).

The AI never hand-authors mockups outside a design skill (design-system D7). It may commission mockups through a design tool, and it may generate its own HTML mockups only through a design skill loaded for that job (category `frontend-ui` in `agentic-dev-core/references/skill-composition-strategy.md`), which then counts as the design tool. With no design skill loaded it may not. Any screen, component or layout write loads the design set first (`agentic-dev-core/references/skill-composition-strategy.md` §3.5), inside a workflow skill or not. A human ratifies every mockup, whatever produced it. With no tool and no design skill available, the answer is (b) or (c), never markup written to fill the gap.

**LIVE-UI-FIRST** (refines design fidelity). The current live UI is the source of truth for fidelity, not the mockup. The mockup is inspiration to stay close to or improve upon, adapted to what already exists. So: (1) before building UI, inspect the current live components and reuse them; (2) never blind-copy the mockup where it conflicts with the improved live UI; (3) navigation, meaning how a user reaches and moves through the app, is paramount for UX; (4) if the mockup has something genuinely good the live UI lacks, do not force it into the current story: file it as a future tech-story or tech-debt item. Live-UI validation (`/sprint-development`) checks consistency with the current app and design system, not pixel-match to the mockup. The §5 ratification machinery still applies: a deliberate departure from the live UI or the tokens, or a build with no mockup, is recorded as a §5 spec-only divergence (plus an ADR if architectural).

## 15. Harness surfaces are generated

Never hand-edit `CLAUDE.md` (a shim) or `.claude/skills` (an alias). Edit the source (`AGENTS.md`, `.agents/skills/`, `.agents/hooks/`) and run `bun run agents:compat`; `bun run agents:compat:check` is the gate. A skill is invoked by its name plus a mode, no command file ships, and a command named like a skill is refused (ADR-0006). Full wiring: §5.5.

## 16. A success code describes the call, never the outcome: verify at the destination

`ok: true`, exit 0, `201`, `accepted`, a returned id or URL all say the request was well formed. None of them says the thing happened. A green receipt is the most dangerous kind of green, because it suppresses the verification that would have caught the failure. So verify by reading the destination back: a Jira transition by re-reading the issue's status (`bun run jira:sync-issues get <KEY>`), a deploy by polling the deployment for the pushed commit SHA until it reads `READY` (never "the push succeeded" or "Vercel accepted the build"), a Supabase migration by re-reading the schema or migration list it was meant to change, a push to a protected branch by `bun run git:policy verify` (a push that went through may have been a bypass), a file write by re-parsing the file, a subagent's "done" by checking the files or tests it claims. This binds subagent reports, `[ISSUE_TRACKER_TOOL]` writes, MCP calls, the updater and every CLI in `.agents/instructions/agent-tool-resolution.md` §6.5. Where verifying is expensive, say the claim is unverified rather than letting the receipt stand in for it.

## 17. Committed prose names the source of truth, never its current value

Committed text (`AGENTS.md`, `.agents/**`, `docs/**`, `README.md`, `INSTALLER.md`, `CONTEXT.md`, the decks and the Pages home) never states a fact that changes with the normal life of the repo, the tracker or the deploy platform. Every such fact goes stale within weeks, and then every session either trusts a wrong value or burns a turn reporting the drift. The families to avoid:

- A count that moves (skills, aliases, MCP servers, scripts, Jira fields or statuses, tests, files, rows, gates `N/N`).
- An enumeration of a mutable set owned elsewhere (the skill list, the alias list, the server list, the updater surfaces).
- A `file:line` citation (a path, a symbol or a heading is fine). <!-- volatile-ok: names the form it forbids -->
- A current-state claim ("today", "currently", "as of <date>", a dated verification, a measured size, a tool version, a PR or issue number as live state). <!-- volatile-ok: names the words it forbids -->
- Edit-history narration inside doctrine ("since <version>", "correcting an earlier claim").

Write the name of the owner instead and let the reader resolve it: a file (`.mcp.json`), a command (`bun run skills:registry`), a generated artifact (`REGISTRY.md`), a constant (`SURFACE_ORDER` in `cli/lib/updater-parity.ts`). Stable names that change only by decision are fine: stage names, rule numbers, file and command names, "three hosts". Exempt: gitignored files and `.session/**`, generated artifacts, ADRs, `CHANGELOG.md` and dated reports (a number "at the time" is right forever), test fixtures, code constants, and example output inside fenced blocks. A fact that must be stated with its date goes to an ADR and the doctrine links to it; the measurements behind this repo's own doctrine are in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`. `scripts/lint-skills.ts` and `scripts/lint-docs.ts` (`bun run docs:check`) flag the two regex-visible families (`FILE-LINE`, `CURRENT-STATE`) as blocking errors in `repo:check`; a line that must carry one is marked `volatile-ok: <reason>`. Canon and examples: `agentic-dev-core/references/volatile-facts.md`.

---

## 18. No comments in code by default

Code carries no comments. A comment stays only as a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or as one line of WHY the code cannot express and a reader would otherwise get wrong. A comment that survives is written in English (Rule #12).

Explanations and teaching go to docs and decks, where a reader looks for them and a reviewer maintains them. A comment that restates the code, narrates a step, banners a section or leaves an example TODO costs a line on every read and drifts out of date silently.

A comment never justifies skipping a rule. When a check fires, fix the cause, or disable that one rule on that one line with `eslint-disable-next-line <rule> -- <reason>` so the reason is a directive the toolchain reads.

The rule binds new and edited code everywhere in the repo. Existing comments are not purged retroactively; touch them only when the edit already reaches that line. Decision: ADR-0023 (GUARD, rule R6).
