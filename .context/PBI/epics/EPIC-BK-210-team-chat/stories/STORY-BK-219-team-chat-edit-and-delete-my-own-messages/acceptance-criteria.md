# BK-219 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-219)

```
Scenario: Edit an own message within the edit window
  Given Sara sent "deploy is done, staging is grene" 2 minutes ago
  When she edits the message to "deploy is done, staging is green"
  Then the channel shows the corrected text with an edited indicator
  And other members see the corrected text in real time
```

```
Scenario: The edit window closes after 15 minutes
  Given Sara sent a message 16 minutes ago
  When she opens the actions for that message
  Then the edit action is no longer available
  And a hint explains that messages can be edited for 15 minutes after sending
```

```
Scenario: Deleting an own message leaves a tombstone
  Given Sara sent a message with a wrong link in the "Payments API" channel
  When she deletes that message
  Then the message body is replaced by a tombstone saying the message was deleted
  And the original text is no longer visible to anyone in the channel
```

```
Scenario: Members cannot edit or delete someone else's message
  Given Elena is a member of the workspace with the member role
  When she opens the actions for a message sent by Sara
  Then she sees no edit or delete action for that message
```

```
Scenario: An admin can moderate any message
  Given Mateo has the admin role in the workspace
  And a message with sensitive credentials was posted by mistake
  When Mateo deletes that message
  Then the message is replaced by a tombstone indicating removal by a moderator
  And the author can see it was removed by an admin
```

---
_Synced from Jira by sync-jira-issues_
