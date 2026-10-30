---
id: git
title: "Git workflow and strategy"
load_when: "any git, branch, commit, push, pull request, merge, rebase or conflict intent"
triggers: ["\\bgit\\b", "\\bcommit", "\\bpush", "\\bPRs?\\b", "\\bamend", "pull request", "\\bbranch", "\\brama\\b", "\\bmerge", "\\brebase", "\\bconflict", "conflicto"]
paths: [".husky/", ".github/"]
---

# Git workflow and strategy

> Section `git` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 11. GIT WORKFLOW: POINTERS

Git / PR work → `/git-flow-master` auto-loads. Full details in `.agents/skills/git-flow-master/` + `docs/workflows/git-flow.md` if present.

> **Active strategy + branch policy = the `git_strategy:` block in `.agents/project.yaml`** (source of truth): `git_strategy.strategy` names the flow, `meta.strategy_source` says whether anyone chose it (`inherited` = shipped default, `/git-flow-master` offers Strategy Setup). An adopted app's real branches and rulesets are read by Strategy Setup, never assumed from this table.

**Branch roles** (names come from `git_strategy.branches`; `main` and `staging` below are the conventional names):

| Branch      | Role                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`      | Production: whatever `git_strategy.branches.production` names. PRs merged from the integration branch or `feat/*` after review.               |
| `staging`   | Integration branch for AI commits + pre-release validation: whatever `git_strategy.branches.integration` names (`develop`, `dev`, …), ONLY when it names one (null under `solo-main`). |
| `feat/*`    | Task-specific. Use `feat/TICKET-ID-desc` (prefix table: `/git-flow-master` §3.1).                                                             |
| `fix/*`     | Bug-fix branches. Use `fix/TICKET-ID-desc`.                                                                                                   |

**Critical commit rules**:

- Semantic prefixes: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`
- One commit = one responsibility. Clear messages.
- **`Docs-Checked: <label> <reason>`** (ADR-0017) goes ABOVE the two forensic trailers, only when a change touched a `LINT.IfChange(<label>)` region and the pages it names still hold. NEVER by reflex and never without the reason: it is the escape the pre-push and CI documentation-contract gate accepts, and the drift sweep counts every one. binding: `/git-flow-master`
- Branch + commit + push + PR + conflict-fix + chained-PR planning all in `/git-flow-master`.
- Branch-protection parity: `bun run git:policy verify` reconciles `git_strategy` against the host ruleset; `apply` writes it (dry run until `--yes`). See `git-flow-master/references/ruleset-parity.md`.
- See `AGENTS.md` §1 #3-#5 for NO-AI-attribution + push-to-protected policy (`direct_push_to_protected`) + git-history rules.

---

## Git Strategy

> **Source of truth: the `git_strategy:` block in `.agents/project.yaml`.** `git-flow-master` reads it before any git/gh operation and adapts every branch / commit / push / PR / conflict-fix to the strategy declared there. NEVER define branch policy in `AGENTS.md` or in an instruction section: edit the `git_strategy:` block.
>
> The block ships **filled** (`strategy: solo-main`) as a sane default — `meta.strategy_source` says whether anyone actually chose it: `inherited` = shipped placeholder (a fresh project is seeded from `.agents/project.schema.yaml`, which carries `inherited` + `policy_source: declared` + `policy_verified: null` and an empty `accepted_divergences`: `seedProjectYamlFromSchema` in `packages/create-agentic-dev/src/prepare.ts`); `chosen` = Strategy Setup actually ran. On `inherited` (or a `null` strategy), `git-flow-master` OFFERS "Strategy Setup" on the first git intent and fills the block (it never auto-picks). `project.yaml` is frozen by `bun sync` (updater `bootstrapOnlyPaths`), so every project keeps its own strategy.

A repository's own reading of its strategy (why it chose it, and any divergence it accepted in `policy.accepted_divergences`) is project prose: it lives in the project-owned `.agents/instructions/agent-project.md` under `## Git Strategy (this repository)`, never in this synced section.
