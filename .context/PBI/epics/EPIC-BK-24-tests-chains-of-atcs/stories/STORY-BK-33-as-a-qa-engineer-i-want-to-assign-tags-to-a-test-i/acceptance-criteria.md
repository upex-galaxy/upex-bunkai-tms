# BK-33 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-33)

```gherkin
Scenario: Assign a mix of reserved and custom tags to a Test
  Given a Test named "Checkout - Guest Purchase" currently has no tags
  When I assign the tags "smoke", "regression", and "checkout-v2"
  Then the Test shows the tags "smoke", "regression", and "checkout-v2"
  And "smoke" and "regression" are recognized as reserved suite tags
  And "checkout-v2" is kept as a custom tag
```

```gherkin
Scenario: Filter Tests by a reserved suite tag
  Given "Checkout - Guest Purchase" and "Login - Happy Path" both carry the "smoke" tag
  And "Refunds - Full Flow" carries only the "regression" tag
  When I filter the list of Tests by the "smoke" suite
  Then I see exactly "Checkout - Guest Purchase" and "Login - Happy Path"
  And "Refunds - Full Flow" is not shown
```

```gherkin
Scenario: Replacing the tag set re-groups the Test
  Given "Refunds - Full Flow" currently carries the tags "regression" and "finance"
  When I replace its tags with "smoke" and "finance"
  Then the Test now shows "smoke" and "finance"
  And it no longer shows "regression"
  And it now appears when I filter the list by the "smoke" suite
  And it no longer appears when I filter by the "regression" suite
```

```gherkin
Scenario: Remove all tags from a Test (boundary)
  Given "Login - Happy Path" currently carries the tags "smoke" and "auth"
  When I remove every tag so the Test has none
  Then the Test shows no tags
  And it no longer appears under any tag-based suite filter
  And the Test itself remains intact and runnable
```

```gherkin
Scenario: Adding the same tag twice keeps a single tag
  Given "Checkout - Guest Purchase" already carries the "smoke" tag
  When I assign the tags "smoke", "smoke", and "regression"
  Then the Test shows "smoke" exactly once and "regression" once
  And no duplicate "smoke" tag appears
```

```gherkin
Scenario: Filter by a tag no Test carries
  Given no Test in the project carries the tag "deprecated"
  When I filter the list of Tests by "deprecated"
  Then I see an empty result with a message such as "No Tests carry this tag"
  And no unrelated Tests are shown
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.907Z_
