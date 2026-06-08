# BK-86 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-86)

```gherkin
Scenario: Signed-in identity is visible from any screen
  Given Elena is signed in and viewing the projects list
   When she looks at the global chrome
   Then she sees an account affordance showing her name or initials
    And opening it reveals her email and her role in the active workspace
       (for example "elena@bunkai.io — Admin")
```

```gherkin
Scenario: Sign out ends the session and returns to sign-in
  Given Elena has the account menu open
   When she selects "Sign out"
   Then her session ends
    And she lands on the sign-in screen
    And navigating back to a protected screen does not restore the session
```

```gherkin
Scenario: Account menu is keyboard accessible and dismissible
  Given Elena has focused the account affordance
   When she opens the menu with the keyboard and presses Escape
   Then the menu closes
    And focus returns to the account affordance
```

---
_Synced from Jira by sync-jira-issues_
