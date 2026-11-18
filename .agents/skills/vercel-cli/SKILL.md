---
name: vercel-cli
description: 'Vercel CLI cookbook for verifying deploys, syncing env vars, reading logs and rolling back. Use when checking that a deploy is READY by commit SHA, syncing `.env` keys to Vercel scopes, tailing build or runtime logs, rolling back or promoting a deploy, or detecting the `.vercel/` link. Choosing a deploy method or a first-time link belongs to /deploy-to-vercel.'
license: MIT
compatibility: [claude-code, codex, opencode, pi]
allowed-tools: Bash(vercel:*)
complementary_categories:
  - deploy
phase: implementation
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). The body points here for the rules; it does not repeat them.
compact_rules: |
  - Use `--no-wait` on `vercel deploy` and `--wait` on `vercel inspect`, never the other way round. Inverted, you either block for 10 minutes on a URL you needed at once, or you smoke-test a deployment that has not finished.
  - Find your own deploy with `vercel ls -m githubCommitSha=<sha> --format json` and `jq`. It needs no grep and no parsing, and it cannot race a sibling branch.
  - Status filter values are UPPERCASE. `vercel ls --status READY` works; `--status ready` returns an empty list with no error.
  - `vercel env pull` writes `.env.local` by default. That file is gitignored, so keep it out of every commit. To write a different file, pass the name as a positional argument.
  - Pass `--format json` to `ls`, `env ls` and `teams ls`. The human tables carry ANSI colour and lose columns at narrow widths.
  - Pass `--no-wait` to `vercel deploy` in scripts, capture the URL, then poll with `vercel inspect --wait` as a separate step.
  - Verify with `vercel inspect <url> --wait --timeout=10m`. Without `--wait` it returns the state at call time, usually `BUILDING`, which tells you nothing.
  - On an account with more than one team (`vercel teams ls`), pass `--scope <team-slug>` on every mutating command, or the operation hits the wrong team's project or fails with a confusing 404. A linked project resolves the team from `orgId` in `.vercel/project.json` or `.vercel/repo.json`, so `--scope` can then be omitted.
  - Do not grep `vercel ls` output for URLs. ANSI codes break the regex; use the metadata filter, `--format json` and `jq`.
  - Treat a non-zero exit from `vercel inspect --wait` as a real failure (only `READY` exits 0), and surface it.
  - Pin the CLI version in CI (in `package.json` devDependencies or the workflow). Majors have changed flag shapes, for example `--confirm` to `--yes`.
  - A production deploy, a rollback and any env write or removal on the `production` scope are outward actions. Run them when a person asked for them or the delegating brief covers them; otherwise do the reads, stop and report.
metadata:
  kind: utility
---

# Vercel CLI (`vercel`)

`vercel` is Vercel's official command-line client. In this boilerplate it verifies deploys and manages env vars for the standard stack: Next.js, Supabase, Vercel and Resend, with branch-based auto-deploys. The integration branch (`git_strategy.branches.integration` in `.agents/project.yaml`, for example `staging`) builds a Vercel Preview. The production branch (`git_strategy.branches.production`) builds Vercel Production. When the integration branch is `null`, as under `solo-main`, the PR branch's Preview deployment is the staging surface.

This skill covers what happens around a deploy: confirming it shipped, pushing the right env vars before it ships, reading logs when it breaks, and rolling back when it breaks badly. Triggering the deploy (git push, `vercel deploy`, first-time `vercel link`) belongs to the community skill `/deploy-to-vercel`, and this skill points there instead of duplicating it.

## Why this skill exists

Three misuses have burned past sessions.

1. `vercel ls | grep` cannot tell you whether your deploy is ready. ANSI codes break the regex, and the output mixes new and old deploys of the same branch. The exact-commit question has its own answer: `vercel ls -m githubCommitSha=<sha> --format json` finds the URL, then `vercel inspect <url> --wait --timeout=10m` blocks until a terminal state.
2. `vercel deploy` blocks by default and `vercel inspect` does not, which is backwards from intuition. The compact rules fix the flags; `references/gotchas.md` has the reasoning.
3. Env scopes are spelled differently in the CLI (`production`, `preview`, `development`) and the dashboard ("Production", "Preview", "Development"). The CLI spelling is the one to script.

The compact rules in the frontmatter are the working rules for every session. The body below has the commands, and `references/` holds the deep material: load only the file the task needs.

## Composable Skills

This skill is a CLI companion, not a deploy orchestrator. Other skills own the surrounding workflow:

| Companion skill | What it owns | Defer to it when |
| --- | --- | --- |
| `/deploy-to-vercel` | Deploy method selection (git push or `vercel deploy`), first-time `vercel link`, team scope selection (community skill by vercel) | The user has not deployed yet, or both `.vercel/project.json` and `.vercel/repo.json` are absent. Load it first in those cases. |
| `/sprint-development` | The per-story deploy stages: Stage 4 (environment config and staging deploy), Stage 5 (production deploy and rollback) | The deploy is part of a story workflow (open ticket, feature branch). Let it drive; this skill supplies the commands. |
| `/git-flow-master` | `git push` mechanics, branch protection, PR creation: the push that triggers the Vercel webhook | Any git step. Push first, then come back here to verify. |

Resolve companions as `agentic-dev-core/references/skill-composition-strategy.md` describes:

1. Read `complementary_categories` from this skill's frontmatter (`deploy`).
2. Scan the skills installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. When `/deploy-to-vercel` is installed (a project-level community skill from `cli/install.ts`), prefer it for any "I haven't deployed this project yet" intent.

## Role inside the DEV workflow

| DEV moment | What this skill does |
| --- | --- |
| `/sprint-development` Stage 4, before the deploy | `vercel env ls preview`, diff the names against `.env.example`, push the missing keys |
| `/sprint-development` Stage 4, after the merge into the integration branch | Poll `vercel ls -m githubCommitSha=$(git rev-parse <integration>)` (`<integration>` is `git_strategy.branches.integration`; when `null`, the PR branch), `vercel inspect <url> --wait` until READY, then smoke test |
| `/sprint-development` Stage 5, after the merge into the production branch | The same poll and inspect on the production deployment |
| `/sprint-development` Stage 5, production broke | `vercel rollback <previous-prod-url>`, or "Promote to Production" in the dashboard on the prior good deploy |
| Any session, a deploy failed | `vercel inspect <url> --logs` for the build log, `vercel logs <url>` for runtime logs |
| First-time onboarding to a Vercel project | `/deploy-to-vercel` runs `vercel link`; come back here for `vercel env pull .env.local` |

## Who approves what

Reads are always safe: `ls`, `inspect`, `logs`, `env ls`, `env pull`, `whoami`, `teams ls`. The outward actions are `vercel deploy --prod`, `vercel rollback`, and `vercel env add` or `rm` on the `production` scope. `vercel link` and `env add` on `preview` change state too but are reversible.

- A person is present: ask before an outward action, as usual.
- A supervised worker: the conductor holds the gate. Report the intended command and wait for its answer.
- A routine with nobody: the delegating brief is the approval when it names the action. Without that, do the reads (verify, diff, logs), stop before the outward action, and report what you would run. `agentic-dev-core/references/decision-protocol.md` sets who decides what.

## Command structure

```
vercel <command> [<subcommand>] [flags]
```

| Command | Purpose |
| --- | --- |
| `vercel` (no args) | Deploy CWD as a preview (interactive). Prefer `vercel deploy --no-wait` in scripts. |
| `vercel deploy` | Explicit deploy. Add `--prod` for production, `--no-wait` to return the URL immediately. |
| `vercel inspect <url>` | Probe a deployment's state. Add `--wait` to block until a terminal state, `--logs` to stream build output, `--timeout`. |
| `vercel ls` | List deployments. Add `-m <key>=<value>` to filter by deployment metadata (for example `githubCommitSha`). |
| `vercel logs <url>` | Stream runtime function logs from a deployment. |
| `vercel env <add\|ls\|pull\|rm>` | Manage env vars per environment (production / preview / development). |
| `vercel link` | Bind the CWD to a Vercel project. Creates `.vercel/project.json` (single) or `.vercel/repo.json` (with `--repo`). |
| `vercel rollback <url>` | Promote a previous deployment to production. |
| `vercel whoami` | Print the authenticated user or team. The only safe state probe in an unlinked directory. |
| `vercel teams ls --format json` | List the teams the user belongs to. Use the slug as `--scope <slug>` on later commands. |

Every command supports `--help`; use it when unsure:

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

`references/deployment-verification.md` has the full pattern, including `--logs` streaming and the status-filter caveats.

### 2. Sync the current `.env` to Vercel Preview

```bash
# Pull what Vercel currently has (writes .env.local — gitignored)
vercel env pull .env.local --environment=preview

# Push a new key
echo "$NEXT_PUBLIC_APP_URL" | vercel env add NEXT_PUBLIC_APP_URL preview

# Bulk: see references/env-vars.md for the loop pattern across the boilerplate keys
```

### 3. Tail logs to debug a failing build or runtime

```bash
# Build logs (one-shot, full log of last build)
vercel inspect "$URL" --logs

# Runtime function logs (follow, like tail -f)
vercel logs "$URL" --follow
```

## Top-level utilities

### `vercel whoami`: auth and state probe

```bash
vercel whoami         # prints "you@example.com" or fails with exit 1
vercel teams ls --format json   # list teams; pick a slug for --scope
```

`whoami` is the only `vercel` subcommand that is side-effect free in an unlinked directory. `vercel ls`, `vercel project inspect` and `vercel link` prompt interactively there (or, with `--yes`, link the directory as a side effect), so they are the wrong way to detect state.

### `.vercel/` linking detection

```bash
# Either of these means "linked"
cat .vercel/project.json 2>/dev/null    # single-project link
cat .vercel/repo.json    2>/dev/null    # repo-mode link (monorepo)
```

With neither file the project is unlinked, and `/deploy-to-vercel` owns the link flow. `references/linking.md` has the file shapes and the monorepo notes.

## Which reference to load

| If the task is to | Load |
| --- | --- |
| Wait for a deploy to be READY, poll by commit SHA, stream build logs while waiting | `references/deployment-verification.md` |
| Push env vars to Vercel, pull them back, manage Preview vs Production scopes, sync `.env.example` keys | `references/env-vars.md` |
| Debug a build failure or runtime error: logs, common Next.js + Supabase pitfalls | `references/debugging.md` |
| Roll back a bad production deploy or promote a prior preview | `references/rollback.md` |
| Understand `.vercel/project.json` vs `.vercel/repo.json`, link a new directory | `references/linking.md` |
| Diagnose surprising CLI behaviour: UPPERCASE status, ANSI in `ls`, scope spellings, blocking defaults | `references/gotchas.md` |
| Choose a deploy method or do a first-time link | `/deploy-to-vercel` (community) |
| Drive the per-story deploy stages | `/sprint-development` Stages 4 and 5 |

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
- Auth token for CI (non-interactive): `vercel login --token`, then export `VERCEL_TOKEN` in the CI env.

First-time project setup (linking this directory to a Vercel project) belongs to `/deploy-to-vercel`.
