# Decision Protocol — decide the technical call, escalate the rest

> Cited by: workflow skills' `## Compact Rules`. Pairs with `./orchestration-doctrine.md` (who executes
> what) and `./dispatch-patterns.md` (how to fan work out). This file governs **who decides**, not who
> runs the work.

**Default posture: a technical decision is the agent's to make.** Stopping to ask is the exception, and
it is reserved for four categories named in §5. An agent that escalates a technical call it was equipped
to settle has not been careful — it has moved its own work onto the human's queue and stalled everything
downstream of it.

But autonomy is not the same as improvisation. Deciding well means deciding **in the order below**, and
the order is the entire point of this file.

---

## 1. The order

```
  1. SEARCH THE RECORD  ──settled?──> 2. FOLLOW IT (done)
         │
         │ not settled
         ▼
  3. Is it product / security / irreversible / reserved?
         │                              │
         │ no                           │ yes
         ▼                              ▼
  4. SCORED JUDGE PANEL           5. ESCALATE
         │                              │
         ▼                              ▼
     6. WRITE IT DOWN  <───────────────┘
```

Reversing steps 1 and 4 is the failure this protocol exists to prevent. A scoring panel run as the FIRST
step reasons well from scratch and produces a confident, well-argued answer that **overwrites a decision
the project already made**. Good reasoning applied to a settled question is not a second opinion; it is a
second, contradictory rule, with nothing marking which one governs.

---

## 2. Step 1 — search the record first

Before deciding anything, before dispatching anything, and before drafting a question for the human,
establish whether the question is already answered. Search, in this order:

1. **The run's escalation / decision log**, if the workflow keeps one. Read it in full, not a skim at
   session start. Prior rulings accumulate; the one that governs you may have been written an hour ago
   by a peer session you never saw.
2. **Architecture Decision Records.** A settled invariant lives here precisely so it is not re-derived.
3. **The work queue / board and the ticket itself** — plus its siblings and its parent. A ruling made on
   a sibling ticket routinely governs yours, because the thing being decided is usually a property of the
   batch, not of the ticket.
4. **Tracker comments and handoff notes** on the ticket and its blockers.
5. **The skill's own reference tree** for the stage you are in.

Search for the shape of the question, not its wording. "Which branch shape do I use" and "how do we
execute a chain" are the same question and will not match the same grep.

**A prior decision found here outranks your own fresh reasoning about the same question**, including
reasoning you have not done yet. This is not deference to authority; it is that a project with two
well-argued contradictory answers to one question is worse off than a project with one adequate answer.

---

## 3. Step 2 — if settled, follow it

Apply the decision. Do not re-derive it, do not "sanity-check" it by re-running the analysis, and do not
ask anyone to reconfirm it. Cite it in your plan or report so the next reader sees the same chain.

**Asking a fresh question about a settled matter is itself the defect**, even when you ask a human. A
human asked cold, without being shown the existing ruling, answers from the same blank slate you would
have — and their answer carries more apparent authority while resting on less context. A reply obtained
that way is an uninformed re-ask, not an informed override, and it does not supersede anything.

If you believe the settled decision is genuinely wrong, that is a **supersession**, and it is explicit:

- Name the prior decision by its date and heading.
- State what changed or what the original missed — new evidence, not a fresh preference.
- Get it decided under §4 or §5 as appropriate to its category.
- Record the supersession in the same artifact as the original, referencing it. Append; never rewrite or
  delete the prior entry. The history of a reversal is as load-bearing as the reversal.

A silent second answer is not a supersession. It is a contradiction.

---

## 4. Step 3 — if genuinely novel and technical, decide it yourself

Unsettled, and not in §5? Decide it. For a call that is close, consequential, or hard to reverse, run a
**scored judge panel** rather than picking on instinct.

**Shape.** Dispatch independent subagents in **Parallel** per `./dispatch-patterns.md` gate 3, each with
the standard 6-component briefing. Give every panelist the same options and the same evidence, and a
**different lens**. Panelists do not confer, do not see each other's output, and do not choose — they
score and justify. You adjudicate. This preserves `dispatch-patterns.md`'s "don't delegate planning": the
panel supplies evaluations, the deciding agent supplies the decision.

**Panel size: 3 to 5.** Below 3 there is no spread to read. Above 5 the lenses start overlapping and you
pay fan-out cost for correlated answers. Use 3 for a decision that is reversible within the current
stage, 5 when it sets a precedent others will follow.

**Lens selection — pick from the axes the decision actually loads**, not a fixed list. Useful ones:

| Lens | Asks |
| --- | --- |
| Purpose fidelity | Does the option serve the reason the rule/gate exists, or only its letter? |
| Failure resilience | What survives if this session dies mid-way, the step is retried, or it lands half-done? |
| Blast radius | What breaks if this is wrong, and how far does the damage reach? |
| Reversibility | What does undoing this cost tomorrow, next week, after it has dependents? |
| Precedent load | What is everyone downstream now obliged to do, having seen this? |
| Track record | What has this project actually observed with each option? Weight lightest — it reflects sample size more than merit. |

Choose the 3 to 5 that bear on THIS decision. A lens that returns the same score for every option is
telling you it does not apply; drop it rather than pad the panel.

**Scoring.** Each panelist scores every option on its axis (a fixed scale, e.g. /10) with a one-paragraph
justification per score. Highest total wins. Two caveats that matter more than the arithmetic:

- **State the weighting before you read the scores**, and say which axes dominate and why. An unweighted
  sum silently treats "reversibility" and "track record" as equally important.
- **A near-tie is a real result.** If the top two land within noise, say so and pick on the dominant axis
  rather than manufacturing a decisive-looking margin. Record it as close, so a later supersession knows
  it is pushing on a weak decision rather than a strong one.

Then **record the decision and its scoring rationale** per §6 — including the axes, the weighting, and
the losing option. The next agent needs to know what was already considered and rejected, or they will
re-derive it and land somewhere else.

---

## 5. Step 4 — escalate ONLY these

Four categories, and they are exhaustive. Everything outside them is yours.

1. **Product and business decisions.** What to build, what a feature should do, which behaviour is
   correct for the user, scope changes, priority calls. **Product ambiguity in a requirement or an
   acceptance criterion stops** — an AI-improvised answer to "what should this do" is a guess wearing a
   decision's clothes. *Technical* ambiguity about how to build an agreed behaviour is §4 work, not this.
2. **Security-relevant judgment calls not already covered by an existing rule.** Applying an established,
   ratified security pattern to new code is implementation, not a decision — do it. Deciding a *new*
   security posture, or accepting a risk nobody has accepted before, escalates.
3. **Irreversible or destructive actions.** History rewrites, force pushes, deleting data or branches,
   anything needing a `--force` / `--no-verify` style override, production actions with no rollback,
   spending money, anything with external side effects that cannot be taken back.
4. **Anything the operator explicitly reserved.** A standing instruction to be asked about a specific
   class of thing outranks this file for that class.

**When you do escalate, escalate informed.** Present what the record already says, the options with your
scoring if you ran a panel, and your recommendation. Never ask a bare open question — that is how a human
gets pulled into re-deciding something they already decided.

---

## 6. Step 5 — write every decision down

**A decision that is not recorded did not happen.** The next agent searches step 1, finds nothing, and
re-asks — which is the loop this whole protocol exists to break.

At the moment the decision is made, not at the end of the session (a session that runs out of room cannot
write up what it decided), append to **the artifact step 1 searches**:

- The question, in the shape a later agent would search for.
- The decision, stated as an instruction someone can follow.
- The rationale: the options considered, the axes, the weighting, why the loser lost.
- The scope and expiry: which tickets, which run, how long it stands, and whether a later effort should
  re-derive it rather than inherit it.
- Whether it **supersedes** an earlier entry, cited by date and heading.

Append-only. New entries reference prior ones; they never rewrite them.

If the decision is architectural AND hard to reverse, it is an ADR as well as a log entry — see
`./adr-doctrine.md`. The log records that a call was made; the ADR records the invariant it created.

---

## 7. Observed failure modes

- **Re-litigation by fresh reasoning.** A settled convention was re-asked because the asking agent never
  opened the log that settled it. The answer came back opposite, from a human who was asked cold and
  shown none of the prior ruling. Two contradictory rules for one question, hours apart, in one project.
  A scoring panel run first would have produced the same outcome with better prose.
- **Verbal grants do not bind.** Full autonomy stated once in conversation, in a handoff document, and in
  persistent memory was followed by workers escalating anyway. Prose an executor may never read is not a
  carrier. A rule binds only when it reaches the executor's briefing — see `./orchestration-doctrine.md`
  → "Rule reachability".
- **Over-broad stop categories.** An escalation rule written against "ambiguity" fires on technical
  ambiguity too, which is most of it, and converts an autonomy grant into a stop-on-everything policy.
  Stop categories name the *kind* of ambiguity, never ambiguity as such.

---

## 8. Where this binds

- **Any point an agent is about to raise a question to the human.** Run §2 first. If it is settled, §3.
  If it is not settled and not in §5, it was never the human's to answer.
- **Any point an agent is about to pick between defensible technical options.** §4, then §6.
- **Skill authors.** A rule that must bind an executor appears as a `## Compact Rules` bullet in the
  owning `SKILL.md`, not only here — `./orchestration-doctrine.md` → "Rule reachability".
