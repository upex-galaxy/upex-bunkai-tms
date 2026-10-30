# Output and Posting Flow

> Read at Steps 4-7 of `SKILL.md`. Covers the findings table, the triage conversation, the feedback draft, and posting.

## Step 4 — Findings presentation template

Group by bucket, severity within bucket, always include the evidence column, always include the Positive list before the user asks for it. Conversation language for the table (Spanish shown here):

```
| # | Bucket | Severidad | Ubicación | Observación (con evidencia) |
|---|---|---|---|---|
| 1 | Real | BLOCKER | <file>:<line> | La función recibe `p_user_id` y filtra por él sin ligarlo a `auth.uid()`: cualquier usuario autenticado lee filas ajenas. `sprint-development/references/rpc-authorization.md` §"Actor bind — the canonical shape". |
| 2 | Pattern | MINOR | (todo el PR) | 90% del diff son tipos de Supabase regenerados (ya avisado como ruido en el Step 2, no revisado línea por línea) mezclados con el cambio real; la convención documentada es un commit por responsabilidad. No rompe nada: comparación, sin impacto en el score. `git-flow-master` §3.2. |
| 3 | Pattern | MINOR | <file>:<line> | La página consulta Supabase directo; el patrón documentado pone el acceso a datos en `lib/api/`. Funciona igual: comparación, no error. `review-pr.md` §"Architecture & Structure". |
```

Close with:

```
Puntos fuertes:
- <positive finding 1, with its own evidence>
- <positive finding 2>

Score: X.X / 10 — <one-line rationale tied to the buckets that drove it>
```

Nothing here is sent anywhere yet. This is the checkpoint the user reacts to in Step 5.

## Step 5 — Triage conversation

Expect and welcome pushback of these shapes, and act on it directly rather than re-arguing the original call:

- "Solo los bloqueantes y mayores": filter the set that goes to the draft; do not re-run analysis, just re-scope.
- "Ese no es un error, es un patrón": reclassify from Real to Pattern (or drop it if it was already borderline), restate the score with the new weighting, and ask whether the new score is acceptable before moving on.
- "No seamos tan duros con los patrones": a strictness change mid-review, not a one-off reclassification. Re-walk every Pattern finding under the new level (`references/severity-and-scoring.md`) and re-present the updated table before drafting anything.

Once the user has said which findings ship and accepted a score, move to drafting. Do not draft speculatively before this point: a draft nobody asked for is a draft you will redo.

## Step 6 — Draft template (sandwich, the default)

Use this shape unless the user specifies another. Keep the constructive middle tightly evidence-linked: every point carries the citation from the findings table, not a vaguer rephrasing of it. The posted artifact is in English (Critical Rule #12) unless the user asked otherwise for this comment.

```
## Review: PR #<N>: <title>

<Name>, <one genuine, specific opening observation, not generic praise. Name the
actual thing done well and why it mattered, exactly like a finding, evidence and all.>

<second positive if there is a natural second one; do not pad if there is only one.>

<Transition into the constructive section: one sentence, no hedging preamble.>

**1. <Finding title> (<severity>).** <What is wrong, where, why it matters, and,
when there is an obvious one, a concrete suggested fix.>

**2. <Finding title> (<severity>).** <Same shape.>

<Optional: lighter pattern-level notes, explicitly framed as comparison not error,
grouped separately from the numbered real findings.>

**Score: X.X / 10**

<Closing positive: genuine, forward-looking, not a repeat of the opening. Tie it to
what the fix path looks like or what is already solid enough to build on.>
```

Before showing the draft to the user, run the prose through the `humanizer` skill in embedded mode when it is installed: the comment is read by a person outside this session. Code, paths and citations stay untouched.

## Step 7 — Confirm, then post

The confirmation has to be unambiguous and about *this* draft. "Se ve bien" while severity is still being discussed is not "postealo" once the final draft is shown. When in doubt, show the full draft one more time and ask directly rather than inferring.

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

Report the comment URL `gh pr comment` returns and confirm it matches the read-back (Critical Rule #16). Delete the scratch file afterwards.

If the user approved only part of a multi-PR batch ("post #1, hold #2"), post exactly that subset and say plainly what is still pending and why: an earlier "yes" for one PR never implies consent for a sibling still being triaged.
