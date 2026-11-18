# Git worktrees: isolated parallel work

A worktree is a second working directory wired to the same `.git`. Git normally gives you one working tree. With worktrees you get several, each with its own checked-out branch, its own files and its own index, and all of them share one object database (commits, blobs, refs).

```
~/proj/                       <- primary worktree   (branch A, e.g. feature-in-progress)
   .git/  <------ one shared object store ------+
   src/ ...                                     |
                                                |
~/proj-hotfix/                <- linked worktree (branch B, e.g. hotfix)   ---+
   src/ ...                                                                    |
                                                                              -+
```

Committing in one worktree never touches another worktree's files. Git allows a branch in only one worktree at a time, which is what makes worktrees safe for parallel sessions, including several AI agents working locally at once.

---

## When to use a worktree

- Parallel AI sessions: two agents, or an agent and a human, work the repo at once, each on its own branch and without touching each other's files.
- Risky or unrelated work in progress: you have uncommitted work on branch A and want to build something unrelated on branch B without polluting A's tree or risking an accidental `git add` that mixes the two.
- A hotfix while a feature is open: patch `main` in a clean tree without stashing or disturbing the half-done feature.
- Reviewing a PR branch: check out someone's branch in a separate tree and keep your own undisturbed.

A simple branch switch on a clean tree needs only `git switch` or `git checkout -b`. One short linear task needs only a normal branch, because a worktree is overhead there.

---

## The lifecycle in this repo

The lifecycle is the same for every host and every creation path (plain `git worktree add`, Orca, a harness tool, a Codex-managed worktree). Three repo steps wrap the worktree:

```
create  ──→  bun run worktree:provision  ──→  work  ──→  bun run worktree:audit <wt> --rescue  ──→  remove
```

- Provision before working. A fresh worktree holds only tracked files. `bun run worktree:provision` (no argument means the cwd) copies the gitignored inputs it cannot rebuild from the primary checkout (`.env`, `.vercel/`, local settings), installs dependencies and creates the `.claude/skills` alias. The list lives in code, as `PROVISION_COPIES` in `cli/lib/worktree.ts`, and not in prose. It installs with bun only. An app on pnpm, npm or yarn (`stack.package_manager`, else its lockfiles) is refused with the reason before anything is copied (`provisionPackageManager`, same file), because `bun install` would write a second lockfile.
- `.session/` is never copied. Durable gitignored state (plans, progress, locks, run reports) lives at `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots") and is cited by absolute path from inside the worktree. A copy diverges silently and dies with the worktree.
- Audit before removing. `bun run worktree:audit <wt>` is read-only and exits 1 while state lives only in the worktree. `--rescue` copies that state to the primary and never overwrites.
- Orca runs both steps for you. The committed `orca.yaml` runs `worktree:provision` as the setup hook and `worktree:audit --rescue` as the archive hook. Supervised fleets, where a conductor launches workers into worktrees, belong to `/agent-orchestration` (this repo's half: `agentic-dev-core/references/fleet-provisioning.md`) and not to this skill.

---

## Approach A: manual git (portable, works with any tool or agent)

Plain git behaves the same in any terminal, editor or coding agent.

```bash
# inspect
git worktree list                                   # show every worktree + its branch

# create: new directory + NEW branch, based on a ref
git worktree add ../proj-feature -b feat/x main     # branch feat/x from main, in ../proj-feature
git worktree add ../proj-hotfix hotfix/y            # check out an EXISTING branch hotfix/y
bun run worktree:provision ../proj-feature          # repo step: gitignored inputs + deps + skills alias

# work: both directories live simultaneously
cd ../proj-feature
#   ...edit / commit normally...
git add -p && git commit -m "feat: x"
git push -u origin feat/x
cd ../proj                                          # hop back to the primary tree any time

# clean up after the branch is merged
bun run worktree:audit ../proj-feature --rescue     # repo step: rescue gitignored state to the primary
git worktree remove ../proj-feature                 # delete the dir (refuses if uncommitted; --force overrides)
git branch -d feat/x                                # delete the branch once merged
git worktree prune                                  # drop stale registrations (if a dir was rm'd by hand)

# extras
git worktree lock ../proj-feature "reason"          # protect from prune (e.g. dir on external/removable disk)
git worktree unlock ../proj-feature
git worktree move ../proj-feature ../proj-feature2  # relocate a worktree
```

Golden rules:

- Git blocks the same branch in two worktrees, so give every worktree its own branch.
- `git worktree remove` refuses when there are uncommitted changes. Commit first, because `--force` discards them.
- Deleting a worktree directory with `rm -rf` leaves a stale registration, so run `git worktree prune` afterward.
- A worktree's `HEAD`, index and stash-versus-tree state are independent. The stash list and config are shared (see Multi-session safety).

---

## Approach B: a harness's own worktree tool (harness path only)

This approach is specific to a harness and is never the repo canon. Some hosts create the worktree and move the session into it for you: Claude Code (`EnterWorktree` and `ExitWorktree`, `claude --worktree`) and Codex (its managed worktrees). OpenCode has no equivalent, so use Approach A there. Whatever the host, the repo lifecycle above still applies. Run `bun run worktree:provision` right after entering, and `bun run worktree:audit <wt> --rescue` before the tool removes the worktree. The Claude Code tools are described below because their limits bite.

`EnterWorktree` creates a worktree under `.claude/worktrees/<name>/` on a new branch and switches the session's working directory into it.

- The `worktree.baseRef` setting picks the base ref:
  - `fresh` (default) branches from `origin/<default-branch>`, clean and independent of local WIP.
  - `head` branches from your current local `HEAD` and carries your current branch's commits.
- Params: `name` creates a new worktree, and `path` enters an existing one already made with `git worktree add`.

`ExitWorktree` returns the session to the original directory.

- `action: "keep"` leaves the worktree and branch on disk, to come back later or to preserve work.
- `action: "remove"` deletes the worktree directory and its branch. With uncommitted files or unmerged commits it refuses unless `discard_changes: true`.
- It only operates on worktrees this session created through `EnterWorktree`, and it does not touch one you made by hand (`git worktree add`).
- `remove` deletes gitignored state along with the directory, so audit first.

Subagents: the `Agent` tool (and workflow agents) accept `isolation: "worktree"`, which runs each subagent in its own temporary, auto-cleaned worktree. Use it when parallel subagents mutate files and would otherwise collide, and not to isolate a whole session.

### Manual vs harness at a glance

| | `git worktree` (manual) | `EnterWorktree` (Claude Code) |
| --- | --- | --- |
| Portability | any tool / agent / host | Claude Code only |
| Directory location | anywhere you choose (`../dir`) | fixed under `.claude/worktrees/` |
| Base ref | whatever you pass | setting: `fresh`=origin/default or `head` |
| Moves the agent's session | no (you `cd`) | yes, automatically |
| Repo steps | `worktree:provision` after add, `worktree:audit --rescue` before remove | the same two, around the tool |
| Cleanup | manual (`remove`/`prune`) | `ExitWorktree remove` |
| Branch naming | you choose | derived from the name (rename with `git branch -m`) |

---

## The untracked-files gotcha (applies to both approaches)

A brand-new worktree starts with only the tracked files of its base ref. Files that are untracked in your current tree (new, never `git add`ed) live physically in the current directory, and they do not teleport into the new worktree.

To bring untracked WIP into a fresh worktree, move it:

```bash
mv ./cli/new-feature  ../proj-feature/cli/new-feature   # untracked files: just move them
# or: commit them on a branch first, then create the worktree from that branch
```

Take care not to move a tracked path by accident. If you `mv` a directory that contains tracked files, git sees them as deleted in the source tree. Restore them with:

```bash
git checkout -- path/to/tracked-file        # bring a tracked file back into the source tree
```

---

## Multi-session safety (no collisions between parallel agents)

Rule of thumb: one session, one worktree, one branch.

| Shared across worktrees (safe) | Isolated per worktree |
| --- | --- |
| `.git/objects` (commits/blobs, append-only, no overwrite) | working directory (files) |
| refs, config, hooks, stash list | index / staging area |
| | checked-out branch (duplicate checkout blocked by git) |

- Two sessions never edit the same physical file or the same branch, so they cannot clobber each other's work.
- The stash is global to the repo. Do not hand work between sessions through `git stash`. Commit it to your branch instead.
- Git isolation covers files and branches, and it does not cover network ports, temp files or databases. If both sessions run a local server or dev process, give each a distinct port (or rely on port auto-fallback).
- A worktree nested inside the repo (for example Claude Code's `.claude/worktrees/`) may show up as untracked in the parent repo. Hide it locally, without a tracked commit, by adding the path to the shared exclude file:

  ```bash
  echo '.claude/worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"
  ```

  `info/exclude` lives in the shared git-common dir (one copy for all worktrees) and is never committed, so it cannot leak into another branch's history.

### Provenance: which session owns a worktree

The record is the commit itself, and no side file holds it. Every agent commit ends with the forensic trailers `Worktree: <name|primary>` and `Session: <label>` (SKILL.md §3.2, Critical Rule #3), copied from the `AGENT IDENTITY:` line the prompt hook injects. For an orphaned worktree or branch, `git log <branch> --format=%B | grep -E '^(Worktree|Session):'` names the worktree and the session that wrote it. Under orchestration, the Orca run (`/agent-orchestration`) also records which worker held which worktree. Two rules follow:

- A stale worktree is a diagnostic. Report it and let a person decide, and do not repair it automatically. Another session's worktree is not yours to delete: `ExitWorktree` only touches worktrees its own session created, and the same discipline applies to a manual `git worktree remove`.
- A worktree with no commits has no trailer to read. That is the case `worktree:audit` exists for, so run it before deciding anything.

---

## Cleanup checklist

- [ ] The branch's work is committed and pushed (or deliberately discarded).
- [ ] `bun run worktree:audit <path> --rescue` exits 0 (no state left only in the worktree).
- [ ] `git worktree remove <path>` (or `ExitWorktree remove`) succeeds, which it does only when the tree is clean.
- [ ] `git branch -d <branch>` once the branch is merged.
- [ ] `git worktree prune` if any directory was removed by hand.
- [ ] Local `info/exclude` entries are cleaned up if the worktree path is gone for good.

---

## Decision guide

| Situation | Do this |
| --- | --- |
| Clean tree, one linear task | Just a branch (`git switch -c`), no worktree |
| Risky WIP on the current branch, need to build something unrelated | Worktree on a new branch |
| Two AI sessions in parallel | One worktree and one branch each |
| Any host, portable script | `git worktree add … -b …` + `bun run worktree:provision` (Approach A) |
| A conductor launching supervised workers | `/agent-orchestration` (the conductor creates the worktree; `orca.yaml` provisions and audits) |
| Claude Code, want the session moved for you | `EnterWorktree` (base `fresh`), then `bun run worktree:provision` (Approach B) |
| Parallel subagents mutating files | `Agent`/workflow `isolation: "worktree"` |

---

## AI working pattern (this repo)

When an AI session needs isolation from in-progress work on another branch:

1. Create the worktree on a new branch off the strategy's base. Use Approach A on any host, or the host's own tool where it has one (Approach B). Rename the branch to convention (`git branch -m feat/<slug>`) when the tool derived it.
2. Run `bun run worktree:provision` inside it before anything else.
3. Move any untracked WIP into the worktree, since it will not be there automatically. Do not copy `.session/`: cite `<<PRIMARY_ROOT>>/.session/...` by absolute path.
4. Keep the primary repo's `git status` clean, and verify it with `git -C <primary> status`.
5. Hide a worktree nested inside the repo from the primary tree through the local `info/exclude`.
6. Do all further work (edits, verifies, commits with the forensic trailers) in the worktree.
7. On completion, commit on the worktree's branch, open its own PR, run `bun run worktree:audit <wt> --rescue`, and remove the worktree (`git worktree remove`, or the harness tool's own remove).

## With nobody at the keyboard

Worktree work has no person gate of its own, so the steps above run unchanged in a worker or a routine. Two points still need care. A conductor that launches workers owns worktree creation (`/agent-orchestration`, `agentic-dev-core/references/fleet-provisioning.md`), so a worker does not create or remove worktrees it was not given. Removing a worktree whose audit still exits 1 is irreversible, so without a person or a brief that says otherwise, stop at the audit, run `--rescue`, and report.
