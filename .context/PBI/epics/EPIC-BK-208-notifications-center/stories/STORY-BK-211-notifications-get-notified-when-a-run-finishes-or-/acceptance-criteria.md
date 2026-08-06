# BK-211 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-211)

```
Scenario: Notified when a run I started finishes as passed
  Given Elena started a run of the test "Login regression chain" on the Staging environment
  And an AI agent executor finishes that run with the final verdict passed
  When Elena opens her notification inbox
  Then she sees an unread notification "Run finished: Login regression chain — passed"
  And clicking it takes her to that run
```

```
Scenario: Notified when a run I started finishes as failed
  Given Elena started a run of the test "Checkout happy path" on the Staging environment
  And her teammate finishes that run with the final verdict failed
  When Elena checks her inbox
  Then she sees a notification showing the failed verdict for "Checkout happy path"
```

```
Scenario: Notified when a run I started is aborted
  Given Elena started a run of the test "Profile settings chain"
  And her teammate aborts that run with the reason "Wrong build deployed"
  When Elena checks her inbox
  Then she sees a notification that the run was aborted including the reason "Wrong build deployed"
```

```
Scenario: Notification arrives in real time while the inbox is visible
  Given Elena has the app open with the notification panel visible
  When an agent finishes a run she started
  Then the new notification appears in the panel in real time without her reloading the page
```

```
Scenario: No self-notification when I finish my own run
  Given Elena started a run of the test "Login regression chain"
  When Elena herself finishes that run with the verdict passed
  Then no notification about that run appears in her inbox
  And her bell badge count does not change
```

---
_Synced from Jira by sync-jira-issues_
