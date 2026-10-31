---
name: project-adoption
description: "Teach the agentic layer an EXISTING application after the adoption install (`bun <boilerplate clone>/cli/update-boilerplate.ts --adopt`) delivered the tooling: a sealed no-write analysis of the app's real stack, scripts, schema source, CI, hooks, instruction files, env files and issue tracker, then one plan file waiting for explicit approval, then writes to agentic surfaces only (`.agents/project.yaml` identity + `stack:` block + environments, `.env` slots, Jira catalogs, the pending instruction merge, protected paths), then a fail-fast verification that the app still builds, lints and tests exactly as before. Idempotent: detection signals run first as the work list and last as the report; a rerun on an adopted repo says nothing to do, and mode `check` is a read-only drift report. Triggers on: adopt this app, adopt an existing app, adopción, adoptar la app existente, brownfield adoption, project adoption, onboard the agentic layer to my app, configurar el boilerplate sobre mi app, after --adopt, la adopción quedó instalada, adoption drift check, is the adoption still accurate. Do NOT use for: a new project from scratch (use /project-foundation then /project-bootstrap), installing the files into the app (that is the updater `--adopt` run, which this skill never replaces), the business maps themselves (/project-context), the branching strategy (/git-flow-master Strategy Setup), the app's design identity (/design-system extract), or creating Jira fields, workflows or issues (/jira-administration, /product-management)."
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [issue-tracker, meta-skill]
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with "## Compact Rules" and references/adoption-workflow.md §Refusal list.
compact_rules: |
  - Exactly ONE mode per run: `adopt` (default, Phases 0-9 in `references/adoption-workflow.md`) or `check` (Phase 0 signals + `bun run setup:doctor` stack drift, read-only, writes nothing). Forward the rest of `$ARGUMENTS` unchanged.
  - Entry gate: `.template/installer.lock.json` records `adopted: true` AND the working tree is clean (`git status --porcelain` empty, the adoption install already committed). Missing lock = STOP, the files were never installed: run the updater with `--adopt` first. A greenfield lock (`adopted` absent) = STOP, this repo was scaffolded: `/project-bootstrap` + `bun run agents:setup` own it.
  - Phases 0-2 are SEALED: no tracked file changes. The seal is measured: `git status --porcelain` after Phase 2 differs from Phase 0 only by `.context/reports/project-adoption-plan.md`. Phase 3 starts only after the user approves that plan (`Status: PENDING APPROVAL` -> `APPROVED`) in this run; a plan from an earlier run is resumed, never rewritten.
  - v1 support set is `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts` (Next.js + Postgres family, bun). Anything outside it STOPS at analysis with the named field and value (owner decisions OD2, OD3); never adapt an unsupported stack, never switch a package manager.
  - One app per adoption: `stack.app_root` names it (OD6). A monorepo with several Next.js apps = ask which one; never adopt two in one run.
  - REFUSAL LIST, binding on every write: never write or delete a file under `stack.app_root` that existed before adoption; never run a migration, apply SQL, change RLS, seed data or open a database connection in any environment (the adoption itself never touches a database, OD4 = C governs later delivery work, not this skill); never add, remove, upgrade or downgrade an app dependency or regenerate its lockfile; never edit CI workflows, `README.md`, `tsconfig.json`, eslint / prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts` or an app `package.json` script; never change git history, remotes, branch protection or rulesets; never create Jira projects, fields, workflows or issues; never push; never write a credential value anywhere but `.env`.
  - Writes are limited to agentic surfaces named in the approved plan: `.agents/project.yaml` (identity, `stack:` through `bun run agents:setup --stack`, environments, `updater.protected_paths`), `.env` (values the user supplies), the Jira catalogs under `.agents/`, a framework skill the app had copied in by hand (replaced only by upstream's copy saved under `.agents/prompts/adopt-upstream/`, on its own approval line, the app's copy backed up first), `api/openapi*` only when absent before adoption, the instruction merge the updater saved (`.agents/prompts/adopt-instructions.md`, applied verbatim on its own approval line, originals backed up under `.backups/project-adoption/`), the app's `<app>-context` skill (its `description` only; the preserved `references/app-instructions.md` is never rewritten, a legacy `## 0.` block moves into it verbatim on its own line) and its pointer in `.agents/instructions/agent-project.md`, the plaintext MCP credential copies `bun run harness:env` retires, the plan file and `.session/project-adoption/`. Full allowlist: `references/adoption-workflow.md` §Refusal list.
  - Collisions are refused file by file (OD7): a path the app already owned stays the app's, gets an `updater.protected_paths` entry, and is reported; never `take upstream` on an adopted repo, with ONE exception: the app's hand copy of a framework skill (a folder upstream ships under `.agents/skills/`) is left unprotected and its row proposes `take upstream`, applied in Phase 3 from the saved copy on its own approval line.
  - Detection never guesses: an undetected value is asked in the Phase 1 questionnaire or recorded under `## Discovery Gaps`, never invented. A null `stack.scripts.<x>` means skip and say so.
  - App intact = the app's own `build` / `lint` / `types` / `test` exit codes after Phase 7 equal the Phase 1 baseline. Run an app script that may reach a shared database or a paid API only when the questionnaire confirmed it is safe; otherwise record it as not measured.
  - Fail-closed prerequisites a live app may lack (the automation identity in `testing.automation_identity`, `autonomous_delivery.automation_gh_account`, a dedicated DB role) are listed in the plan as owed by the team and NEVER created by this skill.
  - Product docs of an adopted app are the business maps + glossary (OD5): never invent a PRD or SRS: `/sprint-development` accepts the maps in their place, and `/project-foundation` Discovery-only adds the dev guide and the glossary.
  - Close with the signal table, the plan marked `Status: COMPLETED` with its results block, and the hand-off: `/project-context refresh-all` (maps from code) in a fresh session, then `/project-foundation` Discovery-only (dev guide + glossary), `/git-flow-master` Strategy Setup, optional `/design-system extract` and `/testability-guide`. Never auto-chain them; the commit is proposed through `/git-flow-master`, never made silently.
metadata:
  kind: workflow
  stage_owner: true
---

# Project Adoption

Two layers bring agentic-dev into an existing application. The updater's `--adopt` run is the INSTALL layer: it delivers the tooling files without overwriting anything the app owns and stops. This skill is the UNDERSTANDING layer: it reads the app, writes one plan, waits for approval, then fills the agentic surfaces (identity, the `stack:` descriptor, environments, tracker catalogs, protected paths) so every other skill reads the app's real stack instead of the boilerplate defaults. Nothing of the app's code, schema, CI or dependencies changes.

Invocation: `/project-adoption` (mode `adopt`) or `/project-adoption check` on Claude Code; "load project-adoption" or "load project-adoption, mode check" in prose on OpenCode and Codex.

## Mode routing

Choose exactly one mode: the first token of `$ARGUMENTS` when it names a mode below, otherwise the trigger phrase, otherwise `adopt`.

| Mode | Trigger phrases | Does | Writes |
|---|---|---|---|
| `adopt` | adopt this app, adopción, after `--adopt`, project adoption | Phases 0-9 of `references/adoption-workflow.md` | only after plan approval, only agentic surfaces |
| `check` | adoption drift check, is the adoption still accurate, re-check the stack | Phase 0 signal table + `bun run setup:doctor` stack section (drift between `stack:` and the repo) | nothing |

`check` on a repo with any `PENDING` signal ends by naming `adopt` as the next step; it never starts it.

## Compact Rules

The `compact_rules` frontmatter block is the authoritative copy (the registry reads it verbatim). In short:

- One mode per run; `check` writes nothing.
- Entry gate: installer lock says `adopted: true` and the tree is clean; otherwise STOP with the command that fixes it.
- Phases 0-2 sealed (measured with `git status --porcelain`); writes only after the plan is approved in this run.
- Outside `V1_SUPPORTED` (`cli/lib/stack-descriptor.ts`) = STOP at analysis with the reason. One app per run (`stack.app_root`).
- The refusal list (`references/adoption-workflow.md` §Refusal list) binds every write and every subagent briefing.
- App scripts measured before and after; equal exit codes or the run is not done.
- Team-owed prerequisites are reported, never created. No invented PRD / SRS. No auto-chaining.

**Read full SKILL.md when**: the entry gate fails in an unexpected way, the app's stack is outside the v1 set, the instruction merge is pending, or a verification step disagrees with the baseline.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before Phase 0. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter (`issue-tracker`, `meta-skill`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify tier per strategy doc §2.
4. Apply the threshold rule per strategy doc §3.2: T1 / T3 load silently; T4 ASK once (`"Detected <skill> (T4). Apply for this run? Y/N"`) and cache the answer.
5. Inject a `## Composable Skills` block per strategy doc §5.2 into every subagent briefing.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `issue-tracker` | `/acli` | Owns the issue-tracker tool: auth status and site checks behind the Phase 1 reachability probe and the Phase 5 catalog sync. Load before any Jira operation. |
| `meta-skill` | `/git-flow-master` | Owns the commit proposal at close. This skill never commits, pushes or touches branch protection by itself. |

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). This skill adopts the progress-only variant: the canonical plan is the committed `.context/reports/project-adoption-plan.md`, read by the team; under `.session/` it writes `progress.md` only.
>
> **Session close**: every phase ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

This skill is **project-scope**: no `<scope>` segment. Session state lives at `.session/project-adoption/progress.md` per `agentic-dev-core/references/session-management.md` §3 + §9; `progress.md` §"Cross-references" cites the plan path.

## Phase 0 — Resume check + detection signals (MANDATORY, inline, no writes)

1. **Resume.** If `.session/project-adoption/progress.md` exists, read its tail and the plan file; surface the last completed phase, the plan `Status:`, and the next phase; offer **resume** / **restart** (archive `.session/project-adoption/` to `.session/.archive/<YYYY-MM-DD>-project-adoption-project-aborted/`, keep the plan file) / **abort**, and WAIT.
2. **Entry gate.** Read `.template/installer.lock.json` and run `git status --porcelain`. Apply the gate in `compact_rules`; a failure STOPS with the exact command that fixes it.
3. **Signals.** Run every detection signal of `references/adoption-workflow.md` §Detection signals and print the `PENDING` / `ADOPTED` table. `PENDING` rows are this run's work list; `ADOPTED` rows are skipped.
4. **Nothing to do.** Every row `ADOPTED` -> report "Adoption already complete, nothing to do" with the table and stop. Mode `check` stops here in every case, after appending the `setup:doctor` stack section.

Phase 0 is inline: no subagent dispatch, so resume-vs-fresh is deterministic.

---

## Phase map

```
+- SEALED: NO TRACKED WRITES ------------------------------------------+
| Phase 0  resume + entry gate + detection signals (work list)         |
| Phase 1  analysis: fingerprint, v1 gate, baseline, questionnaire     |
| Phase 2  .context/reports/project-adoption-plan.md                    |
|          Status: PENDING APPROVAL  ->  WAIT                          |
+----------------------------------------------------------------------+
                 | explicit approval in this run
+- WRITES: AGENTIC SURFACES ONLY --------------------------------------+
| Phase 3  identity + stack + environments + protected paths           |
| Phase 4  credential slots (.env) + session restart                   |
| Phase 5  issue-tracker catalogs from the app's own instance          |
| Phase 6  app instructions -> <app>-context skill (own lines) + compat|
| Phase 7  API contract sync (only when its output paths are absent)   |
| Phase 8  fail-fast verification + app baseline comparison            |
| Phase 9  signals as report, plan COMPLETED, hand-off                 |
+----------------------------------------------------------------------+
```

Every phase's steps, commands and pass conditions: `references/adoption-workflow.md`. The plan file's sections: `references/plan-template.md`.

---

## Subagent Dispatch Strategy

Every dispatch uses the 7-component briefing (`agentic-dev-core/references/briefing-template.md`); the pattern per phase follows `agentic-dev-core/references/dispatch-patterns.md`. Component 7 (Rules) of EVERY briefing carries the refusal list verbatim from `compact_rules`, plus Critical Rules #1 (credentials from `.env`), #5 (git history), #7 (read before edit), #10 (scripts from `package.json`) and #13 (no global discards).

| Phase | Pattern | Subagent role |
|---|---|---|
| 0 Resume + signals | inline | orchestrator only |
| 1 Analysis | Parallel cap=3 | three read-only analysts: (a) stack + scripts + database layout (`bun run agents:setup --stack --dry-run --non-interactive`, `package.json`, migrations dir), (b) repo conventions (CI, hooks, instruction files, env files, adopt parity rows), (c) issue-tracker reachability. Each returns facts with evidence paths, never a proposal written to disk |
| 1 Baseline | Single | runs the app's own `build` / `lint` / `types` / `test` (the safe ones) and returns exit codes + first errors |
| 2 Plan | inline | orchestrator authors the plan from the analysts' facts and the questionnaire answers |
| 3-7 Writes | Sequential | one writer per phase, each briefed with the approved plan rows for that phase only |
| 8 Verification | Sequential, fail-fast | one verifier running the ordered gate; stops at the first failure |
| 9 Close | inline | orchestrator re-runs the signals and closes the plan |

A subagent report that claims a write is verified at the destination (Critical Rule #16): re-read the yaml, re-run the signal, re-parse the file.

---

## Hand-offs

| After adoption | Skill | Session |
|---|---|---|
| Business maps read from the app's code and schema | `/project-context refresh-all` | a fresh one (the maps are token-heavy) |
| Dev guide + domain glossary, which complete the app's product docs (`/sprint-development` reads them in place of a PRD / SRS) | `/project-foundation` Discovery-only | after the maps |
| The project's own branching strategy and host protection | `/git-flow-master` Strategy Setup | its own, read-only first |
| `DESIGN.md` from the live theme | `/design-system extract` | optional |
| In-app `/qa` page + credentials artifact | `/testability-guide` | optional |
| DB types into `stack.database.types_path` when absent | `/project-bootstrap` add-on `supabase-types-setup` | optional, through the DB MCP under the delivery doctrine (`agentic-dev-core/references/db-change-doctrine.md`) |
| Commit of the adoption writes | `/git-flow-master` | this one, proposed at close |

---

## Anti-patterns: NEVER do these

- **A1.** NEVER treat a missing installer lock as permission to adopt by hand: copying skills into an app by hand (or gitignoring `.agents/`) is the failure this skill exists to replace.
- **A2.** NEVER run `/project-bootstrap` base phases on an adopted app: every step there creates, and an existing app has nothing to create.
- **A3.** NEVER infer the `stack:` block from the boilerplate defaults: a value with no evidence in the app is a question or a gap.
- **A4.** NEVER sync Jira catalogs with the UPEX reference flag on a foreign instance: the catalogs describe the app's own Jira.
- **A5.** NEVER rewrite the app's instruction text: the updater moved it verbatim into the `<app>-context` skill and saved the `AGENTS.md` merge; apply that file or leave the row blocking. Only the skill's `description` is yours to sharpen.
- **A6.** NEVER call the run done with an app script whose exit code moved from its baseline.
- **A7.** NEVER paste the app's instruction text back into `AGENTS.md`: every session would pay for it, and an adopted app's L0 has a byte ceiling (`bun run instructions:check`). It lives in the `<app>-context` skill, reached by one router row.

---

## Verification

Phase 8 (`references/adoption-workflow.md` §Phase 8) is the gate. On success the orchestrator marks the plan `Status: COMPLETED`, appends the results block, writes the last `progress.md` entry, archives `.session/project-adoption/` per `agentic-dev-core/references/session-management.md` §8 and calls `mem_session_summary` with the plan path.
