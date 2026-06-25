# BK-147 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

# BK-147 — Acceptance Test Plan (ATP)

## Triage

- ***Veto******:*** None (UI feature, user-facing)
- ***Risk score******:*** 10 (HIGH) — new feature (+3) + explicit ACs (+2) + user-facing (+2) + high effort 5SP (+2) + Highest priority (+1)
- ***Data feasibility******:*** Need authenticated browser session + project with ATCs and Tests. Workspace QASmoke-20250605 has data via PAT. UI login needed.

## Phase 1 — Critical Analysis

- ***Business******:*** Core UX improvement — Elena can navigate project like a code editor with persistent sidebar + tabs. No backend change.
- ***Technical******:*** Frontend-only. Reuses existing routed detail views (ATC editor, Test detail view) as tab content. Routes: `/projects/{id}`, ATC/Tests opened as workbench tabs.
- ***Complexity******:*** UI: Medium. Business logic: Low. Integration: None. Data validation: None.

## Phase 2 — Story Quality

- ***AC9 (not-found)******:*** No clear spec on what a "safe not-found state" looks like — needs visual confirmation.
- ***AC10 (project isolation)******:*** What's the trigger? Is it clicking a different project in the nav, or navigating directly? Needs empirical check.

## Phase 3 — Refined ACs (10 scenarios)

All 10 ACs from the story are kept as-is. No new scenarios needed given the UI-only nature.

## Phase 4 — Test Design (TC Outlines)

### Technique application

- ***EP******:*** AC1 (shell visible), AC2 (explorer visible), AC8 (deep link) → 2 partitions each (visible / hidden)
- ***BVA******:*** AC5 (close tab → adjacent), AC6 (close last → index) → boundary at 1 tab
- ***State-Transition******:*** Tab lifecycle: closed → opened → focused → closed. AC4 (no dup) = invalid transition (re-click same item while tab exists)
- ***Error Guessing******:*** AC9 (deleted item), AC10 (cross-project)

### Outlines

| # | Outline | Type | Priority | Precondition | Expected |
| --- | --- | --- | --- | --- | --- |
| TC1 | Shell stays visible across navigation | Positive | Critical | Signed in, on project page | Left nav, workspace switcher, search, account block visible at all times |
| TC2 | Explorer tree visible when opening ATC | Positive | Critical | Signed in, project with ATCs | Click ATC → tab opens, tree stays, item highlighted |
| TC3 | Explorer tree visible when opening Test | Positive | Critical | Signed in, project with Tests | Click Test → tab opens, tree stays, item highlighted |
| TC4 | Multiple tabs open simultaneously | Positive | High | One tab open | Open 2nd + 3rd item → 3 tabs, switch between them without losing |
| TC5 | Re-opening same item focuses tab (no dup) | Negative | High | ATC already open in tab | Click same ATC → existing tab focused, no duplicate |
| TC6 | Close active tab → adjacent activates | Boundary | High | 3 tabs open | Close middle tab → right tab becomes active |
| TC7 | Close last tab → workbench index | Boundary | High | Exactly 1 tab open | Close it → workbench index state shown, explorer persists |
| TC8 | Toolbar reachable from any tab | Positive | High | Test open in tab | New ATC, New Test, view switch, search visible without closing tab |
| TC9 | Deep link opens as tab with explorer | Positive | High | Direct URL to a Test | Test opens as tab, explorer visible, item highlighted in tree |
| TC10 | Deleted/invisible item → safe not-found | Error | Medium | URL to deleted ATC | In-shell not-found shown, explorer + nav still visible |
| TC11 | Switching projects clears tabs | Negative | High | Tabs open in project A | Open project B → workbench index, no tabs from project A |

***Total******:****** 11 outlines*** (10 ACs + 1 risk-beyond-AC for cross-project isolation detail)

## ATP publication

- ***customfield******_******10120******:*** Not writable (confirmed earlier)
- ***Fallback******:*** ATP posted as Jira comment

---
_Synced from Jira by sync-jira-issues_
