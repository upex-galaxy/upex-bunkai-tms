---
topic_key: pbi/BK-89/compliance-matrix
capture_prompt: false
---

# BK-89 — Spec Compliance Matrix

Independently verified by the Stage 3 reviewer against the actual diff and the actual migration
files — not taken on the implementation plan's word.

| AC / ATP scenario | covered_by | evidence | status |
|---|---|---|---|
| AC1: Workspaces section lists all active memberships with roles | review-approved:independent-reviewer | `WorkspacesList.tsx:75-104` (Badge+dot logic) + `workspaces.test.ts:24-42` | review-approved |
| AC2: Single-workspace user sees a clean, unambiguous state | review-approved:independent-reviewer | `workspaces.ts:76-84` `resolveWorkspacesViewState` + `workspaces.test.ts:85-87` | review-approved |
| AC3: Workspaces with non-active membership status are not shown | review-approved:independent-reviewer | `0001_tenancy.sql:69-80` RLS policy + `route.ts:108-115` + page's explicit status filter | review-approved |
| AC4: Workspace owner sees "Owner" role label | test:`lib/account/role-label.test.ts:6-7` | `0001_tenancy.sql:43-44` + `0006_bootstrap_workspace.sql:49-50` + `role-label.test.ts` | covered |
| TC01 (BK-136) — 200, correct shape | exempt: no HTTP-integration test convention in this repo; route handlers are thin orchestration, exempted per the Unit Test Authoring Gate | `route.ts:98-118`; `route.test.ts` field-preservation case | exempt |
| TC02 (BK-139) — unauthenticated 401 | review-approved:independent-reviewer | `route.ts:118` `{auth:'required'}` unchanged; `handler.ts:75-82` 401s before handler runs | review-approved |
| TC03 (BK-140) — active-memberships-only, DB cross-validation | review-approved:independent-reviewer | same evidence as AC3 | review-approved |
| TC04 (BK-141) — role field absent → now present (QA must flip the assertion) | test:`app/api/v1/workspaces/route.test.ts:9-25` | asserts role present and correct per workspace | covered |
| P-01 — 2-workspace user, correct names | test:`lib/account/workspaces.test.ts:24-42` | `buildWorkspaceRows` output preserves id/name/slug | covered |
| P-02 — role label renders correctly per role value | test:`lib/account/role-label.test.ts:5-10` | admin/owner/viewer/member all asserted | covered |
| P-05 — owner role label displays correctly | test:`lib/account/role-label.test.ts:7` | `roleLabel('owner') === 'Owner'` | covered |
| AC4 outline — owner resolves from DB role, not `owner_user_id` comparison | review-approved:independent-reviewer | `response.ts:24-31` never references `owner_user_id`; `0006_bootstrap_workspace.sql:49-50` | review-approved |
| P-03 — active workspace visually marked, 2-workspace user | review-approved:independent-reviewer | `WorkspacesList.tsx:88-95` + `workspaces.test.ts` `isActive` assertions | review-approved |
| P-04 — single workspace renders cleanly with active indicator | review-approved:independent-reviewer | `resolveWorkspacesViewState` rowCount:1→'list', same render branch | review-approved |
| N-01 — suspended membership excluded | review-approved:independent-reviewer | same RLS+filter evidence as AC3 | review-approved |
| N-02 — invited membership excluded | review-approved:independent-reviewer | same RLS+filter evidence as AC3 | review-approved |
| B-01 — zero active workspaces, empty state | test:`lib/account/workspaces.test.ts:81-83` | `resolveWorkspacesViewState({error:false,rowCount:0}) === 'empty'` | covered |
| N-04 — cross-tenant isolation | exempt: no integration/E2E DB test infra exists in this repo for any story; enforcement unchanged by this diff, still runs through RLS-scoped `principal.db`, never admin client | `0001_tenancy.sql:69-80,140-153` + `route.ts` uses `principal.db` | exempt |
| I-01 — cookie-session auth path returns correct list | review-approved:independent-reviewer | `route.ts:93-97` no per-auth branching; `principal.ts:44-70` resolves both paths identically | review-approved |
| B-03 — loading state while request in flight | review-approved:independent-reviewer | `<Suspense fallback={<WorkspacesListSkeleton/>}>` wraps `WorkspacesSection` | review-approved |
| I-03 — navigation from Settings Hub to Workspaces | review-approved:independent-reviewer | `nav-items.ts` unchanged (already live since BK-87); diff replaces `ComingSoon` body at that route | review-approved |

**21/21 rows resolved. 0 uncovered.**
