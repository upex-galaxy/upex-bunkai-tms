# BK-32 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-32)

```
Scenario: Open a populated Test and see every ATC expanded in chain order
  Given a Test named "Checkout - Guest Purchase" chains 3 ATCs in order: "Add item to cart", "Enter shipping address", "Complete payment"
  And "Add item to cart" has 2 steps and 1 assertion
  When I open the Test
  Then I see the 3 ATCs expanded inline in the order 1. "Add item to cart", 2. "Enter shipping address", 3. "Complete payment"
  And under "Add item to cart" I see its 2 steps followed by its 1 assertion
  And a summary at the top reads "3 ATCs"
```

```
Scenario: The expanded view is read-only
  Given I have opened the Test "Checkout - Guest Purchase" in the expanded view
  When I look for a way to change a step, add an assertion, or move an ATC up or down
  Then no edit, add, remove, or reorder control is available anywhere in the view
  And every ATC, step, and assertion is presented as read-only text
```

```
Scenario: Empty-state Test with no ATCs yet
  Given a Test named "Refunds - Smoke" has been created but no ATCs have been chained into it
  When I open the Test
  Then I see an empty-state message such as "This Test has no ATCs yet — add ATCs to define what it validates"
  And the summary at the top reads "0 ATCs"
  And no step or assertion sections are shown
```

```
Scenario: Ordering guarantee holds for a longer chain
  Given a Test named "Onboarding - Full Flow" chains 5 ATCs whose running order is positions 1 through 5
  When I open the Test
  Then the 5 ATCs appear top-to-bottom in positions 1, 2, 3, 4, 5 with no gaps and no repeated position
  And the displayed position of each ATC matches the sequence it will execute in
```

```
Scenario: Expanded view shows the latest saved version of a shared ATC
  Given the ATC "Enter shipping address" was edited to have 4 steps instead of 3
  And that ATC is chained inside the Test "Checkout - Guest Purchase"
  When I open the Test in the expanded view
  Then "Enter shipping address" shows its current 4 steps
  And no stale or pre-edit version of the steps is shown
```

```
Scenario: Try to open a Test that no longer exists
  Given a Test I bookmarked was deleted by a teammate
  When I open the bookmarked Test
  Then I see a message telling me the Test could not be found
  And I am offered a way back to the list of Tests
  And no expanded ATC content is shown
```

---
_Synced from Jira by sync-jira-issues_
