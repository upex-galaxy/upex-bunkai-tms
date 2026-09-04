# Audit and Selection — establishing what is real, then picking what is genuinely unblocked

> Owned by `autonomous-delivery`. Phase 1 (§1-§4) and Phase 2 (§5-§8).
> Companion: `./hazard-catalogue.md` (why each check exists), `./run-report-format.md` (where the output goes).

Substitute the project's integration branch for `<integration-branch>` throughout — read it from
`.agents/project.yaml` -> `git_strategy.branches.integration`, never assume a name.

---

## 1. The invariant

**Git is the source of truth. The tracker is a hint. A coordination file is a claim.**

Ranked by trustworthiness, most trustworthy first:

```
  git ancestry against the integration branch     <- decides
        |
  open pull requests + branch state on the remote <- explains
        |
  live tracker status                             <- hints
        |
  queue / board / claim file                      <- claims
        |
  roadmap and design prose                        <- edges only, never status
```

When two disagree, the higher one wins and the disagreement is **recorded**, not smoothed over. A run
that quietly reconciles contradictory evidence has destroyed the only signal that one of its sources
is systematically wrong.

---

## 2. Fetch first, always

```bash
git fetch origin
```

Unconditionally, immediately before every ancestry check and every fast-forward check, with no
exceptions for "I fetched a few minutes ago."

A merge performed through the code host's API updates the real ref instantly; your remote-tracking ref
updates only on the next fetch. Without the fetch, a fast-forward check reports already-up-to-date
while genuinely two commits behind, and the working tree briefly shows pre-merge content — which reads
as "the fix isn't there" and sends the run chasing a bug that was fixed an hour ago.

---

## 3. The ancestry check — the run's single most-used command

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

Run it on **every** contributing merge commit of a dependency. A ticket delivered as a chain has several,
and the tracker transitioned on the first one.

### Two traps inside the check itself

**Self-ancestry.** `--is-ancestor` treats a commit as its own ancestor, so a staleness probe of the form
`is-ancestor HEAD origin/<branch>` reports the same result for "behind" and "exactly current". Disambiguate
before concluding anything:

```bash
git rev-parse HEAD origin/<integration-branch>   # identical hashes == current, not stale
```

**A scary diff-stat is usually a moved base, not broken work.** A diff suddenly full of deletions almost
always means the base moved underneath the branch. Count the drift, merge the base in, then re-read the
diff — do not start reverting anything.

---

## 4. The four parallel evidence sources

Dispatch one subagent per source. Do not collapse them: a single agent reconciles the contradiction into
one tidy narrative and the contradiction is exactly what Phase 2 needs to see.

### 4a. Git ancestry

The commands in §3, for every candidate and every candidate's declared blockers.

### 4b. Open pull requests and branch state

```bash
gh pr list --state open
gh pr view <n> --json state,mergedAt,mergeCommit
gh pr view <n> --json state,mergeStateStatus
gh pr checks <n>
git branch -r --no-merged origin/<integration-branch>
```

Two things this source establishes that ancestry alone cannot: whether work exists but is waiting, and
whether a pull request's continuous-integration status was computed against the head that would actually
merge. A stacked pull request's diff shrinks automatically once its base lands — verify the shrink against
the refreshed base rather than assuming it, though a check that ran before the shrink stays valid because
the head SHA does not change when the diff shrinks.

Also here, because it belongs to the same evidence class and gets discovered too late otherwise:

```bash
gh auth status                       # wrong cached identity reads fine and fails only at first push
```

### 4c. Live tracker status

Query the candidate and its direct blockers in **one** call via `[ISSUE_TRACKER_TOOL]`. Read status,
assignee, and the changelog. The changelog answers who moved the ticket and whether any comment trail
justified the move — which matters because a ticket can reach ready-for-dev with a declared blocker still
open and no explanation.

Also pull the ticket's full comment trail. It is the only place refinement answers, product decisions, and
prior rulings live, and §6 depends on reading it.

### 4d. Queue / board / claim file

**Read the whole file, not your own row.** A cross-run coordination flag routinely lands on someone else's
row and is found only by whoever reads the entire file. Two runs each creating the same scaffolding is a
guaranteed conflict for whichever chain merges second, and neither branch is based on the other.

A *correction* to a stale claim can itself be wrong — one recorded correction asserted that a peer's work
was merged to the integration target when it had only been merged into that ticket's own chain branch.
Verify a correction exactly as hard as the claim it corrects, against live refs.

### 4e. Also collected in this phase

- **The live migration ledger**, via `[DB_TOOL]`. It can be ahead of your branch (a peer applied out of
  band) and it can contain a migration that exists in no file you can list. Cross-check against
  `git log origin/<integration-branch> -- <migrations-dir>/` and sibling branches.
- **Branch-protection reality**, from BOTH the classic branch-protection endpoint AND the rulesets
  endpoint. The classic one returns a not-protected 404 when protection is implemented as a ruleset, which
  reads as unprotected if it is all you check. Record the enforced fields: required approving reviews,
  required review-thread resolution, code-owner review, and allowed merge methods (a repo may forbid
  squash and rebase entirely).

### Phase 1 output

```
| Ticket | Tracker says | Merge commit | Ancestor of integration? | Open PR | Branch state | Verdict |
```

`Verdict` is one of **merged** / claimed-only / in-flight / not-started, and it is derived from ancestry,
never from the tracker column. Every row where the tracker column and the verdict disagree is written to
the escalation log as a discrepancy, with the evidence, so the next run knows this tracker lies in this
particular way.

---

## 5. Selection inputs and their authority

| Input | Authoritative for | Never authoritative for |
| --- | --- | --- |
| `.context/dev-roadmap.md` | dependency edges, mockup gates, execution ordering | current status of anything |
| Live tracker query | status right now, assignee, changelog | whether work merged |
| Phase 1 verdict column | whether work merged | what should be built |
| Queue / board / claim file | who owns which row right now | whether a dependency shipped |

**A recent timestamp on the roadmap is not evidence about any ticket's status today.** The file tracks when
edges and gates were refreshed, which is a different axis entirely.

---

## 6. Readiness is not status

Before accepting a candidate, read its refinement trail. Signals that mean **not ready**, whatever the
status field says:

- An unresolved refinement question explicitly marked as blocking.
- A long unresolved list — product questions, engineering questions, unchecked edge cases — with no
  resolution trail. Observed at twenty-one open items on a ticket reading as ready.
- "Answers" that are role-played, explicitly disclaimed as practice drafts, or carry confirmation flags
  that were never cleared. These are not resolutions; treat them as genuinely open.
- A status transition with no comment trail explaining what changed.
- A ratified answer that contradicts a more recent, more authoritative design artifact. The design artifact
  outranks the older answer — check it FIRST so a question set already accounts for what the design shows.

Not-ready is a **skip with a logged reason**, not an escalation. Escalating every under-refined ticket
converts a delivery run into a question-generation run.

---

## 7. Scope-growth check

Auto-claiming by "pull the next available row" put one run onto a ticket that grew an architecture decision
record, a design divergence, and a three-slice chain, with no moment where anyone paused to notice.

Defer to a human-present session, and log it as such, when a candidate shows any of:

- A high point estimate relative to the batch's median.
- A user-interface story with no mockup where the design plan expects one.
- Acceptance criteria that imply an architectural decision not already recorded.
- More than one migration, or any migration touching an existing live object.
- A new authorization, tenancy, session, or identity path.
- A dependency edge the roadmap does not have, discovered during selection.

Deferring is cheap. Discovering it three thousand lines in, with the budget gone, is not.

---

## 8. Claim protocol

Optimistic locking on a shared file. Steps 4 and 5 are the ones that get skipped and the ones that matter.

1. **Read the board fresh.** A cached copy more than a few minutes old is not evidence.
2. **Pick** the highest-priority row that is ready and unclaimed.
3. **Write** your identifier into the claim column, set the row's status to claimed, save.
4. **Re-read the file.** Two runs can write inside the same window.
5. **If a different identifier is now there, back off** and take the next candidate. Never contest a row,
   never overwrite someone else's claim, never edit another run's row.
6. **Keep the row current enough that a stranger could resume from it cold**: exact branch, exact tip SHA,
   which pull requests exist and their state, and the next concrete command. The board row is the real
   cross-run resume artifact; a per-session progress file dies with its worktree.
7. **A gated row is not claimable until you verify the gate LIVE and flip it yourself, citing what you
   checked.** Cite the merge commit and the ancestry result, not the tracker status that made it look open.

Record adjudications and decisions in **both** places the gate reads — the board row and the pull request
body. An adjudication recorded in only one has produced a false block against work that was fine.
