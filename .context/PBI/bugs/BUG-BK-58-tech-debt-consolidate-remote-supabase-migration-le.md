# BUG: Tech-debt: consolidate remote Supabase migration ledger for 0014

**Jira Key:** [BK-58](https://jira.upexgalaxy.com/browse/BK-58)
**Priority:** Lowest
**Status:** Closed
**Components:** Bunkai Projects
**Severity:** Trivial
**Error Type:** Data
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

Remote Supabase ledger has 3 entries (module*soft*delete, module*update*fn*param*defaults, module*update*fn*slug*guard) for what the repo records as a single migration file 0014*module*soft_delete.sql. Functionally consistent (a fresh db reset from repo yields the final state) but the remote ledger is noisier than the repo source-of-truth. Consolidate or document. Origin: [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10). (tech-debt, not a functional defect)

---

## 🔍 Root Cause

**Category:** Configuration Error 

---

## Metadata

- **Created:** 6/4/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
