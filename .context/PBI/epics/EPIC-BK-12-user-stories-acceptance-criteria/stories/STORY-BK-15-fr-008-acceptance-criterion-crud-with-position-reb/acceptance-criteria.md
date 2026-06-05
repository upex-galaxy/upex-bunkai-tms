# BK-15 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-15)

```
Scenario: Add an Acceptance Criterion to a User Story
  Given a User Story "Refund a paid order" with no criteria yet
  When I add an Acceptance Criterion titled "Full refund within 30 days"
  Then it appears as the first criterion under the Story
```

```
Scenario: Inserting a criterion preserves the order of the others
  Given a Story with criteria ordered "A", "B", "C"
  When I insert "X" between "A" and "B"
  Then the order reads "A", "X", "B", "C"
```

```
Scenario: Reordering re-numbers the criteria with no gaps
  Given a Story with criteria ordered "A", "B", "C"
  When I move "C" to the top
  Then the order reads "C", "A", "B"
  And the criteria are numbered consecutively with no gaps
```

```
Scenario: A Story with no Acceptance Criteria cannot be marked ready to test
  Given a User Story with zero Acceptance Criteria
  When I try to mark it "ready to test"
  Then the change is blocked
  And I see a message that at least one Acceptance Criterion is required
```

```
Scenario: A criterion title shorter than the minimum is rejected
  Given I am adding an Acceptance Criterion
  When I submit the title "OK"
  Then it is not added
  And I see a message that the title must be at least 3 characters
```

```
Scenario: Removing the last criterion blocks ready-to-test again
  Given a Story marked ready to test with exactly one Acceptance Criterion
  When I remove that criterion
  Then the Story can no longer stay ready to test
  And I am told it needs at least one Acceptance Criterion
```

---
_Synced from Jira by sync-jira-issues_
