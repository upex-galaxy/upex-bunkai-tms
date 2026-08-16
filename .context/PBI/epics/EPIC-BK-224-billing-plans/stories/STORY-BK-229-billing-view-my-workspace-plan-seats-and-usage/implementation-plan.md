# BK-229 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

## BK-229 — Implementation Plan (Dev)

### Goal

Ship a read-only Billing overview inside the Settings hub: plan card (tier, price, renewal), seat meter, and per-resource usage meters (projects, run-history retention), gated to workspace owner/admin.

### Binding technical contract (read-only; followed, not re-derived)

Followed from Jira comments 12414 (TQ2 binding), 12415/12416 (AI PO tier ladder values), 12417 (AI Tech Lead TQ1 reversal to TS constants), 12418 (reconciliation + reading order), 12419 (D34 storage-clause correction). Reading order 12414→12415→12416→12417→12418→12419, later wins on conflict.

- Tier ladder as TypeScript constants in lib/billing/plan-tiers.ts, keyed by WorkspacePlan (lib/types.ts:12). No plan_tiers table, no seed migration.
- One additive migration bunkai*workspace*billing*overview(p*workspace*id uuid) — SECURITY INVOKER, no actor param, set search*path = '', step-0 admin gate via bunkai*is*workspace_admin, returns jsonb or null.
- Route GET /api/v1/workspaces/{id}/billing — getAuth(ctx).db, never createAdminClient(); RPC null -> 404 not_found (no 403, non-disclosure).
- UI: turn Billing live in lib/settings/nav-items.ts (move to AVAILABLE), build plan card + seat meter + usage meters against billing-overview.html mockup and frozen tokens (master-design-plan.md section 2). Upgrade entry ships INERT (soon tag). Do NOT ship the mockup's pruning sentence — nothing prunes runs.
- All limit/percentage/warning-threshold (80%/100%) math and display naming live in lib/billing/plan-tiers.ts — unit-testable with no DB.

### RPC-authorization gate answers

1. SECURITY DEFINER needed? No — INVOKER suffices.
2. Identity parameter deleted? Yes — no actor parameter; only auth.uid() via DEFINER helper bunkai*is*workspace_admin.
3. Actor bind location? Step 0, before any table read: if not public.bunkai*is*workspace*admin(p*workspace_id) then return null; end if;
4. Row scoping? Every subsequent read is workspace-scoped by the same p*workspace*id; step-0 already proved caller is active admin/owner of exactly that workspace.
5. SECURITY INVOKER viable? Yes, per the ADR-0012/BK-267/BK-398 precedent cited in comment 12414 TQ2.
6. Non-disclosure? null on non-admin, unknown, or foreign workspace — indistinguishable, mapped to 404 by the route.

### Files

- NEW lib/billing/plan-tiers.ts — PlanTier interface + PLAN_TIERS constant + meterState/meterLabel/formatPrice helpers.
- NEW supabase/migrations/00NN*workspace*billing_overview.sql — RPC only, number re-verified live before writing.
- NEW wrapper in lib/supabase/rpc.ts (getWorkspaceBillingOverview).
- NEW app/api/v1/workspaces/[id]/billing/route.ts + route.openapi.ts.
- EDIT lib/settings/nav-items.ts — move billing to SETTINGS*NAV*AVAILABLE.
- NEW app/(app)/settings/billing/page.tsx + components/billing/BillingOverviewView.tsx + a small meter primitive.
- NEW lib/billing/plan-tiers.test.ts (unit, no DB).
- NEW lib/billing/billing-overview-isolation.test.ts (DB-integration, real production write paths).
- EDIT .context/design/master-design-plan.md and .context/dev-roadmap.md — separate commit.

### Workload Forecast

Estimated: ~650 additions + ~20 deletions = ~670 total lines. 400-line budget risk: High. Chain strategy: single-pr (deliberate override — see trace). Decision trace: Q1=No (new domain logic, not mechanical) · Q2=Yes (decomposable into 3 slices <400 lines each, base safely contains each alone) · Q3=n/a -> tree output stacked-to-main, OVERRIDDEN to single-pr. Override reason: this delivery run's own dispatch brief mandates a single PR/single merge-commit deliverable for one already fully-ratified 8 SP story — a multi-PR chain would buy review-risk mitigation this story does not need. Decided by: /git-flow-master Chained-PR decision tree, override by the orchestrating AI Tech Lead profile. Decision needed before apply: No (resolved above).

---
_Synced from Jira by sync-jira-issues_
