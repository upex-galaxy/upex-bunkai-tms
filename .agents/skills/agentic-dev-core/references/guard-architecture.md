# GUARD: Guarded Unidirectional Agent-Ready Development

> Cited by: `sprint-development`, `unit-testing`, `project-bootstrap`, `project-adoption`, `pr-review-lead`, `AGENTS.md` Rule #18, `.agents/instructions/agent-code-quickref.md`. Decision record: `.context/ADR/ADR-0023-guard-architecture.md`.

GUARD is the product architecture this boilerplate teaches and checks: **four layers, one direction, one door per feature, a registry, lint before prose.** An agent that places code by this page, and reads the registry before creating anything, produces code a machine can verify.

## 1. The layers

Dependencies point down. A layer imports only from the rows below it.

| Layer | Default folder | Holds | May import |
|---|---|---|---|
| L4 app | `src/app/` | Next.js App Router routes, layouts, route handlers, server action entrypoints. Composition only: read params, call feature actions, render feature UI | features (through their door), platform |
| L3 features | `src/features/<name>/` | One business capability: its actions, domain logic, UI components, types. Public door is `src/features/<name>/index.ts` | adapters, platform, another feature only through its `index.ts` |
| L2 adapters | `src/adapters/` | Supabase repositories, external API clients, anything that talks to the outside | platform |
| L1 platform | `src/platform/` | Config, env access, DB client factory, logger, framework-free utilities | nothing above it |

Aliases: `@platform/*`, `@adapters/*`, `@features/*` and the root `@/*`. Use the aliases the app's `tsconfig.json` `paths` declares and no deep relative import.

## 2. The rules and what enforces each

| Rule | Statement | Enforced by |
|---|---|---|
| R1 one direction | A lower layer never imports a higher one | lint `guard/layer-imports` |
| R2 one door | Code outside `features/<x>/` imports feature `x` only as `@features/x`, never a deep path | lint `guard/feature-door` |
| R3 thin app | `src/app/**` never imports `@adapters/*`; data access goes through a feature | lint `guard/layer-imports` |
| R4 registry | `guard-manifest.json` lists every feature (each folder of the features root, `stack.conventions.features_root` in `.agents/project.yaml`) and the names its `index.ts` exports. Read it before creating a feature or an action | `bun run guard:manifest:check`, kept fresh by pre-commit (`scripts/guard-manifest.ts`) |
| R5 shape | At most 2 positional params in features and adapters; feature files stay under the `max-lines` limit | core `max-params` and `max-lines` |
| R6 no comments by default | Toolchain directives and one-line WHY only | Critical Rule 18 |

Each lint message names the rule and the root-cause fix. A fix moves the code to the right layer or opens the feature's door. A disable comment is the last resort and carries its reason (`eslint-disable-next-line <rule> -- <reason>`).

## 3. Configurable layer map

An adopted app keeps its folders. The plugin reads the layer map from ESLint `settings.guard.layers`, one glob list per layer, with the defaults of §1 when the setting is absent. An app that keeps `db/`, `api/` and `lib/` maps them to layers there and moves no file. A glob that names one file (`lib/supabase.ts`) puts that file in the layer and matches its imports with or without the extension; a folder glob (`lib/github/**`) covers everything below it. Aliases resolve through `compilerOptions.paths` of the `tsconfig.json` in the directory lint runs from (`@/` is `src/` when it declares none); an app whose paths live elsewhere (an `extends` base, a monorepo app folder) declares them in `settings.guard.aliases`, prefix to folder (`{ '@/': './' }`). ESLint's `--cache` does not see a `paths` change, so clear the cache after editing them. The wiring lives in `eslint.config.js` and, for Oxlint, `.oxlintrc.json`; `project-adoption` owns the mapping step.

## 4. Severity

`GUARD_ENFORCEMENT_LEVEL` sets the level of every GUARD check. It is `error`. `scripts/guard-manifest.ts` mirrors it, and so do the severities in `.oxlintrc.base.json` (`scripts/oxlint-config.test.ts` fails on drift), so the three move together. A project that needs time to clean its violations lowers a rule in its own `eslint.config.js` and `.oxlintrc.json`; a rule at `warn` never fails CI, so a warning there is work owed, not noise.

## 5. The example

`packages/guard-example/` is a minimal feature that passes every rule. Copy its shape when creating a feature. The installer inserts it into `src/` of a new project on first install, and the updater never ships it. To restore or refresh it, copy `packages/guard-example/` from the upstream repository `https://github.com/upex-galaxy/agentic-dev-boilerplate` when the person asks.

## 6. Bridge to QA

A feature's exported actions are what the QA boilerplate automates as KATA ATCs. The manifest names them, so a story's acceptance criteria, the feature action and the ATC share one vocabulary. Test a feature through its door: the interface is the test surface.

## 7. Correction to check

A review finding that repeats becomes a check. The first remedy is a `guard` lint rule or a manifest check whose message names this doctrine and the root-cause fix. Prose is the remedy only for what a machine cannot judge. Rule candidates from a session go to `references/session-management.md` §8.

## Provenance

KATA (layers, manifest, one entry point), the talk "All Code Is Slop (Except Mine)" by Lauren Tan (the trust pyramid, every correction becomes a check, one folder per feature with import bans) and Matt Pocock's codebase-design skill (the interface is the test surface).
