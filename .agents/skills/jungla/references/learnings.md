# The Jungla's learnings (live skill)

One dated entry per learning, newest at the end: what turned out false, the trap that cost time, the question you could not route. Confirmed twice -> move it into the file it belongs to and mark it `promoted`. Never rewrite an owner decision here; propose it in the channel.

Format: `## AAAA-MM-DD · <title>` then what happened, the evidence, and what to do next time.

## 2026-10-31 · Built facts (from the build session)

- The Aurora bot cannot create a private Slack channel in this workspace: `conversations.create` answers `restricted_action` even with `groups:write`. An owner creates the channel and invites the Aurora bot; `scripts/slack.sh channel` then finds it and writes its id.
- Defects stay `Open` after their fix merges (BK-1282 and BK-1220 on 2026-10-30): always run the status-lag check in G2 before fixing anything.
- BK-467 (`QA Approved`) and BK-509 (`Ready For Release`) carry advanced statuses with no feature commit on `origin/staging`: the reason G3 has a code gate.
- A fresh worktree has no `.claude/skills` alias (gitignored) and no `.env`: its first pre-push fails until it is provisioned (`SKILL.md` § Delegating step 2).
- The startup guard counts Jungla processes and stops only at 2 or more: the session always sees itself.
- The launcher's process patterns are anchored on the prompt opening `Eres El Jungla de Bunkai. Lee `: the owner's interactive sessions in this same checkout never match, and neither do your workers.

## 2026-10-31 · First live run (manual, 00:52 ART)

- `git log --grep 'KEY\b' -E` matches nothing on macOS (BSD regex has no `\b`): every count reads 0. Use `-i --grep '<KEY>'` plus `^(feat|fix|refactor|test)\(<KEY>\)` and confirm a fix branch with `git merge-base --is-ancestor origin/<branch> origin/staging`.
- The standing queue built at startup has no drain step: the watcher only fires on deltas and PROACTIVE requires an empty queue, so queued ganks wait for an unrelated wake-up. This run handled them in the same turn as other wake-ups (G3 sign-offs while the G2 worker ran). Proposal for the routine: after every wake-up, if no heavy worker is running take the head of `ganks`; light ganks (G3, blocked triage) run in the conductor even while a worker runs.
- `orca worktree create` names the branch `saiotest/<name>`, not the repo's `fix/<KEY>-...` convention: say the expected branch name in the brief so the worker renames it.
- `worker-start --spec` injects the spec as the worker's first prompt inside its preamble; no separate `terminal send` was needed. Confirm the brief landed with `worker-read --source auto` (its transcript showed the brief being read within seconds).
- Someone wrote `slack-channel.id` as soon as an owner created `#jungla-bunkai`; the watcher picked up the owner's first message on its next Slack poll without a restart.

## 2026-10-31 · Second worker and the Saturday close

- Claude Code reaps idle background shells under memory pressure (the keepalive and a mailbox wait died at ~25% free with ~18 sessions alive). The session survived because the watcher was still running, and Orca injected "You have N orchestration messages" into the session on its own, so a background mailbox wait is optional: the watcher alone keeps the session.
- `orca worktree create --reference <BK-KEY>` fails with `jira_summary_lookup:not-found`: Orca's Jira connection does not see this site. Create the worktree without `--reference`.
- One worker can take several small defects of the same story in sequence, each on its own branch from a fresh `origin/staging` and its own PR (BK-1171, BK-1173, BK-1172 in about two hours, PRs #303, #305, #306).
- The boilerplate sync (#301, merged 2026-10-31) changed Critical Rule #3: `Claude-Session:` is now forbidden; every agent commit ends with `Worktree: <name|primary>` then `Session: <label>` from the prompt hook's `AGENT IDENTITY:` line (`unknown` when absent). Commits 3fba21ad and b3e1b8ec predate the merge and keep the old trailer (pushed, not rewritten). The same sync made Critical Rule #1 forbid reading `.env` by value: use `wait-jungla.sh`/`slack.sh` (which load it themselves) or the repo's redacted presence check, never `grep .env` in an ad hoc command.
- Since #301 the full `bun test` on `staging` is red: 51 `cli/` and `scripts/` tooling tests fail even alone (reported by the BK-443 worker, none in app code). Queued as `staging-suite-red`.

## 2026-10-31 · Relaunch by resume (20:48)

- Aurora Slack brought the Jungla back by resuming the same session: the process reads `claude --resume <session-id>`, so `PS_PATTERN` (anchored on the launch prompt `Eres El Jungla de Bunkai. Lee `) counts 0 Junglas. The startup guard still passes, but the launcher's alive check and its end-of-day reaping cannot see a resumed Jungla by argv; only `watcher.alive` and `working` show it. Either launch fresh with the prompt or teach the launcher the resumed session id.
- A watcher armed at 20:51 with end `21:00` polled Slack about 25 times and found no owner message newer than `last_seen_ts`: "the owner asked for several things" meant the note relayed by Aurora (`owner-2026-10-31-siete-dias.md`), not channel requests. Read the relay note first; it can be the whole order.

## 2026-11-01 · Mailbox questions do not wake the watcher

- A worker's `ask` (a `question` message on its run) is not an event the watcher sees: `wait-jungla.sh` watches Slack, Jira and the bridge inbox only. On 2026-11-01 the suite-red worker waited 30 minutes for an answer, then took its own recommended option. Orca injected nothing into the session in time. Until the watcher learns to poll `orca orchestration check --run <run>` for `question`/`worker_done`, check each active run's mailbox at every HEARTBEAT and whenever `worker-list` shows `root_completion` or an `ask`.
- The "full `bun test` is red since #301, 51 failures" report was stale: sync PR #304 (2026-10-31 08:20) made the maintainer-only `cli/`/`scripts/` tests skip downstream. Measured on `staging` 1315c58d: 4420 pass, 56 skip, 1 fail (BK-442 backfill test, fixed in PR #313). Before telling a worker a suite is red, measure it on the current `origin/staging`; a brief that carries a stale claim costs a round trip. The full suite takes about 16 minutes.
- `orca worktree rm` returns before git has dropped the worktree: `git branch -d` right after fails with "used by worktree". Run `git worktree prune` after a few seconds, then delete the branches.
- `scripts/bridge.sh write` takes a body FILE as its argument, not the text itself.
