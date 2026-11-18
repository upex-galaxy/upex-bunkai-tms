# Audit and selection: what is real, then what is genuinely unblocked

> Owned by `autonomous-delivery`. Phase 1 is §1 to §4, Phase 2 is §5 to §8.
> Companions: `./hazard-catalogue.md` (why each check exists) and `./run-report-format.md` (where the output goes).

Nothing here waits for a person. Where a candidate cannot be taken, the run skips or defers it, logs the reason and moves on; the rulings that remain are `agentic-dev-core/references/decision-protocol.md`'s.

Read the integration branch from `.agents/project.yaml` at `git_strategy.branches.integration` (the production branch when that is null) and substitute it for `<integration-branch>` below. Never assume a name.

---

## 1. The invariant

Git is the source of truth. The tracker is a hint. A coordination file is a claim.

From most to least trustworthy:

```
  git ancestry against the integration branch     decides
        |
  open pull requests + branch state on the remote explains
        |
  live tracker status                             hints
        |
  queue / board / claim file                      claims
        |
  roadmap and design prose                        edges only, never status
```

When two sources disagree, the higher one wins and the disagreement is recorded. A run that quietly reconciles contradictory evidence destroys the only signal that one of its sources is systematically wrong.

---

## 2. Fetch first, always

```bash
git fetch origin
```

Run it immediately before every ancestry check and every fast-forward check, including when you fetched a few minutes ago.

A merge made through the code host's API moves the real ref at once, but your remote-tracking ref moves only on the next fetch. Without the fetch, a fast-forward check reports up-to-date while you are two commits behind, and the working tree shows pre-merge content. That reads as "the fix isn't there" and sends the run chasing a bug that was fixed an hour ago.

---

## 3. The ancestry check

This is the command the run uses most.

```bash
# Did this merge commit actually land on the integration branch?
git merge-base --is-ancestor <merge-commit> origin/<integration-branch>   # exit 0 == yes

# Did this branch's work actually land?
git merge-base --is-ancestor origin/feature/<branch> origin/<integration-branch>

# Does this file actually exist at that ref? (empty output == it does not)
git show origin/<integration-branch>:<path>

# How far has the base moved since my branch diverged?
git log --oneline <mybranch>..origin/<integration-branch> | wc -l

# What is on the branch that is not on the base?
git log --oneline origin/<integration-branch>..origin/<branch>
```

Run it on every contributing merge commit of a dependency. A ticket delivered as a chain has several, and the tracker transitioned on the first one.

### Two traps inside the check

Self-ancestry. `--is-ancestor` counts a commit as its own ancestor, so a staleness probe of the form `is-ancestor HEAD origin/<branch>` gives the same answer for "behind" and for "exactly current". Tell them apart before concluding anything:

```bash
git rev-parse HEAD origin/<integration-branch>   # identical hashes == current, not stale
```

A scary diff-stat. A diff suddenly full of deletions almost always means the base moved under the branch. Count the drift, merge the base in, then re-read the diff. Reverting anything before that is premature.

---

## 4. The four parallel evidence sources

Dispatch one subagent per source. A single agent reconciles the contradiction into one tidy narrative, and Phase 2 needs to see the contradiction.

### 4a. Git ancestry

The commands in §3, for every candidate and for every blocker the candidate declares.

### 4b. Open pull requests and branch state

```bash
gh pr list --state open
gh pr view <n> --json state,mergedAt,mergeCommit
gh pr view <n> --json state,mergeStateStatus
gh pr checks <n>
git branch -r --no-merged origin/<integration-branch>
```

This source shows two things ancestry cannot: whether work exists but is waiting, and whether a pull request's CI status was computed against the head that would actually merge. A stacked pull request's diff shrinks once its base lands. Verify the shrink against the refreshed base instead of assuming it. A check that ran before the shrink stays valid, because the head SHA does not change when the diff shrinks.

The same evidence class includes the identity check, which otherwise surfaces too late:

```bash
gh auth status                       # a wrong cached identity reads fine and fails only at first push
```

### 4c. Live tracker status

Query the candidate and its direct blockers in one call through `[ISSUE_TRACKER_TOOL]`. Read status, assignee and changelog. The changelog tells you who moved the ticket and whether a comment trail justified the move, which matters because a ticket can reach ready-for-dev with a declared blocker still open and no explanation.

Pull the ticket's full comment trail as well. Refinement answers, product decisions and earlier rulings live only there, and §6 depends on reading it.

### 4d. Queue / board / claim file

Read the whole file, not your own row. A cross-run coordination flag often lands on someone else's row and is found only by whoever reads everything. Two runs that each create the same scaffolding guarantee a conflict for whichever chain merges second, and neither branch is based on the other.

A correction to a stale claim can be wrong too. One recorded correction said a peer's work was merged to the integration target when it had only been merged into that ticket's own chain branch. Verify a correction as hard as the claim it corrects, against live refs.

### 4e. Also collected in this phase

- The live migration ledger, through `[DB_TOOL]` (`list_migrations`). It can be ahead of your branch (a peer applied out of band) and can hold a migration that exists in no file you can list. When the app keeps migration files (`{{stack.database.migrations_dir}}` is non-null), cross-check against `git log origin/<integration-branch> -- <migrations-dir>/` and sibling branches. When it does not (`migrations_tool: supabase-mcp`), the ledger is the only record and the PR bodies name what each one applied.
- Branch protection as enforced, from both the classic branch-protection endpoint and the rulesets endpoint. The classic one returns a not-protected 404 when protection is a ruleset, so checking it alone reads as unprotected. Record the enforced fields: required approving reviews, required review-thread resolution, code-owner review, and allowed merge methods (a repo may forbid squash and rebase entirely).

### Phase 1 output

```
| Ticket | Tracker says | Merge commit | Ancestor of integration? | Open PR | Branch state | Verdict |
```

`Verdict` is one of merged, claimed-only, in-flight or not-started, and it comes from ancestry, never from the tracker column. Write every row where the tracker column and the verdict disagree to the escalation log as a discrepancy, with the evidence, so the next run knows how this tracker lies.

---

## 5. Selection inputs and their authority

| Input | Authoritative for | Never authoritative for |
| --- | --- | --- |
| `.context/dev-roadmap.md` | dependency edges, mockup gates, execution ordering | current status of anything |
| Live tracker query | live status, assignee, changelog | whether work merged |
| Phase 1 verdict column | whether work merged | what should be built |
| Queue / board / claim file | who owns which row at read time | whether a dependency shipped |

A recent timestamp on the roadmap says nothing about any ticket's live status. It records when edges and gates were refreshed, which is a different axis.

---

## 6. Readiness is not status

Before accepting a candidate, read its refinement trail. These signals mean not ready, whatever the status field says:

- An unresolved refinement question explicitly marked as blocking.
- A long unresolved list (product questions, engineering questions, unchecked edge cases) with no resolution trail. One ticket read as ready with twenty-one open items.
- "Answers" that are role-played, disclaimed as practice drafts, or carry confirmation flags nobody cleared. They are not resolutions, so treat the questions as open.
- A status transition with no comment trail explaining what changed.
- A ratified answer that contradicts a more recent, more authoritative design artifact. The design artifact outranks the older answer, so check it first and the question set already accounts for what the design shows.

Not ready means skip with a logged reason. It is not an escalation: escalating every under-refined ticket turns a delivery run into a question-generation run.

---

## 7. Scope-growth check

Auto-claiming by "pull the next available row" once put a run onto a ticket that grew an architecture decision record, a design divergence and a three-slice chain, with no moment where anyone paused to notice.

Defer the candidate to a session with a person present, and log the deferral, when it shows any of these:

- A user-interface story with no mockup where the design plan expects one.
- Acceptance criteria that imply an architectural decision not already recorded.
- More than one migration, or any migration touching an existing live object.
- A new authorization, tenancy, session or identity path.
- A dependency edge the roadmap does not have, discovered during selection.

`{{jira.ai_effort}}` `High` is not one of these signals. It is a size note for the plan and the PR description (the story may be large and may be split into stacked small PRs), read at selection and never a reason to skip, defer or escalate the story. An unset AI Effort is noted the same way.

Deferring is cheap. Discovering the growth three thousand lines in, with the budget gone, is not.

---

## 8. Claim protocol

This is optimistic locking on a shared file. Steps 4 and 5 are the ones that get skipped and the ones that matter.

1. Read the board fresh. A cached copy more than a few minutes old is not evidence.
2. Pick the highest-priority row that is ready and unclaimed.
3. Write your identifier into the claim column, set the row's status to claimed and save.
4. Re-read the file. Two runs can write inside the same window.
5. If a different identifier is now there, back off and take the next candidate. Do not contest the row, overwrite someone else's claim or edit another run's row.
6. Keep the row current enough that a stranger could resume from it cold: exact branch, exact tip SHA, which pull requests exist and their state, and the next concrete command. The board row is the real cross-run resume artifact. A per-session progress file is machine-local (this skill's lives at `<<PRIMARY_ROOT>>`), and a dispatched skill's worktree-local one dies with its worktree unless rescued.
7. A gated row is not claimable until you verify the gate live and flip it yourself, citing what you checked. Cite the merge commit and the ancestry result, not the tracker status that made it look open.

Record adjudications and decisions in both places the gate reads, the board row and the pull request body. An adjudication recorded in only one has produced a false block against work that was fine.
