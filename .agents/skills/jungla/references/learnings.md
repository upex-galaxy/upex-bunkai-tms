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
