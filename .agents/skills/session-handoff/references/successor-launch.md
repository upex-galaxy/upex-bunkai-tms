# Launching the successor

Write the handoff file first, in full, and start the successor only after that.

## This is not orchestration

A handoff transfers ownership of a whole session. There is no Task, no Dispatch, no mailbox, no supervision, and nothing comes back, because the successor is the predecessor. Reaching for the orchestration verbs creates a supervised worker that the owner then has to release and close for no reason.

The right family is the plain terminal-and-worktree one. When the command grammar is needed, ask the runtime's binary for its own CLI guide, because a copy in this repo desynchronizes on the next release.

| | Handoff (this skill) | Orchestration (`/agent-orchestration`) |
|---|---|---|
| what moves | the whole session | one scoped task |
| the predecessor | ends | keeps working and supervises |
| channel afterwards | none, by design | mailbox, questions, replies |
| runtime objects | a terminal | Run, Task, Dispatch, worker |

## The launch line

The launch line belongs to the harness, not the runtime: each harness launches itself (`claude`, `opencode`, `codex`, `pi -n <name> "<first prompt>"`).

Start it with that binary and nothing in front of it. The harness process holds no `.env` value and its MCP servers read `.env` through the loader when they spawn (ADR-0016), so a `varlock run`, `dotenv` or `source .env` prefix would put values where none belong.

The line carries two things:

1. The session name: the handoff basename without the extension, passed the harness's own way (read its `--help`; do not copy a flag into this repo). On Claude Code the prompt hook also titles an unnamed session from a `--name <value>` token in the first prompt (`proposeSessionTitle` in `.agents/hooks/personality-reinject.mjs`).
2. The first prompt (below).

The working directory is the same worktree as the predecessor's, `<<REPO_ROOT>>` (`git rev-parse --show-toplevel`), not `<<PRIMARY_ROOT>>`. Only the handoff file lives in the primary.

A predecessor that was itself a fleet worker opened its prompt with `/<skill> <label> fleet worker`. Its successor's first prompt opens with that same token, then the sentence below, so the prompt hook still treats it as that conductor's worker. A predecessor no conductor launched adds no token, since the token would point the successor at a conductor that does not exist. In this case pass the session name with the harness flag, never as a `--name` token in the prompt: the hook ranks the fleet token above a prompt `--name`.

## With a reachable runtime

Check three preconditions before launching:

1. The binary is present and the runtime is reachable (the three-state runtime gate in `/agent-orchestration`). Where the prompt hook reports runtime availability on a line of its own, that line is present this turn.
2. The handoff file exists at its final path and is complete.
3. The successor's target is the same worktree the predecessor is in, on the same harness.

Then create one terminal in the active worktree whose command is the launch line: a plain terminal create, not a supervised worker launch. The traps (the screen read, the delivered-is-not-run receipt) are in the `/agent-orchestration` gotchas ledger, G11 and G13, and the grammar is the binary's own guide.

Announce the launch to the owner before firing it, naming the terminal, since a second session is about to appear on their board. With nobody present, "With nobody at the keyboard" in `SKILL.md` applies: a conductor or a brief that names the launch holds the gate, and without either you stop at the printed line.

## Without a runtime

Print the launch line, say where the handoff file is, and let the owner paste it into a new terminal opened in the same worktree. The prompt is byte-identical to the runtime path's: the path nobody exercises is the one that silently breaks, and here the prompt is the whole payload.

## The first prompt, both paths

One sentence, no cleverness:

> Read `<absolute path to the handoff>` top to bottom and continue that session exactly where it stopped.

If §0 of the handoff names an ordering the successor must respect, say so in the prompt too. A file pointer reads as reference material and an instruction in the prompt reads as an instruction; that difference was measured on dispatched agents.

## After the successor is up

The predecessor's last acts, in order:

1. Confirm on screen that the successor started and has the file.
2. Persist anything durable to memory (`mem_session_summary`); the handoff is disposable and gitignored, memory is not.
3. Stop.

Leave the predecessor's terminal open. Ending it is the owner's call, and a session that closes itself mid-verification cannot report that the handoff failed.
