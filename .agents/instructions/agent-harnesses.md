---
id: harnesses
title: "Multi-harness: one source, every harness"
load_when: "editing a harness surface (CLAUDE.md shim, .claude/skills alias, hooks, MCP configs, .pi/), which harnesses a project uses (harnesses:), the updater (bun sync, --adopt), the husky gates, the project.yaml schema, or any cli/ code"
triggers: ["\\bharness", "\\bhooks?\\b", "\\.mcp\\.json", "\\bopencode\\b", "\\bcodex\\b", "\\.pi/", "\\bpi\\s+(?:adapter|extensions?|mcp|workers?|trust)\\b", "\\b(?:works?|runs?|running)\\s+(?:\\w+\\s+)?(?:in|on)\\s+pi\\b", "agents:compat", "\\bupdater\\b", "bun sync\\b", "--adopt", "\\bhusky\\b", "project\\.schema", "agents:schema", "harness:env", "CLAUDE\\.md", "\\.claude/", "AGENTS\\.md", "\\b(?:instructions?|router)\\b.*\\b(?:sections?|triggers?|rows?)\\b"]
paths: [".claude/", ".codex/", ".opencode/", ".pi/", ".husky/", ".mcp.json", "opencode.jsonc", "cli/", ".agents/hooks/", ".agents/project.schema.yaml", ".agents/instructions/"]
---

# Multi-harness: one source, every harness

> Section `harnesses` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file and keep its prose out of `AGENTS.md`.

## 5.5 MULTI-HARNESS: ONE SOURCE, EVERY HARNESS

> This repo runs on **Claude Code, OpenCode, Codex (CLI + Desktop) and Pi** from one copy of every instruction and every skill. Where the harnesses genuinely differ (MCP file format, hook API), each keeps a thin versioned adapter, and nothing else is duplicated.

**Instructions.** `AGENTS.md` is the only always-on instruction body (L0). The sections under `.agents/instructions/` (L1) are read on demand through its router, the same way on every host. No host loads them natively, and no `@` import pulls them in, because Claude Code loads an imported file in full at launch. L0 imports exactly two data files, `package.json` and `.agents/project.yaml`, as bare `@` tokens in their router rows (Claude Code loads them; OpenCode and Codex follow the row). `bun run instructions:check` refuses any other bare `@` token and gates the L0 byte budget under Codex's `project_doc_max_bytes` cut.

OpenCode and Codex load `AGENTS.md` natively. Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline: a documented import, not a symlink, so it survives a Windows checkout. NEVER write operational prose into `CLAUDE.md` (Critical Rule #15). That is structural drift, and `agents:compat:check` fails on it. Every edit to `AGENTS.md`, a section, the router or a `triggers:` list follows `agentic-dev-core/references/instructions-doctrine.md`: it places each sentence, then gives the procedure that closes with `bun run instructions:check` (ADR-0014).

| Surface | Claude Code | OpenCode | Codex CLI + Desktop | Pi |
|---|---|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) | `AGENTS.md` (native) |
| Instruction sections | `.agents/instructions/` (on demand, via the L0 router) | `.agents/instructions/` (on demand) | `.agents/instructions/` (on demand) | `.agents/instructions/` (on demand) |
| Skills | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) | `.agents/skills/` (native) |
| Commands | none: `/<skill> <mode>` (the skill slash, through `.claude/skills`) | none: name the skill and mode in prose | none: name the skill and mode in prose | none: `/skill:<name> <mode>` |
| Hook | `.claude/settings.json` → `UserPromptSubmit`, `SessionStart`, `PostToolUse` | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit`, `SessionStart` | `.pi/extensions/agentic-dev.js` |
| MCP | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` | `.pi/mcp.json` |

### Which harnesses are checked

A project that runs on one or two harnesses deletes the others' files, and every compatibility gate (`agents:compat:check`, `setup:doctor`, the installer, `bun sync`) then checks only the harnesses in use (ADR-0013). `declaredHarnesses(root)` in `cli/lib/harness-selection.ts` answers that question once.

- The top-level `harnesses:` list in `.agents/project.yaml` wins. When it is absent or `null`, the gates detect from the files present (`HARNESS_FILES`). A harness is in use while any of its files exists, so deleting one file of a harness in use is still drift and fails. Each harness left out prints one `NOTE:` line, never an error.
- The boilerplate itself (`isSchemaOwner`) checks every harness, so a deleted adapter here fails.
- Pi's files are exactly `.pi/mcp.json` and the adapter, never `.pi/` as a directory. Pi packages write runtime state there, and that must not put Pi in use (ADR-0022).
- Per harness: MCP parity compares only the configs in use, against Claude's `.mcp.json` while Claude is in use and otherwise against the first declared harness's file. The hook adapter, the route re-arm and the Codex 32 KB cap bind their own harness only. The `CLAUDE.md` shim and the `.claude/skills` alias are required only with Claude.
- `bun setup` writes the agents it configures into `harnesses:` as a union. It never removes one (dropping a harness is an edit to the yaml), and then it offers to delete the files of each harness left out, default keep. With nobody to ask, it declares a detected harness only when this repo has its files, unless `INSTALL_AGENTS` names it.
- A declared harness whose files are missing is fixed by `bun sync`, never by `agents:compat`. `bun sync` does not deliver, watch or report the files of a harness not in use, its `docs/mcp/` template included (`HARNESS_SYNC_PATHS`).
- Tests that read the OpenCode plugin or the Codex files skip when the checkout lacks them, and the plugin is imported dynamically, so `types:check` never needs a dropped harness.

### Generated files

Bold `[generated]` cells in the table above are output. Hand-editing one is drift: NEVER hand-edit a generated surface, and never commit `.claude/skills`, which is gitignored (Critical Rule #15). The schema's comments are the one hand-edited part of a generated artifact. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
|---|---|---|
| `CLAUDE.md` (one-line `@AGENTS.md` shim, never prose) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction, gitignored, never hand-edited) | `.agents/skills/` | `bun run agents:compat` |
| `.agents/project.schema.yaml` (the documented TEMPLATE a project's own yaml is compared against and a new project is seeded from; comments hand-written, VALUES synced from the yaml in the boilerplate only; SYNCED downstream) | `.agents/project.yaml` (values) | `bun run agents:schema` |

`bun run agents:compat:check` validates the contract for the harnesses in use: shim bytes, alias target, no command named like a skill, hook adapters, MCP parity, that `eslint.config.js` wires every block `eslint.config.base.js` exports, and that `.oxlintrc.json` extends `.oxlintrc.base.json`.

### `.agents/project.yaml` against its schema

A project's yaml is compared against the schema, not against the maintainer's copy. The file is `bootstrapOnly` (the sync never overwrites it, because it holds project identity) while upstream keeps adding blocks to it, so a project scaffolded before a block existed never learns it should have one. One schema-driven hook back-fills every key. A hand-written hook per block does not scale and would copy the maintainer's answers (push authorization included) into a project.

The yaml holds values only, and the schema carries every comment (ADR-0021), because the yaml is imported into every Claude Code session start and the schema into none. A new key goes in both files: the schema with its comment, the yaml value only.

- `bun run agents:schema` syncs only the schema's values down from this repo's yaml. It blanks every identity leaf back to `null` (the leaves are `IDENTITY_PATHS` in `cli/lib/agents-schema.ts`), keeps the methodology defaults, and replaces the `git_strategy` answers that are this repo's own (its ruleset notes, dates and standing push authorization) with `confirm`, `admin_bypass: false`, `inherited` and `declared`. A leak gate refuses to emit the file when a real date, ruleset, Atlassian or Supabase host, Vercel id, key, or one of this repo's own URLs or issue keys survives, in a value or a comment.
- Every seed and insertion into a project's yaml strips the comments (`stripYamlComments`, twinned in the scaffolder). The scaffolder seeds a new project's yaml from the schema (`seedProjectYamlFromSchema` in `packages/create-agentic-dev/src/prepare.ts`); `resetGitStrategyMeta` there is only the fallback for a template that ships no schema.
- The yaml's first line is a `MAINTAINER COPY:` sentinel, its only comment, which the schema never carries. A repo made with GitHub "Use this template" inherits the filled file. `bun run agents:setup` detects the line there (origin not the boilerplate) and reseeds the file from the schema after one confirm (`--reseed` is the non-interactive consent; `setup:doctor` warns on it).
- `bun run agents:schema:check` gates the pair in `repo:check` and pre-commit (through `.husky/framework-gates.sh`, guarded by the package.json key). The schema must be a fixpoint (regenerating changes nothing), so a key on one side only, or a value out of sync, fails the commit by name.
- `agents:schema` runs only in the boilerplate (`isSchemaOwner`). Downstream the schema is a plain synced file, and regenerating it there would write the project's own values over the template.

Three consumers read the comparison with three severities. `bun sync` offers to insert what a project lacks: insert-only, never an edit to an existing line, one prompt per top-level block at the schema's position, values only (`--auto` warns and mutates nothing). `bun run setup:doctor` and `bun run agents:schema --project` diagnose it. `repo:check` never fails on it, because being behind upstream is not a broken repo, and a red CI on every upstream key addition is how a team learns `--no-verify`.

The comparison reaches full key depth with `environments.*` wildcarded (a project running `uat` and no `staging` is not nagged). Values are never written back. A methodology value the project changed from upstream's default is only listed, as `<path>: yours <x>, upstream default <y>`, by `bun sync` and `setup:doctor` (identity, `GENERIC_RULES` leaves and the per-project blocks of `CHANGED_DEFAULTS_EXEMPT` excluded). Project-only keys are silent, and an unparseable yaml says so instead of degrading to a narrower key set. A project that deliberately deleted a block silences it with `updater.schema_exempt: [<block>]` in its own yaml.

Every write is a parser-located string splice, re-parsed to verify. NEVER call `parseDocument(...).toString()` on a file under `.agents/`: it rewraps folded scalars and rewrites `[main]` as `[ main ]`. `.agents/jira-required.yaml` keeps the 2-level walk: same drift, richer shape, its own follow-up. <!-- binds-in-section: updater and schema code under cli/ and scripts/, which routes here -->

### Skills and commands

A skill is invoked by name plus mode, and there are no command files (ADR-0006). The boilerplate ships no `.claude/commands/` or `.opencode/commands/`: a skill plus a mode is the one invocation form on every harness (`agent-skills-and-mcps.md` §5). A project may keep its own command files there. They are plain harness commands it edits by hand, and nothing generates or validates their body.

One refusal applies. A command whose name equals a repo skill hides that skill's instructions (Claude Code registers both under the same slash name and the command body wins). `agents:compat:check` fails on it, and `bun run agents:compat` (also run by `bun sync` and `bun setup`) moves it to `.backups/shadowing-commands/<same path>`, recoverable and never deleted. The old alias overlay `.agents/compatibility/command-aliases.project.json` is inert: nothing reads it, and the updater names it once in an informational row.

### The updater run

`INSTALLER.md` ("How a `bun sync` run goes", "What every `bun sync` reports" and the two "Updater safeguards" sections) describes the run and its row catalog: the dirty-tree guard's scope, `updater.protected_paths`, re-run safety through `.template/last-apply.json`, the `.context/PBI/` migration row, `package.json` rows, "Verificación" gate rows, `--strict`, `--dry-run` and the punctuation-insensitive heading comparison. This section keeps what an agent needs to act on the result and what a change to `cli/` must preserve.

`bun sync` closes with one "Estado por superficie" table (the updater's Spanish UI literal, "status per surface"; one row per surface, the list is `SURFACE_ORDER` in `cli/lib/updater-parity.ts`) and one parity prompt, saved to `.agents/prompts/parity-plan.md` (gitignored, single-use). The prompt has numbered rows with evidence (headings, hunk counts, server ids, command paths), one row per path: a watched file that also fails a compat contract is one blocking row with both evidences.

When you are handed that prompt, present the table and wait for a per-row decision (`keep project`, `take upstream` or `merge`). Apply only the chosen rows, then run tests, types and lint in that order.

**Choosing a decision.** `take upstream` is suggested only where the project lacks the content entirely. A row naming project-only servers, keys, headings or edits says `merge`, because applying `take upstream` there deletes project content (do it only when asked). A `merge` on a watched file says what to port and what to keep: `port upstream additions only: <keys>; keep project-only: <keys>`, `keep project` when only the project has extra keys, and `take upstream` only when upstream added keys and nothing else differs. A synced file the project had edited and the run overwrote is a `merge` row naming its `.backups/` copy.

**Rows that never block.** Rows on `package.json` and on "Verificación" are informational, and so are the rows for `.agents/project.yaml` and `.agents/jira-required.yaml`, which are compared by structure only (keys upstream added, never value differences, since values are project identity). An array-valued key reports `added: [...]` and `removed: [...]`, never "values differ".

**Exit and abort.** An aborted run (dirty tree, corrupt lock, failed clone, declined migration or self-update) prints "Abortado." and exits 1, naming "Commit sugerido" and the prompt path when a path is unrelated or hand-edited. A no-op run leaves the tree byte-identical, lock included. Without a TTY on stdin and no `--auto` or `--interactive`, the run assumes `--auto`.

**Protected and bootstrap files.** `.claude/settings.json` ships once when missing (bootstrap-only, like `.codex/`), then sits on the protected watchlist with `.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg`: never overwritten, one drift row per upstream change. A path just declared in `updater.protected_paths` gets its marker seeded with no row, and a watched file with no marker yet whose upstream copy has not changed since the lock cursor seeds silently. `eslint.config.base.js` is the synced half of the lint config (component `tooling`), the watched `eslint.config.js` spreads it, and `agents:compat:check` (group `lint`, `validateEslintBlockWiring`) fails on a scoped block the base exports that the project file does not wire.

`bun run skills:registry` reruns as the very last afterApply hook, and an overwritten `.agents/skills/**` row ends with `after restoring, run bun run skills:registry`. MCP registry rows name the server and the fields that differ (`context7: args differ`).

**Migrating a Claude-era repo.** The `.claude/skills` alias is not created on the run that migrates one, because staged `.claude/skills/*` deletions behind a symlink break lint-staged. Commit the migration, then run `bun run agents:compat`. The closing box says so ("Siguiente: commit de la migración, luego bun run agents:compat").

**Blocking exceptions.** Watched-file drift never blocks, with two declared exceptions, because half a release is worse than either half.

- A kept path listed in `PATH_PREREQUISITES` (`cli/lib/updater-parity.ts`; its upstream hunk gates another file of the same release, such as the skill vocabulary in `scripts/lint-skills.ts`) blocks and names the gate that proves it. That is why `skills:check` is a post-sync gate.
- A top-level `.agents/project.yaml` block that upstream added, the project lacks and a shipped skill reads (`CONFIG_BLOCK_READERS`, same file) blocks and names the skill. Take upstream's block and adapt its values, which stay the project's. A block the project has, whatever its values, stays informational.

**`.claude/settings.json` merge.** It gets an additive merge of `permissions.allow` and `permissions.deny` (`cli/lib/updater-settings.ts`). Entries upstream declares and the project lacks are appended after the project's own, after a backup. Nothing is removed or reordered, and `ask`, `env` and every other key stay untouched. A deliberately removed entry comes back, deliberately: an allow entry is refused in `deny`, which wins, and a deny entry is declined by exact text in `updater.declined_denies` (`.agents/project.yaml`; a malformed list is ignored, so it fails toward more denies).

`hooks` gets the same additive merge (`mergeHookGroups`), and it runs before the compatibility check. `agents:compat:check` requires some hook groups (the route re-surface `PostToolUse` group, the `SessionStart` re-arm groups), and a frozen file would leave the project failing pre-commit, pre-push and CI after the sync.

- An upstream command the project lacks under the same event and matcher (an absent, empty or `*` matcher are one key) is appended as a new group at the end of that event's list. The project's own groups are never edited, reordered or removed.
- A command is declined by exact text in `updater.declined_hooks` (every event that runs it). A command whose script the project lacks is skipped rather than wired to a missing file.
- A downstream compat error for a missing hook group ends with its fix (`run \`bun sync\``).
- Every merge that rewrites the file reads it with `parseJsonKeepingDuplicates`. A key a git auto-merge repeated (two `PostToolUse` lists) is folded into one list instead of losing the first to `JSON.parse`, and the fold is reported.
- One backup per run covers every write, and one informational row names what was added, declined, skipped or folded.
- `.codex/hooks.json` and the OpenCode plugin need no merge: they are framework files the sync rewrites.
- `opencode.jsonc` is never written. The upstream deny rules its `permission` block lacks become one `merge` row (MCP surface, folded onto the file's drift row) whose note is the JSONC block to paste. A pattern the project lists with any action is its decision and is never reported.
- `--adopt` takes both paths too. Its one exception: an app file with no `hooks.UserPromptSubmit` at all gets upstream's (the agent-context hook the compatibility contract requires; `mergeAdoptPromptHook`), and an app's own `UserPromptSubmit` is never replaced.

**Doctrine ledger.** `AGENTS.md` also carries an unresolved-doctrine ledger (`cli/lib/updater-doctrine.ts`, state in the gitignored `.template/doctrine-ledger.json`). A section upstream has and this file lacks entirely is tracked by content, not by the one-nudge sha marker, so `keep project` does not retire it. It re-surfaces as one aggregated, never-blocking row until the section is written, then clears itself.

**Plumbing rule for `cli/`.** `cli/**` must type-check under a host whose `ProcessEnv` requires `NODE_ENV` (Next.js). Never cast a plain object straight to `NodeJS.ProcessEnv` in `cli/` code; the boilerplate's own unit tests guard it.

### Updater `--adopt`: first run on an existing app

`bun <boilerplate clone>/cli/update-boilerplate.ts --adopt` never overwrites. It runs only on a repo with no `.template/boilerplate.lock.json`, and it is never inferred from a missing lock (a broken greenfield lock must not switch policy). A second `--adopt` on an adopted repo is a no-op, and `--adopt` refuses `--force` and component subsets.

- An upstream path the app lacks is delivered, and an identical one is marked seen. One the app already carries with other content is never written: it becomes a `merge` row and, when this run seeded `.agents/project.yaml`, an `updater.protected_paths` entry, so no later `bun sync` overwrites it (a row blocks while the path is unprotected).
- `package.json` stays append-only. The tooling's runtime packages land in `devDependencies`, and a package the app declares in any section is never added again. A script the app holds under an upstream name is kept as a blocking row (`prepare` and `setup` get a composition proposal).
- The app's `.env.example` receives the variables the tooling reads inside one sentinel block.
- `.agents/project.yaml` is seeded from the schema (identity null, `git_strategy` inherited; `cli/lib/git-strategy-provenance.ts` is the fallback for a template without one).
- App instruction text (`AGENTS.md`, `CLAUDE.md`, or both) gets one proposal: upstream `AGENTS.md` with that text verbatim under `## 0. Project instructions (pre-adoption)`, and `CLAUDE.md` as the shim. It applies only on an explicit yes. Otherwise it is saved under `.agents/prompts/` and its row blocks.
- The MCP registries no synced component creates (`ADOPT_DELIVER_IF_ABSENT`) are delivered when the app lacks them, never over its own. The boilerplate's numbered ADRs never travel, on that run or any later one (`ADOPT_REPO_ONLY_PATTERNS`, applied while `.template/installer.lock.json` records `adopted: true`).
- The tooling never borrows the app's root configs. `tsconfig.tooling.json` and `eslint.config.tooling.mjs` (synced, component `tooling`) scope `cli/` and `scripts/` and run by `bun run tooling:types:check` and `tooling:lint:check`. On an adopted repo, the framework gates, the eslint block-wiring check and the opening legs of `repo:check` (`bun scripts/tooling-check.ts repo`) use them instead of `types:check`, `lint:check` and `eslint.config.js`.
- The reverse direction needs the app. A stock Next.js `tsconfig.json` (and most app ESLint configs) reach `cli/` and `scripts/` and fail on Bun-only syntax. Each such app config, and a foreign hook manager (lefthook, simple-git-hooks, husky v4, the `pre-commit` framework, a custom `core.hooksPath`; `detectHookManager` in `cli/lib/hook-manager.ts`) that does not call the gates yet, is one blocking row with the exact lines to add. All of it is saved in `.agents/prompts/adopt-tooling-isolation.md` and repeated by `setup:doctor`. The app's file is never written (`cli/lib/adopt-isolation.ts`).
- Over a foreign manager the adoption never installs husky: an upstream `prepare` arrives without its `husky` step, because `husky` rewrites `core.hooksPath` and switches the app's hooks off.
- The adoption install never touches a database. It closes by pointing at `/project-adoption`, the skill that teaches the agentic layer the app (identity, `stack:`, tracker catalogs, protected paths) behind its own approval gate.

The owner is `cli/lib/updater-adopt.ts` plus the `adopt` option of `runUpdate` (`cli/lib/updater-core.ts`). A greenfield first run and a plain `bun sync` take none of these paths.

### Husky: one synced gates file, project-owned hooks

`.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg` are on the protected watchlist, so the project's own gates and their ordering survive every sync. The gates upstream owns live in `.husky/framework-gates.sh`, which is synced (component `husky`). Each hook sources it and calls one function (`framework_gates_pre_commit`, `framework_gates_pre_push` or `framework_gates_commit_msg "$1"`). That is how a gate added upstream reaches a project scaffolded earlier.

- Two linters (ADR-0024). `lint-staged` runs `oxlint -c .oxlintrc.json` on staged code, well under a second, with the `guard` plugin, the `cli/` import closure and the size limits active. ESLint stays the gate in `lint:check`, `repo:check`, `pre-push` and CI: it alone runs the type-aware `ts/*` rules (a missing `await` is `ts/no-floating-promises`) and the antfu style set. Pre-commit no longer autofixes style: `lint:fix` does, and `pre-push` catches the rest. `.oxlintrc.base.json` and `guard-eslint-plugin.js` sync; `.oxlintrc.json` is the project's (delivered once when missing by the `oxlint-config` component, then never overwritten) and `extends` the base (`validateOxlintWiring`; an adopted app runs no Oxlint and is exempt). `bun sync` installs nothing and keeps the project's `lint-staged`, so it leaves two parity rows: run `bun install` and switch `lint-staged` to `oxlint -c .oxlintrc.json`. ESLint runs every stock rule: `eslint-plugin-oxlint` was tried and dropped, because it switches off 93 core rules (`no-control-regex`, `no-empty-pattern`) on the assumption that Oxlint runs them, and our `.oxlintrc.json` keeps the `correctness` category off, so nothing would. A custom layer map goes in both `eslint.config.js` and `.oxlintrc.json` `settings.guard.layers`. `lint:check` stays uncached: a cached run keeps a stale verdict on type-aware rules. (enforced: `bun run agents:compat:check`, `bun test scripts/oxlint-config.test.ts`)
- `lint-staged` stays in the pre-commit hook, above the call. It rewrites staged files, so it finishes before anything reads the staged list. It also stages what its tasks modify in every tracked file they touch: when a task edits a file that carries unstaged changes, those unstaged changes get staged into the commit too. In a checkout other sessions share, commit or move aside the unstaged edits of the files you commit.
- The source line is `[ -f ]`-guarded, because `.husky/_/h` runs hooks under `sh -e` and a half-applied sync can leave the hooks present and the gates file gone.
- The commit-msg function runs the Rule #3 trailer check (`scripts/check-commit-trailers.ts`), warn-only.
- Documentation contracts follow the same tiers. `framework_gates_pre_commit` warns when a staged change touches a marked region without its pages. `framework_gates_pre_push` blocks (`scripts/lint-doc-contracts.ts --push`, escape `Docs-Checked: <label> <reason>` in a commit of the push) and runs `docs:check` on every push. `ci.yml` blocks the PR range.
- On an adopted repo (installer lock `adopted: true`) the gates run the tooling scope (`tooling:types:check`, `tooling:lint:check`) and skip the repo-wide `format:check`, because the app's code, configs and formatting are its own. A greenfield repo runs exactly the gates it always ran.
- An app whose hooks belong to another manager calls the same three functions from it (the snippet comes from `hookWiringSnippet`), and a hook that predates the split gets a parity row with the block to paste.
- `bun run git:policy verify` is deliberately not a pre-push gate. The declared-versus-host reconciliation stays agent-driven (`git-flow-master` Step 1b, once per session at the first push, PR or merge intent), because as a hook it would block every push of a fresh project whose inherited `git_strategy.policy` has not been reconciled with its host yet.

### Hook: one emitter, one adapter per harness

`.agents/hooks/personality-reinject.mjs` holds the prompt-time context once: the `AGENTS.md` §2 output contract (or the project's own, one paragraph in `.agents/personality-override.md`, which `agents:compat:check` validates; an unusable one keeps the default and adds a `PERSONALITY OVERRIDE IGNORED:` line after the identity line), the `AGENT IDENTITY: worktree=… session=… harness=…` line the commit trailers copy (Critical Rule #3), an `ORCA:` line only when the `orca` binary is reachable, at most one setup warning (no `.env` in the checkout, else a linked worktree that never ran `bun run worktree:provision`), and the `ROUTE:` lines (how they are chosen, capped and re-armed is "How a section is reached" in `.agents/instructions/README.md`).

Each harness runs the emitter through its own adapter:

- Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`) execute it as a `UserPromptSubmit` command hook, and again on `SessionStart` with the `compact` and `clear` matchers, to re-arm the routes after a compaction or a `/clear`. On Claude Code a `PostToolUse` hook with no matcher runs the same emitter and re-surfaces an unread route once (`ROUTE-PENDING:`).
- OpenCode imports the constant from the thin plugin `.opencode/plugins/personality-reinject.js`: one default export `{ id, setup, server }` pushing the same `agentContextLines`. It loads on both plugin generations. OpenCode 2 calls `setup(ctx)` and registers `ctx.session.hook('context')`. OpenCode 1 calls `server()` for `experimental.chat.system.transform`.
- Pi imports the same exports from one extension, `.pi/extensions/agentic-dev.js`. It classifies the raw prompt from `input` (`before_agent_start` sees `/skill:` already expanded), hands the lines over as a hidden message, names the session with `pi.setSessionName` from the shared `proposeSessionTitle`, re-surfaces `ROUTE-PENDING:` from `tool_result` and re-arms on `session_compact` (`validatePiAdapter`).

`cli/lib/agent-compatibility-contracts.ts` enforces the contract: no absolute personal paths, no duplicated personality hook file, the identity exports and markers present in the emitter, `agentContextLines` in the plugin, both OpenCode entrypoints present (`validateOpenCodePluginEntrypoints`), and the system prompt mutated in place.

### Hook: edit-time documentation contracts (ADR-0017)

A second, separate hook, `.agents/hooks/doc-contracts.mjs`, runs as a `PostToolUse` command hook on file edits in Claude Code (matcher `Edit|Write|MultiEdit`) and Codex (matcher `Edit|Write`, mapped to `apply_patch`). When an edit lands inside a `LINT.IfChange(<label>)` region, it adds one `DOCS:` line naming the pages its `LINT.ThenChange(...)` lists, once per session per label. OpenCode and Pi register no adapter (model context from `tool.execute.after` is not verified) and rely on the gate. In v1 it is for maintainers only and stays silent outside the boilerplate's own checkout. `agents:compat:check` holds both registrations there (`validateDocContractHooks`).

### MCP: one declared set, one file per host

The canonical server set is whatever `.mcp.json` declares (the first declared harness's file when Claude is not in use). Every server there must exist in the other configs in use (`opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`) with the same `.env` dependencies and the same literal env settings. A server present in one host only fails, naming the server and the host.

Parity normalizes each native format (JSON, JSONC, TOML) into a common shape (transport, command, args, url, env vars, enabled) and compares that. The servers this boilerplate ships (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`) also get a strict per-host shape check whenever the project declares them. Any other server gets the generic check only, so a downstream project may drop or add servers freely. Parity compares the real values but never prints one: a message shows each literal value as `<redacted>` (or the `${VAR}` it references) and names the keys whose values differ, and a parser error loses its quoted fragments (`cli/lib/ui/redaction.ts`).

**The `.env` loader.** Env values never travel through a host's own syntax. Every stdio server that needs `.env` values starts, on every host, through the loader `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>` (`MCP_ENV_LOADER_*` and `mcpEnvLoaderArgs` in `cli/lib/agent-compatibility-contracts.ts`, ADR-0012). At spawn time the loader reads the varlock schema plus `.env` and `.env.local` (or the secret manager the schema names, ADR-0011) from the project root, however the harness was launched (desktop app, natively launched worker). It hands the server only the names in its filter, so the filter is the server's `.env` dependency set that parity compares.

- A server that needs no value (context7) launches bare.
- No `${VAR}`, `{env:}`, `{file:}` or `env_vars` may sit beside the loader: an unset `${VAR}` breaks a desktop launch, and an empty inherited value shadows `.env`.
- Codex keeps `startup_timeout_sec = 30` on each stdio server (its 10-second default is too short for a cold `bunx` fetch plus the loader hop), and `bearer_token_env_var` only on a remote one.
- A missing loader, a host-side reference beside it or a missing Codex budget fails `agents:compat:check` in the boilerplate. Downstream it is a warning naming the file and the exact launch, because the MCP configs are bootstrap-only or protected and a sync never delivers the fix.
- Pi reads Claude's `mcpServers` shape plus its own keys (`exposure`, `description`), which parity ignores. A `!command` value there runs a shell and is refused.
- A project scopes parity in `checks.mcp_parity` of `.agents/project.yaml` (documented in `.agents/project.schema.yaml`): `mode: local-only` for a per-machine `.mcp.json` that a committed `.gitignore` ignores, `relay` for a Pi that reaches every stdio server through one tracked project launcher, and `unrelayed` for the servers that launcher cannot carry, http, disabled or taking a value from the host (warned by name, never silent). Absent, parity runs strict as described here.
- Critical Rule #9 applies to every host.

### Harness-specific gotchas

- **Codex trust.** Project `.codex/` config and hooks load only in a trusted repository. Trust is runtime state that file reads cannot verify.
- **Codex Desktop** consumes the same repository config as the CLI.
- **OpenCode hook API** is experimental, so re-verify on OpenCode upgrades. Claude Code and Codex sit on stable hook APIs.
- **Pi trust.** Project trust gates `.agents/skills`, `.pi/mcp.json` and `.pi/extensions`, while `AGENTS.md` loads regardless. Untrusted, a session has no skills, no MCP and no adapter, and print and RPC modes skip them under the default `ask`. `bun run setup:doctor` reports trust apart from file correctness, from `trust.json` and `defaultProjectTrust`. A machine that runs workers trusts the parent folder.
- **Pi has no deny config and no approvals.** Bypass is its only state, so `permission_modes.conductor: auto` cannot be honoured there. The adapter's `tool_call` block stands in for Rule #1's deny entries (the `.env` and `.envrc` families, `.auth/**`, `.claude/settings.local.json`, the printing commands; `grep` output from secret files is withheld). It is a seatbelt: shell variants (`cat .env`) pass, `pi-subagents` background children are untested, and an untrusted session has no adapter and so no block (ADR-0022). Pi ships no subagents, question tool or plan mode.
- **Pi MCP exposure.** Every server in `.pi/mcp.json` is `exposure: "deferred"`, found through `tool_search`. Pi's default `codemode` declares no tool to the model, which breaks resolving a capability by suffix. A tool name replaces every other character with `_` (§6). `.pi/` is a `.gitignore` allowlist, so package state never reaches a commit. Engram on Pi is wired by hand (`engram setup` does not name it), and the installer prints the line.
- **Pi on Windows** is unverified.
- **Plugins stay harness-specific.** The Engram plugin (session hooks) is a Claude Code plugin, `engram setup <agent>` wires the Engram MCP server on every host, and the memory rules (`AGENTS.md` §12) do nothing where that server is absent.
- **Open a harness as its bare binary** in the project folder (`claude`, `opencode`, `codex`, `pi`) or its desktop app. No script wraps it and nothing loads `.env` into its process, so no secret value reaches the agent's shell (ADR-0016 retired the `bun run <harness>` scripts and `scripts/launch.ts`). A command the agent runs that needs a `.env` value goes through the loader in a subprocess, `bunx varlock run -- sh -c '<command using "$VAR">'` (`agentic-dev-core/references/secret-hygiene.md` §3). `bun` scripts autoload `.env`. A stale value the shell exports still wins over `.env` inside every varlock load, MCP servers included, and `bun run vars:env:check` names it (names and lengths only).
- **Every launch gets its MCP credentials from the `.env` loader** (terminal, desktop app and a natively launched supervised worker alike). A remote (HTTP) server that reads a token from the harness's own environment (`${VAR}`, `{env:VAR}`, `bearer_token_env_var`) gets none, so prefer its OAuth login. No plaintext copy of a credential is written for a harness to read. `bun run harness:env` retires the copies the old generator left (the `env` block of `.claude/settings.local.json`, `.auth/opencode/<VAR>`). A copy equal to `.env` is deleted. One `.env` does not reproduce is moved to `.auth/harness-env-backup/<VAR>` (mode `0600`) and named: the human puts the right value in `.env`, then deletes that directory. One a legacy host config still reads is kept until that config moves to the loader. `bun run harness:env:check` exits 1 while a stale copy remains, and `bun run setup:doctor` reports them under "Plaintext MCP credential copies". After a `.env` change nothing needs re-running: restart the agent session (OpenCode: its background service too, `opencode service restart`, because it caches the resolved config per directory).

The Pi facts above were measured on 1.4.0 and 1.5.0 in the QA twin, 2026-11-04, re-probed here on 1.4.0, 2026-11-06, and the adapter's secret block re-measured on both, 2026-11-08. <!-- volatile-ok: harness facts carry the version they were measured on -->
