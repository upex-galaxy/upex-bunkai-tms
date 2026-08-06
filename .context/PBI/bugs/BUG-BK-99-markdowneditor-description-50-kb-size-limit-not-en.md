# BUG: MarkdownEditor: Description: 50 KB size limit not enforced on submission

**Jira Key:** [BK-99](https://jira.upexgalaxy.com/browse/BK-99)
**Priority:** High
**Status:** Closed
**Components:** User Stories & Acceptance Criteria

---

## Description

A 51,000-byte description was submitted and saved to the database without any error or blocking mechanism. The submit button remains enabled when the description exceeds the 50 KB limit. The server accepts and persists the oversized payload, fully violating AC5.

## Steps to Reproduce

1. Log in to Bunkai TMS staging (https://staging-upexbunkai.vercel.app)
2. Open any project and hover over a module row to reveal "New user story"
3. Click "New user story" to open the story creation form
4. In the Description field, inject 51,000 characters via JavaScript: `const el = document.querySelector('textarea[placeholder="Describe the story in Markdown."]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, 'A'.repeat(51000)); el.dispatchEvent(new Event('input', { bubbles: true }))`
5. Observe that the size counter shows ~49.8 KB in red (text-signal-blocked class)
6. Note that the "Create story" button remains ENABLED
7. Click "Create story"
8. Observe: story is created with no error message

## Actual Result

Story created successfully with 51,000 bytes in the description. No error message shown. No submission blocking. The oversized payload is persisted to the database.

## Expected Result

Submission should be blocked client-side (disabled button) with an inline error message: "description exceeds the maximum size". Server should also reject with a 400 error.

***Error Type***: Functional
***Severity***: Mayor
***Test Environment***: Staging

## Root Cause

Missing client-side submit guard: the counter color changes to text-signal-blocked but the submit button is not disabled. Missing server-side size validation on the story creation endpoint.

## Evidence

- tc-06-pre-submit.png: Editor with 51 KB loaded, counter in red, submit button active
- tc-06-no-error.png: After save — story created with no error
- tc-06-after-reload.png: Story reopened with 51,000 chars still loaded

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
