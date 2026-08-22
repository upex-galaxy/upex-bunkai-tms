# BK-226 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

- ***Role gate***: uploads require the member role or higher (roles: viewer < member < admin < owner); the scripted path authenticates with a workspace-scoped Personal Access Token, the in-app path uses the signed-in session.
- ***File bounds****: one results file per upload, maximum size ****10 MB****. ****JUnit XML*** is the first supported format; other formats are future scope.
- ***Mapping rule****: report entries map to the referenced Test's ATC steps ****by position/order***; the preview is the contract — what Sara confirms is exactly what gets recorded. Count mismatches between entries and steps are accepted: every entry without a matching step is listed as "unmapped" on the run — never silently dropped.
- ***Never silent***: unmapped entries require explicit acknowledgement and are counted on the run record; uncovered steps are recorded as blocked.
- ***Verdict derivation***: any failed entry makes the run verdict failed; a fully passing mapping yields passed.
- ***Immutability***: the created run is finished and immutable, like every other finished run.

### Design intent

- Entry point: an "Upload CI results" action beside the existing "Start run" action in the project runs view.
- Flow: a three-step modal — choose file (with Test + environment pickers), review mapping (table reusing the existing table components; unmapped entries in a warning panel), confirm.
- Created runs appear in the runs views with the Automated badge (execution-mode story) and behave like any finished run.
- Error and empty states inline in the modal: unsupported format, oversized file, report with zero mappable entries.

---
_Synced from Jira by sync-jira-issues_
