# BUG: MarkdownEditor: Description: 90% capacity warning threshold not implemented

**Jira Key:** [BK-100](https://jira.upexgalaxy.com/browse/BK-100)
**Priority:** Medium
**Status:** Closed
**Components:** User Stories & Acceptance Criteria

---

## Description

The 90% capacity warning threshold is not implemented in the Markdown editor description field. When a user enters 45,500 bytes (more than 90% of the 50 KB limit), the size counter remains in neutral color (text-fg-4) with no visual warning. AC6 requires a visible warning indicator at 90% capacity to alert users before reaching the hard limit.

## Steps to Reproduce

1. Log in to Bunkai TMS staging (https://staging-upexbunkai.vercel.app)
2. Open any project and create or edit a user story
3. In the Description field, inject 45,500 characters via JavaScript: `const el = document.querySelector('textarea[placeholder="Describe the story in Markdown."]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, 'A'.repeat(45500)); el.dispatchEvent(new Event('input', { bubbles: true }))`
4. Observe the size counter: `data-testid="markdown-size"`

## Actual Result

Counter shows "44.4 KB" in neutral color (CSS class: `font-mono text-fg-4`). No warning state, no color change, no badge or tooltip. The user receives no early indication that they are approaching the size limit.

## Expected Result

At 90% of the 50 KB limit (approximately 45 KB), the counter should show a warning indicator — a color change (e.g. amber/yellow), a badge, or a tooltip — to alert the user before reaching the hard limit.

***Error Type***: Functional
***Severity***: Moderada
***Test Environment***: Staging

## Root Cause

The counter component likely only handles two states (normal and over-limit). A third state for the 90% threshold was not implemented.

## Additional Note

Minor: the counter uses KiB (divided by 1024) instead of KB (divided by 1000). At 45,500 bytes it shows 44.4 KB instead of the true 45.5 KB — a minor display discrepancy that compounds the missing warning.

## Evidence

- tc-07-no-warning.png: 44.4 KB in counter with neutral color at 45,500 bytes

***Fix***: bugfix

---

## Related Issues

- is blocked by: [BK-16](https://jira.upexgalaxy.com/browse/BK-16) - Markdown Editor | Write and preview Markdown safely

---

## Metadata

- **Created:** 6/9/2026
- **Updated:** 6/26/2026
- **Reporter:** Facu Barea
- **Assignee:** Facu Barea
- **Labels:** bug, exploratory-testing, markdown-editor

---

_Synced from Jira by sync-jira-issues_
