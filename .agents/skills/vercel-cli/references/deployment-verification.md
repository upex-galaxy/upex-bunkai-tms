# Deployment verification: wait for a deploy to be READY

The pattern for "I just pushed; is my deploy live yet?" without races, grep or ANSI corruption.

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

Why it has this shape:

- `-m githubCommitSha=<sha>` is the only filter that identifies this commit's deploy. Branch filters mix old and new deploys, and URL parsing is fragile.
- `--format json` with `jq` sidesteps ANSI colour codes and the column truncation of the human table.
- The outer loop exists because Vercel takes 5 to 15 seconds after a push to register the deployment in `vercel ls`. Without it the first call returns an empty array and the script aborts.
- `vercel inspect --wait` blocks until a terminal state. Without `--wait` it returns the state at call time, usually `BUILDING`, which tells you nothing.
- `--timeout=10m` covers Next.js + Supabase builds that occasionally pass 5 minutes on a cold cache.

## Stream the build log while waiting

```bash
vercel inspect "$URL" --wait --logs --timeout=10m
```

`--logs` interleaves the build output line by line as the build proceeds. Use it when:

- You expect the build to fail and want the error at once, not after a 10-minute block.
- You are debugging slow build phases (cache misses, rebuilding `node_modules`, OpenAPI codegen).

If the build succeeds the exit code is still 0 and the URL is ready to smoke-test.

## Status filter values (UPPERCASE, exact)

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
# What's currently building on this branch? (<branch> from git_strategy.branches, never a literal)
vercel ls -m githubCommitBranch=<branch> --status BUILDING --format json

# Last 5 production deploys that errored
vercel ls --prod --status ERROR --format json | jq '.deployments[:5]'
```

Lowercase variants (`ready`, `building`) return an empty list with no error.

## Do not grep `vercel ls` output

```bash
# Fails: do not use
URL=$(vercel ls | grep -oE "https://[^ ]+" | head -1)
```

It fails for two reasons:

1. ANSI colour codes wrap URLs in escape sequences, so the regex misses the URL or captures it with `\x1b[...]` prefixes and suffixes that are not valid URLs.
2. Old and new deploys collide. With no metadata filter, the top entry may be yesterday's preview of a sibling branch.

The working shape is `-m <key>=<value> --format json | jq`. The metadata filter narrows the list to your deploy, and JSON output has no ANSI.

## Smoke test once READY

```bash
# Replace https://your-app.vercel.app with the URL returned above
curl -sSf -o /dev/null -w "HTTP %{http_code}\n" "$URL"
# Or the app's health endpoint, if it has one
curl -sSf "$URL/api/health" | jq
```

A `READY` deploy that returns 5xx on every route usually lacks an env var on that Vercel scope. See `env-vars.md`.

## Exit code semantics (for CI)

| `vercel inspect --wait` exit code | Meaning | CI action |
| --- | --- | --- |
| 0 | READY | Proceed to smoke test, promote or notify |
| non-zero | ERROR / CANCELED / TIMEOUT | Fail the pipeline; capture `vercel inspect "$URL" --logs` in the artifact |

## When the URL never shows up

If the 60-second poll loop ends with `URL=""`:

1. The Vercel webhook did not fire. Check the delivery list under GitHub Settings, Webhooks, and re-deliver if it shows a 4xx or 5xx.
2. The Vercel project has the wrong production branch. If `staging` is set as the production branch in Vercel, a push to it builds a production deploy instead of a preview.
3. The Vercel project is not linked to the repo. Check that `.vercel/project.json` or `.vercel/repo.json` exists; if not, defer to `/deploy-to-vercel`.

## Reference

- `vercel inspect` docs: <https://vercel.com/docs/cli/inspect>
- `vercel ls` docs: <https://vercel.com/docs/cli/list>
- Deployment metadata (`-m` filters): <https://vercel.com/docs/cli/list#options>
