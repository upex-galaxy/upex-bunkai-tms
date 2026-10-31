---
name: agentic-dev-core
description: 'Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrine, skill composition strategy, behavioral layer, model routing, skill resolver, topic-key conventions, TypeScript patterns, the instructions doctrine for editing AGENTS.md or a section). Loaded on demand by `sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`, `testability-guide`, `agentic-dev-onboard`. Do NOT use for: syncing project memory facts (that is the docs follow-through in `references/docs-follow-through.md`, run by the skill that made the change), onboarding project discovery (use `/agentic-dev-onboard`), or test framework adaptation (testing-only, not in scope).'
license: MIT
compatibility: [claude-code, codex, opencode]
phase: foundation
complementary_categories:
  - language
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with "What this skill does NOT cover" in the body below.
compact_rules: |
  `agentic-dev-core` does not:
  - Provide a bootstrap or init action — the layer installs whole: `create-agentic-dev` for a new project, `create-agentic-dev --adopt` then `/project-adoption` for an existing app.
  - Create or modify any files. It is a passive reference library.
  - Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
  - Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
  - Adapt the framework to a specific stack (that belongs to `/project-bootstrap` on a new project, `/project-adoption` on an existing app).
  - Sync project-specific facts in `AGENTS.md` (that belongs to the docs follow-through, `references/docs-follow-through.md`, run inside the change that moved the fact).
  - Sync OpenAPI / API schemas (that's `bun run api:sync`).
  - Run any external command — no `bun install`, no `git`, no `gh`.

  Secret hygiene (Critical Rule #1, binds every skill and subagent): use a secret only by its variable NAME (`$VAR` in the shell, a name in the MCP loader's `--filter` list); never open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, never print a value (`printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`); check presence with `bun run setup:doctor --json` (set / missing per name); never run `varlock load`, even `--agent`, against a schema `bun run vars:schema:check` has not passed (a scratch schema is banned: `--agent` redacts only `@sensitive` items). The AI never writes a secret into `.env` (the human types it); a non-sensitive value (URL, project key, flag, port) it may write when asked, only through `bun run env:set KEY=value`. Safe command shapes + leak response: `references/secret-hygiene.md`.

  Instructions maintenance (ADR-0014, binds every skill and subagent): every change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list follows `references/instructions-doctrine.md`: place each sentence with its §2 decision tree, run its §6 procedure, close with `bun run instructions:check`. NEVER paste section prose into `AGENTS.md`, NEVER add, change or remove a router row without the ADR that decides it (`bun run instructions:check --accept-router ADR-NNNN`), and fix a trigger miss in the section's `triggers:` plus a labelled prompt in `cli/lib/fixtures/instruction-router-eval.json`, never by relabelling the set.

  Documentation contracts (ADR-0017, binds every skill and subagent that changes this boilerplate): close every change that adds, renames or retires a skill, a `package.json` script or a doc path, OR changes a behaviour a page describes, with the docs follow-through (`references/docs-follow-through.md`), decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) included, in the same PR. WHEN an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line): update EVERY page its `LINT.ThenChange(...)` names in the same push. Only when the documented behaviour did not change, add `Docs-Checked: <label> <reason>` to a commit message; NEVER add it by reflex or without a reason. Pre-push and CI block otherwise. A drift found later gets a new marker. WHEN the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`: run the drift sweep (follow-through §6) after the verification gates, report-only. It greps the doc surface for prose that describes the OLD behaviour and counts the `Docs-Checked:` trailers the change used.

  Sweep pending decisions (SPD, ADR-0019, binds the session the human types into: a top-level conductor, a super-conductor, an independent worker): when a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), ask ALL of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option; no tool or refused → a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) NEVER asks the human: no question tool, no `mkd` deck, no sweep; it sends what `references/decision-protocol.md` §5 escalates (§5.1 applied) and every error or blocker it cannot clear to its launcher (blocking `ask`, `escalation`, or a `BLOCKED: ` status without a dispatch), which relays, unless the human typed that request into its own session or its brief grants it in writing (then it tells its launcher what it asked and the answer). Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.
metadata:
  kind: core
---

# Agentic Dev Core — Foundation reference host

`agentic-dev-core` is the shared reference library that every workflow skill in this repo cites. It exists so doctrine (briefing template, dispatch patterns, orchestration rules, skill composition tiers, behavioral layer, model routing, topic-key conventions, TypeScript patterns) lives in one place instead of being duplicated across every `SKILL.md`.

Loading a workflow skill (e.g. `sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`, `testability-guide`) implies loading the relevant `agentic-dev-core/references/*.md` on demand — workflow skills declare a `## Dependencies` block at the top so the AI knows what to pull in.

This skill does NOT orchestrate workflows, does NOT generate files, and does NOT bootstrap a target repo. The entire framework (skills, foundation files, scripts) ships together as one repo; à la carte adoption is not supported — see "Install model" below.

---

## References cited by other skills

| File                                       | Cited by                                                                                                                   | Purpose                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `references/briefing-template.md`          | `sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`, `testability-guide` | The 7-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md`          | All workflow skills with a "Subagent Dispatch Strategy" section                                                            | Decision table + heuristic for picking Single / Sequential / Parallel / Background.             |
| `references/orchestration-doctrine.md`     | Subagents that need orchestration rules without pulling the whole `AGENTS.md`                                              | Cacheable mirror of `AGENTS.md` §"Orchestration Mode (Subagent Strategy)".                      |
| `references/skill-composition-strategy.md` | All workflow skills, plus `framework-development` if present                                                               | T1-T4 tier model + SDD boundary + composition contract.                                         |
| `references/behavioral-layer.md`           | Workflow skills that need full behavioral-layer examples beyond AGENTS.md §2                                               | Detailed examples + working-signals for THINK / SIMPLICITY / SURGICAL / GOAL-DRIVEN.            |
| `references/model-routing.md`              | Orchestrators that route phases across Opus / Sonnet / Haiku                                                               | Phase → model alias mapping with rationale.                                                     |
| `references/skill-resolver.md`             | Skills that resolve composable skills at runtime via the registry                                                          | Skill Resolver Protocol used by sub-agent launches.                                             |
| `references/skill-scaffold.md`             | `project-context` mode `context-skill`, any change that adds a T1 skill, `scripts/lint-skills.ts`                          | Contract a new T1 skill is born with: frontmatter (`metadata.kind`, `stage_owner`, `requires_capabilities`, `writes`), per-kind files and sections, the context-skill three-question test, the project-local `<aspect>-context` ownership rule, `skill-creator` as the builder. |
| `references/session-footer-contract.md`    | Every `metadata.stage_owner: true` skill                                                                                   | Chat-facing session close: evidence paths, the footer (skills / MCPs / CLIs / dev surfaces touched) and the light stage verifier read at the destination (Jira status, PR, migration, deploy SHA, `progress.md`). |
| `references/artifact-lifecycle.md`         | `sprint-development`, `autonomous-delivery`, `product-management`, `session-footer-contract.md` Part 3                     | Which status every dev artifact (Epic, Story, Bug, Tech Story / Debt, plan fields, PR, deploys) is born in, which stage moves it by which transition slug, the assignee read-back around every transition, and the unmapped-status fallback (live transitions, ONE question, live id, re-sync; never a guessed id). |
| `references/topic-key-conventions.md`      | SDD-aware skills + sprint-development                                                                                      | Engram / openspec topic-key naming conventions for SDD artifacts.                               |
| `references/adr-doctrine.md`               | `project-foundation` (SRS phase), `sprint-development` (Stage 1 planning)                                                  | When an architectural decision earns an ADR (two-gate test) + the detect → draft → record procedure. |
| `references/db-change-doctrine.md`         | `project-bootstrap` (`backend-setup.md`, `supabase-types-setup.md`), story delivery work that changes a schema, `project-adoption` (the delivery doctrine after adoption) | How an agent changes a database through the DB MCP: read `list_migrations` first, DDL only through `apply_migration`, the route per `stack.database.migrations_tool`, verify at the destination, ADR for an architecturally significant migration. |
| `references/decision-elicitation-doctrine.md` | `AGENTS.md` §2, `decision-protocol.md` §5, any skill about to ask the human to decide                                  | How to ask: §0 who may ask the human (only the session the human types into; a launched session escalates to its launcher), the threshold is weight, never count (small decisions are swept in rounds with the harness question tool, heavy ones get an `mkd` decision deck), the sweep (SPD) with its tool per harness and fallback, deck justification rules, the non-silent `mkd` gate + fallback, reading the returned contract. |
| `references/volatile-facts.md`             | `AGENTS.md` Rule #17, any skill that writes or reviews committed prose, `scripts/lint-skills.ts` + `scripts/lint-docs.ts`     | Canon for committed prose: name the owner, never its current value (count / enumeration / file:line / current-state / edit-history), the exemptions, the forensic-note split into `.context/ADR/ADR-0003-forensic-measurements-ledger.md`, the two lint families + the `volatile-ok:` escape. |
| `references/docs-follow-through.md`        | `sprint-development` (Stage 3), `project-context`, `testability-guide`, `.agents/instructions/agent-context-map.md` §4                                    | Keeping the docs in step with the change that moved them: `docs:check` + `agents:compat:check` as the mechanical half, the per-surface patch rules (patch never rewrite, cross-doc consistency, redaction, standalone-HTML text nodes only) as the judgment half, the declared couplings (`LINT.IfChange` markers, ADR-0017) and the path-scoped drift sweep. Replaces the retired `sync-ai-memory` skill. |
| `references/instructions-doctrine.md`      | `AGENTS.md` LOAD PROTOCOL, `.agents/instructions/README.md`, `agent-context-map.md`, `agent-harnesses.md`, every skill that writes `agent-project.md` (`project-context`, `project-adoption`, `testability-guide`, `git-flow-master`) | Where a sentence of the instructions goes (L0, a section, `agent-project.md`, a skill, a context map) and the one procedure for editing them: router row = ADR, eval prompts with every trigger change, complete sections (ADR-0014) |
| `references/secret-hygiene.md`             | `AGENTS.md` Rule #1, `vercel-cli`, `jira-administration`, `project-adoption`, `testability-guide`, any skill that logs in, calls an authenticated API or fills `.env` | Credentials by name, never by value: using vs exposing, the files the AI never opens, safe command shapes (presence check, loader subprocess, pushing values to a platform), who writes `.env`, the per-host deny net, the leak response. |
| `references/typescript-patterns.md`        | `sprint-development`, code-writing skills                                                                                  | Fallback TS conventions when no project-specific dev guide exists.                              |

When a skill cites one of these, it includes a Dependencies block at the top (see next section) so the AI knows to load `agentic-dev-core` before continuing.

---

## Dependency declaration for downstream skills

Every workflow skill that cites `agentic-dev-core/references/*.md` should declare it explicitly so the AI knows what to load on demand. Example block to add near the top of the skill's `SKILL.md`:

```markdown
## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- agentic-dev-core/references/briefing-template.md
- agentic-dev-core/references/dispatch-patterns.md
```

The block is documentation — the AI reads it and pulls the cited files. There is no automated wiring: skills are markdown, not code.

---

## Composable Skills (auto-resolved when this reference host is consulted)

`agentic-dev-core` is a passive reference host — it is not invoked directly. The composition contract below applies when **a downstream workflow skill** (`sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, etc.) cites one of this skill's references and the cited reference touches a community-skill category.

Contract follows `references/skill-composition-strategy.md`.

Steps (executed by the consuming workflow skill, not by `agentic-dev-core` itself):

1. Read `complementary_categories` from this skill's frontmatter (`language`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply when consulting agentic-dev-core/references/typescript-patterns.md? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents that consume `references/typescript-patterns.md`, inject a `## Composable Skills` block per strategy doc §5.2.

Expected matches (illustrative — actual list depends on what the user has installed):

| Category   | Likely matches                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `language` | `typescript-advanced-types` (T3) — augments `references/typescript-patterns.md` when authoring TS in workflow skills |

Skip the resolution step only if neither the session skill list nor the `.agents/skills/` folder can be read. When skipped, the consuming workflow skill logs `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in its result envelope (per strategy doc §3.4).

---

## Install model

The layer installs as one unit. The workflow skills under `.agents/skills/` depend on foundation files that live at the repo root (`AGENTS.md`, `.agents/`, `scripts/`, `package.json`, `tests/`) and on shared references under `agentic-dev-core/references/`. Installing only a subset of skills (e.g. copying one skill directory in isolation) leaves those skills without their dependencies and they will not function. There are two supported install paths, both owned by the scaffolder `create-agentic-dev` (`packages/create-agentic-dev/`):

| Starting point | Install | Then |
|---|---|---|
| New project | `bunx create-agentic-dev@latest <name>` | `/project-foundation`, `/project-bootstrap` |
| Existing app | `bunx create-agentic-dev@latest --adopt` from the app's repo root (the updater's `--adopt`, `cli/lib/updater-adopt.ts`) | `/project-adoption` |

User-facing detail: `README.md` → "Scaffold a new project" and "Adopt an existing app", `INSTALLER.md`. No per-skill scaffolding action is provided by this skill: the skill set is intentionally inseparable from the foundation.

---

## What this skill does NOT cover

`agentic-dev-core` does not:

- Provide a bootstrap or init action — the layer installs whole: `create-agentic-dev` for a new project, `create-agentic-dev --adopt` then `/project-adoption` for an existing app.
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
- Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
- Adapt the framework to a specific stack (that belongs to `/project-bootstrap` on a new project, `/project-adoption` on an existing app).
- Sync project-specific facts in `AGENTS.md` (that belongs to the docs follow-through, `references/docs-follow-through.md`, run inside the change that moved the fact).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).
- Run any external command — no `bun install`, no `git`, no `gh`.

Secret hygiene (Critical Rule #1, binds every skill and subagent): use a secret only by its variable NAME (`$VAR` in the shell, a name in the MCP loader's `--filter` list); never open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, never print a value (`printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`); check presence with `bun run setup:doctor --json` (set / missing per name); never run `varlock load`, even `--agent`, against a schema `bun run vars:schema:check` has not passed (a scratch schema is banned: `--agent` redacts only `@sensitive` items). The AI never writes a secret into `.env` (the human types it); a non-sensitive value (URL, project key, flag, port) it may write when asked, only through `bun run env:set KEY=value`. Safe command shapes + leak response: `references/secret-hygiene.md`.

Instructions maintenance (ADR-0014, binds every skill and subagent): every change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list follows `references/instructions-doctrine.md`: place each sentence with its §2 decision tree, run its §6 procedure, close with `bun run instructions:check`. NEVER paste section prose into `AGENTS.md`, NEVER add, change or remove a router row without the ADR that decides it (`bun run instructions:check --accept-router ADR-NNNN`), and fix a trigger miss in the section's `triggers:` plus a labelled prompt in `cli/lib/fixtures/instruction-router-eval.json`, never by relabelling the set.

Documentation contracts (ADR-0017, binds every skill and subagent that changes this boilerplate): close every change that adds, renames or retires a skill, a `package.json` script or a doc path, OR changes a behaviour a page describes, with the docs follow-through (`references/docs-follow-through.md`), decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) included, in the same PR. WHEN an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line): update EVERY page its `LINT.ThenChange(...)` names in the same push. Only when the documented behaviour did not change, add `Docs-Checked: <label> <reason>` to a commit message; NEVER add it by reflex or without a reason. Pre-push and CI block otherwise. A drift found later gets a new marker. WHEN the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`: run the drift sweep (follow-through §6) after the verification gates, report-only. It greps the doc surface for prose that describes the OLD behaviour and counts the `Docs-Checked:` trailers the change used.

If a user invokes this skill expecting a bootstrap action, route them to the install path that matches their starting point (§Install model): there is no per-skill scaffolding.
