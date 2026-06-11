# TEST: BK-9: TC23: Validate module name is slugified correctly for different character sets

**Jira Key:** [BK-82](https://jira.upexgalaxy.com/browse/BK-82)
**Status:** DEPRECATED
**Components:** None

---

## Test Description

## Test Case — TC23

Story: BK-9 | ROI: 16 | Verdict: MANUAL

### Manual Steps

MANUAL TEST STEPS:

1. Create module with name='Payment & Billing'. Verify path segment = 'payment-billing'.

2. Create module with name='Café Münchën'. Verify slugification strips accents/special chars.

3. Create module with name='😀😀😀'. Expect 422 name*no*alphanumeric.

4. Create module with name='<script>alert(1)</script>'. Verify stored name is literal text (React escapes on render — no XSS).

### Variables

{project*id} — UUID of the test project | {root*id} — dynamically obtained from prior TC step

### Related

Story: BK-9 | Regression Epic: BK-70 | Bugs: BK-67, BK-68 (if applicable)

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/8/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** functional, manual-only, regression

---

_Synced from Jira by sync-jira-issues_
