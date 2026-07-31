---
topic_key: pbi/BK-89/review
capture_prompt: false
---

# BK-89 — Stage 3 Code Review

Independent adversarial review (fresh subagent, no stake in the implementation), against branch
`feat/BK-89-view-my-workspaces`.

## Findings + adjudication

| # | Severity | File:line | Summary | Adjudication |
|---|---|---|---|---|
| 1 | MAJOR | `app/api/v1/workspaces/route.test.ts:9-58` | All 4 original `mergeWorkspaceRoles` fixtures kept `workspaces[]`/`memberships[]` in matching order — a regression to a positional merge would pass unnoticed. Production code (`response.ts`) was already correct; this was a test-robustness gap, not a live bug. | **Legitimate — fixed.** Added a 5th test case with a reordered/misaligned `memberships` array (plus an unrelated extra row) that would fail under a positional merge. Commit `bd22e40`. |
| 2 | NIT | `app/(app)/settings/workspaces/page.tsx:1-107` | Page issues 4 sequential/parallel Supabase round-trips per render. | **Dismissed — matches an established convention.** Byte-for-byte identical pattern already shipped in `settings/account/page.tsx`'s `WorkspacesSection` (same query shape, same admin-client member-count aggregate). Not a new defect in this diff; touching it would mean refactoring already-shipped, already-reviewed code out of proportion for this story. |

Net: **0 unresolved BLOCKER, 0 unresolved MAJOR** (the one MAJOR is fixed), 0 unresolved MINOR, 1 NIT dismissed with reason.

## AC verification (reviewer, independent of the plan's own claims)

- **AC1** (multi-workspace list with roles, active marker): pass — `WorkspacesList.tsx:75-104` role Badge per row via `roleLabel()`; active dot+text gated by `ws.isActive`, non-active rows carry no indicator.
- **AC2** (single-workspace clean state): pass — `resolveWorkspacesViewState` renders the same `'list'` branch for `rowCount >= 1`, no single-vs-multi special-casing; no leave/add controls anywhere in that branch.
- **AC3** (suspended/invited excluded): pass — verified directly against the migration file, not the plan's citation: `supabase/migrations/0001_tenancy.sql:69-80` RLS policy `workspaces_select_active_member` requires an active membership to exist at all; `route.ts:108-115` + the new page both additionally filter `.eq('status','active')` as defense-in-depth.
- **AC4** (Owner role from DB value, not client-derived): pass — `supabase/migrations/0001_tenancy.sql:43-44` check constraint includes `'owner'`; `0006_bootstrap_workspace.sql:49-50` inserts it at creation time; `roleLabel('owner') === 'Owner'` already unit-tested.

## Security

Clean. New `workspace_members` query scoped to `principal.userId` (server-resolved, never attacker-controlled) via the RLS-scoped client (never admin). RLS remains the enforcement layer; the app-level status filter is defense-in-depth, not a substitute. No secrets in the diff.

## OpenAPI scope

Clean. Base `WorkspaceSchema` (consumed by `POST /api/v1/workspaces` and `GET /api/v1/workspaces/[id]`) verified byte-identical pre/post-diff. New `WorkspaceWithRoleSchema` feeds only the list-response schema.

_Full findings detail + Spec Compliance Matrix: see `compliance-matrix.md` in this folder._
