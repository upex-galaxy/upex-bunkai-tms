# BK-214 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-214)

```
Scenario: Daily digest of unread notifications grouped by project
  Given Mateo has 5 unread notifications in the project "Bunkai Web" and 2 in the project "Mobile App"
  When the daily digest is sent
  Then Mateo receives one email summarizing 7 unread notifications
  And the items are grouped under "Bunkai Web" and "Mobile App" headings with per-project counts
```

```
Scenario: No email when there is nothing unread
  Given Mateo has zero unread notifications when the daily digest time arrives
  When the digest cycle runs
  Then no digest email is sent to Mateo
```

```
Scenario: Digest respects my channel preferences
  Given Mateo turned the email channel off for run lifecycle events
  And he has 3 unread run notifications and 1 unread bug notification
  When the daily digest is sent
  Then the email contains only the bug notification
  And the run items stay unread in his in-app inbox
```

```
Scenario: One click from the email into the inbox
  Given Mateo received a digest email
  When he clicks the open-inbox action in the email
  Then he lands in his Bunkai notification inbox
  And the summarized items are still there, still marked unread
```

```
Scenario: Items read before the digest are excluded
  Given Mateo had 4 unread notifications this morning
  And he read all 4 in the app before the digest time
  When the digest cycle runs
  Then no digest email is sent to Mateo
```

---
_Synced from Jira by sync-jira-issues_
