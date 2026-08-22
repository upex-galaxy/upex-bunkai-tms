# BK-90 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

> ***INFO:*** Reconciled 2026-08-05 — merges the 2026-06-10 shift-left baseline, the 2026-07-31 PO/Dev ratification, and the 2026-07-31 mockup correction (`settings-workspaces.png`, attachment 10199). This replaces the pre-ratification draft that was previously in this field.

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

Confirm-dialog mechanism (simple confirm/cancel naming the workspace, vs. type-to-confirm) remains an ***open question*** — see the note at the end of this document. Wording above is mechanism-agnostic on purpose.

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

Confirmed by mockup: the "Bunkai Interno" row shows a "sole owner" badge and a locked "Can't leave" state with copy "You're its only owner. Ownership transfer isn't available yet." Ownership-transfer sub-flow is explicitly out of scope for this story.

## New Scenario A — Leaving the user's only workspace

```gherkin
Scenario: Leaving the only workspace a user belongs to
  Given Mateo Silva belongs to exactly one workspace, "Fintech Audit"
        (role "member", not sole owner)
   When he views "Fintech Audit" in the Workspaces section
   Then the "Leave workspace" action is unavailable (does not render),
        the same treatment as the sole-owner block in Scenario 2
    And no confirmation dialog is reachable for this workspace
```

> ***NOTE:**** ****CORRECTED 2026-08-05 — supersedes the 2026-07-31 PO ratification.**** The earlier answer said route to `/onboarding`. The shipped mockup's "state:single-workspace" panel explicitly contradicts this: **"The Leave action doesn't render — leaving your only workspace would strand the account."* Per the mockup-precedence policy agreed on 2026-07-31, treat this as a BLOCK, structurally identical to Scenario 2.

## New Scenario B — No cascading effect on workspace-owned content, PAT included

```gherkin
Scenario: Leaving a workspace does not affect content or tokens left behind
  Given Mateo Silva authored several ATCs and user stories within
        "Fintech Audit" before leaving
    And Mateo holds a workspace-scoped Personal Access Token for
        "Fintech Audit"
   When he leaves "Fintech Audit"
   Then those ATCs, user stories, modules, and projects remain
        unchanged and fully intact within "Fintech Audit"
    And Mateo can no longer view or access them (he is no longer a
        member of that workspace)
    And the "Fintech Audit"-scoped PAT is auto-revoked as part of the
        same leave transaction
```

Ratified 2026-07-31, confirmed unaffected by the mockup. PAT auto-revocation folded in as an explicit clause per Dev's answer.

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

Ratified 2026-07-31: gate is count-based ("last remaining owner"), not identity-based ("any owner"). Confirmed unaffected by the mockup — the "sole owner" badge implies a non-sole-owner state exists, consistent with this gate.

## Remaining open question

> ***WARNING:**** ****Confirm-dialog mechanism*** (simple confirm/cancel vs. type-to-confirm) — no design-authoritative answer exists yet. The 2026-06-10 role-play answer is unconfirmed. Needs a direct Design/Dev answer before Scenario 1 can be test-scripted at the interaction level.

---
_Synced from Jira by sync-jira-issues_
