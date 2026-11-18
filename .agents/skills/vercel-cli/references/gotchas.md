# Gotchas: surprising CLI behaviour

What `vercel` does that trips agents and humans alike. Skim this when something behaves unexpectedly. The short versions of the rules that matter most are the compact rules in `SKILL.md`; the reasons and edge cases are here.

## 1. `vercel deploy` blocks; `vercel inspect` does not

This is the most-stepped-on rake.

```bash
vercel deploy           # blocks until build finishes — minutes
vercel inspect <url>    # returns IMMEDIATELY with current state — often "BUILDING"
```

The right shapes:

```bash
vercel deploy --no-wait           # returns URL immediately
vercel inspect <url> --wait       # blocks until terminal state (READY / ERROR / CANCELED)
```

Use `--no-wait` on deploy and `--wait` on inspect. The other pairing gives you the wrong tool for the job: a 10-minute block when you needed the URL, or a smoke test against a build that has not finished.

## 2. ANSI codes break `vercel ls | grep`

Default output is human-pretty with embedded ANSI colour escapes. A naive `grep -oE "https://[^ ]+"` either misses URLs or captures them with `\x1b[...]` prefixes and suffixes that are not valid URLs.

The fix is `--format json` on `ls`, `env ls`, `teams ls` and `projects ls`, parsed with `jq`.

```bash
# Wrong
vercel ls | grep -oE "https://[^ ]+" | head -1

# Right
vercel ls --format json | jq -r '.deployments[0].url' | sed 's|^|https://|'
```

## 3. Status filter values are UPPERCASE

```bash
vercel ls --status READY      # works
vercel ls --status ready      # returns empty, no error
```

Valid values: `READY`, `BUILDING`, `INITIALIZING`, `QUEUED`, `ERROR`, `CANCELED`. A case mismatch silently produces an empty list, which is easy to mistake for "no matching deploys".

## 4. Env-var scope is lowercase in the CLI, capitalized in the dashboard

```bash
vercel env add KEY preview production    # works (CLI form)
vercel env add KEY Preview Production    # error: "Invalid environment"
```

The dashboard labels "Preview", "Production" and "Development" are display-only. Use lowercase in scripts.

## 5. `vercel env pull` writes to `.env.local` by default

```bash
vercel env pull                            # writes ./.env.local
vercel env pull .env.preview               # writes ./.env.preview (explicit)
```

`.env.local` is in `.gitignore` by Next.js convention, and the boilerplate's `.gitignore` keeps it there, so it must never be committed. Override the filename when you want a per-environment local mirror (`.env.preview` for staging, `.env.production` for prod).

## 6. Multi-team accounts: `--scope` is required for mutations

If `vercel teams ls` shows more than one team, every mutating command needs `--scope <team-slug>`:

```bash
vercel deploy --no-wait --scope my-team
vercel env add KEY preview --scope my-team
vercel rollback <url> --scope my-team
```

The exception is a linked project: the `orgId` in `.vercel/project.json` or `.vercel/repo.json` resolves the team, and the CLI uses it automatically.

`vercel whoami` and `vercel teams ls` work without `--scope` whatever the link state.

## 7. `vercel link` without `--yes` is interactive

```bash
vercel link            # prompts: which scope? which project? new project name?
vercel link --yes      # accepts defaults (current scope, project name = current dir name)
```

In scripts always pass `--yes`. Without it the command waits on stdin and the script looks frozen.

## 8. Detecting "is this directory linked?" is only safe through a file check

These all have side effects in an unlinked directory:

```bash
vercel ls              # prompts to link (or with --yes, silently links)
vercel project inspect # same
vercel link            # obviously links
```

The only side-effect-free check is reading `.vercel/project.json` or `.vercel/repo.json` directly. See `linking.md`.

## 9. `vercel deploy --prod` asks for no confirmation

```bash
vercel deploy --prod --no-wait     # ships to production immediately
vercel deploy --prod -y --no-wait  # explicit confirm — same effect, no extra prompt
```

Vercel shows no "are you sure?" prompt for `--prod`, and there is no `--dry-run`. That makes a production deploy an outward action: run it only when a person asked for it or the delegating brief names it (`SKILL.md`, "Who approves what"). In CI, gate production deploys behind a manual approval step; GitHub Actions environment protection rules are the standard pattern.

## 10. Webhook delay: `vercel ls` is eventually consistent

After a git push the deploy takes 5 to 15 seconds to register in `vercel ls`. Poll with a retry loop (see `deployment-verification.md`). An empty first result means you queried too early, not that the deploy failed.

## 11. `vercel logs --follow` does not always exit on Ctrl-C

In a few terminal emulators and agent environments, `vercel logs --follow` ignores SIGINT and the process has to be killed. Use a timeout when a script must terminate:

```bash
timeout 60 vercel logs "$URL" --follow || true
```

## 12. `vercel.json` is optional but loaded if present

This boilerplate ships no `vercel.json`. A downstream project that adds one overrides the defaults for `buildCommand`, `outputDirectory`, `installCommand`, `framework`, `regions`, `functions.<route>.maxDuration`, `rewrites`, `redirects`, `headers` and `crons`.

Most settings have a dashboard equivalent, and `vercel.json` wins when both are set.

## 13. Build cache can mask env-var changes

After changing `NEXT_PUBLIC_*` env vars and redeploying, the build cache may serve the old bundled values. Force a fresh build:

```bash
vercel deploy --no-wait --force        # rebuild, ignore cache
```

Or in the dashboard: Redeploy, then uncheck "Use existing Build Cache".

## 14. `vercel pull` and `vercel env pull` are different commands

```bash
vercel pull                # downloads .vercel/.env.* files (project settings + env)
vercel env pull            # only env vars to .env.local
```

`vercel pull` is broader: it also writes `.vercel/output` config. Use `vercel env pull` when you only want the env values.

## 15. CLI version churn: flag shapes shift across majors

Examples:

- `--confirm` was renamed `--yes` (the old name is still accepted as an alias).
- The deploy-metadata flag `--meta` was renamed `-m` (both work).
- `--scope` replaced `--team` in v28 and later.

Pin the CLI in CI:

```yaml
# .github/workflows/*.yml
- run: bun add -g vercel@^33
```

Read the `vercel --version` output before adopting a script from elsewhere.

## Reference

- `vercel` CLI docs index: <https://vercel.com/docs/cli>
- Release notes (flag changes): <https://github.com/vercel/vercel/releases>
