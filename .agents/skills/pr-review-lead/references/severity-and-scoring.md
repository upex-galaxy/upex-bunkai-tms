# Severity, Strictness, and Scoring

> Read at Step 0 (choosing strictness) and Step 3 (bucketing findings) of `SKILL.md`.

## The severity scale is shared, not redefined

Severity uses the scale in `sprint-development/references/review-pr.md` §"Adjudication contract": `BLOCKER` (merge-stopping), `MAJOR` (should fix before merge), `MINOR` (low impact, fix or follow up), `NIT` (cosmetic, optional). One scale for the story pipeline's reviewer and for this skill, so a finding means the same thing whichever of them raised it. In conversation the labels are mirrored in the user's language (Bloqueante / Mayor / Menor / Nit); the posted artifact keeps the English ones.

## The three buckets

Every finding lands in exactly one bucket. The bucket, not the severity label, is what drives the score.

**Real**: something is evidently wrong or puts correctness, security or data at risk, independent of anyone's architectural taste. An acceptance criterion the diff does not meet, a hardcoded credential, an RPC that binds the actor from a parameter instead of `auth.uid()`, a destructive migration with no down path, a UI change that diverges from the live UI and design system with no ratification. These get weight at every strictness level, including Flexible.

**Pattern**: the code works, nothing breaks, but it diverges from a convention this repo (or the target repo) actually documents. This is a comparison, not a verdict: "the documented pattern does X, this PR does Y." Whether this bucket is surfaced at all, and how much it counts, depends on the strictness level chosen in Step 0.

**Positive**: not optional, not a courtesy. A finding here is exactly as evidence-grounded as the other two: "the migration ships its down path and the PR body shows it ran" is a Positive finding the same way a hardcoded key is a Real one.

## Strictness levels — what changes

| Level | Real | Pattern | Score impact of Pattern findings |
|---|---|---|---|
| Flexible | Full weight, always surfaced | Not surfaced unless it is ALSO a correctness or security risk | None |
| Standard (default) | Full weight | Surfaced as a labeled observation, explicitly not called an error | None: pattern notes are informational, never subtracted |
| Strict | Full weight | Surfaced as a tagged finding, including things that are "technically fine but not the documented pattern" | Small: a clean, cited doctrine violation can shave a fraction of a point, but never dominates the score the way a Real finding does |

The level is a lens on what gets *reported*, not a license to invent findings. At Strict you still need the same evidence bar (`references/evidence-and-doctrine-lookup.md`): you lower the threshold for what is worth reporting, not the bar for proof.

## Worked example (why the strictness lens exists)

The lens comes from a recorded review session in the sibling QA boilerplate, where an architecture-pattern deviation that broke nothing was first scored as the top severity and the user pushed back: most engineers do not implement any architecture 100% by the book, and a deviation that does not break anything is not an error the way a real bug is. The same correction, in this repo's terms (illustrative, not a recorded case here):

A page component calls the Supabase client directly instead of going through `lib/api/<domain>.ts`. `review-pr.md` §"Architecture & Structure" documents the split (UI ≠ logic ≠ data). It works; nothing leaks. At Standard strictness the right framing is:

> "The documented split puts data access in `lib/api/`, and this page queries Supabase directly. It works the same; the pattern just says otherwise. I'm raising it as a pattern comparison, not an error."

Same fact, same citation, completely different weight and framing. That is Standard strictness working correctly: cite the doctrine, do not dramatize the deviation, do not let it drag the score.

Contrast with a Real finding from the same hypothetical PR that keeps its full weight at every level: a new Postgres function takes `p_user_id` from the caller and filters by it without binding it to `auth.uid()` (`sprint-development/references/rpc-authorization.md`). Any authenticated user can read another user's rows. That is a `BLOCKER` regardless of how gently the user asked to treat patterns.

## Scoring rubric

Score out of 10. Start at 10 and subtract:

- Each **`BLOCKER`** Real finding: -1.5 to -2.5 depending on blast radius (a leaked anon key in a demo project is a smaller real-world risk than a cross-tenant read in a project with real user data; say so, and weight accordingly).
- Each **`MAJOR`** Real finding: -0.5 to -1.
- Each **`MINOR`** Real finding: -0.1 to -0.3.
- `NIT`: 0.
- Pattern findings: 0 at Flexible / Standard. At Strict, -0.1 to -0.2 each, capped so Pattern findings alone cannot pull the score below what the Real findings alone would produce minus 1 point: a PR with zero real defects and ten pattern nitpicks still lands solidly above the midpoint.
- Do not add points back for Positives: they do not offset defects, they are reported separately so the feedback is not just a list of problems. A PR with a blocker and excellent positives is still a PR with a blocker; say both, honestly.

Always attach a one-line rationale to the number ("6.5/10: clean component structure and real tests, but the new RPC trusts a caller-supplied id and the migration has no down path, both Real"), not just the digit. The user sees this number before deciding what to send, so it has to be defensible on its own; they may ask you to justify it before triaging (Step 5).
