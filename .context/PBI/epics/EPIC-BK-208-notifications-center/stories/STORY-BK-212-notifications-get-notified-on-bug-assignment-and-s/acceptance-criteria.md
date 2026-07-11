# BK-212 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-212)

```gherkin
Scenario: Notified when a bug is assigned to me
  Given Elena files the bug "Checkout total rounds incorrectly" from a failing run
  When Elena assigns that bug to Sara
  Then Sara sees an unread notification "Bug assigned to you: Checkout total rounds incorrectly"
  And clicking it takes her to that bug with its run context
```

```gherkin
Scenario: Notified when a bug I reported changes status
  Given Sara reported the bug "Session expires during long run"
  When a teammate moves that bug from open to in progress
  Then Sara sees a notification that the bug status changed to in progress
```

```gherkin
Scenario: Notified when a bug assigned to me changes status
  Given the bug "Checkout total rounds incorrectly" is assigned to Sara
  When Elena moves that bug back to open after retesting
  Then Sara sees a notification about the status change on her assigned bug
```

```gherkin
Scenario: No self-notification for my own bug updates
  Given the bug "Checkout total rounds incorrectly" is assigned to Sara
  When Sara herself moves the bug to in progress
  Then no notification about that change appears in Sara's inbox
```

```gherkin
Scenario: Uninvolved teammates are not notified
  Given Mateo neither reported nor is assigned to the bug "Checkout total rounds incorrectly"
  When that bug changes status
  Then Mateo receives no notification about it
```

---
_Synced from Jira by sync-jira-issues_
