# Debugging: build failures and runtime errors

When a Vercel deploy fails or starts erroring at runtime, work through this triage path.

## 1. Was it the build or the runtime?

```bash
vercel inspect "$URL"
```

The `state` field is the first signal:

| State | Layer | Next step |
| --- | --- | --- |
| ERROR | Build or runtime start | `vercel inspect "$URL" --logs` for the build log |
| READY | Deployed, but broken | `vercel logs "$URL" --follow` for runtime function logs |
| CANCELED | Superseded | Usually fine, because a newer commit replaced it. Check which one won. |

## 2. Build logs

```bash
# Full build log, one-shot
vercel inspect "$URL" --logs

# Stream the build log as it happens (combine with --wait when re-deploying)
vercel inspect "$URL" --wait --logs --timeout=10m
```

What to look for, in order:

1. `Missing required environment variable: X`: see `env-vars.md`. The key is not in the Preview or Production scope.
2. `Type error:` or `TS2322` and similar: a TypeScript build failure. Reproduce locally with the same Bun or Node version Vercel pins; Vercel reads `engines` from `package.json`.
3. `Module not found:`: a dependency mismatch. Common causes are a missing `package.json` entry, a lockfile out of sync, and monorepo `workspaces` filtering.
4. `ENOSPC` or `JavaScript heap out of memory`: the build container ran out of resources. Usually fixable by trimming the bundle (check Vercel Build Output Analysis) or moving heavy work to runtime functions.
5. `Could not connect to <supabase-host>`: `SUPABASE_URL` or `POSTGRES_HOST` points at a network the Vercel builders cannot reach. Common when staging vars were copied to production by mistake.

## 3. Runtime logs

```bash
# Follow logs in real time (Ctrl-C to stop)
vercel logs "$URL" --follow

# Filter by HTTP status
vercel logs "$URL" --output raw | grep " 5[0-9][0-9] "

# Specific function/route only
vercel logs "$URL" --output raw | grep "/api/auth/callback"
```

Useful flags:

- `--follow` or `-f`: tail mode.
- `--output raw`: strips Vercel's pretty formatting, which makes grep easier.
- `--since 1h`: last hour only.

## 4. Common Next.js + Supabase failure modes (this stack)

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build OK, every request returns 500 with `Invalid API key` | `SUPABASE_SECRET_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or their legacy pair) missing from the runtime scope | `vercel env ls preview` to confirm both keys are present; redeploy after fixing |
| `Hydration error: Text content does not match` | `NEXT_PUBLIC_APP_URL` differs between build time and runtime | Set it explicitly per environment, or read `VERCEL_URL` at runtime |
| Auth callbacks fail with `redirect_uri_mismatch` | `NEXT_PUBLIC_APP_URL` is not in the Supabase Auth redirect URL list for this environment | Supabase Dashboard, Auth, URL Configuration: add the preview or production URL |
| Build hangs at `Generating static pages` then times out | A `getStaticProps` or RSC fetch hits Supabase without auth and takes 5+ minutes | Wrap it in `try/catch` and return a placeholder, or mark the page `dynamic = 'force-dynamic'` |
| `Function exceeded 10s timeout` | The default Hobby/Pro function timeout was reached | Raise `functions.<route>.maxDuration` in `vercel.json`, or move the work to a queue |
| `MODULE_NOT_FOUND: @supabase/ssr` only on Vercel | Lockfile out of sync: local has the package, Vercel rebuilds from `package.json` without it | Re-run `bun install` and commit the lockfile |
| Cold start latency >2s on every preview | No regional preference set, so Vercel picks a region far from Supabase | Set `export const runtime = 'edge'` (if compatible) or pin the region in `vercel.json` |

## 5. Reproduce locally before re-deploying

Pushing commits only to re-test wastes build minutes. Pull the failing env into local instead:

```bash
# Mirror the preview scope locally
vercel env pull .env.preview --environment=preview

# Run the build with that env — use whatever script `package.json` defines
#   (read package.json directly; do NOT trust quoted command names — they drift)
bun run <build-script>

# Run the production server locally
bun run <start-script>
```

If the build or start fails locally with the same error, you have a reproducible loop that costs no Vercel build minutes.

## 6. Build-output analysis

After a successful deploy, the Vercel dashboard has a "Build Output" tab with:

- Per-route bundle size
- Per-function cold-start time
- Build duration breakdown (install, build, output collection)

For programmatic access, `vercel inspect "$URL" --json` returns the same data under `build.steps[]`.

## 7. Last-resort escape hatches

- Force a redeploy without cache: dashboard, "Redeploy", uncheck "Use existing Build Cache". Useful when a stale dependency lookup poisons the build.
- Roll back to the last known good deploy: `references/rollback.md`.
- Check Vercel status at <https://www.vercel-status.com>. Sometimes the build infrastructure itself is degraded and the fix is to wait.

## Reference

- `vercel logs` docs: <https://vercel.com/docs/cli/logs>
- `vercel inspect` docs: <https://vercel.com/docs/cli/inspect>
- Vercel function timeouts: <https://vercel.com/docs/functions/configuring-functions/duration>
