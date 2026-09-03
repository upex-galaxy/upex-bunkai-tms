# Debugging — build failures + runtime errors

When a Vercel deploy fails or starts erroring at runtime, work through this triage path.

## 1. Was it the build or the runtime?

```bash
vercel inspect "$URL"
```

The `state` field is the first signal:

| State    | Layer                  | Next step                                                       |
| -------- | ---------------------- | --------------------------------------------------------------- |
| ERROR    | Build OR runtime start | `vercel inspect "$URL" --logs` for build log                    |
| READY    | Deployed, but broken   | `vercel logs "$URL" --follow` for runtime function logs         |
| CANCELED | Superseded             | Usually fine — a newer commit replaced it. Verify which won.    |

## 2. Build logs

```bash
# Full build log, one-shot
vercel inspect "$URL" --logs

# Stream the build log as it happens (combine with --wait when re-deploying)
vercel inspect "$URL" --wait --logs --timeout=10m
```

What to look for, in order:

1. **`Missing required environment variable: X`** → `env-vars.md`. The key isn't in the Preview / Production scope.
2. **`Type error:`** / **`TS2322`** etc. → TypeScript build failure. Reproduce locally with the same Bun / Node version Vercel pins. Vercel reads `engines` from `package.json`.
3. **`Module not found:`** → dependency mismatch. Common causes: missing `package.json` entry; lockfile out of sync; monorepo `workspaces` filtering.
4. **`ENOSPC` / `JavaScript heap out of memory`** → Build container exhausted resources. Usually fixable by trimming the bundle (check Vercel Build Output Analysis) or moving heavy work to runtime functions.
5. **`Could not connect to <supabase-host>`** → `SUPABASE_URL` or `POSTGRES_HOST` points at a network that isn't reachable from Vercel builders. Common when copying staging vars to production by mistake.

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

- `--follow` / `-f` — tail mode
- `--output raw` — strip Vercel's pretty formatting; easier to grep
- `--since 1h` — last hour only

## 4. Common Next.js + Supabase failure modes (this stack)

| Symptom                                                                            | Likely cause                                                                                                                                  | Fix                                                                                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Build OK, every request returns 500 with `Invalid API key`                          | `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing from runtime scope                                                     | `vercel env ls preview` → confirm both keys present; re-deploy after fixing                          |
| `Hydration error: Text content does not match`                                     | `NEXT_PUBLIC_APP_URL` differs between build-time and runtime                                                                                  | Either set it explicitly per-environment, or read `VERCEL_URL` at runtime                            |
| Auth callbacks fail with `redirect_uri_mismatch`                                   | `NEXT_PUBLIC_APP_URL` not registered in the Supabase Auth redirect URL list for this environment                                              | Supabase Dashboard → Auth → URL Configuration → add the preview / production URL                     |
| Build hangs at `Generating static pages` then times out                            | A `getStaticProps` / RSC fetch is hitting Supabase without auth, taking 5+ minutes                                                            | Wrap in `try/catch`, return placeholder, or mark the page `dynamic = 'force-dynamic'`                |
| `Function exceeded 10s timeout`                                                    | Default Hobby/Pro function timeout reached                                                                                                    | Raise in `vercel.json` `functions.<route>.maxDuration`, or move the work to a queue                  |
| `MODULE_NOT_FOUND: @supabase/ssr` only on Vercel                                   | Lockfile out of sync — local has the package, Vercel rebuild from `package.json` doesn't                                                       | Re-run `bun install`, commit the lockfile                                                            |
| Cold start latency >2s on every preview                                            | No regional preference set; Vercel picks a region far from Supabase                                                                            | Set `export const runtime = 'edge'` (if compatible) or pin region in `vercel.json`                   |

## 5. Reproduce locally before re-deploying

Don't push commits just to re-test. Pull the failing env into local:

```bash
# Mirror the preview scope locally
vercel env pull .env.preview --environment=preview

# Run the build with that env — use whatever script `package.json` defines
#   (read package.json directly; do NOT trust quoted command names — they drift)
bun run <build-script>

# Run the production server locally
bun run <start-script>
```

If the build / start fails locally with the same error, you have a reproducible loop without burning Vercel build minutes.

## 6. Build-output analysis

After a successful deploy, the Vercel dashboard shows a "Build Output" tab with:

- Per-route bundle size
- Per-function cold-start time
- Build duration breakdown (install, build, output collection)

For programmatic access, `vercel inspect "$URL" --json` returns the same data under `build.steps[]`.

## 7. Last-resort escape hatches

- **Force-redeploy without cache**: dashboard → "Redeploy" → uncheck "Use existing Build Cache". Useful when a stale dependency lookup is poisoning the build.
- **Roll back to last known good**: `references/rollback.md`.
- **Check Vercel status**: <https://www.vercel-status.com> — sometimes the build infra itself is degraded and the fix is to wait.

## Reference

- `vercel logs` docs: <https://vercel.com/docs/cli/logs>
- `vercel inspect` docs: <https://vercel.com/docs/cli/inspect>
- Vercel function timeouts: <https://vercel.com/docs/functions/configuring-functions/duration>
