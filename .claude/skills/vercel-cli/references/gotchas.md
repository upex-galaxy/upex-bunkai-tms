# Gotchas — surprising CLI behaviors

The full list of things `vercel` does that trip agents and humans alike. Skim this when something behaves unexpectedly.

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

Memorize: **`--no-wait` on deploy, `--wait` on inspect**. Anything else is the wrong tool for the job.

## 2. ANSI codes break `vercel ls | grep`

Default output is human-pretty with embedded ANSI color escapes. A naive `grep -oE "https://[^ ]+"` either misses URLs or captures them with `\x1b[...]` prefixes/suffixes that aren't valid URLs.

**Fix:** always pass `--format json` to `ls`, `env ls`, `teams ls`, `projects ls`, and parse with `jq`.

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

Valid values: `READY`, `BUILDING`, `INITIALIZING`, `QUEUED`, `ERROR`, `CANCELED`. Case mismatch silently produces an empty list — easy to mistake for "no matching deploys".

## 4. Env-var scope is lowercase in CLI, capitalized in dashboard

```bash
vercel env add KEY preview production    # works (CLI form)
vercel env add KEY Preview Production    # error: "Invalid environment"
```

The dashboard label "Preview" / "Production" / "Development" is display-only. Always use lowercase in scripts.

## 5. `vercel env pull` writes to `.env.local` by default

```bash
vercel env pull                            # writes ./.env.local
vercel env pull .env.preview               # writes ./.env.preview (explicit)
```

`.env.local` is in `.gitignore` per Next.js convention. The boilerplate's `.gitignore` keeps it that way. **Never commit it.** Override the filename if you need a per-environment local mirror (e.g. `.env.preview` for staging, `.env.production` for prod).

## 6. Multi-team accounts: `--scope` is required for mutations

If `vercel teams ls` shows >1 team, every mutating command needs `--scope <team-slug>`:

```bash
vercel deploy --no-wait --scope my-team
vercel env add KEY preview --scope my-team
vercel rollback <url> --scope my-team
```

EXCEPT when the project is already linked — `.vercel/project.json` / `.vercel/repo.json` `orgId` resolves the team. The CLI uses the linked team automatically.

`vercel whoami` and `vercel teams ls` always work without `--scope` regardless of link state.

## 7. `vercel link` without `--yes` is interactive

```bash
vercel link            # prompts: which scope? which project? new project name?
vercel link --yes      # accepts defaults (current scope, project name = current dir name)
```

In scripts, ALWAYS pass `--yes`. Without it, the command hangs waiting on stdin and the script appears frozen.

## 8. Detecting "is this directory linked?" — only safe via file check

These all have side-effects in an unlinked directory:

```bash
vercel ls              # prompts to link (or with --yes, silently links)
vercel project inspect # same
vercel link            # obviously links
```

The only side-effect-free check is reading `.vercel/project.json` / `.vercel/repo.json` directly. See `linking.md`.

## 9. `vercel deploy --prod` without confirmation

```bash
vercel deploy --prod --no-wait     # ships to production immediately
vercel deploy --prod -y --no-wait  # explicit confirm — same effect, no extra prompt
```

Vercel does NOT show a "are you sure?" prompt for `--prod`. There is no `--dry-run`. In scripted workflows, gate production deploys behind a manual approval step in CI (GitHub Actions environment protection rules are the standard pattern).

## 10. Webhook delay: `vercel ls` is eventually consistent

After a git push, it takes 5–15 seconds for the deploy to register in `vercel ls`. Always poll with a retry loop (see `deployment-verification.md`). The first call returning empty does NOT mean the deploy failed — it usually means you queried too early.

## 11. `vercel logs --follow` does not exit on Ctrl-C cleanly in some shells

In a few terminal emulators / agent environments, `vercel logs --follow` sometimes ignores SIGINT and you have to kill the process. Use a timeout if running in a script that needs to terminate:

```bash
timeout 60 vercel logs "$URL" --follow || true
```

## 12. `vercel.json` is optional but loaded if present

This boilerplate does NOT ship a `vercel.json`. If a downstream project adds one, it overrides defaults for: `buildCommand`, `outputDirectory`, `installCommand`, `framework`, `regions`, `functions.<route>.maxDuration`, `rewrites`, `redirects`, `headers`, `crons`.

Most settings have a dashboard equivalent — `vercel.json` wins over dashboard when both are set.

## 13. Build cache can mask env-var changes

If you change `NEXT_PUBLIC_*` env vars and redeploy, the build cache may serve the old bundled values. Force a fresh build:

```bash
vercel deploy --no-wait --force        # rebuild, ignore cache
```

Or in the dashboard: Redeploy → uncheck "Use existing Build Cache".

## 14. `vercel pull` vs `vercel env pull` — different commands

```bash
vercel pull                # downloads .vercel/.env.* files (project settings + env)
vercel env pull            # only env vars to .env.local
```

`vercel pull` is broader — it also writes `.vercel/output` config. Use `vercel env pull` when you only want the env values.

## 15. CLI version churn — flag shapes shift across majors

Examples from the last 18 months:

- `--confirm` was renamed `--yes` (still accepted as alias as of late 2025)
- `--meta` flag for deploy metadata was renamed `-m` (both work)
- `--scope` was renamed from `--team` in v28+

Pin the CLI in CI:

```yaml
# .github/workflows/*.yml
- run: bun add -g vercel@^33
```

Read the `vercel --version` output before adopting a script from elsewhere.

## Reference

- `vercel` CLI docs index: <https://vercel.com/docs/cli>
- Release notes (flag changes): <https://github.com/vercel/vercel/releases>
