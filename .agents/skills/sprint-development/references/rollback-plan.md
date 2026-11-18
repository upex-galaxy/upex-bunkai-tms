# Rollback plan (Stage 5)

The runbook for when a production deploy goes bad: put the last known-good deployment back, then find out why.

## When to roll back

- Smoke tests fail in production.
- Critical errors are reported.
- Performance degrades significantly.
- A security bug is found.

## Process

### Vercel

```bash
# 1. In the Vercel dashboard:
# - Find the previous working deployment
# - Click "Promote to Production"
# - Or use the CLI:
vercel rollback [deployment-url]
```

With `{{stack.hosting}}` other than `vercel`, use that host's rollback. A deploy rollback does not revert a database change. If the deploy applied one, undoing it is a new, destructive change that the user confirms and that is applied according to `agentic-dev-core/references/db-change-doctrine.md`.

### After the rollback

1. Check that production works.
2. Investigate the cause.
3. Fix it on the integration branch (`git_strategy.branches.integration`; in a PR to production when that is null).
4. Re-test in the integration environment.
5. Deploy again when ready.

## With nobody at the keyboard

A rollback changes what production serves, so it is an outward action. Follow `agentic-dev-core/references/decision-protocol.md` §5.2: run it when a person asked or the delegating brief names it (the brief that authorized the production deploy should name its rollback too). A routine without that finds the previous good deployment, reports it with the failing state (which check went red and what it showed) and the exact rollback command, and stops. The report goes out at once, so a person can run it.

## Output

- Production is stable.
- A root cause analysis (RCA) is documented.
