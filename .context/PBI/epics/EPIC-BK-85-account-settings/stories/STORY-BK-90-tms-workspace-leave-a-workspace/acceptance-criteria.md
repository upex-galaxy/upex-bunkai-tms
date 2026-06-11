# BK-90 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

# BK-90 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

## Scenario 1 — Leaving a workspace asks for confirmation

```gherkin
Scenario: Leaving a workspace asks for confirmation
  Given Mateo Silva belongs to two workspaces — "Fintech Audit" (active)
        and "Acme QA" — and is viewing "Fintech Audit" in the
        Workspaces section
   When he selects "Leave workspace"
   Then a confirmation dialog names "Fintech Audit" explicitly
        before he commits
    And on confirm, his membership row for "Fintech Audit" is removed
        and the workspace disappears from his Workspaces list
    And the active workspace falls back to "Acme QA"
        (his other remaining workspace, selected per the same
        active-workspace resolution rule used elsewhere — see BR-1)
    And the workspace switcher / global chrome now reflects "Acme QA"
        as active
```

## Scenario 2 — A user cannot leave a workspace they solely own

```gherkin
Scenario: A user cannot leave a workspace they solely own
  Given Mateo Silva is a member of "Acme QA" with role "owner"
    And no other "Acme QA" member has role "owner"
   When he views "Acme QA" in the Workspaces section
   Then the "Leave workspace" action is unavailable (disabled or hidden)
    And he sees an explanatory message indicating he is the sole owner
        and must transfer or share ownership before leaving
```

## New Scenario A — Leaving the user's only workspace

```gherkin
Scenario: Leaving the only workspace a user belongs to
  Given Mateo Silva belongs to exactly one workspace, "Fintech Audit"
        (role "member", not sole owner — e.g. another member holds
        role "owner")
   When he selects "Leave workspace" on "Fintech Audit" and confirms
   Then his membership row for "Fintech Audit" is removed
    And he has no remaining workspace memberships
    And he is routed to the onboarding flow (the same entry point a
        brand-new user without any workspace lands on)
```

********NEEDS PO/DEV CONFIRMATION***** — neither original scenario addresses what happens when the workspace being left is the user's ONLY one (Scenario 1's fallback to "Acme QA" presumes a second workspace exists). This scenario proposes routing to **`/onboarding`** (the existing no-workspace landing) as the most consistent behavior with the rest of the app, but needs PO confirmation — an alternative the team may prefer is to ******block*** "leave" when it is the user's last workspace, the same way Scenario 2 blocks sole-owner leaves.

## New Scenario B — No cascading effect on workspace-owned content

```gherkin
Scenario: Leaving a workspace does not affect content the user authored there
  Given Mateo Silva authored several ATCs and user stories within
        "Fintech Audit" before leaving
   When he leaves "Fintech Audit"
   Then those ATCs, user stories, modules, and projects remain
        unchanged and fully intact within "Fintech Audit"
    And Mateo can no longer view or access them (he is no longer a
        member of that workspace)
```

********NEEDS PO/DEV CONFIRMATION***** — neither original scenario states this explicitly. Per the data model, ATCs/user stories/modules/projects are scoped to the workspace directly (not to the membership row), so this should hold true with zero additional implementation. This scenario is included as a ******non-cascade guarantee*** — flagged for confirmation so the team agrees it's worth an explicit regression check rather than something QA assumes and never verifies.

## New Scenario C — A co-owner can leave when other owners remain

```gherkin
Scenario: A co-owner can leave a workspace that has other owners
  Given "Acme QA" has two members with role "owner" — Mateo Silva
        and a second user, Lena Ortiz
   When Mateo views "Acme QA" in the Workspaces section
   Then the "Leave workspace" action IS available to him
    And selecting it follows the same confirmation flow as Scenario 1
    And on confirm, "Acme QA" still has Lena Ortiz as its remaining
        owner with full ownership privileges unchanged
```

********NEEDS PO/DEV CONFIRMATION**** — this is the central open question (see "Open Questions for PO/Dev" in the description). Scenario 2 only describes the SOLE-owner block; it does not say whether the gate is "you are AN owner" (which would also block this case) or "you are the LAST owner" (which would not). This scenario assumes the latter — but if the team intends NO co-owner to ever leave without an explicit ownership-transfer step first, this scenario is invalid and a "transfer ownership" sub-flow becomes new, unscoped work that would materially change the story's size.

---
_Synced from Jira by sync-jira-issues_
