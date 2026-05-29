# BK-19 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-19)

```gherkin
Scenario: Create an ATC with steps and assertions through the builder
  Given I am building a new ATC anchored to a User Story and one Acceptance Criterion
  When I add two ordered steps and one assertion and save
  Then the ATC is created with its steps and assertion in order
  And it is available to chain into a Test
```

```gherkin
Scenario: An ATC cannot be saved without provenance
  Given I am building an ATC with a title and steps
  When I try to save without anchoring a User Story and an Acceptance Criterion
  Then the ATC is not saved
  And I see a message that an ATC needs a User Story and at least one Acceptance Criterion
```

```gherkin
Scenario: An ATC cannot be saved with no steps
  Given I am building an ATC with a title and provenance but no steps
  When I try to save
  Then the ATC is not saved
  And I see a message that at least one step is required
```

```gherkin
Scenario: A title shorter than the minimum is rejected
  Given I am building an ATC
  When I submit the title "AB"
  Then the ATC is not saved
  And I see a message that the title must be at least 3 characters
```

```gherkin
Scenario: Adding more than the allowed number of tags is prevented
  Given I am building an ATC with 10 tags already added
  When I try to add an 11th tag
  Then the tag is not added
  And I see a message that an ATC can have at most 10 tags
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.124Z_
