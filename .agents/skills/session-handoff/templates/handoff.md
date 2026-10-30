# HANDOFF NN — from session `<predecessor-name>` (`<predecessor-session-id>`) to `<predecessor-name>-handoff-NN`

> Written <YYYY-MM-DD HH:MM local> by the outgoing session at ~<N>% of a <window> context after ~<N> hours of work.
> You are the continuation of that session: same owner, same repo, same authority, new context window.
> Read this file top to bottom before doing anything. Everything cited is on disk. Paths are absolute.
> Repo: `<absolute worktree path>` (branch `<branch>`, <clean|dirty>, at `<sha>`). Primary checkout: `<absolute <<PRIMARY_ROOT>> path>`.
> Language: <the owner's language for replies>; repo artifacts in English (AGENTS.md Critical Rule #12).

---

## 0 · Your FIRST task

<One task. The owner's intent, quoted where they stated criteria, numbered. A story's own acceptance criteria are cited by path, not copied.>

<What done looks like, and what happens immediately after.>

---

## 1 · Identity and authority

- Owner: <who, how they decide, what they delegated, what they reserved>
- Harness / worktree / session label: <values, from the `AGENT IDENTITY:` line>
- Commit trailers: `Worktree: <value>` / `Session: <value>`
- Git strategy and push policy: <the RESOLVED values from `git_strategy:` in `.agents/project.yaml`, not the key names>
- Active environment: <`active_env`, and why if it differs from the default>
- <anything the owner said once and will not repeat, verbatim>

## 2 · What was built

<One paragraph per unit of work. SHAs, PR numbers, deployment ids, absolute paths. State what is pushed vs local, merged vs open, deployed vs only built.>

## 3 · Decisions, each with its why

| Decision | Alternatives rejected | Why | Decided by |
|---|---|---|---|
| | | | owner \| session (delegated) |

## 4 · Gotchas and observations

<Each line tagged `measured` or `read`, with the version or date it holds for.>

## 5 · Skills, tools and MCPs used

| Kind | Name | Used for | Load next session? |
|---|---|---|---|
| skill / CLI / MCP capability / tool | | | YES/NO + the reason |

## 6 · Files to read, in order

1. This file.
2. `<absolute path>` — <what it is, which sections>
3. …

## 7 · Live state you inherit — PERISHABLE

> Everything in this section was true at <HH:MM>. Re-verify each item with the command given BEFORE acting on it.
> <If any item needs attention before §8's order, say it here.>

- **<item>** — `PERISHABLE`, measured <HH:MM>. Ids: `<PR#>` `<KEY>` `<sha>` `<deployment-id>` `<session-id>` `<terminal>`.
  Re-verify: `<the exact command>`. Then: <what to do with each outcome>.
  <Any branch the predecessor did not observe is labelled `predicted`.>

## 8 · Pending work, in priority order

**Decided by the owner:**

A. <what — exact next step — depends on>

**Awaiting an owner decision:**

B. <what — the options — what the session recommends>

## 9 · Conventions the owner cares about

- <standing preferences: decision presentation, what gets announced, language, register, memory protocol, delegation>
- When you reach ~<threshold> context: write `<predecessor-name>-handoff-NN+1` with this same shape and launch its session the same way this session launched you.
