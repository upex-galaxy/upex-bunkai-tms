# Output and Posting Flow

> Read at Steps 4 to 7 of `SKILL.md`. Covers the findings table, the triage conversation, the feedback draft and posting. Write the table headers, severity names and conversation in the user's language; the examples below are in English. The posted comment is in English unless the user asked otherwise.

## Step 4: Findings presentation template

Group by bucket, then severity, always with the evidence column, and include the Positive list before the user asks for it. The Axis column is Spec or Standards (see `SKILL.md` Step 3) and can be left out when the PR has no ticket or plan to check against.

```
| # | Bucket | Severity | Axis | Location | Finding (with evidence) |
|---|---|---|---|---|---|
| 1 | Real | BLOCKER | Standards | <file>:<line> | The function takes `p_user_id` and filters by it without binding it to `auth.uid()`, so any authenticated user reads other users' rows. `sprint-development/references/rpc-authorization.md` §"Actor bind: the canonical shape". |
| 2 | Pattern | MINOR | Standards | (whole PR) | 90% of the diff is regenerated Supabase types (flagged as noise in Step 2 and not read line by line) mixed with the real change; the documented convention is one commit per responsibility. Nothing breaks: a comparison, no score impact. `git-flow-master` §3.2. |
| 3 | Pattern | MINOR | Standards | <file>:<line> | The page queries Supabase directly; the documented pattern puts data access in `lib/api/`. It works the same: a comparison, not an error. `review-pr.md` §"Architecture & Structure". |
```

Close with:

```
Strengths:
- <positive finding 1, with its own evidence>
- <positive finding 2>

Score: X.X / 10: <one-line rationale tied to the buckets that drove it>
```

Nothing is sent anywhere yet. This is the checkpoint the user reacts to in Step 5.

## Step 5: Triage conversation

Pushback comes in a few shapes. Act on it directly instead of re-arguing the first call:

- "Only the blockers and majors": filter the set that goes to the draft. Do not re-run the analysis, just re-scope.
- "That's not an error, it's a pattern": move the finding from Real to Pattern (or drop it if it was borderline), restate the score under the new weighting, and ask whether that score is acceptable before moving on.
- "Let's not be so hard on patterns": this changes the strictness level for the whole review, not one finding. Re-walk every Pattern finding under the new level (`references/severity-and-scoring.md`) and re-present the updated table before drafting.

Draft only after the user has said which findings ship and accepted a score. A draft nobody asked for gets redone.

## Step 6: Draft template (sandwich, the default)

Use this shape unless the user sets another. Keep the constructive middle tied to the citations in the findings table, not to a vaguer rephrasing of them. The comment is in English (Critical Rule #12) unless the user asked for another language for it, and it carries no AI-generated marker.

```
## Review: PR #<N>: <title>

<Name>, <one genuine, specific opening observation, not generic praise. Name the
actual thing done well and why it mattered, evidence and all, like a finding.>

<second positive if there is a natural one; do not pad if there is only one strong point.>

<One sentence moving into the constructive section, no hedging preamble.>

**1. <Finding title> (<severity>).** <What is wrong, where, why it matters, and, when
there is an obvious one, a concrete suggested fix.>

**2. <Finding title> (<severity>).** <Same shape.>

<Optional: lighter pattern-level notes, framed as comparison and not error,
grouped apart from the numbered real findings.>

**Score: X.X / 10**

<Closing positive: genuine, forward-looking, not a repeat of the opening. Tie it to
what the fix path looks like or what is already solid enough to build on.>
```

Call the Skill tool with "humanizer" in embedded mode before showing the draft, because a person outside this session reads the comment. When it is not installed, run the prose pass inline and say so. Code, paths and citations stay untouched.

## Step 7: Confirm, then post

The confirmation has to be unambiguous and about this draft. "Looks good" while you are still discussing severity is not the same as "post it" after the final draft is shown. When in doubt, show the full draft again and ask directly. With nobody to ask, `SKILL.md` "Who holds the gates" says who gives the go.

Posting commands (load `/git-flow-master` first if this session has not, `.agents/instructions/agent-tool-resolution.md` §6.5):

```bash
# Save the draft to the session scratch dir first (avoids shell-escaping issues with markdown/backticks)
cat > <scratchpad>/pr<N>_review.md << 'EOF'
<the confirmed draft, verbatim>
EOF

# This repo, current branch's PR
gh pr comment <N> --body-file <scratchpad>/pr<N>_review.md

# External repo
gh pr comment <N> --repo <owner>/<repo> --body-file <scratchpad>/pr<N>_review.md

# Read it back: the comment must be on the PR, not only "the command returned 0"
gh pr view <N> [--repo <owner>/<repo>] --json comments -q '.comments[-1].url'
```

Report the comment URL that `gh pr comment` returns and confirm it matches the read-back (Critical Rule #16). Delete the scratch file afterwards.

If the user approved only part of a multi-PR batch ("post #1, hold #2"), post exactly that subset and say plainly what is pending and why. An earlier yes for one PR is not consent for a sibling PR still being triaged.
