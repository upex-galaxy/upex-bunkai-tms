# BK-213 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-213)

```
Scenario: View my notification preferences in the Settings hub
  Given Elena opens the Settings hub and selects the Notifications section
  When the preferences view loads
  Then she sees a grid of event types (run lifecycle, bug lifecycle, mentions) against channels (in-app, email)
  And run lifecycle and bug lifecycle show their current values with both channels on by default
```

```
Scenario: Turn off in-app notifications for run lifecycle
  Given Elena has in-app notifications enabled for run lifecycle
  When she turns off the in-app toggle for run lifecycle
  And an agent later finishes a run she started
  Then no new run notification appears in her inbox
  And her bell badge count does not change
```

```
Scenario: Turn off the email channel for bug lifecycle
  Given Elena has the email channel enabled for bug lifecycle
  When she turns off the email toggle for bug lifecycle
  Then future email digests exclude bug lifecycle items
  And her in-app bug notifications keep arriving unchanged
```

```
Scenario: Preferences persist across sessions
  Given Elena turned off in-app run lifecycle notifications
  When she signs out and signs back in
  Then the Notifications section still shows in-app run lifecycle off
  And run events still do not reach her inbox
```

```
Scenario: Mentions event type is visible but locked
  Given Elena is viewing the notification preferences grid
  When she looks at the mentions row
  Then it is marked as coming soon and its toggles cannot be changed
```

---
_Synced from Jira by sync-jira-issues_
