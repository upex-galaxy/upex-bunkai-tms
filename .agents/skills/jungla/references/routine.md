# The Jungla's daily routine

You run Monday to Friday from 6:00 to 21:00 ART, started by the Orca automation "Jungla Bunkai" through `~/.upex/aurora/bin/aurora-launch.sh jungla-bunkai`, in the main checkout (`JUNGLA_REPO`), with nobody watching the terminal. At 21:00 the day closes softly (Phase 4, decision S1 A); on Saturday and Sunday you only wake on demand (§ Weekend mode, S2 A). The key of the day: **waiting costs no tokens.** A bash watcher waits in the background and you do nothing until it ends.

Load the values once: `. <skill>/jungla.conf` in any shell that needs them (`<skill>` = `.agents/skills/jungla`). State lives in `$JUNGLA_STATE_DIR` (`~/.upex/jungla/bunkai`): `state.json`, `day-<AAAA-MM-DD>.md`, `jira-seen.json` (the watcher's), `watcher.alive`, `working`, `guard-exit`, `runs/`.

---

## Phase 0 · Start

1. Read `SKILL.md` (done if the agent file sent you here), `references/learnings.md` (newest entries are at the end), `references/ganks.md`. The rest loads when a wake-up needs it. Load `humanizer` before your first Slack message of the day.
2. **Is another Jungla already awake?** Two Junglas gank the same ticket twice. If `watcher.alive` is younger than 90 s (`echo $(( $(date +%s) - $(stat -f %m $JUNGLA_STATE_DIR/watcher.alive) ))`), or `ps -axww -o args= | grep -cE '^claude ([^ ]+ ){0,6}Eres El Jungla de Bunkai\. Lee '` counts **2 or more** (one of them is always you), you do not start: `echo "<time> <reason>" > $JUNGLA_STATE_DIR/guard-exit` (the watchdog will not relaunch you for 30 min), say it in your final answer and end, without launching the watcher.
3. **State.** Read `state.json`; if it does not exist, create it from the template at the end of this file.
   - Always: remove `closed_day` and `guard-exit` (if you started, someone started you on purpose).
   - **New day** (`day_started` is not today ART): `last_seen_ts` = now (epoch with decimals), `day_started` = today, `proactive_done` = []. <!-- volatile-ok: runtime date of each run, not a claim about the present -->
   - **Restart in the same day**: keep `last_seen_ts`; the watcher brings what the owners wrote while you were down.
4. **Home up to date.** `git fetch -q origin`. If `git status --porcelain` is empty and you are on `staging`, `git merge --ff-only -q origin/staging`. If the tree is dirty, that is probably the owner's work: do not touch it, note it in the journal, carry on.
5. **Tools.** Jira (`scripts/wait-jungla.sh --probe`: prints the gank JQL and the count per status), Slack (`scripts/slack.sh channel`: writes the channel id the watcher reads, or `ERROR restricted_action` while the channel does not exist; then you work without Slack and say so in the journal), Supabase (`select 1` on `JUNGLA_SUPABASE_REF`), `orca` (`orca status`). Without Jira you cannot gank: end the day with the error in the final answer.
6. **Startup audit** (once per day, the watcher only sees deltas): run the gank JQL in full and reconcile it with `state.json` `ganks` using `/autonomous-delivery`'s Phase 1 rules (git is truth). Open defects whose fix is already on `origin/staging` go to the journal as status lag, not to the queue. Then the bridge inbox (`scripts/bridge.sh pending`). Put what is real into `ganks` in priority order (`references/ganks.md` § Priority).
7. **Workers left running** in `active_runs` from yesterday or before the restart: check their state (`orca orchestration` per the doctrine) before arming the wait.

## Phase 1 · Arm the wait

**First the keepalive** (Orca closes the run as soon as no background shell is left, measured on the Auroras 2026-10-24): once per session, before the first watcher, launch with `run_in_background: true`: `sleep 21600 # jungla-keepalive`. If it ends, relaunch it before anything else. Never kill it: it dies with the session.

Then the watcher, with the Bash tool and **`run_in_background: true`**:

```bash
<skill>/scripts/wait-jungla.sh <last_seen_ts> 21:00 6600 <proactive_at|->
```

`proactive_at` is the next proactive block (Phase 2 · PROACTIVE): the earliest of `09:00`, `13:00`, `17:00` not yet in `proactive_done`, or `-` when none is left or a heavy worker is running. If a worker is running, launch its wait in the background in the same turn too. Then end your turn doing nothing else.

**Never end a turn without the watcher running.** If one is still alive when you come back here, do not launch another. The last line of its output says what happened:

| Output | What you do |
| --- | --- |
| `INBOX {…}` | Phase 2 · INBOX (and the other events the JSON carries, in priority order) |
| `OWNER {…}` | Phase 2 · OWNER |
| `GANK {…}` | Phase 2 · GANK |
| `PROACTIVE` | Phase 2 · PROACTIVE |
| `HEARTBEAT`, or the task ends `killed` by the 2-hour cap | relaunch the watcher with the same arguments, reading nothing else |
| `killed` by low memory | do not relaunch it: the watchdog brings you back |
| `END_OF_DAY` | Phase 4 (soft close): take no new gank or mission; if a worker is running, wait only for it (launch its mailbox wait, no watcher) and finish it before closing. The launcher leaves you alone until 2:00, the hard stop |
| `ERROR …` | another watcher in the background after 60 s. At the third `ERROR` in a row, do not close the day (a 20-minute Jira outage must not cost the rest of it): write the error to the journal and to `guard-exit` (the watchdog waits 30 min before relaunching you), **without** `closed_day`, then `~/.upex/aurora/bin/aurora-close.sh jungla-bunkai` as your last action |

## Phase 2 · Wake-ups

Before starting any work, `touch $JUNGLA_STATE_DIR/working` (and again before every long step: tests, a worker, many reads). While you work there is no watcher beat, and that file tells the watchdog you are alive.

- **INBOX**: each file is a `student-blocker` from the tutor. It is the top-priority gank: `references/ganks.md` § G0. Close each file with `scripts/bridge.sh done` in the same turn you finish it.
- **OWNER**: each element carries `ts`, `thread_ts`, `user`, `text`. Oldest first. An owner's request is a direct order (D6 B): do it, delegate it, or say in the thread why not. Reply in the thread with `scripts/slack.sh post <file> <thread_ts>`, humanized. `last_seen_ts` = the newest `ts` you handled.
- **GANK**: each event is `{key, type, status, gank}`. Handle per `references/ganks.md`. `blocked` alone is a signal to look for the defect that blocked it, not a job by itself.
- **PROACTIVE**: no gank waiting and no heavy worker running. Take the first mission in `state.json` `missions` with `status: ready` and do one slice of it (`references/missions.md`): one worker, or one hour of your own reading and writing. Add the slot to `proactive_done`.

After each wake-up: update `state.json` and append to the journal (time, what woke you, what you did, commit or PR or worker, what is left). No personal data. Then back to Phase 1.

## Phase 3 · Delegate

Per `SKILL.md` § Delegating with Orca. One heavy worker at a time; a second gank waits in `ganks`. When a worker ends, verify, release it, remove its worktree, and close the gank (Jira comment, bridge `answer` if it came from a student, journal line).

## Phase 4 · Close

Soft close (S1 A): from 21:00 you take nothing new. Work already in flight finishes first: your own step, and a running worker until its `worker_done`, which you verify, release and clean up as usual. The launcher does not reap you between 21:00 and 2:00 (`SOFT_CLOSE_UNTIL=2` in the launcher config); at 2:00 it is a hard stop, so a worker still unfinished by then is handed off instead (step 2).

1. `closed_day` = today in `state.json`: it tells the watchdog the day ended on purpose. If an owner asks you to close early, the same. <!-- volatile-ok: runtime date of each run, not a claim about the present -->
2. Handoff in `state.json`: `ganks` in priority order with a note on where each stands, and any worker you could not finish before 2:00 stays in `active_runs` with its state, for the next start's Phase 0 step 7.
3. Close the journal: ganks handled (by kind), commits and PRs, workers, migrations applied, DB cleanups, decisions published, what is left.
4. **Learnings**: per `SKILL.md` § Live skill.
5. On Wednesdays from 2026-11-04 (m7, S4 A): the sprint review in the channel (blocked, defects, stories ready, PO decisions taken, so the owners can veto). On 2026-11-04 it also carries the spike's proposal (S5 A).
6. Final answer (it stays in Orca's history): the same summary plus an estimated cost.
7. Last action of the day, in its own Bash call: `~/.upex/aurora/bin/aurora-close.sh jungla-bunkai`. The session ends seconds later.

No `mem_session_summary` at the close: the journal and `learnings.md` keep the day.

## Weekend mode (S2 A)

On Saturday and Sunday the launcher starts you only when its `WAKE_CHECK` (`~/.upex/aurora/bin/jungla-bunkai-wake.sh`) finds an owner message in your channel or a `student-blocker` in your inbox (`WEEKDAYS=12345`). On a weekend wake:

1. Phase 0 as usual, but skip the startup audit (step 6) beyond what the wake-up needs.
2. Handle only what woke you: the owner's message or the student blocker (and a worker you already had running).
3. No proactive missions, no discovery, no new ganks from the queue. Arm the watcher with `proactive_at` = `-`.
4. When that is done, Phase 4 and `aurora-close.sh`.

## `state.json` template

```json
{
  "day_started": null,
  "last_seen_ts": "0",
  "closed_day": null,
  "proactive_done": [],
  "ganks": [],
  "active_runs": [],
  "missions": "copy from references/missions.md § Initial backlog the first time",
  "stock": {"target": 20, "weekly_new": 10, "last_discovery": null}
}
```

## What this routine does NOT do

- Talk to students in Slack, or answer anyone but the owners.
- Wait with `sleep` or poll Slack or Jira by itself.
- Push to `main`, or move a story forward on a Jira status alone.
- Use `AskUserQuestion` or leave anything waiting in the terminal: nobody looks at it.
