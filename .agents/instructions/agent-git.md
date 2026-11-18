---
id: git
title: "Git workflow and strategy"
load_when: "any git, branch, commit, push, pull request, merge, rebase or conflict intent"
triggers: ["\\bgit\\b", "\\bcommit", "\\bpush", "\\bPRs?\\b", "\\bamend", "pull request", "\\bbranch", "\\bmerge", "\\brebase", "\\bconflict"]
paths: [".husky/", ".github/"]
---

# Git workflow and strategy

> Section `git` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 11. Git workflow: pointers

Git and PR work loads `/git-flow-master` by meaning. Its details are in `.agents/skills/git-flow-master/`, plus `docs/workflows/git-flow.md` if present.

The active strategy and branch policy are the `git_strategy:` block in `.agents/project.yaml`, the source of truth. `git_strategy.strategy` names the flow, and `meta.strategy_source` says whether anyone chose it: `inherited` is the shipped default, and `/git-flow-master` then offers Strategy Setup. Strategy Setup reads an adopted app's real branches and rulesets, so never assume them from the table below.

Branch names come from `git_strategy.branches`; `main` and `staging` are the conventional names.

| Branch | Role |
|---|---|
| `main` | Production, whatever `git_strategy.branches.production` names. PRs merge into it from the integration branch or from `feat/*` after review. |
| `staging` | The integration branch for AI commits and pre-release validation, whatever `git_strategy.branches.integration` names (`develop`, `dev` and so on). It exists only when the strategy names one; under `solo-main` it is null. |
| `feat/*` | Task-specific, named `feat/TICKET-ID-desc` (prefix table: `/git-flow-master` §3.1). |
| `fix/*` | Bug fixes, named `fix/TICKET-ID-desc`. |

Commit rules:

- Use the semantic prefixes `feat:`, `fix:`, `docs:`, `test:`, `refactor:` and `chore:`.
- One commit is one responsibility, with a clear message.
- `Docs-Checked: <label> <reason>` (ADR-0017) goes above the two forensic trailers, only when a change touched a `LINT.IfChange(<label>)` region and the pages it names still hold. Never add it by reflex and never without the reason: it is the escape the pre-push and CI documentation-contract gate accepts, and the drift sweep counts every one. binding: `/git-flow-master`
- Branch, commit, push, PR, conflict fix and chained-PR planning all run through `/git-flow-master`.
- `bun run git:policy verify` reconciles `git_strategy` against the host ruleset, and `apply` writes it (a dry run until `--yes`). See `git-flow-master/references/ruleset-parity.md`.
- `AGENTS.md` §1 #3 to #5 hold the no-AI-attribution rule, the push-to-protected policy (`direct_push_to_protected`) and the git-history rules.

---

## Git Strategy

The `git_strategy:` block in `.agents/project.yaml` is the source of truth. `git-flow-master` reads it before any git or gh operation and adapts every branch, commit, push, PR and conflict fix to the strategy declared there. Branch policy is edited in that block and is never defined in `AGENTS.md` or in an instruction section. binding: `/git-flow-master`

The block ships filled (`strategy: solo-main`) as a sane default, and `meta.strategy_source` says whether anyone actually chose it. `inherited` means the shipped placeholder: a fresh project is seeded from `.agents/project.schema.yaml`, which carries `inherited`, `policy_source: declared`, `policy_verified: null` and an empty `accepted_divergences` (`seedProjectYamlFromSchema` in `packages/create-agentic-dev/src/prepare.ts`). `chosen` means Strategy Setup actually ran. On `inherited`, or a null strategy, `git-flow-master` offers Strategy Setup on the first git intent and fills the block; it never picks a strategy on its own. `bun sync` freezes `project.yaml` (updater `bootstrapOnlyPaths`), so every project keeps its own strategy.

A repository's own reading of its strategy (why it chose it, and any divergence it accepted in `policy.accepted_divergences`) is project prose. It lives in the project-owned `.agents/instructions/agent-project.md` under `## Git Strategy (this repository)`, never in this synced section.
