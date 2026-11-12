# Cloud execution: a delivery worker in a Claude Code cloud session

The third way to run a dispatched ticket, next to the default (an agent in its own worktree) and the supervised Orca worker (`orca-orchestration`). The worker is a Claude Code session on claude.ai/code, in a VM of Anthropic's, with the repo cloned in and a cloud environment (network, variables, setup script). The conductor stays local and light. Nothing in this file replaces the lock, the audit, the selection, the caps or the migration gate of `SKILL.md`: they stay the conductor's.

Measured on Bunkai BK-507 (2026-11-11): one story, one PR, 31 files, about 55 minutes of worker time, merged as `45ee424c`. The method also draws on the webapp skill `upexgalaxy-webapp/.agents/skills/cloud-fleet/SKILL.md` (a fleet of video renders, 2026-10-12 to 2026-10-25), which holds the queue and the Loom parts this skill does not copy. A claim taken from the Anthropic docs and not measured here is marked `(doc)`.

## 1. When to use it, and when not

Use it when the unit is a whole ticket that writes code and integrates by itself (a story, a bug) and the owner's machine is the constraint: disk (a full data volume stopped every local worker on 2026-11-11, `ENOSPC` at `bun install`), memory (a test run reached 20 GB in a render loop) or CPU. Do not use it when:

- the work needs a human's authenticated session (Jira with the owner's account, Slack, a personal browser profile): that stays with the conductor;
- it needs a secret that is not worth putting in the environment (see §3): the conductor does that step;
- the unit is small (one or two files, a Jira transition, a SQL read): the conductor does it inline;
- the unit must be supervised turn by turn: use an Orca worker.

The cloud gives NO extra tokens: sessions share the plan limits with everything else the owner runs (doc). It saves the Mac's disk, memory and CPU, not the plan.

## 2. The split: who does what

| Piece | Cloud worker | Conductor (local) |
| --- | --- | --- |
| Code, tests, docs, the PR branch | yes | no, except a small fix found at verification (a NEW commit, never a rewrite) |
| Reading the story | the brief carries the text (the PBI cache and `.session/` are gitignored, they do not travel) | reads it from Jira and writes the brief |
| Jira (comments, transitions) | never (no token) | always; the rulings the worker publishes in the PR body are copied to the ticket |
| Applying a migration | writes the file and says `MIGRATION-READY` | applies it through the project's DB MCP, verifies, says `MIGRATION-APPLIED` |
| Tests that need a secret kept out of the cloud | cannot run them, says so | runs them locally, one file at a time, in a throwaway worktree of the PR head |
| Opening the PR | yes, as a draft (`gh api` REST, see §8) | flips it to ready |
| Merging, deploy check, Jira walk to the next status | never | always |
| Throwaway data (users, workspaces) | creates its own, deletes them, reports the recount | recounts in the database before the merge |

## 3. One-time setup, done by the owner

An agent cannot create or edit a cloud environment (`/remote-env` only picks one, doc). The owner does, at claude.ai/code, "Add cloud environment":

| Field | Value | Why |
| --- | --- | --- |
| Name | one per project (`bunkai`) | |
| Repository | the project repo | the session starts with it cloned |
| Network | Full | Trusted covers npm and GitHub but not Supabase; the worker reaches the live database |
| Network secrets | none for a pilot | the proxy can inject a key without the session seeing it (doc, Pro and Max); the plain variables below are simpler, and readable by anyone who uses the environment |
| Variables | names only below; values typed by the owner (see `scripts` note) | |
| Setup script | `bun --version` and `npx -y playwright install --with-deps chromium` | the image has Node, bun, git, `gh`, Python, Postgres 16; the browser is for UI checks. It is cached only if it ends in about 5 minutes (doc) |

Variable names the worker needs on Bunkai (an `.env` file does NOT travel to the cloud): the Supabase URL and publishable, anon, secret and service-role keys, the fixed QA user pair (`QA_E2E_USER_EMAIL`, `QA_E2E_USER_PASSWORD`), `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `BASH_DEFAULT_TIMEOUT_MS=1800000`, `BASH_MAX_TIMEOUT_MS=7200000` (without them a foreground command waits 2 minutes, up to 10, and one moved to the background dies after 30; doc), `NEXT_TELEMETRY_DISABLED=1`, and `CRON_SECRET` with a THROWAWAY random value (`lib/env.ts` throws without it; it protects no data). `SUPABASE_JWT_SECRET` stays OUT of the cloud (it forges a session for any user); the tests that need it are the conductor's (§9). No Atlassian, no Supabase access token, no Slack. The service-role key bypasses row security: accepted on Bunkai only because the single database holds no real customer data (rule MVP-ONE-DATABASE).

Never read the `.env` to build this list. The owner copies the values; a clipboard script that reads `.env` and prints only names keeps the values out of every transcript (done on 2026-11-11 with a one-off script).

The environment id (`env_...`) is shown by the `/remote-env` picker. The default in `~/.claude/settings.json` (`remote.defaultEnvironmentId`) is GLOBAL to the owner's account on that Mac: another project may depend on it, so never change it to launch a worker. Pass the id per launch (§4). A project-level `env_` value in `.claude/settings.json` overrides the user pick (doc); the local settings file is deduced from the precedence and is not documented for this key, so a launch without `--settings` is a test, not a given.

## 4. Launching

`scripts/cloud/launch-session.sh <KEY> <prompt-file>` from the primary checkout on the integration branch (the worker cuts its own feature branch). It does exactly this:

```bash
script -q <log> claude --settings '{"remote":{"defaultEnvironmentId":"env_..."}}' --permission-mode auto --cloud "<brief>" </dev/null >/dev/null 2>&1 &
```

- `claude --cloud` needs a TTY (a script or the Bash tool has none); `script -q` provides it. The command prints `Created cloud session ... View: https://claude.ai/code/session_...` and exits; the session keeps running.
- `--permission-mode auto` goes BEFORE `--cloud`. `--dangerously-skip-permissions`, `--model` and `--effort` do not reach the cloud (doc and measured).
- The brief is the prompt itself (§6). The remote must hold the branch the checkout is on.
- The URL goes to `sessions.txt` (`key url epoch`), the durable record: with it a session is resumed from claude.ai/code or `claude --teleport <id>` days later. Never delete it.
- A message to a running session: `script -q <log> claude -p "<message>" --cloud <session_id>` ("Sent to cloud session."); it queues until the session reads it, and does NOT attach connectors. An archived session receives nothing (doc).

## 5. Waking the session from the web (connectors)

A session created from a terminal does not receive the claude.ai connectors (Supabase, Atlassian, ...) until a message is typed in the web UI. `scripts/cloud/wake-session.sh <session_url> [message]` does it with the owner's Playwright profile `claude-ai` (a visible window for 20 to 60 s on the owner's screen; Cloudflare stops headless). `--check` only verifies the login before launching. Exit codes: 0 sent, 2 the profile has no session (the owner signs in, an agent never types credentials), 3 Cloudflare, 4 no composer, 5 profile lock. Send with Meta+Enter: it queues the message instead of interrupting a session that is mid-turn.

On Bunkai the connectors are a bonus, not a need: the worker is told not to apply migrations or write Jira through them (the claude.ai Supabase `apply_migration` asks for an interactive confirmation and expired unattended on 2026-11-05).

## 6. The brief

Template: `references/cloud-brief-template.md`. It must carry, because the worker cannot ask: the story text and the Definition of Done (it is in no repo file); the decisions already taken; the open questions the worker rules itself under AI-LED-DECISIONS (a Step 0 before any code, published in the PR body); the environment facts (variable NAMES, what is missing, no Jira, no Orca, no migration apply); the reporting grammar (§7); the migration protocol (§8); the test and build rules; the users-and-data rules (§10); the commit rules (§11); and a pilot-measurement section on the first runs of a new environment.

## 7. Reporting: PR comments

The Orca mailbox does not exist in the cloud. The worker opens a DRAFT PR right after its first push and reports with PR comments through `gh api repos/<owner>/<repo>/issues/<n>/comments` (REST; `gh pr` fails on GraphQL, 403):

| Comment starts with | Meaning | Conductor action |
| --- | --- | --- |
| `STATUS` | phase of N, what is pushed, what is next | none (read at the next attention) |
| `MIGRATION-READY <file>` | the migration file is ready and SHA-256 declared | §8 |
| `MIGRATION-APPLIED <file>` | conductor to worker: applied and verified | the worker continues |
| `BLOCKED` or a comment naming a MISSING variable | the worker cannot go on | fix it or answer by session message |
| `DONE` | finished, with the report | §9 |

Fallback if comments cannot be created: a file `report.md` on a separate branch `report/<KEY>`, never in the feature branch. The conductor waits with `scripts/cloud/watch-pr.sh <pr> [max-minutes] [since-id]` in the background: zero tokens while it polls, it exits with `ATTENTION`, `QUIET` or `STUCK` (no comment and no push for 60 minutes). The worker must never end its turn while something runs: a finished turn stops its pushes. The foreground `sleep N` is blocked by the harness, but `timeout 600 bash -c 'until <condition>; do sleep 3; done'` works (measured; the original brief's `sleep 180` loop did not).

## 8. The migration protocol

1. The worker writes `supabase/migrations/NNNN_<slug>.sql` at the next free number on the integration branch, additive and idempotent, pushes, and comments `MIGRATION-READY <file>` with the SHA-256 of the file. It cannot apply (no access token).
2. **Wait until the file is on `origin`.** The comment can arrive minutes BEFORE the push lands (husky pre-push gates take 60 to 90 s; measured: 6 minutes). Compare `git show origin/<branch>:<file> | shasum -a 256` with the declared hash.
3. Read the SQL. Check the preconditions live (the tables, functions and columns it assumes exist; the object is not already applied; the check constraints match the values the function uses). Take the number from the ledger, not from a directory listing.
4. Apply with the project's DB MCP `apply_migration`, the ledger name equal to the file basename (the migration gate of `SKILL.md` decides whether). Build the call's arguments from the committed file with a script, never by retyping.
5. Read it back: `md5(prosrc)` of the live function against the md5 of the function body in the file (the text between the first pair of `$$`), the security mode, the grants (the read-only QA role must NOT execute a write function), exactly one ledger row.
6. Comment `MIGRATION-APPLIED <file>` with those facts. The worker then runs the database-dependent checks.

## 9. Verification before the merge

The worker's report is a claim; the destination is the proof. In this order:

1. Independent review: a read-only subagent (sonnet, about a minute) over `git diff <integration>...origin/<branch>` with the repo's rules; it returned `ship` with five low findings on BK-507. Findings that matter become a new commit; the rest go to a follow-up entry.
2. **Run what the cloud could not.** Create a throwaway worktree of the PR head (`orca worktree create ... --base-branch origin/<branch>`, `bun run worktree:provision <path>`), run the files that need the secrets kept out of the cloud, ONE at a time through the test guard, and remove the worktree. On BK-507 this found a real test defect: a header-less request falls back to the cookie session and `cookies()` does not exist outside a request, so the test answered 500 instead of 401; the cloud could not see it because the file skips or fails without those variables. Fix as a NEW commit on the PR branch (a fast-forward push), never a rewrite.
3. Recount the shared database for throwaway data (workspaces, users, failpoint rows) after the worker's cleanup and after your own test run.
4. Wait for the preview deployment (Vercel posts a commit status, not a check run).
5. Mark the PR ready and merge with a merge commit (`gh pr merge <n> --merge`, no squash, branch kept). Fetch, then confirm `git merge-base --is-ancestor <merge> origin/<integration>` and the integration deploy.
6. Jira: copy the worker's rulings to the ticket (`## AI Product Owner — Decision:` and `## AI Tech Lead — Decision:`), post a merge comment (PR, merge SHA, what the QA tests), and walk the status one step at a time with a read-back (Jira did not move a merged story by itself in 6 of 6 cases).
7. Remove the verification worktree, fast-forward the primary checkout, record the run.

## 10. Users and data for checks

The worker logs in with the fixed QA user from the environment (password sign-in) for smoke checks. For a scenario that needs another role it may create throwaway users with the admin API and the service key from the environment: a name with a ticket prefix, a random password generated at that moment and kept only in a shell variable (never in a file, commit, PR comment or log), its own workspace and data with the same prefix. The database is shared with real users: it deletes everything it created, even when it fails, and states the recount in `DONE`. Never `auth.admin.listUsers()` or `generateLink` against real accounts, never impersonation (rule recorded 2026-07-30 after an agent did both).

## 11. Identity and commits

Measured on 2026-11-11: commits are SSH-signed by the cloud (`verified: true`), pushes and PR comments appear as the automation GitHub account, and the author and committer are the environment's git config, `Claude <noreply@anthropic.com>`. That conflicts with Critical Rule #3 (commits look human-authored); the owner accepted it once for the BK-507 pilot. Next brief: tell the worker to set `git config user.name` and `user.email` to the automation identity before its first commit, and test whether the signature still verifies; if a push is refused for signatures, revert to the environment identity, say so, and let the conductor decide. Trailers: `Worktree:` then `Session:` as in Rule #3; the cloud may add `Claude-Session:` on its own (doc): the brief forbids it and the conductor checks `git log` before merging. Every husky gate runs in the cloud too (a commit about 40 to 60 s, a push 60 to 90 s). <!-- volatile-ok: dated measurement kept as evidence of what the cloud did -->

## 12. Measured traps

| Trap | What happens | What to do |
| --- | --- | --- |
| `claude --cloud` from a script | no TTY, nothing starts | `script -q <log> claude ... </dev/null` |
| The user-level default environment | `/remote-env` rewrites it for the whole account; another project's launches then land in the wrong environment | never use it to launch; `--settings` per launch |
| `--environment env_...` | rejected for Anthropic-hosted ids (doc) | `--settings` |
| A brief in a gitignored path | the session has no such file | the brief IS the prompt |
| `gh pr create` | 403 on GraphQL | `gh api -X POST repos/<o>/<r>/pulls` (REST works: create, patch, comments) |
| `MIGRATION-READY` before the push | the file is not on origin yet | §8 step 2 |
| A route test through `bun test` with no token header | falls to `cookies()`, 500 instead of 401 | use an unknown Bearer token in the test |
| The environment lacks `CRON_SECRET` or `SUPABASE_JWT_SECRET` | `lib/env.ts` throws; PAT-path tests fail or skip | throwaway `CRON_SECRET` in the environment; the JWT secret stays out, the conductor runs those files |
| `timeout` | does not exist on macOS | bounded `for` loops with `sleep` |
| Worker ends its turn while waiting | its pushes stop | wait in the foreground with `timeout ... bash -c 'until ...'` |
| A session silently stuck | no push for hours (the webapp fleet saw 4 hours after a process restart) | `watch-pr.sh` flags STUCK at 60 minutes; wake it from the web, then message it; do not relaunch while the old one may resume (two sessions on one branch collide) |
| A recycled VM | an idle session loses background processes, keeps the conversation (doc) | commit and push checkpoints; the brief says "if the branch already has work, continue from it" |
| A question to the owner while a worker waits | the owner may answer hours later | hold a background task while asking; treat anything after the soft close as handoff |

## 13. Limits

4 vCPU, 16 GB RAM, 30 GB disk (doc; a Postgres 16 server binary is present and PyPI is reachable). A full local suite is never run (rule GUARDED-TESTS); one test file at a time with a timeout. Cloud time is not free in plan limits: one worker at a time, as everywhere in this system. Cleanup: archive the session at claude.ai/code only after the merge; keep `sessions.txt`; the feature branch is kept unless the owner asks otherwise.
