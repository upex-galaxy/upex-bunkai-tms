# BK-48 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

# BK-48 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

# Acceptance Criteria — BK-48 (Refreshed 2026-08-10, PO Decisions Applied)

***Feature******:*** Traceability Chain Filters
  As a Senior QA Engineer
  I want to filter the evidence chain by verdict, module, and date range
  So that I can quickly identify what failed, where, and when without scrolling full history

## AC1 — Result filter (multi-select toggle buttons, row-level, six-value verdict)

***Background******:***
***Given*** a user story with chain rows having mixed outcomes (pass, fail, blocked, skipped, running)

***Scenario 1.1******:****** Should filter chain rows by single verdict value when a result toggle is pressed (Type******:****** Positive, Priority******:****** High)***
***When*** the Senior QA Engineer presses the "Fail" result toggle (`data-result="fail"`, `aria-pressed="true"`)
***Then*** only chain rows with `data-status="fail"` are visible; all other rows are hidden
***And*** the AC card remains visible if it has at least one visible row; hidden if zero visible rows
***And*** a per-AC note shows "n of m shown ·" in the AC header
***And*** the active-filter summary shows "Result: fail" chip

***Scenario 1.2******:****** Should filter chain rows by multiple verdict values when multiple toggles are pressed (Type******:****** Positive, Priority******:****** High)***
***When*** the Senior QA Engineer presses "Fail" AND "Blocked" toggles (both `aria-pressed="true"`)
***Then*** only rows with `data-status="fail"` OR `data-status="blocked"` are visible
***And*** the active-filter summary shows "Result: fail, blocked"

***Scenario 1.3******:****** Should support all six verdict values per D27 mandate (Type******:****** Positive, Priority******:****** High)***
***When*** inspecting the available toggle buttons
***Then*** six toggles exist: Pass, Fail, Blocked, Skipped, Aborted, Running

***Scenario 1.4******:****** Should gracefully handle rows with missing or unknown data-status (Type******:****** Boundary, Priority******:****** Medium)***
***Given*** a chain row where `data-status` is missing or empty
***When*** any result filter is active
***Then*** the row is EXCLUDED from filtered results (not shown as "unknown")
***And*** the row is still visible when NO result filter is active (full chain view)
***And*** no console error is thrown

***Scenario 1.5******:****** Should support keyboard navigation in result toggles (Type******:****** Positive, Priority******:****** High)***
***Given*** the result filter bar with 6 toggles
***When*** the Senior QA Engineer presses Tab to enter the filter bar, then Space/Enter to toggle each button
***Then*** each toggle receives focus visibly (focus-visible)
***And*** Space/Enter toggles aria-pressed
***And*** Escape exits the group

## AC2 — Module filter (exact-match select, archived modules excluded) + date range (inclusive, latest-run date)

***Background******:***
***Given*** chain rows with modules MOD-001, MOD-002, MOD-008 and dates spanning multiple dates

***Scenario 2.1******:****** Should filter chain rows by exact module value when a module is selected (Type******:****** Positive, Priority******:****** High)***
***When*** the Senior QA Engineer selects "MOD-001" from the module dropdown
***Then*** only rows with `data-module="MOD-001"` are visible
***And*** the active-filter summary shows "Module: MOD-001"

***Scenario 2.2******:****** Should exclude archived modules from the module dropdown (Type******:****** Positive, Priority******:****** High)***
***Given*** the system has modules MOD-001 (active), MOD-002 (active), MOD-003 (archived)
***When*** the Senior QA Engineer opens the module dropdown
***Then*** only active modules (MOD-001, MOD-002) appear in the dropdown
***And*** MOD-003 (archived) is NOT listed
***And*** if ALL evidence belongs to archived modules and no module filter is selected, the full chain is shown (module filter stays at "all")

***Scenario 2.3******:****** Should filter chain rows by inclusive date range on latest-run date (Type******:****** Positive, Priority******:****** High)***
***When*** the Senior QA Engineer enters From "2026-07-20" and To "2026-07-25"
***Then*** only rows with `data-date` between "2026-07-20" and "2026-07-25" inclusive are visible
***And*** rows with empty `data-date` are excluded when date filter is active

***Scenario 2.4******:****** Should apply AND logic across result + module + date filters (Type******:****** Positive, Priority******:****** High)***
***When*** the Senior QA Engineer selects module "MOD-001", presses "Fail" toggle, and enters a date range
***Then*** only rows matching ALL THREE criteria are visible (AND, not OR)

***Scenario 2.5******:****** Should reject inverted date range inline without breaking other filters (Type******:****** Negative, Priority******:****** High)***
***Given*** the date filter inputs
***When*** the Senior QA Engineer enters From "2026-07-25" and To "2026-07-20" (inverted)
***Then*** the error message "From date is after to date. Date filter ignored until fixed." appears
***And*** both date inputs get `aria-invalid="true"`
***And*** the date filter is IGNORED while invalid; other filters continue to work

***Scenario 2.6******:****** Should hide AC card only when ALL its rows are filtered out (Type******:****** Positive, Priority******:****** Medium)***
***Given*** AC with 2 rows (one pass, one fail)
***When*** the Senior QA Engineer filters by result "fail"
***Then*** AC card remains visible with 1 of 2 rows shown
***And*** the per-AC note shows "1 of 2 shown ·"

***Scenario 2.7******:****** Should gracefully handle rows with missing data-module (Type******:****** Boundary, Priority******:****** Medium)***
***Given*** a chain row where `data-module` is missing or empty
***When*** a module filter is active
***Then*** the row is EXCLUDED from filtered results
***And*** the row is still visible when NO module filter is active

***Scenario 2.8******:****** Should support keyboard navigation in module dropdown (Type******:****** Positive, Priority******:****** High)***
***Given*** the module dropdown is focused
***When*** the Senior QA Engineer presses ArrowDown/ArrowUp to navigate options, Enter to select, Escape to close
***Then*** options are navigable
***And*** selection commits on Enter
***And*** dropdown closes on Escape

***Scenario 2.9******:****** Should support keyboard navigation in date inputs (Type******:****** Positive, Priority******:****** High)***
***Given*** the From/To date inputs are focused
***When*** the Senior QA Engineer types a date, uses ArrowUp/ArrowDown to increment/decrement, presses Enter
***Then*** input accepts typing
***And*** arrows adjust date value
***And*** Enter confirms and moves focus

***Scenario 2.10******:****** Should filter to exact single day when From equals To (Type******:****** Positive, Priority******:****** Medium)***
***Given*** chain rows with dates "2026-07-20", "2026-07-21", "2026-07-22"
***When*** the Senior QA Engineer enters From "2026-07-21" and To "2026-07-21"
***Then*** only rows with data-date="2026-07-21" are visible

***Scenario 2.11******:****** Should rely on browser native validation for manual date input (Type******:****** Negative, Priority******:****** Low)***
***Given*** the date input (type="date")
***When*** the Senior QA Engineer manually types "2026-13-45" (invalid month/day)
***Then*** browser shows native validation UI
***And*** form does not submit invalid value
***And*** filter ignores invalid input

## AC3 — Zero-match state ("Filters excluded everything")

***Background******:***
***Given*** chain rows exist but a filter combination matches none of them

***Scenario 3.1******:****** Should show distinct "Filters excluded everything" panel when filters match no rows (Type******:****** Negative, Priority******:****** High)***
***When*** the Senior QA Engineer applies that filter combination
***Then*** the filtered-empty panel appears with title "Filters excluded everything" and body copy
***And*** this panel is visually distinct from the zero-coverage banner and the zero-AC empty panel

## AC4 — Active-filter summary and Clear-all

***Background******:***
***Given*** one or more filters active

***Scenario 4.1******:****** Should display active-filter chip summary when any filter is applied (Type******:****** Positive, Priority******:****** Medium)***
***When*** the Senior QA Engineer looks at the filter bar
***Then*** the active-summary bar appears with "Active filters:" text + filter chips
***And*** each active filter shows as a chip: "Result: vals", "Module: mod", "From date", "To date"
***And*** the row-count element shows "N of M chain entries shown" via aria-live

***Scenario 4.2******:****** Should clear all filters when Clear-all is pressed (Type******:****** Positive, Priority******:****** Medium)***
***When*** the Senior QA Engineer presses "Clear all"
***Then*** all result toggles reset to `aria-pressed="false"`
***And*** module select resets to "all"
***And*** date inputs clear to empty
***And*** the full unfiltered chain is restored
***And*** URL query params are cleared (back to clean URL)

***Scenario 4.3******:****** Should return focus to first filter after Clear-all (Type******:****** Positive, Priority******:****** High)***
***Given*** Clear-all button focused
***When*** the Senior QA Engineer presses Clear-all
***Then*** all filters reset
***And*** focus moves to the first result toggle (or module dropdown if no result toggles)

***Scenario 4.4******:****** Should announce row count changes via aria-live (Type******:****** Positive, Priority******:****** High)***
***Given*** row count shows "5 of 20 chain entries shown"
***When*** the Senior QA Engineer adds/removes a filter
***Then*** the #row-count element updates and announces the new count via aria-live="polite"

## AC5 — Filter-state persistence via URL query params

***Background******:***
***Given*** the Senior QA Engineer applies filters (result=Fail, module=MOD-001, from=2026-07-20, to=2026-07-25)

***Scenario 5.1******:****** Should persist filter state in URL query params when filters are applied (Type******:****** Positive, Priority******:****** Medium)***
***When*** the URL is inspected
***Then*** the URL contains query params: `?result=fail&module=MOD-001&from=2026-07-20&to=2026-07-25`
***And*** the filter state is fully reproducible from the URL alone

***Scenario 5.2******:****** Should restore filter state from URL query params on page load (Type******:****** Positive, Priority******:****** Medium)***
***Given*** a URL with filter query params (e.g. shared by a colleague)
***When*** the Senior QA Engineer opens that URL
***Then*** the filters are automatically applied matching the URL params
***And*** the chain is filtered accordingly
***And*** the active-filter chips reflect the restored state

***Scenario 5.3******:****** Should handle browser back/forward navigation with filter state (Type******:****** Positive, Priority******:****** Low)***
***When*** the Senior QA Engineer applies filters, then navigates away, then presses Back
***Then*** the filters are restored from the URL history
***And*** the chain is filtered accordingly

***Scenario 5.4******:****** Should handle invalid or missing URL params gracefully (Type******:****** Negative, Priority******:****** Low)***
***Given*** a URL with invalid filter params (e.g. `?result=invalid_value`)
***When*** the page loads
***Then*** invalid params are silently ignored (not applied)
***And*** the chain shows the full unfiltered view
***And*** no error is shown to the user

***Scenario 5.5******:****** Should support partial URL query params (Type******:****** Positive, Priority******:****** Medium)***
***Given*** URLs with only one filter type: `?result=fail`, `?module=MOD-001`, `?from=2026-07-20`, `?to=2026-07-25`
***When*** the Senior QA Engineer opens each URL
***Then*** only the specified filter is applied
***And*** other filters remain at default (all/empty)

***Scenario 5.6******:****** Should support open-ended date ranges (solo From / solo To) (Type******:****** Positive, Priority******:****** Medium)***
***Given*** chain rows spanning multiple dates
***When*** the Senior QA Engineer enters only From "2026-07-20" (To empty) OR only To "2026-07-25" (From empty)
***Then*** solo From → rows >= From date visible; solo To → rows <= To date visible

## AC6 — Frontend defensive validation for missing data-date

***Scenario 6.1******:****** Should handle rows with missing data-date gracefully (Type******:****** Boundary, Priority******:****** Medium)***
***Given*** a chain row where `data-date` is missing or empty
***When*** the date filter is active
***Then*** the row is excluded from filtered results
***And*** the row is visible when no date filter is active

---

**Synced from Jira by sync-jira-issues**

---
_Synced from Jira by sync-jira-issues_
