# Decision protocol: decide the technical call, escalate the rest

> Cited by the compact rules of the workflow skills. Pairs with `./orchestration-doctrine.md` (who executes
> what) and `./dispatch-patterns.md` (how to fan work out). This file governs who decides, not who runs the work.

A technical decision is the agent's to make. Stopping to ask is the exception, kept for the four categories in
§5: an agent that escalates a call it was equipped to settle stalls everything downstream of it. Autonomy is
not improvisation, though, so decide in the order below. The order is the point of this file.

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

Running the panel before the search is the failure this protocol exists to prevent. A panel reasons well from
scratch and returns a confident answer that overwrites a decision the project already made. That is a second,
contradictory rule, and nothing marks which one governs.

---

## 2. Search the record first

Before you decide, dispatch or draft a question for the human, find out whether the question is already
answered. Search in this order:

1. The run's escalation and decision log, if the workflow keeps one. Read it in full: the governing ruling may
   be an hour old and written by a peer session you never saw.
2. Architecture Decision Records. A settled invariant lives there so nobody re-derives it.
3. The work queue and the ticket itself, plus its siblings and its parent. A ruling on a sibling usually
   governs yours, since the thing being decided is often a property of the batch.
4. Tracker comments and handoff notes on the ticket and its blockers.
5. The skill's own reference tree for the stage you are in.

Search for the shape of the question, not its wording: "which branch shape do I use" and "how do we execute a
chain" are the same question and will not match the same grep.

A prior decision found here outranks your own fresh reasoning about the same question, including reasoning you
have not done yet. Two well-argued contradictory answers leave a project worse off than one adequate answer.

---

## 3. If settled, follow it

Apply the decision and cite it in your plan or report so the next reader sees the same chain. Do not re-derive
it, sanity-check it by re-running the analysis, or ask anyone to reconfirm it.

Asking a fresh question about a settled matter is itself the defect, even of a human. A human asked cold, without
the ruling in front of them, answers from the same blank slate you would have, with more apparent authority and
less context. That reply is an uninformed re-ask, and it supersedes nothing.

If you believe the settled decision is wrong, that is a supersession, and it is explicit:

- Name the prior decision by its date and heading.
- State what changed or what the original missed. New evidence counts; a fresh preference does not.
- Get it decided under §4 or §5, whichever fits its category.
- Record the supersession in the same artifact as the original and reference it. Append; never rewrite or
  delete the prior entry, because the history of a reversal is as load-bearing as the reversal.

A silent second answer is a contradiction, not a supersession.

---

## 4. If novel and technical, decide it yourself

Unsettled and outside §5 means the call is yours. When it is close, consequential or hard to reverse, run a
scored judge panel instead of picking on instinct.

Dispatch independent subagents in Parallel per `./dispatch-patterns.md` gate 3, each with the standard
7-component briefing. Every panelist gets the same options and evidence and a different lens. Panelists do not
confer, see each other's output or choose; they score and justify, and you adjudicate. That keeps
`dispatch-patterns.md`'s "don't delegate planning" intact: the panel evaluates and the deciding agent decides.

Use 3 panelists when the decision is reversible within the current stage and 5 when it sets a precedent. Below 3
there is no spread to read, and above 5 the lenses overlap.

Pick the lenses from the axes this decision loads, not from a fixed list:

| Lens | Asks |
| --- | --- |
| Purpose fidelity | Does the option serve the reason the rule or gate exists, or only its letter? |
| Failure resilience | What survives if this session dies midway, the step is retried or it lands half done? |
| Blast radius | What breaks if this is wrong, and how far does the damage reach? |
| Reversibility | What does undoing this cost tomorrow, next week, after it has dependents? |
| Precedent load | What is everyone downstream now obliged to do, having seen this? |
| Track record | What has this project observed with each option? Weight it lightest, since it reflects sample size more than merit. |

Drop a lens that scores every option the same; it does not apply. Each panelist scores every option on its axis
(a fixed scale such as /10) with a one-paragraph justification per score, and the highest total wins. Two
caveats matter more than the arithmetic:

- State the weighting before you read the scores, naming which axes dominate and why. An unweighted sum treats
  reversibility and track record as equally important.
- A near-tie is a real result. When the top two land within noise, say so and pick on the dominant axis
  instead of manufacturing a decisive-looking margin. Record it as close, so a later supersession knows it is
  pushing on a weak decision.

Then record the decision per §6, with the axes, the weighting and the losing option, so the next agent does not
re-derive it and land somewhere else.

---

## 5. Escalate only these

Four categories, and they are exhaustive. Everything outside them is yours.

1. Product and business decisions: what to build, what a feature should do, which behaviour is correct for the
   user, scope changes, priority calls. Product ambiguity in a requirement or acceptance criterion stops the
   work, because an improvised answer to "what should this do" is a guess dressed as a decision. Technical
   ambiguity about how to build an agreed behaviour is §4 work.
2. Security judgment calls that no existing rule covers. Applying an established, ratified security pattern to
   new code is implementation, so do it. Deciding a new security posture, or accepting a risk nobody has
   accepted before, escalates.
3. Irreversible or destructive actions: history rewrites, force pushes, deleting data or branches, anything
   that needs a `--force` or `--no-verify` style override, production actions with no rollback, spending
   money, and any external side effect that cannot be taken back.
4. Anything the operator reserved. A standing instruction to be asked about a class of thing outranks this
   file for that class.

When you escalate, escalate informed: what the record already says, the options with your scoring if you ran a
panel, and your recommendation. A bare open question pulls a human into re-deciding something they already
decided.

The instrument follows the weight of the ask, never the count: small decisions, however many, go to the sweep
and a heavy one goes to the `mkd` decision deck. The ladder, the sweep, the deck rules and the fallback are in
`./decision-elicitation-doctrine.md`. Who receives the escalation is §0 there: only the session the human types
into asks the human, and a session launched by another session escalates to its launcher.

### 5.1 Category 1 is configurable, by explicit opt-in

Read `decision_authority.product` in `.agents/project.yaml`. Absent or `escalate` means §5 applies as written
and you can stop reading this subsection.

`decision_authority.product: decide` declares there is no human PO in the loop (the product is specified and
built end to end by AI) and replaces category 1 only. Categories 2, 3 and 4 still escalate. Under `decide`:

- An open product, business, functional, scope, UX-copy or design-intent question on a ticket is work to do,
  not a blocker. It does not wait for a human by default.
- Search the record first, as §2 requires, and follow and cite any published ruling that governs the question.
- If it is unsettled, dispatch a decision subagent instead of escalating: the profile that fits, or both when
  the call is joint:

  | Profile | Owns | Reads before deciding |
  | --- | --- | --- |
  | `Product Owner / Business Analyst (delegated)` | product, business, functional, scope, UX copy, design intent | the product-definition context (PRD, SRS, business docs, domain glossary), the design plan, the epic's sibling tickets, the ticket's own folder |
  | `Tech Lead (delegated)` | schema, index, API contract, auth model, performance, migration shape, integration architecture | the relevant ADRs, existing migrations, and the live code precedent |

- The subagent runs the same scored method as §4: 2 to 4 concrete candidate answers, scored against explicit
  criteria, highest scorer wins, reasoning written out. A bare opinion is not a decision.
- Publish the ruling to the ticket under a heading that names the authority, for example
  `## Product decision (decision_authority.product: decide): <question>`, then resync the tracker cache. A future
  run has to see that the ruling came from the delegated authority and not from a person, so it is never styled
  as human sign-off and never left unattributed.
- A published ruling that names concrete follow-on work is executed, not re-escalated. Materializing a decision
  already made is data entry against a settled question.

The wider grant is safe only because the rest of this file still applies: search first, score the alternatives,
write it down.

### 5.2 No person at the wheel

Every wait for a person has three paths, and the path depends on who is running:

- A person is present: ask after steps 1 to 4, informed, with the instrument `./decision-elicitation-doctrine.md`
  §1 picks.
- A supervised worker (launched by a conductor): send the §5 question to the launcher as an `ask` (then end the turn;
  Orca wakes the worker with the answer), or an `escalation`, per `./decision-elicitation-doctrine.md` §0, and keep working on what does not depend on
  the answer. The conductor holds the gate.
- A routine with nobody (`/autonomous-delivery`, an unattended automation, CI): technical calls are decided and
  reported as DECIDED, with the option each one beat. A §5 question is neither asked nor assumed. Write it into
  the run's escalation log (what happened, which category, what the person has to decide, what waiting costs
  downstream), do the reversible work, stop before any outward or irreversible action (a push, a tracker
  write, a message) and end the run cleanly. A brief from the launcher that covers the decision counts as the
  approval. A routine never waits for a reply.

---

## 6. Write every decision down

A decision that is not recorded did not happen: the next agent searches per §2, finds nothing and re-asks.
Record it when it is made, not at the end of the session, because a session that runs out of room cannot write
up what it decided. Append to the artifact §2 searches:

- The question, in the shape a later agent would search for.
- The decision, stated as an instruction someone can follow.
- The rationale: the options considered, the axes, the weighting and why the loser lost.
- The scope and expiry: which tickets, which run, how long it stands, and whether a later effort should
  re-derive it or inherit it.
- Whether it supersedes an earlier entry, cited by date and heading.

The log is append-only. New entries reference prior ones and never rewrite them.

If the decision passes the ADR test in `./adr-doctrine.md`, it is an ADR as well as a log entry. The log records
that a call was made; the ADR records the invariant it created.

---

## 7. Observed failure modes

- Re-litigation by fresh reasoning. A settled convention was re-asked because the asking agent never opened the
  log that settled it. A human, asked cold and shown none of the prior ruling, answered the opposite, and the
  project held two contradictory rules for one question. A panel run first would have done the same with better
  prose.
- Verbal grants do not bind. Full autonomy stated once in conversation, in a handoff document and in persistent
  memory was followed by workers escalating anyway. Prose an executor may never read is not a carrier. A rule
  binds only when it reaches the executor's briefing (`./orchestration-doctrine.md`, "Rule reachability").
- Over-broad stop categories. An escalation rule written against "ambiguity" fires on technical ambiguity too,
  which is most of it, and turns an autonomy grant into a stop-on-everything policy. Stop categories name the
  kind of ambiguity, never ambiguity as such.

---

## 8. Where this binds

- Before an agent raises a question to the human: run §2 first. Settled means §3. Unsettled and outside §5 means
  it was never the human's to answer.
- Before an agent picks between defensible technical options: §4, then §6.
- For skill authors: a rule that must bind an executor goes in the owning `SKILL.md`'s compact rules
  (frontmatter `compact_rules`, or a `## Compact Rules` section where the skill has one), not only here
  (`./orchestration-doctrine.md`, "Rule reachability").
