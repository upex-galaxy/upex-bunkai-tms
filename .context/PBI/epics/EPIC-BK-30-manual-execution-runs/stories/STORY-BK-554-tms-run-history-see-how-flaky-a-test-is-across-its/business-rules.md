# BK-554 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-554)

> The constants below were ruled by the AI Product Owner on this ticket (see the decision comment). They are the story's contract — an implementation that changes any of them is changing the story.

## BR-01 — What a flip is

A ***flip**** is a pair of **consecutive* Runs of the same Test, in the order the Run history already presents them, whose verdicts differ. Consecutiveness is what makes the number mean instability: the same set of outcomes in a different order describes a different Test.

## BR-02 — Which Runs carry a verdict

| Run outcome | Counts as a verdict | Why |
| --- | --- | --- |
| Passed | Yes | It is an answer about the software |
| Failed | Yes | It is an answer about the software |
| Aborted | No | It is the executor stopping, not the software answering |
| In progress | No | Not history, and not an outcome |

There is no Blocked outcome at the Run grain — Blocked exists only on an individual step inside a Run, so it never reaches this rule.

## BR-03 — How Aborted Runs behave

An Aborted Run is ***skipped*** when the sequence is built. It is not a verdict, and it is not a break in the sequence either: the verdict before it and the verdict after it are still consecutive. Treating an abort as a break would let one interrupted session hide a real flip. The number of Aborted Runs skipped is always disclosed next to the signal, so the sample is never silently smaller than the history looks.

## BR-04 — The window

The sample is the ***ten most recent**** Runs of the Test that carry a verdict, which form at most ****nine*** consecutive pairs. Older Runs are outside the window, however many there are.

## BR-05 — The minimum sample

Below ***five**** verdict-carrying Runs there is ****no signal at all*** — not a zero, not an empty band. The signal says the Test cannot be judged yet and how many more Runs are needed. A rate drawn from one or two pairs is noise wearing a percentage sign, and a number nobody should act on is worse than no number.

## BR-06 — The rate and the bands

Rate = flips ÷ consecutive pairs, decided on the exact fraction and displayed as a whole-number percentage.

| Band | Condition |
| --- | --- |
| Stable | Zero flips |
| Occasionally flaky | At least one flip, and the rate is one third or less |
| Flaky | The rate is more than one third |

One third is the three-flips-in-nine-pairs boundary at a full window. A Test that failed for a stretch and was then fixed produces exactly one flip and therefore lands in Occasionally flaky, never in Flaky — separating a fixed regression from genuine instability is the whole point of counting consecutive changes rather than counting failures.

## BR-07 — Filter invariance

The signal is computed over the Test's Runs, never over the rows currently on screen. Filtering the history to a single outcome leaves it untouched — a filtered list contains one verdict only, so a filter-reactive signal would report every Test as perfectly stable the moment anyone used the filter.

## BR-08 — Environment scope

One signal per Test, over every Project Environment it ran in. A Test whose verdict depends on which environment executed it is not reproducible, and non-reproducibility is exactly what the signal is asserting.

## BR-09 — Read permission

The signal is derived from Runs the reader can already see, and requires no permission beyond the one that already opens the Run history. Any workspace member with read access to the Project sees it, viewers included. It is read-only in the strict sense: nothing stores it, nothing edits it, and no control on the screen changes it.

---
_Synced from Jira by sync-jira-issues_
