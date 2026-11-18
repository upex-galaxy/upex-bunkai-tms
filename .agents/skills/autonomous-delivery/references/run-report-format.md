# Run report, handoff and log formats

> Owned by `autonomous-delivery`. Every artifact this skill writes, and what does not go into each.
> Companion: `agentic-dev-core/references/session-management.md` (the `progress.md` schema this extends).

There are four artifacts, each with its own job. Content in the wrong one is not a style problem: it is how information becomes unfindable. Every artifact is written whether or not anyone is watching, and none of them waits for a reply.

| Artifact | Scope | Lifetime | Job |
| --- | --- | --- | --- |
| `run-report.md` | one run | overwritten each run, archived with the session | what this run did, for a human catching up |
| `handoff.md` | one run, written continuously | archived with the session | what the NEXT run cannot get anywhere else |
| `escalation-log.md` | all runs, all modes | append-only, never archived (it sits beside the `<mode>/` directories, not inside the one Phase 4 archives) | every stop, every ruling, every discrepancy |
| `progress.md` | one run | append-only, archived | mechanical resume state |

---

## 1. `run-report.md`

Written in Phase 4. It is the only artifact a human is likely to read cold, so it leads with the outcome and never buries an unverified thing in a paragraph.

```markdown
# Autonomous delivery run — <mode> — <ISO-8601 UTC start> to <ISO-8601 UTC end>

## Outcome

<One sentence. "Shipped <KEY>." / "Bug run: 2 of 3 closed, 1 deferred." /
 "Empty run: nothing genuinely unblocked." / "Stopped on context at Phase 3 with a clean handoff.">

## Selection

- Candidates considered: <n>
- Selected: <KEY(s) or none>
- Dropped, with reasons:
  | Ticket | Reason dropped |
  | --- | --- |
  | ... | blocker not merged / already past dev / not ready (refinement trail) / scope-growth deferral / claimed by peer |

## Audit findings

<The Phase 1 merged-vs-claimed table, or a pointer to it, plus EVERY tracker/git discrepancy found.>

## Work completed

- Ticket / PR / merge commit / ancestor-verified: yes|no
- Verification: which checks ran, which were green, which were skipped and why

## Decisions made autonomously

<One line each, with a pointer to the escalation-log entry that holds the reasoning.
 If the answer is "none", say "none": an empty section reads as an omission.>

Decision log: <`.session/autonomous-delivery/<mode>/decisions.tsv`, N rows, or "none written" with the reason>

## Escalations raised

<Each with its category (product / novel security / irreversible / operator-reserved),
 what the human needs to decide, and the downstream cost of waiting.>

## Not verified by this run

<Explicit. Anything a scheduled run structurally could not check, named so the humans who
 CAN check it know exactly what to look at first. Never leave this implicit and never
 leave it empty when it is not.>

## Migrations

<Written / applied / gated-and-awaiting-approval. Target instance. Additive or destructive.
 "None" is a valid and common answer.>

## Next run should

<Concrete. The next candidate if one is obvious, or the blocker that must clear first.>
```

An empty-run report is not a shorter report. It carries the full Selection section, because "why was nothing available" is the most actionable thing an empty run produces.

The decision log is a TSV of one row per autonomous decision, with `ts`, `phase`, `decision`, `why`, `evidence` (a commit, PR number, path or screenshot, never a paragraph) and `result`. It complements the escalation log below and does not replace it: a decision that rules for later runs still goes in the escalation log. The log never blocks a run. If an append fails, say so in the Decision log field and carry on.

---

## 2. `escalation-log.md`

Shared across every mode and every run, and append-only. A resolution is a new entry that references the original by timestamp, and a correction to your own entry is appended, never edited in place. The decision protocol's step 1 searches this file, so an entry written badly here is an entry that does not exist.

There are two categories:

- `HARD-STOP`: the run ends here and a human decides later. The run does not wait for the answer.
- `LOG-AND-CONTINUE`: recorded, and the run keeps moving.

```markdown
## <ISO-8601 UTC> — <HARD-STOP | LOG-AND-CONTINUE> — <short title in the SHAPE of the question>

- Run: <mode> / <session identifier>
- What happened: <the facts, no interpretation>
- Why this category: <which escalate-only category, or why it is not one>
- Decision: <the decision as an instruction someone can follow>
- Rationale: <options considered, the axes, the weighting, why the loser lost>
- Scope and expiry: <which tickets, which run, how long it stands, whether a later run
  should re-derive rather than inherit it>
- Supersedes: <prior entry by date and heading, or "nothing">
- Downstream cost: <who or what is blocked by this stop, and whether it is actually the
  binding constraint (often it is not, and saying so is useful)>
```

Title the entry in the shape a later run would search for, not the wording you happened to use. "Which branch shape do I use" and "how do we execute a chain" are the same question and will not match the same search.

Log these here as well as in the run report: every Phase 1 discrepancy between tracker and git, every lock reclamation with the reclaimed lock's age, and every skipped candidate with its reason. The next run's Phase 1 reads this file to learn which sources have been lying.

---

## 3. `handoff.md`

Write it as you go: append at every phase boundary and after every completed slice. A run that exhausts its context cannot write up why, and every measured run in the source evidence retired on context instead of completing.

### What belongs in it

It has six sections. The last two are the hard ones to write and the ones that matter.

1. Tickets touched: one line each with key, what shipped, pull request and merge commit.
2. Traps that cost real time: the exact command, the exact symptom and what actually worked. Give the reproduction, not the lesson.
3. Conventions established that are written nowhere else, and for each, whether it has been promoted to a durable carrier yet.
4. Codebase knowledge that reading does not reveal: where the real source of truth lives, which helper is deceptively named, which two modules must change together, which "existing pattern" is really two competing patterns.
5. Work in flight: exact branch, exact tip SHA, which pull requests exist and their state, what is done and what is not, the next concrete command, and anything you were about to do that would be wrong to skip.
6. What you would do differently, direct and unhedged. This is the highest-value section and the one most likely to be skipped.

### What must NOT go in it

- Anything already durable elsewhere. Per-ticket status, claims and blockers live on the board, merges and their gate values in the merge record, every stop and ruling in the escalation log, architecture in decision records, and what the code does in the code and its tests. A handoff that restates what is recorded is noise, and noise makes the next run skim instead of read.
- The run's own rules. The next run reads the skill.
- Secrets or credential values. Variable names are fine, and values appear in no artifact.
- Speculation presented as fact. Mark unverified things as unverified.
- Apology or throat-clearing.

### Rescue before you write

This skill's own state already lives at `<<PRIMARY_ROOT>>/.session/autonomous-delivery/` (SKILL.md Phase 0a steps 1 and 5), so it has nothing of its own to rescue. A dispatched skill's worktree-local `.session/` does need rescuing (for example `/sprint-development`'s `.session/sprint-development/<KEY>/`). Copy it into `<<PRIMARY_ROOT>>` with `bun run worktree:audit <path> --rescue` before writing the handoff and before the worktree is removed. A handoff that is written well and then loses the underlying records is the failure this ordering prevents.

---

## 4. `progress.md`

This follows `agentic-dev-core/references/session-management.md` §7 unchanged: append-only, one block per phase entry, `started` then `completed`, `failed` or `skipped`. Unattended runs add two fields:

```
## Phase <N> — <Lock | Audit | Select | Execute | Close and report> — <ISO-8601 UTC>
- status: started | completed | failed | skipped
- dispatched_as: Single | Sequential | Parallel | Background | inline
- subagent_report: <short summary, or a pointer>
- artifacts_touched: [path, path, ...]
- next: <phase name | stop>
- notes: <one line>
- budget_remaining_pct: <estimate at this boundary>          # unattended addition
- unpushed_work: none | <branch>@<sha>                        # unattended addition
```

`unpushed_work` is the field the clean-stop sequence exists to keep at `none`. If a run dies and its last entry names unpushed work, the next run reads that as a sign something may be unrecoverable, and it escalates instead of silently redoing the work.

`## Cross-references` cites the canonical plan owned by the dispatched skill, the board row and the escalation log. Those three pointers replace the plan file this skill does not write.

---

## 5. Reporting to a channel

`report_channel` accepts three shapes:

| Value | Behaviour |
| --- | --- |
| `null` (default) | The file is the report. Post nowhere. |
| `tracker:<ISSUE-KEY>` | Post the run report's Outcome, Escalations, and Not-verified sections as a comment via `[ISSUE_TRACKER_TOOL]`. |
| `file:<path>` | Append the run report to that path. |

Post only to a configured destination, and never post a report that contains a credential value, a session token or a file path outside the repository. If the channel post fails, that is a `LOG-AND-CONTINUE` and the file is still the report.

Carry forward everything the run could not verify. Where a run structurally could not check something (a live-observation path, a second-observer behaviour, a cross-scope isolation check that needs two accounts), name the exact unobserved behaviour in the QA handoff and skip the general disclaimer. Nothing should evaporate silently.
