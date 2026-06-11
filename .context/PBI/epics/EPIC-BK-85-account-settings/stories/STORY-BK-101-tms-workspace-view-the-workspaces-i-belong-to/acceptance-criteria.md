# BK-101 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-101)

## Phase 3 — Refined Acceptance Criteria

### AC 1 (Refined) — Multi-workspace user sees list with roles

```
Scenario: Workspaces section lists all active memberships with roles
  Given Mateo is authenticated
    And he holds an active membership in "Acme QA" with role "admin"
    And he holds an active membership in "Fintech Audit" with role "member"
    And "Fintech Audit" is his currently active workspace
  When he opens the Workspaces section
  Then he sees exactly two workspace entries
    And "Acme QA" displays the label "Admin"
    And "Fintech Audit" displays the label "Member"
    And "Fintech Audit" is visually distinguished as the active workspace
    And "Acme QA" does not carry the active workspace indicator
```

> ***NEEDS PO/DEV CONFIRMATION:*** What API field or client-side mechanism identifies the active workspace? Is it a field in the `GET /api/v1/workspaces` response, a separate endpoint, localStorage, or session cookie?

> ***NEEDS PO/DEV CONFIRMATION:*** Will `GET /api/v1/workspaces` be extended to return the `role` field per workspace, or will a separate endpoint/join be introduced? The current response does not include `role`.

---

### AC 2 (Refined) — Single-workspace user sees their workspace as active

```
Scenario: Single-workspace user sees a clean, unambiguous state
  Given Mateo is authenticated
    And he holds exactly one active membership, in "Acme QA" with role "admin"
    And "Acme QA" is his currently active workspace
  When he opens the Workspaces section
  Then he sees exactly one workspace entry for "Acme QA"
    And "Acme QA" is visually marked as the active workspace
    And the layout renders without broken or empty-looking space
    And no "leave workspace" or "add workspace" controls are visible
```

> ***NEEDS PO/DEV CONFIRMATION:*** Should the role label ("Admin") also be displayed for the single-workspace view, consistent with AC 1? The original AC 2 omits it.

---

### AC 3 (Inferred) — Suspended or invited memberships are excluded

```
Scenario: Workspaces with non-active membership status are not shown
  Given Mateo has an active membership in "Acme QA"
    And he has a suspended membership in "Old Corp"
    And he has an invited (not yet accepted) membership in "Startup Inc"
  When he opens the Workspaces section
  Then he sees only "Acme QA"
    And "Old Corp" does not appear in the list
    And "Startup Inc" does not appear in the list
```

> ***NEEDS PO/DEV CONFIRMATION:*** Should invited memberships be shown with a distinct "Pending" state, or excluded entirely? FR-010 excludes them at the API level, but the UX decision is not documented.

---

### AC 4 (Inferred) — Owner role resolves correctly from owner*user*id

```
Scenario: Workspace owner sees "Owner" role label
  Given Mateo is authenticated
    And he is the owner (owner*user*id == Mateo's user ID) of "Acme QA"
  When he opens the Workspaces section
  Then "Acme QA" displays the role label "Owner"
```

> ***NEEDS PO/DEV CONFIRMATION:*** Confirm that "Owner" is the displayed label for the owner role. Also confirm whether owner status is derived client-side from `owner*user*id` comparison or returned from the API as a role field.

---
_Synced from Jira by sync-jira-issues_
