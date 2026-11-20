---
name: session-handoff
description: "Hand a whole session to a fresh successor through a handoff file, so work continues as if the context window had been extended. Use when the context window is filling up; when work must outlive this session (a PR mid-review, a deploy mid-verification); when the owner asks for a handoff or to continue in a fresh session. Not for delegating a task to a worker (agent-orchestration) or resuming one story's pipeline (sprint-development)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: workflow
---

# Session Handoff

A handoff transplants context; it does not summarize it. The successor is not a reader being briefed on someone else's work. It is this session with a new window, so everything it needs to act has to be on disk, addressable and true when it reads.

The whole contract lives in `.agents/skills/session-handoff/references/capture-contract.md`.

## Compact Rules

- The file lives in the primary checkout, `<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md`, also from a linked worktree (`.agents/README.md` "Checkout roots"). Do not derive the root from `pwd`.
- `NN` comes from listing that directory (two digits from `01`, across the whole lineage). The successor's session name is the handoff basename.
- Write all ten sections of the capture contract, in order. An empty one gets an explicit `none` line with a reason.
- Label each claim `measured`, `read` or `predicted`. Mark live state `PERISHABLE` with the time it was measured and the exact command that re-verifies it. Perishable beats priority.
- Copy ids verbatim, in backticks (PR number, tracker key, SHA, deploy id, session id, terminal handle). Write every path as absolute.
- Finish the file before launching the successor, in the same worktree and on the same harness. Keep every earlier handoff.
- Launch only when a person is present, the conductor says so, or the delegating brief names the launch. Otherwise print the launch line and report (`## With nobody at the keyboard`).
- A handoff is a repo artifact: English, no AI attribution (Critical Rules #3 and #12), never committed (`.session/` is gitignored). It names the variable a credential lives under (`$STAGING_USER_PASSWORD`), never the value, and leaves out session cookies, tokens and `.auth/**` paths (Critical Rule #1; `AGENTS.md` §3 ephemeral-artifact contract).

## What this is not

| Looks similar | Actually is | Use |
|---|---|---|
| hand a scoped task to another session and supervise it | orchestration: Task, Dispatch, mailbox, the work comes back | `/agent-orchestration` |
| hand work away and stop caring | ownership transfer of a task, one direction, no return | the binary's own `orca-cli` guide |
| dispatch a subagent for one bounded piece of work | a briefed executor inside this session | AGENTS.md §3, `agentic-dev-core/references/briefing-template.md` |
| resume one story's pipeline after a break | per-skill session state, keyed by ticket | `/sprint-development` Phase 0, `agentic-dev-core/references/session-management.md` |
| remember a decision for next month | durable cross-session fact, project-scoped | Engram (`mem_save`), an ADR, or the tracker |
| shrink the window and keep going | harness compaction: lossy, not addressable, not yours to shape | nothing to do |
| hand the whole session to its own successor | this skill | here |

Compaction keeps what a summarizer judged salient; a handoff keeps what the next actor needs, and only the session writing it knows that set.

## When to write one

Manual is the primary trigger, by design. The owner notices the window filling and says so, and the skill runs. Whether any harness could trigger it automatically is answered in `.agents/skills/session-handoff/references/auto-trigger.md`; read that before promising the owner an automatic mode.

Write one when any of these holds:

- The context window is past the owner's threshold (about 500k tokens unless the owner names another). It is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key. <!-- volatile-ok: owner-stated judgement threshold, explicitly not config -->
- The session is about to end with work still in flight (an open PR, an unverified staging deploy, a migration written but not applied).
- The next step will consume a large slice of the window (a big diff review, a long file read, a full test-suite log) and what remains would not cover the work after it.
- The owner asks.

Skip it when the remaining work fits comfortably in the window. A handoff costs real context to produce, and a successor launched too early pays the startup cost for nothing.

## The three steps

1. Capture. Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory, and an empty one gets an explicit `none` line.
2. Write. Fill `.agents/skills/session-handoff/templates/handoff.md` into `<<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md`, following the naming contract below. Finish the file before the next step: a successor that starts first reads a file that does not exist yet.
3. Launch the successor. Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a reachable runtime, this session launches it. Without one, this session prints the launch line and the owner pastes it.

Done means the file exists at its final path with all ten sections, and the successor is either confirmed running with the file or the pasteable line has been printed.

## Naming and location contract

```
<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md
```

- `<<PRIMARY_ROOT>>` resolves with `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"`, the same value from the primary and from every worktree of it.
- `.session/` is gitignored, and a handoff is disposable: it describes one session's state and is not a project record. Committing it would put a decaying snapshot under version control.
- The file lives in the primary checkout even when the session runs in a linked worktree. A handoff written inside a worktree dies with it, and two worktrees of one lineage would each count `NN` from an empty directory. The successor still launches in the same worktree as the predecessor. A handoff written into a worktree's own `.session/` by mistake is rescued by `bun run worktree:audit --rescue` before the worktree goes.
- `NN` is zero-padded to two digits, starts at `01` and increments across the whole lineage. List `<<PRIMARY_ROOT>>/.session/handoffs/` before choosing, and never count from a worktree's own `.session/`.
- The successor's session name is the handoff file's basename without the extension. That makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`.
- `<predecessor-session-name>` is the `session=` value of the `AGENT IDENTITY:` line the prompt hook injects (the label the commit trailers carry), with spaces and parentheses replaced by `-`. When it reads `unknown`, ask the owner for a name. With nobody to ask (a worker or routine), take the name from the launching brief; if the brief has none, write the handoff under `unnamed-session` and say in the report that the name was a stand-in.

## Hard rules

The reasons behind the Compact Rules.

1. Measured means this session ran it and read the output; read means it came from a document and was believed. A predicted branch stated as fact sends the successor down a path that no longer exists.
2. Open PRs and their checks, deploys, running subagents, tracker transitions in flight and applied-but-unverified migrations decay between writing and reading. The successor re-verifies, then acts (Critical Rule #16: a receipt is not an outcome).
3. A successor that follows a stale priority order while a deploy sits half-verified has done what the handoff was meant to prevent, so a perishable item that needs attention first says so in its own line (§7 of the capture contract).
4. Name what is not done and why. A handoff that reads as an unbroken success has hidden something, and the hidden thing is what bites.
5. The lineage is the audit trail (writing `-handoff-02` never removes `-handoff-01`), and a handoff shaped for one harness's conventions is a translation problem for another, hence the same harness.

## With nobody at the keyboard

The launch is the only outward step. Three cases:

- A person is present: announce the launch and the terminal that carries it, then fire it.
- A supervised worker: the conductor holds the gate. Write the file, report its path to the conductor, and launch only when the conductor's brief says to.
- A routine (an unattended `autonomous-delivery` run included): the delegating brief is the approval source when it names handoff and launch. Without that, write the file, print the launch line, stop and report. Launching is the step that puts a second session on someone's board.

Section 8 of every handoff splits the items the owner decided from the items awaiting an owner decision. A successor with nobody to ask does the decided ones, records the open ones in its report and stops short of them (`agentic-dev-core/references/decision-protocol.md`).

## References

| File | What it holds |
|---|---|
| `.agents/skills/session-handoff/references/capture-contract.md` | the ten mandatory sections, what each is for, and the failure mode that justifies it |
| `.agents/skills/session-handoff/references/successor-launch.md` | launching the successor with and without a runtime, per harness; why this is not orchestration |
| `.agents/skills/session-handoff/references/auto-trigger.md` | whether any harness exposes context size to a hook, with citations and a verdict |
| `.agents/skills/session-handoff/templates/handoff.md` | the skeleton to fill |

Related doctrine: `agentic-dev-core/references/session-management.md` (the per-skill `progress.md` files record where one workflow stands; the handoff points at them in §6 and §7 and does not copy them), `agentic-dev-core/references/session-footer-contract.md` and `agentic-dev-core/references/briefing-template.md` (a briefing scopes a task, a handoff transplants a session).
