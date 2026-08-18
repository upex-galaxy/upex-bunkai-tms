# BK-268 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

- An ATC edit is a first-class activity event: it must be visible in the workspace activity feed on the same terms as ATC creation, Test creation, Run completion, and the other event kinds the feed already tracks.
- Visibility of an ATC edit in the feed does not depend on which surface produced the edit. A QA Engineer using the in-app editor and an integration calling the API are equally "editing the ATC" from the feed's point of view, and both must be equally visible.
- The feed's default set of visible event types is the only thing this story widens. A caller who explicitly asks the feed for a narrower set of event types that excludes ATC edits keeps getting that narrower set — the story does not remove a caller's ability to filter.
- Workspace scoping for activity entries is a hard boundary: no activity entry, including an ATC-edit entry, is ever visible to a workspace the entity does not belong to.
- The set of Tests an ATC edit "affects" is the set already computed for that ATC's edit today; this story only requires that set to be conveyed in the feed entry, it does not redefine what "affected" means.
- An ATC-edit entry is distinct from an ATC-creation entry. Creating an ATC produces exactly one entry; it is never followed by a spurious edit entry for the same change.

---
_Synced from Jira by sync-jira-issues_
