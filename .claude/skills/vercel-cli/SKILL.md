---
name: vercel-cli
description: 'Vercel CLI cookbook for this Next.js + Supabase + Vercel boilerplate. Covers deployment verification (poll by commit SHA + `vercel inspect --wait`), env var sync between `.env` and Vercel scopes (Preview / Production / Development), build and runtime log streaming, rollback, and `.vercel/` project linking detection. Trigger whenever the user runs `vercel`, asks to "check deploy status", "wait until ready", "is my deploy live", "sync env vars to Vercel", "push env to Vercel", "see build logs", "tail Vercel logs", "rollback last deploy", "promote to production", "link this repo to Vercel", or any vercel-CLI-shaped task. Composes with `/deploy-to-vercel` (community skill, owns the deploy method selection) and `/sprint-development` (Stages 9 & 12 own the deploy orchestration). Do NOT use for: choosing a deploy method or doing a first-time link (use `/deploy-to-vercel`), driving the full sprint deploy stage (use `/sprint-development`), reading Supabase as source-of-truth for env values (use Supabase MCP — Vercel only mirrors them), or Bitbucket / Netlify / Cloudflare deployment (out of scope).'
license: MIT
compatibility: [claude-code, cursor, codex, opencode]
allowed-tools: Bash(vercel:*)
complementary_categories:
  - deploy
phase: implementation
---

# Vercel CLI (`vercel`)

`vercel` is Vercel's official command-line client. In this boilerplate it is the primary verification + env-management surface for our standard stack: **Next.js + Supabase + Vercel + Resend**, with branch-based auto-deploys (`develop` → Vercel Preview / staging, `main` → Vercel Production).

This skill teaches the operations that live AROUND a deploy — confirming it actually shipped, pushing the right env vars before it ships, tailing logs when it breaks, rolling back when it breaks badly. The act of TRIGGERING a deploy (choosing between git push, `vercel deploy`, or first-time `vercel link`) is owned by the community skill `/deploy-to-vercel`. This skill points at it; it does not duplicate it.

## Why this skill exists

`vercel` is easy to misuse in three specific ways that have burned past sessions:

1. **`vercel ls | grep` is the wrong tool to check whether YOUR deploy is ready.** ANSI color codes break the regex, and the output mixes new and old deploys for the same branch. The canonical "is this exact commit deployed" question has a different answer: `vercel ls -m githubCommitSha=<sha> --format json` to find the URL, then `vercel inspect <url> --wait --timeout=10m` to block until terminal state.
2. **`vercel deploy` blocks by default; `vercel inspect` does NOT.** That asymmetry is backwards from intuition and trips agents constantly. Rule: **always pass `--no-wait` to `vercel deploy`** (return URL immediately), **always pass `--wait` to `vercel inspect`** (block until READY / ERROR / CANCELED). See `references/gotchas.md`.
3. **Env-var scopes are not the same string in the CLI and the dashboard.** CLI uses lowercase `production` / `preview` / `development`; the dashboard shows "Production" / "Preview" / "Development". The CLI is the authoritative spelling — if you need to script env mutations, use the CLI form.

The body below covers the operations that apply to almost every Vercel session. The `references/` directory holds the deep material — load only the one you need.

## Composable Skills (auto-resolved at skill entry)

This skill is a CLI companion, not a deploy orchestrator. Other skills own the surrounding workflow:

| Companion skill         | What it owns                                                                                                          | When to defer to it                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/deploy-to-vercel`     | Deploy method selection (git push vs `vercel deploy`), first-time `vercel link`, team scope selection (community v3.0.0+, author: vercel)             | The user has NOT deployed yet, or `.vercel/project.json` + `.vercel/repo.json` are both absent. Load FIRST in those cases.       |
| `/sprint-development`   | Per-story deploy stages — Stage 9 (environment config + staging deploy), Stage 12 (production deploy + rollback)      | The deploy is part of a story workflow (Jira ticket open, branch `feature/UPEX-*`). Let it drive; this skill provides the verbs. |
| `/git-flow-master`      | `git push` mechanics, branch protection, PR creation — the push that TRIGGERS the Vercel webhook                       | Any git-shaped step. Push first, then come back here to verify.            |

Resolution steps (per `agentic-dev-core/references/skill-composition-strategy.md`):

1. Read `complementary_categories` from this skill's frontmatter (`deploy-vercel`).
2. Look up the local skill-registry script (`scripts/build-skill-registry.ts` → `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. If `/deploy-to-vercel` is installed (default project-level community skill per `cli/install.ts`), prefer it for any "I haven't deployed this project yet" intent.

## Role inside the DEV workflow

| DEV moment                                                       | What this skill does                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/sprint-development` Stage 9 — pre-deploy env audit             | `vercel env ls preview` → diff against `.env.example` keys; push the missing ones                                              |
| `/sprint-development` Stage 9 — after merging `feature/*` → `develop` | Poll `vercel ls -m githubCommitSha=$(git rev-parse develop)` → `vercel inspect <url> --wait` until READY → smoke test          |
| `/sprint-development` Stage 12 — after merging `develop` → `main`    | Same poll + inspect, on the production deployment                                                                              |
| `/sprint-development` Stage 12 — production blew up               | `vercel rollback <previous-prod-url>` (or dashboard "Promote to Production" on the prior good deploy)                          |
| Any session, after a deploy fails                                | `vercel inspect <url> --logs` to grab the build log; `vercel logs <url>` for runtime logs                                       |
| First-time onboarding to a new Vercel project                    | Defer to `/deploy-to-vercel` for `vercel link`; come back here for `vercel env pull .env.local`                                |

## Command structure

```
vercel <command> [<subcommand>] [flags]
```

| Command                              | Purpose                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `vercel` (no args)                   | Deploy CWD as a preview (interactive). **Prefer `vercel deploy --no-wait` for scripted use.**                        |
| `vercel deploy`                      | Explicit deploy. Add `--prod` for production, `--no-wait` to return the URL immediately.                              |
| `vercel inspect <url>`               | Probe a deployment's state. Add `--wait` to block until terminal state, `--logs` to stream build output, `--timeout`. |
| `vercel ls`                          | List deployments. Add `-m <key>=<value>` to filter by deployment metadata (e.g. `githubCommitSha`).                   |
| `vercel logs <url>`                  | Stream runtime function logs from a deployment.                                                                       |
| `vercel env <add\|ls\|pull\|rm>`     | Manage env vars per environment (production / preview / development).                                                 |
| `vercel link`                        | Bind the CWD to a Vercel project. Creates `.vercel/project.json` (single) or `.vercel/repo.json` (with `--repo`).      |
| `vercel rollback <url>`              | Promote a previous deployment to production.                                                                          |
| `vercel whoami`                      | Print the authenticated user / team. The ONLY safe state probe in an unlinked directory.                              |
| `vercel teams ls --format json`      | List teams the user belongs to. Use the slug as `--scope <slug>` on every subsequent command.                         |

Every command supports `--help`. Use it aggressively when unsure:

```bash
vercel --help
vercel deploy --help
vercel inspect --help
vercel env --help
```

## Quick start (DEV flow)

### 1. Wait for the deploy of the current commit to reach READY

```bash
SHA=$(git rev-parse HEAD)
URL=""
for i in $(seq 1 12); do
  URL=$(vercel ls -m githubCommitSha="$SHA" --format json 2>/dev/null \
        | jq -r '.deployments[0].url // empty' \
        | sed 's|^|https://|')
  [ -n "$URL" ] && break
  sleep 5
done
[ -z "$URL" ] && { echo "no deployment found for $SHA after 60s"; exit 1; }
vercel inspect "$URL" --wait --timeout=10m   # exit 0 = READY, non-zero = ERROR / CANCELED / TIMEOUT
```

See `references/deployment-verification.md` for the full pattern including `--logs` streaming and status-filter caveats.

### 2. Sync the current `.env` to Vercel Preview

```bash
# Pull what Vercel currently has (writes .env.local — gitignored)
vercel env pull .env.local --environment=preview

# Push a new key
echo "$NEXT_PUBLIC_APP_URL" | vercel env add NEXT_PUBLIC_APP_URL preview

# Bulk: see references/env-vars.md for the loop pattern across the ~15 boilerplate keys
```

### 3. Tail logs to debug a failing build / runtime

```bash
# Build logs (one-shot, full log of last build)
vercel inspect "$URL" --logs

# Runtime function logs (follow, like tail -f)
vercel logs "$URL" --follow
```

## Top-level utilities

### `vercel whoami` — auth + state probe

```bash
vercel whoami         # prints "you@example.com" or fails with exit 1
vercel teams ls --format json   # list teams; pick a slug for --scope
```

`whoami` is the only `vercel` subcommand safe to run in an unlinked directory without side-effects. Do NOT use `vercel ls`, `vercel project inspect`, or `vercel link` for state detection — they prompt interactively (or, with `--yes`, silently link as a side-effect).

### `.vercel/` linking detection

```bash
# Either of these means "linked"
cat .vercel/project.json 2>/dev/null    # single-project link
cat .vercel/repo.json    2>/dev/null    # repo-mode link (monorepo)
```

If neither exists, the project is unlinked. Defer to `/deploy-to-vercel` for the link flow. See `references/linking.md` for the file shapes + monorepo notes.

## Five gotchas to keep in mind always

1. **`--no-wait` on deploy, `--wait` on inspect — never the other way around.** Inverting these means you either block for 10 minutes waiting on a deploy URL you needed immediately, or you race an unfinished deployment with a smoke test.
2. **`vercel ls -m githubCommitSha=<sha>` is the canonical "find MY deploy" query.** No grep, no parsing, no race. Use `--format json` and `jq`.
3. **Status filter values are UPPERCASE.** `vercel ls --status READY` works; `--status ready` returns empty with no error.
4. **`vercel env pull` writes to `.env.local` by default.** That file is in `.gitignore` for a reason — never commit it. If you need a different filename, pass it as a positional arg.
5. **Multi-team accounts need `--scope <team-slug>` on EVERY mutating command.** Otherwise the operation hits the wrong team's project, or fails with a confusing 404.

See `references/gotchas.md` for the long-form list (ANSI in `ls` output, scope spellings, monorepo edge cases, env-var ordering, etc.).

## Navigation — when to load which reference

Load the reference that matches the user's current need. Do not preload all of them.

| If the user wants to…                                                                                  | Load                                          |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Wait for a deploy to be READY, poll by commit SHA, stream build logs while waiting                     | `references/deployment-verification.md`       |
| Push env vars to Vercel, pull them back, manage Preview vs Production scopes, sync `.env.example` keys | `references/env-vars.md`                      |
| Debug a build failure or runtime error — logs, common Next.js + Supabase pitfalls                      | `references/debugging.md`                     |
| Roll back a bad production deploy or promote a prior preview                                            | `references/rollback.md`                      |
| Understand `.vercel/project.json` vs `.vercel/repo.json`, link a new directory                          | `references/linking.md`                       |
| Diagnose surprising CLI behavior — UPPERCASE status, ANSI in `ls`, scope spellings, blocking defaults  | `references/gotchas.md`                       |
| Choose a deploy method or do a first-time link                                                         | **Defer to `/deploy-to-vercel`** (community)  |
| Drive the per-story deploy stages                                                                      | **Defer to `/sprint-development`** Stages 9, 12 |

## Working style

- **Always `--format json`** on `ls`, `env ls`, `teams ls`. Human tables include ANSI color and lose columns at narrow widths.
- **Always `--no-wait` on `vercel deploy`** in scripts. Capture the URL, then poll with `vercel inspect --wait` separately.
- **Always `--wait --timeout=10m`** on `vercel inspect` when verifying. Default behavior returns immediately with whatever state the deploy is currently in — usually `BUILDING`, which tells you nothing.
- **Always pass `--scope <team-slug>`** if `vercel teams ls` shows more than one team. If the project is already linked, the `orgId` in `.vercel/project.json` / `.vercel/repo.json` resolves the team automatically and you can omit `--scope`.
- **Never grep `vercel ls` output for URLs.** Use metadata filters (`-m githubCommitSha=$SHA`) + `--format json` + `jq`. ANSI codes will break naive regex.
- **Never commit `.env.local`** produced by `vercel env pull`. It's gitignored; keep it that way.
- **Verify exit codes.** `vercel inspect --wait` exits 0 only on `READY`. Any non-zero is a real failure — surface it, don't swallow it.
- **Pin the CLI version in CI.** New majors have shifted flag shapes (e.g. `--confirm` → `--yes`). Document the pinned version in `package.json` devDependencies or in the CI workflow.

## Installation (reference only)

Most contributors already have `vercel` installed. If not:

```bash
# Global install (recommended)
npm i -g vercel
# or via pnpm / bun
bun add -g vercel

# One-time auth (opens browser)
vercel login

# Verify
vercel whoami
vercel --version
```

- Official guide: <https://vercel.com/docs/cli>
- Auth token for CI (non-interactive): `vercel login --token` then export `VERCEL_TOKEN` in CI env

For first-time PROJECT setup (linking this directory to a Vercel project), use `/deploy-to-vercel` — it owns the link flow.
