# Strategy Setup — Mechanics (questionnaire, materialization, sync, persist, report)

This file is the heavy reference behind operation **3.6 Strategy Setup** in `SKILL.md`. The SKILL.md section holds WHEN and the six-step flow; this file holds HOW. Per-strategy `git_strategy` field values live in `references/branching-strategies.md` → "git_strategy field rules (per strategy)" — this file does not duplicate them.

Strategy Setup is **detection + questionnaire → conditional materialization → write the `git_strategy:` block in `.agents/project.yaml`** (in place; preserve the rest of the file; create the block if missing — NEVER a separate file). Nothing is baked in. A single-branch strategy creates no branches and writes a minimal block (integration null, all decisions `n/a`); a strategy with an integration branch creates/syncs exactly the branches its row in the materialization table requires and records them in the block.

---

## 1. Decision questionnaire — full detail

Run after the strategy slug is resolved (Step 2). Ask the questions in order. For each question: if its `git_strategy.decisions.*` field in `.agents/project.yaml` is already set (not `n/a`/empty), SKIP it (idempotent — Q4 is keyed off `git_strategy.policy.*` being already populated). If the question does not apply to the resolved strategy (gating column below), SKIP it. Q4 (protection policy) applies to ALL strategies. Present the default first and let the user override.

### Q1 — Promotion method, integration → production

- **Applies to**: strategies that have an integration branch separate from production — `main-integration`, `gitlab-flow`, `enterprise`, and `gitflow` (where the `develop → main` release is the promotion).
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based` (no integration branch).
- **Options (default first)**:
  1. **Fast-forward only** — production is always a pure ancestor of integration; promotion is `git merge --ff-only`. Keeps the two branches byte-identical at release. This is the default.
  2. **Merge commit (`--no-ff`)** — promotion creates a merge commit on production. Branches are NOT byte-identical; the ancestor invariant does not hold.
  3. **Squash** — promotion squashes integration into one commit on production. Rewrites SHAs; invariant does not hold.
- **Persisted as**: `git_strategy.decisions.promote_method: ff-only|merge-commit|squash`
- **Drives**: the release runbook block, and whether the "production is an ancestor of integration" invariant is rendered (only for `ff-only`).

### Q2 — Merge method, work-branch → integration (or → trunk)

- **Applies to**: all multi-branch strategies (any strategy where work branches off something and merges back). For `trunk-based` this is work-branch → trunk.
- **Skipped for**: `solo-main` (work lands directly; PRs optional).
- **Options (default first)**:
  1. **Merge commit (`--no-ff`)** — preserves the branch topology in history. Default.
  2. **Squash** — one commit per work-branch on integration; linear history, loses intermediate commits.
  3. **Rebase + merge** — replays work-branch commits onto integration; linear history, preserves individual commits.
- **Persisted as**: `git_strategy.decisions.feature_merge: merge-commit|squash|rebase-merge`
- **Drives**: how integration history accrues; referenced by the merge-methods table in the runbook.

### Q3 — Hotfix policy

- **Applies to**: strategies with a production branch distinct from where day-to-day work lands — `main-integration`, `gitlab-flow`, `enterprise`, `gitflow`.
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based` (production IS where work lands; a hotfix is just another change).
- **Options (default first)**:
  1. **Branch off production → PR to production → back-merge to integration same day** — keeps the ff-only invariant intact. Default.
  2. **Always via integration** — hotfix flows through integration like any change; slower but no back-merge to forget.
  3. **No policy** — decide per incident (records intent to NOT standardize).
- **Persisted as**: `git_strategy.decisions.hotfix_policy: branch-off-prod-backmerge|via-integration|none`
- **Drives**: the hotfix runbook block + the invariant-maintenance note.
- **Note (one-direction flows)**: for `gitlab-flow` the "back-merge to integration" is realized as a forward-port / cherry-pick up the environment chain (`production` → `pre-production` → `main`), not a literal merge back — gitlab-flow has no back-merges.

### Q4 — Protected-branch bypass policy

- **Applies to**: **ALL strategies** (every strategy has at least one protected branch). Not gated.
- **Skipped for**: nothing — but SKIP on re-run if `git_strategy.policy.*` is already populated (non-default values already chosen).
- **Three sub-decisions** (present the default first for each):
  1. **`direct_push_to_protected`** — how the Push operation (SKILL.md 3.3) treats a direct push to a protected branch: `confirm` (default — always ask) / `forbidden` (refuse the direct push, route through a PR) / `allowed` (proceed after one confirmation). For `solo-main` the sensible default is `allowed`; for every multi-branch / PR-gated strategy the default is `forbidden`.
  2. **`admin_bypass`** — `false` (default) / `true`. A team POLICY (intent) declaring whether a repo admin may bypass the gate for urgent changes. It is NOT enforcement — real capability still depends on the GitHub user's role. When `true`, the skill may OFFER a bypass but only after re-confirming at runtime that (a) the operator is actually an admin (ASK — the skill can't know the GitHub role) and (b) the specific irreversible action. When `false`, the skill NEVER offers a bypass.
  3. **`require_pr_reviews`** — `null` (default — unspecified) / `0` / `N`. Minimum approvals before a merge to a protected branch. Informational (the skill does not enforce GitHub branch protection); recorded so the PR operation can surface the expectation.
- **Persisted as**: `git_strategy.policy.direct_push_to_protected` + `git_strategy.policy.admin_bypass` + `git_strategy.policy.require_pr_reviews`.
- **Drives**: the strictness of the Push gate (SKILL.md 3.3) and whether an admin bypass may ever be offered.
- **Per-strategy defaults**: see `references/branching-strategies.md` → "git_strategy field rules (per strategy)" (each strategy's `policy:` example).

> The Q1-Q3 defaults (ff-only / merge-commit / branch-off-prod-backmerge) are the `main-integration` worked-example choices. They are DEFAULTS. Always present them as overridable, never auto-select without showing the alternatives. The Q4 defaults (`confirm` / `false` / `null`, with `allowed` for `solo-main`) are likewise overridable.

---

## 2. Materialization table — what to ensure per strategy

For the resolved strategy, ensure the long-lived branches in this table exist. **If a branch already exists, never recreate it — only ff-sync it if it is behind its pair (Section 3).** Work-branch and on-demand branches (`feature/*`, `release/*`, `hotfix/*`) are NOT created at setup; they are created later by the Branch operation when work starts.

| Strategy           | Long-lived branches to ensure                                                   | Work-branch base                              | Promotion path                                  | Production branch |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | ----------------- |
| `solo-main`        | `main` only                                                                     | `main`                                        | n/a (direct)                                    | `main`            |
| `main-integration` | `main` + integration (`staging` / `dev` / `develop` — ask name, default `staging`) | integration                                   | integration → `main`                            | `main`            |
| `enterprise`       | `main` + integration (`feature/*`, `release/*` created on demand, NOT at setup) | integration (hotfix off `main`)               | integration → `main`; `release/*` → `main`      | `main`            |
| `trunk-based`      | `main` (trunk) only                                                             | `main` (short-lived)                          | n/a (fast merge to trunk)                       | `main`            |
| `gitflow`          | `main` + `develop`                                                              | `develop` (hotfix off `main`, release off `develop`) | `release/*` → `main` (+ back-merge to `develop`) | `main`            |
| `github-flow`      | `main` only                                                                     | `main`                                        | n/a (PR → `main`)                               | `main`            |
| `gitlab-flow`      | `main` + env branches (`pre-production`, `production`)                           | `main`                                        | `main` → `pre-production` → `production`        | `production`      |

**Branch-creation rules**:

- Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) ensure `main` only — there is nothing to create on a normal repo. No integration branch, ever.
- `main-integration`: if the integration branch is missing, ASK its name (default `staging`), then propose creating it off `main` and ff-syncing (Section 3).
- `gitflow`: ensure `develop` (create off `main` if missing); do not create `release/*` / `hotfix/*` at setup.
- `gitlab-flow`: ensure `pre-production` and `production` (create off `main` in pipeline order if missing).
- `enterprise`: ensure integration off `main`; `release/*` / `feature/*` are on-demand only.

Always **propose** each branch creation (which branch, off what, why) and wait for OK. Never `git checkout -b` / `git branch` silently.

---

## 3. Sync mechanics — fast-forward ONLY, never `--force`

A sync runs only when a long-lived pair exists (integration + production, or two env branches) and one is behind the other as a **pure ancestor**. The goal is to bring the behind branch up to the ahead branch without rewriting history.

### 3.1 Ancestry check (decide direction)

```bash
git fetch origin
git log --oneline <base>..<ahead>     # commits in <ahead> not in <base>; must be EMPTY for a ff in this direction
```

- `git log <production>..<integration>` empty → `integration` has nothing `production` lacks; `integration` is a pure ancestor of `production` and is behind, while `production` is ahead (the common `main-integration` case where integration is behind a freshly-promoted `main` — e.g. `git log main..staging` empty when `staging` is behind `main`). The behind branch (`integration`) gets fast-forwarded up to `production`.
- `git log <integration>..<production>` empty → production is a pure ancestor of integration; integration is ahead (integration has accumulated unreleased work ahead of production). The behind branch (`production`) gets fast-forwarded up to `integration`.
- **Both non-empty** → the branches have **diverged both ways** → STOP. Do NOT sync. Hand to conflict resolution (SKILL.md 3.5). Never force.

### 3.2 Fast-forward push (the only sync we perform)

When exactly one direction is empty, the behind branch can be fast-forwarded to the ahead ref:

```bash
# bring <behind-branch> up to <ahead-ref> by a fast-forward push — NO --force
git push origin <ahead-ref>:refs/heads/<behind-branch>
```

(For the local checkout of the behind branch, `git merge --ff-only <ahead-ref>` is equivalent and fails loudly if it is not a true fast-forward — use it rather than a plain `git merge` so a non-ff is rejected instead of silently creating a merge commit.)

### 3.3 Hard rules

- **NEVER `--force`, never `--force-with-lease`** in a setup sync. A sync is a fast-forward or it is not a sync.
- A push to a protected branch (integration or production) requires explicit confirmation first — a setup ff-sync push is still a push.
- Diverged-both-ways → STOP → conflict resolution. Setup does not resolve conflicts itself.

---

## 4. Persist sequence

Once branches are materialized and decisions captured, persist in this order:

1. **Write the `git_strategy:` block in `.agents/project.yaml`** in place (create the block if absent; overwrite the relevant fields if it exists; PRESERVE the rest of the file; NEVER a separate file). Populate the fields that apply to the resolved strategy (all paths nested under `git_strategy`):
   - `strategy:` — the resolved slug.
   - `branches:` — `production` (release/default branch), `integration` (long-lived integration branch name or `null`), `ephemeral_pattern` (strategy-specific on-demand trunk pattern or `null`).
   - `protected:` — branches requiring explicit confirm before a direct push.
   - `decisions:` — `promote_method` / `feature_merge` / `hotfix_policy`, each captured from Q1/Q2/Q3 or left `n/a` when the question does not apply.
   - `policy:` — `direct_push_to_protected` / `admin_bypass` / `require_pr_reviews`, captured from Q4 (applies to every strategy).
   - `branch_prefixes:` — `precedence` + naming patterns (carry the defaults unless the user overrides).
   - `description:` — the one-paragraph human summary of the flow for this repo.
   - `meta.created:` — today's date; bump `meta.setup_version` on a re-run that changes the schema.
   Per-strategy field values: `references/branching-strategies.md` → "git_strategy field rules (per strategy)".
2. **Set up local tracking** for any newly-ensured branch (`git branch --set-upstream-to=origin/<branch> <branch>` or `git checkout -b <branch> origin/<branch>`), so later operations don't re-detect.

CLAUDE.md's `## Git Strategy` section is a shipped pointer to this block — NEVER write strategy policy there. The `git_strategy:` block is the source of truth; its `description:` field is the human summary. A later Strategy Setup re-run re-reads the block and only fills the `git_strategy.decisions.*` fields still at `n/a`.

---

## 5. Report format

Close Strategy Setup with a compact report:

```
Strategy Setup complete — <strategy-slug>

Branches:
  - <branch>: created off <base> | already existed | ff-synced to <ahead-ref> (no force) | skipped (n/a for this strategy)

Decisions captured:
  - promote_method: <value | n/a>
  - feature_merge:  <value | n/a>
  - hotfix_policy:  <value | n/a>

Policy captured:
  - direct_push_to_protected: <forbidden | confirm | allowed>
  - admin_bypass: <true | false>
  - require_pr_reviews: <null | 0 | N>

Definition: .agents/project.yaml (git_strategy block, <N> fields populated)

Next: branch off <work-branch-base> to start work; the Branch operation will use this strategy automatically.
```

If a diverged pair stopped the sync, the report instead states the divergence and points to conflict resolution (3.5) — it does NOT claim a successful sync.
