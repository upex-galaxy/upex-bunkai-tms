# BK-14 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-14)

```
Scenario: Create a User Story under a Module
  Given I am viewing a Module named "Payment"
  When I create a User Story titled "Refund a paid order" with a Markdown description
  Then the Story appears in the Payment Module's Story list
  And it shows the description I wrote
```

```
Scenario: A title shorter than the minimum is rejected
  Given I am creating a new User Story
  When I submit the title "Re"
  Then the Story is not created
  And I see a message that the title must be at least 3 characters
```

```
Scenario: Link a User Story to an upstream Jira issue
  Given I am creating a User Story
  When I add the related Jira key "BK-42"
  Then the Story is saved with a visible link to "BK-42"
  And a later re-import of "BK-42" updates this Story instead of creating a duplicate
```

```
Scenario: A malformed Jira key is rejected
  Given I am creating a User Story
  When I add the related Jira key "not a key"
  Then the Story is not saved
  And I see a message that the key must read as LETTERS-NUMBER, e.g. BK-42
```

```
Scenario: The same Jira key cannot be linked to two Stories in a Project
  Given a User Story in this Project is already linked to "BK-42"
  When I try to link a second Story to "BK-42"
  Then the second link is rejected
  And I see a message that this Jira issue is already linked in the Project
```

```
Scenario: Removing a User Story archives it
  Given a User Story "Refund a paid order" exists
  When I remove it
  Then it no longer appears in the Module's default Story list
  And it is retained as archived rather than destroyed
```

---
_Synced from Jira by sync-jira-issues_
