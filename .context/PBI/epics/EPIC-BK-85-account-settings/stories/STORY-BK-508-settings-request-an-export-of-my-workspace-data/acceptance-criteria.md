# BK-508 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-508)

## AC-01 — The Owner finds a Data export section in Settings

```gherkin
Scenario: A workspace Owner sees the Data export section
  Given I am signed in as the Owner of my active workspace
  When I open Settings
  Then a "Data export" section is listed in the Settings navigation
  And opening it explains what the export covers and offers to request one
```

## AC-02 — Non-Owner roles do not see the section at all

```gherkin
Scenario: An Admin, Member or Viewer never sees the Data export section
  Given I am signed in with the Admin, Member or Viewer role in my active workspace
  When I open Settings
  Then no "Data export" section is listed
  And I cannot reach a data export for this workspace by any route in Settings
```

## AC-03 — Never-requested empty state

```gherkin
Scenario: An Owner who has never requested an export sees an honest empty state
  Given I am the Owner and no export has ever been requested for this workspace
  When I open the Data export section
  Then I am told no export has been requested yet
  And I am told what an export contains and how long a ready archive stays downloadable
```

## AC-04 — The request is acknowledged immediately

```gherkin
Scenario: Requesting an export does not make the Owner wait on the screen
  Given I am the Owner and no export is in flight
  When I request an export of my workspace's data
  Then the request is acknowledged straight away
  And the section reports that an export is being prepared, with the time I requested it
  And I can navigate away and return to that same state
```

## AC-05 — A second request while one is preparing is refused with a reason

```gherkin
Scenario: Only one export per workspace is in flight at a time
  Given an export of my workspace is being prepared
  When I request another export
  Then the second request is refused
  And I am told that an export is already being prepared
  And the first export is still being prepared, unchanged
```

## AC-06 — A ready export can be downloaded as one archive

```gherkin
Scenario: The Owner downloads the finished archive
  Given an export of my workspace has finished preparing
  When I open the Data export section
  Then the section reports the export as ready
  And it states how long the download stays available
  And I can download the workspace's data as a single archive
```

## AC-07 — An expired archive says so instead of failing silently

```gherkin
Scenario: The download window lapses and the section says so plainly
  Given an export of my workspace was ready and its download window has lapsed
  When I open the Data export section
  Then I am told the archive has expired and is no longer downloadable
  And I am offered a fresh export request
  And I am not shown a download that leads nowhere
```

## AC-08 — A failed export is reported as failed, with a retry

```gherkin
Scenario: An export that cannot be produced is reported honestly
  Given I requested an export of my workspace
  And preparing it failed
  When I open the Data export section
  Then I am told the export failed
  And I am offered a way to request it again
  And the section does not keep reporting it as being prepared
```

## AC-09 — The archive is scoped to exactly one workspace

```gherkin
Scenario: The export covers the active workspace and nothing else
  Given I am the Owner of two workspaces and one of them is active
  When I request an export and download the ready archive
  Then the archive contains the records of the active workspace only
  And it contains no record belonging to my other workspace
```

## AC-10 — The archive never carries a credential

```gherkin
Scenario: No secret of any kind leaves the product inside the archive
  Given my workspace has Personal Access Tokens issued and pending invites outstanding
  When I download a ready export archive
  Then the archive contains no Personal Access Token secret
  And it contains no magic-link token and no invite token
```

## AC-11 — The archive is machine-readable

```gherkin
Scenario: The recipient can process the archive without Bunkai
  Given I have downloaded a ready export archive
  When a recipient opens it outside Bunkai
  Then the workspace's records are readable in a structured, machine-readable form
  And reading them requires no access to Bunkai
```

## AC-12 — Requesting and downloading are both audited

```gherkin
Scenario: The export leaves its own trail in the Activity Stream
  Given I have requested an export and downloaded the ready archive
  When I open the workspace Activity Stream
  Then I see an entry for the export request
  And I see an entry for the download
```

## AC-13 — An export changes nothing

```gherkin
Scenario: Running an export leaves the workspace exactly as it was
  Given I record the state of my workspace's Projects, ATCs, Tests, Runs and Bugs
  When I request an export and it finishes preparing
  Then every one of those records is unchanged
```

---
_Synced from Jira by sync-jira-issues_
