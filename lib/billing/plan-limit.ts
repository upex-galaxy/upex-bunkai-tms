import type { MeterState } from '@lib/billing/plan-tiers';
import type { WorkspacePlan } from '@lib/types';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { meterState, PLAN_TIERS } from '@lib/billing/plan-tiers';
import { chatRoster } from '@lib/supabase/rpc';

// BK-232 — plan-limit warnings. One module owns what the banner (approaching
// the cap) and the modal (the cap refused an action) say, so every plan-limited
// resource reads the same numbers and the same role split. Projects are the
// first resource; a later one adds a key to `PlanLimitResource` and its copy.
//
// Every read here goes through the CALLER's client: workspaces, grace periods
// and projects are member-readable under RLS, `bunkai_is_workspace_owner` and
// `bunkai_chat_roster` assert membership themselves (ADR-0012), and the
// effective plan comes from the same SQL function the enforcement trigger and
// the BK-229 meters use (ADR-0021), so a grace-ended workspace shows Community
// numbers everywhere.

type Client = SupabaseClient<Database>;

export type PlanLimitResource = 'projects';

export interface PlanLimitOwner {
  user_id: string
  // Bunkai stores no display name; the email is the one owner identity a
  // member can already read (`bunkai_chat_roster`, migration 0104).
  email: string
}

// The `details` object of the 422 `project_limit_reached` envelope.
export interface PlanLimitDetails {
  reason: 'project_limit_reached'
  resource: PlanLimitResource
  plan: WorkspacePlan
  limit: number | null
  used: number
  is_owner: boolean
  owners: PlanLimitOwner[]
}

const RESOURCE_NOUN: Record<PlanLimitResource, { plural: string, singular: string }> = {
  projects: { plural: 'projects', singular: 'project' },
};

function isPlan(value: unknown): value is WorkspacePlan {
  return value === 'community' || value === 'cloud' || value === 'enterprise';
}

export interface EffectivePlanUsage {
  plan: WorkspacePlan
  limit: number | null
}

// The plan whose limits apply right now (grace aware) and its project cap.
// `null` when the workspace row is not visible to the caller.
export async function loadEffectiveProjectPlan(db: Client, workspaceId: string): Promise<EffectivePlanUsage | null> {
  const [workspace, grace] = await Promise.all([
    db.from('workspaces').select('plan').eq('id', workspaceId).maybeSingle(),
    db.from('workspace_grace_periods').select('ends_at').eq('workspace_id', workspaceId).maybeSingle(),
  ]);
  const stored = workspace.data?.plan;
  if (workspace.error || !stored) {
    return null;
  }
  const { data, error } = await db.rpc('bunkai_effective_plan', {
    p_plan: stored,
    p_grace_ends_at: grace.data?.ends_at ?? null as unknown as string,
  });
  if (error || !isPlan(data)) {
    return null;
  }
  return { plan: data, limit: PLAN_TIERS[data].projectLimit };
}

export async function countProjects(db: Client, workspaceId: string): Promise<number> {
  const { count } = await db
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  return count ?? 0;
}

export async function loadOwnership(db: Client, workspaceId: string): Promise<{ isOwner: boolean, owners: PlanLimitOwner[] }> {
  const [ownerCheck, roster] = await Promise.all([
    db.rpc('bunkai_is_workspace_owner', { ws_id: workspaceId }),
    chatRoster(db, { workspaceId }),
  ]);
  const owners = (roster.data ?? [])
    .filter(row => row.role === 'owner' && row.email)
    .map(row => ({ user_id: row.user_id, email: row.email }));
  return { isOwner: ownerCheck.data === true, owners };
}

// What the API puts in `details` when the trigger refuses a creation (45700).
// Read live on every attempt, so a retry after an upgrade needs no cache
// bust; a retry that beats the webhook gets the same details again.
export async function buildProjectLimitDetails(db: Client, workspaceId: string): Promise<PlanLimitDetails> {
  const [effective, used, ownership] = await Promise.all([
    loadEffectiveProjectPlan(db, workspaceId),
    countProjects(db, workspaceId),
    loadOwnership(db, workspaceId),
  ]);
  const plan = effective?.plan ?? 'community';
  return {
    reason: 'project_limit_reached',
    resource: 'projects',
    plan,
    limit: effective ? effective.limit : PLAN_TIERS.community.projectLimit,
    used,
    is_owner: ownership.isOwner,
    owners: ownership.owners,
  };
}

export function ownerLabel(owners: PlanLimitOwner[]): string | null {
  if (owners.length === 0) {
    return null;
  }
  return owners.map(o => o.email).join(', ');
}

// Role-aware API message. Owners are pointed at the upgrade; everyone else is
// told who to ask and is never shown a checkout.
export function projectLimitMessage(details: Pick<PlanLimitDetails, 'is_owner' | 'owners'>): string {
  const base = 'This workspace has reached its plan\'s project limit.';
  if (details.is_owner) {
    return `${base} Upgrade to create more projects.`;
  }
  const label = ownerLabel(details.owners);
  return label
    ? `${base} Ask the workspace owner (${label}) to upgrade.`
    : `${base} Ask the workspace owner to upgrade.`;
}

export interface PlanLimitView {
  resource: PlanLimitResource
  state: MeterState
  used: number
  limit: number | null
  planName: string
}

// The state the banner renders. Approaching = 80% or more; at the cap the
// banner turns into a non-blocking "limit reached" notice. Unlimited plans
// never warn.
export function planLimitView(resource: PlanLimitResource, plan: WorkspacePlan, used: number, limit: number | null): PlanLimitView {
  return { resource, state: meterState(used, limit), used, limit, planName: PLAN_TIERS[plan].displayName };
}

export function usageLine(resource: PlanLimitResource, used: number, limit: number | null): string {
  const { plural } = RESOURCE_NOUN[resource];
  return limit === null ? `${used} ${plural} used` : `${used} of ${limit} ${plural} used`;
}

export function resourceNoun(resource: PlanLimitResource): { plural: string, singular: string } {
  return RESOURCE_NOUN[resource];
}

// Narrows an untyped error `details` value (client side) to PlanLimitDetails.
export function parsePlanLimitDetails(value: unknown): PlanLimitDetails | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (v.reason !== 'project_limit_reached' || v.resource !== 'projects' || !isPlan(v.plan)) {
    return null;
  }
  if (typeof v.used !== 'number' || (v.limit !== null && typeof v.limit !== 'number')) {
    return null;
  }
  const owners = Array.isArray(v.owners)
    ? v.owners.filter((o): o is PlanLimitOwner => typeof o === 'object' && o !== null && typeof (o as PlanLimitOwner).email === 'string')
    : [];
  return {
    reason: 'project_limit_reached',
    resource: 'projects',
    plan: v.plan,
    limit: v.limit,
    used: v.used,
    is_owner: v.is_owner === true,
    owners,
  };
}
