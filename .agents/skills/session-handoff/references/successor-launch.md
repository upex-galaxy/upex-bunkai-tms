# Launching the successor

The handoff file is written first, in full, and only then does the successor start. That order is not reversible.

## This is not orchestration

A handoff transfers ownership of a whole session. There is no task, no dispatch, no mailbox, no supervision and nothing comes back, because the successor IS the predecessor. Orchestration verbs are the wrong family entirely, and reaching for them creates a supervised worker that the owner then has to release and close for no reason.

The correct family is the plain terminal-and-worktree one. When a runtime's command grammar is needed, ask its binary for its own CLI guide; never copy command grammar into this repo, because a copy desynchronizes on the next release.

| | Handoff (this skill) | Orchestration (`/orca-orchestration`) |
|---|---|---|
| what moves | the whole session | one scoped task |
| the predecessor | ends | keeps working and supervises |
| channel afterwards | none, by design | mailbox, questions, replies |
| runtime objects | a terminal | run, task, dispatch, worker |

## The launch line

The launch line is the harness's, not the runtime's. A Claude Code predecessor launches a Claude Code successor; OpenCode launches OpenCode; Codex launches Codex.

Start it with the harness's own binary (`claude`, `opencode`, `codex`), with no wrapper and no env loader in front of it: the harness process holds no `.env` value, and its MCP servers read `.env` through the loader when they spawn (ADR-0016). Never prefix the line with `varlock run`, `dotenv` or `source .env`.

The line carries two things:

1. **The session name**: the handoff basename without the extension. Pass it the harness's own way (its launch flag; read `--help` rather than copying a flag here). On Claude Code the prompt hook also titles an unnamed session from a `--name <value>` token in the first prompt (`.agents/hooks/personality-reinject.mjs` → `proposeSessionTitle`), so the name survives even when no flag is passed.
2. **The first prompt** (below).

It runs in the **same worktree** as the predecessor: the working directory is `<<REPO_ROOT>>` (`git rev-parse --show-toplevel`), not `<<PRIMARY_ROOT>>`. Only the handoff file lives in the primary.

## With a reachable runtime

Preconditions, all three, verified before launching:

1. the runtime is reachable: the binary is present and its runtime answers (the three-state gate in `/orca-orchestration`, §The gate), and, where the prompt hook reports runtime availability on a line of its own, that line is present this turn
2. the handoff file exists at its final path and is complete
3. the successor's target is the **same worktree** the predecessor is in, and the **same harness**

Then create one terminal in the active worktree whose command is the launch line above. That is a plain terminal create, never a supervised worker launch: the terminal verbs and their traps (the screen read, the delivered-is-not-run receipt) are in `/orca-orchestration` (`references/gotchas.md` G11, G13), and the grammar is the binary's own guide.

**Announce the launch to the owner before firing it**, and say which terminal will carry it. The owner is about to have a second session appear on their board.

## Without a runtime

Print the launch line, say where the handoff file is, and let the owner paste it into a new terminal opened in the same worktree. Nothing else differs. The prompt is byte-identical to the runtime path's: the path nobody exercises is the one that silently breaks, and here the prompt is the whole payload.

## The first prompt, both paths

One sentence, no cleverness:

> Read `<absolute path to the handoff>` top to bottom and continue that session exactly where it stopped.

If §0 of the handoff names an ordering the successor must respect, say so in the prompt too. A file pointer reads as reference material; an instruction in the prompt reads as an instruction. That difference has been measured on dispatched agents and it applies here.

## After the successor is up

The predecessor's last acts, in order:

1. confirm on screen that the successor started and has the file
2. persist anything durable to memory (`mem_session_summary`), because the handoff is disposable and gitignored while memory is not
3. stop

Do not close the predecessor's own terminal as part of this skill. Ending the predecessor is the owner's call, and a session that closes itself mid-verification cannot report that the handoff failed.
