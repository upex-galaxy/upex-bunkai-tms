# BK-554 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-554)

## AC-01 — The Run history states how flaky the Test is

```gherkin
Scenario: The flakiness signal sits with the Test's all-time outcome summary
  Given a Test whose Run history I am viewing
  And the Test has at least five finished Runs that ended Passed or Failed
  When the history loads
  Then I see how flaky that Test is, alongside the all-time Passed, Failed and Aborted totals
  And the signal names the Test as a whole, not any single Run
```

---

## AC-02 — The signal shows the flips, the sample, and the rate

```gherkin
Scenario: The signal is stated with the numbers behind it
  Given a Test with enough finished Runs for a flakiness signal
  When I read the signal
  Then I see how many times the verdict flipped
  And I see how many recent Runs the flips were counted over
  And I see the resulting rate as a percentage
```

---

## AC-03 — A flip is a change of verdict between two consecutive Runs

```gherkin
Scenario: Consecutive Runs with different verdicts count as one flip
  Given a Test's five most recent finished Runs ended Passed, Passed, Failed, Passed, Passed in that order
  When the flakiness signal is computed
  Then it reports exactly two flips
  And the rate is two flips out of the four consecutive pairs those five Runs form
```

---

## AC-04 — A Test that never changed verdict reads as stable

```gherkin
Scenario: An all-passing Test is stable, not unsignalled
  Given a Test's ten most recent finished Runs all ended Passed
  When I read the flakiness signal
  Then it reads as stable
  And it reports zero flips
```

```gherkin
Scenario: An all-failing Test is also stable
  Given a Test's ten most recent finished Runs all ended Failed
  When I read the flakiness signal
  Then it reads as stable
  And it reports zero flips
  And it does not describe the Test as flaky
```

---

## AC-05 — A single recovery is not reported as a flaky Test

```gherkin
Scenario: A long failing streak that was fixed reads as barely flaky
  Given a Test's ten most recent finished Runs ended Failed six times and then Passed four times
  When I read the flakiness signal
  Then it reports exactly one flip
  And the Test is not placed in the flaky band
```

---

## AC-06 — An alternating Test is reported as flaky

```gherkin
Scenario: Verdicts that alternate every Run reach the flaky band
  Given a Test's ten most recent finished Runs alternated Passed and Failed on every Run
  When I read the flakiness signal
  Then every consecutive pair counts as a flip
  And the Test is placed in the flaky band
```

---

## AC-07 — Below the minimum sample no rate is shown at all

```gherkin
Scenario: A Test with too few finished Runs says so instead of showing a rate
  Given a Test has fewer than five finished Runs that ended Passed or Failed
  When I view its Run history
  Then the signal states there are not enough Runs yet to judge
  And it states how many more are needed
  And no rate, no percentage and no band is shown
```

```gherkin
Scenario: A Test with no Runs at all keeps its existing empty state
  Given a Test has never been run
  When I view its Run history
  Then the existing "no runs yet" message is shown
  And no flakiness signal of any kind appears
```

---

## AC-08 — Aborted Runs are excluded from the rate, and the exclusion is visible

```gherkin
Scenario: An aborted Run neither counts as a verdict nor breaks the sequence
  Given a Test's seven most recent finished Runs ended Passed, Passed, Aborted, Passed, Passed, Passed and Failed in that order
  When the flakiness signal is computed
  Then the Aborted Run takes no part in the flips
  And the two Passed Runs on either side of it count as one consecutive pair
  And the sample is the six Runs that ended Passed or Failed
  And exactly one flip is reported
  And the signal states that one Aborted Run was left out
```

```gherkin
Scenario: A Test whose recent Runs were all aborted cannot be judged
  Given every one of a Test's recent finished Runs was Aborted
  When I view its Run history
  Then the signal states there are not enough Runs yet to judge
  And it states that the Aborted Runs were left out
```

---

## AC-09 — An in-progress Run never participates

```gherkin
Scenario: A Run still in progress is not part of the sample
  Given a Test has a Run in progress and ten earlier finished Runs
  When the flakiness signal is computed
  Then the in-progress Run is not counted in the sample
  And the signal is the same as it was before that Run started
```

---

## AC-10 — The signal does not react to the outcome filter

```gherkin
Scenario: Filtering the list to one outcome leaves the signal unchanged
  Given I am reading a Test's Run history with a flakiness signal shown
  When I filter the history to show only Failed Runs
  Then the flakiness signal is unchanged
  And it still reports the same flips, sample and rate as before the filter
```

---

## AC-11 — The rate is auditable against the rows on screen

```gherkin
Scenario: The Runs the rate counted are the Runs the list shows
  Given a Test with enough finished Runs for a flakiness signal
  When I read the unfiltered history newest-first and count the verdict changes myself
  Then my count matches the flip count the signal reports
```

---

## AC-12 — Runs from different environments are counted together

```gherkin
Scenario: One signal per Test, across every environment it ran in
  Given a Test's recent finished Runs were executed against more than one Project Environment
  When the flakiness signal is computed
  Then all of those Runs are counted in the one sample
  And the signal is not split or repeated per environment
```

---

## AC-13 — The signal survives a shorter history than the window

```gherkin
Scenario: A Test with more than the minimum but fewer than the window's worth of Runs
  Given a Test has exactly six finished Runs that ended Passed or Failed
  When I read the flakiness signal
  Then the rate is computed over those six Runs
  And the signal states that six Runs were used
```

---

## AC-14 — A Test only a viewer can read still shows the signal

```gherkin
Scenario: Reading the signal needs no more permission than reading the history
  Given I am a workspace member with view-only access to the Project
  When I open a Test's Run history
  Then I see the flakiness signal exactly as any other member would
  And nothing on the screen offers to change it
```

---
_Synced from Jira by sync-jira-issues_
