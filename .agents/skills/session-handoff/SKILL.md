---
name: session-handoff
description: "Compact an entire agent session into a handoff document so a NEW session resumes exactly where this one stopped, as if the context window had been extended rather than reset. Use when the context window is getting high (default threshold ~500k tokens, beyond which the model degrades and starts inventing), when work must continue past the end of this session (a story mid-implementation, a PR mid-review, a deploy mid-verification), or on any variant of: hagamos el handoff, pasa el contexto a otra sesion, continua esto en otra sesion, hand this session over, continue this in a fresh session, write a handoff, session handoff. Produces <<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md (the primary checkout, also from a worktree) and launches the successor in the SAME worktree and the SAME harness: by itself when an orchestration runtime is reachable, otherwise by printing the one launch line for the human to paste. Do NOT use for: delegating a scoped task to a worker while you keep working (that is orchestration, `/orca-orchestration`), one-shot subagent dispatch (AGENTS.md §3 briefing), resuming a single story's pipeline state (that is `/sprint-development` Phase 0 over `.session/sprint-development/<KEY>/progress.md`), or persisting durable project facts (that is Engram memory, the repo, or the tracker)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: workflow
---

# Session Handoff

A handoff is **context transplanted, not context summarized**. The successor is not a reader being briefed on someone else's work; it IS this session, with a new window. Everything it needs to act must be on disk, addressable, and true when it reads.

The skill is small on purpose. The heavy artifact is the markdown it produces, and the whole contract lives in `.agents/skills/session-handoff/references/capture-contract.md`.

## Compact Rules

- **The file lives in the PRIMARY checkout**: `<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md`, also when the session runs in a linked worktree (`.agents/README.md` §"Checkout roots"). Never derive the root from `pwd`.
- **`NN` comes from listing that directory**, two digits from `01`, counted across the whole lineage. The successor's session name is the handoff basename without the extension.
- **All ten sections of the capture contract, in order.** An empty one is an explicit `none` line with a reason, never omitted.
- **Label every claim `measured` or `predicted`; mark live state `PERISHABLE` with the wall-clock time it was measured** and the exact command that re-verifies it. Perishable beats priority.
- **Ids are copied verbatim in backticks** (PR number, tracker key, SHA, deploy id, session id, terminal handle); every path is absolute.
- **Write the file BEFORE launching the successor**, then launch it in the same worktree and the same harness. Never delete a predecessor's handoff.
- **A handoff is a repo artifact**: English, no AI attribution (Critical Rules #3 and #12), never committed (`.session/` is gitignored).

## What this is not

| Looks similar | Actually is | Use |
|---|---|---|
| hand a scoped task to another session and supervise it | orchestration: a task goes out, the work comes back | `/orca-orchestration` |
| dispatch a subagent for one bounded piece of work | a briefed executor inside THIS session | AGENTS.md §3, `agentic-dev-core/references/briefing-template.md` |
| resume one story's pipeline after a break | per-skill session state, keyed by ticket | `/sprint-development` Phase 0, `agentic-dev-core/references/session-management.md` |
| remember a decision for next month | durable cross-session fact, project-scoped | Engram (`mem_save`), an ADR, or the tracker |
| shrink the window and keep going | harness compaction, lossy, not addressable, not yours to shape | nothing to do |
| **hand the whole SESSION to its own successor** | **this skill** | here |

The distinction that matters: compaction keeps what a summarizer judged salient. A handoff keeps what the NEXT actor needs, which is a different set, and it is written by the only party that knows the difference.

`session-management.md` and this skill compose, they do not overlap: per-skill `progress.md` files record where ONE workflow stands, and the handoff points at them (§6 reading list, §7 live state) instead of copying them.

## When to write one

**Manual is the primary trigger and that is by design.** The human notices the window filling, says so, and the skill runs. No polling, no nagging, no token spent guessing.

Whether any harness can trigger this automatically is answered, with citations, in `.agents/skills/session-handoff/references/auto-trigger.md`. Read it before promising the owner an automatic mode.

Write one when any of these is true:

- the context window is past the owner's threshold (~500k tokens unless the owner names a different one; it is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key) <!-- volatile-ok: owner-stated judgement threshold, explicitly not config -->
- the session is about to end with work still in flight (an open PR, a staging deploy not yet verified, a migration written but not applied)
- the session is about to do something that will itself consume a large slice of the window (a big diff review, a long file read, a full test-suite log) and the remaining budget will not cover the work after it
- the owner asks

Do NOT write one when the remaining work fits comfortably in the window. A handoff costs a real slice of context to produce, and a successor launched too early pays the startup tax for nothing.

## The three steps

1. **Capture.** Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory; a section with nothing in it is written as an explicit `none` line, never omitted. Omission is indistinguishable from forgetting, and the successor cannot tell which happened.
2. **Write.** Fill `.agents/skills/session-handoff/templates/handoff.md` to `<<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md`. Naming contract below.
3. **Launch the successor.** Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a runtime, this session launches it. Without one, this session prints the line and the human pastes it.

## Naming and location contract

```
<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md
```

- `<<PRIMARY_ROOT>>` resolves with `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"` (`.agents/README.md` §"Checkout roots"): the same value from the primary and from every worktree of it.
- `.session/` is gitignored, and a handoff is disposable by design: it describes one session's state, it is not a project record, and committing it would put a decaying snapshot under version control.
- It lives in the PRIMARY checkout even when the session runs in a linked worktree. A handoff written inside a worktree dies with the worktree, and two worktrees of one lineage would each count `NN` from their own empty directory. The successor still launches in the SAME worktree as the predecessor; only the file lives in the primary. A handoff written into a worktree's own `.session/` by mistake is rescued by `bun run worktree:audit --rescue` before the worktree goes.
- `NN` is zero-padded, two digits, starting at `01`, incrementing across the whole lineage. List `<<PRIMARY_ROOT>>/.session/handoffs/` before choosing; never assume, and never count from a worktree's own `.session/`.
- **The successor's session name is the handoff file's basename without the extension.** That is the entire naming rule, and it makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`. Long names are the point; a lineage you cannot read is a lineage you cannot audit.
- `<predecessor-session-name>` is the `session=` value of the `AGENT IDENTITY:` line the prompt hook injects (the same label the commit trailers carry), with spaces and parentheses replaced by `-`. When it reads `unknown`, ask the owner for a name rather than inventing one.
- A durable fact that outlives the session does not belong in the handoff. It belongs in Engram, in the repo (an ADR, a doc), or in the tracker. The handoff cites it.

## Hard rules

1. **Label every claim `measured` or `predicted`.** The predecessor's guesses about what the successor will find are useful and are also the first thing to go stale. A predicted branch stated as fact sends the successor down a path that no longer exists. Measured means: this session ran it and read the output.
2. **Mark perishable state `PERISHABLE`, with the wall-clock time it was measured.** Open PRs and their checks, staging and production deploys, running subagents, Jira transitions in flight, applied-but-unverified migrations decay between writing and reading. The successor's instruction for anything marked perishable is: re-verify before acting, not act then discover (Critical Rule #16: a receipt is not an outcome).
3. **Perishable beats priority.** If a perishable item needs attention before the priority list, say so in the same line. A successor that follows a stale priority order while a deploy sits half-verified has done exactly what the handoff was supposed to prevent.
4. **Ids are copied, never described.** A PR number, a tracker key, a commit SHA, a deployment id, a session id, a terminal handle: verbatim, in backticks, in a form that can be pasted. "the PR from earlier" is not an id.
5. **Every path is absolute.** The successor may start in a different directory.
6. **Name what is NOT done and why.** A handoff that reads as an unbroken success is a handoff that hid something, and the hidden thing is always what bites.
7. **Write the file before launching the successor.** They are not separable, and the order is not reversible: a successor that starts first reads a file that does not exist yet.
8. **Harness parity.** The successor runs on the same harness as the predecessor. A handoff shaped for one agent's conventions handed to another is a translation problem nobody asked for.
9. **No AI attribution anywhere, ever** (Critical Rule #3). A handoff is a repo artifact in English, even when the conversation is not (Critical Rule #12).
10. **Do not delete the predecessor's handoff.** The lineage is the audit trail. Writing `-handoff-02` never removes `-handoff-01`.
11. **No secrets in the file.** A handoff names the `.env` key a credential lives under, never its value; a session cookie, token or `storageState.json` path stays out (AGENTS.md §3 ephemeral-artifact contract).

## References

| File | What it holds |
|---|---|
| `.agents/skills/session-handoff/references/capture-contract.md` | the ten mandatory sections, what each one is for, and the failure mode that justifies it |
| `.agents/skills/session-handoff/references/successor-launch.md` | launching the successor with and without a runtime, per harness; why this is not orchestration |
| `.agents/skills/session-handoff/references/auto-trigger.md` | whether any harness exposes context size to a hook, with citations and a verdict |
| `.agents/skills/session-handoff/templates/handoff.md` | the skeleton to fill |

Related doctrine: `agentic-dev-core/references/session-management.md` (per-skill `progress.md` state that a handoff points at), `agentic-dev-core/references/briefing-template.md` (the 7 components, which a handoff deliberately is NOT: a briefing scopes a task, a handoff transplants a session).
