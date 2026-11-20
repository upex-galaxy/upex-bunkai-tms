# Decision-elicitation doctrine

How this harness asks a human to decide. Canonical, binding, cited by `AGENTS.md` §2 and by
`./decision-protocol.md` §5. That file decides whether a question reaches the human at all; this one decides
how it is asked once it does. Match the instrument to the shape of the ask, and never let it cost more than the
decision is worth.

---

## 0 · Who may ask the human

One rule covers every instrument in this file: the harness's question tool, the sweep (§7) and the `mkd` deck
(§2 to §5). Only the session the human types into asks the human.

| Session | Asks the human? | Where its pendings go |
|---|---|---|
| a top-level conductor; a super-conductor (a conductor whose workers are conductors); an independent worker (launched top-level, its prompt carries no fleet token) | yes: the sweep for small items, the deck for heavy ones (§1) | to the human |
| a session launched by another session: its prompt carries the fleet token `/<skill> <label> fleet worker` (a worker, or a middle conductor another conductor launched) | never: no structured-question tool, no `mkd` deck, no sweep | to the session that launched it |
| a subagent, an unattended routine (`/autonomous-delivery`), CI | never | listed in its report; a routine parks the item (`./decision-protocol.md` §5) |

A launched session escalates to its launcher. It sends what `./decision-protocol.md` §5 escalates (with §5.1
applied: under `decision_authority.product: decide` a scored decision subagent decides a product question, so
it is not escalated), plus every error or blocker it cannot clear inside its brief. The channel is an `ask`
(the session then ends its turn and is woken with the answer), an `escalation`, or, when it was launched without a dispatch, a `status` message whose subject starts
with `BLOCKED: ` (`/agent-orchestration` worker contract rules 2, 3, 8 and 16). A pending that does
not block goes in a plain message or the report, and the session keeps working on whatever does not depend on
the answer. The launcher relays the item to the human with the instrument §1 picks or, if it was itself
launched, sends it up one more level. A routine at the top of the chain parks it. A middle conductor never
sweeps: it escalates its workers' pendings together with its own.

Why: a question prompt in a terminal nobody watches waits forever (gotcha G36 in
the `/agent-orchestration` gotchas ledger), and inside Orca the `mkd` deck opens a tab and blocks its session
until someone presses Send.

A launched session may still ask the human directly when the human typed that request into its own terminal, or
when its brief grants it in writing. It asks with the instrument §1 picks, then tells its launcher what it asked
and what the answer was, so the decision lands in the run record (`./decision-protocol.md` §6). The fleet token
in its first prompt stays: the next request that did not come from the human goes back to its launcher.

A session knows which case it is in from its first prompt (the fleet token, or none) and from the request in
front of it. When unsure, treat yourself as launched and escalate: a needless relay costs one hop, and a prompt
nobody sees costs the run.

---

## 1 · The ladder

The ladder is for a session §0 lets ask the human. A launched session sends its asks to its launcher.

| The ask | Instrument | Why |
|---|---|---|
| One small decision needed to continue this turn | the harness's own question tool | fastest path, no context switch, the answer arrives in-turn |
| Any number of small decisions (A or B, a default to confirm, a deferral: each fits in two sentences) | the sweep (§7): the harness's question tool, called in rounds until every item is asked | the count never moves a small decision to a deck; the tool's per-call cap only sets the round size |
| A decision with real tradeoffs or weight (architecture, an implementation approach, a larger change, anything whose cost cannot be stated honestly in two sentences) | `mkd` decision deck | a terminal prompt cannot hold written tradeoffs and context. Weight is the trigger |
| A long plan, PRD section or report the human should react to point by point | `mkd` report items | each reaction is anchored to its section, so nobody maps a prose reply back by guessing |
| Row-by-row verdicts over tabular data (backlog triage, stories to defer, a schema diff) | `mkd` table item | one answer per row |
| The approach itself is unsettled and needs exploring before anything is built | plan mode | this is not a decision yet |
| No human is at the wheel (CI, `/autonomous-delivery`, a scheduled routine) | none of the above | state the assumption, proceed and record it in the report. Never block a routine on a question nobody will see; one that `./decision-protocol.md` §5 reserves is parked, never assumed (§6) |

Nine small decisions are one sweep and one heavy decision is a deck. A deck for a small decision is ceremony, and
ceremony is how a good instrument gets abandoned. A mixed batch splits: sweep the small ones, deck the heavy
ones.

---

## 2 · What makes a deck worth the round trip

A deck that only lists options is worse than a terminal prompt: it costs more and delivers the same. Its value
is in what a terminal cannot hold.

- Every option carries a written justification, what it buys and what it costs. The skill's validator rejects an
  option without one.
- At most one option is recommended, and its justification says why it wins.
- The problem is stated in plain language for a product owner without the full technical context (the PM Voice
  register of `AGENTS.md` §2). Jargon, library names and file paths go inside the collapsible context balloons.
- Context balloons carry how things work as they stand, since a reader who does not know the current state
  cannot weigh a change to it.
- Skipping an item means decide later. It is never a rejection.

If the deck would explain nothing a terminal prompt cannot, use the prompt and save everyone the tab.

---

## 3 · The gate, and the fallback

`mkd` is a user-level skill, installed globally by this repo's installer (`cli/install.ts`,
`USER_LEVEL_SKILLS`). A machine that ran the installer has it.

| State | What happens |
|---|---|
| installed | use it when the ladder says so |
| not installed | say one line offering to install it, then fall back to the harness prompt and continue. Never block on the offer |

Say the offer once per session, never twice: a missing `mkd` means our own installer did not run or drifted, and
the fix is one command. The fallback is always acceptable, because a decision taken through the harness prompt
is a real decision. The deck is a better container, not a different authority.

---

## 4 · Delivery

By default the CLI renders the deck, opens a browser and exits. The human answers whenever they want and pastes
the result back, which fits an answer that is not needed this turn. When the answer is needed this turn, serve
the deck and wait (the skill's blocking mode), and the result returns to the agent with nothing pasted by hand.

With an orchestration runtime that has an embedded browser (for example an Orca worktree), you may open the deck
in that tab so it sits beside the terminals that produced it. Without one, the system browser is the default.

Two rules follow from how browser storage works:

1. Keep one copy, or the answers split. The same deck open in two browsers keeps two sets of answers that never
   merge. Open one, say which is live and close the other.
2. Check before moving a half-answered deck. Read its storage key first, because moving it to a different
   origin loses everything already answered.

---

## 5 · Reading the result

The returned JSON is the execution contract.

- A skipped item means decide later. Re-ask it later and never treat it as a no.
- A custom answer is executed as written, or questioned if something does not add up. Do not normalise it into
  the nearest listed option.
- Read each item's note. "I did not understand this question" is the most important signal a deck can return:
  the answer is not informed consent, so do not execute that item. Re-explain it in plain language and ask
  again, because executing it ships a change the owner never approved.
- Quoted phrases the human highlighted weigh more than the rest of their free text.
- Write the answers down where `./decision-protocol.md` §6 says, as they arrive. An architectural answer that
  passes the three ADR gates (hard to reverse, surprising without context, a real trade-off) becomes an ADR
  written `Accepted`, since the human already decided (`./adr-doctrine.md` §3 step 4).

---

## 6 · What this is not for

- A decision the AI should simply make. A routine technical call with an obvious default is not a decision
  point (`./decision-protocol.md` §4), and making the human confirm it is noise.
- Gathering requirements. That is a conversation (`/project-foundation`, `/product-management`).
- A decision already taken. Re-opening a settled question through a nicer interface is still re-opening it
  (`./decision-protocol.md` §3).
- An unattended routine. The assumption a routine may state and proceed on (§1, last row) is a technical one;
  a question of the four kinds is parked and reported, never assumed (`./decision-protocol.md` §5.2).

---

## 7 · The sweep (SPD, Sweep Pending Decisions)

The sweep closes a turn that still holds small open items: the sweep takes small decisions and the deck takes
heavy ones (§1). When a turn holds both, a blocking item is asked at once, by whichever instrument fits. At the
close, heavy items go to the deck first, then the sweep takes every remaining small item.

Who sweeps. Only a session §0 lets ask the human: a top-level conductor, a super-conductor, an independent
worker. A launched session never sweeps and never decides a pending that §5 escalates; it sends the pending to
its launcher as §0 says, and the session the human types into sweeps it. A subagent lists its pendings in its
report. With no human at the wheel (CI, `/autonomous-delivery`, an unattended routine) there is no sweep: park
the item and report it (`./decision-protocol.md` §5).

What counts as pending. Only what `./decision-protocol.md` §5 lets reach a person (the four kinds). A technical
call inside the approved plan is decided and reported as DECIDED, never swept, and a settled question is
followed, never re-asked (`./decision-protocol.md` §3). The sweep never widens what is asked.

When. Before any message that would leave something waiting on the human: a decision, an unconfirmed
assumption, an item left for later. In plan mode, sweep before `ExitPlanMode`, which stays reserved for
approving the plan itself.

Rounds. Call the harness's question tool at its own per-call limit, each round waiting for its answers, until
every pending item has been asked. An item an earlier answer made moot is dropped. Nine items on a tool that
takes four per call are rounds of four, four and one. This repo writes no limit, because the tool's schema sets
it. Blocking items go in the first round, and a later round never repeats an item already answered or deferred.

Shape of each question. One pending item, a short header, and the options within the tool's option limit, the
recommended one first and marked, each stating its value and its cost in a line. Offer a free-text way out (the
tool adds "Other" on the harnesses below; where it does not, add "Other (write your own)") and a "Later" option
unless the item blocks the work. Over the option limit, drop alternatives before "Later" or the free-text way
out.

"Later" is an answer. Record it as deferred in the session's `progress.md` (`./session-management.md` §7) and
do not ask it again in the same session unless it starts to block. A new session re-raises it once, and only if
the handoff lists it.

The answer is the execution contract, read as §5 reads a deck result: "Other" text is executed as written, and an
answer saying the question was not understood means do not execute, so explain it plainly and ask again. Write
the answers down where `./decision-protocol.md` §6 says.

Which tool. The harness's own structured-question tool; look it up in the session's tool list.

| Harness | Tool | Where it is absent |
|---|---|---|
| Claude Code | `AskUserQuestion` | headless runs; Agent-tool subagents (unreliable) |
| Codex | `request_user_input` | exec mode; outside Plan mode unless the feature flag `default_mode_request_user_input` is on |
| OpenCode | `question` | `opencode run`; disabled by its permission key `question` |
| Pi | none built in | always, unless a package adds one: the fallback below |
| Gemini CLI | `ask_user` | non-interactive runs |
| any other | its own question tool, if its tool list shows one | otherwise the fallback below |

Tool names and limits change between harness versions. The tool list of the running session is the authority,
and this table only says what to look for.

Fallback (no tool, a refused call, or the tool is off in this mode): a numbered list in the message, with the
same content as the structured call, in rounds only if it grows unwieldy:

```text
Pending (N). Reply with the numbers, e.g. "1a 2b 3 later":
1. <the question, one sentence>
   a) <option> (recommended: <why>)   b) <option>   c) later   d) other: write your own
```

A turn that ends with an unnumbered paragraph of open questions is the defect the sweep exists to remove.
