# BK-371 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

## Defect Sync — destination configuration

Slice a of the BK-43 split (ruling 12170). No ATP outline from the BK-43 draft covers this slice — every one of the thirteen BK-43 outlines exercises sync behaviour, which this story deliberately does not ship. The outlines below are new and specific to the configuration surface.

### Coverage estimate

- Positive: 3 outlines
- Negative / Error: 3 outlines
- Boundary: 1 outline
- Total: 7 outlines

### Outlines

#### TDA01 — Destination saved and enabled

Given an administrator on a Project with no tracker configuration
When a valid destination project key is entered and the sync is switched on
Then the Project reports the destination and an enabled sync.

#### TDA02 — Connection check reports reachable

Given a destination project key that exists and is reachable with the deployment credential
When the connection check runs
Then it reports success.

#### TDA03 — Connection check reports the reason it failed

Given a destination project key that cannot be reached
When the connection check runs
Then it reports failure
And it shows the reason.

#### TDA04 — Malformed key refused

Given an administrator editing the tracker settings
When a destination project key that is not a well-formed Jira project key is submitted
Then the save is rejected with a validation message
And the previous setting is unchanged.

#### TDA05 — Non-administrator cannot write

Given a workspace member without administrator rights
When they attempt to change a Project's destination or enabled state
Then the change is refused
And the read view still shows the current values.

#### TDA06 — Enabling re-queues stranded defects

Given a Project with defects that carry no external reference
When the sync is switched on
Then those defects are queued for another send attempt
And their recorded failure reason is cleared.

#### TDA07 — Changing the destination replaces it

Given a Project already pointed at a destination
When a different destination project key is saved
Then only the new destination is in effect.

---
_Synced from Jira by sync-jira-issues_
