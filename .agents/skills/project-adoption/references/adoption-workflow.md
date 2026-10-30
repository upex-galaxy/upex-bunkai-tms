# Adoption workflow: Phases 0-9

> Owner: `project-adoption`, mode `adopt` (mode `check` runs Phase 0 only). Loaded by the orchestrator at entry; each subagent is briefed with the phase section it executes plus §Refusal list.
> Shape adapted from the agentic-qa adaptation workflow (no-write box, plan file, approval, write box, signals as work list and report). The topology differs: here the agentic layer lives INSIDE the app's tree, so "the target repo is read-only" becomes §Refusal list, a denylist of app paths plus an allowlist of agentic surfaces in one tree.

---

## Refusal list (binding on every write and every briefing)

The mutation phases NEVER:

- write or delete a file under `stack.app_root` that existed before adoption (the app's source, `public/`, `supabase/`, its own `scripts/` and `docs/`);
- run a migration, apply SQL, change RLS, seed data, or open a database connection in any environment. The adoption itself never touches a database: discovery reads migration files when the app keeps them, and the live schema is read later by `/project-context data` under the delivery doctrine;
- add, remove, upgrade or downgrade an app dependency, switch the package manager, or regenerate the lockfile beyond what the adoption install already recorded;
- edit or replace CI workflows, `README.md`, `tsconfig.json`, an eslint or prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts`, or a script in the app's `package.json` (a colliding `prepare` / `test` stays the app's; the plan lists it as a team decision with the updater's composition proposal);
- change git history, remotes, branch protection or rulesets (Strategy Setup is its own confirmed session);
- create Jira projects, fields, workflows or issues;
- push;
- write a secret value anywhere (`.env` included: the human types secrets, the plan lists the missing NAMES), open `.env*` (except `.env.example`) or `.auth/**`, or echo a value into the plan, a report or a commit (Critical Rule #1, `agentic-dev-core/references/secret-hygiene.md`).

The ALLOWLIST (what a write phase may touch, each only when its plan row is approved): `.agents/project.yaml`; `.env` for NON-sensitive values only (a URL, a project key, a flag, a port) through `bun run env:set KEY=value`, never a secret; `.agents/jira-*.json` catalogs; a framework skill folder `.agents/skills/<name>/` the app had copied in by hand, replaced ONLY by upstream's copy the adoption saved under `.agents/prompts/adopt-upstream/<name>/` (the app's copy backed up under `.backups/project-adoption/` first); `api/openapi.json` + `api/openapi-types.ts` when both were absent before adoption; `AGENTS.md` + `CLAUDE.md` through the updater's saved merge only (backups under `.backups/project-adoption/`, the saved `.agents/prompts/adopt-instructions.md` removed once applied); the app's `<app>-context` skill the adoption wrote (`.agents/skills/<app>-context/`): its `SKILL.md` `description` only, never the preserved text in `references/app-instructions.md`, plus the one-time move of a legacy `## 0. Project instructions (pre-adoption)` block into it (Phase 6); the pointer section of `.agents/instructions/agent-project.md` that names that skill; the plaintext MCP credential copies `bun run harness:env` retires (an app machine that ran the old generator: deleted, or moved to `.auth/harness-env-backup/` and named); `.context/reports/project-adoption-plan.md`; `.session/project-adoption/`.

---

## Detection signals (Phase 0 work list, Phase 9 report)

Each row is a command or read plus a pass condition. `ADOPTED` when the condition holds, else `PENDING`. A row a project cannot satisfy by design (no tracker, no app tests) is `ADOPTED (gap)` once the plan records the gap.

| Subsystem | Signal | ADOPTED when |
|---|---|---|
| install | `.template/installer.lock.json` | `adopted: true` (else the entry gate STOPS) |
| instructions | `CLAUDE.md`, `AGENTS.md`, `.agents/skills/*-context/references/app-instructions.md` | `CLAUDE.md` byte-equal to the `@AGENTS.md` shim; `.agents/prompts/adopt-instructions.md` absent or already applied; `AGENTS.md` carries no `## 0. Project instructions (pre-adoption)` block (the legacy layout); the app's text, when it had any, sits in its `<app>-context` skill with one router row in `AGENTS.md` pointing at it |
| protected paths | every app-owned collision of the adoption run (the `merge` rows of `.agents/prompts/parity-plan.md`, or the paths whose content differs from upstream) | listed in `updater.protected_paths` of `.agents/project.yaml` |
| framework skills | `.agents/prompts/adopt-upstream/` (upstream's copy of each framework skill the app had copied in by hand, saved by the adoption install) | absent or empty: each one was taken or the plan records the team kept its copy |
| identity | `grep -n 'null # TODO' .agents/project.yaml` restricted to `project`, `backend`, `frontend`, `database`, `issue_tracker`, `testing.default_env` and the `environments` the project runs | no line left (team-owed blocks are NOT in this row, see §Team-owed prerequisites) |
| stack | `readStack` over `.agents/project.yaml` (`bun run setup:doctor --json`, key `stack`) | block present, no validation issue, no v1 issue, no drift against the repo |
| harness | `bun run agents:compat:check` | exit 0 |
| env | `bun run vars:env:check` and `bun run harness:env:check` | both exit 0 |
| tracker | `bun run jira:check` | exit 0, or the plan records a no-tracker gap |
| tooling | `bun run tooling:types:check` and `bun run tooling:lint:check` (the tooling's own scope: `tsconfig.tooling.json`, `eslint.config.tooling.mjs`) | exit 0 |
| tooling isolation | `bun run setup:doctor` section "Tooling isolation (adopted app)" (rows of `.agents/prompts/adopt-tooling-isolation.md`: the app's `tsconfig.json` / ESLint config still reaching `cli/` + `scripts/`, a foreign hook manager not calling `.husky/framework-gates.sh`) | section absent; otherwise every line is a team decision in the plan, applied by hand, never by this skill |
| app intact | the app's `build` / `lint` / `types` / `test` (names from `stack.scripts`) | exit codes equal to the Phase 1 baseline |
| maps | `bun run context:map <slug> --list` for each map skill in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) | informational here: the maps are `/project-context`'s, reported as the first hand-off when placeholders |
| git | `git_strategy.meta.strategy_source` | informational: `inherited` points at `/git-flow-master` Strategy Setup in the hand-off |

### Team-owed prerequisites (reported, never created)

Fail-closed blocks a live app may not have: `testing.automation_identity` (a dedicated non-production account for automation), `autonomous_delivery.automation_gh_account`, a dedicated database role for read-only checks. Their `null # TODO` lines stay. The plan lists each with the skill that needs it and what the team must provide.

---

## Phase 0: resume check + entry gate + signals (no writes)

Owned by `SKILL.md` §Phase 0. Output: the `PENDING` / `ADOPTED` table, which becomes the plan's §Baseline snapshot. A plan from an earlier run is read from `.context/reports/project-adoption-plan.md`:

| Plan `Status:` | Action |
|---|---|
| absent | fresh run, continue to Phase 1 |
| `PENDING APPROVAL` | show it, ask for approval or changes; re-enter Phase 1 only for what the user changes |
| `APPROVED` | resume at the first phase whose rows are still `PENDING` |
| `COMPLETED` | signals decide: all `ADOPTED` = nothing to do; some `PENDING` = a drift run, append a new dated section to the plan, never rewrite the closed one |

---

## Phase 1: analysis (no writes)

### 1.1 Stack fingerprint

Run `bun run agents:setup --stack --dry-run --non-interactive`. It calls `detectStack` (`cli/lib/stack-descriptor.ts`): each proposed value carries the file it was read from; an undetected field is absent, never guessed. Complete it by reading, never by writing:

- `stack.app_root`: the folder whose `package.json` declares `next`. More than one candidate (`apps/*`, `packages/*`) = ask which app this adoption covers (OD6).
- Package manager: the lockfile. Not `bun` = STOP (OD3), quoting the lockfile found.
- Scripts: the app's `package.json` script NAMES for dev, build, lint, types, test, db types. A role with no script is `null`.
- Database: `engine` / `provider` from dependencies and config (`@supabase/*`, `supabase/config.toml`, `prisma/schema.prisma`, `drizzle.config.*`); `migrations_dir` from the folder that holds migration files; `migrations_tool` from how the team applies them (CLI files in the repo, Prisma, Drizzle, or the DB MCP when no migration files exist); `schema_source` = `migrations` when the repo holds the migration history, else `live`; `types_path` from the generated types file when present.
- UI, hosting, CI, test runner, import alias: the files `detectStack` cites (Tailwind config or `@import "tailwindcss"`, `components.json`, `vercel.json` / `.vercel/`, `.github/workflows/`, the test runner's config).

### 1.2 v1 gate

`unsupportedInV1` over the proposed values (`V1_SUPPORTED`, same file). Any issue = STOP the run here with the field, the value, the evidence path and the owner decision behind the limit (OD2 stack family, OD3 bun). Nothing is written, not even the plan.

### 1.3 Repo conventions

Read, never edit:

- Adoption parity: `.agents/prompts/parity-plan.md` (rows the adoption run left: app-owned collisions, script collisions with their composition proposal, the instruction merge). Missing file = take the collisions from `git diff` of the adoption commit.
- Instructions: whether `.agents/prompts/adopt-instructions.md` exists, whether `CLAUDE.md` is already the shim, which `<app>-context` skill holds the app's own text (the adoption run names it in its instructions row), and whether `AGENTS.md` still carries the legacy `## 0. Project instructions (pre-adoption)` block of an app adopted before that skill existed.
- Hooks: `.husky/`, `lefthook.yml`, `simple-git-hooks` in `package.json`, `.pre-commit-config.yaml`, husky v4 config, `git config --local core.hooksPath` (detector: `detectHookManager` in `cli/lib/hook-manager.ts`). A foreign manager is never replaced: the adoption run installed no husky over it, and the wiring snippet that makes it call the framework gates sits in `.agents/prompts/adopt-tooling-isolation.md` as a team decision.
- Tooling isolation: `.agents/prompts/adopt-tooling-isolation.md` (the exact `exclude` / ignore lines for the app's own `tsconfig.json` and ESLint config). A stock Next.js tsconfig type-checks `cli/` and `scripts/` and fails on Bun-only syntax, so the app's own `tsc` / `next build` stay red until the team applies them.
- Env files: `.env`, `.env.local`, `.env.example` (the sentinel block the adoption appended). Variable NAMES only; never print a value.
- CI: the workflow files and which scripts they call (the tooling must not change what CI runs).
- Branches: `git branch -a` and the default branch (input for the Strategy Setup hand-off, never acted on).

### 1.4 Issue tracker reachability

Load `/acli`. With `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` in `.env` and a candidate host, check auth status and that the candidate project key exists (read-only). No tracker, or the team declines = a recorded gap; missing credentials = Critical Rule #9 STOP only if the user wants the tracker wired in this run.

### 1.5 Baseline

Run the app's own scripts from `stack.app_root` with the app's package manager: `build`, `lint`, `types`, and `test` only when 1.6 confirmed the test suite reaches no shared database and no paid API. Record each exit code, duration and the first error lines. Build output lands in the app's gitignored folders; if `git status --porcelain` changes after a script, that script writes tracked files: record it, revert nothing yourself (Critical Rule #13), and ask.

### 1.6 Questionnaire (one batch, only what the files cannot answer)

- Project identity: `project_name`, `project_key`, `webapp_domain`.
- Environments the app runs (local / staging / production / others) with `web_url`, `api_url`, `db_project_ref` per env; which one is `testing.default_env`.
- Tracker: Jira or none; host for `issue_tracker.atlassian_url`; project key.
- Database: which `migrations_tool` the team really uses when both files and MCP history exist; whether `test` is safe to run for the baseline.
- Monorepo: which app, when 1.1 found several.
- API contract: whether the app serves or commits an OpenAPI spec, and where.
- Script collisions from 1.3: the team keeps its own (default) or adopts the composition later by hand.

Unanswered items become Discovery Gaps.

---

## Phase 2: the plan (no writes except the plan file)

Write `.context/reports/project-adoption-plan.md` from `references/plan-template.md`, header `Status: PENDING APPROVAL`. Then verify the seal: `git status --porcelain` differs from Phase 0 only by that file. Close with:

> WAIT for explicit approval of the plan before Phase 3. Nothing has been written yet.

On approval set `Status: APPROVED`, record who approved and the date in the header, and start Phase 3. A requested change edits the plan and asks again.

---

## Phase 3: identity + stack + environments + protected paths (writes)

Re-read the approved plan first. Each step writes only its approved rows.

1. **Stack.** `bun run agents:setup --stack`: one prompt per field whose detected value differs from the yaml; answer with the approved plan values. It inserts a missing block at the schema's position and re-reads it (`writeStack`), then fills the identity leaves that restate the stack (`backend_stack`, `frontend_stack`, `db_type`, `backend_entry`, `frontend_entry`) where they are still null, from the written block and the router directories on disk (`writeDerivedIdentity`); a leaf the plan already filled is never overwritten.
2. **Identity + environments.** `bun run agents:setup` for the identity and environment leaves in the plan (interactive; `--non-interactive` reads the env mapping in its header). Environments the project does not run are removed from the yaml only when the plan says so.
3. **Framework skills.** For each skill saved under `.agents/prompts/adopt-upstream/<name>/` whose `take upstream` row carries its OWN approval line in the plan (the row's detail lists the files that differ and the ones only the app's copy has: an app-specific edit there is the reason to keep it): copy `.agents/skills/<name>/` to `.backups/project-adoption/<date>/skills/<name>/`, replace the folder with the saved copy, verify with `diff -r .agents/prompts/adopt-upstream/<name> .agents/skills/<name>` (no output), then delete the saved copy. A skill the team keeps: add its folder's files to `updater.protected_paths` (next step) and delete the saved copy; the plan records the decision. Then `bun run skills:registry`.
4. **Protected paths.** Add every app-owned collision not yet listed to `updater.protected_paths` in `.agents/project.yaml` (block style, one path per line, a splice that keeps the rest of the file byte-identical: never `parseDocument(...).toString()` on a file under `.agents/`).
5. **Verify at the destination:** re-read the yaml; `bun run setup:doctor --json` `stack` shows no issue; `bun run vars:check` exits 0.

## Phase 4: credential slots (writes `.env` only)

1. `.env` absent -> copy `.env.example`. Never overwrite an existing `.env`; an app that keeps `.env.local` keeps it, and the plan says which file the tooling reads.
2. Fill only values the user supplies in this run (tracker credentials, DB MCP token when the team wants the later map session to read the live schema). Never echo a value back.
3. Tell the user to restart the agent session before any MCP-backed hand-off: each MCP server reads `.env` through the `.env` loader when it spawns, so nothing is derived or copied.
4. Verify: `bun run vars:env:check` and `bun run harness:env:check` exit 0.

## Phase 5: issue-tracker catalogs (writes `.agents/jira-*.json` only)

Skip with a recorded gap when the plan says no tracker.

1. Load `/acli`. `bun run jira:sync-fields`, `bun run jira:sync-workflows`, `bun run jira:sync-link-types` against the app's own instance (host from `issue_tracker.atlassian_url`, the only local copy). Never the UPEX reference flag on a foreign instance. A workflow sync without Administer permission skips itself with a marker: record it, it is not an error.
2. `bun run jira:check`. A missing required field is never created here: the plan names the field, the fallback (`.agents/jira-required.yaml` -> `fallback:`, a structured comment) and that creating fields is a Jira admin's decision.
3. Do NOT hydrate the whole project (`context:hydrate`) as part of adoption: the PBI cache is filled per story by `/sprint-development`.

## Phase 6: the app's instructions + harness compat

The app's own instruction text never loads at session start: `--adopt` moved it, verbatim, to the project-local skill `.agents/skills/<app>-context/` (`references/app-instructions.md`, the slug from the app's `package.json` name), added a pointer to `.agents/instructions/agent-project.md`, and composed an `AGENTS.md` that is upstream's plus ONE router row to that skill, without upstream's router lock line (the table it fingerprints is no longer upstream's, and the ADR it names never travels; ADR-0014). That row is the skill's registration: `AGENTS.md` is a protected path `bun sync` never overwrites, and `bun run docs:check` (`roster`) counts a skill an `AGENTS.md` row loads, so the `<app>-context` needs no row in the shared `agent-skills-and-mcps.md`. Any further skill the project creates for itself registers in the "Project context skills" table of `agent-project.md` (`/project-context context-skill`). Each step below runs only on its OWN approval line in the plan.

1. **Pending merge** (only when `.agents/prompts/adopt-instructions.md` exists). Show the saved file's router row and the head of `references/app-instructions.md`. Copy the current `AGENTS.md` and `CLAUDE.md` to `.backups/project-adoption/<date>/` first. Write the saved file to `AGENTS.md` byte for byte; write `CLAUDE.md` as the shim. Delete the saved file only after the write verified (re-read, byte-compare).
2. **Legacy layout** (only when `AGENTS.md` carries `## 0. Project instructions (pre-adoption)`: an app adopted before the skill existed). Back up `AGENTS.md`, move the block's text between that heading and the closing `---` verbatim into `.agents/skills/<app>-context/references/app-instructions.md` (same shape `cli/lib/adopt-app-context.ts` writes: one `## From` heading per original file), write its `SKILL.md`, replace the block in `AGENTS.md` with the router row, add the `agent-project.md` pointer. Prove nothing was lost before deleting the block: every original line and heading is in the reference, byte for byte.
3. **Description.** The skill's `description` the CLI wrote is mechanical (the app's name, its `package.json` description, its own section titles). Rewrite that ONE field from the Phase 1 analysis so it routes by the app's real domain (entities, flows, the words its team uses), under 1024 characters. Never touch the preserved text: it is the app team's, and the anti-pattern A5 binds.
4. `bun run agents:compat` then `bun run agents:compat:check` exits 0; `bun run instructions:check` passes (the router row resolves, `AGENTS.md` stays under its budget with the row). Every write to `agent-project.md` here follows `agentic-dev-core/references/instructions-doctrine.md` §4.

Without the merge row approved the instruction signal stays `PENDING` and the plan says so: a plain `bun sync` refuses at its cross-harness preflight until the merge is applied.

## Phase 7: API contract (writes `api/openapi*` only when absent before adoption)

Only when the app serves or commits a spec AND neither `api/openapi.json` nor `api/openapi-types.ts` existed before adoption: `bun run api:sync --url <spec URL>` or `--file <path>`. Otherwise record the spec location as an input for `/project-context api` and skip.

## Phase 8: verification (fail-fast, in this order)

```
1. bun run agents:compat:check
2. bun run vars:check
3. bun run vars:env:check
4. bun run harness:env:check
5. bun run jira:check                 # skipped with the recorded no-tracker gap
6. bun run setup:doctor               # stack section: no issue, no drift
7. bun run tooling:types:check        # the tooling's own scope, never the app's tsconfig
8. bun run tooling:lint:check
9. the app's build / lint / types / test from stack.app_root   # exit codes == Phase 1 baseline
```

Stop at the first failure, report it with its output, propose the fix, and wait: never auto-fix without approval. A step 9 difference is the most important failure this skill can report: name the script, both exit codes and the first new error.

## Phase 9: close

1. Re-run §Detection signals; print the final table (this is also the report a rerun shows).
2. Mark the plan `Status: COMPLETED` and append the results block (`references/plan-template.md` §Results).
3. Hand-off block from `SKILL.md` §Hand-offs, in order, each with the trigger the user types; offer `/git-flow-master` to propose the commit of the writes. Never start a hand-off by yourself.
4. Session footer per `agentic-dev-core/references/session-footer-contract.md` (dev surfaces touched: none in the app; name the agentic files written).

---

## Gotchas

| # | Gotcha | Symptom | Fix |
|---|---|---|---|
| 1 | An app script named like a tooling script (`test`, `lint:fix`) | `bun run test` runs the app's suite, not the tooling's | report the collision; the tooling gate runs through its own script names in the plan |
| 2 | Adoption install not committed | entry gate refuses on a dirty tree | commit the install through `/git-flow-master`, then rerun |
| 3 | `.env` value changed mid-run | MCP still uses the old value | restart the session (OpenCode: `opencode service restart` too) |
| 4 | App keeps `.env.local`, tooling reads `.env` | `vars:env:check` passes, app secrets unseen | expected: tooling and app read different files; the plan says so |
| 5 | Several Next.js apps in `apps/*` | `detectStack` picks the first | ask in 1.6, set `stack.app_root` explicitly |
| 6 | Instruction merge left pending with `--auto` | plain `bun sync` refuses at preflight | Phase 6 with its own approval line |
