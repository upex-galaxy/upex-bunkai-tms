# BK-442 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-442)

## AC-01 — Open the comparison from a finished Run

```gherkin
Scenario: Compare a finished Run against the previous Run of the same Test
  Given a Test has at least two finished Runs
  And I am viewing the newer of the two
  When I choose to compare it with the previous Run
  Then I see a comparison of the two Runs, identifying which Run each side is and when each ran
```

---

## AC-02 — Every step carries one of four comparison outcomes

```gherkin
Scenario: Each compared step is classified
  Given I am comparing a Run against the previous Run of the same Test
  When the comparison is displayed
  Then every step that appears in both Runs reads as exactly one of "new failure", "still failing", "newly fixed", or "unchanged pass"
  And no step is left without a classification
```

---

## AC-03 — A step that failed only in the newer Run reads as a new failure

```gherkin
Scenario: A step that passed before and fails now is a new failure
  Given a step passed in the previous Run
  And the same step failed in the Run I am viewing
  When I compare the two Runs
  Then that step reads as a new failure
```

---

## AC-04 — A step failing in both Runs reads as still failing

```gherkin
Scenario: A step that failed in both Runs is not reported as new
  Given a step failed in the previous Run
  And the same step failed again in the Run I am viewing
  When I compare the two Runs
  Then that step reads as still failing
  And it is not counted among the new failures
```

---

## AC-05 — A step that recovered reads as newly fixed

```gherkin
Scenario: A step that failed before and passes now is newly fixed
  Given a step failed in the previous Run
  And the same step passed in the Run I am viewing
  When I compare the two Runs
  Then that step reads as newly fixed
```

---

## AC-06 — The comparison summarises the four counts

```gherkin
Scenario: The comparison leads with a count per outcome
  Given I am comparing a Run against the previous Run of the same Test
  When the comparison is displayed
  Then I see how many steps are new failures, still failing, newly fixed, and unchanged passes
  And the four counts together account for every step that appears in both Runs
```

---

## AC-07 — Blocked and skipped steps are reported, not silently dropped

```gherkin
Scenario: A step that was blocked or skipped in either Run is still accounted for
  Given a step was blocked or skipped in one of the two Runs
  When I compare the two Runs
  Then that step is shown with both of its outcomes stated
  And it is not counted as a new failure or as newly fixed
```

---

## AC-08 — A step present in only one of the two Runs is called out

```gherkin
Scenario: A step that exists in only one Run is reported as added or removed
  Given the Test's chain changed between the two Runs
  And a step appears in only one of them
  When I compare the two Runs
  Then that step is reported as added or removed relative to the other Run
  And it is not classified as a new failure or as newly fixed
```

---

## AC-09 — A Test with no earlier Run says so

```gherkin
Scenario: The first ever Run of a Test has nothing to compare against
  Given a Test has exactly one finished Run
  When I open that Run
  Then the comparison states there is no earlier Run to compare against
  And no empty or zeroed comparison is displayed
```

---

## AC-10 — Only finished Runs take part

```gherkin
Scenario: An in-progress Run is not used as the comparison baseline
  Given the most recent Run of a Test is still in progress
  And an earlier finished Run exists before it
  When I compare the Run I am viewing
  Then the in-progress Run is not used as either side of the comparison
```

---

## AC-11 — An aborted previous Run is compared with its incompleteness stated

```gherkin
Scenario: Comparing against an aborted Run states that the baseline is partial
  Given the previous finished Run of the Test was aborted before every step was executed
  When I compare the Run I am viewing against it
  Then the comparison states that the baseline Run was aborted and did not reach every step
  And steps the aborted Run never reached are not reported as newly fixed
```

---

## AC-12 — Two Runs with identical outcomes read as no change

```gherkin
Scenario: Nothing changed between the two Runs
  Given every step has the same outcome in both Runs
  When I compare them
  Then the comparison states that nothing changed between the two Runs
  And the new-failure and newly-fixed counts are both zero
```

---
_Synced from Jira by sync-jira-issues_
