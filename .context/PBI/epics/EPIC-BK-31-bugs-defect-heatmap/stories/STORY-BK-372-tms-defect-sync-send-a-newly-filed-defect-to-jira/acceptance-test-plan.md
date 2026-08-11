# BK-372 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

## Defect Sync — sending a newly filed defect

Slice b of the BK-43 split (ruling 12170). Carries BK-43 ATP outlines TDS01, TDS02, TDS05, TDS06, TDS07, TDS12, TDS13 and TDS14, amended where the rulings changed them.

### Coverage estimate

- Positive: 4 outlines
- Negative / Error: 2 outlines
- Boundary: 2 outlines
- Total: 8 outlines

### Outlines

#### TDS01 — New defect auto-syncs

Given a Project with the defect sync enabled
When a defect is filed in Bunkai
Then it is sent to that Project's Jira destination.

#### TDS02 — Fire-and-forget on network failure

Given Jira is unreachable
When a defect is filed
Then the defect is created in Bunkai
And the failure is recorded against it rather than surfaced as a filing error.

#### TDS05 — One-way: no reverse sync

Given a defect has been sent
When the Jira issue is updated
Then nothing changes in Bunkai.

#### TDS06 — Project without the sync enabled

Given a Project whose defect sync is not enabled
When a defect is filed
Then no send is attempted
And the defect carries no sync state.

**Amended from the BK-43 draft, which said "workspace". The setting is Project-scoped, per ruling 12177 finding 3.**

#### TDS07 — Duplicate prevention

Given a defect that already carries a Jira reference
When a send is attempted again
Then no second Jira issue is created.

#### TDS12 — Field mapping accuracy

Given a defect with a severity and a Module
When it is sent
Then severity maps to the Jira priority on the P1-to-Highest ladder
And the Module's full path appears in the issue body
And no evidence attachment is sent.

**Amended from the BK-43 draft, which expected the module to map to a Jira component and evidence to attachments. Ruling 12170 decided against both.**

#### TDS13 — Project isolation

Given defects in two Projects pointed at different Jira destinations
When each is sent
Then each lands in its own Project's destination and never the other's.

#### TDS14 — Synced defect carries the link back to Bunkai

Given a defect sent successfully
Then the Jira issue contains a link back to that defect in Bunkai.

---
_Synced from Jira by sync-jira-issues_
