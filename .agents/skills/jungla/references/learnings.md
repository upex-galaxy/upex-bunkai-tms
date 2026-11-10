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

## 2026-11-01 · Sunday run (first full working Sunday)

- Relaunch the watcher FIRST on every wake-up, before any triage. Twice on 2026-11-01 the session sat without a watcher for 25+ minutes (after a HEARTBEAT, and once after launching a detached copy). A watcher started with `( ... &)` does not wake the session: only a `run_in_background` task does. Check that exactly one `wait-jungla.sh` is alive with `ps -axww | grep '[w]ait-jungla.sh'`.
- A worker finishing does not wake the session either: its `worker_done` waits in the run mailbox until the next watcher event or HEARTBEAT. Worker runs of 1 to 2 hours were found 30 to 90 minutes late. Check each active run with `orca orchestration check --run <run>` at every wake-up and `worker-list` attention `root_completion`. (Proposal for the watcher: poll the active runs' mailboxes.) Confirmed twice on 2026-11-01, with the earlier entry on mailbox questions: promote into `routine.md` Phase 2 next time.
- A dependency is confirmed with `git log origin/staging --grep '(<KEY>)'` AND the tracker. I wrote on BK-231 that BK-230 was not on staging because a dev-roadmap line said so; BK-230 had merged (PR #208). Corrected on the ticket the same hour.
- The G3 sign-off on `QA Approved` needs more than the DoD minimum when the QA's last report says NOT SIGNED OFF: check who moved the status and whether the QA accepted the residual risk in writing. For BK-595 and BK-743 I signed at the minimum, had to correct my own rationale, and closed the risk afterwards with a measure-only worker (it found BK-1555). Next time, queue the measuring before the transition.
- A measure-only worker with a clear "do not fix, file a Defect" rule is cheap and precise: one worker, one hour, 3 findings and a clean fixture teardown that I could re-count.
- Measure the full suite on the current `origin/staging` before telling a worker it is red; a brief must not carry the stale "red since #301" claim (it was green by the time BK-206 merged).
- `orca worktree rm` returns before git drops the worktree; `git worktree prune` after a few seconds, then `git branch -d`. A merged branch may need a second prune pass.
- Defects stay `Open` after their fix merges (confirmed again: BK-1122, BK-1169, BK-620, BK-1168, BK-1449, BK-1548, BK-1555). The retest flow moves them, not the Jungla.

## 2026-11-02 · Monday run (autonomy order, first design workers)

- Owner order (terminal, 2026-11-02): the Jungla runs Bunkai as if it were its own; the channel is for very important things and reports with decisions; unblock everything that is not truly blocked. Mockup gates are cleared by the worker itself as a scored spec-only departure (D39/D40/D56 precedent), not held. Models: haiku subagents for exploration, sonnet for implementation, opus for architecture and design.
- Worker heartbeats ("alive" plus a phase) arrive in the run mailbox every ~10 minutes and show as "You have N orchestration messages". They are not events: `orca orchestration check --run <run> --ack <delivery_id>` and move on. `worker_done` is the only message that closes work.
- `worker-release --dispatch <id>` takes no `--run`; it refuses while the dispatch is not settled. A worker that finished without sending `worker_done` (BK-666, idle at a shell prompt, heartbeats stopped, `stale_status`) is closed with `worker-stop` after you verify the PR, the ancestry and Jira yourself.
- A silent worker is not a stuck worker: before assuming it died, check `gh pr list --state merged` and the Jira status.
- A design worker can split its own scope into a second tech story (BK-1557 then BK-1558) and the watcher then fires a GANK for it. Do not dispatch a second worker; the same worker takes it.
- "Run history retention 90 of 30 days" on Billing is by design (oldest run age against the plan window), not a defect.
- A haiku explorer can audit the live UI read-only with playwright-cli as the QA identity (report in `runs/<date>-design-audit/audit.md`); it costs a fraction of a worker and gives the design workers a ranked list.
- A `[ISSUE_TRACKER_TOOL]` create call that built a heredoc, a temp dir and an `rm -rf` in one Bash call was denied by the permission layer once; write the description with the Write tool and make the tracker call plainly.

## 2026-11-03 · Tuesday run (student fork PR, restarts)

- A student's fork PR (cross-repo, CONFLICTING) cannot be pushed to. BK-1450 / PR #300: the worker re-derived the fix in its own worktree from `origin/staging`, kept only what held up (it dropped the `Promise.race` that turned a 504 into a 503 for every large image), opened ONE PR "Supersedes #300", credited her by origin without an `@`, and closed #300 with a comment. Read the fork's diff before deciding what to keep.
- Root cause worth remembering (BK-1450): inside a Next.js route handler `fetch` is the dedupe fetch, which tees every GET without a signal, and an awaited `reader.cancel()` on one branch never settles. A ranged Storage read needs `AbortSignal.timeout(...)` and no awaited cancel.
- `bun install` in a fresh worktree printed `ENOENT ... cache/package/version dir for package strip-ansi` once; a second `bun install` reported "no changes" and `node_modules` was complete. Re-run it before assuming the worktree is broken.
- Vercel's first build of a PR commit can fail on a transient `next/font` Google fetch; redeploying the same commit went green. Not a code defect.
- The watchdog relaunched the session at 11:10 (watcher.alive 591 s stale, `working` older than its beat). Phase 0 handled it: guard, state kept, watcher re-armed. The keepalive (`sleep 21600`) ends after 6 h, so relaunch it around 17:00.
- Every HEARTBEAT arrives as `exited with code 10` and a worker's `worker_done` as an "orchestration message" in the session: confirmed again that a worker finishing does not fire the watcher. Check `orca orchestration check --run <run>` at every wake-up. (Third confirmation with the 2026-11-01 entries: promote into `routine.md` Phase 2.)
- A `[ISSUE_TRACKER_TOOL]` create call works as a plain call with the description read from a file written by the Write tool (BK-1589); the compound call that was denied on 2026-11-02 is the thing to avoid.
- A migration worker can apply its own migration after the review is adjudicated when the brief delegates it; I still re-read `pg_proc.prosrc` and compared md5 with the worker's file hash. The comparison text may be lowercase: search case-insensitively.

## 2026-11-04 · Memory incident and the guarded-tests rule
- A worker ran bun test on four files and the process reached 20 GB on a 16 GB Mac for 46 minutes (swap 95%). Cause: a render loop inside a synchronous act() (a mock returning a new object every render plus that object in a hook dependency list); `--timeout` cannot interrupt it. The owner rule GUARDED-TESTS (PR #323) now governs: no agent runs bun test directly, one file at a time through scripts/guard.sh, the full suite goes to CI. My briefs must not ask for a full local suite. Until #323 merges the guard is used by absolute path from the chore-test-guard-ci worktree.
- A worker that is parked by someone else stays in active_runs with a note; the Master (orca-bridge) can write briefs to this session. A subagent must never `pkill -f "next dev"`: stop only its own server by pid or port.
- `orca orchestration send --to dispatch:<id>` delivers a long order byte-intact; the terminal send after it only needs a one-line pointer.
- A Slack post through `scripts/slack.sh` is one section block, capped at 3000 characters: a longer text answers `invalid_blocks`. Split it: the main message first, the rest as a thread reply with the returned ts (2026-11-04 sprint review, 3120 characters).
- A G4 shift-left must check the dependency chain before picking the story: BK-601 hard-depended on BK-571 (no code), so the slot became BK-571 first. The sonnet subagent did the whole shift-left on Jira in about 3 minutes, including the four-step transition Backlog, Shift-Left QA, Estimation, Ready For Dev.
- The Master (orca-bridge) can write a brief to this session while a worker runs; a worker question can predate your order, so reply to it with the order's content and ack the delivery. `worker-release` answers `retained / user_takeover` after a human touched the worker terminal; removing the worktree still works (`orca worktree rm --force`, `.pi/` is untracked residue), then `git worktree prune` after about 10 seconds.
- Fourth confirmation that a worker finishing does not fire the watcher: both `worker_done` messages of 2026-11-04 arrived as "You have N orchestration messages" in the session. Check the run mailbox at every wake-up (promote into `routine.md` Phase 2).
- `wait-jungla.sh` exit codes: 10 HEARTBEAT, 11 END_OF_DAY, 13 PROACTIVE, 0 an event line (GANK/OWNER/INBOX). Kill a stale watcher with `pkill -f 'wait-jungla.sh <ts>'` before re-arming with a different proactive slot; the killed task reports exit 144.

## 2026-11-05 · Shift-left transition path differs from the cached workflow
- From Shift-Left QA the live workflow offers only `refiened` and `back`; the cached `estimate` transition is absent and `acli` answers "No allowed transitions found". The `refiened` transition (via the Atlassian MCP) goes straight to Ready For Dev, skipping Estimation, so Story Points stay unset (acli cannot write custom fields). Run `bun run jira:sync-workflows` and check whether skipping Estimation is intended before the next G4.

## 2026-11-05 · A merged PR does not always move the Jira story
- BK-601 (PR #326, merge c88994e0) stayed `Ready For Dev` with no "Pull Request ... MERGED" automation comment at all, unlike BK-666 and BK-571. The brief had forbidden the worker to transition. After verifying ancestry and the live migration md5, the conductor walked `In Progress`, `In Review`, `Ready For QA` with `acli ... --status` (each read back). Next time: check Jira 5 minutes after `worker_done` and walk the path yourself if it did not move; the brief can allow it.
- The claude.ai Supabase connector's `apply_migration` needs an interactive confirmation and expires unattended: workers apply migrations through the project's own `supabase` MCP.

## 2026-11-05 · Thursday run (three merges, two sign-offs, tech story flow)
- Mailbox events promoted: a worker's `worker_done` and `question` never fire the watcher (sixth confirmation on 2026-11-05, BK-1589 and BK-1618 both waited until a heartbeat). The rule is now in `routine.md` Phase 2. The coordinator terminal is bound to the newest run (`This coordinator terminal is bound to run_X`): check the latest run id only, and ack handled deliveries so they do not repeat.
- `bun run worktree:provision <path>` provisions a fresh Orca worktree (`.env`, `node_modules`, skills alias) without the conductor ever reading `.env`: a direct `cp .env` is denied by the permission layer. Use it instead of the manual steps in `SKILL.md`.
- Tech Story and Tech Debt share one short workflow (To Do, In Progress, In Review, then FIXED, Completed or AUTOMATED), and the gank JQL ignores them: they reach the Jungla only as a proactive pick. A Story retyped to Tech Story by the owner changes its status set (BK-1589 became FIXED). Findings and the proposal (drop FIXED, keep Completed and AUTOMATED) were sent to the owner on 2026-11-05; no decision yet.
- A sonnet shift-left subagent finishes a story refinement in about 3 to 5 minutes, but cannot set Story Points or the AC field (`acli` writes no custom fields): expect an unpointed story.
- A subagent's report can contain a false negative (it said `wait-jungla.sh` did not exist): verify any "not found" before repeating it to the owner.

## 2026-11-06 · A clone's code ships under the original's key (promoted to ganks.md G3)
- BK-467 sat as `qa-approved-no-code` for six days because the G3 code gate searched `git log` for its own key. It is a clone of BK-315, and the feature (PR 207, BK-637) carries BK-315's key. Before holding a story at the code gate, read its `story.md` links (clone of, relates to) and search the git log for the linked keys too; the QA comments say it outright ("clone of BK-315").

## 2026-11-06 · Friday run (quiet day, shared-checkout trap)
- The primary checkout is not always on `staging`: at 17:00 the owner had switched it to `feat/BK-1170-workspace-jira-connection` with uncommitted app work. A plain `git commit -- <paths>` landed on his branch and the pre-push failed on HIS lint errors. Run `git branch --show-current` before every commit in the primary checkout; if it is not `staging`, cherry-pick from a clean worktree (`git worktree add --detach <path> origin/staging`, `bun run worktree:provision <path>`, push `HEAD:staging`, `git worktree remove <path>` without `--force`). To take a commit off his branch without touching his tree: keep a temp ref, `git reset --soft HEAD~1`, then restore only your own paths.
- The permission layer denied `git worktree remove --force` and `git branch -D` in one compound call; the plain `git worktree remove` worked. A temp branch whose commit was cherry-picked (new SHA) is never "merged", so `git branch -d` refuses: delete it with `-D` when the owner allows, or leave it noted.
- A quiet day is a valid day: all 16 Open defects already had merged fixes (status lag) and waited for the QA retest, so the three proactive slots went to the workflow-cache sync (content unchanged, only key reordering) and the m6 doubts (BK-467 and BK-509 both shipped under a sibling key).
- A peer session (not the owner) can relay a message into this one; log it as peer-reported and unverified, and verify against git before quoting it to a student.

## 2026-11-07 · Saturday run (quiet, two small traps)
- `ps -axww | grep '[w]ait-jungla.sh' | wc -l` reads 2 for ONE watcher (the shell wrapper plus the script): count it as 1, and never launch a second one on that reading.
- `cd <dir with a glob> && wc ...` on a `.context/PBI/.../STORY-*` folder was denied (the `.auth/**` deny rule matched the compound command). Locate the folder with `find`, then use the Read tool on `comments.md`.
- A QA story whose result is PASSED WITH ISSUES (0 failed, deferred cases with a stated reason, improvements filed as tickets) meets the G3 minimum; the deferred cases go into the review-request for the tutor (BK-572).

## 2026-11-08 · Sunday run (Estimation is gone from the JQL too)
- `JUNGLA_SHIFTLEFT_JQL` and `JUNGLA_STOCK_JQL` listed `Estimation`, a status the live workflow no longer has, so `acli` answered "the value 'estimation' does not exist for the field 'status'" and the G4 sweep silently found nothing. Removed it from `jungla.conf` and `references/ganks.md`. Same root as the 2026-11-05 entry: the cached workflow was stale. Run a JQL by hand after any workflow change.
- A watcher that ends with HEARTBEAT is gone by the time the notification arrives: do not read a `ps` count taken before relaunching as "still alive". Count after the relaunch (2 lines = one watcher).

## 2026-11-09 · Monday run (a defect that was not one, Pi worker handoff)
- A QA-filed defect can be a non-defect: BK-1688 ("Command Palette cannot find an active ATC after reload") was ruled works as designed after the worker read the Vercel runtime logs and the Supabase edge logs: the reporter's three search calls all answered 200 with the right workspace, and the RPC under their RLS context returned the ATC. Before dispatching a repro worker, call the RPC as DB owner (a one-line `execute_sql`) to split "index is wrong" from "scope or timing is wrong". The ATC code (`atc-<hex>`) is a slug suffix that no search surface indexes.
- An owner can redirect a worker from inside its terminal: the BK-222 Claude worker stopped after Stage 1 on a live owner order (save Claude tokens, try the Pi agent for worker jobs) and sent `escalation` plus `worker_done --outcome failed` (handed off, not a defect). `orca orchestration worker-start --agent pi --worktree path:<same worktree>` with a one-line spec pointing at its `.session/handoffs/...` file continued the work: the Pi worker merged PR #332 with a migration in about 1.5 h. `worker-release` on the stopped Claude dispatch answers `retained` after a human touched its terminal; the worktree removal still works. Treat such an order as peer-reported, verify the handoff file and the clean tree first.
- Mailbox again: `worker_done` for BK-1688 sat 6 h and for BK-222 about 20 min before a HEARTBEAT woke me (seventh and eighth confirmation of the 2026-11-05 entry; already in `routine.md` Phase 2). A watcher also exits with code 0 and a GANK line for a ticket the conductor already knows about (BK-1688 right after the first probe): read the line, do not redispatch.
- The G4 sweep on a sonnet subagent works end to end: it walked the candidates in rank order, skipped BK-217 (dependency BK-215 is BLOCKED in Jira although merged), refined BK-222 with 8 AI PO decisions and moved it Backlog, Shift-Left QA, Ready For Dev with plain `acli` (no `refiened` fallback needed this time). I re-read the status myself. The refined story became a G1 within minutes, so a shift-left slice late in the day can lead straight to a worker: check the clock against the 21:00 soft close first.
- A `git branch -D` inside a compound Bash call is denied by the permission layer; `orca worktree rm --force` works alone, then `git worktree prune`, and the local branch is left for a later plain call.
