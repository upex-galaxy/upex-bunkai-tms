import type { QueryCall, QueryResult, RpcHandler } from '@lib/billing/test-doubles';
import { ApiError } from '@lib/api/error-envelope';
import { buildProjectLimitDetails, parsePlanLimitDetails, planLimitView, projectLimitMessage, usageLine } from '@lib/billing/plan-limit';
import { fakeSupabase, WORKSPACE_ID } from '@lib/billing/test-doubles';
import { describe, expect, test } from 'bun:test';
import { projectLimitReached } from '../../app/api/v1/workspaces/[id]/projects/response';

// BK-232 — plan-limit copy, thresholds and the details the API sends with a
// refused project creation. Database behaviour (the trigger itself) is covered
// by the live isolation suites; here the Supabase client is a recording double.

const OWNER = { user_id: 'u-owner', email: 'mateo@acme.test', role: 'owner' };
const MEMBER = { user_id: 'u-member', email: 'elena@acme.test', role: 'member' };

interface World {
  plan: string
  graceEndsAt?: string | null
  projects: number
  isOwner: boolean
  roster: Array<{ user_id: string, email: string, role: string }>
}

function db(world: World) {
  const resolver = (call: QueryCall): QueryResult | undefined => {
    if (call.table === 'workspaces') { return { data: { plan: world.plan }, error: null }; }
    if (call.table === 'workspace_grace_periods') {
      return { data: world.graceEndsAt ? { ends_at: world.graceEndsAt } : null, error: null };
    }
    if (call.table === 'projects') {
      return { data: null, error: null, count: world.projects } as QueryResult;
    }
    return undefined;
  };
  const rpcs: Record<string, RpcHandler> = {
    bunkai_effective_plan: args => ({
      // The SQL function: a Cloud workspace past its grace end reads as community.
      data: args.p_plan === 'cloud' && typeof args.p_grace_ends_at === 'string' && Date.parse(args.p_grace_ends_at) <= Date.now() ? 'community' : args.p_plan,
      error: null,
    }),
    bunkai_is_workspace_owner: () => ({ data: world.isOwner, error: null }),
    bunkai_chat_roster: () => ({ data: world.roster, error: null }),
  };
  return fakeSupabase(resolver, rpcs);
}

describe('planLimitView thresholds', () => {
  test('Cloud: 38 and 39 of 50 are silent (78%), 40 of 50 is the first warning', () => {
    expect(planLimitView('projects', 'cloud', 38, 50).state).toBe('normal');
    expect(planLimitView('projects', 'cloud', 39, 50).state).toBe('normal');
    expect(planLimitView('projects', 'cloud', 40, 50).state).toBe('warning');
    expect(planLimitView('projects', 'cloud', 49, 50).state).toBe('warning');
    expect(planLimitView('projects', 'cloud', 50, 50).state).toBe('limit-reached');
  });

  test('Community: 2 of 3 is silent (67%), 3 of 3 is the limit; the 80% band is unreachable for projects', () => {
    expect(planLimitView('projects', 'community', 2, 3).state).toBe('normal');
    expect(planLimitView('projects', 'community', 3, 3).state).toBe('limit-reached');
  });

  test('Enterprise is unlimited and never warns', () => {
    expect(planLimitView('projects', 'enterprise', 500, null).state).toBe('normal');
  });

  test('carries the display name, never the storage literal', () => {
    expect(planLimitView('projects', 'community', 3, 3).planName).toBe('Community');
  });
});

describe('projectLimitMessage', () => {
  test('owner is pointed at the upgrade', () => {
    expect(projectLimitMessage({ is_owner: true, owners: [] })).toContain('Upgrade to create more projects.');
  });

  test('a non-owner is told who to ask, with no upgrade wording', () => {
    const message = projectLimitMessage({ is_owner: false, owners: [{ user_id: 'u', email: 'mateo@acme.test' }] });
    expect(message).toContain('Ask the workspace owner (mateo@acme.test) to upgrade.');
    expect(message).not.toContain('Upgrade to create');
  });

  test('several owners are all named; none falls back to the generic ask', () => {
    expect(projectLimitMessage({ is_owner: false, owners: [{ user_id: 'a', email: 'a@x.test' }, { user_id: 'b', email: 'b@x.test' }] })).toContain('a@x.test, b@x.test');
    expect(projectLimitMessage({ is_owner: false, owners: [] })).toContain('Ask the workspace owner to upgrade.');
  });
});

describe('usageLine', () => {
  test('"3 of 3 projects used"', () => {
    expect(usageLine('projects', 3, 3)).toBe('3 of 3 projects used');
  });
});

describe('buildProjectLimitDetails', () => {
  test('member at the Community cap: 3 of 3, owner named, not owner', async () => {
    const { client } = db({ plan: 'community', projects: 3, isOwner: false, roster: [OWNER, MEMBER] });
    expect(await buildProjectLimitDetails(client, WORKSPACE_ID)).toEqual({
      reason: 'project_limit_reached',
      resource: 'projects',
      plan: 'community',
      limit: 3,
      used: 3,
      is_owner: false,
      owners: [{ user_id: 'u-owner', email: 'mateo@acme.test' }],
    });
  });

  test('owner at the cap is flagged so the UI can offer the upgrade', async () => {
    const { client } = db({ plan: 'community', projects: 3, isOwner: true, roster: [OWNER] });
    expect((await buildProjectLimitDetails(client, WORKSPACE_ID)).is_owner).toBe(true);
  });

  test('grace ended on a Cloud workspace reports Community numbers (ADR-0021), not Cloud', async () => {
    const { client } = db({ plan: 'cloud', graceEndsAt: '2020-01-01T00:00:00.000Z', projects: 10, isOwner: true, roster: [OWNER] });
    const details = await buildProjectLimitDetails(client, WORKSPACE_ID);
    expect(details.plan).toBe('community');
    expect(details.limit).toBe(3);
    expect(details.used).toBe(10);
  });

  test('an upgrade is visible on the very next attempt: the plan is read live, nothing is cached', async () => {
    const world: World = { plan: 'community', projects: 3, isOwner: false, roster: [OWNER] };
    const { client } = db(world);
    expect((await buildProjectLimitDetails(client, WORKSPACE_ID)).limit).toBe(3);
    world.plan = 'cloud';
    expect((await buildProjectLimitDetails(client, WORKSPACE_ID)).limit).toBe(50);
  });

  test('an owner without an email row is not listed; the roster is the only identity source', async () => {
    const { client } = db({ plan: 'community', projects: 3, isOwner: false, roster: [{ user_id: 'u-x', email: '', role: 'owner' }] });
    expect((await buildProjectLimitDetails(client, WORKSPACE_ID)).owners).toEqual([]);
  });
});

describe('projectLimitReached (the 422 the route sends)', () => {
  test('keeps the contract: 422 project_limit_reached, enriched details, role-aware message', async () => {
    const { client } = db({ plan: 'community', projects: 3, isOwner: false, roster: [OWNER] });
    const err = await projectLimitReached(client, WORKSPACE_ID);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('project_limit_reached');
    expect(err.message).toContain('mateo@acme.test');
    expect((err.details as { used: number }).used).toBe(3);
  });

  test('a failure while reading the context still yields the plain 422, never a 500', async () => {
    const broken = {
      from: () => { throw new Error('boom'); },
      rpc: async () => { throw new Error('boom'); },
    } as unknown as Parameters<typeof projectLimitReached>[0];
    const err = await projectLimitReached(broken, WORKSPACE_ID);
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'project_limit_reached' });
  });
});

describe('parsePlanLimitDetails', () => {
  test('accepts what the API sends and rejects a bare or foreign details object', () => {
    const sent = { reason: 'project_limit_reached', resource: 'projects', plan: 'cloud', limit: 50, used: 50, is_owner: true, owners: [{ user_id: 'u', email: 'a@x.test' }] };
    expect(parsePlanLimitDetails(sent)?.limit).toBe(50);
    expect(parsePlanLimitDetails({ reason: 'project_limit_reached' })).toBeNull();
    expect(parsePlanLimitDetails({ reason: 'name_too_short' })).toBeNull();
    expect(parsePlanLimitDetails(undefined)).toBeNull();
  });
});
