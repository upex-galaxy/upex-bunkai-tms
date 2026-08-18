# BK-217 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-217)

```
Scenario: Autocomplete suggests workspace members
  Given Sara is writing a message in the "Bunkai QA" general channel
  When she types "@El"
  Then an autocomplete list appears with the matching member "Elena Vargas"
  And selecting her inserts a highlighted mention into the message
```

```
Scenario: A mentioned member gets a notification in their inbox
  Given Elena is a member of the workspace "Bunkai QA"
  When Sara sends "Hey @Elena Vargas — the checkout fix is deployed, rerun when ready"
  Then Elena receives a notification in her notifications inbox referencing the message
  And opening the notification takes her to that message in the channel
```

```
Scenario: Mentions render highlighted for everyone
  Given a message containing a mention of Elena exists in the channel
  When any member reads the channel
  Then the mention is visually highlighted inside the message
  And it stands out from the surrounding text
```

```
Scenario: A member who left the workspace cannot be mentioned
  Given Mateo left the workspace "Bunkai QA" yesterday
  When Sara types "@Ma" in the composer
  Then Mateo does not appear in the autocomplete list
  And older messages that mention Mateo still render, marked as a former member, without breaking
```

```
Scenario: Mentioning in a project channel only offers members with project access
  Given the project "Payments API" channel is open
  And Mateo has no access to that project
  When Sara types "@" in the composer
  Then the autocomplete offers only members who can access the "Payments API" project
```

---
_Synced from Jira by sync-jira-issues_
