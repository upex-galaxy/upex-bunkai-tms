# Deployment verification — wait for a deploy to be READY

The canonical pattern for "I just pushed; is my deploy live yet?" — without races, without grep, without ANSI corruption.

## The core script

```bash
# Find the deploy that corresponds to YOUR commit, then block until it terminates
SHA=$(git rev-parse HEAD)
URL=""
for i in $(seq 1 12); do
  URL=$(vercel ls -m githubCommitSha="$SHA" --format json 2>/dev/null \
        | jq -r '.deployments[0].url // empty' \
        | sed 's|^|https://|')
  [ -n "$URL" ] && break
  sleep 5
done
[ -z "$URL" ] && { echo "no deployment found for $SHA after 60s — check the Vercel webhook fired"; exit 1; }

# Block until READY / ERROR / CANCELED. Exit 0 means READY.
vercel inspect "$URL" --wait --timeout=10m
```

Why this shape:

- **`-m githubCommitSha=<sha>`** is the only filter that uniquely identifies "this commit's deploy". Branch filters mix old + new deploys; URL parsing is fragile.
- **`--format json` + `jq`** sidesteps ANSI color codes and column-width truncation in the default human table.
- **Outer poll loop** because Vercel takes 5–15 seconds after a push to register the deployment in `vercel ls`. Without the loop, the first call returns an empty array and the script aborts.
- **`vercel inspect --wait`** blocks until terminal state. The default (no `--wait`) returns immediately with whatever state the deploy is in RIGHT NOW — usually `BUILDING`, which tells you nothing.
- **`--timeout=10m`** because Next.js + Supabase builds occasionally exceed 5 minutes on first cold cache.

## Stream the build log while waiting

```bash
vercel inspect "$URL" --wait --logs --timeout=10m
```

`--logs` interleaves the build output line-by-line as the build proceeds. Use this when:

- You expect the build to fail and want the error visible immediately, not after a 10-minute block.
- You're debugging slow build phases (cache misses, regenerating `node_modules`, OpenAPI codegen).

If the build succeeds, the exit code is still 0 and the URL is ready to smoke-test.

## Status filter values (UPPERCASE — exact)

```
READY         — built and serving traffic
BUILDING      — in progress
INITIALIZING  — queued, about to start
QUEUED        — waiting for a free builder
ERROR         — build or runtime startup failed
CANCELED      — superseded by a newer commit OR manually canceled
```

Filter examples:

```bash
# What's currently building on this branch?
vercel ls -m githubCommitBranch=develop --status BUILDING --format json

# Last 5 production deploys that errored
vercel ls --prod --status ERROR --format json | jq '.deployments[:5]'
```

Lowercase variants (`ready`, `building`) return EMPTY with no error. Watch for this.

## Anti-pattern — NEVER grep `vercel ls` output

```bash
# DO NOT DO THIS
URL=$(vercel ls | grep -oE "https://[^ ]+" | head -1)
```

Two reasons it fails:

1. **ANSI color codes** wrap URLs in escape sequences. The regex above either misses the URL entirely or captures it with `\x1b[...]` prefixes / suffixes that are not valid URLs.
2. **Old / new deploys collide.** Without a metadata filter, the top entry might be yesterday's preview for a sibling branch.

The correct shape is always `-m <key>=<value> --format json | jq`. The metadata filter narrows to YOUR deploy; JSON output is ANSI-free.

## Smoke test once READY

```bash
# Replace https://your-app.vercel.app with the URL returned above
curl -sSf -o /dev/null -w "HTTP %{http_code}\n" "$URL"
# Or the app's health endpoint, if it has one
curl -sSf "$URL/api/health" | jq
```

A `READY` deploy that returns 5xx on every route usually means an env var is missing on the Vercel scope — see `env-vars.md`.

## Exit code semantics (for CI)

| `vercel inspect --wait` exit code | Meaning                                  | CI action                                                                |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| 0                                 | READY                                    | Proceed to smoke test / promote / notify                                  |
| non-zero                          | ERROR / CANCELED / TIMEOUT               | Fail the pipeline; capture `vercel inspect "$URL" --logs` in the artifact |

## When the URL never shows up

If the 60s poll loop completes with `URL=""`:

1. **Vercel webhook didn't fire.** Check the GitHub Settings → Webhooks page for the Vercel webhook delivery. Re-deliver if it shows a 4xx/5xx.
2. **Wrong branch in Vercel project settings.** If `develop` is set as the production branch but you pushed to `staging`, no preview is created.
3. **Vercel project not linked to the repo.** Check `.vercel/project.json` / `.vercel/repo.json` exist; if not, defer to `/deploy-to-vercel`.

## Reference

- `vercel inspect` docs: <https://vercel.com/docs/cli/inspect>
- `vercel ls` docs: <https://vercel.com/docs/cli/list>
- Deployment metadata (`-m` filters): <https://vercel.com/docs/cli/list#options>
