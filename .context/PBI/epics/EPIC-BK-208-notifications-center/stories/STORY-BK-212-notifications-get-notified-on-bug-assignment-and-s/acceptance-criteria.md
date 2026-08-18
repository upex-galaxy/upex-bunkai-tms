# BK-212 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-212)

# Refined Acceptance Criteria — [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212)

```
Scenario: Notify the new assignee when another user assigns a bug
  Given Elena reports the bug "Checkout total rounds incorrectly" with run and test context attached
  When Elena assigns that bug to Sara
  Then Sara sees one unread notification "Bug assigned to you: Checkout total rounds incorrectly"
  And clicking the notification opens the bug detail with attached run and test context visible
```

```
Scenario: Notify only the new assignee when a bug is reassigned
  Given the bug "Checkout total rounds incorrectly" is assigned to Sara
  When Elena reassigns the bug to Mateo
  Then Mateo sees one unread notification "Bug assigned to you: Checkout total rounds incorrectly"
  And Sara receives no removal notification for the reassignment
```

```
Scenario: Notify the reporter when someone else changes bug status
  Given Sara reported the bug "Session expires during long run"
  When Elena moves that bug from "open" to "in progress"
  Then Sara sees one notification that the bug status changed to "in progress"
  And the notification uses the BK-31 bug status vocabulary
```

```
Scenario: Notify the current assignee when someone else changes bug status
  Given the bug "Checkout total rounds incorrectly" is assigned to Sara
  When Elena moves that bug back to "open" after retesting
  Then Sara sees one notification about the status change on her assigned bug
  And clicking it opens the bug with retest/run context available
```

```
Scenario: Suppress self-notification when the assignee changes their own bug status
  Given the bug "Checkout total rounds incorrectly" is assigned to Sara
  When Sara moves the bug to "in progress" herself
  Then no notification about that change appears in Sara's inbox
```

```
Scenario: Suppress self-notification when the reporter changes their own bug status
  Given Sara reported the bug "Session expires during long run"
  When Sara moves the bug to "in progress" herself
  Then no notification about that change appears in Sara's inbox
```

```
Scenario: Do not notify uninvolved teammates
  Given Mateo neither reported nor is assigned to the bug "Checkout total rounds incorrectly"
  When that bug changes status
  Then Mateo receives no notification about it
```

```
Scenario: Dedupe reporter and assignee when they are the same recipient
  Given Sara both reported and is assigned to the bug "Session expires during long run"
  When Elena changes that bug status
  Then Sara receives exactly one notification for that source event
```

```
Scenario: Hide bug notifications when recipient loses access
  Given Sara had access to a bug notification when it was created
  When Sara later loses access to that bug's project or workspace
  Then Sara does not see metadata for that inaccessible bug in her notification inbox
```

---
_Synced from Jira by sync-jira-issues_
