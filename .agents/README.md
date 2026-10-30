# `.agents/` — agent-consumed project configuration

Tool-agnostic source of truth for the data AI agents need to operate on this repository.

## Purpose

`.agents/` separates portable, per-project values from the implementation detail of any specific agent (`.claude/`, `.cursor/`, `.gemini/`, …). Whenever a prompt or doc references a variable like `{{PROJECT_NAME}}` or `{{jira.severity}}`, the resolver looks here first.

The directory has two roles:

1. **Per-project config** — values you fill in once when you adopt the boilerplate (`project.yaml`).
2. **Workspace-resolved metadata** — auto-generated catalog of your Jira workspace's custom fields (`jira-fields.json`) and workflows / statuses / transitions (`jira-workflows.json`), validated against the methodology's declarative manifest (`jira-required.yaml`).

## Files

| File                  | What it is                                                                                                                                                                       | Who edits it                             | How to regenerate                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `project.yaml`        | Human-edited project config: project name, repo paths, URLs, MCP server names, issue-tracker metadata, default env. ALSO holds the `git_strategy:` block (this repo's git workflow — read by `git-flow-master`; see §"`git_strategy`" below), the `updater:` block (files `bun sync` must keep as the project's own; see §"`updater`" below), and the `orchestration:` block (defaults for supervised multi-session worker fleets, read by `orca-orchestration`; see §"`orchestration`" below). | You (project owner) / `git-flow-master` | Edit by hand. The `git_strategy:` block is filled by `git-flow-master` Strategy Setup, NOT by `agents:setup`. |
| `jira-fields.json`    | Auto-generated catalog of every custom field in your Jira workspace, keyed by canonical slug. Each entry has `id`, `type`, optional `name`, `options`, `system`, `provider`.     | Generated only — **do not edit by hand** | `bun run jira:sync-fields`                                                   |
| `jira-workflows.json` | Auto-generated catalog of work-type workflows, statuses, and transitions resolved against your Jira workspace. Companion to `jira-fields.json` for the work_types substrate.     | Generated only — **do not edit by hand** | `bun run jira:sync-workflows`                                                |
| `jira-link-types.json` | Auto-generated catalog of every issue link type in your Jira workspace (e.g. `blocks`, `relates`, `is caused by`), keyed by canonical slug. Each entry has `id`, `name`, `outward`, `inward`, `exists_in_workspace`. | Generated only — **do not edit by hand** | `bun run jira:sync-link-types`                                               |
| `jira-required.yaml`  | Declarative manifest of the custom fields the methodology requires (with expected types, option lists, and consumers). The contract between skills/commands and the user's Jira. | Methodology maintainers                  | Updated when a skill or command adds or drops a `{{jira.<slug>}}` reference. |
| `project.schema.yaml` | GENERATED template of `project.yaml`: every identity value blanked to `null`, methodology defaults kept, `git_strategy` answers replaced by safe defaults. A new project is seeded from it; `bun sync` and `bun run setup:doctor` compare a project's `project.yaml` against it. Synced by `bun sync`, never generated downstream. | Generated only — **do not edit by hand** | `bun run agents:schema` (boilerplate only; `agents:schema:check` gates it)     |
| `README.md`           | This file.                                                                                                                                                                       | Methodology maintainers                  | —                                                                            |

## `git_strategy` (block inside `project.yaml`)

The persisted source of truth for **this repository's** git workflow lives as the `git_strategy:` block inside `.agents/project.yaml` (not a separate file). `git-flow-master` reads it before any branch / commit / push / PR / `gh` operation and adapts every action to the declared strategy. When `git_strategy.strategy` is `null` OR `meta.strategy_source` is `inherited` (the shipped default nobody chose for that project), `git-flow-master` detects the strategy per-invocation and OFFERS **Strategy Setup**, which fills the block and stamps `strategy_source: chosen`.

**Lifecycle**

- **Ships as a default, not a decision** — the block carries `strategy: solo-main` with provenance stamps in `meta:`. A fresh project is seeded from `project.schema.yaml`, whose block is `strategy_source: inherited` / `policy_source: declared` / `policy_verified: null` / `direct_push_to_protected: confirm` / `admin_bypass: false` with no `accepted_divergences` and a TODO `description` (`packages/create-agentic-dev/src/prepare.ts` → `seedProjectYamlFromSchema`; `resetGitStrategyMeta` is the fallback for a template older than the schema), so a consumer project starts with a placeholder it is expected to replace via Strategy Setup on first git use. This repo itself carries `strategy_source: chosen`.
- **Autogenerated** by `git-flow-master` Strategy Setup (pick the flow → create only the branches that flow needs → write the block in place).
- **Committed / tracked** — part of each project's git workflow contract.
- **Frozen by `bun sync`** — `project.yaml` is in the updater's `bootstrapOnlyPaths`, so a consumer project's filled strategy is never overwritten.
- **Hand-editable** — edit the block to change the workflow, or re-run Strategy Setup.
- **Not a `{{VAR}}` source** — `vars:check` skips the `git_strategy:` block (its leaves are read directly by the skill, not as template variables).

**Field schema**

| Field | Type | Description |
|---|---|---|
| `strategy` | enum | `solo-main` / `main-integration` / `enterprise` / `trunk-based` / `gitflow` / `github-flow` / `gitlab-flow`. `null` until Strategy Setup runs. |
| `description` | string | Human-readable summary of the chosen flow. |
| `branches.production` | string | Production / default branch (e.g. `main`). |
| `branches.integration` | string\|null | Long-lived integration branch, if any (e.g. `staging`). |
| `branches.ephemeral_pattern` | string\|null | On-demand trunk pattern for short-lived branches (e.g. `feature/*`). |
| `protected[]` | string[] | Branches requiring explicit confirm before a direct push. |
| `decisions.promote_method` | enum | `ff-only` / `merge-commit` / `squash` / `n/a`. |
| `decisions.feature_merge` | enum | `merge-commit` / `squash` / `rebase-merge` / `n/a`. |
| `decisions.hotfix_policy` | enum | `branch-off-prod-backmerge` / `via-integration` / `none` / `n/a`. |
| `policy.direct_push_to_protected` | enum | `forbidden` / `confirm` / `allowed` — direct pushes to protected branches. |
| `policy.admin_bypass` | bool | Team policy: may a repo admin bypass PR/protection for urgent changes? Intent only — real capability depends on the GitHub user's role; the skill re-confirms at runtime. |
| `policy.require_pr_reviews` | int\|null | Min approvals before merge to a protected branch. Records the team's EXPECTATION — what the host enforces is discovered by the Step 1b reconciliation. |
| `policy.accepted_divergences[]` | list | Host divergences formally ACCEPTED, not drift. Each entry names a `bun run git:policy verify` finding verbatim (`field`), plus `enforced`, `accepted` date, and `reason`. `verify` reports matching findings as ACCEPTED instead of DRIFT (exit 0), flags an entry that matches no drift as STALE, and `--stamp` records `meta.policy_source: accepted`; `apply` preserves the host's side for accepted fields. |
| `branch_prefixes.precedence` | list | Order for choosing a prefix when several apply. |
| `branch_prefixes.naming_with_key` | string | Branch-name template with an issue key (e.g. `feat/UPEX-123-slug`). |
| `branch_prefixes.naming_without_key` | string | Branch-name template without a key. |
| `meta.setup_version` | int | Strategy Setup schema version. |
| `meta.created` | string | Date stamped by Strategy Setup. |
| `meta.policy_verified` | string\|null | Date of the last reconciliation of `policy:` against the host (`git-flow-master` Step 1b). `null` = never verified. |
| `meta.policy_source` | enum | `verified` / `accepted` / `declared`. `verified` = host matches the yaml exactly; `accepted` = every divergence is formally listed in `policy.accepted_divergences`; with `declared`, the skill never states what the remote requires — it says "declared, not verified". |

**Policy drift.** `policy:` is intent; the hosting platform is enforcement. They drift (someone tightens protection in the UI, or the block was filled before the remote existed). `git-flow-master` reconciles them once per session at the first push / PR / merge intent, reports any mismatch with both values, and lets YOU decide whether to align the file, change the host, or accept the divergence. It never edits the block on its own.

## `updater` (block inside `project.yaml`)

`bun sync` never overwrites the files on its protected watchlist (`AGENTS.md`, `.agents/project.yaml`, `.agents/jira-required.yaml`, `tsconfig.json`, `eslint.config.js`, `.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push`): a watched file inside a synced component is delivered once when missing, then it is project-owned, and when upstream's copy changes the parity report shows a drift row with evidence (keys, headings or hunks) instead of touching it. The `updater:` block lets a project extend that list.

```yaml
updater:
  protected_paths: # repo-relative FILE paths; empty by default
    - scripts/lint-vars.ts
    - .agents/skills/acli/SKILL.md
```

- **When to list a path**: a synced file you merged by hand and want to keep across syncs. The parity row `project edit overwritten; backup: .backups/...` names exactly that situation and ends with the fix (`add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge`); the saved `parity-plan.md` repeats it under the row as the YAML to paste.
- **Semantics**: identical to the upstream watchlist. Never overwritten (also under `--auto` and `--force`), delivered once from upstream when the file is missing locally, included in the sparse checkout so its upstream copy can be diffed, one drift row per upstream change (marker under `.template/upstream-sha/`).
- **Validation**: a path outside the repo (absolute, `..`), under `.git`, a directory, or a non-string is reported at the start of the run (`updater.protected_paths (.agents/project.yaml): entrada ignorada "...": <reason>.`) and ignored; the run continues. Duplicates and paths already on the upstream watchlist are folded silently.
- **Bootstrap-only**: `project.yaml` is never synced, so the list is entirely yours. Both keys are allowlisted in `external_consumers` (not `{{VAR}}` sources).

### `updater.schema_exempt`

Top-level blocks of `project.yaml` this project has deliberately removed and does not want offered back.

```yaml
updater:
  protected_paths: []
  schema_exempt: [autonomous_delivery] # top-level block NAMES, not key paths
```

`bun sync` compares this file against `project.schema.yaml` to full depth and offers to insert what upstream has and you lack, one prompt per block, insert-only, each block at its schema position under a `# NEW in <release>` marker. A block you removed on purpose would be re-offered on every run forever, and a warning that recurs forever is one people silence wholesale, which costs them the real gaps too. Listing it here silences that block and nothing else.

- **Block names only.** `autonomous_delivery`, not `autonomous_delivery.caps`. The prompt is per block, so the opt-out is too.
- **It silences, it does not fix.** An exempt block is still absent. `bun run agents:schema --project` prints what is silenced alongside what is missing, so the decision stays visible. A block a shipped skill reads (`CONFIG_BLOCK_READERS` in `cli/lib/updater-parity.ts`) still gets its parity row naming the skill.
- **Read directly by the updater** (`schemaExemptions` in `cli/lib/agents-schema.ts`); add `schema_exempt` to `external_consumers` when you set it, like `protected_paths`.

### `updater.declined_denies`

Upstream deny rules this project does not want in `.claude/settings.json`.

```yaml
updater:
  protected_paths: []
  declined_denies: ['Bash(env)'] # exact entries, written as in permissions.deny
```

`.claude/settings.json` is never overwritten, but two of its lists grow on every `bun sync`: entries upstream has in `permissions.allow` or `permissions.deny` and the project lacks are appended after the project's own, after a backup. Nothing is removed or reordered, and `ask`, `env` and every other key stay as written (`hooks` has its own additive merge, below). That is how a project scaffolded before a deny rule shipped (the secret denies, for one) receives it. An allow entry you do not want is re-expressible in `deny`, which wins; a deny entry has no stronger list, so you decline it here.

- **Exact entries, per rule.** `Bash(env)`, not a pattern over entries. Every other upstream deny, including one a later release adds, still arrives: listing `.claude/settings.json` in `protected_paths` would not opt out (the file is already watched) and would not be the right size anyway.
- **It never removes.** A declined entry the file already holds stays until you delete it by hand; the list only stops the updater from adding it back.
- **A malformed value fails toward more denies.** Anything but a list of strings is reported at the run and ignored.
- **`opencode.jsonc` is never written.** Its `permission` block is JSONC with ordered rules (the last match wins), so the upstream deny rules it lacks become one parity row on the MCP surface with the block to paste in the saved prompt. An upstream exception that follows a missing deny in the same map (`"*.env.example": "allow"` after `"*.env.*": "deny"`) travels in the block right after it, with the project's own action when it lists the pattern, so pasting cannot turn the exception into a deny. To decline one there, list the pattern yourself with another action (`"printenv*": "ask"`): a pattern the project lists, whatever its action, is never reported.
- **Read directly by the updater** (`readDeclinedDenies` in `cli/lib/updater-settings.ts`); add `declined_denies` to `external_consumers` when you set it.

### `updater.declined_hooks`

Upstream hook commands this project does not want in `.claude/settings.json`.

```yaml
updater:
  protected_paths: []
  declined_hooks: ['node "$CLAUDE_PROJECT_DIR/.agents/hooks/doc-contracts.mjs"'] # exact command text
```

The `hooks` block grows on every `bun sync` too, before the compatibility check runs: an upstream hook command the project lacks under the same event and matcher is appended as a NEW group at the end of that event's list, after a backup. The project's own groups are never edited, reordered or removed. That is how a hook group `agents:compat:check` starts requiring (the route re-surface `PostToolUse` group, ADR-0018) reaches a project scaffolded before it, instead of leaving pre-commit, pre-push and CI red until someone edits the file by hand.

- **Exact command text, every event.** A listed command is left out wherever upstream runs it; the run reports it as declined.
- **A required hook stays required.** Declining a command `agents:compat:check` asserts on keeps that check red: the opt-out is for hooks the check does not require.
- **A command whose script you lack is not added.** It is reported instead, because a hook pointing at a missing file fails on every event.
- **A repeated key is folded, not lost.** A git auto-merge can leave `"PostToolUse"` twice in one object; `JSON.parse` keeps only the last. The merge folds both lists into one and reports it.
- **Read directly by the updater** (`readDeclinedHooks` in `cli/lib/updater-settings.ts`); add `declined_hooks` to `external_consumers` when you set it.

## `secrets` (block inside `project.yaml`)

Where SECRET values come from. `local` (the default) means `.env` / `.env.local`; a secret manager is the advanced opt-in (`.context/ADR/ADR-0011-secret-manager-advanced-option.md`).

```yaml
secrets:
  provider: local # local | 1password
  onepassword:
    vault: null # vault the op:// references point at (e.g. myproject-dev; Private on a personal plan)
    account: null # sign-in shorthand from `op account list`; null = the CLI default account
    auth: app # app (desktop app locally, service account in CI) | service-account (token only)
```

- **Written by `bun setup`** (Credentials phase, `cli/lib/secret-providers.ts`), which also writes the committed overlay `.env.provider.schema` once (references only, never values, never overwritten). A yaml without the block reads as `local`, and the installer appends it with its comments.
- **An unknown `provider` or `auth` fails loudly** instead of guessing, so a team is never sent to the wrong source in silence.
- **Read directly** (`parseSecretsConfig`), never as a `{{VAR}}`; `provider` and `onepassword` are listed in `external_consumers`.
- Steps for the human: `INSTALLER.md`, "Secret manager (advanced)".

## `orchestration` (block inside `project.yaml`)

Default settings for **supervised multi-session worker fleets**: one conductor session coordinating N persistent workers through the Orca runtime (or, without Orca, the same launch lines pasted by hand). Owned and read by the `orca-orchestration` skill. Unlike `git_strategy` and `updater`, this block is a **flat, top-level section like `project:` or `testing:`**: its scalar leaves ARE `{{VAR}}` template variables, resolved lexically by their bare leaf name (no `ORCHESTRATION_` prefix), per the flat-key rule in §"Variable syntax conventions" below.

```yaml
orchestration:
  max_workers: 3        # concurrent workers per round (example value)
  default_agent: claude # claude | codex | opencode
  default_model: claude-opus-5-5   # worker model: full provider model id, never an alias
  default_effort: high             # harness effort level when supported
  conductor_model: claude-opus-5-5 # conductor model: full provider model id
  conductor_effort: high
  subagent_model: sonnet           # the harness's subagent vocabulary, never a full id
  permission_modes:                # map, read by path
    conductor: auto
    worker: bypass
    subagent: inherit
  model_overrides: []              # list, read by path
```

| Field | `{{VAR}}` name | Description |
|---|---|---|
| `max_workers` | `{{MAX_WORKERS}}` | Ceiling on concurrent workers per round (a concurrency group; see `orca-orchestration/references/topologies.md` §5). Merge and staging deploy stay serialized through the conductor whatever the cap. |
| `default_agent` | `{{DEFAULT_AGENT}}` | Which harness launches a worker when the user doesn't say: `claude` \| `codex` \| `opencode`. |
| `default_model` | `{{DEFAULT_MODEL}}` | The WORKER model: full provider model id passed to the launch, never an alias (an alias moves between rounds, gotcha G29 in `orca-orchestration/references/gotchas.md`). Empty `''` is allowed only when the conductor reads the model off the worker's screen at readiness and records it in the roster. |
| `default_effort` | `{{DEFAULT_EFFORT}}` | Effort level passed to the worker launch, when the harness supports one. |
| `conductor_model` | `{{CONDUCTOR_MODEL}}` | The CONDUCTOR model, same rule as `default_model`: a full provider model id. |
| `conductor_effort` | `{{CONDUCTOR_EFFORT}}` | The conductor's effort level, when the harness supports one. |
| `subagent_model` | `{{SUBAGENT_MODEL}}` | The model a one-shot subagent gets, in the harness's OWN subagent vocabulary, never a full id (Claude Code's Agent tool takes `sonnet` \| `opus` \| `haiku` \| `fable`). |
| `permission_modes` | *(none, read by path)* | Map `conductor` / `worker` / `subagent` to a mode in the repo vocabulary `bypass` \| `auto` \| `ask` \| `inherit`. Translated per harness in ONE table: `orca-orchestration/references/orca-machine-setup.md` §3.1. A supervised worker's real mode comes from the orchestrator app's per-agent default arguments (the native launch takes no argv): this map declares what the conductor verifies at readiness. Read by path (`orchestration.permission_modes.<tier>`), never as a `{{VAR}}`, so it is listed in `external_consumers`. Why these defaults and the security tradeoff of `bypass`: ADR-0020. |
| `model_overrides` | *(none, read by path)* | List of `{topics: [...], tier: worker \| conductor \| subagent, model: <id>, effort: <level>}`, e.g. `{topics: [security, migration], tier: worker, model: <full id>, effort: max}`. The conductor matches a brief's topics against it when it picks a model; empty = the tier defaults. Read by path, never as a `{{VAR}}`, so it is listed in `external_consumers`. |
| `orchestrator_name` | `{{ORCHESTRATOR_NAME}}` | The orchestration application, as the operator names it. Prose only. |
| `orchestrator_cli` | `{{ORCHESTRATOR_CLI}}` | The binary on `PATH`. Empty = no orchestrator on this machine: every workflow skill falls back to the pasted-launch-line path and says NOTHING about it. |
| `message_verb` | `{{MESSAGE_VERB}}` | The command that carries **messages between sessions**. Byte-intact. |
| `terminal_verb` | `{{TERMINAL_VERB}}` | The command that **drives a terminal**: commands, CLI calls, harness slash-commands, keystrokes. Truncates a long payload silently and keeps only the TAIL. |
| `orchestrator_skills` | *(none, a list)* | Vendor skills the orchestrator installs at user level, loaded ALONGSIDE `/orca-orchestration`. Referenced by path (`orchestration.orchestrator_skills`), never as a `{{VAR}}`: a list is not a substitutable scalar, so it is listed in `external_consumers`. |

**`message_verb` and `terminal_verb` are NOT interchangeable, and that pair is the point.** The test: if a HUMAN would read it, it does not go through `terminal_verb`; if a shell or a TUI would EXECUTE it, that is what the verb is for. One structural exception: a supervised worker's FIRST prompt goes through `terminal_verb`, because the native launch has no argv; keep it short and pointing at a file. Full doctrine: `orca-orchestration/references/channel-discipline.md`.

**Three tiers, one profile.** A *conductor* is the session the human types into, or a middle conductor another session launched; a *worker* is a session a conductor launched; a *subagent* is a one-shot dispatch inside a turn. `default_model` / `default_effort` are the worker tier, `conductor_*` and `subagent_model` the other two, and `permission_modes` and `model_overrides` are keyed by the same tier names. Every value is a fallback: an explicit user instruction in the conductor session overrides it for that run. `default_model` keeps its name for compatibility, because `bun sync` only inserts keys and never renames one (an old key would be stranded downstream). A downstream project gets the new leaves through an interactive `bun sync`, which offers them and inserts them insert-only; with `--auto` they are listed, not inserted, because the `orchestration:` block already exists there. An existing value is never changed, so a project that had `default_model: ''` keeps it until someone sets it. Decision record: `.context/ADR/ADR-0020-agentic-work-profile-and-permission-posture.md`.

**Naming the orchestrator here is what lets a skill stop hardcoding it.** A project on a different orchestrator keeps the whole doctrine and swaps the values of the block.

**A missing block degrades, it does not break.** A project without `orchestration:` runs a fleet of one (the cap defaults to 1), on the harness defaults, and names no orchestrator; `/sprint-development` single-ticket mode never reads the block at all.

**An explicit user instruction in the conductor session always overrides these defaults for that run**: they are the fallback only when the user says nothing ("launch 3 workers" beats `max_workers` for that dispatch).

## `stack` (block inside `project.yaml`)

The application's **real stack, structured**, so a skill reads a value instead of hardcoding one: where the app lives, which package manager runs it, the NAMES of its scripts, where its schema comes from, how a schema change is applied, its UI kit, hosting, CI and test runner. The field list, each field's allowed values and which values the skills support in v1 live in one place, `STACK_FIELDS` and `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts`; the yaml's inline comments repeat the allowed values for the reader.

```yaml
stack:
  app_root: .                    # monorepo: apps/web
  package_manager: bun
  scripts:                       # script NAMES in the app's package.json; null = the app has none
    lint: lint:check
  database:
    schema_source: live          # live | migrations
    migrations_tool: supabase-mcp
```

**Defaults.** The block ships the GREENFIELD defaults, what `/project-bootstrap` scaffolds. They travel through `.agents/project.schema.yaml` as methodology (non-null leaves are kept, never blanked), so a new project is seeded with them. An existing application replaces them with what it actually runs.

**Who writes it.** `bun run agents:setup --stack` detects the stack from the repo (`package.json`, the lockfile, the migration directory, `tsconfig.json`, CI and hosting files) and proposes each field that differs, with the file it read it from; `--non-interactive` writes every detected value and leaves the rest alone. A field the repo says nothing about is never guessed. A project that lacks the block gets it inserted from the schema first, at the schema's position (`bun sync` offers the same insertion). `/project-bootstrap` runs it once the app exists.

**Who checks it.** `bun run setup:doctor` validates the block's shape and reports drift between what it declares and what the repo shows, in its own section; never a failure. Before the app exists it stays silent: the defaults are expected.

**How a skill reads it.** By path: `{{stack.package_manager}}`, `{{stack.scripts.lint}}`; `bun run vars:check` fails on a `{{stack.<path>}}` that is not a leaf of the block, and the leaves are never bare `{{VAR}}` names. An app command is `<package_manager> run <scripts.X>`; a null script means the app has none, so the step is skipped and said so, never invented. Tooling commands (`bun run agents:compat:check`, `bun run skills:check`, ...) are the boilerplate's own and do not go through the block.

## `testing.automation_identity` (block inside `project.yaml`)

Declares WHICH account browser and HTTP automation logs in as when validating a story against the running app (`/sprint-development` live-UI validation and Tier 0 probes). It holds **variable NAMES only** — values live in `.env`, which is gitignored; `project.yaml` is committed.

| Field | Type | Description |
|---|---|---|
| `email_var` | string\|null | Name of the env var holding the account email (e.g. `QA_E2E_USER_EMAIL`). The name is the project's choice. |
| `password_var` | string\|null | Name of the env var holding its password. |
| `scope` | enum\|null | `dedicated-non-production-account` (default, preferred) / `shared-demo-account` (only when the account's access is intentionally public). |
| `per_env` | map | Optional per-environment overrides, keyed by an `environments:` key. Empty when one identity serves every env. |

**Why it exists.** "Use credentials from `.env`" says where values live, not which identity is legitimate. Without a declared slot, an agent asked to validate a UI story will improvise — and the shortest path to a session is usually a privileged one (a service-role key, an admin user-management API, a generated login link), which means acting as, or against, a real account.

**Rules.** Fail-closed: slot unset, variable missing from `.env`, or `scope` unset → `/sprint-development` STOPS before any authenticated action and reports what to provision. Automation always authenticates through the app's OWN login path; privileged bypasses and impersonation are prohibited outright. Full contract, prohibition list, and dispatch requirements: `.agents/skills/sprint-development/references/live-ui-identity.md`.

**Detectability.** Register the chosen variable names in `cli/lib/variables-manifest.ts` so `bun run vars:env:check` and the doctor flag a missing identity before a sprint starts rather than mid-run. The boilerplate ships `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` as defaults; rename in both places if your project uses different names.

Like `git_strategy`, this block is read directly by skills and is **not** a `{{VAR}}` source — it is listed in `external_consumers` so `vars:check` skips it.

## Variable syntax conventions

Several syntaxes coexist across skills, commands, and docs. Each resolves from a different place:

| Syntax                         | Meaning                                                                                                                                                                                                                                                                                   | Resolves from                                                                                                                                                                            | Validated by                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{{VAR_NAME}}`                 | **Project variable** — static, per-repo value configured once. Two flavours: **flat** (top-level section, e.g. `{{PROJECT_KEY}}` → `project.project_key`) and **env-scoped** (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_PROJECT_REF}}`) which resolve to the active environment's value. | `.agents/project.yaml`. Flat keys are looked up lexically (`{{PROJECT_NAME}}` → `project.project_name`). Env-scoped keys resolve via the active env (see below).                         | `bun run vars:check` (key must exist either at top level or under at least one environment).                                                     |
| `{{environments.<env>.<var>}}` | **Explicit env-scoped reference** — bypasses active-env resolution and always points at a specific environment. Used in multi-env documents (e.g. a comparison table that shows local AND staging URLs side-by-side).                                                                     | `.agents/project.yaml` → `environments.<env>.<var>` directly.                                                                                                                            | `bun run vars:check` (env must be declared under `environments:` and var must exist under it).                                                   |
| `{{stack.<path>}}`             | **Stack descriptor reference** — a leaf of the `stack:` block (`{{stack.scripts.lint}}`), read by path. | `.agents/project.yaml` → `stack.<path>` directly. | `bun run vars:check` (the path must be a leaf of the block). |
| `<<VAR_NAME>>`                 | **Session variable** — computed at runtime by the calling prompt (e.g. `<<ISSUE_KEY>>` extracted from a git branch name) or used as a sentinel marker (`<<PLACEHOLDER>>`, `<<REDACTED>>`). Never persisted.                                                                               | The prompt's runtime context.                                                                                                                                                            | Linter only counts them — never declared.                                                                                                        |
| `{{jira.<slug>}}`              | **Jira custom field reference** — portable pointer to a Jira custom field.                                                                                                                                                                                                                | `.agents/jira-required.yaml` (canonical declaration of expected fields) AND `.agents/jira-fields.json` (workspace-resolved IDs). Skills and commands never hardcode `customfield_XXXXX`. | `bun run vars:check` (slug must be declared in the manifest) AND `bun run jira:check` (slug must resolve to a real field in `jira-fields.json`). |
| `{{jira.<slug>.<option>}}` | **Jira option-value reference** — portable pointer to a single option value of a select-type custom field. Use the two-segment form for plain `option` and `array`-of-option fields. For cascading-select (`option-with-child`) fields, use the three-segment form `{{jira.<slug>.<parent>.<child>}}` to reach a child option. | `.agents/jira-fields.json` → `<slug>.options.<option>` for plain options, or `<slug>.options.<parent>.children.<child>` for cascading. The slug must also be declared in `.agents/jira-required.yaml`. | `bun run vars:check` (slug must be declared in the manifest AND the option must exist in the catalog). |
| `{{jira.work_type.<slug>}}` | **Jira issue-type reference** — portable pointer to the literal issue-type name (e.g. `"Story"`, `"Bug"`, `"Epic"`). Use case: `acli workitem create --type "{{jira.work_type.story}}"`. Resolves to the `name` string in the catalog. | `.agents/jira-workflows.json` → `<slug>.jira_issue_type.name`. The `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types:`. | `bun run vars:check` (slug must be declared in the manifest AND the work-type must exist in the catalog). |
| `{{jira.status.<work_type>.<slug>}}` | **Jira status reference** — portable pointer to a workflow status's literal name (e.g. `"Ready For QA"`). Use case: `acli workitem update --status "{{jira.status.story.ready_for_qa}}"`. Optional sub-keys: `.id` (numeric status id) and `.category` (`new` / `indeterminate` / `done`); the default sub-key is `.name`. | `.agents/jira-workflows.json` → `<work_type>.statuses.<slug>` (default sub-key: `.name`). Both `<work_type>` and `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types.<work_type>.required_statuses`. | `bun run vars:check` (manifest declaration + catalog presence + valid sub-key). |
| `{{jira.transition.<work_type>.<slug>}}` | **Jira transition reference** — portable pointer to a workflow transition's `id` (e.g. `"41"`). The default sub-key is `.id` because it removes the ambiguous-transition gotcha — invoke transitions unambiguously via REST `POST /rest/api/3/issue/{key}/transitions` with `{"transition":{"id":"…"}}`. Optional sub-key: `.name` (transition literal name) for callers that prefer `acli`'s name-based interface. | `.agents/jira-workflows.json` → `<work_type>.transitions.<slug>` (default sub-key: `.id`). Both `<work_type>` and `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types.<work_type>.required_transitions`. | `bun run vars:check` (manifest declaration + catalog presence + valid sub-key). |

The `{{…}}` vs `<<…>>` distinction is intentional: it removes the ambiguity where both project data and ephemeral session data might share the same `{{VAR}}` syntax.

### Checkout roots: `<<REPO_ROOT>>` and `<<PRIMARY_ROOT>>`

Two session variables name a directory, and they differ the moment a session runs inside a linked git worktree (Orca, `claude --worktree`, the harness `EnterWorktree`, a Codex-managed worktree, a plain `git worktree add`):

| Variable | Resolves to | Use it for |
|---|---|---|
| `<<REPO_ROOT>>` | `git rev-parse --show-toplevel`: THIS checkout, the worktree when there is one | tracked files the session reads or edits: code, skills, docs, configs, migrations, the committed `.context/` docs (including `.context/reports/`) |
| `<<PRIMARY_ROOT>>` | `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"`: the primary checkout, the same value from the primary and from every worktree of it | durable GITIGNORED state: `.session/**` (plans, progress, locks, run reports, escalation logs), `.scratch/`, updater markers and backups |

In the primary checkout both resolve to the same path. In a worktree, anything written under `<<REPO_ROOT>>` that git ignores dies when the worktree is removed, so durable state is always written to and resumed from `<<PRIMARY_ROOT>>`, by absolute path. Never derive either root from `pwd`: inside a worktree `pwd` is the worktree.

Three commands carry the contract (code: `cli/lib/worktree.ts`):

- `bun run worktree:provision [<path>]`: wires a fresh worktree with the gitignored inputs it cannot rebuild (`.env`, `.vercel/`, local settings), then `bun install` and `bun run agents:compat`. Refuses to run on the primary. `orca.yaml` runs it as Orca's setup hook, `.codex/environments/environment.toml` as the Codex app's; Claude Code and the Codex app copy the same files through `.worktreeinclude`.
- `bun run worktree:audit [<path>]`: classifies what a worktree still holds that git does not (state / cache / disposable / unknown) before it is removed; exit 1 while state or unknown remains. `--rescue` copies the state class to the same path under `<<PRIMARY_ROOT>>`, never overwriting. `orca.yaml` runs it as Orca's archive hook.
- `bun sync` refuses to run in a linked worktree: its backups, markers and prompts are gitignored and would die with it.

### Active environment

`project.yaml` has a top-level `environments:` map (defaults: `local` + `staging`; you can add `production`, `qa`, `dev`, `uat`, etc.). Each environment declares the same three leaves: `web_url`, `api_url`, `db_project_ref`. Skills and commands don't hardcode "staging" or "local" anywhere — they reference the bare form (`{{WEB_URL}}` etc.) and the AI resolves it against the **active environment** for the current session:

1. If the user explicitly chose an env this session ("run regression against production"), use that.
2. Otherwise fall back to `testing.default_env` from `project.yaml`.

When a document genuinely needs to compare environments side-by-side (e.g. an environment-table that demonstrates URL-shape differences), use the explicit form `{{environments.local.web_url}}` / `{{environments.staging.web_url}}` instead. Both forms are validated by `bun run vars:check`.

## Workflows

### 5.1 New user setup

When you clone this boilerplate into a new project:

1. Copy `.env.example` to `.env` and fill in:
   - `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` — the automation identity (dedicated non-production account; see §"`testing.automation_identity`").
   - `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` (get a token at <https://id.atlassian.com/manage-profile/security/api-tokens>). The Atlassian **site URL** does not go here — see step 2.
2. Edit `.agents/project.yaml` by hand. Replace every `null` with the real value (the inline `# TODO:` comment shows the expected format). Make sure `testing.default_env` matches one of the keys under `environments:`. `issue_tracker.atlassian_url` is the **source of truth** for the Atlassian host — it is not in `.env` at all, because a stale copy there silently shadowed the real value and pointed `jira:sync-*` at a dead instance. Confirm it resolves with `bun run --silent jira:url`.
3. Run `bun run jira:sync-fields` to discover your Jira workspace's custom fields. Writes `.agents/jira-fields.json` (~100-150 fields typical). Resolves slug collisions deterministically — see `--allow-collisions` if you hit one.
4. Run `bun run jira:check` to validate your Jira against the methodology's required-fields **and** required-`work_types` manifest. Address any output:
   - **❌ MISSING** — for a custom field: create the field in Jira admin (Settings → Issues → Custom fields) with the suggested name, type, and options. Re-run `bun run jira:sync-fields --force` then `bun run jira:check`. For a `work_type` / status / transition: amend the workflow in Jira admin so it exposes the required status / transition, then re-run `bun run jira:sync-workflows --force` then `bun run jira:check`.
   - **⚠️ MISMATCHED** — rename, retype, or extend the field in Jira so it matches the manifest, OR (if the methodology can adapt) update `jira-required.yaml`.
   - **💡 INFO** — informational only; safe to ignore unless you want the optional or unmapped feature.
   - Iterate until all required fields and `work_types` are ✅ OK.
5. Run `bun run jira:sync-workflows` to discover your Jira workspace's workflow statuses + transitions for every `work_type` declared in `jira-required.yaml`. Writes `.agents/jira-workflows.json`. Interactive on first run (prompts when a canonical slug doesn't auto-resolve to a workflow's real status / transition); idempotent on subsequent runs unless you pass `--force`.
6. Run `bun run vars:check` — should report 0 errors. Confirms every `{{VAR}}`, `{{jira.<slug>}}`, `{{jira.<slug>.<option>}}`, `{{jira.work_type.*}}`, `{{jira.status.*}}` and `{{jira.transition.*}}` reference in skills/commands resolves against your config.

You're now ready to invoke any skill or command without setup friction.

### 5.2 Adding or updating a skill or command

When you add or edit a skill or command that references project values or Jira fields:

- **Project values** (paths, URLs, project keys, etc.) — use `{{VAR_NAME}}`. Add the variable to `.agents/project.yaml` with `null` plus a `# TODO:` comment so a new user knows what to fill in.

- **Session values** (computed at runtime) — use `<<VAR_NAME>>`. No declaration needed; it's a documentation marker for the consumer.

- **Jira custom fields** — use `{{jira.<slug>}}`. The slug **must** be declared in `.agents/jira-required.yaml` under `required:` or `optional:`. Workflow:
  1. Identify the slug your skill or command needs. It must match how `bun run jira:sync-fields` slugifies the Jira field name (lowercase, underscores, no emojis/accents).
  2. Add an entry to `jira-required.yaml`:
     - `name:` — human-readable name expected in the Jira admin UI.
     - `type:` — `string` / `option` / `number` / `date` / `array` / `user` / etc.
     - `options:` — only if `type: option`; list of option slugs the methodology depends on.
     - `description:` — 1-line explanation.
     - `used_by:` — list of skills/commands referencing this slug.
  3. Reference `{{jira.<slug>}}` in your skill or command markdown.
  4. Run `bun run vars:check` — must pass (proves the slug is declared).
  5. Run `bun run jira:check` against your own Jira. If your Jira is missing the field, create it in Jira admin and re-run `bun run jira:sync-fields --force`.

- **Jira option values** — when your skill or command needs to set a field VALUE (not just reference the field ID), use `{{jira.<slug>.<option>}}`. The option slug must be declared in the `options:` array of that field's entry in `jira-required.yaml`. If the field is `type: option-with-child`, the manifest can declare `options:` as either a flat `string[]` of parent slugs or a `Record<string, string[]>` mapping parent slugs to their declared children; consumers reach a child via the three-segment form `{{jira.<slug>.<parent>.<child>}}`. Example: a skill that sets `Severity 🚩` to "Critica" via `acli` should write `--field 'Severity 🚩={{jira.severity.critica}}'` (resolves to the workspace's option id, e.g. `--field 'Severity 🚩=10188'`). Both the slug declaration and the option presence in `.agents/jira-fields.json` are checked by `bun run vars:check`.

- **Jira issue types, statuses, transitions** — use `{{jira.work_type.<slug>}}`, `{{jira.status.<work_type>.<slug>}}`, and `{{jira.transition.<work_type>.<slug>}}` respectively. These resolve from `.agents/jira-workflows.json` (not `jira-fields.json`) and must be declared in `jira-required.yaml` under `work_types:` (`required_statuses` / `required_transitions`). See §5.4 for the full add workflow.

When deleting a skill/command or removing a `{{jira.<slug>}}` reference:

- If no other skill or command uses the slug, you may remove the entry from `jira-required.yaml`. Otherwise leave it — the slug is shared.
- The linter may then report `DECLARED_BUT_UNUSED` warnings; safe to ignore for transitional periods.

### 5.3 Adding a new required Jira custom field

When the methodology evolves and needs a brand-new custom field that doesn't exist anywhere yet:

1. Decide the canonical slug (lowercase, underscores, descriptive).
2. Add an entry to `jira-required.yaml` under `required:` (or `unmapped:` if it can't yet be mapped — see the unmapped pattern below).
3. Update relevant skills and commands to reference `{{jira.<slug>}}`.
4. Update this README's troubleshooting section if behavior is non-trivial.
5. Communicate to all boilerplate users (release notes / changelog) that they must create the field in their Jira and rerun `bun run jira:sync-fields --force`.

**The "unmapped" pattern.** When a field is required semantically but no Jira field exists yet, put the slug under `unmapped:` with a `description:` and `used_by:`. Skills and commands then reference it as a literal marker (e.g. `customfield_<slug>`) with HTML-comment TODOs pointing at the manifest. Once a real field is created, move the entry from `unmapped:` to `required:` (with full metadata: `name`, `type`, `options`, …) and replace the literal markers with `{{jira.<slug>}}` syntax.

### 5.4 Adding a new required Jira `work_type` / status / transition

When the methodology evolves and needs a brand-new canonical status or transition (or a new `work_type` altogether) on top of the existing ones (`story`, `bug`, `epic`, `defect`, `tech_story`, `improvement`, `test_case`):

1. Decide the canonical slug (lowercase, underscores, descriptive — e.g. `ready_for_qa`, `in_review`, `deployed_to_production`). Slugs are **agnostic** — they describe the methodology, not your Jira's literal status names.
2. Add an entry to `jira-required.yaml` under `work_types.<work_type>.required_statuses.<slug>` (or `…required_transitions.<slug>`) with a 1-line `description:`. For transitions, also declare `from:` and `to:` (use the canonical status slugs, NOT literal Jira names; if it's a global transition, use `from: any`). For a brand-new `work_type`, mirror the shape of the existing `story` / `bug` / `epic` entries (`jira_issue_type`, `description`, `required_statuses`, `required_transitions`, `used_by`).
3. Reference `{{jira.status.<work_type>.<slug>}}` (or `{{jira.transition.<work_type>.<slug>}}` / `{{jira.work_type.<slug>}}`) in your skill or command markdown.
4. Run `bun run vars:check` — must pass (proves the slug is declared in the manifest).
5. Run `bun run jira:sync-workflows --force` to remap the catalog. The script auto-resolves slugs that match the workspace's actual status / transition names; if the new canonical slug doesn't auto-resolve, the script prompts interactively to map it to one of the workflow's real statuses / transitions.
6. Run `bun run jira:check` — must pass (proves the catalog now contains the resolved value for the new slug).
7. Communicate to all boilerplate users (release notes / changelog) that they must re-run `bun run jira:sync-workflows --force` after pulling the change, then `bun run jira:check` to verify their Jira workflow exposes the required status / transition (and amend their workflow in Jira admin if it doesn't).

**Resolution rule (statuses / transitions / work types).** The manifest (`jira-required.yaml` → `work_types:`) DECLARES what the methodology needs; the sync (`bun run jira:sync-workflows`) GENERATES the resolved catalog (`jira-workflows.json`) by mapping each declared slug to your workspace's real status / transition / issue-type metadata. `bun run vars:check` HARD-FAILS on any `{{jira.status.*}}` / `{{jira.transition.*}}` / `{{jira.work_type.*}}` reference whose slug is undeclared or absent from the catalog — re-run `bun run jira:sync-workflows --force` to repopulate it.

## Commands reference

| Command                    | Purpose                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run jira:sync-fields` | Discover Jira custom fields → write `jira-fields.json`. Flags: `--force` (overwrite), `--allow-collisions` (suffix slug duplicates), `--dry-run`, `--verbose`, `--json`.                                     |
| `bun run jira:sync-workflows` | Discover Jira workflows (statuses + transitions per `work_type`) → write `jira-workflows.json`. Interactive on first run for slugs that don't auto-resolve. Flags: `--force` (re-prompt for already-mapped slugs), `--allow-collisions`, `--dry-run`, `--verbose`, `--json`, `--help`. |
| `bun run jira:sync-link-types` | Discover Jira issue link types → write `jira-link-types.json`.                                                                                                                       |
| `bun run jira:check`       | Compare `jira-required.yaml` vs `jira-fields.json` (custom fields) AND vs `jira-workflows.json` (work types, statuses, transitions) → setup report. Flags: `--json` (machine-readable), `--verbose` (include OK rows), `--help`. Exits 1 if any required field, `work_type`, status or transition is missing or mismatched. |
| `bun run vars:check`       | Validate every `{{VAR}}`, `{{jira.<slug>}}`, `{{jira.<slug>.<option>}}`, `{{jira.work_type.*}}`, `{{jira.status.*}}` and `{{jira.transition.*}}` reference across `.agents/skills/`, `.context/`, `AGENTS.md`.                        Exits 1 if any are undeclared.                                      |

## Troubleshooting

- **`vars:check` reports `UNDECLARED: {{jira.foo}}`** — the slug is referenced in a skill or command but not declared in `jira-required.yaml`. Add the entry under `required:` or `optional:` (see workflow §5.2).
- **`jira:check` reports `❌ MISSING: bar`** — the manifest declares `bar` as required, but your Jira has no field that slugifies to `bar`. Create the field in Jira admin with the suggested name/type/options, then re-run `bun run jira:sync-fields --force` and `bun run jira:check`.
- **`jira:check` reports `⚠️ MISMATCHED`** — a field exists but its type or option list disagrees with the manifest. Either fix it in Jira (rename, change type, add options) or update `jira-required.yaml` if the methodology can accept the variant.
- **`jira:sync-fields` aborts with exit 2 (slug collisions)** — two Jira custom fields slugify to the same key. Rename the duplicate in Jira admin, or pass `--allow-collisions` to suffix them with `_2`, `_3`, …. Plugin-managed (system) collisions are auto-suffixed silently — see the script's `--verbose` flag.
- **Which variable syntax should I use?** — see §"Variable syntax conventions". Short version: bare `{{VAR}}` is project-scoped (declared in `project.yaml`; env-scoped vars resolve to the active env); `{{environments.<env>.<var>}}` pins to a specific env (multi-env docs only); `<<VAR>>` is session-scoped (computed at runtime); `{{jira.<slug>}}` (and `{{jira.<slug>.<option>}}`) is Jira-field-scoped (declared in `jira-required.yaml`, resolved via `jira-fields.json`); `{{jira.work_type.*}}` / `{{jira.status.*}}` / `{{jira.transition.*}}` are Jira-workflow-scoped (declared under `jira-required.yaml` → `work_types:`, resolved via `jira-workflows.json`).

### `external_consumers` — silencing structurally-invisible variables

Some declared variables are consumed OUTSIDE the `{{TEMPLATE}}` system — for example:

- `default_env` is read implicitly by the AI variable resolver (it sets the active environment) AND by `scripts/agents-setup.ts` via `process.env.DEFAULT_ENV` in `--non-interactive` mode.
- `design_md_path` is read by `yq` inside bash code fences in skill reference files (the linter does not parse bash, so it cannot see the read).

These produce false-positive `DECLARED_BUT_UNUSED` warnings. To silence them, add the variable name under the top-level `external_consumers:` list in `.agents/project.yaml`. Each entry MUST include an inline `# ...` comment explaining where the variable is consumed:

```yaml
external_consumers:
  - default_env # consumed by the AI resolver + scripts/agents-setup.ts (process.env.DEFAULT_ENV)
  - design_md_path # read by yq ('.frontend.design_md_path') in .agents/skills/design-system/references/getdesign-matcher.md
```

If you forget the comment, `vars:check` fails with `EXTERNAL_CONSUMER_UNDOCUMENTED` to prevent the allowlist from rotting silently.

### For AI agents

When invoked in this repository, treat this README as a contract:

- To resolve `{{VAR_NAME}}`, read `.agents/project.yaml`. For env-scoped vars (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_PROJECT_REF}}`), use the active environment for the session — the user's explicit choice if they made one, otherwise `testing.default_env`.
- To resolve `{{environments.<env>.<var>}}`, read the named environment directly from `.agents/project.yaml`, regardless of active env.
- To resolve `<<VAR_NAME>>`, the source is the calling prompt's runtime context.
- To resolve `{{jira.<slug>}}` (or `{{jira.<slug>.<option>}}` / `…<parent>.<child>`), read `.agents/jira-required.yaml` (canonical declaration) AND `.agents/jira-fields.json` (workspace-resolved IDs / option ids).
- To resolve `{{jira.work_type.<slug>}}`, `{{jira.status.<work_type>.<slug>[.id|.category]}}`, or `{{jira.transition.<work_type>.<slug>[.name]}}`, read `.agents/jira-required.yaml` `work_types:` (canonical declaration) AND `.agents/jira-workflows.json` (workspace-resolved status / transition / issue-type metadata).
- To validate any change touching skills or commands, run `bun run vars:check` and treat ERROR entries as blocking.
- When asked to add a new skill or command or modify an existing one, follow the workflow in §5.2 — add manifest entries before referencing slugs.
