# Rollback: promote a prior deploy to production

When a production deploy breaks, the fastest fix is a rollback: promote a known-good earlier deployment to take its place. No code revert is needed yet, and you buy time to debug calmly.

A rollback changes what production serves, so it is an outward action. Run it when a person asked for it or the delegating brief names it. A routine with neither finds the previous good deploy (step 1 below), reports it with the failing state, and stops (`SKILL.md`, "Who approves what").

## Decide first: rollback or revert?

| Situation | Best path |
| --- | --- |
| Bug only visible in production, fix unclear | Rollback: flip the live deploy back, then debug in preview |
| You already know the one-line fix | Forward-fix: commit and push, which is faster than rollback plus a later re-merge |
| Bug in a DB migration or stateful change | Rollback cannot undo DB changes. Roll back the deploy, then run the DB-down migration separately |
| Bug in an env var, not code | Fix the env var with `vercel env`, then redeploy without the build cache. No rollback needed |

## CLI path

```bash
# 1. Find the previous production deploy (the one before the broken one)
vercel ls --prod --format json | jq -r '.deployments[1] | .url'    # [0] is current, [1] is previous

# Or filter by READY only
vercel ls --prod --status READY --format json \
  | jq -r '.deployments[] | "\(.createdAt) \(.url) \(.meta.githubCommitSha)"' \
  | head -5

# 2. Promote that deploy
vercel rollback https://your-app-abc123.vercel.app

# 3. Verify the rollback completed
vercel inspect https://your-app.vercel.app --wait --timeout=2m   # the production alias
```

`vercel rollback` points the production domain(s) at the chosen deployment URL within seconds. It does not delete the broken deploy; it only stops serving it on the production alias.

## Dashboard path (when CLI auth is unavailable)

1. Vercel Dashboard, Project, Deployments.
2. Find a green (READY) deploy from before the breakage.
3. Open the `⋯` menu on that row and choose **Promote to Production**.
4. Confirm.

The effect is the same as `vercel rollback`. Use it when the CLI is slower than clicking, for example on mobile during an incident.

## After rollback

1. Notify. A one-line incident note is enough, even a Slack DM, because someone else may be debugging the same thing.
2. Tag the bad deploy. It is still in the dashboard, so add a label or comment naming the failure to keep it from being promoted again by accident.
3. File the fix. Open a ticket or PR for the real repair, because rolled-back deploys rot silently if nobody does.
4. Forward-fix on the same branch. Once the fix lands, the normal deploy flow takes over and the new deploy supersedes the rolled-back one.

## Things rollback cannot do

- Undo DB migrations. If the broken deploy ran a migration, the DB is in the new schema. Roll back the deploy, then either rely on the old code being forward-compatible with the new schema (best case) or run a separate down-migration. Plan for this in the migration design; see the `/sprint-development` Stage 5 rollback playbook.
- Undo file uploads, queue messages or emails already sent. Side effects of the broken code persist.
- Restore feature-flag state. Flags flipped between deploys stay flipped.

## Cross-link: sprint-development rollback playbook

`/sprint-development` Stage 5 has the full rollback procedure for the surrounding workflow: ticket transitions back from Done to In Progress, the PR comment, the incident note and scheduling the forward fix. This skill runs the CLI commands, and the orchestrator owns the procedure.

Path: `.agents/skills/sprint-development/references/rollback-plan.md` (load it through `/sprint-development` when triggered).

## Reference

- `vercel rollback` docs: <https://vercel.com/docs/cli/rollback>
- Vercel deployment promotion docs: <https://vercel.com/docs/deployments/managing-deployments>
