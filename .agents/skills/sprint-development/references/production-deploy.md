# Production deploy (Stage 5)

Promotes the integration branch to production, gradually behind feature flags when possible. Run `pre-deploy-checklist.md` first, and keep `rollback-plan.md` at hand. This stage needs QA green on staging and explicit business approval, and it never chains automatically from Stage 4.

## Required skills

Load before the promotion: `/deploy-to-vercel` (deploy method, category `deploy`) next to T1 `/vercel-cli` (deployment verification by commit SHA, env sync, logs, rollback). When the story sends or templates email, also load `/resend-cli` (category `email`) before checking the sender and the templates on the target environment. Not installed: say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

## Process (automatic, Vercel or Railway)

```bash
# 1. Promote to production
# <production>  = git_strategy.branches.production  (.agents/project.yaml)
# <integration> = git_strategy.branches.integration (null in solo-main,
#   github-flow, trunk-based: there Stage 5 is merging the story's PR to <production>)
# Promotion method: git_strategy.decisions.promote_method, via /git-flow-master.
git checkout <production>
git pull origin <production>
git merge --ff-only <integration>   # or the method promote_method names
# Direct push to a protected branch: resolved by git_strategy.policy.direct_push_to_protected
git push origin <production>

# 2. Vercel deploys to production automatically
# Watch it in the dashboard
```

## After the deploy

1. Run the automatic smoke tests (Stage 5, post-deploy).
2. Monitor actively for the first 2 to 4 hours.
3. Validate the business metrics.

## With nobody at the keyboard

The promotion and its push are outward and hard to undo. Follow `agentic-dev-core/references/decision-protocol.md` §5.2: a person present confirms before the push, and a supervised worker leaves it to its launcher. A routine runs it only when the delegating brief names this production promotion and records the business approval. Without that, it stops after `pre-deploy-checklist.md`, reports the commits that would ship and the approvals missing, and does not wait.

## Output

- The production URL is up.
- Smoke tests pass.
- Monitoring is active.
