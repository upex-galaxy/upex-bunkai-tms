# BK-218 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-218)

```
Scenario: Pasting a Run reference renders a rich card
  Given a finished Run of the Test "Checkout happy path" exists with the verdict PASS
  When Elena pastes that Run's link into the "Payments API" project channel
  Then the message renders a rich card showing the Test name, the Run's environment, and the verdict PASS
  And clicking the card opens that Run
```

```
Scenario: Sharing an ATC shows its title and workflow status
  Given the ATC "Validate successful login with valid credentials" has the workflow status Ready
  When Sara inserts a reference to that ATC in the channel
  Then the message renders a rich card with the ATC title and its workflow status Ready
  And clicking the card opens the ATC
```

```
Scenario: A rich card respects the reader's permissions
  Given Mateo has no access to the project "Payments API"
  And a rich link to a Test from that project is posted in the workspace general channel
  When Mateo reads the message
  Then he sees a restricted placeholder instead of the Test's title and details
  And clicking it does not reveal the entity
```

```
Scenario: A rich link to a deleted entity degrades gracefully
  Given a rich link to the ATC "Validate successful login with valid credentials" exists in the channel history
  When that ATC is deleted
  Then the card in the old message becomes a placeholder saying the item is no longer available
  And the surrounding message text still renders normally
```

---
_Synced from Jira by sync-jira-issues_
