---
name: git-flow-master
description: "End-to-end Git operator for any branching strategy. Auto-detects the project's strategy (solo-main, main+integration, enterprise multi-branch, trunk-based, GitFlow, GitHub Flow, GitLab Flow) from .git config, branches, and an CLAUDE.md marker, then adapts every commit, branch, push, PR, conflict-fix, and chained-PR action to that strategy. Use this skill whenever the user wants to: create a branch (`crear branch`, `new feature branch`, `start work on UPEX-123`), commit changes (`commit this`, `commitear esto`, `make a commit`, `commit and push`), push code (`push`, `push to main`, `push to staging`, `subir cambios`), open a pull request (`create PR`, `open PR`, `abrir PR`, `crear pull request`, `gh pr create`), fix merge conflicts (`fix conflict`, `resolver conflicto`, `merge conflict`, `rebase conflict`, `push rejected`), plan stacked or chained PRs (`stack of PRs`, `chained PRs`, `split this PR`, `PR demasiado grande`), or pick / change a branching strategy (`git flow`, `git strategy`, `branching strategy`, `which git flow do we use`). Trigger even when the user does not say `git-flow-master` literally — if the work is git-or-PR-shaped, this is the right tool. Do NOT use for: implementing features (use /sprint-development), writing tests (use /unit-testing), product backlog refinement (use /product-management), or general code editing — git-flow-master operates strictly on the version-control layer."
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

It does not assume one branching model. The project may run on `main` only, on `main + staging`, on a multi-branch enterprise layout, or on any of the well-known flows (trunk-based, GitFlow, GitHub Flow, GitLab Flow). The skill **detects** which one is active and adapts every command accordingly. The detection is sticky: once resolved, the strategy is recorded in `CLAUDE.md` so future invocations skip the prompt.

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

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any operation below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter.
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for these Git operations? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents (PR creation, conflict resolution, chained-PR planning), inject a `## Composable Skills` block per strategy doc §6.2.

Skip step only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

---

## The five operations

Every git-flow-master invocation maps to one (or a sequence) of these five operations. Operation choice is driven by the user's request; strategy resolution shapes how each operation runs.

| Op           | Trigger phrases (examples)                              | Skill behaviour                                                                                                    |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Branch**   | "create branch", "new feature branch", "start UPEX-123" | Resolve strategy → propose name with prefix + issue key → wait for OK → checkout                                   |
| **Commit**   | "commit this", "commit and push", "make atomic commits" | Group by responsibility → propose conventional commits → wait for OK → execute one-by-one                          |
| **Push**     | "push", "push to main", "subir cambios"                 | Diagnose upstream → confirm if pushing to a protected branch → never `--force` without explicit user opt-in        |
| **PR**       | "create PR", "abrir PR", "gh pr create"                 | Pick base branch from strategy → render body inline → ask labels/reviewers → call `gh pr create`                   |
| **Conflict** | "fix conflict", "rebase failed", "push rejected"        | Diagnose first (see `references/conflict-resolution.md`) → present options → guide resolution → verify clean state |

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

1. **Marker in `CLAUDE.md`** — search for `<!-- git-flow-master:strategy:VALUE -->` where `VALUE` is one of the seven slugs. If found, use it. This is the persisted decision.
2. **Single-branch heuristic** — `git branch -a` shows only `main` (or `master`) and no integration branch in the remote → `solo-main`.
3. **Two-branch heuristic** — exactly `main` (or `master`) + one of `{staging, dev, develop, integration}` exists upstream → `main-integration` (record the integration branch name).
4. **Multi-branch heuristic** — `main` + integration + active `feature/*` or `release/*` branches in `git branch -a` → `enterprise`.
5. **Project hints** — look for `.gitlab-ci.yml` (suggests `gitlab-flow`), `release/*` and `hotfix/*` long-lived branches (suggests `gitflow`).
6. **Fallback** — ask the user. Show the seven options with one-line descriptions; mirror their language. Do NOT pick silently.

### Persist the decision

Once resolved (whether by detection or by asking), write the marker to `CLAUDE.md`:

- If a `## Git Strategy` section exists, update the marker line in place.
- If not, append a new section near the existing `## Git Workflow` section:

```markdown
## Git Strategy

<!-- git-flow-master:strategy:main-integration -->
<!-- git-flow-master:integration-branch:staging -->

This project uses the `main-integration` flow: feature branches merge to `staging`; `staging` merges to `main` only on release.
```

The marker is the source of truth. The prose is for humans. The user can edit either; the next invocation re-reads the marker.

If the strategy uses an integration branch with a non-default name (anything other than `staging`), record it as a second marker `<!-- git-flow-master:integration-branch:NAME -->` so commits don't have to re-detect.

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
- **No AI attribution.** No `Generated with Claude Code`, no `Co-Authored-By: Claude`, no equivalent line. Commits look human-authored. (Critical Reminder #4 in `CLAUDE.md`.)
- If a pre-commit hook fails, **stop, fix the underlying issue, create a NEW commit**. Never `--amend` a commit the hook rejected — `--amend` operates on the previous commit, which destroys context.

Present all proposed commits as one block. Wait for OK / modify / reject before executing.

### 3.3 Push

Push command depends on Step 1 output:

- No upstream → `git push -u origin {branch}`.
- Upstream behind → `git push`.
- Upstream diverged → **stop**. Do not force. Hand to conflict resolution (3.5).

**Protected-branch confirmation** — before pushing to any branch the strategy treats as protected, ask explicitly:

- `solo-main` → `main` is protected.
- `main-integration` → both `main` and the integration branch are protected.
- `gitflow` → `main` and `develop` are protected.
- `github-flow` / `trunk-based` → `main` is protected.
- `enterprise` → `main`, integration, and any `release/*` are protected.

Ask: _"You are about to push directly to the protected branch `{branch}` in a `{strategy}` flow. Confirm?"_ Wait for explicit yes.

**Never** pass `--force`, `--force-with-lease`, `--no-verify`, or any history-rewriting flag unless the user explicitly requests it AND the branch is unshared. Document the request in the conversation. (Critical Reminder #7 in `CLAUDE.md`: never rewrite pushed history.)

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
- `{{ATLASSIAN_URL}}` — base URL for the Traceability section in PR bodies. Resolves from `.agents/project.yaml`.
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
3. **No AI attribution** in commits or PR bodies. Commits look human-authored. (Critical Reminder #4 in `CLAUDE.md`.)
4. **Confirm before pushing to any protected branch.** Strategy-driven; see Step 3.3. (Critical Reminder #5 in `CLAUDE.md`.)
5. **Never force-push, never rewrite pushed history, never `--no-verify`** unless the user explicitly authorises it AND the branch is unshared. (Critical Reminder #7 in `CLAUDE.md`.)
6. **No `git add -A` / `git add .`** — always list explicit paths.
7. **Show proposed commits / branches / PR body and wait for OK** before executing. The user can accept, modify, or reject any item.
8. **`gh` CLI is the PR transport.** If `gh` is missing or unauthenticated (`gh auth status` fails), stop and surface the blocker. Do not pretend a PR was opened.
9. **PRs stop at creation.** Merging is the user's explicit next step.
10. **Strategy is sticky.** Once resolved, persist in `CLAUDE.md`. The next invocation re-reads the marker rather than asking again.
11. **Language**: artifacts (commits, branches, PR bodies, CLAUDE.md sections) in English. Mirror the user's language only in conversation.

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

---

## Pre-flight checklist (run before exiting any operation)

- [ ] Step 1 ran and the repo state was reported.
- [ ] Strategy resolved (detected from marker, inferred from layout, or asked) and persisted to `CLAUDE.md` if newly chosen.
- [ ] Branch / commit / push / PR / conflict operation followed the runbook for that strategy.
- [ ] Each commit is atomic, conventional, and free of AI attribution.
- [ ] No `git add -A` / `--force` / `--no-verify` used unless explicitly authorised.
- [ ] PR (if created) has Title <70 chars, body with Summary / Changes / Test Plan / Traceability / Risk, base branch matches strategy.
- [ ] PR URL returned to the user; no merge attempted.
- [ ] Conflicts (if any) are fully resolved AND verified (`git status` clean, `git log` sensible).

---

## Reference files

| File                                 | When to read                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/branching-strategies.md` | Full catalogue of the 7 strategies + detection signals + trade-offs + chained-PR decision tree. Read when resolving strategy or planning a chain.      |
| `references/conventional-commits.md` | Full type vocabulary, scope rules, breaking-change syntax, mixed-changes precedence. Read when proposing commits.                                      |
| `references/pr-templating.md`        | PR body template, placeholder rules, label / reviewer / draft conventions, multi-strategy base-branch table. Read when opening a PR.                   |
| `references/conflict-resolution.md`  | Per-conflict-type playbooks (merge / rebase / push-rejected / detached-HEAD / stash / unrelated histories / hook rejection). Read when Step 3.5 fires. |

Read references on demand — do not load them all upfront. Each file is self-contained.
