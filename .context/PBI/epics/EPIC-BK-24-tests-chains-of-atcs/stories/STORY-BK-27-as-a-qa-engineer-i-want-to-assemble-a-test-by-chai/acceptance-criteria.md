# BK-27 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-27)

```gherkin
Scenario: Elena assembles a Test from three ATCs
  Given Elena is signed in to her workspace and has three published ATCs in her library
  When she opens the "New Test" form, enters the title "Add to Cart from Empty State", selects the three ATCs in the order she wants them to run, and clicks "Save"
  Then the Test is created and appears in her Test list with the title she entered
  And opening the Test shows the three ATCs in the exact order she selected them
  And the activity log of her workspace records that she created this Test, with a timestamp
```

```gherkin
Scenario: Saving a Test without any ATC is blocked
  Given Elena is on the "New Test" form with the title "Add to Cart from Empty State" entered but no ATC selected
  When she clicks "Save"
  Then the save is blocked and she sees a clear message "A Test must include at least one ATC"
  And no Test is created in her workspace
```

```gherkin
Scenario: Accidentally clicking Save twice does not create duplicates
  Given Elena has filled in the "New Test" form correctly with the title "Add to Cart from Empty State" and three ATCs selected
  When she clicks "Save" and, because her connection is slow, clicks "Save" again before the form responds
  Then only one Test titled "Add to Cart from Empty State" is created in her workspace
  And Elena sees the new Test exactly once in her Test list, not duplicated
```

```gherkin
Scenario: Elena cannot use ATCs from a workspace she does not belong to
  Given Elena belongs to workspace "Acme QA" but not to workspace "Other Co"
  When she attempts to create a Test that references an ATC owned by "Other Co"
  Then the attempt is rejected with a message that does not reveal whether the foreign ATC exists
  And no Test is created in her workspace
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:49.009Z_
