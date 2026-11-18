---
name: agentic-dev-core
description: 'Shared doctrine host for the workflow skills: briefing, dispatch, decisions, secrets, ADRs, DB changes. Use when editing AGENTS.md or an instruction section; adding a skill; closing a change with the docs follow-through; briefing a subagent; deciding whether to ask the person; recording an ADR. Not for onboarding (agentic-dev-onboard).'
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation
complementary_categories:
  - language
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). One rule per line, each self-contained, because a briefing
# receives them without the sentence above. Keep in sync with "What this skill
# does not cover" in the body below.
compact_rules: |
  `agentic-dev-core` is a passive reference library: it creates or modifies no file, runs no external command (no `bun install`, `git` or `gh`) and provides no bootstrap or init action. The layer installs whole: `create-agentic-dev` for a new project, `create-agentic-dev --adopt` then `/project-adoption` for an existing app.
  Work that looks adjacent belongs to another skill. `.context/` files go to `/agentic-dev-onboard` and `/project-foundation`. Tests, fixtures and test components go to `/unit-testing` and any test-automation skill. Adapting the framework to a stack goes to `/project-bootstrap` (new project) or `/project-adoption` (existing app). Project facts in `AGENTS.md` go to the docs follow-through (`references/docs-follow-through.md`), run inside the change that moved the fact. OpenAPI and API schemas go to `bun run api:sync`.

  Secret hygiene (Critical Rule #1, binds every skill and subagent): use a secret only through its variable name (`$VAR` in the shell, a name in the MCP loader's `--filter` list). Do not open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, and do not print a value (`printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`). Check presence with `bun run setup:doctor --json` (set or missing per name). Do not run `varlock load`, even with `--agent`, against a schema `bun run vars:schema:check` has not passed: a scratch schema is banned because `--agent` redacts only `@sensitive` items. The human types every secret into `.env`; the AI writes a non-sensitive value (URL, project key, flag, port) only when asked, and only through `bun run env:set KEY=value`. Safe command shapes and the leak response: `references/secret-hygiene.md`.

  Instructions maintenance (ADR-0014, binds every skill and subagent): any change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list follows `references/instructions-doctrine.md`. Place each sentence with its §2 decision tree, run its §6 procedure and close with `bun run instructions:check`. Section prose stays out of `AGENTS.md`. A router row changes only with the ADR that decides it (`bun run instructions:check --accept-router ADR-NNNN`). A trigger miss is fixed in the section's `triggers:` plus a labelled prompt in `cli/lib/fixtures/instruction-router-eval.json`, and the eval set is never relabelled to hide it.

  GUARD architecture (ADR-0023, binds every skill and subagent that writes or reviews app code): code lives in four layers (`src/platform`, `src/adapters`, `src/features/<name>`, `src/app`) that import only downward, each feature has one door (`index.ts`, imported as `@features/<name>`), and `guard-manifest.json` is read before creating a feature or an action. Layers, rules R1 to R6, the layer map and the example: `references/guard-architecture.md`.

  Correction to check (ADR-0023, binds every skill and subagent): when a review finding repeats, the first remedy is a `guard` lint rule or a guard-manifest check whose message names the doctrine and the root-cause fix. Prose is the remedy only for what a machine cannot judge.

  Documentation contracts (ADR-0017, binds every skill and subagent that changes this boilerplate): close every change that adds, renames or retires a skill, a `package.json` script or a doc path, or that changes a behaviour a page describes, with the docs follow-through (`references/docs-follow-through.md`), decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) included, in the same PR. When an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line), update every page its `LINT.ThenChange(...)` names in the same push. Add `Docs-Checked: <label> <reason>` to a commit message only when the documented behaviour did not change, and never by reflex or without a reason; pre-push and CI block otherwise. A drift found later gets a new marker. When the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, run the drift sweep (follow-through §6) after the verification gates. It is report-only: it greps the doc surface for prose that describes the old behaviour and counts the `Docs-Checked:` trailers the change used.

  Sweep pending decisions (SPD, ADR-0019, binds the session the human types into: a top-level conductor, a super-conductor, an independent worker): when a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), ask all of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option. With no tool, or a refused call, use a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) never asks the human: no question tool, no `mkd` deck, no sweep. It sends what `references/decision-protocol.md` §5 escalates (§5.1 applied) and every error or blocker it cannot clear to its launcher (`ask`, then it ends its turn; `escalation`; or a `BLOCKED: ` status without a dispatch), which relays it. The one exception is a request the human typed into that session, or one its brief grants in writing; the session then tells its launcher what it asked and the answer. Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.
metadata:
  kind: core
---

# Agentic Dev Core: foundation reference host

`agentic-dev-core` is the shared reference library the workflow skills in this repo cite. Doctrine (briefing template, dispatch patterns, orchestration rules, skill composition tiers, behavioral layer, model routing, topic-key conventions, TypeScript patterns) lives here once instead of being copied into every `SKILL.md`.

A workflow skill (`sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`, `testability-guide`) pulls the `references/*.md` files it needs on demand. It names them in a `## Dependencies` block at its top, so the AI knows what to load.

The skill is passive. It does not orchestrate workflows, generate files or bootstrap a target repo. The framework (skills, foundation files, scripts) ships as one repo and is adopted whole, as "Install model" below explains.

---

## References cited by other skills

| File | Cited by | Purpose |
| ---- | -------- | ------- |
| `references/briefing-template.md` | `sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`, `testability-guide` | The 7-component subagent briefing template, with filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table and heuristic for picking Single, Sequential, Parallel or Background. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `AGENTS.md` | Cacheable mirror of `AGENTS.md` §3 (Orchestration Mode). |
| `references/skill-composition-strategy.md` | All workflow skills, plus `framework-development` if present | T1-T4 tier model, SDD boundary and composition contract. |
| `references/behavioral-layer.md` | Workflow skills that need the full behavioral-layer examples beyond `AGENTS.md` §2 | Worked examples and working signals for the four working principles. |
| `references/model-routing.md` | Orchestrators that route phases across Opus, Sonnet and Haiku | Phase-to-model alias mapping with the rationale. |
| `references/skill-resolver.md` | Skills that resolve composable skills at runtime through the registry | The Skill Resolver Protocol used by sub-agent launches. |
| `references/skill-scaffold.md` | `project-context` mode `context-skill`, any change that adds a T1 skill, `scripts/lint-skills.ts` | How a skill is written (the two canon skills), the contract a new T1 skill is born with (frontmatter with `metadata.kind`, `stage_owner`, `requires_capabilities` and `writes`; files and sections per kind), the context-skill three-question test, the project-local `<aspect>-context` ownership rule, the invocation classes and `skill-creator` as the builder. |
| `references/session-footer-contract.md` | Every `metadata.stage_owner: true` skill | Chat-facing session close: evidence paths, the footer (skills, MCPs, CLIs and dev surfaces touched) and the light stage verifier read at the destination (Jira status, PR, migration, deploy SHA, `progress.md`). |
| `references/artifact-lifecycle.md` | `sprint-development`, `autonomous-delivery`, `product-management`, `session-footer-contract.md` Part 3 | The status each dev artifact (Epic, Story, Bug, Tech Story / Debt, plan fields, PR, deploys) is born in, which stage moves it by which transition slug, the assignee read-back around every transition, and the unmapped-status fallback (live transitions, one question, live id, re-sync, never a guessed id). |
| `references/topic-key-conventions.md` | SDD-aware skills, `sprint-development` | Engram and openspec topic-key naming for SDD artifacts. |
| `references/adr-doctrine.md` | `project-foundation` (SRS phase), `sprint-development` (Stage 1 planning) | When an architectural decision earns an ADR (the three-gate test), plus the detect, draft and record procedure. |
| `references/db-change-doctrine.md` | `project-bootstrap` (`backend-setup.md`, `supabase-types-setup.md`), story delivery work that changes a schema, `project-adoption` (the delivery doctrine after adoption) | How an agent changes a database through the DB MCP: read `list_migrations` first, write DDL only through `apply_migration`, take the route `stack.database.migrations_tool` names, verify at the destination, and write an ADR for an architecturally significant migration. |
| `references/decision-elicitation-doctrine.md` | `AGENTS.md` §2, `decision-protocol.md` §5, any skill about to ask the human to decide | How to ask. §0 says who may ask the human (only the session the human types into; a launched session escalates to its launcher). The threshold is weight, never count: small decisions are swept in rounds with the harness question tool, heavy ones get an `mkd` decision deck. Also the sweep (SPD) with its tool per harness and fallback, the deck justification rules, the `mkd` gate with its fallback, and how to read the returned contract. |
| `references/volatile-facts.md` | `AGENTS.md` Rule #17, any skill that writes or reviews committed prose, `scripts/lint-skills.ts`, `scripts/lint-docs.ts` | Canon for committed prose: name the owner, never its current value (count, enumeration, file:line, current-state, edit history), the exemptions, the forensic-note split into `.context/ADR/ADR-0003-forensic-measurements-ledger.md`, the two lint families and the `volatile-ok:` escape. |
| `references/docs-follow-through.md` | `sprint-development` (Stage 3), `project-context`, `testability-guide`, `.agents/instructions/agent-context-map.md` §4 | Keeping the docs in step with the change that moved them. `docs:check` and `agents:compat:check` are the mechanical half. The per-surface patch rules (patch, never rewrite; cross-doc consistency; redaction; text nodes only in standalone HTML) are the judgment half, with the declared couplings (`LINT.IfChange` markers, ADR-0017) and the path-scoped drift sweep. It replaces the retired `sync-ai-memory` skill. |
| `references/instructions-doctrine.md` | `AGENTS.md` LOAD PROTOCOL, `.agents/instructions/README.md`, `agent-context-map.md`, `agent-harnesses.md`, every skill that writes `agent-project.md` (`project-context`, `project-adoption`, `testability-guide`, `git-flow-master`) | Where a sentence of the instructions goes (L0, a section, `agent-project.md`, a skill, a context map) and the one procedure for editing them: a router row needs an ADR, every trigger change brings eval prompts, a section ships complete (ADR-0014). |
| `references/secret-hygiene.md` | `AGENTS.md` Rule #1, `vercel-cli`, `jira-administration`, `project-adoption`, `testability-guide`, any skill that logs in, calls an authenticated API or fills `.env` | Credentials by name, never by value: using versus exposing, the files the AI never opens, safe command shapes (presence check, loader subprocess, pushing values to a platform), who writes `.env`, the per-host deny net and the leak response. |
| `references/guard-architecture.md` | `sprint-development`, `unit-testing`, `project-bootstrap`, `project-adoption`, `pr-review-lead`, `AGENTS.md` Rule #18, `.agents/instructions/agent-code-quickref.md` | GUARD, the product architecture: four layers with one direction, one door per feature, the manifest registry, rules R1 to R6 with the check behind each, the configurable layer map, severity, the example feature and the bridge to QA ATCs. |
| `references/fleet-launch-seam.md` | `sprint-development` (fleet mode), `autonomous-delivery` (Phase 3 workers), `product-management` (fan-out) | How this repo's workflow skills hand work to a fleet: `launch.txt`, the shared prompt, the gated lines, scope and topology per skill. The doctrine is the user-level `/agent-orchestration`. |
| `references/fleet-provisioning.md` | a conductor before any worker launch, `git-flow-master` (`worktrees.md`) | What a fresh worktree of this repo lacks, `bun run worktree:provision`, the `orca.yaml` hooks and the audit before removal. |
| `references/fleet-project-profile.md` | a conductor of this repo, once per Run | What this repo fills into `/agent-orchestration`: profile keys, routine recipes, identity and trailers, conductor-only operations, `ROUTE-SCOPE`, the `COMMON.md` fill-ins. |
| `references/typescript-patterns.md` | `sprint-development`, code-writing skills | Fallback TS conventions when no project-specific dev guide exists. |

A skill that cites one of these carries a Dependencies block at the top (next section), so the AI loads `agentic-dev-core` before continuing.

---

## Dependency declaration for downstream skills

Every workflow skill that cites `agentic-dev-core/references/*.md` declares it, so the AI knows what to load on demand. Add this block near the top of the skill's `SKILL.md`:

```markdown
## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- agentic-dev-core/references/briefing-template.md
- agentic-dev-core/references/dispatch-patterns.md
```

The block is documentation: the AI reads it and pulls the cited files. Skills are markdown, not code, so nothing wires it automatically.

---

## Composable Skills (auto-resolved when this reference host is consulted)

`agentic-dev-core` is a passive reference host and nothing invokes it directly. The composition contract below applies when a downstream workflow skill (`sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap` and the rest) cites one of this skill's references and that reference touches a community-skill category. Contract: `references/skill-composition-strategy.md`.

The consuming workflow skill runs these steps, not `agentic-dev-core` itself:

1. Read `complementary_categories` from this skill's frontmatter (`language`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each matched skill by tier (strategy doc §2).
4. Apply the threshold rule (strategy doc §3.2):
   - T1 and T3 matches load silently. Cache them for the session.
   - A T4 match is asked about once: `"Detected <skill> (T4). Apply when consulting agentic-dev-core/references/typescript-patterns.md? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents that consume `references/typescript-patterns.md`, inject a `## Composable Skills` block per strategy doc §5.2.

With nobody at the keyboard (a supervised worker or a routine), the T4 question is not asked. The session skips the T4 skill and says so in its report.

Expected matches (illustrative; the real list depends on what the user has installed):

| Category | Likely matches |
| -------- | -------------- |
| `language` | `typescript-advanced-types` (T3), which augments `references/typescript-patterns.md` when authoring TS in workflow skills |

Skip the resolution step only when neither the session skill list nor the `.agents/skills/` folder can be read. The consuming workflow skill then logs `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in its result envelope (strategy doc §3.4).

---

## Install model

The layer installs as one unit. The workflow skills under `.agents/skills/` depend on foundation files at the repo root (`AGENTS.md`, `.agents/`, `scripts/`, `package.json`, `tests/`) and on the shared references under `agentic-dev-core/references/`. A subset of skills copied in isolation lacks those dependencies and will not work. The scaffolder `create-agentic-dev` (`packages/create-agentic-dev/`) owns the two supported install paths:

| Starting point | Install | Then |
|---|---|---|
| New project | `bunx create-agentic-dev@latest <name>` | `/project-foundation`, `/project-bootstrap` |
| Existing app | `bunx create-agentic-dev@latest --adopt` from the app's repo root (the updater's `--adopt`, `cli/lib/updater-adopt.ts`) | `/project-adoption` |

User-facing detail: `README.md` ("Scaffold a new project" and "Adopt an existing app") and `INSTALLER.md`. The skill set is inseparable from the foundation, so this skill offers no per-skill scaffolding.

---

## What this skill does not cover

The `compact_rules` in the frontmatter are the full statement: the skill is passive, adjacent work belongs to the skill that owns it, and the secret, instructions, documentation and decision rules bind whoever consults it. A user who invokes this skill expecting a bootstrap action goes to the install path that matches their starting point (Install model above).
