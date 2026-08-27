import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { getWorkspaceBillingOverview } from '@lib/supabase/rpc';

// GET /api/v1/workspaces/{id}/billing — the workspace's plan, seats, and
// usage overview (BK-229).
//
// `bunkai_workspace_billing_overview` is `SECURITY INVOKER` with NO
// caller-supplied actor parameter (Jira comment 12414 TQ2, unchanged by the
// later TQ1 reversal in comment 12417): its own step-0 gate
// (`bunkai_is_workspace_admin`, itself SECURITY DEFINER, self-binds to
// `auth.uid()`) is what restricts this to the workspace's owner/admin. This
// route MUST call it through `getAuth(ctx).db` — NEVER `createAdminClient()`
// — or `auth.uid()` is NULL and the gate always returns false, silently
// breaking the feature. Not a `workspace:admin` write, so it deliberately
// does not call `assertWorkspaceContext` (ADR-0006 binds a PAT to its own
// workspace for admin WRITE operations only).
//
// Non-disclosure: the RPC returns `null` for three distinct causes — the
// caller is not an admin/owner, the workspace id is well-formed but unknown,
// or the caller cannot see the workspace at all — and this route collapses
// every one of them into the SAME `404 not_found`. Never `403`: telling a
// non-admin member "this workspace exists but you can't see its billing"
// would disclose more than the workspace's existence, which the RPC's own
// design refuses to do.
//
// The limit/percentage/warning-threshold math and the tier ladder itself
// (display name, price, per-tier limits) are NOT part of this payload — they
// live in `lib/billing/plan-tiers.ts`, keyed by the `plan` this endpoint
// returns, so they stay unit-testable with no database.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data, error } = await getWorkspaceBillingOverview(db, workspaceId);
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Workspace not found.');
  }

  // `data` is typed `Json` by Postgrest — narrow it structurally rather than
  // trusting an unchecked `as` cast, so a shape drift in the RPC fails loudly
  // (500) instead of shipping `undefined` fields to the client.
  if (!isBillingOverviewShape(data)) {
    throw new ApiError('internal_error', 'The billing overview did not match the expected shape.');
  }

  return jsonResponse({
    plan: data.plan,
    purchased_seats: data.purchased_seats,
    active_seats: data.active_seats,
    project_count: data.project_count,
    oldest_run_age_days: data.oldest_run_age_days,
  }, { status: 200 });
// Scope floor matches the sibling workspace-inventory reads (open-bugs,
// coverage, recent-projects, active-runs) — `atc:read` gates Bearer PATs;
// cookie sessions already hold the full capability set and are unaffected.
}, { auth: 'required', requires: ['atc:read'] });

interface BillingOverviewShape {
  plan: string
  // BK-230 (Conductor review PR #208, item 5) — the Cloud workspace's real
  // purchased seat count, additive on `bunkai_workspace_billing_overview`
  // (migration 0077). `null` for Community/Enterprise or a Cloud workspace
  // predating this column; `lib/billing/plan-tiers.ts`'s effectiveSeatLimit()
  // falls back to the tier constant in that case.
  purchased_seats: number | null
  active_seats: number
  project_count: number
  oldest_run_age_days: number | null
}

function isBillingOverviewShape(value: unknown): value is BillingOverviewShape {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.plan === 'string'
    && (v.purchased_seats === null || v.purchased_seats === undefined || typeof v.purchased_seats === 'number')
    && typeof v.active_seats === 'number'
    && typeof v.project_count === 'number'
    && (v.oldest_run_age_days === null || typeof v.oldest_run_age_days === 'number');
}

// The route is /api/v1/workspaces/{id}/billing — the workspace id is the
// segment right after the literal "workspaces" (mirrors the sibling
// coverage/open-bugs/recent-projects routes).
function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
