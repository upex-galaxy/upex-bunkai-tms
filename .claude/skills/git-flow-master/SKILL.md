---
name: git-flow-master
description: "End-to-end Git operator for any branching strategy. Auto-detects the project's strategy (solo-main, main+integration, enterprise multi-branch, trunk-based, GitFlow, GitHub Flow, GitLab Flow) from .git config, branches, and the `git_strategy:` block in `.agents/project.yaml`, then adapts every commit, branch, push, PR, conflict-fix, and chained-PR action to that strategy. Use this skill whenever the user wants to: create a branch (`crear branch`, `new feature branch`, `start work on UPEX-123`), commit changes (`commit this`, `commitear esto`, `make a commit`, `commit and push`), push code (`push`, `push to main`, `push to staging`, `subir cambios`), open a pull request (`create PR`, `open PR`, `abrir PR`, `crear pull request`, `gh pr create`), fix merge conflicts (`fix conflict`, `resolver conflicto`, `merge conflict`, `rebase conflict`, `push rejected`), plan stacked or chained PRs (`stack of PRs`, `chained PRs`, `split this PR`, `PR demasiado grande`), set up or bootstrap a branching strategy on a fresh repo (`set up our git strategy`, `bootstrap branching`, `configura el flujo de git`, `git strategy setup`, `materialize the git flow`, `create the staging branch and write the runbook`), or pick / change / set up a branching strategy (`git flow`, `git strategy`, `branching strategy`, `which git flow do we use`, `set up our git strategy`, `bootstrap branching`, `configura el flujo de git`). Trigger even when the user does not say `git-flow-master` literally — if the work is git-or-PR-shaped, this is the right tool. Do NOT use for: implementing features (use /sprint-development), writing tests (use /unit-testing), product backlog refinement (use /product-management), or general code editing — git-flow-master operates strictly on the version-control layer."
license: MIT
compatibility: [claude-code, opencode]
phase: implementation
complementary_categories: []
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Git Flow Master — One Skill for Branches, Commits, Pushes, PRs, and Conflicts

This skill is the project's single entry point for everything that happens on the version-control layer: creating branches, writing commits, pushing safely, opening pull requests, resolving conflicts, and planning chained / stacked PRs when a change outgrows the review budget.

It does not assume one branching model. The project may run on `main` only, on `main + staging`, on a multi-branch enterprise layout, or on any of the well-known flows (trunk-based, GitFlow, GitHub Flow, GitLab Flow). The skill **detects** which one is active and adapts every command accordingly. The detection is sticky: once resolved, the strategy is recorded in the `git_strategy:` block of `.agents/project.yaml` so future invocations skip the prompt.

---

## When to use

Trigger on any of these intents — even without literal keywords:

- "I want to start work on UPEX-123" → branch creation
- "commit and push", "subir cambios", "push to main" → commit + push flow
- "abrí un PR contra staging" → PR creation
- "tengo conflictos al hacer pull" → conflict resolution
- "este PR va a quedar enorme" → chained-PR planning hand-off
- "qué estrategia de git usamos en este repo" → strategy detection / persistence
- "el push fue rechazado" → diagnostic + recovery flow

If the user is asking about feature implementation, test design, product backlog, or architecture — that is **not** this skill. Hand back to `/sprint-development`, `/unit-testing`, or `/product-management`.

---

## The six operations

Every git-flow-master invocation maps to one (or a sequence) of these six operations. Operation choice is driven by the user's request; strategy resolution shapes how each operation runs.

| Op           | Trigger phrases (examples)                              | Skill behaviour                                                                                                    |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Branch**   | "create branch", "new feature branch", "start UPEX-123" | Resolve strategy → propose name with prefix + issue key → wait for OK → checkout                                   |
| **Commit**   | "commit this", "commit and push", "make atomic commits" | Group by responsibility → propose conventional commits → wait for OK → execute one-by-one                          |
| **Push**     | "push", "push to main", "subir cambios"                 | Diagnose upstream → confirm if pushing to a protected branch → never `--force` without explicit user opt-in        |
| **PR**       | "create PR", "abrir PR", "gh pr create"                 | Pick base branch from strategy → render body inline → ask labels/reviewers → call `gh pr create`                   |
| **Conflict** | "fix conflict", "rebase failed", "push rejected"        | Diagnose first (see `references/conflict-resolution.md`) → present options → guide resolution → verify clean state |
| **Strategy Setup** | "set up our git strategy", "bootstrap branching", "configura el flujo de git", "materialize the flow" | Resolve strategy → run decision questionnaire → conditionally create/ff-sync long-lived branches (never force) → write the `git_strategy:` block in `.agents/project.yaml`. Skips questions already answered by non-`n/a` `git_strategy.decisions.*` fields. See `references/strategy-setup.md`. |

When the operation is ambiguous (user just says "git-flow-master" or "let's do the git stuff"), report the current repo state (Step 1 below) and ask what they need.

---

## Step 1 — Always: read the repo state

Run these silently every invocation. Do not act until the picture is clear:

```bash
git status
git branch --show-current
git branch -a
git diff --stat
git log --oneline -5
git fetch origin
git status -sb
git remote -v
```

Summarise to the user:

- Current branch.
- Dirty / clean working tree (staged / unstaged / untracked counts).
- Unpushed / unpulled commits (ahead / behind upstream).
- Upstream status (no upstream, up-to-date, diverged).
- Remote name(s) — most repos have one (`origin`); some have a fork + upstream.

This summary is cheap, prevents 90% of mistakes, and is the input to every subsequent decision.

---

## Step 2 — Resolve the branching strategy

The skill supports seven strategies (see `references/branching-strategies.md` for the full catalogue, detection signals, and trade-offs):

| Strategy           | One-line description                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `solo-main`        | Single long-lived branch (`main`). All work lands directly. Best for solo projects, scratch repos, prototypes.                                   |
| `main-integration` | `main` (production) + a single integration branch (`staging` / `dev` / `develop`). Features merge to integration, release-promote to `main`.     |
| `enterprise`       | `main` + integration + many short-lived `feature/*`, `fix/*`, `release/*`, `hotfix/*` branches. Adds environment branches when needed.           |
| `trunk-based`      | Trunk (`main`) is the only long-lived branch. Short-lived feature branches (<1 day) merge fast, behind feature flags. CI gate is non-negotiable. |
| `gitflow`          | Vincent Driessen's classic. `main` (releases) + `develop` (integration) + `feature/*` + `release/*` + `hotfix/*`. Heavyweight; mostly legacy.    |
| `github-flow`      | `main` always deployable. `feature/*` branches → PR → merge → deploy. No staging/develop branch.                                                 |
| `gitlab-flow`      | GitHub Flow + environment branches (`pre-production`, `production`) to model deployment promotion.                                               |

### Detection algorithm

Apply in order; stop at the first definitive answer:

1. **`git_strategy:` block in `.agents/project.yaml`** — read it. If `git_strategy.strategy` is non-null (one of the seven slugs), it + `git_strategy.branches` (production / integration / ephemeral_pattern) + `git_strategy.decisions` (promote_method / feature_merge / hotfix_policy) ARE the persisted decision — use them. Each `git_strategy.decisions.*` field whose value is NOT `n/a`/empty means Strategy Setup SKIPS that question on re-run (idempotent — idempotency is keyed off the `git_strategy.decisions.*` fields, not markers). **Inherited-template guard:** the boilerplate ships the block FILLED (`strategy: solo-main`) and a scaffolded project INHERITS it verbatim (the scaffolder only patches `project.project_name` / `project.project_key`). So a non-null `git_strategy.strategy` is only authoritative when the project is actually onboarded. Read `project.project_name` in the SAME file: if `git_strategy.strategy` is non-null BUT `project.project_name` is `null`, the block was INHERITED from the template (not chosen for THIS project) — treat the strategy as UNCONFIRMED and route to the Bootstrap trigger's inherited case (it still operates under the inherited strategy if the offer is declined). If `project.project_name` is set, the block is confirmed → use it normally, no nudge.
2. **Single-branch heuristic** — `git branch -a` shows only `main` (or `master`) and no integration branch in the remote → `solo-main`.
3. **Two-branch heuristic** — exactly `main` (or `master`) + one of `{staging, dev, develop, integration}` exists upstream → `main-integration` (record the integration branch name).
4. **Multi-branch heuristic** — `main` + integration + active `feature/*` or `release/*` branches in `git branch -a` → `enterprise`.
5. **Project hints** — look for `.gitlab-ci.yml` (suggests `gitlab-flow`), `release/*` and `hotfix/*` long-lived branches (suggests `gitflow`).
6. **Fallback** — ask the user. Show the seven options with one-line descriptions; mirror their language. Do NOT pick silently.

### Persist the decision

Once resolved (whether by detection or by asking), write/update the `git_strategy:` block **in place** inside `.agents/project.yaml` — preserve the rest of the file; create the block if it is missing. NEVER write a separate file. It is the single source of truth. At minimum the first five operations need `git_strategy.strategy` + `git_strategy.branches`; the full schema (with `decisions:`, `policy:`, `protected:`, `branch_prefixes:`, `meta:`) is populated by Strategy Setup (3.6).

```yaml
# .agents/project.yaml  (git_strategy block, in place)
git_strategy:
  strategy: main-integration
  branches:
    production: main
    integration: staging
    ephemeral_pattern: null
```

The `git_strategy:` block is the source of truth; its `description:` field is the one-paragraph human summary. The user can edit it; the next invocation re-reads it.

CLAUDE.md's `## Git Strategy` section is **just a pointer** to this block — NEVER write strategy policy or branch decisions into CLAUDE.md.

If the strategy uses an integration branch with a non-default name (anything other than `staging`), record it under `git_strategy.branches.integration` so commits don't have to re-detect.

**Fields and idempotent setup.** `git_strategy.strategy` + `git_strategy.branches` are the minimum the first five operations need. Strategy Setup (3.6) additionally populates the three `git_strategy.decisions.*` fields (`promote_method`, `feature_merge`, `hotfix_policy`) plus the `git_strategy.policy.*` fields; the `decisions.*` fields gate questionnaire skips. On any later invocation, detection reads the block and treats each `git_strategy.decisions.*` field that is NOT `n/a`/empty as an already-answered questionnaire question — Strategy Setup re-run only asks the questions whose `git_strategy.decisions.*` fields are still `n/a`, and never recreates a branch that already exists.

### Bootstrap trigger — offer setup on a fresh repo (never auto-run)

At the top of any git intent, after Step 1 (repo state) and Step 2 detection have run, evaluate the gate — it fires on EITHER of two conditions:

> **(a) Unset** — `git_strategy.strategy` in `.agents/project.yaml` is null (or the `git_strategy:` block is absent) AND the repo **looks fresh** — any of: only `main`/`master` exists locally and on the remote; fewer than ~3 commits; or a boilerplate sentinel file is present (e.g. `.agents/project.yaml`).
>
> **(b) Inherited** — `git_strategy.strategy` is non-null BUT `project.project_name` (same file) is `null`. The block was INHERITED from the boilerplate template (this project has not been onboarded yet) — it was NOT chosen for THIS project. Treat it as UNCONFIRMED.

If EITHER condition is true, **OFFER** (do not auto-execute, do not silently pick a strategy), using the matching prompt:

> _(unset case (a))_ "No git strategy is set up yet. Want me to run Strategy Setup — pick the flow, create the branches it needs, and write the `git_strategy:` block in `.agents/project.yaml`? (Y/N)"

> _(inherited case (b))_ "This project's `git_strategy` looks inherited from the boilerplate (project not onboarded yet — `project.project_name` is null). Want to run Strategy Setup to define this project's own flow? (Y/N)"

Rules:

- **Offer once per session**, then cache the answer. Do not re-prompt every git intent in the same session.
- **Never auto-run.** A `No` proceeds with the requested operation under the detected (case a) or inherited (case b) strategy without writing the block.
- A `Yes` enters Strategy Setup (3.6) before continuing with the original git intent.
- The boilerplate ships `.agents/project.yaml` with the `git_strategy:` block FILLED (`strategy: solo-main`); a scaffolded project INHERITS it verbatim (the scaffolder patches only `project.project_name` / `project.project_key`, and the updater freezes the file via `bootstrapOnlyPaths`). So the unset case (a) and the inherited case (b) are the two ways a project reaches a real git intent without having confirmed its own flow → the offer fires on first real use — by design (template-trap guard). If `project.project_name` is set, the strategy is confirmed and NEITHER case fires.

---

## Step 3 — Operation-specific runbooks

### 3.1 Branch creation

Decide the **prefix** from the dominant change. Use this fixed vocabulary (mixed-changes precedence: `feat > fix > refactor > test > docs > chore`):

| Prefix      | When the dominant change is…                         |
| ----------- | ---------------------------------------------------- |
| `feat/`     | new feature or capability                            |
| `fix/`      | bug fix                                              |
| `test/`     | adding or updating automated tests (no product code) |
| `docs/`     | docs only                                            |
| `refactor/` | code change without behaviour change                 |
| `chore/`    | tooling, deps, housekeeping                          |

For `enterprise` and `gitflow` strategies, also consider `release/X.Y.Z` and `hotfix/X.Y.Z` when appropriate.

**Issue key extraction** (in order):

1. Current branch name regex: `(?:feat|feature|fix|test|docs|refactor|chore)/([A-Z]+-\d+)-`.
2. `$ARGUMENTS` for `[A-Z]+-\d+`.
3. Ask the user once: "Is there an issue key for this work?" — accept "no" gracefully.

**Branch name format**:

- With key: `{prefix}/{ISSUE-KEY}-{kebab-slug}` (e.g. `feat/UPEX-123-bulk-assign-users`).
- Without key: `{prefix}/{kebab-slug}` (e.g. `refactor/split-auth-utils`).
- Keep slugs lowercase, hyphen-separated, ≤50 chars.

**Strategy-specific source branch**:

- `solo-main`, `github-flow`, `trunk-based` → branch off `main`.
- `main-integration`, `gitlab-flow` → branch off the integration branch (`staging` / `dev` / equivalent).
- `enterprise` → branch off the integration branch unless it is a `hotfix/*`, which branches off `main`.
- `gitflow` → `feature/*` branches off `develop`; `hotfix/*` off `main`; `release/*` off `develop`.

Always **propose** the name and ask for OK before `git checkout -b`. Never create silently.

### 3.2 Commits

Group changes by responsibility, not by file type:

| Group       | Typical paths                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| Source code | `src/`, `app/`, `components/`, `pages/`, `lib/`, `api/` (excluding generated) |
| Tests       | `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`                                |
| Generated   | `api/schemas/`, codegen output, OpenAPI types                                 |
| Config      | `package.json`, `tsconfig.json`, lint/format configs, CI workflows            |
| Docs        | `README.md`, `CLAUDE.md`, `docs/`, `.claude/skills/`                          |

**Tests stay with the behaviour they verify.** If a feature commit ships its own tests, they belong in the same commit, not in a separate `test:` commit.

**Conventional commit format**:

- With issue key: `{type}({ISSUE-KEY}): {description}` (e.g. `feat(UPEX-123): add bulk-assign action`).
- Without key: `{type}: {description}`.
- Breaking changes: append `!` after type/scope and add `BREAKING CHANGE:` footer.

**Vocabulary**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert` (full list in `references/conventional-commits.md`).

**Hard rules** (apply on every commit):

- One commit = one responsibility. Never bundle unrelated changes.
- Never `git add -A` or `git add .` — list explicit paths to avoid leaking secrets (`.env`, credentials) or unrelated work.
- **No AI attribution.** No `Generated with Claude Code`, no `Co-Authored-By: Claude`, no equivalent line. Commits look human-authored. (Critical Reminder #3 in `CLAUDE.md`.)
- If a pre-commit hook fails, **stop, fix the underlying issue, create a NEW commit**. Never `--amend` a commit the hook rejected — `--amend` operates on the previous commit, which destroys context.

Present all proposed commits as one block. Wait for OK / modify / reject before executing.

### 3.3 Push

Push command depends on Step 1 output:

- No upstream → `git push -u origin {branch}`.
- Upstream behind → `git push`.
- Upstream diverged → **stop**. Do not force. Hand to conflict resolution (3.5).

**Protected-branch confirmation** — before pushing to any branch the strategy treats as protected:

- `solo-main` → `main` is protected.
- `main-integration` → both `main` and the integration branch are protected.
- `gitflow` → `main` and `develop` are protected.
- `github-flow` / `trunk-based` → `main` is protected.
- `enterprise` → `main`, integration, and any `release/*` are protected.

**Consult `git_strategy.policy.direct_push_to_protected`** to decide how strict the gate is:

- `allowed` → proceed with the direct push, but still confirm once: _"You are about to push directly to the protected branch `{branch}` in a `{strategy}` flow. Confirm?"_ Wait for explicit yes.
- `confirm` (default) → **always ask** the same confirmation. Wait for explicit yes.
- `forbidden` → **refuse the direct push.** Do not push to the protected branch. Route the work through a PR instead (branch off the strategy's default base → push the work-branch → open a PR via 3.4).

**Admin bypass (rare, opt-in).** A bypass of a `forbidden`/`confirm` gate may be **OFFERED only when `git_strategy.policy.admin_bypass: true`**. Even then, before bypassing, re-confirm at runtime BOTH: (a) the operator is actually a repo admin — ASK them, the skill cannot know the GitHub role; AND (b) the specific irreversible action. If `git_strategy.policy.admin_bypass: false`, **never offer a bypass** under any circumstance.

**Never** pass `--force`, `--force-with-lease`, `--no-verify`, or any history-rewriting flag unless the user explicitly requests it AND the branch is unshared. Document the request in the conversation. (Critical Reminder #5 in `CLAUDE.md`: never rewrite pushed history.)

### 3.4 Pull request

**Base branch** picks itself from the strategy:

| Strategy                                  | Default PR base                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `solo-main`, `github-flow`, `trunk-based` | `main`                                                                                           |
| `main-integration`, `gitlab-flow`         | integration branch (e.g. `staging`)                                                              |
| `enterprise`                              | integration branch; `hotfix/*` → `main`                                                          |
| `gitflow`                                 | `feature/*` → `develop`; `hotfix/*` → `main`; `release/*` → `main` (and back-merge to `develop`) |

The user can override with `--base X` in arguments. If overridden, surface it in the confirmation: _"PR will target `{base}` instead of the strategy default `{default}`."_

**Title format**: `{type}({ISSUE-KEY}): {description}` — under 70 chars. Without a key: `{type}: {description}`.

**Body** — render inline (no template file to read) using the structure in `references/pr-templating.md`. Substitute placeholders the skill can fill (`<<ISSUE_KEY>>`, `<<SUMMARY>>`, `<<CHANGES>>`, `<<TEST_PLAN>>`, `<<RISK>>`). Leave any unfilled placeholder visible so the author can edit it before posting — do not silently drop sections.

Write the rendered body to a tempfile (e.g. `$(mktemp)`) and pass it via `gh pr create --body-file` to avoid escaping issues.

**Reviewers, labels, draft** — see `references/pr-templating.md`. Never hardcode labels the repo may not have configured; verify with `gh label list` if uncertain.

**Final command shape**:

```bash
gh pr create \
  --title "{title}" \
  --body-file {tmpfile} \
  --base {base} \
  [--reviewer {users}] \
  [--label {labels}] \
  [--draft]
```

**Stop at PR creation.** Merging is the user's explicit next step. Never auto-merge. Surface: _"Review the PR. Once approved, merge via the GitHub UI or run `gh pr merge {number} --squash --delete-branch`."_

### 3.5 Conflict resolution

Conflicts are diagnosed before they are resolved. The user is rarely in a hurry; a wrong fix here costs hours.

Run `git status`, `git diff --check`, and inspect `.git/MERGE_HEAD` / `REBASE_HEAD` to classify the situation, then follow the matching playbook in `references/conflict-resolution.md`:

- Merge conflict (content)
- Merge conflict (rename / delete)
- Rebase conflict
- Push rejected (diverged)
- Detached HEAD
- Stash apply conflict
- Unrelated histories
- Pre-commit hook rejected the commit

For every type, the playbook follows the same shape:

1. Explain what happened (root cause, in the user's language).
2. Present options ranked by safety. **Never** pick destructive options (force push, hard reset, `--abort` of an unfinished merge with uncommitted work) silently.
3. Guide the resolution step by step.
4. Verify (`git status`, `git log --oneline -3`).
5. Teach prevention (one short note on how to avoid this next time).

When in doubt, **abort safely** (`git merge --abort`, `git rebase --abort`, `git cherry-pick --abort`) rather than push forward. Aborting always wins over guessing.

### 3.6 Strategy Setup

The first five operations *adapt to* a strategy that already exists. Strategy Setup is the operation that **establishes** one: it resolves (or asks) the strategy, captures the merge + hotfix + protection-policy decisions the other operations depend on, materializes the long-lived branches the strategy needs, and writes the `git_strategy:` block in `.agents/project.yaml`. It is the only operation that creates branches and writes the strategy block.

**When it runs**

- **Explicit**: the user asks — "set up our git strategy", "bootstrap branching", "configura el flujo de git", "materialize the flow".
- **Bootstrap offer** (see "Bootstrap trigger" below): a git intent arrives and EITHER `git_strategy.strategy` is null (or the block is absent) with a fresh-looking repo, OR `git_strategy.strategy` is non-null but `project.project_name` is null (inherited template — not onboarded). The skill OFFERS to run setup. It never auto-runs.

**Six-step flow** (mechanics live in `references/strategy-setup.md` — do not inline them here):

1. **Read repo state** — Step 1 (already always runs).
2. **Resolve strategy** — reuse Step 2 detection. If still undetermined, ask the 7-option question (one slug out).
3. **Decision questionnaire** — run Q1/Q2/Q3/Q4 below, capturing merge methods + hotfix policy + protection policy. SKIP any question that does not apply to the resolved strategy, and SKIP any question whose `git_strategy.decisions.*` field in `.agents/project.yaml` is already set (not `n/a`/empty) (idempotent re-run — see Step 2 extension). Q4 (protection policy) applies to ALL strategies.
4. **Materialize** — conditional on the resolved strategy: create an integration branch ONLY if the strategy needs one and it is missing; ff-sync the integration/production pair if one is a pure ancestor of the other (NEVER `--force`); set up local tracking. Full materialization table + sync mechanics in `references/strategy-setup.md`.
5. **Persist** — write the `git_strategy:` block in place inside `.agents/project.yaml` (the structured source of truth) with the fields that apply to the resolved strategy. Do NOT render a prose runbook anywhere — the operational HOW lives in this skill's references (`branching-strategies.md` catalogue), read on demand. Per-strategy field values in `references/branching-strategies.md` → "git_strategy field rules (per strategy)".
6. **Report** — branches created/synced, decisions captured, block location.

**Decision questionnaire (defaults first; each gated on the resolved strategy)**

| Q  | Question                                                   | Applies to                                                                                  | Options (default first)                                                                                                                  | Drives                                                |
| -- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Q1 | Promotion method, integration → production                 | strategies with an integration branch (`main-integration`, `gitlab-flow`, `enterprise`; `gitflow` = `develop → main`) | **Fast-forward only** / Merge commit (`--no-ff`) / Squash                                                                                | release runbook + whether branches stay byte-identical |
| Q2 | Merge method, work-branch → integration (or → trunk)       | all multi-branch strategies                                                                 | **Merge commit (`--no-ff`)** / Squash / Rebase + merge                                                                                   | how integration history accrues                       |
| Q3 | Hotfix policy                                              | strategies with a production branch distinct from where work lands                          | **Branch off production → PR to production → back-merge to integration same day** / Always via integration / No policy                  | hotfix runbook + invariant maintenance                |
| Q4 | Protected-branch bypass policy                             | **ALL strategies**                                                                          | direct push to protected: **`confirm`** / `forbidden` / `allowed` · admin bypass: **`false`** / `true` · require PR reviews: `null` / `0` / `N` | how strictly the Push gate (3.3) guards protected branches |

Defaults for Q1/Q2/Q3 are what the `main-integration` worked example chose; they are DEFAULTS, not hardcoded. The user can override any of them. Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) answer NONE of Q1/Q2/Q3 — they have no integration branch and no distinct production branch. **Q4 applies to every strategy** and sets the `git_strategy.policy.*` fields; its per-strategy defaults live in `references/branching-strategies.md` → "git_strategy field rules (per strategy)".

**The git_strategy fields** (write only the ones that apply; leave `decisions.*` at `n/a` for any decision the strategy doesn't use):

```yaml
git_strategy:
  strategy: VALUE                 # one of the seven slugs
  branches:
    integration: NAME             # or null
  decisions:
    promote_method: ff-only|merge-commit|squash|n/a
    feature_merge: merge-commit|squash|rebase-merge|n/a
    hotfix_policy: branch-off-prod-backmerge|via-integration|none|n/a
  policy:                         # Q4 — applies to all strategies
    direct_push_to_protected: forbidden|confirm|allowed
    admin_bypass: true|false      # team POLICY (intent), not enforcement; real capability depends on the GitHub user's role
    require_pr_reviews: null|0|N
```

**Non-negotiables**

- **Never `--force`** (not `--force-with-lease` either) during a setup sync. Sync only on a true fast-forward; if the integration/production pair has diverged both ways → STOP and hand to conflict resolution (3.5).
- **Confirm before any push to a protected branch.** A setup ff-sync push is still a push to a protected branch — ask first.
- **Propose, don't auto-execute** branch creation. Show the plan (which branch, off what, why) and wait for OK before `git checkout -b` / `git branch`.
- **No AI attribution** in any commit the setup makes (see this skill's "Critical rules" section and the project `CLAUDE.md`).

**Pointers (do not inline mechanics here)**

- `references/strategy-setup.md` — full questionnaire detail (Q1-Q4), the per-strategy materialization table, sync mechanics, persist sequence, report format.
- `references/branching-strategies.md` → "git_strategy field rules (per strategy)" — the per-strategy field values written into the `git_strategy:` block of `.agents/project.yaml` (strategy / branches / decisions / policy).

---

## Step 4 — Chained / stacked PRs (when a change outgrows the budget)

When a planned change estimates `> 400 changed lines` (additions + deletions), the work should be split. The 400-line cognitive review budget is borrowed from industry research (SmartBear, Cisco code-review studies); above it, defect detection drops sharply.

There are three options:

1. **`stacked-to-main`** — 2 to 4 small PRs, each branched off the strategy's default base. PRs depend on previous merges. The base always works between merges. Best for linearly decomposable work.
2. **`feature-branch-chain`** — one long-lived integration branch; child PRs merge into it; one final PR merges it to the strategy's default base. Best for changes with shared scaffolding (new types, new schemas) that would break partial merges.
3. **`size-exception`** — for mechanical diffs (mass renames, formatter sweeps, generated code, vendor updates). Requires explicit user override and a `Why size-exception:` line in the PR body.

Walk the chained-PR decision tree inline (see `references/branching-strategies.md` § Chained-PR decision tree). The decision picks one of: `single-pr`, `stacked-to-main`, `feature-branch-chain`, `size-exception`. Once decided, execute the resulting branch plan from this skill.

The branch plan that comes out of the decision is the **contract** for execution. If the implementation diverges (the actual diff is larger than the estimate), re-invoke the decision — do not silently up-budget the existing strategy.

---

## Variables consumed

- `{{PROJECT_KEY}}` — issue prefix for branch naming (e.g. `UPEX-123`). Resolves from `.agents/project.yaml`.
- `{{ATLASSIAN_URL}}` — base URL for the Traceability section in PR bodies. Resolves from `.agents/project.yaml:atlassian_url`.
- Any project missing `.agents/project.yaml` will lack these. Fall back to a generic `{prefix}/{slug}` and surface a one-line warning: clone the full boilerplate (the foundation files ship with the repo).

---

## Hand-offs to other skills

| Situation                                              | Hand off to                                 |
| ------------------------------------------------------ | ------------------------------------------- |
| Strategic split of a large change                      | Step 4 (inline decision tree in this skill) |
| Per-story dev loop including code review               | `/sprint-development`                       |
| TDD inside a feature                                   | `/unit-testing`                             |
| Atlassian (Jira) operations triggered by a commit / PR | `/acli`                                     |
| Backlog grooming / story refinement                    | `/product-management`                       |

---

## Critical rules — apply every invocation

1. **Diagnose before acting.** Step 1 always runs. Never assume repo state.
2. **One commit = one responsibility.** Never bundle unrelated changes.
3. **No AI attribution** in commits or PR bodies. Commits look human-authored. (Critical Reminder #3 in `CLAUDE.md`.)
4. **Confirm before pushing to any protected branch.** Strategy-driven; see Step 3.3. (Critical Reminder #4 in `CLAUDE.md`.)
5. **Never force-push, never rewrite pushed history, never `--no-verify`** unless the user explicitly authorises it AND the branch is unshared. (Critical Reminder #5 in `CLAUDE.md`.)
6. **No `git add -A` / `git add .`** — always list explicit paths.
7. **Show proposed commits / branches / PR body and wait for OK** before executing. The user can accept, modify, or reject any item.
8. **`gh` CLI is the PR transport.** If `gh` is missing or unauthenticated (`gh auth status` fails), stop and surface the blocker. Do not pretend a PR was opened.
9. **PRs stop at creation.** Merging is the user's explicit next step.
10. **Strategy is sticky.** Once resolved, persist in the `git_strategy:` block of `.agents/project.yaml`. The next invocation re-reads the block rather than asking again.
11. **Language**: artifacts (commits, branches, PR bodies, CLAUDE.md sections) in English. Mirror the user's language only in conversation.
12. **No global discards.** Never `git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, or `git clean -f` — concurrent agent sessions may share this working tree without worktrees. Discard only explicit paths this session modified; if file ownership is unclear, stop and ask the user. (Critical Rule #13 in `CLAUDE.md`; see also `references/worktrees.md` for true isolation.)

---

## Anti-patterns — NEVER do these

- **G1.** NEVER force-push to `main` or any shared branch — destroys teammates' history and is unrecoverable once others have pulled.
- **G2.** NEVER amend or rebase a pushed commit — creates orphan commits in others' clones and rewrites history that was already replicated.
- **G3.** NEVER commit secrets, credentials, `.env` contents, or auth tokens — git history is forever; a single commit leaks the secret permanently.
- **G4.** NEVER include "Generated with Claude Code", "Co-Authored-By: Claude", or any AI-attribution line in commit messages or PR bodies (Critical Rule #3). Commits look human-authored.
- **G5.** NEVER push to `main` without explicit user confirmation (Critical Rule #4). Strategy-driven protection applies to every protected branch, not just `main`.
- **G6.** NEVER bypass pre-commit / pre-push hooks with `--no-verify` to "ship faster" — hooks exist to catch the bug you didn't notice. Fix the hook failure and create a new commit.
- **G7.** NEVER mix concerns in a single commit (feat + refactor + lint fix bundled together) — atomic commits enable surgical revert and clean blame.
- **G8.** NEVER stack PRs without naming the dependency chain in the PR body — reviewers can't tell which PR to read first or what each one depends on.
- **G9.** NEVER discard working-tree changes globally (`git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`) — when multiple agent sessions share one working tree without worktrees, a global discard destroys another session's uncommitted work with no recovery. Target only the explicit paths this session modified; unclear ownership → stop and ask the user (Critical Rule #13).

---

## Isolated worktrees (parallel / risky work)

When work needs to be isolated from in-progress changes on the current branch — a second
AI session running in parallel, a hotfix while a feature is open, or unrelated WIP you do
not want to mix — use a **git worktree** (a second working directory on its own branch,
sharing one `.git`). Two paths:

- **Manual git** (portable, any tool): `git worktree add ../dir -b feat/x main` → work →
  `git worktree remove` / `prune`.
- **Claude Code harness** (this agent only): `EnterWorktree` moves the session into a fresh
  worktree under `.claude/worktrees/`; `ExitWorktree` (`keep`/`remove`) leaves it. Other
  coding agents lack this — they use the manual path.

Key gotcha: a fresh worktree contains only the **tracked** files of its base — **untracked
WIP does not teleport**, so `mv` it in (or commit first). Keep the primary tree's
`git status` clean. Full lifecycle, multi-session safety rules, and the decision guide:
`references/worktrees.md`.

---

## Pre-flight checklist (run before exiting any operation)

- [ ] Step 1 ran and the repo state was reported.
- [ ] Strategy resolved (detected from the `git_strategy:` block in `.agents/project.yaml`, inferred from layout, or asked) and persisted to the `git_strategy:` block in `.agents/project.yaml` if newly chosen.
- [ ] Branch / commit / push / PR / conflict operation followed the runbook for that strategy.
- [ ] Each commit is atomic, conventional, and free of AI attribution.
- [ ] No `git add -A` / `--force` / `--no-verify` used unless explicitly authorised.
- [ ] No global discard ran (`git restore .` / `git checkout -- .` / `git reset --hard` / untargeted `git stash` / `git clean`); any discard targeted explicit session-owned paths only.
- [ ] PR (if created) has Title <70 chars, body with Summary / Changes / Test Plan / Traceability / Risk, base branch matches strategy.
- [ ] PR URL returned to the user; no merge attempted.
- [ ] Conflicts (if any) are fully resolved AND verified (`git status` clean, `git log` sensible).
- [ ] If Strategy Setup ran: branches were proposed (not auto-created), ff-syncs used a true fast-forward only (no `--force`), and a diverged pair was handed to conflict resolution rather than forced.
- [ ] If Strategy Setup ran: the `git_strategy:` block in `.agents/project.yaml` was written with the fields that apply to the resolved strategy (strategy / branches / decisions / policy / protected / branch_prefixes / description / meta), preserving the rest of the file.

---

## Reference files

| File                                 | When to read                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/branching-strategies.md` | Full catalogue of the 7 strategies + detection signals + trade-offs + chained-PR decision tree. Read when resolving strategy or planning a chain.      |
| `references/strategy-setup.md`       | Strategy Setup (3.6) mechanics: decision questionnaire detail, per-strategy materialization table, ff-sync mechanics (never force), persist sequence, report format. Read when running or re-running Strategy Setup. |
| `references/conventional-commits.md` | Full type vocabulary, scope rules, breaking-change syntax, mixed-changes precedence. Read when proposing commits.                                      |
| `references/pr-templating.md`        | PR body template, placeholder rules, label / reviewer / draft conventions, multi-strategy base-branch table. Read when opening a PR.                   |
| `references/conflict-resolution.md`  | Per-conflict-type playbooks (merge / rebase / push-rejected / detached-HEAD / stash / unrelated histories / hook rejection). Read when Step 3.5 fires. |
| `references/worktrees.md`            | Git worktrees for isolated/parallel work — manual git + Claude Code `EnterWorktree`/`ExitWorktree`, the untracked-files gotcha, multi-session safety, cleanup, decision guide. Read when isolating work or running parallel sessions. |

Read references on demand — do not load them all upfront. Each file is self-contained.
