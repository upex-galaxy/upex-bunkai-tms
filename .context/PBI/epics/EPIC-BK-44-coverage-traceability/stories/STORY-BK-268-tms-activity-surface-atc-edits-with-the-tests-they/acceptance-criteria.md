# BK-268 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

```gherkin
Scenario: An ATC edited through the app's own editor appears in the activity feed
  Given I am signed in to a workspace
  And an ATC exists in one of my projects
  When a teammate edits that ATC using the ATC editor in the app
  And I open the workspace activity feed
  Then I see an entry reporting that the ATC was edited
```

```gherkin
Scenario: An ATC edited through the API appears in the activity feed
  Given I am signed in to a workspace
  And an ATC exists in one of my projects
  When a teammate or an integration edits that ATC through the product's API instead of the in-app editor
  And I open the workspace activity feed
  Then I see an entry reporting that the ATC was edited
```

```gherkin
Scenario: The activity entry names the actor who made the edit
  Given an ATC was just edited by a named teammate
  When I open the workspace activity feed
  Then the corresponding entry identifies that teammate as the one who made the edit
```

```gherkin
Scenario: The activity entry names the ATC that was edited
  Given an ATC titled "Login with valid credentials" was just edited
  When I open the workspace activity feed
  Then the corresponding entry identifies "Login with valid credentials" as the ATC that changed
```

```gherkin
Scenario: The activity entry conveys which Tests the edit affects
  Given an ATC is chained into two Tests, "Smoke Suite" and "Regression Suite"
  When that ATC is edited
  And I open the workspace activity feed
  Then the corresponding entry conveys that "Smoke Suite" and "Regression Suite" are affected by the edit
```

```gherkin
Scenario: An ATC edit that affects no Tests still appears in the feed
  Given an ATC exists that is not chained into any Test
  When that ATC is edited
  And I open the workspace activity feed
  Then I see an entry reporting the edit
  And the entry renders sensibly instead of appearing broken or blank when there are no affected Tests
```

```gherkin
Scenario: Creating an ATC still produces exactly one creation entry, never duplicated by an edit entry
  Given I create a new ATC
  When I open the workspace activity feed immediately after
  Then I see exactly one entry reporting that the ATC was created
  And I do not see an additional entry reporting that the same ATC was edited
```

```gherkin
Scenario: An edit in one workspace never appears in another workspace's feed
  Given I am a member of Workspace A only
  And an ATC in Workspace B is edited
  When I open the activity feed for Workspace A
  Then I do not see any entry about the edit made in Workspace B
```

```gherkin
Scenario: A caller-specified event filter that excludes ATC edits keeps them out of the returned feed
  Given an ATC was recently edited in my workspace
  When a caller requests the activity feed with an explicit list of event types that does not include ATC edits
  Then the returned feed does not include the ATC edit entry
  And entries for the event types the caller did request are still returned
```

```gherkin
Scenario: Repeated edits to the same ATC each produce their own feed entry
  Given an ATC exists in my workspace
  When it is edited twice in a row, once through the app editor and once through the API
  And I open the workspace activity feed
  Then I see two separate entries, one for each edit, each with its own actor and timestamp
```

---
_Synced from Jira by sync-jira-issues_
