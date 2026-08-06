# BK-205 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-205)

## Refined Acceptance Criteria — https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205 (Shift-Left DRAFT, updated 2026-08-05 — all pending items closed: 7 by inference 2026-07-24, 2 more ratified 2026-08-04 via mockup cross-reference, and C1 resolved 2026-08-05 — BK-206 remains in Backlog and scope.md already defines the release-1 deliverable, so the detail view ships without any attach/readiness UI. See the description's "Three Amigos Session — Decisions" sections for full history.)

```
Feature: TMS-Milestone — Create a milestone with a target date

  # Original AC1 — Create a milestone with a name, target date, and description
  @positive @critical
  Scenario: Should create a milestone and list it with its target date and days-remaining count
    Given Mateo has workspace role "member" (or higher) with access to project "Bunkai Web"
    And today is 2026-07-11
    When he creates a milestone named "Release 2.4", target date 2026-08-15, description "Second summer cut"
    Then the milestone appears in the project's Milestones list with name "Release 2.4", date badge "Aug 15, 2026", "35 days left" counter, and the saved description

  # Original AC2 — Create a milestone without a description
  @positive @high
  Scenario: Should create and list a milestone when description is omitted
    Given Mateo is viewing the Milestones section of project "Bunkai Web"
    When he creates a milestone named "Hotfix window 2.4.1", target date 2026-09-01, no description
    Then the milestone is created and listed with an empty/no-description state, target date, and days-remaining counter

  # Closed 2026-08-05: C1 resolved — scope.md wins over the combined BK-205+BK-206 mockup. BK-206 (attach test
  # plans / readiness aggregation) is still in Backlog; this Story's own release ships the detail view WITHOUT
  # any of that UI. The full mockup (Attach-plans button, readiness card, attached-plans table) is the target
  # once BK-206 also ships, not part of this Story's Definition of Done.
  @positive @high @scope-boundary
  Scenario: Should open a milestone's detail view showing only its own details and an empty plans area
    Given Mateo has an active milestone named "Release 2.4 GA" in project "Bunkai Web"
    And the sibling milestone-readiness story has not shipped yet
    When he opens the milestone's detail view
    Then he sees its name, description, target date, and days-remaining counter
    And the plans area shows an empty state with no Attach-plans control and no readiness card

  # Closed 2026-07-24: follows directly from the already-ratified rule "name required, 1-100 chars" — not a new decision
  @negative @critical
  Scenario: Should reject milestone creation when name is empty
    Given Mateo is viewing the Milestones section
    When he submits the create form with an empty name and a valid future target date
    Then the milestone is not created
    And a required-field message is shown

  # Closed 2026-07-24: trims to empty, same rule as above
  @negative @medium
  Scenario: Should reject milestone creation when name is only whitespace
    Given Mateo is viewing the Milestones section
    When he submits the create form with name "   " (spaces only) and a valid future target date
    Then the milestone is not created, treated identically to an empty name since it trims to empty

  # Closed 2026-07-24: follows directly from the already-ratified rule "target date required"
  @negative @critical
  Scenario: Should reject milestone creation when target date is missing
    Given Mateo is viewing the Milestones section
    When he submits the create form with a valid name and no target date
    Then the milestone is not created
    And a required-field message is shown

  @boundary @medium
  Scenario: Should accept a milestone name at exactly 1 character
    Given Mateo is viewing the Milestones section
    When he creates a milestone with a 1-character name and a valid future target date
    Then the milestone is created and listed

  @boundary @medium
  Scenario: Should accept a milestone name at exactly 100 characters after trim
    Given Mateo is viewing the Milestones section
    When he creates a milestone with a 100-character (post-trim) name and a valid future target date
    Then the milestone is created and listed

  @boundary @medium
  Scenario: Should reject a milestone name at exactly 101 characters after trim
    Given Mateo is viewing the Milestones section
    When he creates a milestone with a 101-character (post-trim) name and a valid future target date
    Then the milestone is not created
    And a max-length message is shown

  # Description length boundary — decided in Three Amigos (2026-07-24): PO set a 500-character cap
  @boundary @medium
  Scenario: Should accept a milestone description at exactly 500 characters
    Given Mateo is viewing the Milestones section
    When he creates a milestone with a valid name, a valid future target date, and a 500-character description
    Then the milestone is created and listed with the full description saved

  @boundary @medium
  Scenario: Should reject a milestone description at exactly 501 characters
    Given Mateo is viewing the Milestones section
    When he creates a milestone with a valid name, a valid future target date, and a 501-character description
    Then the milestone is not created
    And a max-length message is shown

  # Original AC3 — Target date in the past is rejected
  @negative @critical
  Scenario: Should reject a target date well in the past
    Given today is 2026-07-11
    When Mateo tries to create a milestone named "Retro goal" with target date 2026-07-01
    Then the milestone is not created
    And a message states the target date must be today or later

  # Closed 2026-07-24: boundary of the already-answered "today or later" rule, using Backend's DATE + server-UTC decision
  @boundary @high
  Scenario: Should reject a target date exactly one day before today
    Given today is 2026-07-11
    When Mateo tries to create a milestone with target date 2026-07-10
    Then the milestone is not created
    And the same past-date message is shown

  # Closed 2026-07-24: "today or later" is inclusive of today by its own wording — same rule as above
  @boundary @critical
  Scenario: Should accept a target date exactly equal to today
    Given today is 2026-07-11
    When Mateo creates a milestone with target date 2026-07-11
    Then the milestone is created and listed with a "0 days left" (or equivalent "today") counter
    # Exact counter copy ("0 days left" vs "Today") still open for Design — behavior itself is resolved

  # Closed 2026-08-04 (Mockup Cross-Reference refresh): the live mockup's date picker sets only `min` (today),
  # no `max` attribute, and validateMs() never checks an upper bound — ratified as "no upper bound" (cheapest,
  # already-implemented default). DRAFT, pending real PO sign-off.
  @boundary @low
  Scenario: Should accept a target date far in the future with no stated upper bound
    Given today is 2026-07-11
    When Mateo creates a milestone with target date 2036-07-11, ten years out
    Then the milestone is created and listed

  # Original AC4 — Duplicate milestone name in the same project is rejected
  @negative @critical
  Scenario: Should reject a duplicate milestone name differing only by case
    Given a milestone named "Release 2.4" already exists in project "Bunkai Web"
    When Mateo tries to create another milestone named "release 2.4" in the same project
    Then the milestone is not created
    And a duplicate-name message is shown

  # Closed 2026-07-24: Backend's exact index UNIQUE(project_id, lower(trim(name))) trims edges before comparing
  @boundary @high
  Scenario: Should reject a duplicate milestone name differing only by leading or trailing whitespace
    Given a milestone named "Release 2.4" already exists in project "Bunkai Web"
    When Mateo tries to create another milestone named " Release 2.4 " in the same project
    Then the milestone is not created
    And a duplicate-name message is shown, per the "compared after trimming spaces" rule

  # Closed 2026-08-04 (Mockup Cross-Reference refresh): the live mockup's validateMs() only trims edges before
  # comparing (never collapses internal whitespace), matching Backend's already-built index — ratified as
  # "allow as distinct" (cheapest, already-implemented default). DRAFT, pending real PO sign-off.
  @positive @medium
  Scenario: Should accept a name that differs from an existing one only by internal whitespace
    Given a milestone named "Release 2.4" already exists in project "Bunkai Web"
    When Mateo creates another milestone named "Release  2.4" with a double internal space in the same project
    Then the milestone is created, treated as a distinct name since the rule trims but does not collapse internal whitespace

  # Closed 2026-07-24: Backend's index is scoped by project*id first — different project*id can never collide
  @positive @medium
  Scenario: Should allow the same milestone name in two different projects
    Given a milestone named "Release 2.4" already exists in project "Bunkai Web"
    When Mateo creates a milestone named "Release 2.4" in a different project he also has access to
    Then the milestone is created, since uniqueness is scoped per project

  # Original AC5 — Viewer cannot create a milestone
  @negative @critical
  Scenario: Should not expose the create-milestone option to a viewer-role user
    Given Lucia has the "viewer" role in the workspace
    When she opens the Milestones section of the project
    Then the option to create a milestone is not available to her

  # Confirmed in Three Amigos (2026-07-24) — PO: non-negotiable, this is a release gate
  @negative @critical @release-gate
  Scenario: Should reject a milestone-create request sent directly by a viewer-role user, even with the UI option hidden
    Given Lucia has the "viewer" role in the workspace
    When a create-milestone request is sent directly against the API, bypassing the UI, using her session
    Then the request is rejected with 403
    And no milestone is created

  # Confirmed in Three Amigos (2026-07-24) — PO: role-inheritance is sufficient, no further AC expansion needed
  @positive @high
  Scenario Outline: Should allow member, admin, and owner roles to create a milestone
    Given a user has workspace role "<role>"
    When they create a milestone with valid name and target date
    Then the milestone is created and listed

    Examples:
      | role   |
      | member |
      | admin  |
      | owner  |

  # Editing — confirmed in scope by PO in Three Amigos (2026-07-24): business-rules.md already states
  # the target date "may be moved forward or backward while active" — this is a ratified rule, not an inference.
  @positive @high
  Scenario: Should update a milestone's name, description, and target date while it is active
    Given Mateo has workspace role "member" (or higher) and an active milestone named "Hotfix window 2.4.1" in project "Bunkai Web"
    When he edits it to name "Hotfix window 2.4.2", description "Rescheduled", target date 2026-09-08
    Then the milestone reflects the new name, description, and target date
    And its days-remaining counter updates accordingly

  # Backend flagged this explicitly in Three Amigos: uniqueness on edit must exclude the record's own current name
  @boundary @medium
  Scenario: Should allow saving an edited milestone without changing its own name
    Given a milestone named "Release 2.4" exists in project "Bunkai Web"
    When a user with edit rights saves it again with the same name "Release 2.4" but a different description
    Then the save succeeds
    And it is not rejected as a duplicate of itself

  # Editing follows the same role gate as creation, per business-rules.md ("Creating/editing requires member role or higher")
  @negative @critical
  Scenario: Should not allow a viewer-role user to edit a milestone
    Given Lucia has the "viewer" role in the workspace
    When she attempts to edit an existing milestone, whether via the UI or directly against the API
    Then the edit is rejected
    And no change is saved

  @edge @high
  Scenario: Should reject editing a milestone's name into a duplicate of another milestone in the same project
    Given milestones "Release 2.4" and "Hotfix window 2.4.1" both exist in project "Bunkai Web"
    When a user with edit rights renames "Hotfix window 2.4.1" to "release 2.4"
    Then the edit is rejected with the same duplicate-name message used at creation

  @edge @high
  Scenario: Should reject editing a milestone's target date to a date in the past
    Given an active milestone with a future target date
    When a user with edit rights sets its target date to a date before today
    Then the edit is rejected with the same past-date message used at creation

  # Backend decided this is enforced by a DB-level unique constraint on (project_id, lower(trim(name))),
  # making the race structurally impossible rather than relying on app-layer defensive code.
  @edge @high
  Scenario: Should prevent duplicate milestone creation when two requests for the same name arrive concurrently
    Given no milestone named "Release 2.4" exists yet in project "Bunkai Web"
    When two users submit "create milestone named Release 2.4" at nearly the same instant
    Then exactly one creation succeeds
    And the other receives the duplicate-name rejection
    And no duplicate row persists
```

---
_Synced from Jira by sync-jira-issues_
