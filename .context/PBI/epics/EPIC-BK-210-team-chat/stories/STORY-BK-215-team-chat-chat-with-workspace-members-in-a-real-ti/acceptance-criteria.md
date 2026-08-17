# BK-215 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-215)

```
Scenario: A message reaches every member in real time
  Given Elena and Sara are both members of the workspace "Bunkai QA"
  And both have the workspace general channel open
  When Elena sends the message "Is staging down? My run just stalled"
  Then Sara sees the message appear in the channel without refreshing the page
  And the message shows Elena's name and the time it was sent
```

```
Scenario: Message history persists across sessions
  Given the "Bunkai QA" general channel contains 20 messages
  When Elena signs out, signs back in, and opens the channel
  Then she sees the same 20 messages in chronological order
  And the oldest messages load as she scrolls up
```

```
Scenario: The workspace roster is visible from the channel
  Given the workspace "Bunkai QA" has 3 members: Elena, Sara, and Mateo
  When Elena opens the channel roster
  Then she sees all 3 members listed with their workspace role
  And she can tell which members are currently online
```

```
Scenario: A viewer can read but not write
  Given Mateo's account in "Bunkai QA" has the viewer role
  When Mateo opens the workspace general channel
  Then he can read the full message history
  But the composer is disabled with a hint that viewers have read-only access
```

```
Scenario: Reconnecting after a connection drop shows missed messages
  Given Elena has the channel open and her connection drops for 2 minutes
  And Sara sends 3 messages during that gap
  When Elena's connection comes back
  Then the 3 missed messages appear in the channel in the right order
  And Elena does not need to refresh the page to see them
```

---
_Synced from Jira by sync-jira-issues_
