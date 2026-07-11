# BK-203 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-203)

```gherkin
Scenario: Add tests to a plan from the test library
  Given the open plan "Release 2.4 regression" has no tests
  And the project's test library contains a test named "Checkout with saved card"
  When Elena opens the add-tests picker, searches "checkout", selects "Checkout with saved card" plus 11 more tests, and confirms
  Then the plan lists all 12 tests and the plan's test count shows 12
```

```gherkin
Scenario: The same test can belong to multiple plans
  Given the test "Login with valid credentials" already belongs to the plan "Smoke pass"
  When Elena adds it to the plan "Release 2.4 regression"
  Then the test is a member of both plans
  And removing it later from one plan leaves it in the other
```

```gherkin
Scenario: A test cannot be added to the same plan twice
  Given the test "Checkout with saved card" is already in the plan "Release 2.4 regression"
  When Elena opens the add-tests picker for that plan
  Then that test is shown as already included and cannot be added again
  And the plan's test count is unchanged
```

```gherkin
Scenario: Remove a test from a plan without touching the test
  Given the plan "Release 2.4 regression" contains the test "Legacy export"
  When Elena removes "Legacy export" from the plan
  Then the plan no longer lists it and the test count decreases by one
  And "Legacy export" still exists unchanged in the project's test library
```

```gherkin
Scenario: Viewer cannot change plan membership
  Given Lucia has the viewer role in the workspace
  When she opens the plan "Release 2.4 regression"
  Then she can see the member tests but the add and remove actions are not available
```

---
_Synced from Jira by sync-jira-issues_
