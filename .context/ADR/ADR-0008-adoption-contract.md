# ADR-0008 — Adopting an existing app: two layers, nine owner decisions, one measured contract

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Boilerplate owner (upex-galaxy): owner decisions OD1-OD9 on the brownfield spike (2026-10-03); conductor rulings of the dev-sync fleet on the points the dogfood run raised. Recorded by the dogfood unit (U18-12), which adopted the agentic layer into a throwaway copy of `upexgalaxy-webapp`, end to end
- **Tags:** adoption, brownfield, updater, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Until this wave there was no supported way to bring agentic-dev into an application that already exists. The scaffolder refused a non-empty folder, and the only path that reached a foreign repo (a first `bun run up` with no lock) overwrote the app's files at the same paths. The real case already existed: `upexgalaxy-webapp` (Next.js App Router, Supabase with dozens of migration files, its own CI, an 800-line hand-written `CLAUDE.md`, its own `scripts/` and `docs/`) carried framework skills copied in by hand into a gitignored `.agents/`. A teammate who cloned it got none of them, and `bun run up` could never reach it.

The wave (U18-0 to U18-12) built the adoption path. This record fixes the decisions behind it and the contract the dogfood run measured on a copy of that app, so a later change can tell whether it breaks the contract.

## Decision

We will adopt an existing app in two layers, each with its own owner.

1. **The install layer** (`bun <boilerplate clone>/cli/update-boilerplate.ts --adopt`, or `create-agentic-dev --adopt`, which delegates to it) delivers the tooling files and never overwrites anything the app owns. It runs only on an explicit `--adopt`, never inferred from a missing lock, and a second `--adopt` is a no-op.
2. **The understanding layer** (the `project-adoption` skill) reads the app with no writes, writes one plan, waits for approval, then fills the agentic surfaces only (identity, the `stack:` block, environments, tracker catalogs, protected paths, the pending instruction merge, the framework skills the app had copied in by hand) and verifies that the app's own scripts exit exactly as before.

### Owner decisions (2026-10-03)

| ID | Decision |
|---|---|
| OD1 | A new skill `project-adoption` plus `--adopt` in the updater and the scaffolder (not a `project-bootstrap` mode, not an updater-only path, not a sibling repo). |
| OD2 | v1 covers Next.js + the Postgres family; any other stack stops at analysis with the field and the reason (`V1_SUPPORTED` in `cli/lib/stack-descriptor.ts`). |
| OD3 | bun is required in v1; another package manager stops with a reason, and nothing switches it. |
| OD4 | **C (owner override):** agents keep applying database changes through the DB MCP (Supabase or the same Postgres family) under the delivery doctrine (`agentic-dev-core/references/db-change-doctrine.md`). The adoption itself never touches a database: it installs tooling and writes agentic surfaces. |
| OD5 | An adopted app's product docs are the business maps, the dev guide and the glossary; nothing invents a PRD or an SRS, and `/sprint-development` accepts the maps in their place. |
| OD6 | One app per adoption, named by `stack.app_root`. |
| OD7 | The tooling lives at the root as in greenfield; an exact collision is refused file by file and protected. |
| OD8 | Hygiene shipped first; the rest landed as the final wave. |
| OD9 | An adopted app's `DESIGN.md` is extracted from its live code (`/design-system extract`). |

### Invariants of the install layer

- **Never overwrite, never delete an app file.** A path the app already has with other content is kept, listed in `updater.protected_paths`, and reported as a row. A file at a path upstream retired is the app's too: kept, protected, never handed to the deprecated cleanup.
- **Append only where the app's file is shared:** `package.json` (tooling packages into `devDependencies`, a package the app declares anywhere never added again, a colliding script kept as a blocking row), `.env.example` (the tooling's variables inside one sentinel block), `.gitignore` (the sentinel block). An upstream ignore line that would hide a file the app tracks is withheld.
- **The agentic layer is versioned.** When the app's own `.gitignore` hides `.agents/`, the adoption re-includes it in an appended block (the app's lines untouched) BEFORE the cross-harness migration moves anything. The migration refuses, on any run, to untrack skills into a folder git ignores.
- **The app's configs are never written.** Each app `tsconfig*.json` and ESLint config that still reaches the tooling is a blocking row with the exact lines to add; where the app keeps its own files in `scripts/`, the lines name upstream's files only, so the app's own scripts stay checked.
- **The tooling judges only what it owns.** On an adopted repo the installer lock records what upstream ships under `scripts/` and `.agents/skills/` (`upstreamOwned`, `cli/lib/tooling-scope.ts`); `tooling:types:check`, `tooling:lint:check` and `skills:check` scope themselves to it. The app's own skills and scripts are listed, not linted; the app's preserved instruction text is not judged by Critical Rule #17; a retired variable name the app declares itself is a warning.
- **The adoption commit passes the gates.** Steps that belong to `project-adoption` (the instruction merge, the framework skills to take upstream) are pending states, not broken contracts: the alias is deferred, a pending skill is listed, and lint-staged runs only where the project configures it.
- **The app's tests are the app's.** The tooling's own test files never reach an adopted app, through any delivery route, the updater's self-update included.

### Conductor rulings recorded with this ADR

| Point | Ruling | Option it beat, and why |
|---|---|---|
| The app's `.gitignore` hides `.agents/` | Re-include it in an appended block, plus a fail-closed guard in the migration | A blocking row the user fixes by hand: until fixed, the adoption commit deletes the app's skills from git and versions nothing |
| The app's own skills and scripts sit inside the tooling gates | Record what upstream owns at each sync and scope the gates to it | Recording the app's list once at adoption misses everything the app adds later; accepting the red gates blocks every commit of the app |
| The app carries older hand copies of framework skills | Not protected; a `take upstream` row with the diff summary, applied by `project-adoption` on its own approval line, backup first | Protecting them freezes the app on a stale framework forever |
| A stock app tsconfig type-checks the tooling (U18-3) | The adoption never writes app configs; one blocking row per config with the snippet | Patching the app's config breaks the never-write invariant |

## Consequences

- **Positive:** an existing app gets the agentic layer with one command and one guided skill, and its own build, lint, type-check and test exit exactly as before once the team applies the isolation snippets (measured below). A second `--adopt` is a no-op; a later plain `bun run up` keeps every protected app file and updates the framework where the app no longer holds a copy of its own.
- **Negative / trade-offs:** the isolation snippets are by hand, and until they are applied the app's own `type-check`, `lint` and `test` stay red. The composed `AGENTS.md` carries the app's whole instruction text: on the dogfood app it more than doubled the file (measured below), loaded on every session. The `upstreamOwned` list lives in the tracked installer lock, so every sync that changes the tooling's file set changes that file.
- **Neutral / follow-ups:** moving a long preserved instruction block into an app context skill (plan risk R5) is a decision for evidence from real use, not for this record. The `lint-staged` section of `package.json` carries arrays, which the append-only merge skips by construction (`getSection` keeps string values only): upstream changes there never reach any consumer, greenfield included.

## Measured on the dogfood copy (2026-10-03)

A `git clone` of the app with its remote removed and no `.env`; the adoption run with the updater from this branch; every step as a user would take it. The app's own baseline before adoption: `test` 0, `lint` 0, `type-check` 0, `build` 1 (its `verify-env` step stops on a missing secret, expected with no `.env`).

| Step | Measured |
|---|---|
| `--adopt --auto` | exit 0; tracked app files modified: `package.json`, `.gitignore`, `.env.example` (sentinel block), `.claude/settings.json` (the agent-context hook, backed up); 512 renames `.claude/skills/` -> `.agents/skills/` at 100% similarity; 28 deletions (27 symlinks pointing into the app's gitignored store, the generated `REGISTRY.md`); no tooling test file delivered; the generic `build/` ignore line withheld (it matched the app's `app/build/` route) |
| `bun install`, then the adoption commit | passes every framework gate (`tooling:types:check` counts the app's own errors without failing on them; `skills:check` lists the app's skills and the framework skills pending take-upstream) |
| App scripts before the isolation snippets | `test` 1, `lint` 1, `type-check` 2: the blocking rows say why |
| App scripts after the snippets (`tsconfig.json`, `tsconfig.scripts.json`, `eslint.config.mjs`, by hand) | `test` 0, `lint` 0, `type-check` 0, `build` 1 with the same cause: equal to the baseline |
| `project-adoption` writes (stack, identity, 14 framework skills taken upstream, `.env` slots, instruction merge) | `agents:compat:check`, `vars:check`, `vars:env:check`, `harness:env:check`, `tooling:types:check`, `tooling:lint:check`, `skills:check` all exit 0; `jira:check` exit 1 (no tracker wired in the copy: a recorded gap) |
| Composed `AGENTS.md` | 1622 lines, 164 223 bytes (the boilerplate's doctrine plus the app's text verbatim) |
| Second `--adopt` | `Sin cambios.`, tree clean |
| Plain `bun run up` against an upstream that changed a protected file, `.env.example` and a framework skill | the protected file kept byte-identical, `.env.example` kept, the skill taken upstream updated, the retired command files the app kept untouched |

## Alternatives considered

- **`project-bootstrap` with an adopt mode (O2)** — its base phases create from nothing (schema, RLS, seed, middleware, theme, `@latest` upgrades); one skill holding "create everything" and "touch nothing" is one mode slip from running `backend-setup` on production.
- **Updater only (O3)** — delivers files, but nothing configures the stack descriptor, the tracker catalogs or the maps: every skill would read null and stop.
- **The agentic layer in a sibling repo (O4)** — no file collisions, but the delivery skills write app code, open PRs from inside the app's history and run its build; a sibling repo cannot.

## References

- Spike and plan: `.session/spikes/dev-brownfield/plan.md` in the agentic-qa repo (§1 success criteria, §5 design, §5.5 idempotency signals); owner decisions `.session/decisions/dev-brownfield-2026-10-03.json` there.
- `.agents/skills/project-adoption/SKILL.md` and `references/adoption-workflow.md` (phases, refusal list, signals).
- `cli/lib/updater-adopt.ts`, `cli/lib/adopt-gitignore.ts`, `cli/lib/adopt-isolation.ts`, `cli/lib/tooling-scope.ts`, `scripts/tooling-check.ts`.
- `AGENTS.md` §5.5 (updater `--adopt`).
