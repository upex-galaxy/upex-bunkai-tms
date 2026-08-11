# BK-371 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

```gherkin
Scenario: AC-1 — Point a project at a Jira destination
  Given Mateo is an administrator of the workspace
  And he opens the tracker settings of a Project
  When he enters a destination Jira project key and switches the sync on
  Then the destination and the enabled state are saved for that Project
  And the Project reports its defect sync as enabled
```

```gherkin
Scenario: AC-2 — Connection check against the destination
  Given Mateo has entered a destination Jira project key
  When he runs the connection check
  Then Bunkai reports whether that destination can be reached
  And when it cannot, the reported reason is shown to him
```

```gherkin
Scenario: AC-3 — A malformed destination key is refused
  Given Mateo is editing the tracker settings of a Project
  When he enters a destination project key that is not a well-formed Jira project key
  Then the setting is not saved
  And he is told the key is not valid
```

```gherkin
Scenario: AC-4 — Only administrators redirect where defects flow
  Given Elena is a member of the workspace without administrator rights
  When she opens the tracker settings of a Project
  Then she can read the current destination and enabled state
  And she cannot change either of them
```

```gherkin
Scenario: AC-5 — Fixing the connection re-queues the defects that never left
  Given a Project holds defects that were never sent to Jira
  When an administrator switches the sync on, or changes the destination project key
  Then those defects are queued to be sent again
  And any failure reason recorded against them is cleared
```

```gherkin
Scenario: AC-6 — A project starts with no destination
  Given a Project whose tracker settings have never been configured
  Then its defect sync is off
  And it carries no destination Jira project key
```

```gherkin
Scenario: AC-7 — One destination per project
  Given a Project already pointed at a destination Jira project
  When an administrator saves a different destination project key
  Then the Project points at the new destination only
  And the previous destination is replaced, not kept alongside it
```

---
_Synced from Jira by sync-jira-issues_
