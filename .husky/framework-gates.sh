# shellcheck shell=sh
# Framework gates — SYNCED by the boilerplate updater (`husky` component).
#
# WHY THIS FILE EXISTS. `.husky/pre-commit`, `.husky/pre-push` and
# `.husky/commit-msg` are on the updater's PROTECTED_WATCHLIST: delivered once
# when missing, then never overwritten, because a project's own gates live in
# them. The consequence was that a gate added upstream never reached a project
# scaffolded earlier. This file carries the gates upstream owns and IS synced;
# each hook sources it and calls one function, keeping its own ordering and its
# own extra gates around that call.
#
# CONTRACT FOR A HOOK. Source this file, then call the function for the hook:
#
#   GATES="$(dirname -- "$0")/framework-gates.sh"
#   if [ -f "$GATES" ]; then . "$GATES"; framework_gates_pre_commit; fi
#
# The guard is not decoration: `.husky/_/h` runs the hook under `sh -e`, so a
# `.` on a file that is not there kills the hook outright. A rollback, a sparse
# checkout or a half-applied sync can leave the hooks present and this file
# absent, and a repo in that state must still be committable.
#
# CONTRACT FOR THIS FILE. Only gates every scaffolded project can run. No
# package.json script key that does not already exist in every project, no
# project-specific paths, POSIX sh only. Adding a gate here is how it reaches
# every downstream repo on the next sync.

# ADOPTED APPS. On a repo `bun sync --adopt` installed into an existing app
# (`.template/installer.lock.json` says `"adopted": true`) the root
# `tsconfig.json` and ESLint config are the APP's, never replaced, so
# `types:check` / `lint:check` would either be the app's own scripts or judge
# the tooling by the app's rules. There the gates check the tooling through its
# own scope instead (`tsconfig.tooling.json`, `eslint.config.tooling.mjs`), and
# the app keeps checking its code with its own hooks. A greenfield project takes
# the first branch of every helper below, exactly as before.
_fg_adopted() {
  grep -Eq '"adopted"[[:space:]]*:[[:space:]]*true' .template/installer.lock.json 2>/dev/null
}

# _fg_scoped <greenfield script> <adopted-app script>. The adopted script is
# guarded like any key this file cannot assume (see the contract above): a repo
# whose package.json has not received it yet skips the check and says so.
_fg_scoped() {
  if ! _fg_adopted; then
    bun run "$1"
  elif grep -q "\"$2\"" package.json 2>/dev/null; then
    bun run "$2"
  else
    echo "⚠️  package.json has no \"$2\" script: tooling check SKIPPED. Restore it with: bun sync"
  fi
}

# Gates that run on EVERY commit. Fast, full-repo, plus the freshness checks
# that only matter when the staged set touches what they guard.
framework_gates_pre_commit() {
  # Light-weight repo health checks on every commit (fast, cover full repo).
  _fg_scoped types:check tooling:types:check
  bun run vars:check
  bun run skills:check

  # Deletions count: removing a SKILL.md stales the registry as surely as
  # editing one does.
  _fg_staged=$(git diff --cached --name-only --diff-filter=ACMRD)

  # skill-registry freshness gate — only runs when staged files affect it.
  if echo "$_fg_staged" | grep -qE '^(\.agents/skills/.+/SKILL\.md$|scripts/build-skill-registry\.ts$|\.agents/skills/REGISTRY\.md$)'; then
    bun run skills:registry:check || {
      echo ""
      echo "❌ .agents/skills/REGISTRY.md is stale. Fix:"
      echo "   bun run skills:registry && git add .agents/skills/REGISTRY.md"
      exit 1
    }
  fi

  # project-schema freshness gate — only runs when staged files affect it.
  #
  # TWO guards, both load-bearing. The package.json grep honours this file's
  # contract ("no script key that does not already exist in every project"): a
  # project synced to this release's husky but not its package.json would
  # otherwise have every commit touching `.agents/` killed by a missing script.
  # And `agents:schema:check` itself exits 0 with a note in any repo that is NOT
  # the boilerplate, because the schema is SYNCED there rather than generated,
  # so even where the key IS present downstream this gate cannot fail for a
  # reason the project can do nothing about.
  if echo "$_fg_staged" | grep -qE '^(\.agents/project\.yaml$|\.agents/project\.schema\.yaml$|cli/lib/agents-schema\.ts$|scripts/agents-schema\.ts$)' \
    && grep -q '"agents:schema:check"' package.json 2>/dev/null; then
    bun run agents:schema:check || {
      echo ""
      echo "❌ .agents/project.schema.yaml is stale. Fix:"
      echo "   bun run agents:schema && git add .agents/project.schema.yaml"
      exit 1
    }
  fi

  # env-schema freshness gate — only runs when staged files affect it, and only
  # where the script exists (same two guards as the project-schema gate above).
  # `.env.core.schema` is GENERATED from cli/lib/variables-manifest.ts; the check
  # also loads the committed schema pair through the pinned varlock, so a
  # varlock bump that breaks the import fails here, not in someone's session,
  # and fails a secret-looking key without @sensitive in ANY root .env*.schema
  # (`varlock load --agent` would print its value in clear).
  if echo "$_fg_staged" | grep -qE '^(cli/lib/variables-manifest\.ts$|cli/lib/env-schema\.ts$|scripts/env-schema\.ts$|\.env(\.[^/]+)?\.schema$|package\.json$)' \
    && grep -q '"vars:schema:check"' package.json 2>/dev/null; then
    bun run vars:schema:check || {
      echo ""
      echo "❌ .env.core.schema is stale, a secret-looking key lacks @sensitive, or the schema pair does not load."
      echo "   Stale core: bun run vars:schema && git add .env.core.schema"
      echo "   Missing @sensitive: add it above each key the check names"
      exit 1
    }
  fi

  # instructions gate — only runs when staged files affect it, and only where
  # the script exists. Besides the budget, router and frontmatter checks it
  # holds the three locks of ADR-0014: the router table frozen behind the ADR
  # that decided it, the labelled-prompt router eval (a `triggers:` edit that
  # loses a route fails HERE, before any test run), and every section shipped
  # complete.
  if echo "$_fg_staged" | grep -qE '^(AGENTS\.md$|\.agents/instructions/|\.agents/hooks/|\.context/ADR/|cli/lib/fixtures/instruction-router-eval\.json$|scripts/lint-instructions\.ts$|scripts/lib/(instructions|router-eval)\.ts$)' \
    && grep -q '"instructions:check"' package.json 2>/dev/null; then
    bun run instructions:check || {
      echo ""
      echo "❌ The instructions are out of contract (budget, router, sections, router lock or router eval)."
      echo "   Where each sentence goes: .agents/skills/agentic-dev-core/references/instructions-doctrine.md"
      exit 1
    }
  fi

  # cross-harness compatibility gate — only runs when staged files affect it.
  # Covers the generated Claude skills alias, a harness command that shadows a
  # skill, the three hook adapters, MCP parity across the three host configs and the eslint block
  # wiring. Everything it guards is generated or mirrored, so a hand-edit is
  # invisible to every other check.
  if echo "$_fg_staged" | grep -qE '^(\.agents/hooks/|\.claude/commands/|\.opencode/commands/|\.opencode/plugins/|\.codex/|\.claude/settings\.json$|\.mcp\.json$|opencode\.jsonc$|eslint\.config(\.base)?\.js$|cli/lib/agent-compatibility.*\.ts$|scripts/agent-compatibility.*\.ts$|AGENTS\.md$|CLAUDE\.md$)'; then
    bun run agents:compat:check || {
      echo ""
      echo "❌ Cross-harness compatibility is out of contract. Fix:"
      echo "   bun run agents:compat   # repairs the Claude skills alias, moves a command that shadows a skill to .backups/"
      echo "   then stage the deletion of any command it moved"
      echo "   (an unwired eslint block is fixed by hand in eslint.config.js)"
      exit 1
    }
  fi

  # documentation-contract reminder — WARN-ONLY at commit time (ADR-0017): the
  # pages a marked region names often land in the next commit of the same push.
  # The pre-push run below is the one that blocks.
  framework_gate_doc_contracts --staged || true
}

# Gates that run before a PUSH: ONLY the checks pre-commit does not already run
# per-commit.
#
# pre-commit covers (every commit): types:check, vars:check, skills:check
#   + conditional skills:registry:check (when staged files affect the registry)
#   + conditional vars:schema:check (when staged files affect the env schema)
#   + conditional agents:compat:check (when staged files affect the contract)
#   + conditional instructions:check (when staged files affect the instructions)
#   + conditional agents:schema:check (when staged files affect the project schema)
#   + the documentation-contract reminder, warn-only.
# pre-push adds the full-repo checks pre-commit skips for speed:
#   - format:check / lint:check  full repo (lint-staged only touches staged files at commit)
#   - vars:env:check             not run at commit time. Runs with
#                                VARS_ENV_CHECK_DRIFT=warn: the manifest/.env.example parity
#                                rules stay FATAL (they describe the repo), but the
#                                process-env-vs-.env drift rule only WARNS here, because it
#                                describes the developer's machine.
#   - skills:registry:check      unconditional safety net — a commit in the push range may
#                                have changed the registry without pre-commit catching it.
#   - agents:compat:check        unconditional safety net for the cross-harness contract:
#                                the generated `.claude/skills` alias, no harness command
#                                named like a skill, the three hook adapters, the
#                                CLAUDE.md shim, MCP parity across `.mcp.json` /
#                                `opencode.jsonc` / `.codex/config.toml`, and that
#                                eslint.config.js wires every block the synced base exports.
#   - docs:check                 unconditional: dead links, `<title>` / description, the skill
#                                router, Critical Rule #17 facts. It ran in no hook before,
#                                only in `repo:check` and CI, so a script renamed without
#                                touching any doc passed every hook. Skipped where
#                                package.json lacks the key.
#   - doc contracts              `scripts/lint-doc-contracts.ts --push` (ADR-0017): a change
#                                inside a `LINT.IfChange(label)` region of the push range
#                                BLOCKS unless every page its `LINT.ThenChange(...)` names
#                                changed too, or a commit carries `Docs-Checked: <label>
#                                <reason>`. Maintainer-only in v1: prints one line and exits
#                                0 in a downstream project. Called by path, guarded by `-f`,
#                                like the commit-msg check (no package.json key needed).
#   - varlock load               the developer's own .env against the committed env schema
#                                (.env.schema + .env.core.schema). WARN-ONLY: it describes the
#                                developer's machine, like vars:env:check's drift rule, and the
#                                schema requires nothing, so only a malformed typed value can
#                                fail it. Runs only when the schema and the pinned
#                                devDependency are both present, so a project synced to this
#                                gates file but not to this package.json is untouched. Output
#                                is redacted by varlock (`--agent`); we still send it to
#                                /dev/null and name the command to rerun.
#
# NOT here, on purpose: `bun run git:policy verify`. This repo's doctrine keeps the
# declared-vs-host reconciliation agent-driven (git-flow-master Step 1b: once per
# session, at the first push / PR / merge intent). As a hook gate it would block every
# push of a freshly scaffolded project whose inherited `git_strategy.policy` has not yet
# been reconciled with its host, for a reason the push itself has nothing to do with.
#
# Commands are spelled out here rather than behind one aggregate npm script: every
# command below already exists in every scaffolded project, so this function cannot be
# broken by a package.json key that lands in a separate, partially-applied sync phase.
# The full suite (incl. types/vars/skills/docs) lives in `repo:check` for CI / manual runs.
#
# On an adopted app `format:check` is skipped: it runs Prettier over every JSON
# and YAML file in the repo, and the app's own formatting (and its own
# `.prettierrc`, which the adoption keeps) is not the framework's to gate.
framework_gates_pre_push() {
  _fg_format_check \
    && _fg_scoped lint:check tooling:lint:check \
    && VARS_ENV_CHECK_DRIFT=warn bun run vars:env:check \
    && bun run skills:registry:check \
    && bun run agents:compat:check \
    && framework_gate_docs_check \
    && framework_gate_doc_contracts --push \
    && framework_gate_varlock_warn
}

# `docs:check` on every push, where the script exists (a project synced to this
# file before its package.json gained the key is skipped, never broken).
framework_gate_docs_check() {
  if grep -q '"docs:check"' package.json 2>/dev/null; then
    bun run docs:check || return 1
  fi
  return 0
}

# The documentation-contract gate (ADR-0017), by path: `--staged` warns,
# `--push` blocks. The script ships in the `scripts` component, a separate sync
# phase from this file, so a project without it yet is skipped silently.
framework_gate_doc_contracts() {
  if [ -f scripts/lint-doc-contracts.ts ]; then
    bun scripts/lint-doc-contracts.ts "$1" || return 1
  fi
  return 0
}

# The warn-only env-schema validation described above. A function so the
# `&&` chain in framework_gates_pre_push stays one expression: this never
# returns non-zero, because a red here is advice about this machine's .env.
framework_gate_varlock_warn() {
  if [ -f .env.schema ] && [ -f node_modules/varlock/package.json ]; then
    if ! bunx varlock load --agent >/dev/null 2>&1; then
      echo ""
      echo "⚠️  varlock: your .env does not satisfy .env.schema (warn-only)."
      echo "   See which items fail (values redacted):  bunx varlock load --agent"
    fi
  fi
  return 0
}

_fg_format_check() {
  if _fg_adopted; then
    echo "ℹ️  adopted app: format:check skipped (the app owns its formatting)."
    return 0
  fi
  bun run format:check
}

# Gate that runs on the COMMIT MESSAGE (`.husky/commit-msg`, which passes the
# message file git hands it as $1). WARN-ONLY by contract: the forensic-trailer
# check (AGENTS.md Critical Rule #3, canon in git-flow-master §3.2) prints what
# is missing or forbidden and never blocks, so a human commit, a merge or an
# emergency fix always lands. The script ships in the `scripts` component, a
# separate sync phase from this file, so a project that has this function but
# not the script yet is skipped silently rather than broken.
framework_gates_commit_msg() {
  if [ -f scripts/check-commit-trailers.ts ]; then
    bun scripts/check-commit-trailers.ts "$1" || true
  fi
  return 0
}
