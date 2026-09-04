# Upstream prompt — `upex-galaxy/agentic-dev-boilerplate`

> **What this is.** A paste-ready prompt to run in a Claude Code session opened **on the boilerplate
> repo**, not on this one. It carries two independent changes: (A) removing `discovery`'s synchronous
> approval gate, and (B) adding Claude-session provenance to commits, PRs and worktrees.
>
> **Why it has to run upstream.** `bun run up` treats upstream as canonical for `.agents/skills/**`:
> a locally-diverged file is overwritten wholesale in every mode, with no preserve list and no
> per-file opt-out (`cli/lib/updater-core.ts:1263-1272`, `:2326-2331`; `cli/update-boilerplate.ts:52-68`,
> `:801`). Editing the skills here first is work that the next update deletes.
>
> **Verified baseline, 2026-08-18.** All four target files are byte-identical between this repo and
> upstream `main`. Line numbers and quoted anchors below are valid verbatim. Upstream `main` HEAD was
> `350379fb`; this repo's `claude` component is pinned at `3b815c24` (`.template/boilerplate.lock.json`).
>
> **Provenance of the decisions.** Both changes are operator decisions made live in session
> `e2c2068c-7557-4659-9af1-95c20f95759a` on 2026-08-18.

---

## The prompt

```
You are working on `upex-galaxy/agentic-dev-boilerplate`, which is the canonical upstream for a
family of downstream project repos. Everything under `.agents/skills/**` here is overwritten onto
those repos by their `bun run up`, so changes must land here to be real.

Two independent changes. Do them as TWO SEPARATE BRANCHES and TWO SEPARATE PRs — they have different
reviewers' concerns and one may be rejected without the other.

Load `/git-flow-master` before any branch, commit or PR work.

Before editing anything: verify each anchor quoted below still matches the file byte-for-byte. This
prompt was written against `main` at `350379fb` (2026-08-18). If an anchor has moved or changed,
STOP and report the drift rather than guessing at the new location — a fuzzy match in a doctrine file
is how a rule quietly loses its teeth.

================================================================================
CHANGE A — Remove `discovery`'s synchronous approval gate
================================================================================

WHY (record this reasoning in the PR body; it is the load-bearing part)

`discovery` mode was the one mode in `autonomous-delivery` allowed to end its turn on an open product
question and wait for a human to answer in that routine's own chat session. In practice, on the
downstream project that runs it daily, ONE unanswered proposal produced FOUR consecutive fires that
created nothing at all — 2026-08-14 through 2026-08-18 — because the re-surface rule (correctly)
forbids stacking a new proposal on a pending one. The gate worked exactly as designed and the cost of
that correctness was four days of a routine doing nothing.

It also failed at the thing it was supposed to prevent. During the gated period the same mode opened
a pull request (docs-only, 6 files) despite `discovery`'s contract saying it never creates branches —
and nobody noticed for five days. The gate did not bound the blast radius. The per-run definition cap
(`discovery_definitions`) is what bounds it.

The replacement is create-then-veto: the mode creates what it decides, records it in an append-only
log, and reports the keys. The operator vetoes by closing or deleting the ticket, which a later run
reads as a standing ruling. A user story sitting in `Backlog` is cheaper to close than the idle time
the gate cost.

This aligns `discovery` with `AGENTS.md`'s AI-led decision-authority rule, which the gate had been a
standing exception to.

FILES — the gate is encoded in exactly ONE file upstream. Verified: `grep -rn "pending-decision"`
across `.agents/skills/` hits only `autonomous-delivery/SKILL.md`. The three files under
`autonomous-delivery/references/` contain no mention of `pending-decision`, `awaiting_reply`,
`approval gate`, or `synchronous`. Do not go hunting elsewhere; do confirm the grep yourself.

A1. `.agents/skills/autonomous-delivery/SKILL.md` — the exception section, ~L461-481.

    Anchor (heading, note the em dash and the typographic apostrophe):

        ### Exception — Discovery's synchronous approval gate

    The section runs from that heading to just before the `---` preceding `## Phase 4 — Close and
    report`. REPLACE THE WHOLE SECTION with a section documenting create-then-veto. It must state:

      - `discovery` never waits, exactly like `story` and `bug`. There is no approval gate.
      - The mechanics: create via `/product-management`; append one entry per artifact to
        `.session/autonomous-delivery/discovery/created-log.md` (key, title, parent, date, run
        session id, one-line reason); report the keys to `report_channel`.
      - `created-log.md` is APPEND-ONLY and is read at the START of every discovery run, cross-checked
        against live tracker state. An entry whose ticket is closed or deleted is a VETO and a standing
        ruling: never re-create it, and never create a near-identical restatement under a new title.
      - A new epic is created the same way but owes the run report an explicit argument for why no
        existing epic could hold the work. It is not a request for permission.
      - An explicit DO-NOT-REINTRODUCE note: the gate was removed 2026-08-18 by operator decision,
        with the four-idle-fires evidence, and a future run must not restore it or invent a softer
        version. Without this note somebody re-adds it in three months as a safety improvement.

    Keep the section's existing observation that `discovery` skips worktree isolation — but re-justify
    it: `created-log.md` (not `pending-decision.md`) must be the one real file the next fire reads,
    not a copy trapped in a removed worktree.

A2. `.agents/skills/autonomous-delivery/SKILL.md` — hazard H19, ~L524, in the inline H1-H20 table.

    Current row:

        | H19 | `discovery`'s synchronous approval gate re-proposes on top of an already-pending, unanswered recommendation, flooding the backlog | Read `pending-decision.md` FIRST; `awaiting_reply` re-surfaces the same recommendation verbatim, never a new one |

    The hazard it describes no longer exists. Replace it with the hazard the NEW design carries —
    `discovery` re-creating something a prior run already created, or re-creating something the
    operator vetoed. Mitigation: read `created-log.md` first, cross-check every entry against live
    tracker state, treat closed/deleted as a standing ruling.

    (Note for whoever edits this: despite its name, `references/hazard-catalogue.md` contains no `H*`
    IDs at all — the H-table lives inline in `SKILL.md`. H19 has exactly one home.)

A3. `.agents/skills/autonomous-delivery/SKILL.md` — anti-pattern A18, ~L548.

    Current text names the gate as the one sanctioned exception:

        - **A18.** NEVER leave an escalation parked waiting for a reply, for `story` or `bug` mode. ... (`discovery`'s approval gate is the one explicit, scoped exception — see Autonomy § "Discovery's synchronous approval gate". Do not read that exception as license to park anywhere else.)

    Remove the parenthetical exception entirely and extend A18 to ALL THREE modes. No mode parks
    waiting for a reply anymore.

A4. `.agents/skills/autonomous-delivery/SKILL.md` — ~L217, the Phase 0a paragraph explaining why
    `discovery` skips worktree isolation. It currently justifies this by `pending-decision.md`.
    Re-point the justification at `created-log.md`. Same conclusion, correct reason.

A5. `.agents/skills/autonomous-delivery/SKILL.md` — the §Configuration block, ~L92 and ~L101.

        discovery_definitions: 2 # NEW user stories drafted + created per run — gated on synchronous chat approval.
        ... # NOT a mailbox. Discovery's proposal approval is synchronous, in that routine's own chat, never a reply here.

    Both comments describe the removed gate. Rewrite: definitions are created UNATTENDED and the cap
    is what bounds the blast radius; `report_channel` is where the operator SEES what was created,
    which is the input to the veto, while still being a log nobody replies to.

A6. Search the rest of the repo for any routine-prompt template or documentation that embeds the gate
    (a `.context/orchestration/`-style routines doc, an INSTALLER/README section, an examples folder).
    The downstream project keeps its live routine prompts OUTSIDE the repo, in
    `~/.claude/scheduled-tasks/<routine>/SKILL.md`, so the boilerplate may or may not ship a template
    copy. If it does, sync it. If it does not, say so in the PR body — that absence is itself worth
    knowing, because it means every downstream operator hand-maintains their routine prompt and this
    change will NOT reach them through `bun run up`.

VERIFY BEFORE PR: `grep -rn "pending-decision\|awaiting_reply\|synchronous approval\|approval gate" .claude/`
returns only intentional historical references (e.g. the do-not-reintroduce note). Anything else is a
missed edit.

================================================================================
CHANGE B — Claude-session provenance on commits, PRs and worktrees
================================================================================

WHY (record this in the PR body too)

An operator running three scheduled routines plus ad-hoc sessions accumulates many Claude sessions
per day. Every one of them commits and opens PRs under the SAME git/GitHub identity (the automation
account). When a branch, a worktree or a PR turns out to be broken, abandoned or wrong, there is
currently NO path from that artifact back to the session that produced it — so the conversation that
explains WHY is unreachable in practice, even though the transcript is sitting on disk.

Concrete case that motivated this: a docs PR sat open and conflicting for five days. Identifying which
session opened it required grepping archived run reports by hand. The transcript existed the whole
time and was 1.2 MB of exactly the needed context.

Transcripts live at `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`. The missing link is only ever
the session id. A running session knows its own id.

B1. `.agents/skills/git-flow-master/references/pr-templating.md` — the PR body template.

    `## Traceability` appears TWICE in this file and BOTH must be updated:
      - the template inside the ```markdown fence, ~L41-46
      - the worked example with concrete UPEX-123 values, ~L199-204

    Template anchor:

        ## Traceability

        - Issue: [<<ISSUE_KEY>>](<<ISSUE_URL>>)
        - Branch: `{branch}`
        - Base: `{base}`
        - Strategy: `{strategy}`

    Add two lines to both:

        - Session: `<<SESSION_ID>>`
        - Transcript: `~/.claude/projects/<<CWD_SLUG>>/<<SESSION_ID>>.jsonl`

    Then add matching rows to the `### Placeholder rules` table (~L57). That table is column-padded
    to a fixed width — match it. Row content:

      - `<<SESSION_ID>>` — the id of the Claude session opening the PR. The session knows its own id;
        the most reliable source is the session-scoped scratchpad path in its own environment. If it
        genuinely cannot be determined, DROP BOTH LINES rather than emit a placeholder or a guess —
        a wrong session id is worse than none, because it sends an investigation down the wrong
        transcript.
      - `<<CWD_SLUG>>` — the working directory with `/` replaced by `-`, matching the directory name
        under `~/.claude/projects/`. Derive it; never hardcode.

    State explicitly in the placeholder rules that this is provenance for debugging, not authorship
    attribution, and that a human-opened PR simply drops both lines.

B2. `.agents/skills/git-flow-master/references/conventional-commits.md` — the commit trailer.

    THIS IS THE DELICATE ONE. The file currently BANS exactly this shape, twice:

      - Grammar fence, L15:

            [optional Refs / Closes / Co-authored-by footers — but NEVER Claude]

      - Hard rules, L142:

            1. **No AI attribution.** Never include `Generated with Claude Code`, `Co-Authored-By: Claude <…>`, or any equivalent line. Commits look human-authored. (Critical Reminder #4 in `AGENTS.md`.)

    The operator's decision, verbatim in intent: the no-AI-attribution rule STAYS and is good. A
    session trailer is not attribution — it is a forensic pointer for root-cause investigation. Write
    it as a NAMED, NARROW EXCEPTION INSIDE the existing rule, never as a parallel rule that silently
    contradicts it. A reader who knows only the hard rule must be unable to conclude the trailer is a
    violation.

    Add to the grammar fence:

        [optional Claude-Session: <session-id> — forensic trailer, AI-authored commits only]

    Amend hard rule 1 to carry the exception explicitly. It must say, in substance:

      - The ban stands: no `Generated with Claude Code`, no `Co-Authored-By: Claude`, no equivalent
        line that reads as authorship or advertising. Commits still look human-authored.
      - ONE exception: a `Claude-Session: <uuid>` trailer, on commits actually written by an AI
        session. It names no product, claims no authorship, and exists so `git log --grep` can route
        an investigation to the transcript that explains the change.
      - It is omitted entirely from human-authored commits.
      - It never appears in the subject line or body — trailer only.

    First: OPEN the boilerplate's own `AGENTS.md`, find the numbered critical rule this line cites
    (numbering differs across repos — downstream it is #3, this file cites #4), and carve the SAME
    exception there, worded consistently. If the two disagree, the stricter one wins in practice and
    the trailer never gets written. Cite the actual number you find; do not trust the `#4` above.

    The subject-line regex at L20 constrains only the subject, so no regex change is needed. Confirm
    that yourself rather than taking my word for it.

B3. `.agents/skills/git-flow-master/references/worktrees.md` — a worktree registry.

    Verified: NO registry, manifest, inventory or ledger exists in this file today (zero hits for any
    of those words across its 216 lines). This is new content, not an edit.

    Add it under `## Multi-session safety (no collisions between parallel agents)` (~L151), whose
    existing rule of thumb is `one session = one worktree = one branch` — the registry is the record
    that makes that rule auditable after the fact.

    Design constraints, all of which matter:

      - A JSON registry at `.session/worktrees.json`, written when a worktree is CREATED and updated
        when it is removed. Fields per entry: worktree path, branch, session id, created-at,
        removed-at (null while live), and the ticket key when there is one.
      - It lives under `.session/` because that tree is gitignored — a registry that generates commit
        noise on every parallel agent will be deleted by the first person it annoys.
      - It is a RECORD, never a lock. The mode lock already prevents collisions. A registry that
        starts gating behaviour becomes a second, weaker lock that disagrees with the first one.
      - A stale entry (worktree path gone from disk, `removed-at` still null) is DIAGNOSTIC, not an
        error to auto-repair. Report it; let a human decide. Do not delete another session's worktree
        — the existing anti-pattern forbidding that stands unchanged and must be cross-referenced here.
      - Include the recovery recipe this whole change exists to enable: given an orphaned worktree or
        branch, look up its entry, get the session id, read
        `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`.

B4. Consider whether `git-flow-master/SKILL.md` needs a pointer to any of the above so the skill's
    main body actually reaches the new rules — a rule that lives only in a `references/` file that
    nothing cites is documentation, not a constraint. Add pointers where they are missing.

VERIFY BEFORE PR: render the PR body template by hand for a fake session and confirm both the
template and the worked example agree; and confirm the amended hard rule and the boilerplate
`AGENTS.md` rule say the same thing.

================================================================================
DELIVERY
================================================================================

Two branches, two PRs, base per the repo's own strategy (detect it, do not assume):

  1. `fix/discovery-remove-approval-gate`
  2. `feat/session-provenance-commits-prs-worktrees`

Commit messages: semantic prefixes, one commit per responsibility, no AI attribution. Change B's own
`Claude-Session:` trailer may be used on B's commits once B lands — not before, since the rule
permitting it does not exist yet.

Each PR body carries the WHY sections above, not just a file list. These are doctrine changes: six
months from now the reasoning is the only thing that stops someone reverting them as cleanup.

Report at the end: the two PR URLs, every file touched, any anchor that had drifted from what this
prompt quoted, and whether the boilerplate ships a routine-prompt template (item A6) or not.
```

---

## After it merges — downstream

1. `bun run up` in the downstream repo to pull the new `.agents/skills/**`.
2. Re-verify: `grep -rn "pending-decision\|awaiting_reply" .agents/skills/` should return only the
   intentional do-not-reintroduce note.
3. The live routine prompt at `~/.claude/scheduled-tasks/product-discovery--new-stories--epics/SKILL.md`
   was already rewritten locally on 2026-08-18 and is NOT managed by `bun run up` — it needs no
   re-application, but it should be diffed against whatever template item A6 turns up, if any.
