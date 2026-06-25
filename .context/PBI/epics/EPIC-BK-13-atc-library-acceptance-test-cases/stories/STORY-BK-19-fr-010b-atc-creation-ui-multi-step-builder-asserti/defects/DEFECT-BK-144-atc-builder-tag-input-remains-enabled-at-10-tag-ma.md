# DEFECT: ATC builder — tag input remains enabled at 10-tag maximum instead of being disabled

**Jira Key:** [BK-144](https://jira.upexgalaxy.com/browse/BK-144)
**Related Story:** [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions
**Priority:** Medium
**Status:** Open
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Bug Description

When an ATC already has 10 tags, the tag input field remains enabled. Attempting to add an 11th tag silently fails — the tag is not added and a paragraph message "An ATC can have at most 10 tags." appears below the input. Per design expectations, the input should be disabled at the 10-tag cap OR show an immediate inline message on attempt. Currently the silent failure may confuse users.

## Steps to Reproduce

1. Open ATC builder.
2. Add 10 tags.
3. Attempt to type and add an 11th tag.

## Expected Result

Input disabled OR immediate inline feedback on 11th attempt.

## Observed Result

Input stays enabled; tag not added; paragraph message visible below the input.

## Test Environment

staging (https://staging-upexbunkai.vercel.app)

## Related Story

BK-19 — TMS-ATC Builder

---

## Related Issues

- created: [BK-19](https://jira.upexgalaxy.com/browse/BK-19) - TMS-ATC Builder | Build an ATC with ordered steps and assertions

---

## Metadata

- **Created:** 6/18/2026
- **Updated:** 6/19/2026
- **Reporter:** maibeth vega
- **Assignee:** maibeth vega
- **Labels:** bk-19, sprint-testing

---

_Synced from Jira by sync-jira-issues_
