# BK-209 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-209)

```gherkin
Scenario: Open the inbox from the bell
  Given Elena has 3 unread notifications in the workspace "UPEX Galaxy"
  When she looks at the top bar
  Then the bell shows an unread badge with the count 3
  And clicking the bell opens the notification panel listing her notifications newest-first
  And unread items are visually distinct from read items
```

```gherkin
Scenario: Mark a single notification as read
  Given Elena's inbox shows an unread notification "Run finished: Login regression chain — passed"
  When she marks that notification as read
  Then the item switches to the read style
  And the bell badge count decreases by 1
```

```gherkin
Scenario: Mark all notifications as read
  Given Elena has 12 unread notifications
  When she uses the mark-all-as-read control in the panel header
  Then every item switches to the read style
  And the bell badge disappears
```

```gherkin
Scenario: A notification deep-links to its entity
  Given Elena has a notification about the run of the test "Login regression chain"
  When she clicks the notification
  Then she lands on that run
  And the notification is marked as read
```

```gherkin
Scenario: Notification for an entity that no longer exists
  Given Elena has a notification about a test that was deleted after the notification was created
  When she clicks the notification
  Then she stays in the inbox and sees a message that the item is no longer available
  And the notification is marked as read instead of navigating to a broken page
```

---
_Synced from Jira by sync-jira-issues_
