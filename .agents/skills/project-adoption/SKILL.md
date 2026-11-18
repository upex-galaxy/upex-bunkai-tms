---
name: project-adoption
description: "Adopts an existing app into the agentic layer after the `--adopt` install, with one approved plan and no change to the app. Use when adopting a brownfield app, or checking whether an adoption has drifted. For a new project use /project-foundation, then /project-bootstrap."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [issue-tracker, meta-skill]
# compact_rules is read verbatim by scripts/build-skill-registry.ts (frontmatter first, no
# truncation). It is the authoritative copy; the "## Compact Rules" body section only points at
# it, and references/adoption-workflow.md §Refusal list holds the full allowlist.
compact_rules: |
  - Run exactly one mode: `adopt` (the default, Phases 0 to 9 in `references/adoption-workflow.md`) or `check` (the Phase 0 signals plus the `bun run setup:doctor` stack drift section; read-only). Forward the rest of `$ARGUMENTS` unchanged.
  - Entry gate: `.template/installer.lock.json` records `adopted: true` and `git status --porcelain` is empty (the adoption install is committed). A missing lock means the files were never installed: stop and say to run `bun <boilerplate clone>/cli/update-boilerplate.ts --adopt` first. A greenfield lock (`adopted` absent) means the repo was scaffolded: stop, because `/project-bootstrap` and `bun run agents:setup` own it.
  - Phases 0 to 2 are sealed, with no tracked file changing. The seal is measured: `git status --porcelain` after Phase 2 differs from Phase 0 only by `.context/reports/project-adoption-plan.md`. Phase 3 starts once the person approves that plan in this run (`Status: PENDING APPROVAL` becomes `APPROVED`). Resume a plan from an earlier run and never rewrite it.
  - The v1 support set is `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts` (Next.js plus the Postgres family, bun). Anything outside it stops at analysis and names the field and value (owner decisions OD2, OD3), because adapting an unsupported stack or switching a package manager is what this limit prevents.
  - One app per adoption: `stack.app_root` names it (OD6). A monorepo with several Next.js apps means you ask which one, and you never adopt two in one run.
  - The refusal list binds every write and every briefing. Never write or delete a file under `stack.app_root` that existed before adoption. Never run a migration, apply SQL, change RLS, seed data or open a database connection in any environment (the adoption never touches a database; OD4 = C governs later delivery work, not this skill). Never add, remove, upgrade or downgrade an app dependency or regenerate its lockfile. Never edit CI workflows, `README.md`, `tsconfig.json`, eslint or prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts` or an app `package.json` script. Never change git history, remotes, branch protection or rulesets. Never create Jira projects, fields, workflows or issues. Never push. Never write a secret value anywhere, `.env` included: the person types secrets, and `.env` takes non-sensitive values only.
  - Writes stay on the agentic surfaces the approved plan names: `.agents/project.yaml` (identity, `stack:` through `bun run agents:setup --stack`, environments, `updater.protected_paths`), non-sensitive `.env` values, the Jira catalogs under `.agents/`, a hand-copied framework skill (upstream's copy saved under `.agents/prompts/adopt-upstream/` only, on its own approval line, the app's copy backed up first), `api/openapi*` when absent before adoption, the saved instruction merge (`.agents/prompts/adopt-instructions.md`, own approval line, originals under `.backups/project-adoption/`), the app's `<app>-context` skill (its `description` only; a legacy `## 0.` block moves verbatim into `references/app-instructions.md` on its own line, and that file is never rewritten) with its pointer in `.agents/instructions/agent-project.md`, the plaintext MCP credential copies `bun run harness:env` retires, the plan file, `.context/reports/project-adoption-architecture.md` and `.session/project-adoption/`. The full allowlist is `references/adoption-workflow.md` §Refusal list.
  - A collision is refused file by file (OD7): a path the app already owned stays the app's, gets an `updater.protected_paths` entry and is reported. Never `take upstream` on an adopted repo, except for the app's hand copy of a framework skill (a folder upstream ships under `.agents/skills/`): it stays unprotected, and its row proposes `take upstream` on its own approval line (Phase 3).
  - Web platform pass (Phase 1.7): run `npx modern-web-guidance@latest legacy-scan .` from `stack.app_root` (read-only) and put the findings in the plan as a modernization proposal, never applied. Record the Baseline target the questionnaire returned (`## Web platform` in `agent-project.md`, written at Phase 6 only on its approval line).
  - Detection never guesses: an undetected value goes to the Phase 1 questionnaire or under `## Discovery Gaps`, and a null `stack.scripts.<x>` is skipped, with a note.
  - The app is intact when its own `build`, `lint`, `types` and `test` exit codes after Phase 7 equal the Phase 1 baseline. Run a script that may reach a shared database or a paid API only when the questionnaire confirmed it is safe; otherwise record it as not measured.
  - Fail-closed prerequisites a live app may lack (`testing.automation_identity`, `autonomous_delivery.automation_gh_account`, a dedicated DB role) go in the plan as owed by the team. This skill never creates them.
  - An adopted app's product docs are the business maps and the glossary (OD5). Never invent a PRD or SRS: `/sprint-development` accepts the maps instead, and `/project-foundation` Discovery-only adds the dev guide and glossary.
  - Close with the signal table, the plan marked `Status: COMPLETED` with its results block, and the hand-offs of the body table (`/project-context refresh-all` first, in a fresh session). Never chain them automatically, and propose the commit through `/git-flow-master` instead of making it silently.
  - GUARD on an adopted app (`agentic-dev-core/references/guard-architecture.md` §3): the app keeps its folders and maps them to layers in its own `eslint.config.js` as `settings.guard.layers`. The plan proposes that block, derived from the folders the analysis found, and the team applies it, because eslint config is on the refusal list. Lint runs at `warn` and the team fixes violations over time. Copy no example into the app: the example belongs to new projects.
  - Every gate that waits for a person has a path for a supervised worker and for a routine with nobody (the body section "With nobody at the keyboard", `agentic-dev-core/references/decision-protocol.md` §5.2).
metadata:
  kind: workflow
  stage_owner: true
---

# Project adoption

Two layers bring agentic-dev into an existing application. The updater's `--adopt` run is the install layer: it delivers the tooling files without overwriting anything the app owns, then stops. This skill is the understanding layer. It reads the app, writes one plan, waits for approval, then fills the agentic surfaces (identity, the `stack:` descriptor, environments, tracker catalogs, protected paths) so every other skill reads the app's real stack. The app's code, schema, CI and dependencies stay untouched.

Invoke it as `/project-adoption` (mode `adopt`) or `/project-adoption check` on Claude Code, or say "load project-adoption" (with "mode check" for `check`) on OpenCode and Codex.

## Mode routing

Pick one mode: the first token of `$ARGUMENTS` when it names a mode below, otherwise the trigger phrase, otherwise `adopt`.

| Mode | Trigger phrases | Does | Writes |
|---|---|---|---|
| `adopt` | adopt this app, after `--adopt`, project adoption | Phases 0-9 of `references/adoption-workflow.md` | only after plan approval, only agentic surfaces |
| `check` | adoption drift check, is the adoption still accurate, re-check the stack | Phase 0 signal table plus the `bun run setup:doctor` stack section (drift between `stack:` and the repo) | nothing |

When `check` finds any `PENDING` signal, it ends by naming `adopt` as the next step and does not start it.

## Compact Rules

The `compact_rules` frontmatter block is the authoritative copy, and the registry reads it verbatim. The refusal list in `references/adoption-workflow.md` §Refusal list binds every write and every subagent briefing.

**Read full SKILL.md when**: the entry gate fails in an unexpected way, the app's stack is outside the v1 set, the instruction merge is pending, or a verification step disagrees with the baseline.

---

## Composable Skills (auto-resolved at skill entry)

Run once at entry, before Phase 0, following `agentic-dev-core/references/skill-composition-strategy.md` §3. Read `complementary_categories` from the frontmatter (`issue-tracker`, `meta-skill`), scan the installed skills (§3.1: the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, never `.agents/skills/REGISTRY.md`, which lists committed skills only), and classify each match by tier. T1 and T3 load silently. For a T4 skill ask once, `"Detected <skill> (T4). Apply for this run? Y/N"`, and cache the answer. Inject a `## Composable Skills` block per §5.2 into every subagent briefing.

Expected matches in this repo:

| Category | Skill | Why it composes |
|---|---|---|
| `issue-tracker` | `/acli` | Owns the tracker tool behind the Phase 1 probe and the Phase 5 catalog sync; load it before any Jira operation. |
| `meta-skill` | `/git-flow-master` | Owns the commit proposal at close; this skill never commits or pushes itself. |

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). This skill adopts the progress-only variant: the canonical plan is the committed `.context/reports/project-adoption-plan.md`, read by the team; under `.session/` it writes `progress.md` only.
>
> **Session close**: every phase ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

The skill is project-scope, with no `<scope>` segment. Session state lives at `.session/project-adoption/progress.md` (`agentic-dev-core/references/session-management.md` §3 and §9), and its "Cross-references" section cites the plan path.

## Phase 0 (resume check, entry gate and detection signals; inline, no writes)

Phase 0 is inline, with no subagent, so resume versus fresh is deterministic.

1. Resume. When `.session/project-adoption/progress.md` exists, read its tail and the plan file, and surface the last completed phase, the plan `Status:` and the next phase. Offer resume, restart (archive `.session/project-adoption/` to `.session/.archive/<YYYY-MM-DD>-project-adoption-project-aborted/`, keep the plan file) or abort, and wait for the pick.
2. Entry gate. Read `.template/installer.lock.json`, run `git status --porcelain` and apply the gate in `compact_rules`. A failure stops with the command that fixes it.
3. Signals. Run every signal in `references/adoption-workflow.md` §Detection signals and print the `PENDING` / `ADOPTED` table. `PENDING` rows are the work list. When every row is `ADOPTED`, report "Adoption already complete, nothing to do" with the table and stop. Mode `check` always stops here, after appending the `setup:doctor` stack section.

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

Steps, commands and pass conditions per phase: `references/adoption-workflow.md`. The plan file's sections: `references/plan-template.md`.

---

## Subagent Dispatch Strategy

Every dispatch uses the 7-component briefing (`agentic-dev-core/references/briefing-template.md`) and the pattern per phase from `agentic-dev-core/references/dispatch-patterns.md`. Component 7 (Rules) carries the refusal list verbatim from `compact_rules`, plus Critical Rules #1, #5, #7, #10 and #13.

| Phase | Pattern | Subagent role |
|---|---|---|
| 0 Resume + signals | inline | orchestrator only |
| 1 Analysis | Parallel cap=3 | three read-only analysts: (a) stack, scripts and database layout (`bun run agents:setup --stack --dry-run --non-interactive`, `package.json`, migrations dir), (b) repo conventions (CI, hooks, instruction files, env files, adopt parity rows), (c) tracker reachability. Each returns facts with evidence paths and writes nothing |
| 1 Baseline | Single | runs the app's safe `build` / `lint` / `types` / `test`, returns exit codes and first errors |
| 2 Plan | inline | orchestrator writes the plan from the analysts' facts and the answers |
| 3-7 Writes | Sequential | one writer per phase, briefed with that phase's approved plan rows only |
| 8 Verification | Sequential, fail-fast | one verifier running the ordered gate |
| 9 Close | inline | orchestrator re-runs the signals and closes the plan |

A subagent's report of a write is verified at the destination (Critical Rule #16): re-read the yaml, re-run the signal, re-parse the file.

---

## Hand-offs

| After adoption | Skill | Session |
|---|---|---|
| Business maps read from the app's code and schema | `/project-context refresh-all` | a fresh one (the maps are token-heavy) |
| Dev guide and domain glossary, which complete the app's product docs (`/sprint-development` reads them in place of a PRD / SRS) | `/project-foundation` Discovery-only | after the maps |
| The project's own branching strategy and host protection | `/git-flow-master` Strategy Setup | its own, read-only first |
| `DESIGN.md` from the live theme | `/design-system extract` | optional |
| In-app `/qa` page and credentials artifact | `/testability-guide` | optional |
| DB types into `stack.database.types_path` when absent | `/project-bootstrap` add-on `supabase-types-setup` | optional, through the DB MCP under the delivery doctrine (`agentic-dev-core/references/db-change-doctrine.md`) |
| Where the app's modules are shallow or leak across seams | the read-only architecture scan (`references/adoption-workflow.md` Phase 9 step 4), no skill | optional; a person picks one candidate in a later session |
| Commit of the adoption writes | `/git-flow-master` | this one, proposed at close |

## GUARD layer map

Phase 1 reads the app's folders and Phase 2 puts one block in the plan for the team to paste into its `eslint.config.js`. The globs below are an example. Each app's analysis supplies its own, and the defaults of `guard-architecture.md` §1 apply to any layer left out.

```js
settings: {
  guard: {
    layers: {
      app: ['app/**'],
      features: ['modules/**'],
      adapters: ['db/**', 'api/clients/**'],
      platform: ['lib/**'],
    },
  },
},
```

---

## Anti-patterns

The codes are cited by the evals and by `references/adoption-workflow.md`.

- A1. No adopting by hand: copying skills into an app, or gitignoring `.agents/`, is what this skill replaces, so a missing installer lock stops the run.
- A2. `/project-bootstrap` base phases stay out of an adopted app. Every step there creates, and an existing app has nothing to create.
- A3. The `stack:` block comes from evidence in the app, never from the boilerplate defaults.
- A4. Jira catalogs describe the app's own Jira, so the UPEX reference flag never runs on a foreign instance.
- A5. The app's instruction text stays as it is. The updater moved it verbatim into the `<app>-context` skill and saved the `AGENTS.md` merge: apply that file, or leave the row blocking. Only the skill's `description` is yours to sharpen.
- A6. A run is not done while an app script's exit code differs from its baseline.
- A7. The app's instruction text does not go back into `AGENTS.md`. Every session would pay for it, and an adopted app's L0 has a byte ceiling (`bun run instructions:check`). It stays in the `<app>-context` skill, reached by one router row.
- A8. No GUARD example is copied into an adopted app, and no folder moves to fit the layers: the map follows the folders.

---

## With nobody at the keyboard

A supervised worker or a routine can run this skill (`/autonomous-delivery` never calls it), and neither waits for a person. Per `agentic-dev-core/references/decision-protocol.md` §5.2, a worker's conductor holds each gate, and a routine takes the delegating brief as the answer when it covers the decision. Without that cover, a routine does the reversible work, stops before any outward or irreversible action and reports.

| Gate | A person is present | A supervised worker | A routine with nobody |
|---|---|---|---|
| T4 skill question, Phase 0 resume or restart | the user answers | the conductor answers | the brief answers; otherwise do the step inline, or resume and say earlier state was found |
| Phase 1 questionnaire, "which app", a baseline script that wrote tracked files | the user answers (revert nothing) | the conductor answers | the brief answers; an unanswered item is a Discovery Gap, several candidate apps stop the run at the plan, that script is marked not measured |
| Plan approval (Phase 2) and each own approval line (hand-copied framework skill, instruction merge, legacy layout, `<app>-context` description) | the user approves | the conductor approves and the plan header records who | the brief covers it; otherwise the plan stays `PENDING APPROVAL`, the run stops after Phase 2 and reports, and an unapproved row stays `PENDING` |
| Secrets for `.env`, session restart (Phase 4), missing tracker credentials (Phase 1.4) | the user types secrets in a terminal | the conductor relays the request | nothing is written; the plan lists the variable names as team-owed and the tracker is a recorded gap |
| A Phase 8 step fails | the user decides the fix | report to the conductor | stop at the first failure and report, without auto-fixing |
| Hand-offs, commit proposal and scan candidates (Phase 9) | offered; the user picks a candidate for a later session | listed for the conductor | listed in the report; nothing started or picked |

---

## Verification

Phase 8 (`references/adoption-workflow.md` §Phase 8) is the gate. On success the orchestrator marks the plan `Status: COMPLETED`, appends the results block, writes the last `progress.md` entry, archives `.session/project-adoption/` per `agentic-dev-core/references/session-management.md` §8 and calls `mem_session_summary` with the plan path.
