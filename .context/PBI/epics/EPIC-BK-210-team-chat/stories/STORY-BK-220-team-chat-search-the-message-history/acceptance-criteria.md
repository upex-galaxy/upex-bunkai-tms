# BK-220 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-220)

```
Scenario: Find a message by its text
  Given the "Payments API" channel contains a message "descoping the refund Test until the API stabilizes"
  When Mateo searches the chat for "refund Test"
  Then the results list that message with its channel, author, and date
  And a highlighted snippet shows where the match occurred
```

```
Scenario: Filter results by channel, author, and date
  Given Mateo's search for "staging" returns 40 results across 3 channels
  When he filters to the channel "Payments API", the author Elena, and the last 7 days
  Then only messages matching all three filters remain in the results
```

```
Scenario: Jump to a result in its conversation
  Given Mateo found the message "descoping the refund Test until the API stabilizes"
  When he selects that result
  Then the "Payments API" channel opens scrolled to that message
  And the message is briefly highlighted so he can spot it
```

```
Scenario: Search never returns channels the member cannot access
  Given Mateo has no access to the project "Mobile App"
  And its channel contains messages matching "staging"
  When Mateo searches for "staging"
  Then no results from the "Mobile App" channel appear
  And nothing indicates that hidden matches exist
```

```
Scenario: A search with no matches shows a helpful empty state
  Given no message in Mateo's accessible channels contains "chaos monkey"
  When he searches for "chaos monkey"
  Then he sees an empty state explaining no messages matched
  And a suggestion to adjust the terms or filters
```

---
_Synced from Jira by sync-jira-issues_
