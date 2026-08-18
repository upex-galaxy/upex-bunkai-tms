# BK-216 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-216)

```
Scenario: Each project has its own channel
  Given the workspace "Bunkai QA" contains the projects "Payments API" and "Mobile App"
  When Elena opens the project "Payments API"
  Then she can open the "Payments API" project channel from the chat panel
  And messages sent there do not appear in the "Mobile App" channel or the workspace general channel
```

```
Scenario: Channel membership follows project access
  Given Sara has access to the project "Payments API"
  And Mateo does not have access to that project
  When each of them opens the chat panel
  Then Sara sees the "Payments API" channel in her channel list
  And Mateo does not see the "Payments API" channel at all
```

```
Scenario: Switching projects switches the chat context
  Given Elena has the "Payments API" project channel open in the chat panel
  When she switches to the project "Mobile App"
  Then the chat panel switches to the "Mobile App" project channel
  And she can jump back to the workspace general channel at any time
```

```
Scenario: Losing project access removes the channel and its history
  Given Sara can read the "Payments API" project channel history
  When an admin removes Sara's access to the "Payments API" project
  Then the "Payments API" channel disappears from Sara's channel list
  And she can no longer read its message history
```

---
_Synced from Jira by sync-jira-issues_
