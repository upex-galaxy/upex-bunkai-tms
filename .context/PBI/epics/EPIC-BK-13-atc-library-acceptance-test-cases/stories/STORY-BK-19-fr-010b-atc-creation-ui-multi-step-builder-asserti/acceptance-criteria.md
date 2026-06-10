# BK-19 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-19)

```
Scenario: Create an ATC with steps and assertions through the builder
  Given I am building a new ATC anchored to a User Story and one Acceptance Criterion
  When I add two ordered steps and one assertion and save
  Then the ATC is created with its steps and assertion in order
  And it is available to chain into a Test
```

```
Scenario: An ATC cannot be saved without provenance
  Given I am building an ATC with a title and steps
  When I try to save without anchoring a User Story and an Acceptance Criterion
  Then the ATC is not saved
  And I see a message that an ATC needs a User Story and at least one Acceptance Criterion
```

```
Scenario: An ATC cannot be saved with no steps
  Given I am building an ATC with a title and provenance but no steps
  When I try to save
  Then the ATC is not saved
  And I see a message that at least one step is required
```

```
Scenario: A title shorter than the minimum is rejected
  Given I am building an ATC
  When I submit the title "AB"
  Then the ATC is not saved
  And I see a message that the title must be at least 3 characters
```

```
Scenario: Adding more than the allowed number of tags is prevented
  Given I am building an ATC with 10 tags already added
  When I try to add an 11th tag
  Then the tag is not added
  And I see a message that an ATC can have at most 10 tags
```

## Scenario (design fidelity): Steps & Assertions code-authoring with format guidance

Given the ATC editor (new or existing ATC)
When I view the Steps and Assertions fields
Then each is a code editor — Steps as a markdown numbered list, Assertions as a YAML bullet list — with a live preview that renders what I type
And each field shows an inline format hint with a real example (e.g. "01. Open the page" for steps, "- status == 200" for assertions)
And this code-authoring approach is the ratified design per master-design-plan §5 D3 (the mockup's structured rows are intentionally NOT used)

---
_Synced from Jira by sync-jira-issues_
