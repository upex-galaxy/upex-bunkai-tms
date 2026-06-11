# BK-23 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-23)

```
Scenario: Duplicate an ATC with all its steps and assertions
  Given an ATC "Login happy path" with three steps and two assertions
  When I duplicate it
  Then a new ATC is created with the same three steps and two assertions
```

```
Scenario: The copy's title defaults to the source title with "(copy)"
  Given an ATC titled "Login happy path"
  When I duplicate it without typing a title
  Then the new ATC is titled "Login happy path (copy)"
```

```
Scenario: Provide a custom title for the duplicate
  Given an ATC titled "Login happy path"
  When I duplicate it and type the title "Login with remember-me"
  Then the new ATC is titled "Login with remember-me"
```

```
Scenario: Editing the copy does not change the original
  Given I duplicated an ATC
  When I edit a step in the copy
  Then the original ATC's steps are unchanged
```

---
_Synced from Jira by sync-jira-issues_
