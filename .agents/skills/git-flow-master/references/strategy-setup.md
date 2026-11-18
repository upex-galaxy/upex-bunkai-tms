# Strategy setup: mechanics (questionnaire, materialization, sync, persist, report)

This is the reference behind operation 3.6 Strategy Setup in `SKILL.md`. The SKILL.md section says when to run it and gives the six-step flow. This file holds the detail. The per-strategy `git_strategy` field values live in `references/branching-strategies.md` under "git_strategy field rules (per strategy)", and this file does not repeat them.

Strategy Setup resolves the strategy, asks the decision questionnaire, materializes the branches the strategy needs, and writes the `git_strategy:` block in `.agents/project.yaml`. The write is in place: keep the rest of the file, create the block if it is missing, and never use a separate file. The block holds values only. Each key is documented in `.agents/project.schema.yaml`, not in the yaml (ADR-0021). Nothing is baked in. A single-branch strategy creates no branches and writes a minimal block (integration null, every decision `n/a`). A strategy with an integration branch creates or syncs exactly the branches its row in the materialization table needs and records them in the block.

---

## 1. Decision questionnaire

Run it after the strategy slug is resolved (Step 2), and ask the questions in order. Skip a question when its `git_strategy.decisions.*` field in `.agents/project.yaml` is already set (not `n/a` or empty), so a re-run stays idempotent. Q4 is keyed off `git_strategy.policy.*` being populated. Skip a question that does not apply to the resolved strategy (see "Applies to" below). Q4 applies to every strategy. Present the default first and let the user override it.

### Q1: promotion method, integration to production

- Applies to: strategies with an integration branch separate from production, which are `main-integration`, `gitlab-flow`, `enterprise` and `gitflow` (where the `develop` to `main` release is the promotion).
- Skipped for: `solo-main`, `github-flow` and `trunk-based`, which have no integration branch.
- Options, default first:
  1. Fast-forward only. Production is always a pure ancestor of integration, and promotion is `git merge --ff-only`. The two branches are byte-identical at release. This is the default.
  2. Merge commit (`--no-ff`). Promotion creates a merge commit on production. The branches are not byte-identical, and the ancestor invariant does not hold.
  3. Squash. Promotion squashes integration into one commit on production. SHAs are rewritten, and the invariant does not hold.
- Persisted as `git_strategy.decisions.promote_method: ff-only|merge-commit|squash`.
- It drives the release commands, and whether the "production is an ancestor of integration" invariant applies (only for `ff-only`).

### Q2: merge method, work branch to integration (or to trunk)

- Applies to: every multi-branch strategy, meaning any strategy where work branches off something and merges back. For `trunk-based` it is work branch to trunk.
- Skipped for: `solo-main`, where work lands directly and PRs are optional.
- Options, default first:
  1. Merge commit (`--no-ff`). It keeps the branch topology in history. This is the default.
  2. Squash. One commit per work branch on integration gives a linear history and loses the intermediate commits.
  3. Rebase and merge. It replays the work branch's commits onto integration, which is linear and keeps each commit.
- Persisted as `git_strategy.decisions.feature_merge: merge-commit|squash|rebase-merge`.
- It drives how integration history accrues.

### Q3: hotfix policy

- Applies to: strategies whose production branch is distinct from where day-to-day work lands, which are `main-integration`, `gitlab-flow`, `enterprise` and `gitflow`.
- Skipped for: `solo-main`, `github-flow` and `trunk-based`. Production is where work lands, so a hotfix is just another change.
- Options, default first:
  1. Branch off production, PR to production, back-merge to integration the same day. This keeps the ff-only invariant intact and is the default.
  2. Always through integration. The hotfix flows through integration like any change. It is slower, and there is no back-merge to forget.
  3. No policy. Decide per incident, which records the intent not to standardise.
- Persisted as `git_strategy.decisions.hotfix_policy: branch-off-prod-backmerge|via-integration|none`.
- It drives the hotfix commands and the note on keeping the invariant.
- For `gitlab-flow` the "back-merge to integration" is a forward-port (cherry-pick) up the environment chain, `production` to `pre-production` to `main`. Gitlab-flow has no back-merges.

### Q4: protected-branch bypass policy

- Applies to: every strategy, because each has at least one protected branch. It is not gated.
- Skipped on a re-run when `git_strategy.policy.*` is already populated (non-default values were chosen).
- It has three sub-decisions, each with its default first:
  1. `direct_push_to_protected` sets how the Push operation (SKILL.md 3.3) treats a direct push to a protected branch. `confirm` (default) always asks. `forbidden` refuses the direct push and routes it through a PR. `allowed` is a standing authorization: push without a per-push confirm, and the recorded value is the authorization. The sensible default for `solo-main` is `allowed`, and for every multi-branch or PR-gated strategy it is `forbidden`.
  2. `admin_bypass` is `false` (default) or `true`. It is a team policy (intent) on whether a repo admin may bypass the gate for urgent changes, and it does not enforce anything, because real capability depends on the GitHub user's role. With `true`, the skill may offer a bypass, but only after re-confirming at runtime that the operator is an admin (ask, because the skill cannot know the GitHub role) and which irreversible action is meant. With `false`, the skill offers no bypass.
  3. `require_pr_reviews` is `null` (default, unspecified), `0` or `N`: the minimum approvals before a merge to a protected branch. It records the team's expectation. Section 4.5 can now materialize these answers onto the host, so the gap between expectation and enforcement closes in the same run. `bun run git:policy verify` confirms what the host enforces and is what stamps `meta.policy_source: verified`.
- Persisted as `git_strategy.policy.direct_push_to_protected`, `git_strategy.policy.admin_bypass` and `git_strategy.policy.require_pr_reviews`, plus `git_strategy.meta.policy_verified` and `meta.policy_source`. Step 1b writes those two, not this questionnaire, and Setup always leaves `policy_source: declared`.
- It drives how strict the Push gate (SKILL.md 3.3) is, and whether an admin bypass may ever be offered.
- Close Q4 with a drift warning: these three answers describe intent. Until Step 1b reconciles them with the host, do not tell the user what the remote requires. A `require_pr_reviews: 0` next to a remote that demands an approval is the drift that ambushes a merge mid-flight.
- Per-strategy defaults are in `references/branching-strategies.md` under "git_strategy field rules (per strategy)", in each strategy's `policy:` example.

The Q1 to Q3 defaults (ff-only, merge-commit, branch-off-prod-backmerge) are the `main-integration` worked-example choices. They are defaults, so present them as overridable and show the alternatives before selecting anything. The Q4 defaults (`confirm`, `false`, `null`, with `allowed` for `solo-main`) are overridable in the same way.

---

## 2. Materialization table

For the resolved strategy, make sure the long-lived branches in this table exist. A branch that already exists is never recreated. It is only fast-forward synced when it is behind its pair (Section 3). Work branches and on-demand branches (`feature/*`, `release/*`, `hotfix/*`) are not created at setup. The Branch operation creates them when work starts.

| Strategy           | Long-lived branches to ensure                                                   | Work-branch base                              | Promotion path                                  | Production branch |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | ----------------- |
| `solo-main`        | `main` only                                                                     | `main`                                        | n/a (direct)                                    | `main`            |
| `main-integration` | `main` + integration (`staging` / `dev` / `develop`: ask the name, default `staging`) | integration                                   | integration → `main`                            | `main`            |
| `enterprise`       | `main` + integration (`feature/*`, `release/*` created on demand, not at setup) | integration (hotfix off `main`)               | integration → `main`; `release/*` → `main`      | `main`            |
| `trunk-based`      | `main` (trunk) only                                                             | `main` (short-lived)                          | n/a (fast merge to trunk)                       | `main`            |
| `gitflow`          | `main` + `develop`                                                              | `develop` (hotfix off `main`, release off `develop`) | `release/*` → `main` (+ back-merge to `develop`) | `main`            |
| `github-flow`      | `main` only                                                                     | `main`                                        | n/a (PR → `main`)                               | `main`            |
| `gitlab-flow`      | `main` + env branches (`pre-production`, `production`)                           | `main`                                        | `main` → `pre-production` → `production`        | `production`      |

Branch creation rules:

- Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) ensure `main` only, so a normal repo has nothing to create. They never get an integration branch.
- `main-integration`: if the integration branch is missing, ask its name (default `staging`), then propose creating it off `main` and fast-forward syncing it (Section 3).
- `gitflow`: ensure `develop`, created off `main` if missing. Do not create `release/*` or `hotfix/*` at setup.
- `gitlab-flow`: ensure `pre-production` and `production`, created off `main` in pipeline order if missing.
- `enterprise`: ensure integration off `main`. `release/*` and `feature/*` are on-demand only.

Propose each branch creation (which branch, off what, why) and wait for an OK before running `git checkout -b` or `git branch`. A silent branch creation is the failure to avoid, because it changes the remote's shape without anyone having agreed to it.

---

## 3. Sync mechanics: fast-forward only, never `--force`

A sync runs only when a long-lived pair exists (integration and production, or two environment branches) and one is behind the other as a pure ancestor. The goal is to bring the behind branch up to the ahead branch without rewriting history.

### 3.1 Ancestry check (decide the direction)

```bash
git fetch origin
git log --oneline <base>..<ahead>     # commits in <ahead> not in <base>; must be EMPTY for a ff in this direction
```

- When `git log <production>..<integration>` is empty, integration has nothing that production lacks. Integration is a pure ancestor of production and is behind, and production is ahead. This is the common `main-integration` case where integration trails a freshly promoted `main` (for example `git log main..staging` is empty when `staging` is behind `main`). The behind branch (integration) is fast-forwarded up to production.
- When `git log <integration>..<production>` is empty, production is a pure ancestor of integration, and integration is ahead because it holds unreleased work. The behind branch (production) is fast-forwarded up to integration.
- When both are non-empty, the branches have diverged both ways. Stop and do not sync. Hand it to conflict resolution (SKILL.md 3.5).

### 3.2 Fast-forward push (the only sync Setup performs)

When exactly one direction is empty, fast-forward the behind branch to the ahead ref:

```bash
# bring <behind-branch> up to <ahead-ref> by a fast-forward push, no --force
git push origin <ahead-ref>:refs/heads/<behind-branch>
```

For the local checkout of the behind branch, `git merge --ff-only <ahead-ref>` is equivalent. Prefer it to a plain `git merge`, because it fails loudly when the move is not a true fast-forward instead of quietly creating a merge commit.

### 3.3 Hard rules

- No `--force` and no `--force-with-lease` in a setup sync. A sync is a fast-forward or it is not a sync, and a forced push on a protected branch rewrites history others have already pulled.
- A setup fast-forward push to a protected branch (integration or production) asks first, whatever `direct_push_to_protected` says. Strategy Setup runs before the user has ratified the new `policy:` values, so `allowed` does not authorize its own setup push.
- When the pair has diverged both ways, stop and hand to conflict resolution. Setup does not resolve conflicts itself.

---

## 4. Persist sequence

Once the branches are materialized and the decisions captured, persist in this order:

1. Write the `git_strategy:` block in `.agents/project.yaml` in place. Create the block if it is absent, overwrite the relevant fields if it exists, keep the rest of the file, and never use a separate file. Fill the fields that apply to the resolved strategy, all under `git_strategy`:
   - `strategy:` is the resolved slug.
   - `branches:` holds `production` (the release or default branch), `integration` (the long-lived integration branch name, or `null`) and `ephemeral_pattern` (the strategy's on-demand trunk pattern, or `null`).
   - `protected:` lists the branches whose direct push `policy.direct_push_to_protected` gates (SKILL.md 3.3).
   - `decisions:` holds `promote_method`, `feature_merge` and `hotfix_policy`, each captured from Q1, Q2 or Q3, or left `n/a` when the question does not apply.
   - `policy:` holds `direct_push_to_protected`, `admin_bypass` and `require_pr_reviews`, captured from Q4 (every strategy).
   - `branch_prefixes:` holds `precedence` and the naming patterns. Carry the defaults unless the user overrides them.
   - `description:` is the one-paragraph human summary of the flow for this repo.
   - `meta.created:` is the date of the run. Bump `meta.setup_version` on a re-run that changes the schema. Leave `meta.policy_verified: null` and `meta.policy_source: declared`, because only a successful `bun run git:policy verify --stamp` may flip them (Section 4.5).
   - `meta.strategy_source: chosen` is stamped whenever the questionnaire actually ran. The block ships with `inherited`, and that value is the only thing separating "this project picked `solo-main`" from "this project never chose and kept the default". `strategy:` is never null, so it cannot carry that distinction. Without the stamp, the bootstrap offer keeps proposing a setup the user already completed.

   Per-strategy field values are in `references/branching-strategies.md` under "git_strategy field rules (per strategy)".
2. Set up local tracking for every branch Setup newly ensured (`git branch --set-upstream-to=origin/<branch> <branch>` or `git checkout -b <branch> origin/<branch>`), so later operations do not detect the strategy again.

The `## Git Strategy` section of `.agents/instructions/agent-git.md` is a shipped pointer to this block, and strategy policy is never written there. The `git_strategy:` block is the source of truth and its `description:` field is the human summary. A later Strategy Setup re-run re-reads the block and fills only the `git_strategy.decisions.*` fields still at `n/a`.

---

## 4.5 Materialize the policy onto the host (offer, never automatic)

The questionnaire has just captured the branch policy, and the same answers describe a GitHub ruleset. Setup can therefore close the gap between intent and enforcement instead of leaving a `declared` block to drift: one questionnaire, two artifacts.

Start read-only, because an existing repo usually has protection already:

```bash
bun run git:policy verify   # what the host enforces now vs what was just captured
```

- With no drift, say so, stamp it (`--stamp`) and stop. There is nothing to write.
- With drift, show it and then offer the write. A ruleset governs who can merge, so the operator makes that choice, and the skill does not perform the write unasked.

```bash
bun run git:policy apply         # dry run: prints the exact payload
bun run git:policy apply --yes   # writes it
```

Three rules for this step:

1. Show the dry run before proposing the write. The payload is the proposal, and a described change is not a reviewed one.
2. A refusal to loosen is a result and not an obstacle. `apply` blocks any change that removes a guard, lowers the approval bar, turns off code-owner review or widens the allowed merge methods. If `--allow-loosening` is needed, say exactly which guard is being given up and get an explicit yes for that specific thing.
3. Drift has three resolutions, and changing the host is only one of them. The yaml may be the wrong side. Or the divergence is intended, and then it is recorded in `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`, one entry per `verify` finding field, each with a reason; `references/ruleset-parity.md` §2b). `verify` then reports it as ACCEPTED, and a later session stops raising it again. The project's own `.agents/instructions/agent-project.md` under `## Git Strategy (this repository)` may add prose context, but the acceptance does not live there.

The mapping table, the derived fields, and what the tool deliberately leaves unmanaged (`bypass_actors`, `CODEOWNERS`, org-level rulesets) are in `references/ruleset-parity.md`.

---

## 5. Report format

Close Strategy Setup with a compact report:

```
Strategy Setup complete: <strategy-slug>

Branches:
  - <branch>: created off <base> | already existed | ff-synced to <ahead-ref> (no force) | skipped (n/a for this strategy)

Decisions captured:
  - promote_method: <value | n/a>
  - feature_merge:  <value | n/a>
  - hotfix_policy:  <value | n/a>

Policy captured (INTENT, not yet verified against the host):
  - direct_push_to_protected: <forbidden | confirm | allowed>
  - admin_bypass: <true | false>
  - require_pr_reviews: <null | 0 | N>
  - policy_source: declared  (Step 1b reconciles this against the host on the first push / PR intent)

Host ruleset:
  - verify: <in parity | N drift(s) reported> | not run
  - apply:  <written (ruleset <name>) | dry run shown, not written | declined | n/a>

Definition: .agents/project.yaml (git_strategy block, <N> fields populated, strategy_source: chosen)

Next: branch off <work-branch-base> to start work; the Branch operation will use this strategy automatically.
```

If a diverged pair stopped the sync, the report states the divergence and points to conflict resolution (3.5) instead, and it does not claim a successful sync.

---

## With nobody at the keyboard

Strategy Setup waits for a person at four points: the strategy choice when detection is inconclusive, the questionnaire, each branch creation, and the host-ruleset write. The decision protocol (`agentic-dev-core/references/decision-protocol.md`) says which of these reaches a person at all. Beyond that, each point has a path for the three ways the skill runs.

| Gate | A person is present | Supervised worker | Routine with nobody |
| --- | --- | --- | --- |
| Strategy choice (detection step 5) | Ask, numbered list | Ask the conductor | Use a strategy the brief names. Without one, stop before writing anything and report the detection evidence |
| Q1 to Q4 | Ask, defaults first | The conductor answers or confirms the defaults | Run only when the brief gives every answer. With any answer missing, write nothing, report the detection evidence and the open questions, and stop |
| Branch creation and setup ff-sync push | Propose, wait for OK | The conductor holds the OK | Create nothing on the remote and push nothing. A local `git branch` is reversible, but name it in the report. Report what is missing |
| `git:policy apply --yes` | Dry run, offer, wait | The conductor holds the OK | Run `verify` and the dry run only, and report the payload. The ruleset write is outward and irreversible, so it needs a person |

A brief that names the strategy and the policy values is the approval source for the `project.yaml` write. It does not cover a push or a ruleset write unless it says so.
