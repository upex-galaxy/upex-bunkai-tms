# BK-209 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-209)

## Refined Acceptance Criteria in Gherkin

### Original AC1 - Open the inbox from the bell

```
Scenario: Show unread badge and open the notification panel for the active workspace
  Given Elena is signed in and her active workspace is "UPEX Galaxy"
  And Elena has 3 unread notifications and 2 read notifications visible in that workspace
  When Elena views the application shell
  Then the notification entry point shows an unread badge with count "3"
  When Elena opens the notification entry point
  Then the notification panel opens
  And it lists only Elena's visible notifications for "UPEX Galaxy" newest-first
  And unread rows are visually distinct from read rows
  And notifications are grouped by day as Today, Yesterday, then calendar dates
```

```
Scenario: Keep notification inbox scoped to the active workspace - NEEDS PO/DEV CONFIRMATION
  Given Elena belongs to workspaces "UPEX Galaxy" and "Bunkai Labs"
  And each workspace has unread notifications for Elena
  When Elena's active workspace is "UPEX Galaxy"
  Then the badge and panel count only notifications visible in "UPEX Galaxy"
  When Elena switches to "Bunkai Labs"
  Then the badge and panel refresh to notifications visible in "Bunkai Labs"
```

```
Scenario: Show empty state when the inbox has no notifications
  Given Elena is signed in to workspace "UPEX Galaxy"
  And Elena has no visible notifications in that workspace
  When Elena opens the notification panel
  Then the panel shows the approved empty-state illustration and copy
  And no unread badge is shown
  And mark-all-as-read is hidden or disabled
```

### Original AC2 - Mark a single notification as read

```
Scenario: Mark one unread notification as read
  Given Elena's inbox shows an unread notification "Run finished: Login regression chain - passed"
  And the unread badge count is "3"
  When Elena marks that notification as read
  Then the notification switches to the read style
  And the unread badge count decreases to "2"
  And other unread notifications remain unread
```

```
Scenario: Keep read state personal per recipient
  Given Elena and Mateo can both access workspace "UPEX Galaxy"
  And both received separate copies of the same run notification
  When Elena marks her notification as read
  Then Elena's copy is read
  And Mateo's copy remains unread
```

### Original AC3 - Mark all notifications as read

```
Scenario: Mark all visible notifications as read
  Given Elena has 12 unread notifications visible in workspace "UPEX Galaxy"
  When Elena uses the mark-all-as-read control in the panel header
  Then every visible notification switches to the read style
  And the unread badge disappears
```

```
Scenario: Mark-all affects only the active workspace - NEEDS PO/DEV CONFIRMATION
  Given Elena has unread notifications in workspaces "UPEX Galaxy" and "Bunkai Labs"
  And Elena's active workspace is "UPEX Galaxy"
  When Elena uses mark-all-as-read
  Then all visible notifications in "UPEX Galaxy" are read
  And notifications in "Bunkai Labs" remain unchanged
```

### Original AC4 - A notification deep-links to its entity

```
Scenario: Deep-link to an accessible run and mark the notification as read
  Given Elena has an unread notification about the run of test "Login regression chain"
  And Elena still has access to that run's workspace and project
  When Elena clicks the notification row
  Then Elena lands on the run detail page
  And the notification is marked as read
  And the badge count decreases by 1
```

```
Scenario: Prevent deep-link navigation to an entity Elena can no longer access
  Given Elena has a notification about a run she could previously access
  And Elena later loses access to that run's workspace or project
  When Elena opens the notification inbox
  Then the notification is hidden from the panel
  And the badge count excludes that notification
```

### Original AC5 - Notification for an entity that no longer exists

```
Scenario: Deleted target stays in inbox with graceful fallback
  Given Elena has an unread notification about a test that was deleted after notification creation
  When Elena clicks the notification
  Then Elena stays in the notification inbox
  And she sees an approved message that the item is no longer available
  And the notification is marked as read
  And no broken route is opened
```

### New business-rule scenarios - NEEDS PO/DEV CONFIRMATION where inferred

```
Scenario: Do not notify a user about their own action
  Given Elena starts or finishes a run in workspace "UPEX Galaxy"
  When notification generation for that event is processed by a sibling story
  Then Elena does not receive a notification copy for her own action
```

```
Scenario: Display unread badge boundary values
  Given Elena has unread notifications in the active workspace
  When the unread count is 0
  Then no badge is shown
  When the unread count is 99
  Then the badge shows "99"
  When the unread count is 100 or more
  Then the badge shows "99+"
```

```
Scenario: Exclude notifications outside the 90-day retention window
  Given Elena has notifications created 89, 90, and 91 days ago
  When the retention purge or visibility filter is applied
  Then notifications older than 90 days are not visible
  And retained notifications keep their existing read/unread state
```

---

---
_Synced from Jira by sync-jira-issues_
