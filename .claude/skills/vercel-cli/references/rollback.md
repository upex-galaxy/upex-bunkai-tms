# Rollback — promote a prior deploy to production

When a production deploy breaks, the fastest fix is **rollback**: promote a prior known-good deployment to take its place. No code revert needed (yet); buy time to debug calmly.

## Decide first: rollback or revert?

| Situation                                              | Best path                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Bug only visible in production, fix unclear            | **Rollback** — flip the live deploy back, then debug in preview                                            |
| You already know the one-line fix                      | **Forward-fix** — commit + push; faster than rollback + later re-merge                                     |
| Bug in DB migration or stateful change                 | **Rollback CANNOT undo DB changes.** Roll back the deploy, then run the DB-down migration separately      |
| Bug in env var, not code                               | Fix the env var via `vercel env`, then redeploy without rebuild from cache. No rollback needed             |

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

`vercel rollback` aliases the production domain(s) to the chosen deployment URL within seconds. It does NOT delete the broken deploy — it just stops serving it on the production alias.

## Dashboard path (when CLI auth is unavailable)

1. Vercel Dashboard → Project → Deployments
2. Find a green (READY) deploy from before the breakage
3. Click the `⋯` menu on that row → **Promote to Production**
4. Confirm

Same effect as `vercel rollback`. Use this when shelling into the CLI is slower than clicking (e.g. on mobile during an incident).

## After rollback

1. **Notify**: write a one-line incident note. Even a Slack DM is enough — someone else may also be debugging.
2. **Tag the bad deploy**: in the Vercel dashboard, the broken deploy is still there. Add a label / comment naming the failure so it's not accidentally re-promoted.
3. **File the fix**: open a ticket / PR for the actual repair. Do NOT skip this step; rolled-back deploys silently rot.
4. **Forward-fix on the same branch**: once the fix lands, the normal deploy flow takes over and the new deploy supersedes the rolled-back one.

## Things rollback CANNOT do

- **Undo DB migrations.** If the broken deploy ran a migration, your DB is now in the new schema. Roll back the deploy, then either: (a) the old code is forward-compatible with the new schema (best case), or (b) you need to run a separate down-migration. Plan for this in your migration design — see `/sprint-development` Stage 12 rollback playbook.
- **Undo file uploads / queue messages / emails sent.** Side-effects of the broken code persist.
- **Restore feature-flag state.** Flag changes flipped between deploys stay flipped.

## Cross-link: sprint-development rollback playbook

`/sprint-development` Stage 12 has a full rollback procedure that covers the surrounding workflow — Jira transitions back from "Done" → "In Progress", PR comment, incident note, scheduling the forward fix. This skill's role is the **CLI execution**; the orchestrator owns the procedure.

Path: `.claude/skills/sprint-development/references/rollback-plan.md` (load via `/sprint-development` when triggered).

## Reference

- `vercel rollback` docs: <https://vercel.com/docs/cli/rollback>
- Vercel deployment promotion docs: <https://vercel.com/docs/deployments/managing-deployments>
