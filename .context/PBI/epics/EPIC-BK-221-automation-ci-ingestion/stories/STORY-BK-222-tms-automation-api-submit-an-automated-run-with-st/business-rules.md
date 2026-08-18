# BK-222 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-222)

- ***Authentication***: workspace-scoped Personal Access Token (managed in Settings, per the Manage Personal Access Tokens story). The token identifies both the acting identity and the workspace; runs land in the project the submission targets.
- ***Role gate****: automated submissions require the token owner to hold the ****member role or higher*** in the workspace (roles: viewer < member < admin < owner). Viewer tokens are read-only.
- ***Immutability***: a submitted run is created already finished, and finished runs are immutable — the same guarantee manual runs have.
- ***Vocabulary***: step results are limited to pass / fail / block; the final verdict is limited to passed / failed. "Aborted" cannot be submitted — abort exists only for interrupting in-progress runs.
- ***Idempotency window****: the idempotency window is ****24 hours per idempotency key****. An identical resubmission carrying the same key within the window returns the original run — never a duplicate; a ****different*** payload under the same key is rejected as a conflict.
- ***Snapshot rule***: the run snapshots step content at submission time, so editing an ATC later never rewrites run history.
- ***Environment***: the submitted environment must be one of the Project's environments; unknown names are rejected, never auto-created.

### Design intent

- No new screens. Submitted runs surface through the existing surfaces: the Test's run history, the project runs view, and the finished-run detail.
- The run detail shows the automated executor attribution (token name) and lists evidence references as links.
- Pairs with the execution-mode story: automated runs carry the "Automated" badge there; this story only guarantees the data exists.

---
_Synced from Jira by sync-jira-issues_
