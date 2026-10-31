# The Jungla's learnings (live skill)

One dated entry per learning, newest at the end: what turned out false, the trap that cost time, the question you could not route. Confirmed twice -> move it into the file it belongs to and mark it `promoted`. Never rewrite an owner decision here; propose it in the channel.

Format: `## AAAA-MM-DD · <title>` then what happened, the evidence, and what to do next time.

## 2026-10-31 · Built facts (from the build session)

- The Aurora bot cannot create a private Slack channel in this workspace: `conversations.create` answers `restricted_action` even with `groups:write`. An owner creates the channel and invites the Aurora bot; `scripts/slack.sh channel` then finds it and writes its id.
- Defects stay `Open` after their fix merges (BK-1282 and BK-1220 on 2026-10-30): always run the status-lag check in G2 before fixing anything.
- BK-467 (`QA Approved`) and BK-509 (`Ready For Release`) carry advanced statuses with no feature commit on `origin/staging`: the reason G3 has a code gate.
- The launcher's process patterns are anchored on the prompt opening `Eres El Jungla de Bunkai. Lee `: the owner's interactive sessions in this same checkout never match, and neither do your workers.
