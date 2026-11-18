# Adoption workflow: Phases 0-9

> Owner: `project-adoption`, mode `adopt` (mode `check` runs Phase 0 only). The orchestrator loads this file at entry, and each subagent gets the phase section it executes plus §Refusal list. The agentic layer lives inside the app's tree, so §Refusal list is a denylist of app paths plus an allowlist of agentic surfaces.
> Every wait for a person here has its supervised-worker and routine path in the `SKILL.md` section "With nobody at the keyboard".

---

## Refusal list (binding on every write and every briefing)

The mutation phases never do any of these:

- write or delete a file under `stack.app_root` that existed before adoption (the app's source, `public/`, `supabase/`, its own `scripts/` and `docs/`);
- run a migration, apply SQL, change RLS, seed data, or open a database connection in any environment. Discovery reads migration files when the app keeps them, and `/project-context data` reads the live schema later under the delivery doctrine;
- add, remove, upgrade or downgrade an app dependency, switch the package manager, or regenerate the lockfile beyond what the adoption install already recorded;
- edit or replace CI workflows, `README.md`, `tsconfig.json`, an eslint or prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts`, or a script in the app's `package.json` (a colliding `prepare` or `test` stays the app's, and the plan lists it as a team decision with the updater's composition proposal);
- change git history, remotes, branch protection or rulesets (Strategy Setup is its own confirmed session);
- create Jira projects, fields, workflows or issues;
- push;
- write a secret value anywhere (`.env` included: the human types secrets, and the plan lists the missing names), open `.env*` (except `.env.example`) or `.auth/**`, or echo a value into the plan, a report or a commit (Critical Rule #1, `agentic-dev-core/references/secret-hygiene.md`).

The allowlist is what a write phase may touch, each item only when its plan row is approved:

- `.agents/project.yaml`;
- `.env`, for non-sensitive values only (a URL, a project key, a flag, a port), through `bun run env:set KEY=value`;
- `.agents/jira-*.json` catalogs;
- a framework skill folder `.agents/skills/<name>/` the app had copied in by hand, replaced only by upstream's copy the adoption saved under `.agents/prompts/adopt-upstream/<name>/` (the app's copy is backed up under `.backups/project-adoption/` first);
- `api/openapi.json` and `api/openapi-types.ts` when both were absent before adoption;
- `AGENTS.md` and `CLAUDE.md`, through the updater's saved merge only (backups under `.backups/project-adoption/`, and the saved `.agents/prompts/adopt-instructions.md` removed once applied);
- the app's `<app>-context` skill (`.agents/skills/<app>-context/`): its `SKILL.md` `description` only, never the preserved text in `references/app-instructions.md`, plus the one-time move of a legacy `## 0. Project instructions (pre-adoption)` block into it (Phase 6);
- the pointer section of `.agents/instructions/agent-project.md` that names that skill;
- the plaintext MCP credential copies `bun run harness:env` retires (delete them, or move them to `.auth/harness-env-backup/` and name them);
- `.context/reports/project-adoption-plan.md`, and `.context/reports/project-adoption-architecture.md` when the Phase 9 scan runs;
- `.session/project-adoption/`.

---

## Detection signals (Phase 0 work list, Phase 9 report)

Each row is a command or a read plus a pass condition. A row is `ADOPTED` when the condition holds and `PENDING` otherwise. A row a project cannot satisfy by design (no tracker, no app tests) is `ADOPTED (gap)` once the plan records the gap.

| Subsystem | Signal | ADOPTED when |
|---|---|---|
| install | `.template/installer.lock.json` | `adopted: true` (else the entry gate STOPS) |
| instructions | `CLAUDE.md`, `AGENTS.md`, `.agents/skills/*-context/references/app-instructions.md` | `CLAUDE.md` byte-equal to the `@AGENTS.md` shim; `.agents/prompts/adopt-instructions.md` absent or already applied; `AGENTS.md` carries no `## 0. Project instructions (pre-adoption)` block (the legacy layout); the app's text, when it had any, sits in its `<app>-context` skill with one router row in `AGENTS.md` pointing at it |
| protected paths | every app-owned collision of the adoption run (the `merge` rows of `.agents/prompts/parity-plan.md`, or the paths whose content differs from upstream) | listed in `updater.protected_paths` of `.agents/project.yaml` |
| framework skills | `.agents/prompts/adopt-upstream/` (upstream's copy of each framework skill the app copied in by hand) | absent or empty: each was taken, or the plan records that the team kept its copy |
| identity | the leaves `.agents/project.schema.yaml` marks `null # TODO` in `project`, `backend`, `frontend`, `database`, `issue_tracker`, `testing.default_env` and the `environments` the project runs, read in `.agents/project.yaml` (values only since ADR-0021, so the TODO markers live in the schema) | every one holds a value (team-owed blocks are not in this row, see §Team-owed prerequisites) |
| stack | `readStack` over `.agents/project.yaml` (`bun run setup:doctor --json`, key `stack`) | block present, no validation issue, no v1 issue, no drift against the repo |
| harness | `bun run agents:compat:check` | exit 0 |
| env | `bun run vars:env:check` and `bun run harness:env:check` | both exit 0 |
| tracker | `bun run jira:check` | exit 0, or the plan records a no-tracker gap |
| tooling | `bun run tooling:types:check` and `bun run tooling:lint:check` (the tooling's own scope: `tsconfig.tooling.json`, `eslint.config.tooling.mjs`) | exit 0 |
| tooling isolation | `bun run setup:doctor` section "Tooling isolation (adopted app)" (rows of `.agents/prompts/adopt-tooling-isolation.md`: the app's `tsconfig.json` or ESLint config still reaching `cli/` and `scripts/`, a foreign hook manager not calling `.husky/framework-gates.sh`) | section absent; otherwise every line is a team decision in the plan, applied by hand and never by this skill |
| app intact | the app's `build` / `lint` / `types` / `test` (names from `stack.scripts`) | exit codes equal to the Phase 1 baseline |
| maps | `bun run context:map <slug> --list` for each map skill in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) | informational: the maps belong to `/project-context`, and placeholders are reported as the first hand-off |
| git | `git_strategy.meta.strategy_source` | informational: `inherited` points at `/git-flow-master` Strategy Setup in the hand-off |

### Team-owed prerequisites (reported, never created)

A live app may lack fail-closed blocks: `testing.automation_identity` (a dedicated non-production account for automation), `autonomous_delivery.automation_gh_account` and a dedicated database role for read-only checks. Their `null # TODO` lines stay. The plan lists each one with the skill that needs it and what the team must provide.

---

## Phase 0: resume check, entry gate and signals (no writes)

`SKILL.md` §Phase 0 owns the steps. Its output, the `PENDING` / `ADOPTED` table, becomes the plan's §Baseline snapshot. A plan from an earlier run sits at `.context/reports/project-adoption-plan.md`:

| Plan `Status:` | Action |
|---|---|
| absent | fresh run, continue to Phase 1 |
| `PENDING APPROVAL` | show it, ask for approval or changes, and re-enter Phase 1 only for what the user changes |
| `APPROVED` | resume at the first phase whose rows are still `PENDING` |
| `COMPLETED` | the signals decide: all `ADOPTED` means nothing to do; some `PENDING` means a drift run, so append a new dated section to the plan and never rewrite the closed one |

---

## Phase 1: analysis (no writes)

### 1.1 Stack fingerprint

Run `bun run agents:setup --stack --dry-run --non-interactive`. It calls `detectStack` (`cli/lib/stack-descriptor.ts`): each proposed value carries its source file, and an undetected field is absent. Complete the picture by reading:

- `stack.app_root` is the folder whose `package.json` declares `next`. With more than one candidate (`apps/*`, `packages/*`), ask which app this adoption covers (OD6).
- The package manager comes from the lockfile. Anything but `bun` stops the run (OD3), quoting the lockfile found.
- Scripts: the app's `package.json` script names for dev, build, lint, types, test and db types. A role with no script is `null`.
- Database: `engine` and `provider` from dependencies and config (`@supabase/*`, `supabase/config.toml`, `prisma/schema.prisma`, `drizzle.config.*`); `migrations_dir` from the folder holding migration files; `migrations_tool` from how the team applies them (CLI files in the repo, Prisma, Drizzle, or the DB MCP when no migration files exist); `schema_source` is `migrations` when the repo holds the history and `live` otherwise; `types_path` from the generated types file when present.
- UI, hosting, CI, test runner and import alias: the files `detectStack` cites (Tailwind config or `@import "tailwindcss"`, `components.json`, `vercel.json` or `.vercel/`, `.github/workflows/`, the test runner's config).

### 1.2 v1 gate

Run `unsupportedInV1` over the proposed values (`V1_SUPPORTED`, same file). Any issue stops the run here with the field, the value, the evidence path and the owner decision behind the limit (OD2 stack family, OD3 bun). Nothing is written, not even the plan.

### 1.3 Repo conventions

Read these and edit none of them:

- Adoption parity: `.agents/prompts/parity-plan.md` holds the rows the adoption run left (app-owned collisions, script collisions with their composition proposal, the instruction merge). Without it, take the collisions from the `git diff` of the adoption commit.
- Instructions: whether `.agents/prompts/adopt-instructions.md` exists, whether `CLAUDE.md` is already the shim, which `<app>-context` skill holds the app's own text (the adoption run names it in its instructions row), and whether `AGENTS.md` still carries the legacy `## 0. Project instructions (pre-adoption)` block of an app adopted before that skill existed.
- Hooks: `.husky/`, `lefthook.yml`, `simple-git-hooks` in `package.json`, `.pre-commit-config.yaml`, husky v4 config, `git config --local core.hooksPath` (detector: `detectHookManager` in `cli/lib/hook-manager.ts`). A foreign manager stays, and the snippet that makes it call the framework gates sits in `.agents/prompts/adopt-tooling-isolation.md` as a team decision.
- Tooling isolation: the same file has the exact `exclude` and ignore lines for the app's own `tsconfig.json` and ESLint config. A stock Next.js tsconfig type-checks `cli/` and `scripts/` and fails on Bun-only syntax, so the app's own `tsc` and `next build` stay red until the team applies them.
- Env files: `.env`, `.env.local`, `.env.example` (the sentinel block the adoption appended). Read variable names only and print no value.
- CI: the workflow files and which scripts they call, because the tooling must not change what CI runs.
- Branches: `git branch -a` and the default branch, as input for the Strategy Setup hand-off and nothing more.

### 1.4 Issue tracker reachability

Load `/acli`. With `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env` and a candidate host, check auth status and that the candidate project key exists (read-only). No tracker, or a team that declines it, is a recorded gap. Missing credentials stop the run (Critical Rule #9) only when the user wants the tracker wired in this run.

### 1.5 Baseline

Run the app's own scripts from `stack.app_root` with its package manager: `build`, `lint`, `types`, and `test` only when 1.6 confirmed the suite reaches no shared database and no paid API. Record each exit code, duration and first error lines. When `git status --porcelain` changes after a script, that script writes tracked files: record it, revert nothing yourself (Critical Rule #13) and ask.

### 1.6 Questionnaire (one batch, only what the files cannot answer)

- Project identity: `project_name`, `project_key`, `webapp_domain`.
- Environments the app runs (local, staging, production, others) with `web_url`, `api_url` and `db_project_ref` per environment, and which one is `testing.default_env`.
- Tracker: Jira or none, the host for `issue_tracker.atlassian_url`, and the project key.
- Database: which `migrations_tool` the team really uses when both files and MCP history exist, and whether `test` is safe to run for the baseline.
- Monorepo: which app, when 1.1 found several.
- API contract: whether the app serves or commits an OpenAPI spec, and where.
- Script collisions from 1.3: the team keeps its own (the default) or adopts the composition later by hand.
- Web platform target: the Baseline target the UI holds to, with Baseline Widely available recommended unless the product needs newer features.

An unanswered item becomes a Discovery Gap.

### 1.7 Web platform scan (read-only)

Run `npx modern-web-guidance@latest legacy-scan .` from `stack.app_root`. It reads the app and changes nothing, so it fits the sealed phases. Turn its findings into a modernization list for the plan: one row per pattern, the native feature that replaces it, the files it touches and the effort. The list is a proposal for the team, never applied by this skill (the refusal list covers every file under `stack.app_root`). A failed or unavailable run goes under `## Discovery Gaps`.

---

## Phase 2: the plan (no writes except the plan file)

Write `.context/reports/project-adoption-plan.md` from `references/plan-template.md` with the header `Status: PENDING APPROVAL`, then check the seal: `git status --porcelain` differs from Phase 0 only by that file. Close with this line:

> Wait for explicit approval of the plan before Phase 3. Nothing has been written yet.

On approval, set `Status: APPROVED`, record who approved and the date in the header, and start Phase 3. A requested change edits the plan and asks again.

---

## Phase 3: identity, stack, environments and protected paths (writes)

Re-read the approved plan first. Each step writes only its approved rows.

1. Stack. `bun run agents:setup --stack` asks one prompt per field whose detected value differs from the yaml, so answer with the approved plan values. It inserts a missing block at the schema's position and re-reads it (`writeStack`), then fills the identity leaves that restate the stack (`backend_stack`, `frontend_stack`, `db_type`, `backend_entry`, `frontend_entry`) where they are still null (`writeDerivedIdentity`). A leaf the plan already filled keeps its value.
2. Identity and environments. `bun run agents:setup` covers the identity and environment leaves in the plan (interactive; `--non-interactive` reads the env mapping in its header). An environment the project does not run leaves the yaml only when the plan says so.
3. Framework skills. For each skill saved under `.agents/prompts/adopt-upstream/<name>/` whose `take upstream` row has its own approval line (the row lists the files that differ and the ones only the app's copy has; an app-specific edit is a reason to keep it): copy `.agents/skills/<name>/` to `.backups/project-adoption/<date>/skills/<name>/`, replace the folder with the saved copy, verify with `diff -r .agents/prompts/adopt-upstream/<name> .agents/skills/<name>` (no output), then delete the saved copy. For a skill the team keeps, add its files to `updater.protected_paths` (next step), delete the saved copy and let the plan record the decision. Then run `bun run skills:registry`.
4. Protected paths. Add every app-owned collision not yet listed to `updater.protected_paths` in `.agents/project.yaml`, in block style with one path per line, as a splice that keeps the rest of the file byte-identical (never `parseDocument(...).toString()` on a file under `.agents/`).
5. Verify at the destination: re-read the yaml, check that `bun run setup:doctor --json` `stack` shows no issue, and that `bun run vars:check` exits 0.

## Phase 4: credential slots (writes `.env` only)

1. When `.env` is absent, copy `.env.example`. An existing `.env` is never overwritten, and an app that keeps `.env.local` keeps it (the plan says which file the tooling reads).
2. Fill only values the user supplies in this run (tracker credentials, the DB MCP token when the team wants the later map session to read the live schema). Never echo a value back.
3. Tell the user to restart the agent session before any MCP-backed hand-off, because each MCP server reads `.env` through its loader when it spawns.
4. Verify: `bun run vars:env:check` and `bun run harness:env:check` exit 0.

## Phase 5: issue-tracker catalogs (writes `.agents/jira-*.json` only)

With no tracker in the plan, skip this phase and record the gap.

1. Load `/acli`. Run `bun run jira:sync-fields`, `bun run jira:sync-workflows` and `bun run jira:sync-link-types` against the app's own instance (host from `issue_tracker.atlassian_url`), never with the UPEX reference flag on a foreign instance. A workflow sync without Administer permission skips itself with a marker: record it, it is not an error.
2. Run `bun run jira:check`. A missing required field is not created here: the plan names the field, the fallback (`.agents/jira-required.yaml` `fallback:`, a structured comment) and that creating fields is a Jira admin's decision.
3. Leave the whole-project hydrate (`context:hydrate`) out of adoption: `/sprint-development` fills the PBI cache per story.

## Phase 6: the app's instructions and harness compat

The app's own instruction text never loads at session start. `--adopt` moved it, verbatim, to the project-local skill `.agents/skills/<app>-context/` (`references/app-instructions.md`, the slug from the app's `package.json` name), added a pointer to `.agents/instructions/agent-project.md`, and composed an `AGENTS.md` that is upstream's plus one router row to that skill, without upstream's router lock line (the table it fingerprints is no longer upstream's, and the ADR it names never travels; ADR-0014). That row registers the skill: `AGENTS.md` is a protected path `bun sync` never overwrites, and `bun run docs:check` (`roster`) counts a skill an `AGENTS.md` row loads, so the `<app>-context` skill needs no row in the shared `agent-skills-and-mcps.md`. Any further skill the project creates for itself registers in the "Project context skills" table of `agent-project.md` (`/project-context context-skill`). Each step below runs only on its own approval line in the plan.

1. Pending merge (only when `.agents/prompts/adopt-instructions.md` exists). Show the saved file's router row and the head of `references/app-instructions.md`. Copy the current `AGENTS.md` and `CLAUDE.md` to `.backups/project-adoption/<date>/`, write the saved file to `AGENTS.md` byte for byte and write `CLAUDE.md` as the shim. Delete the saved file only after the write verified (re-read, byte-compare).
2. Legacy layout (only when `AGENTS.md` carries `## 0. Project instructions (pre-adoption)`, an app adopted before the skill existed). Back up `AGENTS.md`, move the block's text between that heading and the closing `---` verbatim into `.agents/skills/<app>-context/references/app-instructions.md` (the shape `cli/lib/adopt-app-context.ts` writes: one `## From` heading per original file), write its `SKILL.md`, replace the block with the router row and add the `agent-project.md` pointer. Before deleting the block, prove every original line and heading is in the reference, byte for byte.
3. Description. The `description` the CLI wrote is mechanical (the app's name, its `package.json` description, its own section titles). Rewrite that one field from the Phase 1 analysis so it routes by the app's real domain (entities, flows, the words its team uses), under 1024 characters. The preserved text stays untouched (anti-pattern A5).
4. Baseline target (when the questionnaire answered it and the plan's approval line allows it). Write one line under a `## Web platform` heading in `.agents/instructions/agent-project.md`, in the form `This project's Baseline target is Baseline Widely available.` (or `Baseline <year>`), following `instructions-doctrine.md` §4. Volatile features stay gated, and enabling them (`npx modern-web-guidance@latest set-allow-volatile-features`) is the team's call.
5. Run `bun run agents:compat`, then `bun run agents:compat:check` (exit 0) and `bun run instructions:check` (the router row resolves and `AGENTS.md` stays under its budget with the row). Every write to `agent-project.md` here follows `agentic-dev-core/references/instructions-doctrine.md` §4.

Without the merge row approved, the instruction signal stays `PENDING` and the plan says so: a plain `bun sync` refuses at its cross-harness preflight until the merge is applied.

## Phase 7: API contract (writes `api/openapi*` only when absent before adoption)

Run this only when the app serves or commits a spec and neither `api/openapi.json` nor `api/openapi-types.ts` existed before adoption: `bun run api:sync --url <spec URL>` or `--file <path>`. Otherwise record the spec location as an input for `/project-context api` and skip.

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

Stop at the first failure, report it with its output, propose the fix and wait for approval before changing anything. A step 9 difference is the most important failure this skill can report: name the script, both exit codes and the first new error.

## Phase 9: close

1. Re-run §Detection signals and print the final table (also the report a rerun shows).
2. Mark the plan `Status: COMPLETED` and append the results block (`references/plan-template.md` §Results).
3. Give the hand-off block from `SKILL.md` §Hand-offs, in order, each with the trigger the user types, and offer `/git-flow-master` to propose the commit of the writes. Never start a hand-off by yourself.
4. Architecture scan (optional, read-only). Once adoption closes, survey the app's modules for deepening opportunities. A shallow module has an interface nearly as complex as its implementation, understanding one idea means bouncing between many small files, and pure helpers were pulled out for tests while the bugs sit at their call sites. Walk `git log` for the hot spots and spot-check each suspect with the deletion test: would removing it concentrate complexity, or only move it? Write the candidates to `.context/reports/project-adoption-architecture.md` beside the plan, each with its files, the problem, a plain-English solution and a Strong, Worth exploring or Speculative badge, in the vocabulary below. Change no code. The person picks which candidate to explore in a later session, which then grills that one. A candidate that contradicts an ADR is marked in the report, and the ADR stays closed. Source: https://github.com/mattpocock/skills (engineering/improve-codebase-architecture), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.
5. Session footer per `agentic-dev-core/references/session-footer-contract.md` (dev surfaces touched: none in the app, and the agentic files written are named).

## Vocabulary for the architecture scan

Use these terms and no others for the scan:

- module: anything with an interface and an implementation;
- interface: the signature plus invariants, ordering and error modes;
- depth: how much behaviour sits behind a small interface;
- seam: where the interface lives;
- adapter: a role at a seam;
- leverage: what callers get;
- locality: what maintainers get.

One adapter is a hypothetical seam, and two make a real one. The interface is the test surface, so a test that has to reach past it means the module has the wrong shape. Source: https://github.com/mattpocock/skills (engineering/codebase-design), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

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
