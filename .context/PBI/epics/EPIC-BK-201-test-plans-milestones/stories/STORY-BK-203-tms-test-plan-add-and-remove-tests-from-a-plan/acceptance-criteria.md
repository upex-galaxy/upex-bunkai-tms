# BK-203 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-203)

```gherkin
Scenario: Should list all selected tests and update the count after a multi-select add
  Given the Open plan "Release 2.4 regression" has 0 tests
  And the project's test library contains "Checkout with saved card" and 11 other matching tests
  When Elena (member role) opens the add-tests picker, searches "checkout", selects "Checkout with saved card" plus 11 more tests, and confirms
  Then the plan's test table lists all 12 tests with name, tags, and added-by
  And the plan header count reads 12
  And the plans list view also reflects a count of 12 for this plan
```

```gherkin
Scenario: Should add a single test to an empty plan
  Given the Open plan "Smoke pass" has 0 tests
  When Elena selects exactly 1 test ("Login with valid credentials") and confirms
  Then the plan lists 1 test
  And the count reads 1
  And the empty state no longer renders
```

```gherkin
Scenario: Should allow the same test to be a member of two different plans independently
  Given "Login with valid credentials" already belongs to plan "Smoke pass"
  When Elena adds it to plan "Release 2.4 regression"
  Then the test is a member of both plans
  And each plan's own count reflects its own membership independently
```

```gherkin
Scenario: Should leave a shared test in the other plan after removal from one
  Given "Login with valid credentials" is a member of both "Smoke pass" and "Release 2.4 regression"
  When Elena removes it from "Release 2.4 regression"
  Then it no longer appears in "Release 2.4 regression" and that plan's count decreases by one
  And it remains a member of "Smoke pass" with that plan's count unchanged
```

```gherkin
Scenario: Should mark an already-included test in the picker and prevent re-selection
  Given "Checkout with saved card" is already in plan "Release 2.4 regression"
  When Elena opens the add-tests picker for that plan and searches for it
  Then the test is shown with an "already in plan" marker
  And it cannot be selected/checked
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: exact status code + error shape inferred, not stated in the Story
Scenario: Should reject a duplicate add via direct API call bypassing the picker's UI marker
  Given "Checkout with saved card" is already in plan "Release 2.4 regression"
  When a direct API call attempts to add the same (plan, test) pair again
  Then the request is rejected without creating a duplicate row
  And the plan's test count is unchanged
```

```gherkin
Scenario: Should remove a test from the plan without altering the test itself
  Given plan "Release 2.4 regression" contains "Legacy export"
  When Elena removes "Legacy export" from the plan
  Then the plan no longer lists it
  And the count decreases by exactly 1
  And "Legacy export" still exists unchanged (same id, name, tags, content) in the project's test library
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: exact empty-state trigger inferred from business-rules.md design-intent line, not from an AC
Scenario: Should return to the empty state when the last test is removed
  Given plan "Smoke pass" contains exactly 1 test
  When Elena removes that test
  Then the plan's table renders its empty state
  And the count reads 0 with no residual drift
```

```gherkin
Scenario: Should hide add and remove controls for a viewer while still showing member tests
  Given Lucia has the viewer role in the workspace
  When she opens the plan "Release 2.4 regression"
  Then she can see the member tests table
  And the "Add tests" button and each row's Remove action are not rendered
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: inferred from this repo's established defense-in-depth RBAC pattern, not stated in the original AC
Scenario: Should reject a viewer's direct API attempt to add or remove a membership row
  Given Lucia (viewer) has a valid session
  When she issues a direct API call to add or remove a test from a plan in her workspace
  Then the request is rejected server-side, independent of the UI's absent affordance
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: confirm whether Add/Remove controls are hidden entirely on a Closed plan, or rendered-then-rejected on submit
Scenario: Should reject a membership add or remove attempted against a Closed plan
  Given plan "Release 2.4 regression" is Closed
  When a member-role user attempts to add or remove a test (via UI if reachable, and via direct API regardless)
  Then the mutation is rejected server-side
  And no membership row is created or deleted
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: confirm whether cross-project enforcement is picker-scope-only or also server-validated
Scenario: Should reject a Test from a different project when added to a plan
  Given plan "Release 2.4 regression" belongs to Project A
  And a Test "Foo" exists only in Project B
  When a direct API call attempts to add Test "Foo" to the plan
  Then the request is rejected server-side regardless of what the picker's search-result scoping shows
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: idempotency behavior not stated in the Story
Scenario: Should not create a duplicate membership row on a rapid double-submit of the same add-tests selection
  Given Elena has selected 3 tests in the picker and clicks confirm twice in rapid succession
  When both requests reach the server
  Then exactly 3 membership rows exist afterward, not 6
```

```gherkin
# NEEDS PO/DEV CONFIRMATION: exact empty-state copy not stated
Scenario: Should show a distinct empty-results state when the add-tests picker search matches nothing
  Given the add-tests picker is open for a plan
  When Elena searches a term matching no Tests in the project's library
  Then an explicit "no results" state renders, distinct from a loading state
```

---
_Synced from Jira by sync-jira-issues_
